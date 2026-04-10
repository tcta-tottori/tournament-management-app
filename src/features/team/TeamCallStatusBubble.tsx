import { Volume2, X, MapPin } from 'lucide-react';
import { useTeamCallStore } from './teamCallStore';
import { PLACEMENT_CATEGORY_LABELS, formatCourtRange } from './teamLogic';

/**
 * コール中に右下に常時表示するステータスバブル。
 *
 * - main.tsx で全ルートに対してマウントされる
 * - useTeamCallStore.isActive が true の間だけ表示される
 * - 停止ボタンで音声停止＋ストアをクリア
 */
export default function TeamCallStatusBubble() {
  const { isActive, content, cancel } = useTeamCallStore();

  if (!isActive || !content) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[300] max-w-[92vw] w-[320px] pointer-events-auto"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-400 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 flex items-center gap-2 text-white">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <Volume2 className="w-4 h-4" />
          <span className="text-xs font-black tracking-wider">コール中</span>
          <button
            onClick={cancel}
            className="ml-auto p-1 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="コールを停止"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="text-[10px] font-bold text-emerald-700">
            {PLACEMENT_CATEGORY_LABELS[content.category]} {content.roundLabel}
          </div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <span className="text-slate-400 font-mono text-xs shrink-0">{content.team1Number}番</span>
            <span className="truncate">{content.team1Name}</span>
          </div>
          <div className="text-[9px] font-bold text-slate-300 pl-1">VS</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <span className="text-slate-400 font-mono text-xs shrink-0">{content.team2Number}番</span>
            <span className="truncate">{content.team2Name}</span>
          </div>
          {content.courtNames.length > 0 && (
            <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 mt-1.5">
              <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="text-[11px] font-bold text-blue-600 truncate">
                {formatCourtRange(content.courtNames)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={cancel}
          className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          コール停止
        </button>
      </div>
    </div>
  );
}
