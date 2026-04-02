import { useState } from 'react';
import { createPortal } from 'react-dom';

interface MatchDetail {
  opponentName: string;
  won: number;
  lost: number;
  isWin: boolean;
}

/** ゲーム取得率セル — タップでペア別詳細ポップアップ表示 */
export function GameRatioCell({ gamesWon, gamesLost, className = '', teamName, matchDetails }: {
  gamesWon: number;
  gamesLost: number;
  className?: string;
  teamName?: string;
  matchDetails?: MatchDetail[];
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
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] p-5" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-sm font-bold text-gray-700">ゲーム取得率</div>
              {teamName && <div className="text-xs text-gray-400 mt-1">{teamName}</div>}
            </div>

            {/* 各対戦の詳細 */}
            {matchDetails && matchDetails.length > 0 && (
              <div className="mb-4 space-y-1.5">
                <div className="text-[10px] font-bold text-gray-500 mb-1">各対戦</div>
                {matchDetails.map((md, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${md.isWin ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className={`text-[10px] font-bold ${md.isWin ? 'text-emerald-600' : 'text-red-500'}`}>
                      {md.isWin ? '○' : '●'}
                    </span>
                    <span className="text-gray-700 flex-1 truncate">vs {md.opponentName}</span>
                    <span className="font-mono font-bold shrink-0">
                      <span className="text-emerald-600">{md.won}</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-red-500">{md.lost}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 合計＆計算式 */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{gamesWon}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />取得
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-300">/</div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-500">{gamesLost}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />失
                  </div>
                </div>
              </div>
              <div className="text-center pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">= </span>
                <span className="text-2xl font-bold text-blue-600 font-mono">
                  {gamesLost === 0 ? (gamesWon > 0 ? '∞' : '0.000') : ratio.toFixed(3)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowDetail(false)}
              className="w-full py-2.5 min-h-[44px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all"
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
