import { useMemo } from 'react';
import { Trophy, ArrowRight, AlertTriangle } from 'lucide-react';
import { useTeamStore } from './teamStore';
import { calculateTeamStandings } from './teamLogic';

/** リーグカラーパレット（Blue先頭で全ページ統一） */
const LEAGUE_COLORS = [
  { header: 'from-blue-500 to-indigo-600', badge: 'bg-blue-100 text-blue-700' },
  { header: 'from-emerald-500 to-teal-600', badge: 'bg-emerald-100 text-emerald-700' },
  { header: 'from-purple-500 to-violet-600', badge: 'bg-purple-100 text-purple-700' },
  { header: 'from-rose-500 to-pink-600', badge: 'bg-rose-100 text-rose-700' },
  { header: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-700' },
  { header: 'from-cyan-500 to-sky-600', badge: 'bg-cyan-100 text-cyan-700' },
  { header: 'from-lime-500 to-green-600', badge: 'bg-lime-100 text-lime-700' },
  { header: 'from-fuchsia-500 to-purple-600', badge: 'bg-fuchsia-100 text-fuchsia-700' },
];

export default function TeamStandingsView() {
  const { leagues, leagueMatches, rankOverrides, generateBrackets, currentPhase } = useTeamStore();

  const allStandings = useMemo(
    () => calculateTeamStandings(leagues, leagueMatches, rankOverrides),
    [leagues, leagueMatches, rankOverrides]
  );

  // 全リーグ完了チェック
  const allComplete = useMemo(() => {
    return leagues.every(l => {
      const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
  }, [leagues, leagueMatches]);

  const incompleteLeagues = useMemo(() => {
    return leagues.filter(l => {
      const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length === 0 || lm.some(m => m.status !== 'finished');
    });
  }, [leagues, leagueMatches]);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">リーグ順位表</h2>
        <button
          onClick={() => generateBrackets()}
          disabled={!allComplete}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
            allComplete
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Trophy size={18} />
          決勝トーナメント生成
          <ArrowRight size={16} />
        </button>
      </div>

      {/* 未完了リーグ警告 */}
      {!allComplete && incompleteLeagues.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <AlertTriangle size={16} />
          <span>
            未完了リーグ: {incompleteLeagues.map(l => l.leagueId).join(', ')}
            — 全リーグ完了後に決勝トーナメントを生成できます
          </span>
        </div>
      )}

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
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          s.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                          s.rank === 2 ? 'bg-gray-200 text-gray-700' :
                          s.rank === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {s.rank}位
                        </span>
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
