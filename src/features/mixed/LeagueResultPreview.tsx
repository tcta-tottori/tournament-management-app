import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2 } from 'lucide-react';
import { generateLeagueResultDataUrl } from './exportLeagueResultJpeg';
import type { MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding } from './types';

interface Props {
  league: MixedLeague;
  standings: LeagueStanding[];
  matches: LeagueMatchScore[];
  allTeams: MixedTeam[];
  tournamentName: string;
  /** 会場名（大会名の下に会場ロゴを表示する） */
  venue?: string;
}

export function LeagueResultPreview({ league, standings, matches, allTeams, tournamentName, venue }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 初回表示時またはisOpen時に生成する
  useEffect(() => {
    if (!isOpen || dataUrl) return;
    
    let isMounted = true;
    setIsLoading(true);
    
    generateLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, venue)
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
  }, [isOpen, dataUrl, league, standings, matches, allTeams, tournamentName, venue]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${league.leagueId.trim()}リーグ結果.jpg`;
    a.click();
  };

  return (
    <>
      {/* プレビュー呼び出しボタン */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-800 bg-primary-50 border border-primary-200 shadow-sm hover:shadow hover:bg-primary-100 hover:border-primary-300 transition-all active:scale-95 whitespace-nowrap shrink-0"
      >
        <ImageIcon size={14} className="text-primary-600 shrink-0" />
        結果画像
      </button>

      {/* モーダル表示 */}
      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setIsOpen(false)}>
          <div 
            className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col w-full max-w-5xl max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2 min-w-0">
                <ImageIcon size={16} className="text-gray-500 shrink-0" />
                <span className="truncate">{league.leagueId.trim()}リーグ 結果プレビュー</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs font-bold rounded-lg shadow hover:opacity-90 transition-opacity active:scale-95 whitespace-nowrap shrink-0"
                  >
                    <Download size={14} className="shrink-0" />
                    ダウンロード
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors font-medium whitespace-nowrap shrink-0"
                >
                  閉じる
                </button>
              </div>
            </div>
            
            {/* プレビュー画像本体 */}
            <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
              {isLoading && (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${league.leagueId}リーグ結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-gray-200 bg-white"
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
