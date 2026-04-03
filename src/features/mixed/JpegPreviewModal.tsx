import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface JpegPreviewModalProps {
  canvas: HTMLCanvasElement | null;
  title: string;
  onDownload: () => void;
  onClose: () => void;
}

/**
 * JPEG画像のプレビューモーダル
 * Canvasからdata URLを生成して表示し、OKならダウンロードを実行
 */
export default function JpegPreviewModal({ canvas, title, onDownload, onClose }: JpegPreviewModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (canvas) {
      setDataUrl(canvas.toDataURL('image/jpeg', 0.95));
    }
  }, [canvas]);

  if (!dataUrl) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[200] flex flex-col" onClick={onClose}>
      <div className="flex-1 flex flex-col max-h-screen" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-sm">{title} - プレビュー</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="縮小"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="拡大"
            >
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <button
              onClick={() => { onDownload(); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Download size={14} />
              ダウンロード
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* プレビュー画像 */}
        <div
          ref={imgRef}
          className="flex-1 overflow-auto bg-gray-100 p-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="inline-block min-w-full" style={{ textAlign: 'center' }}>
            <img
              src={dataUrl}
              alt={title}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                maxWidth: 'none',
              }}
              className="shadow-lg border border-gray-300"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
