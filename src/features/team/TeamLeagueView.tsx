import { useState, useMemo } from 'react';
import { Check, Circle, Play, MapPin, Maximize2, X, Trophy, Medal, Award, Target } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamLeagueMatch } from './types';
import { calculateTeamStandings, MATCH_TYPE_ORDER, MATCH_TYPE_SHORT } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';

/** リーグカラー */
const LEAGUE_COLORS = [
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', soft: 'bg-blue-100', ring: 'ring-blue-500/20' },
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', soft: 'bg-emerald-100', ring: 'ring-emerald-500/20' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', soft: 'bg-purple-100', ring: 'ring-purple-500/20' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', soft: 'bg-rose-100', ring: 'ring-rose-500/20' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', soft: 'bg-amber-100', ring: 'ring-amber-500/20' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', soft: 'bg-cyan-100', ring: 'ring-cyan-500/20' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', soft: 'bg-lime-100', ring: 'ring-lime-500/20' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', soft: 'bg-fuchsia-100', ring: 'ring-fuchsia-500/20' },
];

const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

/** 順位アイコン */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-sm">
        <Trophy className="w-2.5 h-2.5" />
        1位
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-slate-300 to-slate-400 text-white shadow-sm">
        <Medal className="w-2.5 h-2.5" />
        2位
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-600 to-orange-700 text-white shadow-sm">
        <Award className="w-2.5 h-2.5" />
        3位
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
      {rank}位
    </span>
  );
}

