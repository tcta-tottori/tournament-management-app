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
}

export function LeagueResultPreview({ league, standings, matches, allTeams, tournamentName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 初回表示時またはisOpen時に生成する
  useEffect(() => {
    if (!isOpen || dataUrl) return;
    
    let isMounted = true;
    setIsLoading(true);
    
    generateLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName)
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
  }, [isOpen, dataUrl, league, standings, matches, allTeams, tournamentName]);

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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 shadow-sm hover:shadow hover:bg-teal-100 hover:border-teal-300 transition-all active:scale-95 whitespace-nowrap"
      >
        <ImageIcon size={14} className="text-teal-600" />
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
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <ImageIcon size={16} className="text-gray-500" />
                {league.leagueId.trim()}リーグ 結果プレビュー表示
              </h3>
              <div className="flex items-center gap-3">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-lg shadow hover:opacity-90 transition-opacity active:scale-95"
                  >
                    <Download size={14} />
                    ダウンロード
                  </button>
                )}
                <button 
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors font-medium"
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
