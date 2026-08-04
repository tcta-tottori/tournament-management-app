import { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Timer, Trophy } from 'lucide-react';

export interface BracketTabItem {
  /** タブの識別子（順位カテゴリなど） */
  id: string;
  /** 見出しに出す名前 */
  label: string;
  /** 完了した試合数 */
  finished: number;
  /** 全試合数（BYEを除く） */
  total: number;
}

interface Props {
  tabs: BracketTabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 見出しの下に出す小さな説明（ゲームルールなど） */
  subtitle?: string;
  /** 進行中の試合数（0なら非表示） */
  playing?: number;
  /** 表示回戦の絞り込みを出すか */
  canAdjustRounds?: boolean;
  startRound?: number;
  maxStartRound?: number;
  /** 「全回戦表示」「準決勝以降」などのラベル */
  startRoundLabel?: string;
  /** null を渡すと自動（決着済みの回戦を省略）に戻す */
  onStartRoundChange?: (value: number | null) => void;
  /** 右側に置く追加のボタンなど */
  right?: React.ReactNode;
  /** 親のパディングを打ち消して、画面の横幅いっぱいに表示する */
  fullBleedClass?: string;
}

/**
 * 決勝トーナメント表の上部ヘッダー（シングルス大会の CourtBracketPage と同じ形式）。
 * - 左右の矢印／スワイプ／下のドットでクラス（順位カテゴリ）を切り替える
 * - 進捗バーと、表示回戦の絞り込み（回戦が進むと表示を縮小）を備える
 */
export default function BracketTopBar({
  tabs,
  selectedId,
  onSelect,
  subtitle,
  playing = 0,
  canAdjustRounds = false,
  startRound = 0,
  maxStartRound = 0,
  startRoundLabel = '全回戦表示',
  onStartRoundChange,
  right,
  fullBleedClass = '',
}: Props) {
  const idx = Math.max(0, tabs.findIndex(t => t.id === selectedId));
  const current = tabs[idx];

  const gotoPrev = useCallback(() => {
    if (tabs.length === 0) return;
    onSelect(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }, [tabs, idx, onSelect]);
  const gotoNext = useCallback(() => {
    if (tabs.length === 0) return;
    onSelect(tabs[(idx + 1) % tabs.length].id);
  }, [tabs, idx, onSelect]);

  // スワイプでクラス切替
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || tabs.length <= 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) gotoNext(); else gotoPrev();
  }, [tabs.length, gotoNext, gotoPrev]);

  const pct = current && current.total > 0 ? Math.round((current.finished / current.total) * 100) : 0;

  return (
    <div
      className={`sticky top-0 z-30 shrink-0 bg-white border-b px-3 py-2 shadow-sm ${fullBleedClass}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center gap-2">
        <button onClick={gotoPrev} className="p-1 rounded hover:bg-gray-100" aria-label="前のクラス">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-base font-bold text-gray-800 truncate">
            <Trophy className="w-4 h-4 inline-block mr-1 text-amber-500" />
            {current?.label || 'トーナメント'}
          </h2>
          {subtitle && <p className="text-[10px] text-gray-500 truncate mt-0.5">{subtitle}</p>}
        </div>

        <button onClick={gotoNext} className="p-1 rounded hover:bg-gray-100" aria-label="次のクラス">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 進捗バー */}
      <div className="flex items-center gap-3 mt-1.5 text-[10px]">
        <div className="flex-1 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-gray-500 whitespace-nowrap">
            {current?.finished ?? 0}/{current?.total ?? 0} ({pct}%)
          </span>
        </div>
        {playing > 0 && (
          <span className="flex items-center gap-0.5 text-green-600 font-bold">
            <Timer className="w-3 h-3" />
            {playing}試合中
          </span>
        )}
      </div>

      {/* 表示回戦の絞り込み（回戦が進むと表示を縮小）と、右側のボタン群。
          ボタンが増えても横にはみ出さないよう、狭い画面では折り返す。 */}
      {(canAdjustRounds || right) && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-1.5">
          {canAdjustRounds && onStartRoundChange ? (
            <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1 py-0.5">
              <button
                onClick={() => onStartRoundChange(Math.max(0, startRound - 1))}
                disabled={startRound === 0}
                className="p-0.5 rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                title="前の回戦を表示する"
                aria-label="前の回戦を表示する"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onStartRoundChange(null)}
                className="flex items-center gap-1 px-1.5 text-[10px] font-bold text-gray-600 whitespace-nowrap"
                title="タップで自動（決着済みの回戦を省略）に戻す"
              >
                {startRound === 0
                  ? <Eye className="w-3 h-3 text-gray-400" />
                  : <EyeOff className="w-3 h-3 text-primary-500" />}
                {startRoundLabel}
              </button>
              <button
                onClick={() => onStartRoundChange(Math.min(maxStartRound, startRound + 1))}
                disabled={startRound >= maxStartRound}
                className="p-0.5 rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                title="終わった回戦を隠す"
                aria-label="終わった回戦を隠す"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : <span />}
          {right}
        </div>
      )}

      {/* クラスタブ（小さいドット） */}
      {tabs.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-1.5">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === idx ? 'bg-primary-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              title={t.label}
              aria-label={t.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
