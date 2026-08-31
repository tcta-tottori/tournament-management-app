import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X } from 'lucide-react';
import { generateTeamBracketResultDataUrl } from './exportTeamBracketResultJpeg';
import { resolveBracketLabel } from './teamLogic';
import { useTeamStore } from './teamStore';
import { buildResultFileName } from './resultFileName';
import type { TeamPlacementBracket, TeamEntry, PlacementCategory } from './types';

interface Props {
  bracket: TeamPlacementBracket;
  allTeams: TeamEntry[];
  tournamentName: string;
  customLabels?: Partial<Record<PlacementCategory, string>>;
}

export function TeamBracketResultPreview({ bracket, allTeams, tournamentName, customLabels }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const matchFormat = useTeamStore(s => s.tournamentInfo?.matchFormat);
  const venue = useTeamStore(s => s.tournamentInfo?.venue);

  // モーダルを開くたびに最新コードで再生成する
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    generateTeamBracketResultDataUrl(bracket, allTeams, tournamentName, customLabels, matchFormat, venue)
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
  }, [isOpen, bracket, allTeams, tournamentName, customLabels, matchFormat, venue]);

  const label = resolveBracketLabel(bracket.category, customLabels);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = buildResultFileName(tournamentName, `${label}_結果_団体戦`);
    a.click();
  };

  return (
    <>
      {/* プレビュー呼び出しボタン */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-700 bg-gray-50 border border-gray-200 shadow-sm hover:shadow hover:bg-gray-100 hover:border-gray-300 transition-all active:scale-95 whitespace-nowrap"
      >
        <ImageIcon size={14} className="text-gray-600" />
        結果画像
      </button>

      {/* モーダル表示 */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-gray-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-6xl max-h-[92vh] border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
                  <ImageIcon size={13} />
                </span>
                {label} 結果プレビュー
              </h3>
              <div className="flex items-center gap-2">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg shadow hover:from-primary-600 hover:to-primary-700 transition-colors active:scale-95"
                    title="ダウンロード"
                    aria-label="ダウンロード"
                  >
                    <Download size={15} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-9 h-9 text-primary-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${label}結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-gray-100 bg-white rounded"
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
