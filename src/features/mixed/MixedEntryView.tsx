import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { Users, Search, RotateCcw } from 'lucide-react';
import { useState } from 'react';

export default function MixedEntryView() {
  const { leagues, allTeams, tournamentInfo, isImported, resetAll } = useMixedStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);

  if (!isImported) {
    return <MixedImportView />;
  }

  const filteredTeams = allTeams.filter(team => {
    const matchesSearch = !searchQuery ||
      team.male.name.includes(searchQuery) ||
      team.female.name.includes(searchQuery) ||
      team.male.affiliation.includes(searchQuery) ||
      team.female.affiliation.includes(searchQuery);
    const matchesLeague = !selectedLeagueId || team.leagueId === selectedLeagueId;
    return matchesSearch && matchesLeague;
  });

  return (
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">ミックスダブルス エントリー</h2>
              <p className="text-emerald-200 text-sm">{tournamentInfo?.name} | {allTeams.length}ペア | {leagues.length}リーグ</p>
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

      {/* フィルター */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="選手名・所属で検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <select
          value={selectedLeagueId || ''}
          onChange={e => setSelectedLeagueId(e.target.value || null)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">全リーグ</option>
          {leagues.map(l => (
            <option key={l.leagueId} value={l.leagueId}>{l.leagueId.trim()}リーグ ({l.teams.length}ペア)</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{filteredTeams.length}ペア表示</span>
      </div>

      {/* チーム一覧テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 text-xs text-gray-500">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left w-16">リーグ</th>
              <th className="px-4 py-3 text-left">男子選手</th>
              <th className="px-4 py-3 text-left">男子所属</th>
              <th className="px-4 py-3 text-left">女子選手</th>
              <th className="px-4 py-3 text-left">女子所属</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeams.map((team, idx) => (
              <tr key={team.teamId} className="border-t border-gray-100 hover:bg-emerald-50/30 transition-colors">
                <td className="px-4 py-2.5 text-sm text-gray-400">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-lg">
                    {team.leagueId.trim()}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{team.male.name}</td>
                <td className="px-4 py-2.5 text-sm text-gray-500">{team.male.affiliation}</td>
                <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{team.female.name}</td>
                <td className="px-4 py-2.5 text-sm text-gray-500">{team.female.affiliation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
