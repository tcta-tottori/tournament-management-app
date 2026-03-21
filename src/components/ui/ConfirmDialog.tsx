import { createPortal } from 'react-dom';
import { AlertTriangle, Lock, Unlock } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** 危険な操作かどうか（赤系のスタイルになる） */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, danger, confirmLabel = '確定', cancelLabel = 'キャンセル', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  const Icon = danger ? AlertTriangle : Lock;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden m-auto animate-[confirmSlideUp_0.2s_ease-out]">
        {/* Header */}
        <div className={`px-5 py-4 ${danger ? 'bg-gradient-to-r from-red-50 to-orange-50' : 'bg-gradient-to-r from-amber-50 to-orange-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl shadow-sm flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-white/80'}`}>
              <Icon className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-orange-500'}`} />
            </div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex items-center gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm transition-all ${
              danger
                ? 'bg-gradient-to-r from-red-500 to-red-400 hover:from-red-600 hover:to-red-500'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
