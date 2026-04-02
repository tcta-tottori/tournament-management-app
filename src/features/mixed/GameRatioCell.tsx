import { useState } from 'react';
import { createPortal } from 'react-dom';

/** ゲーム取得率セル — タップでフルスクリーンポップアップ表示 */
export function GameRatioCell({ gamesWon, gamesLost, className = '' }: {
  gamesWon: number;
  gamesLost: number;
  className?: string;
}) {
  const [showDetail, setShowDetail] = useState(false);

  const ratio = gamesLost === 0
    ? (gamesWon > 0 ? Infinity : 0)
    : gamesWon / gamesLost;
  const displayText = gamesLost === 0
    ? (gamesWon > 0 ? '∞' : '-')
    : ratio.toFixed(3);

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setShowDetail(true); }}
        className={`font-mono text-inherit hover:text-blue-600 hover:underline underline-offset-2 transition-colors cursor-pointer ${className}`}
      >
        {displayText}
      </button>
      {showDetail && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[320px] max-w-[90vw] p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-sm font-bold text-gray-700 mb-4">ゲーム取得率</div>

              {/* 計算式ビジュアル */}
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="text-center">
                  <div className="text-4xl font-bold text-emerald-600">{gamesWon}</div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    取得
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-300">/</div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-red-500">{gamesLost}</div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                    失
                  </div>
                </div>
              </div>

              {/* 結果 */}
              <div className="pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-500">= </span>
                <span className="text-3xl font-bold text-blue-600 font-mono">
                  {gamesLost === 0 ? (gamesWon > 0 ? '∞' : '0.000') : ratio.toFixed(3)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowDetail(false)}
              className="w-full mt-5 py-3 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all"
            >
              閉じる
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
