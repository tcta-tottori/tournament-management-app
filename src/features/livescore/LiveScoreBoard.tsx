// =============================================
// ライブスコア — 放送風スコアボード
//
// テレビ中継のスコアテロップと同じ構成:
//   [男子A級シングルス／1R]                    [Aコート]
//   ▶ 5 田中 芳宏（山陰労災病院）   6 7 4 6 | 6 | [2]
//     12 米本 叶芽（青翔開智高）    4 6 6 7 | 6 | [9]
//
//   - 左上にクラス（種目）名＋ラウンド、右上にコートのバッジ
//   - サーブ側は名前の前の黄色い「▶」で示す
//   - 選手名は結果表と同じ「番号 選手名（所属）」の順で並べる
//   - 決着済みのセットは淡い緑、進行中のセットは1段明るい帯、
//     現在のポイントは白ボックス
// 運営のスコア入力画面と観戦ページの両方で同じ見た目を使う。
// =============================================

import { Play } from 'lucide-react';
import type { LiveScore } from '../../db/database';
import { currentGames, isSuperTiebreakSet, pointLabel, wonSets } from './liveScoreEngine';
import { usePlayerNumbers } from './usePlayerNumbers';
import { formatCourtLabel } from './courtLabel';

type BoardSize = 'sm' | 'md' | 'lg';

const SIZE: Record<BoardSize, {
  row: string; serveCol: string; serveIcon: string; num: string; name: string; aff: string; seed: string;
  setCol: string; setText: string; curCol: string; curText: string;
  point: string; pointBox: string; label: string;
}> = {
  sm: {
    row: 'min-h-9', serveCol: 'w-5', serveIcon: 'w-2.5 h-2.5', num: 'w-4 text-[10px]',
    name: 'text-sm', aff: 'text-[10px]', seed: 'text-[8px] px-1',
    setCol: 'w-6', setText: 'text-sm', curCol: 'w-7', curText: 'text-base',
    point: 'text-base', pointBox: 'w-9', label: 'text-[9px] px-2',
  },
  md: {
    row: 'min-h-12', serveCol: 'w-6', serveIcon: 'w-3.5 h-3.5', num: 'w-5 text-[11px]',
    name: 'text-lg sm:text-xl', aff: 'text-[11px] sm:text-xs', seed: 'text-[9px] px-1',
    setCol: 'w-8', setText: 'text-xl', curCol: 'w-10', curText: 'text-xl',
    point: 'text-2xl', pointBox: 'w-14', label: 'text-[10px] px-2.5',
  },
  lg: {
    row: 'min-h-16', serveCol: 'w-8', serveIcon: 'w-5 h-5', num: 'w-7 text-sm',
    name: 'text-2xl sm:text-3xl', aff: 'text-xs sm:text-sm', seed: 'text-[10px] px-1.5',
    setCol: 'w-10', setText: 'text-3xl', curCol: 'w-14', curText: 'text-3xl',
    point: 'text-4xl', pointBox: 'w-20', label: 'text-xs px-3',
  },
};

/** スコアボードの配色（中継テロップに合わせた緑） */
const COLOR = {
  /** パネルの地色 */
  panel: 'bg-[#125e42]',
  /** 進行中セットの帯（地色より1段明るい） */
  current: 'bg-[#1a7d57]',
  /** 決着済みセットで負けている側の数字 */
  dim: 'text-[#63b18e]',
};

/** 「1回戦」→「1R」のように中継風に短くする（準決勝・決勝はそのまま） */
function shortRound(roundName: string): string {
  const m = (roundName || '').match(/^(\d+)回戦$/);
  return m ? `${m[1]}R` : roundName;
}

interface LiveScoreBoardProps {
  live: LiveScore;
  size?: BoardSize;
  className?: string;
}

