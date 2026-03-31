import { useState } from 'react';
import { Trophy, Swords, BarChart3, RotateCcw } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import MixedLeagueView from './MixedLeagueView';
import MixedStandingsView from './MixedStandingsView';
import MixedBracketView from './MixedBracketView';

type DrawTab = 'league' | 'standings' | 'tournament';

export default function MixedDrawView() {
  const { tournamentInfo, brackets, resetAll } = useMixedStore();
  const [activeTab, setActiveTab] = useState<DrawTab>('league');

  const tabs: { id: DrawTab; label: string; icon: React.ElementType }[] = [
    { id: 'league', label: '予選リーグ', icon: Swords },
    { id: 'standings', label: '順位表', icon: BarChart3 },
    { id: 'tournament', label: '決勝トーナメント', icon: Trophy },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Trophy size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">ミックスダブルス ドロー表</h2>
              <p className="text-emerald-200 text-sm">{tournamentInfo?.name}</p>
            </div>
          </div>
          <button
            onClick={() => { if (confirm('データをすべてリセットしますか？')) resetAll(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            <RotateCcw size={14} />
            リセット
          </button>
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
      {activeTab === 'standings' && <MixedStandingsView />}
      {activeTab === 'tournament' && <MixedBracketView />}
    </div>
  );
}
