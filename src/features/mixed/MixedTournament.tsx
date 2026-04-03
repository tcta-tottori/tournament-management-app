import { useMixedStore } from './mixedStore';
import type { MixedPhase } from './types';
import { Upload, Trophy, BarChart3, Swords, RotateCcw, ClipboardList } from 'lucide-react';
import MixedImportView from './MixedImportView';
import MixedLeagueView from './MixedLeagueView';
import MixedStandingsView from './MixedStandingsView';
import MixedBracketView from './MixedBracketView';
import MixedWaitingList from './MixedWaitingList';

const PHASES: { id: MixedPhase; label: string; icon: React.ElementType }[] = [
  { id: 'import', label: 'インポート', icon: Upload },
  { id: 'league', label: '予選リーグ', icon: Swords },
  { id: 'standings', label: '順位表', icon: BarChart3 },
  { id: 'tournament', label: '決勝トーナメント', icon: Trophy },
  { id: 'waiting', label: '控えリスト', icon: ClipboardList },
];

export default function MixedTournament() {
  const { currentPhase, setCurrentPhase, isImported, tournamentInfo, resetAll, leagueMatches } = useMixedStore();

  // 進捗計算
  const totalMatches = leagueMatches.length;
  const finishedMatches = leagueMatches.filter(m => m.status === 'finished').length;
  const progressPct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

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
