import { useState, useEffect } from 'react';
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
    <div className="flex flex-col items-end">
      {/* トグルボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
          isOpen ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
        }`}
      >
        {isOpen ? <ImageIcon size={14} /> : <Download size={14} />}
        {isOpen ? 'プレビューを閉じる' : '結果DLプレビュー'}
      </button>

      {/* プレビュー領域 */}
      {isOpen && (
        <div className="mt-3 w-full bg-gray-50 border border-gray-200 p-3 rounded-xl shadow-inner relative animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">生成済みプレビュー (JPEG)</span>
            {dataUrl && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-lg shadow hover:opacity-90 transition-opacity active:scale-95"
              >
                <Download size={14} />
                ダウンロードして保存
              </button>
            )}
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center min-h-[150px]">
            {isLoading && (
              <div className="flex flex-col items-center gap-2 text-gray-400 py-8">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-xs font-medium">画像を生成中...</span>
              </div>
            )}
            {dataUrl && !isLoading && (
              <img
                src={dataUrl}
                alt={`${league.leagueId}リーグ結果`}
                className="w-full max-w-full h-auto object-contain cursor-pointer hover:opacity-95 transition-opacity"
                onClick={handleDownload}
                title="クリックしてダウンロード"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
