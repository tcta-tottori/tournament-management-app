import { useState, useRef, useEffect } from 'react';

/** ゲーム取得率セル — タップで計算式詳細表示 */
export function GameRatioCell({ gamesWon, gamesLost, className = '' }: {
  gamesWon: number;
  gamesLost: number;
  className?: string;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!showDetail) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDetail(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showDetail]);

  const ratio = gamesLost === 0
    ? (gamesWon > 0 ? Infinity : 0)
    : gamesWon / gamesLost;
  const displayText = gamesLost === 0
    ? (gamesWon > 0 ? '∞' : '-')
    : ratio.toFixed(3);

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setShowDetail(!showDetail); }}
        className="font-mono text-inherit hover:text-blue-600 hover:underline underline-offset-2 transition-colors cursor-pointer"
      >
        {displayText}
      </button>
      {showDetail && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* 吹き出し矢印 */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45" />
          <div className="text-[10px] text-gray-400 font-medium mb-2 text-center">ゲーム取得率</div>
          {/* 計算式ビジュアル */}
          <div className="flex items-center justify-center gap-1 text-lg font-bold">
            <span className="text-emerald-600">{gamesWon}</span>
            <span className="text-gray-300">/</span>
            <span className="text-red-500">{gamesLost}</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-gray-400">
            <span className="flex items-center gap-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              取得
            </span>
            <span className="flex items-center gap-0.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              失
            </span>
          </div>
          {/* 結果 */}
          <div className="mt-2 pt-2 border-t border-gray-100 text-center">
            <span className="text-xs text-gray-500">= </span>
            <span className="text-base font-bold text-blue-600 font-mono">
              {gamesLost === 0 ? (gamesWon > 0 ? '∞' : '0.000') : ratio.toFixed(3)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
