import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X } from 'lucide-react';
import {
  generateEventResultDataUrl,
  buildEventResultFileName,
} from '../draw/DrawResultExporter';
import type { ResultExportOptions } from '../draw/DrawResultExporter';

interface Props {
  /** 描画に必要な大会・種目・ドロー・試合データ */
  opts: ResultExportOptions;
  /** ボタンの大きさ（ドロー画面ヘッダーでは小さめに使う） */
  size?: 'sm' | 'md';
  /** ボタン文言（既定: 結果画像） */
  label?: string;
}

/**
 * 種目（クラス）の結果画像プレビュー。
 * 団体戦の TeamBracketResultPreview と同じく、
 * プレビューを確認してから JPEG として保存できる。
 */
export default function EventResultPreview({ opts, size = 'md', label = '結果画像' }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開くたびに最新データで再生成する
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let isMounted = true;
    setIsLoading(true);
    // Canvas 描画は同期的に重くなることがあるので、モーダル描画後に実行する
    // （ロゴ画像の読み込みを待つため非同期）
    const timer = setTimeout(async () => {
      try {
        const url = await generateEventResultDataUrl(opts);
        if (!isMounted) return;
        if (url) setDataUrl(url);
        else setError('結果画像を生成できませんでした。');
      } catch (err) {
        console.error(err);
        if (isMounted) setError('結果画像の生成に失敗しました。');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }, 30);
    return () => { isMounted = false; clearTimeout(timer); };
  }, [isOpen, opts]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = buildEventResultFileName(opts);
    a.click();
  };

  const btnClass = size === 'sm'
    ? 'flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:bg-sky-100 active:scale-95 transition-all whitespace-nowrap'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:shadow hover:bg-sky-100 hover:border-sky-300 transition-all active:scale-95 whitespace-nowrap';

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setIsOpen(true); }} className={btnClass}>
        <ImageIcon size={size === 'sm' ? 12 : 14} className="text-sky-600" />
        {label}
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-sky-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-6xl max-h-[92vh] border border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sky-900 text-sm flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-sm shrink-0">
                  <ImageIcon size={13} />
                </span>
                <span className="truncate">{opts.event.name} 結果プレビュー</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg shadow hover:from-sky-600 hover:to-sky-700 transition-colors active:scale-95"
                    title="JPEGで保存"
                    aria-label="JPEGで保存"
                  >
                    <Download size={15} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-9 h-9 text-sky-500 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors"
                  aria-label="閉じる"
                  title="閉じる"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center">
              {isLoading && (
                <div className="flex flex-col items-center gap-2 text-sky-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {!isLoading && error && (
                <div className="text-sm text-gray-500">{error}</div>
              )}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${opts.event.name}結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-sky-100 bg-white rounded"
                  style={{ maxHeight: '100%' }}
                />
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-sky-100 bg-sky-50/50 text-[11px] text-sky-700 flex items-center justify-between gap-2 shrink-0">
              <span className="truncate">画像を確認してから保存できます</span>
              {dataUrl && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-700 transition-colors active:scale-95 shrink-0"
                >
                  <Download size={13} />
                  JPEGで保存
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
