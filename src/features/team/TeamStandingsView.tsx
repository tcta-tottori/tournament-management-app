import { useMemo } from 'react';
import { useTeamStore } from './teamStore';
import { calculateTeamStandings } from './teamLogic';

const LEAGUE_COLORS = [
  { header: 'from-blue-500 to-indigo-600', badge: 'bg-blue-100 text-blue-700' },
  { header: 'from-emerald-500 to-teal-600', badge: 'bg-emerald-100 text-emerald-700' },
  { header: 'from-purple-500 to-violet-600', badge: 'bg-purple-100 text-purple-700' },
  { header: 'from-rose-500 to-pink-600', badge: 'bg-rose-100 text-rose-700' },
  { header: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-700' },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-white font-extrabold text-sm shadow-md shadow-amber-300/50 ring-2 ring-white">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 via-gray-300 to-slate-500 text-white font-extrabold text-sm shadow-md shadow-slate-300/50 ring-2 ring-white">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 via-orange-500 to-amber-700 text-white font-extrabold text-sm shadow-md shadow-orange-300/50 ring-2 ring-white">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm">
      {rank}
    </span>
  );
}

export default function TeamStandingsView() {
  const { leagues, leagueMatches, rankOverrides } = useTeamStore();

  const allStandings = useMemo(
    () => calculateTeamStandings(leagues, leagueMatches, rankOverrides),
    [leagues, leagueMatches, rankOverrides]
  );

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <h2 className="text-lg font-bold text-gray-800">リーグ順位表</h2>

      {/* 各リーグの順位表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {leagues.map((league, li) => {
          const standings = allStandings.get(league.leagueId) || [];
          const colors = LEAGUE_COLORS[li % LEAGUE_COLORS.length];
          const lm = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finished = lm.filter(m => m.status === 'finished').length;
          const total = lm.length;
          const isComplete = total > 0 && finished === total;

          return (
            <div key={league.leagueId} className="border rounded-xl overflow-hidden">
              <div className={`bg-gradient-to-r ${colors.header} text-white px-4 py-2 flex items-center justify-between`}>
                <span className="font-bold">{league.leagueId}リーグ</span>
                <span className="text-xs opacity-80">
                  {isComplete ? '完了' : `${finished}/${total}`}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-3 py-1.5 text-left">順位</th>
                    <th className="px-3 py-1.5 text-left">チーム名</th>
                    <th className="px-3 py-1.5 text-center">勝-敗</th>
                    <th className="px-3 py-1.5 text-center">ポイント</th>
                    <th className="px-3 py-1.5 text-center">ゲーム率</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map(s => (
                    <tr key={s.teamId} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <RankBadge rank={s.rank} />
                      </td>
                      <td className="px-3 py-1.5 font-medium">{s.teamName}</td>
                      <td className="px-3 py-1.5 text-center font-bold">
                        {s.wins}-{s.losses}
                      </td>
                      <td className="px-3 py-1.5 text-center text-xs">
                        {s.pointsWon}
                      </td>
                      <td className="px-3 py-1.5 text-center text-xs text-gray-500">
                        {s.gameRatio.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {standings.some(s => s.tiebreakReason) && (
                <div className="px-4 py-1 text-[10px] text-gray-400 border-t">
                  {standings.filter(s => s.tiebreakReason).map(s => (
                    <span key={s.teamId} className="mr-3">{s.teamName}: {s.tiebreakReason}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
