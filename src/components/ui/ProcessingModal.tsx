import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ProcessingStep {
  label: string;
  status: 'waiting' | 'loading' | 'done' | 'error';
  detail?: string;
}

interface ProcessingModalProps {
  open: boolean;
  title: string;
  steps: ProcessingStep[];
  progress?: number;
  result?: { success: boolean; message: string } | null;
  onClose?: () => void;
  timeoutMs?: number;
  onTimeout?: () => void;
}

export default function ProcessingModal({ open, title, steps, progress, result, onClose, timeoutMs = 15000, onTimeout }: ProcessingModalProps) {
  const lastProgressRef = useRef<number>(0);
  const lastChangeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !!result || timeoutMs <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    if (progress !== lastProgressRef.current) {
      lastProgressRef.current = progress ?? 0;
      lastChangeRef.current = Date.now();
    }
    timerRef.current = setInterval(() => {
      if (Date.now() - lastChangeRef.current > timeoutMs) {
        if (timerRef.current) clearInterval(timerRef.current);
        onTimeout?.();
      }
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [open, progress, result, timeoutMs, onTimeout]);

  useEffect(() => {
    if (open) {
      lastProgressRef.current = 0;
      lastChangeRef.current = Date.now();
    }
  }, [open]);

  if (!open) return null;

  const isFinished = !!result;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={isFinished ? onClose : undefined} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden m-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/80 shadow-sm flex items-center justify-center">
            <Lock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
            <p className="text-[11px] text-gray-500">{isFinished ? '完了' : '処理中...'}</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {!isFinished && (
            <div className="flex justify-center py-4">
              <div className="relative w-16 h-16">
                {/* C字型アーク回転 */}
                <div className="absolute inset-0 drive-ring-flow" style={{
                  background: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #f97316, transparent)',
                  borderRadius: '50%',
                  mask: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)',
                  WebkitMask: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)',
                }} />
                {/* 中央アイコン */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-orange-400 drive-icon-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {typeof progress === 'number' && !isFinished && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">進捗</span>
                <span className="text-sm font-bold text-orange-600">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress))}%`,
                    background: progress >= 100
                      ? 'linear-gradient(90deg, #22c55e, #22c55e)'
                      : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-2.5 mt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {step.status === 'waiting' && <span className="w-2 h-2 rounded-full bg-gray-200" />}
                  {step.status === 'loading' && <span className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-orange-500 drive-modal-spin" />}
                  {step.status === 'done' && <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />}
                  {step.status === 'error' && <AlertCircle className="w-4.5 h-4.5 text-red-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${
                    step.status === 'loading' ? 'text-gray-800 font-medium' :
                    step.status === 'done' ? 'text-green-700' :
                    step.status === 'error' ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && <span className="text-[11px] text-gray-400 ml-2">{step.detail}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Result */}
          {result && (
            <div className={`mt-4 p-3.5 rounded-xl text-sm ${
              result.success
                ? 'bg-green-50 text-green-800 border border-green-100'
                : 'bg-red-50 text-red-800 border border-red-100'
            }`}>
              <div className="flex items-start gap-2.5">
                {result.success
                  ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-green-500" />
                  : <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-500" />
                }
                <p className="font-medium">{result.message}</p>
              </div>
            </div>
          )}
        </div>

        {isFinished && (
          <div className="px-5 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
