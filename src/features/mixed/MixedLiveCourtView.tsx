import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import { MapPin, Play, CheckCircle, Clock, Trophy } from 'lucide-react';
import type { LeagueMatchScore } from './types';

/** タイブレークスコアの表示テキスト */
function formatScore(match: LeagueMatchScore, teamId: string): string {
  const isTeam1 = match.team1Id === teamId;
  const my = isTeam1 ? match.score1 : match.score2;
  const opp = isTeam1 ? match.score2 : match.score1;
  const won = match.winnerId === teamId;
  if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
    return won ? `${my}-${opp}(${match.tiebreakScore})` : `(${match.tiebreakScore})${my}-${opp}`;
  }
  return `${my}-${opp}`;
}

export default function MixedLiveCourtView() {
  const { leagues, leagueMatches, allTeams, brackets } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  // 全体進捗
  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;
  const progressPct = totalMatches > 0 ? Math.round((totalFinished / totalMatches) * 100) : 0;

  // ブラケット進捗
  const bracketFinished = brackets.reduce((s, b) => s + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
  const bracketTotal = brackets.reduce((s, b) => s + b.matches.length, 0);

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 全体進捗 */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy size={22} />
            コートビュー
          </h2>
          <div className="text-right">
            <div className="text-2xl font-bold">{progressPct}%</div>
            <div className="text-xs text-emerald-200">予選リーグ {totalFinished}/{totalMatches}</div>
          </div>
        </div>
        <div className="w-full h-2 bg-emerald-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {brackets.length > 0 && (
          <div className="text-xs text-emerald-200 mt-2">
            決勝トーナメント: {bracketFinished}/{bracketTotal}試合
          </div>
        )}
      </div>

      {/* コート別表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {leagues.map(league => {
          const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finished = lMatches.filter(m => m.status === 'finished').length;
          const total = lMatches.length;
          const isComplete = finished === total && total > 0;
          const standings = allStandings.get(league.leagueId) || [];

          // 現在の試合（未完了で番号が一番小さいもの）
          const nextMatch = lMatches
            .filter(m => m.status !== 'finished')
            .sort((a, b) => a.matchNumber - b.matchNumber)[0] || null;

          // 最後に完了した試合
          const lastFinished = lMatches
            .filter(m => m.status === 'finished')
            .sort((a, b) => b.matchNumber - a.matchNumber)[0] || null;

          const getTeamName = (id: string) => allTeams.find(t => t.teamId === id)?.teamName || '';

          return (
            <div key={league.leagueId} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${isComplete ? 'border-emerald-300' : 'border-gray-200'}`}>
              {/* コートヘッダー */}
              <div className={`px-4 py-3 flex items-center justify-between ${isComplete ? 'bg-gradient-to-r from-emerald-50 to-teal-50' : 'bg-gradient-to-r from-gray-50 to-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white shadow ${isComplete ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                    {league.leagueId.trim()}
                  </div>
                  <div>
                    <div className="font-bold text-gray-800 text-sm">{league.leagueId.trim()}リーグ</div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin size={10} />
                      {league.courtName || '(未設定)'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                      <CheckCircle size={12} />
                      完了
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{finished}/{total}</span>
                  )}
                </div>
              </div>

              <div className="p-3 space-y-2">
                {/* 進捗バー */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                    style={{ width: `${total > 0 ? (finished / total) * 100 : 0}%` }}
                  />
                </div>

                {/* 現在進行中の試合 */}
                {nextMatch && !isComplete && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium mb-1">
                      <Play size={11} className="fill-blue-600" />
                      次の試合 (第{nextMatch.matchNumber}試合)
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800">{getTeamName(nextMatch.team1Id)}</span>
                      <span className="text-gray-400 text-xs">vs</span>
                      <span className="font-medium text-gray-800">{getTeamName(nextMatch.team2Id)}</span>
                    </div>
                  </div>
                )}

                {/* 最後の結果 */}
                {lastFinished && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Clock size={10} />
                      直近結果 (第{lastFinished.matchNumber}試合)
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${lastFinished.winnerId === lastFinished.team1Id ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {getTeamName(lastFinished.team1Id)}
                      </span>
                      <span className="font-mono text-xs text-gray-600 bg-white px-2 py-0.5 rounded">
                        {formatScore(lastFinished, lastFinished.team1Id)}
                      </span>
                      <span className={`font-medium ${lastFinished.winnerId === lastFinished.team2Id ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {getTeamName(lastFinished.team2Id)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 完了時: 順位表示 */}
                {isComplete && standings.length > 0 && (
                  <div className="space-y-1">
                    {standings.map(s => (
                      <div key={s.teamId} className="flex items-center gap-2 text-xs py-0.5">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                          ${s.rank === 1 ? 'bg-yellow-400 text-white' : s.rank === 2 ? 'bg-gray-300 text-white' : s.rank === 3 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}
                        `}>{s.rank}</span>
                        <span className="flex-1 truncate text-gray-700">{s.teamName}</span>
                        <span className="text-gray-400">{s.wins}W-{s.losses}L</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
