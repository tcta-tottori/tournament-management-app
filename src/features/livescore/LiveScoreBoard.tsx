// =============================================
// ライブスコア — 放送風スコアボード
//
// テレビ中継のスコアテロップと同じ構成:
//   [所属チップ] 選手名 (シード)  ●サーブ  セット/ゲーム  [ポイント]
// 運営のスコア入力画面と観戦ページの両方で同じ見た目を使う。
// =============================================

import type { LiveScore } from '../../db/database';
import { currentGames, isSuperTiebreakSet, pointLabel, wonSets } from './liveScoreEngine';

type BoardSize = 'sm' | 'md' | 'lg';

const SIZE: Record<BoardSize, {
  row: string; name: string; chip: string; score: string; point: string; pointBox: string; label: string;
}> = {
  sm: {
    row: 'h-9', name: 'text-sm', chip: 'w-7 h-4 text-[8px]', score: 'w-7 text-base',
    point: 'text-base', pointBox: 'w-10', label: 'text-[9px] px-2',
  },
  md: {
    row: 'h-12', name: 'text-lg sm:text-xl', chip: 'w-9 h-5 text-[9px]', score: 'w-9 text-xl',
    point: 'text-2xl', pointBox: 'w-14', label: 'text-[10px] px-2.5',
  },
  lg: {
    row: 'h-16', name: 'text-2xl sm:text-3xl', chip: 'w-12 h-7 text-[11px]', score: 'w-12 text-3xl',
    point: 'text-4xl', pointBox: 'w-20', label: 'text-xs px-3',
  },
};

/** 所属名を2〜3文字に縮めてチップに表示する（中継の国旗の位置） */
function shortAffiliation(name: string): string {
  const cleaned = (name || '').replace(/[\s\u3000]/g, '');
  if (!cleaned) return '—';
  return cleaned.slice(0, 3);
}

interface LiveScoreBoardProps {
  live: LiveScore;
  size?: BoardSize;
  /** 見出しタブ（既定: 進行中=LIVE / 終了=FINAL） */
  label?: string;
  /** コート名・種目名の行を表示するか */
  showMeta?: boolean;
  className?: string;
}

export default function LiveScoreBoard({
  live,
  size = 'md',
  label,
  showMeta = true,
  className = '',
}: LiveScoreBoardProps) {
  const sz = SIZE[size];
  const finished = live.status === 'finished';
  const tabLabel = label ?? (finished ? 'FINAL' : 'LIVE');

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
    name: string;
    affiliation: string;
    seed?: number;
    serving: boolean;
    isWinner: boolean;
  }> = [
    {
      player: 1,
      name: live.player1Name || '(未定)',
      affiliation: live.player1Affiliation,
      seed: live.player1Seed,
      serving: !finished && live.server === 1,
      isWinner: finished && live.winner === 1,
    },
    {
      player: 2,
      name: live.player2Name || '(未定)',
      affiliation: live.player2Affiliation,
      seed: live.player2Seed,
      serving: !finished && live.server === 2,
      isWinner: finished && live.winner === 2,
    },
  ];

  return (
    <div className={className}>
      {/* 見出しタブ */}
      <div className="flex items-end gap-2">
        <span
          className={`inline-block rounded-t-md font-black tracking-[0.18em] text-white py-0.5 ${sz.label} ${
            finished ? 'bg-[#0a2050]' : 'bg-[#c0392b]'
          }`}
        >
          {tabLabel}
        </span>
        {showMeta && (
          <span className="pb-0.5 text-[10px] sm:text-xs font-bold text-gray-500 truncate">
            {[live.courtName, live.eventName, live.roundName].filter(Boolean).join(' ・ ')}
          </span>
        )}
      </div>

      {/* スコアパネル */}
      <div className="rounded-md rounded-tl-none overflow-hidden shadow-xl bg-gradient-to-r from-[#153f96] to-[#0a2461] ring-1 ring-black/20">
        {rows.map((row, idx) => {
          const isTb = live.isTiebreak || live.isSuperTiebreak;
          return (
            <div
              key={row.player}
              data-testid={`lsb-row-${row.player}`}
              className={`flex items-stretch ${sz.row} ${idx === 0 ? 'border-b border-white/15' : ''}`}
            >
              {/* 所属チップ（中継の国旗の位置） */}
              <div className="flex items-center pl-2 sm:pl-3 pr-2">
                <span
                  className={`${sz.chip} flex items-center justify-center rounded-[2px] bg-white/90 text-[#0a2461] font-black leading-none overflow-hidden`}
                  title={row.affiliation}
                >
                  {shortAffiliation(row.affiliation)}
                </span>
              </div>

              {/* 選手名 + シード */}
              <div className="flex items-center min-w-0 flex-1 gap-1.5">
                <span className={`${sz.name} font-black text-white truncate leading-none`}>
                  {row.name}
                </span>
                {row.seed != null && (
                  <span className="text-[10px] sm:text-xs text-white/60 font-bold shrink-0">({row.seed})</span>
                )}
              </div>

              {/* サーブ表示（中継と同じ黄色のマーク） */}
              <div className="flex items-center justify-center w-6 shrink-0">
                {row.serving && (
                  <span className="block w-[3px] h-[45%] bg-[#e8ff4d] rotate-[20deg] rounded-sm shadow-[0_0_6px_#e8ff4d]" />
                )}
              </div>

              {/* セット / ゲーム数 */}
              {setColumns.map((col, i) => {
                const val = row.player === 1 ? col.p1 : col.p2;
                const oppVal = row.player === 1 ? col.p2 : col.p1;
                const leading = val > oppVal;
                return (
                  <div
                    key={i}
                    className={`${sz.score} flex items-center justify-center font-black shrink-0 ${
                      col.isCurrent
                        ? leading ? 'text-[#e8ff4d]' : 'text-white'
                        : leading ? 'text-[#e8ff4d]' : 'text-white/55'
                    }`}
                  >
                    {val}
                  </div>
                );
              })}

              {/* セット取得数（2セットマッチのみ・終了時） */}
              {multiSet && finished && (
                <div className={`${sz.score} flex items-center justify-center font-black text-white/70 shrink-0`}>
                  {row.player === 1 ? won.p1 : won.p2}
                </div>
              )}

              {/* 現在のポイント（白ボックス） */}
              {!finished && (
                <div
                  data-testid={`lsb-point-${row.player}`}
                  className={`${sz.pointBox} shrink-0 flex items-center justify-center font-black text-[#0a2461] ${sz.point} ${
                    isTb ? 'bg-[#e8ff4d]' : 'bg-white'
                  }`}
                >
                  {pointLabel(live, row.player)}
                </div>
              )}
              {finished && (
                <div className={`${sz.pointBox} shrink-0 flex items-center justify-center font-black bg-white text-[#0a2461] ${sz.point}`}>
                  {row.isWinner ? '✓' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* タイブレーク中の注記 */}
      {(live.isTiebreak || live.isSuperTiebreak) && !finished && (
        <p className="mt-1 text-[10px] font-bold text-[#c0392b]">
          {live.isSuperTiebreak
            ? `ファイナル ${live.config.superTiebreakTo}ポイントタイブレーク`
            : `タイブレーク（${live.config.tiebreakTo}ポイント先取・2点差）`}
        </p>
      )}
    </div>
  );
}
