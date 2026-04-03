import { Trophy, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';

export default function MixedStandingsView() {
  const { leagues, leagueMatches, generateBrackets } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  // 全リーグ完了チェック
  const allLeaguesComplete = leagues.every(league => {
    const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
    return lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
  });

  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;

  const rankColors = [
    'from-yellow-400 to-amber-500', // 1位
    'from-gray-300 to-gray-400',    // 2位
    'from-orange-300 to-orange-400', // 3位
    'from-gray-200 to-gray-300',    // 4位
    'from-gray-100 to-gray-200',    // 5位
  ];
  const rankBg = [
    'bg-yellow-50 border-yellow-200',
    'bg-gray-50 border-gray-200',
    'bg-orange-50 border-orange-200',
    'bg-gray-50 border-gray-100',
    'bg-gray-50 border-gray-100',
  ];
  const rankText = ['text-yellow-700', 'text-gray-600', 'text-orange-600', 'text-gray-500', 'text-gray-400'];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Trophy size={22} className="text-yellow-500" />
              全リーグ順位表
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {totalFinished}/{totalMatches} 試合完了
              {allLeaguesComplete && <span className="text-emerald-600 font-medium ml-2">（全リーグ完了）</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!allLeaguesComplete && (
              <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 px-3 py-2 rounded-lg">
                <AlertCircle size={16} />
                全リーグの試合を完了してください
              </div>
            )}
            <button
              onClick={generateBrackets}
              disabled={!allLeaguesComplete}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md
                ${allLeaguesComplete
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                }
              `}
            >
              決勝トーナメント生成
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* リーグ順位カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {leagues.map(league => {
          const standings = allStandings.get(league.leagueId) || [];
          const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finished = lMatches.filter(m => m.status === 'finished').length;
          const total = lMatches.length;
          const isComplete = finished === total && total > 0;

          return (
            <div key={league.leagueId} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${isComplete ? 'border-emerald-200' : 'border-gray-200'}`}>
              {/* カードヘッダー */}
              <div className={`px-4 py-3 flex items-center justify-between ${isComplete ? 'bg-gradient-to-r from-emerald-50 to-teal-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${isComplete ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gray-400'}`}>
                    {league.leagueId.trim()}
                  </span>
                  <span className="font-bold text-gray-700">{league.leagueId.trim()}リーグ</span>
                </div>
                <div className="flex items-center gap-1">
                  {isComplete ? (
                    <CheckCircle size={16} className="text-emerald-500" />
                  ) : (
                    <span className="text-xs text-gray-400">{finished}/{total}</span>
                  )}
                </div>
              </div>

              {/* 順位リスト */}
              <div className="p-3 space-y-1.5">
                {standings.map((s, i) => (
                  <div key={s.teamId} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${rankBg[i] || rankBg[3]}`}>
                    <span className={`w-6 h-6 rounded-full bg-gradient-to-br ${rankColors[i] || rankColors[3]} text-white flex items-center justify-center text-xs font-bold shadow-sm`}>
                      {s.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${rankText[i] || rankText[3]}`}>
                        {s.teamName}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-gray-500 flex-shrink-0">
                      {s.wins}W-{s.losses}L
                    </div>
                  </div>
                ))}
              </div>

              {/* 進捗バー */}
              {!isComplete && (
                <div className="px-4 pb-3">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                      style={{ width: `${total > 0 ? (finished / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 順位別チーム振り分け表 */}
      {allLeaguesComplete && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-4">順位別チーム振り分け</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { rank: 1, label: '1位トーナメント', color: 'yellow' },
              { rank: 2, label: '2位トーナメント', color: 'gray' },
              { rank: 3, label: '3位トーナメント', color: 'orange' },
              { rank: 4, label: '4・5位トーナメント', color: 'slate' },
            ].map(({ rank, label, color }) => {
              const teamsForRank: { teamName: string; league: string }[] = [];
              for (const league of leagues) {
                const standings = allStandings.get(league.leagueId) || [];
                if (rank <= 3) {
                  const entry = standings.find(s => s.rank === rank);
                  if (entry) teamsForRank.push({ teamName: entry.teamName, league: league.leagueId.trim() });
                } else {
                  const entries = standings.filter(s => s.rank >= 4);
                  for (const e of entries) teamsForRank.push({ teamName: e.teamName, league: league.leagueId.trim() });
                }
              }
              return (
                <div key={rank} className="space-y-2">
                  <div className={`text-sm font-bold px-3 py-2 rounded-lg bg-${color}-100 text-${color}-700`}>
                    {label} ({teamsForRank.length}チーム)
                  </div>
                  <div className="space-y-1">
                    {teamsForRank.map((t, i) => (
                      <div key={i} className="text-xs px-2 py-1 bg-gray-50 rounded flex justify-between">
                        <span>{t.teamName}</span>
                        <span className="text-gray-400">{t.league}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
