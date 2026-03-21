import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
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
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-5 py-4 flex items-center gap-3">
          <div className="relative">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 9.5L20 12L13.5 14.5L12 22L10.5 14.5L4 12L10.5 9.5L12 2Z"
                fill="url(#procGrad)" />
              <defs>
                <linearGradient id="procGrad" x1="4" y1="2" x2="20" y2="22">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
            {!isFinished && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full drive-modal-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
            <p className="text-[11px] text-gray-500">処理中...</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {!isFinished && (
            <div className="flex justify-center py-4">
              <div className="relative w-16 h-16">
                <svg className="absolute inset-0 w-full h-full gemini-arc-spin" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray="30 140" strokeDashoffset="0" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray="25 140" strokeDashoffset="-60" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray="20 140" strokeDashoffset="-115" />
                </svg>
                <svg className="absolute inset-0 w-full h-full gemini-arc-spin-reverse" viewBox="0 0 64 64" style={{ opacity: 0.3 }}>
                  <circle cx="32" cy="32" r="24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"
                    strokeDasharray="15 150" strokeDashoffset="-20" />
                  <circle cx="32" cy="32" r="24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"
                    strokeDasharray="12 150" strokeDashoffset="-90" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-6 h-6 gemini-sparkle-pulse" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L13.5 9.5L20 12L13.5 14.5L12 22L10.5 14.5L4 12L10.5 9.5L12 2Z"
                      fill="url(#sparkleGrad2)" />
                    <defs>
                      <linearGradient id="sparkleGrad2" x1="4" y1="2" x2="20" y2="22">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="50%" stopColor="#ef4444" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                  </svg>
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
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
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
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              result.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex items-start gap-2">
                {result.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
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
              className="w-full py-2.5 text-sm font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
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
