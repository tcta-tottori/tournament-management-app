import { useState } from 'react';
import { MonitorPlay, Swords, Trophy, RotateCcw } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import MixedLeagueView from './MixedLeagueView';
import MixedBracketView from './MixedBracketView';

type ScoreTab = 'league' | 'tournament';

export default function MixedScoreView() {
  const { tournamentInfo, leagueMatches, brackets, resetAll } = useMixedStore();
  const [activeTab, setActiveTab] = useState<ScoreTab>('league');

  const totalMatches = leagueMatches.length;
  const finishedMatches = leagueMatches.filter(m => m.status === 'finished').length;
  const progressPct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  const tabs: { id: ScoreTab; label: string; icon: React.ElementType }[] = [
    { id: 'league', label: '予選リーグ', icon: Swords },
    { id: 'tournament', label: '決勝トーナメント', icon: Trophy },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <MonitorPlay size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">ミックスダブルス スコア</h2>
              <p className="text-emerald-200 text-sm">{tournamentInfo?.name}</p>
            </div>
          </div>
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
              onClick={() => { if (confirm('データをすべてリセットしますか？')) resetAll(); }}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="リセット"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* サブタブ */}
      <div className="flex gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = tab.id === 'tournament' && brackets.length === 0;
          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-emerald-600 text-white shadow-md'
                  : isDisabled
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* コンテンツ */}
      {activeTab === 'league' && <MixedLeagueView />}
      {activeTab === 'tournament' && <MixedBracketView />}
    </div>
  );
}