export default function TeamLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId } = useTeamStore();
  const [editingMatch, setEditingMatch] = useState<TeamLeagueMatch | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { rankOverrides } = useTeamStore();
  const allStandings = calculateTeamStandings(leagues, leagueMatches, rankOverrides);

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  if (!selectedLeague) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Target className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-slate-500">データがありません</p>
      </div>
    );
  }

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const leagueComplete = finishedCount === totalCount && totalCount > 0;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  const leagueIdx = leagues.findIndex(l => l.leagueId === selectedLeague.leagueId);
  const color = getColor(leagueIdx);

  // 現在の対戦番号
  const currentMatchNumber = useMemo(() => {
    for (const mo of selectedLeague.matchOrder) {
      const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
      if (!match || match.status !== 'finished') return mo.matchNumber;
    }
    return null;
  }, [selectedLeague.matchOrder, leagueMatchList]);

  // スコアマトリクス
  const scoreMatrix = new Map<string, TeamLeagueMatch>();
  for (const m of leagueMatchList) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  const getMatchBetween = (team1Id: string, team2Id: string) => scoreMatrix.get(`${team1Id}-${team2Id}`);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 overflow-auto p-4' : ''} space-y-4 pb-20`}>
      {/* リーグ選択タブ（横スクロール可） */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-2 bg-gradient-to-b from-slate-50 via-slate-50 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1.5 min-w-max">
              {leagues.map((l, i) => {
                const c = getColor(i);
                const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
                const done = lm.filter(m => m.status === 'finished').length;
                const total = lm.length;
                const complete = done === total && total > 0;
                const isSelected = l.leagueId === selectedLeague.leagueId;
                return (
                  <button
                    key={l.leagueId}
                    onClick={() => setSelectedLeagueId(l.leagueId)}
                    className={`relative px-3.5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                      isSelected
                        ? `bg-gradient-to-br ${c.grad} text-white shadow-md`
                        : `${c.bg} ${c.text} hover:shadow-sm`
                    }`}
                  >
                    <span className="text-base font-black">{l.leagueId}</span>
                    <span className={`ml-1 text-[10px] tabular-nums ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                      {done}/{total}
                    </span>
                    {complete && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white flex items-center justify-center">
                        <Check className="w-2 h-2 text-white" strokeWidth={4} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 shrink-0 transition-colors"
            title={isFullscreen ? '通常表示' : '全画面'}
          >
            {isFullscreen ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* リーグヘッダーカード */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${color.grad} text-white shadow-lg`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight">{selectedLeague.leagueId}</span>
                <span className="text-sm font-medium opacity-90">リーグ</span>
              </div>
              {selectedLeague.courtName && (
                <div className="flex items-center gap-1 text-xs opacity-90 mt-1">
                  <MapPin className="w-3 h-3" />
                  {selectedLeague.courtName}
                </div>
              )}
            </div>
            <div className="text-right">
              {leagueComplete ? (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-black">
                  <Check className="w-3.5 h-3.5" />
                  全試合完了
                </div>
              ) : (
                <div className="text-[10px] opacity-80 font-medium">進行状況</div>
              )}
              <div className="text-2xl font-black tabular-nums leading-tight mt-0.5">
                {finishedCount}<span className="text-sm opacity-60">/{totalCount}</span>
              </div>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 順位表（コンパクト） */}
      {standings.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold text-slate-700">現在の順位</span>
          </div>
          <div className="divide-y divide-slate-100">
            {standings.map(s => {
              const team = selectedLeague.teams.find(t => t.teamId === s.teamId);
              return (
                <div key={s.teamId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <RankBadge rank={s.rank || 0} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{team?.teamName}</div>
                    {s.tiebreakReason && (
                      <div className="text-[10px] text-slate-400 truncate">{s.tiebreakReason}</div>
                    )}
                  </div>
                  <div className="text-sm font-black tabular-nums text-slate-700">
                    {s.wins}<span className="text-slate-300 mx-0.5">-</span>{s.losses}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 成績表 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <Target className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">成績表</span>
          <span className="ml-auto text-[10px] text-slate-400">タップで入力</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-2 text-left min-w-[100px] font-bold text-slate-600 border-b border-slate-200">チーム</th>
                <th className="px-1 py-2 w-[36px] text-center font-bold text-slate-600 border-b border-slate-200">種目</th>
                {selectedLeague.teams.map(t => (
                  <th key={t.teamId} className="px-1.5 py-2 text-center min-w-[68px] text-[10px] font-bold text-slate-600 border-b border-slate-200">
                    {t.teamName.split(' ')[0]}
                  </th>
                ))}
                <th className="px-2 py-2 text-center min-w-[50px] font-bold text-slate-600 border-b border-slate-200">成績</th>
              </tr>
            </thead>
            <tbody>
              {selectedLeague.teams.map(rowTeam => {
                const standing = standings.find(s => s.teamId === rowTeam.teamId);
                return MATCH_TYPE_ORDER.map((matchType, si) => (
                  <tr key={`${rowTeam.teamId}-${matchType}`} className={si === 0 ? 'border-t-2 border-slate-200' : ''}>
                    {si === 0 && (
                      <td rowSpan={3} className="px-2 py-1 font-bold text-xs bg-slate-50/50 align-middle border-r border-slate-100">
                        <div className="truncate max-w-[140px]" title={rowTeam.teamName}>{rowTeam.teamName}</div>
                      </td>
                    )}
                    <td className="px-1 py-0.5 text-center text-[9px] font-bold text-slate-400 border-r border-slate-100">
                      {MATCH_TYPE_SHORT[matchType]}
                    </td>
                    {selectedLeague.teams.map(colTeam => {
                      if (rowTeam.teamId === colTeam.teamId) {
                        return si === 0 ? (
                          <td key={colTeam.teamId} rowSpan={3} className="bg-slate-100 border-r border-slate-100" />
                        ) : null;
                      }
                      const match = getMatchBetween(rowTeam.teamId, colTeam.teamId);
                      const sub = match?.subMatches.find(sm => sm.type === matchType);
                      const isTeam1 = match?.team1Id === rowTeam.teamId;
                      const myScore = isTeam1 ? sub?.score1 : sub?.score2;
                      const oppScore = isTeam1 ? sub?.score2 : sub?.score1;
                      const won = sub?.winnerId === rowTeam.teamId;
                      const hasScore = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;
                      const isCurrent = currentMatchNumber && match?.matchNumber === currentMatchNumber;

                      return (
                        <td
                          key={colTeam.teamId}
                          className={`px-1.5 py-1 text-center text-xs cursor-pointer transition-colors border-r border-slate-100 ${
                            hasScore
                              ? won ? 'bg-blue-50 text-blue-700 font-black' : 'bg-red-50/50 text-red-500'
                              : isCurrent && si === 0 ? 'league-match-blink' : 'hover:bg-blue-50 active:bg-blue-100'
                          }`}
                          onClick={() => match && setEditingMatch(match)}
                        >
                          {hasScore ? `${myScore}-${oppScore}` : ''}
                        </td>
                      );
                    })}
                    {si === 0 && (
                      <td rowSpan={3} className="px-2 py-1 text-center font-black text-sm align-middle bg-slate-50/50">
                        {standing ? (
                          <div className="tabular-nums">
                            {standing.wins}<span className="text-slate-300">-</span>{standing.losses}
                          </div>
                        ) : '-'}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 対戦順 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <Play className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">対戦順</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
          {selectedLeague.matchOrder.map(mo => {
            const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
            const team1 = selectedLeague.teams[mo.team1Index - 1];
            const team2 = selectedLeague.teams[mo.team2Index - 1];
            if (!match || !team1 || !team2) return null;

            const isFinished = match.status === 'finished';
            const isCurrent = mo.matchNumber === currentMatchNumber;

            return (
              <button
                key={mo.matchNumber}
                onClick={() => setEditingMatch(match)}
                className={`relative p-2.5 rounded-xl border text-xs transition-all active:scale-95 text-left ${
                  isFinished
                    ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                    : isCurrent
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black text-slate-400">#{mo.matchNumber}</span>
                  {isFinished ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black">
                      <Check className="w-2.5 h-2.5" />
                      完了
                    </div>
                  ) : isCurrent ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black animate-pulse">
                      <Play className="w-2.5 h-2.5" />
                      対戦中
                    </div>
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className={`truncate ${match.winnerId === team1.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team1.teamName.split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-slate-400 text-center font-bold">
                    {isFinished ? `${match.winsTeam1} - ${match.winsTeam2}` : 'vs'}
                  </div>
                  <div className={`truncate ${match.winnerId === team2.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team2.teamName.split(' ')[0]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* スコア入力ダイアログ */}
      {editingMatch && (() => {
        const team1 = selectedLeague.teams.find(t => t.teamId === editingMatch.team1Id);
        const team2 = selectedLeague.teams.find(t => t.teamId === editingMatch.team2Id);
        return (
          <TeamScoreInput
            matchId={editingMatch.matchId}
            team1Id={editingMatch.team1Id}
            team2Id={editingMatch.team2Id}
            team1Name={team1?.teamName || ''}
            team2Name={team2?.teamName || ''}
            subMatches={editingMatch.subMatches}
            onClose={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
}
