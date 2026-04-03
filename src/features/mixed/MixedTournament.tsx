import { useState } from 'react';
import { useMixedStore } from './mixedStore';
import type { MixedPhase } from './types';
import { Upload, Trophy, BarChart3, Swords, RotateCcw, ClipboardList, Download, ChevronDown } from 'lucide-react';
import MixedImportView from './MixedImportView';
import MixedLeagueView from './MixedLeagueView';
import MixedStandingsView from './MixedStandingsView';
import MixedBracketView from './MixedBracketView';
import MixedWaitingList from './MixedWaitingList';
import { calculateLeagueStandings } from './mixedLogic';
import { exportLeagueResultJpeg } from './exportLeagueResultJpeg';

const PHASES: { id: MixedPhase; label: string; icon: React.ElementType }[] = [
  { id: 'import', label: 'インポート', icon: Upload },
  { id: 'league', label: '予選リーグ', icon: Swords },
  { id: 'standings', label: '順位表', icon: BarChart3 },
  { id: 'tournament', label: '決勝トーナメント', icon: Trophy },
  { id: 'waiting', label: '控えリスト', icon: ClipboardList },
];

export default function MixedTournament() {
  const { currentPhase, setCurrentPhase, isImported, tournamentInfo, resetAll, leagueMatches, leagues, allTeams, rankOverrides } = useMixedStore();
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // 進捗計算
  const totalMatches = leagueMatches.length;
  const finishedMatches = leagueMatches.filter(m => m.status === 'finished').length;
  const progressPct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  // 完了したリーグを検出
  const completedLeagues = leagues.filter(l => {
    const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
    return lm.length > 0 && lm.every(m => m.status === 'finished');
  });

  const handleDownloadLeague = (leagueId: string) => {
    const league = leagues.find(l => l.leagueId === leagueId);
    if (!league) return;
    const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
    const leagueStandings = standings.get(leagueId) || [];
    const lm = leagueMatches.filter(m => m.leagueId === leagueId);
    exportLeagueResultJpeg(league, leagueStandings, lm, allTeams, tournamentInfo?.name || '');
    setShowDownloadMenu(false);
  };

  const handleDownloadAll = () => {
    const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
    for (const l of completedLeagues) {
      const ls = standings.get(l.leagueId) || [];
      const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
      setTimeout(() => exportLeagueResultJpeg(l, ls, lm, allTeams, tournamentInfo?.name || ''), 100);
    }
    setShowDownloadMenu(false);
  };

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">
              ミックスダブルス大会運営
            </h1>
            {tournamentInfo && (
              <p className="text-emerald-200 text-sm mt-1">
                {tournamentInfo.name} | {tournamentInfo.date} | {tournamentInfo.venue}
              </p>
            )}
          </div>
          {isImported && (
            <div className="flex items-center gap-4">
              {/* 結果ダウンロード */}
              {completedLeagues.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    <Download size={14} />
                    結果DL
                    <ChevronDown size={12} />
                  </button>
                  {showDownloadMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 min-w-[200px]">
                        <div className="px-3 py-1.5 text-[10px] text-gray-400 font-medium">完了済みリーグ</div>
                        {completedLeagues.map(l => (
                          <button
                            key={l.leagueId}
                            onClick={() => handleDownloadLeague(l.leagueId)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Download size={12} className="text-gray-400" />
                            {l.leagueId.trim()}リーグ
                          </button>
                        ))}
                        {completedLeagues.length >= 2 && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={handleDownloadAll}
                              className="w-full text-left px-3 py-2 text-sm text-amber-700 font-medium hover:bg-amber-50 flex items-center gap-2"
                            >
                              <Download size={12} />
                              全リーグ一括DL
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="text-right">
                <div className="text-xs text-emerald-300">予選リーグ進捗</div>
                <div className="text-lg font-bold">{finishedMatches}/{totalMatches} ({progressPct}%)</div>
              </div>
              <div className="w-32 h-2 bg-emerald-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <button
                onClick={() => {
                  if (confirm('データをすべてリセットしますか？')) resetAll();
                }}
                className="p-2 hover:bg-emerald-600 rounded-lg transition-colors"
                title="リセット"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex">
          {PHASES.map(phase => {
            const Icon = phase.icon;
            const isActive = currentPhase === phase.id;
            const isDisabled = !isImported && phase.id !== 'import';
            return (
              <button
                key={phase.id}
                onClick={() => !isDisabled && setCurrentPhase(phase.id)}
                disabled={isDisabled}
                className={`
                  flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2
                  ${isActive
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                    : isDisabled
                      ? 'border-transparent text-gray-300 cursor-not-allowed'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <Icon size={16} />
                {phase.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="p-4">
        {currentPhase === 'import' && <MixedImportView />}
        {currentPhase === 'league' && <MixedLeagueView />}
        {currentPhase === 'standings' && <MixedStandingsView />}
        {currentPhase === 'tournament' && <MixedBracketView />}
        {currentPhase === 'waiting' && <MixedWaitingList />}
      </div>
    </div>
  );
}
