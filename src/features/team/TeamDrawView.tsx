import { useState } from 'react';
import { LayoutGrid, Trophy } from 'lucide-react';
import TeamLeagueView from './TeamLeagueView';
import TeamStandingsView from './TeamStandingsView';

type Tab = 'league' | 'standings';

export default function TeamDrawView() {
  const [tab, setTab] = useState<Tab>('league');

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* タブ切り替え */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setTab('league')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            tab === 'league'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid size={16} />
          リーグ戦
        </button>
        <button
          onClick={() => setTab('standings')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            tab === 'standings'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Trophy size={16} />
          順位表
        </button>
      </div>

      {/* コンテンツ */}
      {tab === 'league' && <TeamLeagueView />}
      {tab === 'standings' && <TeamStandingsView />}
    </div>
  );
}
