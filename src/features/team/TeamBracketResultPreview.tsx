import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X } from 'lucide-react';
import { generateTeamBracketResultDataUrl } from './exportTeamBracketResultJpeg';
import type { TeamPlacementBracket, TeamEntry, PlacementCategory } from './types';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

interface Props {
  bracket: TeamPlacementBracket;
  allTeams: TeamEntry[];
  tournamentName: string;
}

export function TeamBracketResultPreview({ bracket, allTeams, tournamentName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // モーダルを開くたびに最新コードで再生成する
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    generateTeamBracketResultDataUrl(bracket, allTeams, tournamentName)
      .then(url => {
        if (isMounted) {
          setDataUrl(url);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, bracket, allTeams, tournamentName]);

  const label = CATEGORY_LABELS[bracket.category];

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${label}_結果_団体戦.jpg`;
    a.click();
  };

  return (
    <>
      {/* プレビュー呼び出しボタン */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:shadow hover:bg-sky-100 hover:border-sky-300 transition-all active:scale-95 whitespace-nowrap"
      >
        <ImageIcon size={14} className="text-sky-600" />
        結果画像
      </button>

      {/* モーダル表示 */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-sky-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-6xl max-h-[92vh] border border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sky-900 text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-sm">
                  <ImageIcon size={13} />
                </span>
                {label} 結果プレビュー
              </h3>
              <div className="flex items-center gap-2">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg shadow hover:from-sky-600 hover:to-sky-700 transition-colors active:scale-95"
                    title="ダウンロード"
                    aria-label="ダウンロード"
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

            {/* プレビュー画像本体 */}
            <div className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center">
              {isLoading && (
                <div className="flex flex-col items-center gap-2 text-sky-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${label}結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-sky-100 bg-white rounded"
                  style={{ maxHeight: '100%' }}
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
