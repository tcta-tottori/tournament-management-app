import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import { MapPin, Play, CheckCircle, Clock, Trophy, BarChart2, Users } from 'lucide-react';
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
  const { leagues, leagueMatches, allTeams, brackets, tournamentInfo } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  // 全体進捗
  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;
  const progressPct = totalMatches > 0 ? Math.round((totalFinished / totalMatches) * 100) : 0;

  // ブラケット進捗
  const bracketFinished = brackets.reduce((s, b) => s + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
  const bracketTotal = brackets.reduce((s, b) => s + b.matches.length, 0);

  // SVGドーナツチャート用
  const leagueCompletedCount = leagues.filter(l => {
    const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
    return lm.length > 0 && lm.every(m => m.status === 'finished');
  }).length;

  const radius = 60;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const finishedArc = (totalFinished / Math.max(totalMatches, 1)) * circumference;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ヘッダー: 大会名 + 全体進捗 */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            {/* 左: 大会情報 */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 mb-1">
                <Trophy size={20} />
                {tournamentInfo?.name || 'ミックス大会'}
              </h1>
              {tournamentInfo && (
                <div className="text-xs text-emerald-200 flex items-center gap-3 flex-wrap">
                  {tournamentInfo.date && <span>{tournamentInfo.date}</span>}
                  {tournamentInfo.venue && <span className="flex items-center gap-1"><MapPin size={10} />{tournamentInfo.venue}</span>}
                  <span className="flex items-center gap-1"><Users size={10} />{allTeams.length}ペア / {leagues.length}リーグ</span>
                </div>
              )}

              {/* 統計バー */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-emerald-100">
                  <BarChart2 size={12} />
                  <span>予選リーグ {totalFinished}/{totalMatches}試合</span>
                  <span className="text-white font-bold">{progressPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-emerald-900/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {brackets.length > 0 && (
                  <div className="text-xs text-emerald-200">
                    決勝トーナメント: {bracketFinished}/{bracketTotal}試合
                  </div>
                )}
              </div>
            </div>

            {/* 右: ドーナツチャート */}
            <div className="flex-shrink-0">
              <svg width={radius * 2 + stroke} height={radius * 2 + stroke} className="transform -rotate-90">
                <circle
                  cx={radius + stroke / 2}
                  cy={radius + stroke / 2}
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={stroke}
                />
                <circle
                  cx={radius + stroke / 2}
                  cy={radius + stroke / 2}
                  r={radius}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={stroke}
                  strokeDasharray={`${finishedArc} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute" style={{ marginTop: -(radius + stroke / 2 + 16), marginLeft: stroke / 2 + 14 }}>
                <div className="text-center" style={{ width: radius * 2 - stroke }}>
                  <div className="text-2xl font-bold text-white">{progressPct}%</div>
                  <div className="text-[9px] text-emerald-200">{leagueCompletedCount}/{leagues.length}完了</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* コート配置図 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {leagues.map(league => {
          const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finished = lMatches.filter(m => m.status === 'finished').length;
          const total = lMatches.length;
          const isComplete = finished === total && total > 0;
          const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
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

          // コートカラー: 完了=グリーン、進行中=ブルー、未開始=グレー
          const headerGrad = isComplete
            ? 'from-emerald-500 to-teal-600'
            : finished > 0
              ? 'from-blue-500 to-indigo-600'
              : 'from-gray-400 to-gray-500';

          return (
            <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* コートヘッダー — コート名を大きく表示 */}
              <div className={`bg-gradient-to-r ${headerGrad} text-white px-4 py-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center">
                      <span className="text-lg font-bold leading-none">{league.leagueId.trim()}</span>
                      <span className="text-[8px] opacity-80">リーグ</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-bold">
                        <MapPin size={13} />
                        {league.courtName || '(コート未設定)'}
                      </div>
                      <div className="text-xs opacity-80">{league.teams.length}ペア</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {isComplete ? (
                      <div className="flex items-center gap-1 text-xs bg-white/20 px-2.5 py-1 rounded-full">
                        <CheckCircle size={12} />
                        完了
                      </div>
                    ) : (
                      <div>
                        <div className="text-xl font-bold">{pct}%</div>
                        <div className="text-[10px] opacity-80">{finished}/{total}</div>
                      </div>
                    )}
                  </div>
                </div>
                {/* コートプログレスバー */}
                <div className="mt-2 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="p-3 space-y-2">
                {/* 現在進行中の試合 */}
                {nextMatch && !isComplete && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold mb-1.5">
                      <Play size={11} className="fill-blue-600" />
                      {finished > 0 ? '次の試合' : 'これからの試合'} ・ 第{nextMatch.matchNumber}試合
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-sm font-bold text-gray-800 truncate">{getTeamName(nextMatch.team1Id)}</div>
                      </div>
                      <div className="text-xs text-gray-400 font-bold shrink-0">VS</div>
                      <div className="flex-1 text-center">
                        <div className="text-sm font-bold text-gray-800 truncate">{getTeamName(nextMatch.team2Id)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 最後の結果 */}
                {lastFinished && (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1">
                      <Clock size={10} />
                      直近結果 ・ 第{lastFinished.matchNumber}試合
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium truncate flex-1 ${lastFinished.winnerId === lastFinished.team1Id ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                        {getTeamName(lastFinished.team1Id)}
                      </span>
                      <span className="font-mono text-xs text-gray-600 bg-white px-2 py-0.5 rounded mx-1 shrink-0">
                        {formatScore(lastFinished, lastFinished.team1Id)}
                      </span>
                      <span className={`font-medium truncate flex-1 text-right ${lastFinished.winnerId === lastFinished.team2Id ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                        {getTeamName(lastFinished.team2Id)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 完了時: 順位表示 */}
                {isComplete && standings.length > 0 && (
                  <div className="border-t border-gray-100 pt-2 space-y-1">
                    <div className="text-[10px] font-medium text-gray-400 mb-1">最終順位</div>
                    {standings.map(s => (
                      <div key={s.teamId} className="flex items-center gap-2 text-xs py-0.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                          ${s.rank === 1 ? 'bg-yellow-400 text-white' : s.rank === 2 ? 'bg-gray-400 text-white' : s.rank === 3 ? 'bg-orange-400 text-white' : 'bg-gray-200 text-gray-500'}
                        `}>{s.rank}</span>
                        <span className="flex-1 truncate text-gray-700 font-medium">{s.teamName}</span>
                        <span className="text-gray-400 font-mono">{s.wins}W-{s.losses}L</span>
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
