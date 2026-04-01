import { useState, useEffect } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import { MapPin, Play, CheckCircle, Trophy, BarChart2, Users } from 'lucide-react';
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

/** SVG コートライン（水平レイアウト） */
function CourtLines({ status }: { status: 'playing' | 'complete' | 'idle' }) {
  const color = status === 'playing' ? 'rgba(22,163,74,0.12)' : status === 'complete' ? 'rgba(16,185,129,0.08)' : 'rgba(0,0,0,0.04)';
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 120" preserveAspectRatio="none">
      <rect x="8" y="8" width="184" height="104" fill="none" stroke={color} strokeWidth="2" />
      <line x1="100" y1="8" x2="100" y2="112" stroke={color} strokeWidth="1.5" />
      <line x1="8" y1="60" x2="192" y2="60" stroke={color} strokeWidth="1" />
      <rect x="50" y="8" width="100" height="104" fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

/** ドーナツチャートコンポーネント */
function DonutChart({ percent, finished, total }: { percent: number; finished: number; total: number }) {
  const radius = 44;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const finishedArc = (percent / 100) * circumference;

  return (
    <div className="relative">
      <svg width={radius * 2 + stroke + 4} height={radius * 2 + stroke + 4} className="transform -rotate-90">
        <circle cx={radius + stroke / 2 + 2} cy={radius + stroke / 2 + 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={radius + stroke / 2 + 2} cy={radius + stroke / 2 + 2} r={radius} fill="none" stroke="#3b82f6" strokeWidth={stroke}
          strokeDasharray={`${finishedArc} ${circumference}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-gray-900">{percent}%</span>
        <span className="text-[9px] text-gray-400 font-medium">{finished}/{total}</span>
      </div>
    </div>
  );
}

export default function MixedLiveCourtView() {
  const { leagues, leagueMatches, allTeams, brackets, tournamentInfo } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 全体進捗
  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;
  const progressPct = totalMatches > 0 ? Math.round((totalFinished / totalMatches) * 100) : 0;

  // ブラケット進捗
  const bracketFinished = brackets.reduce((s, b) => s + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
  const bracketTotal = brackets.reduce((s, b) => s + b.matches.length, 0);

  const leagueCompletedCount = leagues.filter(l => {
    const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
    return lm.length > 0 && lm.every(m => m.status === 'finished');
  }).length;

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* ===== HEADER ===== */}
      <header className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-emerald-500" />
              ライブダッシュボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tournamentInfo?.name || 'ミックス大会'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-gray-900 font-mono tracking-tight">{timeStr}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {currentTime.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
          </div>
        </div>
      </header>

      {/* ===== TOP ROW: Donut + Stats ===== */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-stretch">
        {/* ドーナツチャート */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col items-center justify-center min-w-[180px]">
          <DonutChart percent={progressPct} finished={totalFinished} total={totalMatches} />
          <div className="flex gap-4 mt-3 text-[10px] font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />終了</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />試合中</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" />待機</span>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
          {[
            { icon: Users, label: '全試合数', value: totalMatches, color: 'text-gray-600 bg-gray-50 border-gray-200' },
            { icon: Play, label: '予選リーグ', value: `${totalFinished}/${totalMatches}`, color: 'text-green-700 bg-green-50 border-green-200' },
            { icon: CheckCircle, label: 'リーグ完了', value: `${leagueCompletedCount}/${leagues.length}`, color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { icon: Trophy, label: '決勝T', value: brackets.length > 0 ? `${bracketFinished}/${bracketTotal}` : '―', color: 'text-amber-700 bg-amber-50 border-amber-200' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <Icon className="w-4 h-4 mb-1 opacity-60" />
              <div className="text-lg font-black leading-none">{value}</div>
              <div className="text-[10px] mt-1 opacity-60 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== コートマップ ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            コート配置
          </h2>
          <div className="flex gap-3 text-[10px] flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400" />試合中</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" />完了</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-200" />待機</span>
          </div>
        </div>

        {/* コートブロック: PC横並び / モバイル2列 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {leagues.map(league => {
            const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
            const finished = lMatches.filter(m => m.status === 'finished').length;
            const total = lMatches.length;
            const isComplete = finished === total && total > 0;
            const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
            const standings = allStandings.get(league.leagueId) || [];

            const nextMatch = lMatches
              .filter(m => m.status !== 'finished')
              .sort((a, b) => a.matchNumber - b.matchNumber)[0] || null;

            const lastFinished = lMatches
              .filter(m => m.status === 'finished')
              .sort((a, b) => b.matchNumber - a.matchNumber)[0] || null;

            const getTeamName = (id: string) => allTeams.find(t => t.teamId === id)?.teamName || '';

            const status = isComplete ? 'complete' : (finished > 0 || nextMatch) ? 'playing' : 'idle';

            return (
              <div
                key={league.leagueId}
                className={`relative rounded-xl border-2 overflow-hidden transition-all
                  ${isComplete ? 'border-emerald-300 bg-emerald-50/30' :
                    finished > 0 ? 'border-green-400 bg-green-50/30 shadow-[0_0_10px_rgba(22,163,74,0.15)]' :
                    'border-gray-200 bg-white/80'}
                `}
                style={{ aspectRatio: '1.5 / 1', minHeight: 140 }}
              >
                <CourtLines status={status} />
                <div className="relative z-10 flex flex-col h-full p-2.5">
                  {/* 上部: コート番号 + リーグID + バッジ */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {!isComplete && finished > 0 && (
                        <span className="flex items-center gap-0.5 bg-green-500 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                          <Play className="w-2 h-2 fill-white" /> LIVE
                        </span>
                      )}
                      {isComplete && (
                        <span className="flex items-center gap-0.5 bg-blue-500 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                          <CheckCircle className="w-2.5 h-2.5" /> 完了
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{finished}/{total}</span>
                  </div>

                  {/* コート名 + リーグID */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-2xl font-black text-gray-800 leading-none">{league.leagueId}</span>
                    <div className="min-w-0">
                      <div className="text-[9px] text-gray-400 font-medium flex items-center gap-0.5 truncate">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        {league.courtName || '(コート未設定)'}
                      </div>
                      <div className="text-[9px] text-gray-400">{league.teams.length}ペア</div>
                    </div>
                  </div>

                  {/* プログレスバー */}
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-green-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* 中央: 対戦情報 or 順位 */}
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    {isComplete && standings.length > 0 ? (
                      <div className="space-y-0.5">
                        {standings.slice(0, 3).map(s => (
                          <div key={s.teamId} className="flex items-center gap-1 text-[9px]">
                            <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0
                              ${s.rank === 1 ? 'bg-yellow-400 text-white' : s.rank === 2 ? 'bg-gray-400 text-white' : 'bg-orange-300 text-white'}
                            `}>{s.rank}</span>
                            <span className="truncate text-gray-700 font-medium">{s.teamName}</span>
                          </div>
                        ))}
                      </div>
                    ) : nextMatch ? (
                      <div className="space-y-0">
                        <p className="text-[8px] font-bold text-green-600/80 mb-0.5">第{nextMatch.matchNumber}試合</p>
                        <p className="text-[10px] font-bold text-gray-800 truncate">{getTeamName(nextMatch.team1Id)}</p>
                        <p className="text-[7px] font-medium text-gray-400 leading-none">vs</p>
                        <p className="text-[10px] font-bold text-gray-800 truncate">{getTeamName(nextMatch.team2Id)}</p>
                      </div>
                    ) : lastFinished ? (
                      <div className="space-y-0">
                        <p className="text-[8px] text-gray-400 mb-0.5">直近結果</p>
                        <p className="text-[10px] font-medium text-gray-600 truncate">{getTeamName(lastFinished.team1Id)}</p>
                        <p className="text-[9px] font-mono text-gray-500 text-center">{formatScore(lastFinished, lastFinished.team1Id)}</p>
                        <p className="text-[10px] font-medium text-gray-600 truncate">{getTeamName(lastFinished.team2Id)}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 text-center">待機中</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 決勝トーナメント進捗 ===== */}
      {brackets.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            決勝トーナメント進捗
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {brackets.map(b => {
              const bf = b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length;
              const bt = b.matches.length;
              const bPct = bt > 0 ? Math.round((bf / bt) * 100) : 0;
              const label = b.category === '1st' ? '1位' : b.category === '2nd' ? '2位' : b.category === '3rd' ? '3位' : '4-5位';
              return (
                <div key={b.category} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-700">{label}トーナメント</span>
                    <span className="text-xs text-gray-400">{bf}/{bt}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${bPct}%` }} />
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
