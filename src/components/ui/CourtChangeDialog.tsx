// =============================================================================
// コート変更ダイアログ（コート番号を選び直すための共通ポップアップ）
//
// 当日は「雨で使えなくなった」「隣のコートが空いたので移した」など、
// いったん決めたコートを直したい場面が必ず出てくる。
// 各メニューから同じ操作でコートを付け替えられるよう、共通化している。
//
// 値は「1」「2」…のコート番号（文字列）でやり取りする。
// 保存形式が "1コート" のような画面では、呼び出し側で変換する。
// =============================================================================

import { MapPin, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface CourtChangeDialogProps {
  /** 見出し */
  title?: string;
  /** 対象の説明（対戦カード名など） */
  subtitle?: string;
  /** 選べるコート数（1〜courtCount） */
  courtCount?: number;
  /** 複数コートを選べるようにする（団体戦は1対戦で複数面を使う） */
  multi?: boolean;
  /** 現在選ばれているコート番号 */
  selected: string[];
  /** 他で使用中のコート番号 → 表示する理由（例: "B戦" "使用中"） */
  busy?: Record<string, string>;
  onConfirm: (courts: string[]) => void;
  /** 割当を空にする（未割当に戻す）。省略時はボタンを出さない */
  onClear?: () => void;
  onClose: () => void;
  /** 選択状態の更新（呼び出し側で state を持つ） */
  onToggle: (court: string) => void;
}

export default function CourtChangeDialog({
  title = 'コートを変更',
  subtitle,
  courtCount = 16,
  multi = false,
  selected,
  busy = {},
  onConfirm,
  onClear,
  onClose,
  onToggle,
}: CourtChangeDialogProps) {
  const courts = Array.from({ length: courtCount }, (_, i) => String(i + 1));

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[92vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-emerald-600 text-white flex items-center justify-between">
          <h3 className="text-sm font-black flex items-center gap-2"><MapPin className="w-4 h-4" />{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {subtitle && (
            <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3 text-xs font-bold text-slate-700">{subtitle}</div>
          )}
          <p className="text-[11px] font-bold text-slate-500 mb-2">
            コート番号を選択
            {multi && <span className="font-normal text-slate-400">（複数選択できます）</span>}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {courts.map(c => {
              const isSelected = selected.includes(c);
              const busyReason = !isSelected ? busy[c] : undefined;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { if (!busyReason) onToggle(c); }}
                  disabled={!!busyReason}
                  className={`py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                    busyReason ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      : isSelected ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  {c}
                  {busyReason && <span className="block text-[7px] font-normal text-slate-300">{busyReason}</span>}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <p className="mt-3 text-center text-[11px] text-slate-500">
              選択中: <span className="font-bold text-emerald-600">
                {[...selected].sort((a, b) => parseInt(a) - parseInt(b)).join('・')}
              </span> 番コート
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm hover:bg-slate-200 transition-colors">
              キャンセル
            </button>
            <button
              onClick={() => onConfirm(selected)}
              disabled={selected.length === 0}
              className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              決定
            </button>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="w-full mt-2 py-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
            >
              コート指定を消す
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
