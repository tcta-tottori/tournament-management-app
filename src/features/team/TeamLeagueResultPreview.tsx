import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X } from 'lucide-react';
import { generateTeamLeagueResultDataUrl } from './exportTeamLeagueResultJpeg';
import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding } from './types';

interface Props {
  league: TeamLeague;
  standings: TeamLeagueStanding[];
  matches: TeamLeagueMatch[];
  allTeams: TeamEntry[];
  tournamentName: string;
}

export function TeamLeagueResultPreview({ league, standings, matches, allTeams, tournamentName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // モーダルを開くたびに最新コードで再生成する（閉じたらキャッシュを破棄）
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName)
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
  }, [isOpen, league, standings, matches, allTeams, tournamentName]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${league.leagueId.trim()}リーグ結果_団体戦.jpg`;
    a.click();
  };

  return (
    <>
      {/* プレビュー呼び出しボタン (水色ベース) */}
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
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-5xl max-h-[90vh] border border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー (水色グラデ) */}
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sky-900 text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-sm">
                  <ImageIcon size={13} />
                </span>
                {league.leagueId.trim()}リーグ 予選結果プレビュー
              </h3>
              <div className="flex items-center gap-2">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white text-xs font-bold rounded-lg shadow hover:from-sky-600 hover:to-sky-700 transition-colors active:scale-95"
                  >
                    <Download size={14} />
                    ダウンロード
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-8 h-8 text-sky-500 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors"
                  aria-label="閉じる"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* プレビュー画像本体 (白背景) */}
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
                  alt={`${league.leagueId}リーグ結果`}
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
