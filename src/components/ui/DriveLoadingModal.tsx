import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

/** Google Drive ブランドアイコン */
function GoogleDriveIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L3.45 44.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
      <path d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.85 53z" fill="#2684FC"/>
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00"/>
    </svg>
  );
}

export interface LoadingStep {
  label: string;
  status: 'waiting' | 'loading' | 'done' | 'error';
  detail?: string;
}

interface DriveLoadingModalProps {
  open: boolean;
  title: string;
  steps: LoadingStep[];
  progress?: number; // 0-100 の進捗率
  result?: { success: boolean; message: string; details?: string[] } | null;
  onClose?: () => void;
  /** タイムアウト（ms）。進捗が一定時間変化しない場合エラーを出して閉じる。0で無効。デフォルト8000ms */
  timeoutMs?: number;
  /** タイムアウト時に呼ばれるコールバック */
  onTimeout?: () => void;
}

export default function DriveLoadingModal({ open, title, steps, progress, result, onClose, timeoutMs = 8000, onTimeout }: DriveLoadingModalProps) {
  // 8秒タイムアウト: progressが変化しないまま8秒経過 → onTimeout → 自動閉じ
  const lastProgressRef = useRef<number>(0);
  const lastChangeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !!result || timeoutMs <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    // 進捗が変化したら時刻リセット
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

  // open時にタイムスタンプリセット
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={isFinished ? onClose : undefined} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden m-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#e8f0fe] to-[#d2e3fc] px-5 py-4 flex items-center gap-3">
          <div className="relative">
            <GoogleDriveIcon className="w-7 h-7" />
            {!isFinished && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full drive-modal-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
            <p className="text-[11px] text-gray-500">Google ドライブ</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {!isFinished && (
            /* ローディングアニメーション — Driveアイコン中央 + 色が流れる一段リング */
            <div className="flex justify-center py-4">
              <div className="relative w-20 h-20">
                {/* 一段リング: conic-gradientで色が流れる */}
                <div className="absolute inset-0 drive-ring-flow rounded-full" style={{
                  background: 'conic-gradient(from 0deg, #4285F4, #34A853, #FBBC04, #EA4335, #4285F4)',
                  mask: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)',
                  WebkitMask: 'radial-gradient(circle, transparent 62%, black 64%, black 72%, transparent 74%)',
                }} />
                {/* 中央 Google Drive アイコン */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="drive-icon-pulse">
                    <GoogleDriveIcon className="w-8 h-8" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 進捗バー */}
          {typeof progress === 'number' && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">進捗</span>
                <span className="text-sm font-bold text-[#1a73e8]">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress))}%`,
                    background: progress >= 100
                      ? 'linear-gradient(90deg, #34a853, #34a853)'
                      : 'linear-gradient(90deg, #1a73e8, #8e24aa)',
                  }}
                />
              </div>
            </div>
          )}

          {/* ステップ表示 */}
          <div className="space-y-2.5 mt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {/* アイコン */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {step.status === 'waiting' && (
                    <span className="w-2 h-2 rounded-full bg-gray-200" />
                  )}
                  {step.status === 'loading' && (
                    <span className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-[#1a73e8] drive-modal-spin" />
                  )}
                  {step.status === 'done' && (
                    <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                  )}
                  {step.status === 'error' && (
                    <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                  )}
                </div>
                {/* テキスト */}
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${
                    step.status === 'loading' ? 'text-gray-800 font-medium' :
                    step.status === 'done' ? 'text-green-700' :
                    step.status === 'error' ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="text-[11px] text-gray-400 ml-2">{step.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 結果メッセージ */}
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
                <div>
                  <p className="font-medium">{result.message}</p>
                  {result.details && result.details.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                      {result.details.map((d, idx) => <li key={idx}>{d}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 閉じるボタン — 完了時のみ */}
        {isFinished && (
          <div className="px-5 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-bold text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] transition-colors"
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