export default function LiveScoreBoard({
  live,
  size = 'md',
  className = '',
}: LiveScoreBoardProps) {
  const sz = SIZE[size];
  const finished = live.status === 'finished';

  const numbers = usePlayerNumbers(live);

  const sets = live.sets;
  const cur = currentGames(live);
  const won = wonSets(live);
  const multiSet = live.config.format === 'twoSetsSuper10';

  // 表示するセット列。1セットマッチは現在のセットのみ、
  // 2セットマッチ＋STBは完了済みセット＋進行中セットを並べる。
  const setColumns = multiSet
    ? sets.map((s, i) => ({
        p1: s.p1,
        p2: s.p2,
        isCurrent: i === sets.length - 1 && !finished,
        isSuper: isSuperTiebreakSet(live.config, i),
      }))
    : [{ p1: cur.p1, p2: cur.p2, isCurrent: !finished, isSuper: false }];

  const rows: Array<{
    player: 1 | 2;
    number?: number;
    name: string;
    affiliation: string;
    seed?: number;
    serving: boolean;
    isWinner: boolean;
  }> = [
    {
      player: 1,
      number: numbers.p1,
      name: live.player1Name || '(未定)',
      affiliation: live.player1Affiliation,
      seed: live.player1Seed,
      serving: !finished && live.server === 1,
      isWinner: finished && live.winner === 1,
    },
    {
      player: 2,
      number: numbers.p2,
      name: live.player2Name || '(未定)',
      affiliation: live.player2Affiliation,
      seed: live.player2Seed,
      serving: !finished && live.server === 2,
      isWinner: finished && live.winner === 2,
    },
  ];

  // 「9」だけで登録されたコートも「9番コート」と読める形にする
  const courtLabel = formatCourtLabel(live.courtName);

  // 「男子A級シングルス／1R」のようにクラス名とラウンドを並べる
  const classLabel = [live.eventName, shortRound(live.roundName)]
    .filter(Boolean)
    .join('／') || 'クラス未設定';

  return (
    <div className={className}>
      {/* 見出し（左上にクラス名＋ラウンド / 右上にコート） */}
      <div className="flex items-end gap-2">
        <span
          className={`inline-block min-w-0 truncate rounded-t-md font-bold text-white py-0.5 bg-[#0a2419] ${sz.label}`}
          title={classLabel}
        >
          {classLabel}
        </span>
        <span className="flex-1" />
        {courtLabel && (
          <span
            className={`inline-block shrink-0 truncate rounded-t-md font-black text-[#0f3326] py-0.5 bg-[#d4e157] ${sz.label}`}
          >
            {courtLabel}
          </span>
        )}
      </div>

      {/* スコアパネル */}
      <div className={`rounded-md rounded-tl-none overflow-hidden shadow-xl ring-1 ring-black/20 ${COLOR.panel}`}>
        {rows.map((row, idx) => (
          <div
            key={row.player}
            data-testid={`lsb-row-${row.player}`}
            className={`flex items-stretch ${sz.row} ${idx === 0 ? 'border-b border-black/20' : ''}`}
          >
            {/* サーブ表示（黄色の▶） */}
            <div className={`${sz.serveCol} shrink-0 flex items-center justify-center pl-1`}>
              {row.serving && (
                <Play className={`${sz.serveIcon} fill-[#d4e157] text-[#d4e157] drop-shadow-[0_0_4px_rgba(212,225,87,0.6)]`} />
              )}
            </div>

            {/* 番号 → 選手名 →（所属）: 結果表と同じ並び */}
            <div className="flex items-center min-w-0 flex-1 gap-1.5 pr-2 py-1">
              {row.number != null && (
                <span className={`${sz.num} shrink-0 text-right font-bold text-white/55 tabular-nums`}>
                  {row.number}
                </span>
              )}
              {row.seed != null && (
                <span className={`${sz.seed} shrink-0 rounded-full bg-[#d4e157] text-[#0f3326] font-black leading-tight`}>
                  {row.seed}
                </span>
              )}
              {/* 狭い画面では所属を名前の下に折り返す（横並びだと名前が削られるため） */}
              <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                <span className={`${sz.name} font-black text-white truncate leading-tight`}>
                  {row.name}
                </span>
                {row.affiliation && (
                  <span className={`${sz.aff} font-bold text-white/65 truncate leading-tight`}>
                    （{row.affiliation}）
                  </span>
                )}
              </span>
            </div>

            {/* セット / ゲーム数 */}
            {setColumns.map((col, i) => {
              const val = row.player === 1 ? col.p1 : col.p2;
              const oppVal = row.player === 1 ? col.p2 : col.p1;
              const leading = val > oppVal;
              return (
                <div
                  key={i}
                  className={`shrink-0 flex items-center justify-center font-black ${
                    col.isCurrent
                      ? `${sz.curCol} ${sz.curText} ${COLOR.current} text-white`
                      : `${sz.setCol} ${sz.setText} ${leading ? 'text-white' : COLOR.dim}`
                  }`}
                  title={col.isSuper ? 'ファイナルタイブレーク' : undefined}
                >
                  {val}
                </div>
              );
            })}

            {/* セット取得数（2セットマッチのみ・終了時） */}
            {multiSet && finished && (
              <div className={`${sz.curCol} ${sz.curText} ${COLOR.current} flex items-center justify-center font-black text-white shrink-0`}>
                {row.player === 1 ? won.p1 : won.p2}
              </div>
            )}

            {/* 現在のポイント（白ボックス） */}
            {!finished ? (
              <div
                data-testid={`lsb-point-${row.player}`}
                className={`${sz.pointBox} ${sz.point} shrink-0 flex items-center justify-center font-black bg-white text-[#0f3326]`}
              >
                {pointLabel(live, row.player)}
              </div>
            ) : (
              <div className={`${sz.pointBox} ${sz.point} shrink-0 flex items-center justify-center font-black bg-white text-[#0f3326]`}>
                {row.isWinner ? '✓' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
