import { useState, useMemo, useCallback } from 'react';
import { Check, Circle, Play, MapPin, Maximize2, X, Download } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamLeagueMatch, MatchType } from './types';
import { calculateTeamStandings, MATCH_TYPE_ORDER, MATCH_TYPE_SHORT } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';

/** リーグバッジカラー */
const LEAGUE_COLORS = [
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', header: 'from-blue-500 to-indigo-600' },
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', header: 'from-emerald-500 to-teal-600' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', header: 'from-purple-500 to-violet-600' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700', header: 'from-rose-500 to-pink-600' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', header: 'from-amber-500 to-orange-600' },
];

export default function TeamLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId, tournamentInfo } = useTeamStore();
  const [editingMatch, setEditingMatch] = useState<TeamLeagueMatch | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { rankOverrides } = useTeamStore();
  const allStandings = calculateTeamStandings(leagues, leagueMatches, rankOverrides);

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  if (!selectedLeague) return <div className="text-center text-gray-400 py-12">データがありません</div>;

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const leagueComplete = finishedCount === totalCount && totalCount > 0;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  const leagueIdx = leagues.findIndex(l => l.leagueId === selectedLeague.leagueId);
  const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];

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

  const content = (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto p-4' : ''}`}>
      {/* リーグ選択タブ */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {leagues.map((l, i) => {
          const c = LEAGUE_COLORS[i % LEAGUE_COLORS.length];
          const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
          const done = lm.filter(m => m.status === 'finished').length;
          const total = lm.length;
          const isSelected = l.leagueId === selectedLeague.leagueId;
          return (
            <button
              key={l.leagueId}
              onClick={() => setSelectedLeagueId(l.leagueId)}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                isSelected
                  ? `bg-gradient-to-r ${c.from} ${c.to} text-white shadow-md scale-105`
                  : `${c.badge} hover:opacity-80`
              }`}
            >
              {l.leagueId}
              <span className="ml-1 text-xs opacity-80">{done}/{total}</span>
            </button>
          );
        })}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          className="ml-auto px-2 py-1 text-gray-500 hover:text-gray-700"
          title={isFullscreen ? '通常表示' : '全画面'}
        >
          {isFullscreen ? <X size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* リーグヘッダー */}
      <div className={`bg-gradient-to-r ${colors.header} text-white rounded-t-xl px-4 py-3 flex items-center justify-between`}>
        <div>
          <span className="text-lg font-bold">{selectedLeague.leagueId}リーグ</span>
          {selectedLeague.courtName && (
            <span className="ml-3 text-sm opacity-80">
              <MapPin size={14} className="inline mr-1" />
              {selectedLeague.courtName}
            </span>
          )}
        </div>
        <div className="text-sm">
          {leagueComplete ? (
            <span className="bg-white/20 px-3 py-1 rounded-full font-bold">全試合完了</span>
          ) : (
            <span>{finishedCount} / {totalCount} 完了</span>
          )}
        </div>
      </div>

      {/* 成績表（団体戦用：各セルに3種目スコア表示） */}
      <div className="overflow-x-auto border border-t-0 rounded-b-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-2 text-left min-w-[120px]">チーム名</th>
              <th className="border px-1 py-2 w-[40px] text-center">種目</th>
              {selectedLeague.teams.map(t => (
                <th key={t.teamId} className="border px-2 py-2 text-center min-w-[80px] text-xs">
                  {t.teamName.split(' ')[0]}
                </th>
              ))}
              <th className="border px-2 py-2 text-center min-w-[60px]">成績</th>
              <th className="border px-2 py-2 text-center min-w-[50px]">順位</th>
            </tr>
          </thead>
          <tbody>
            {selectedLeague.teams.map((rowTeam, ri) => {
              const standing = standings.find(s => s.teamId === rowTeam.teamId);
              return MATCH_TYPE_ORDER.map((matchType, si) => (
                <tr key={`${rowTeam.teamId}-${matchType}`} className={si === 0 ? 'border-t-2 border-gray-300' : ''}>
                  {/* チーム名（3行結合） */}
                  {si === 0 && (
                    <td rowSpan={3} className="border px-2 py-1 font-bold text-xs bg-gray-50 align-middle">
                      {rowTeam.teamName}
                    </td>
                  )}
                  {/* 種目 */}
                  <td className="border px-1 py-0.5 text-center text-[10px] font-medium text-gray-500">
                    {MATCH_TYPE_SHORT[matchType]}
                  </td>
                  {/* 各対戦相手とのスコア */}
                  {selectedLeague.teams.map(colTeam => {
                    if (rowTeam.teamId === colTeam.teamId) {
                      return si === 0 ? (
                        <td key={colTeam.teamId} rowSpan={3} className="border bg-gray-100" />
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
                        className={`border px-1 py-0.5 text-center text-xs cursor-pointer transition-colors ${
                          hasScore
                            ? won ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-red-50 text-red-500'
                            : isCurrent && si === 0 ? 'league-match-blink' : 'hover:bg-blue-50'
                        }`}
                        onClick={() => match && setEditingMatch(match)}
                      >
                        {hasScore ? `${myScore}-${oppScore}` : ''}
                      </td>
                    );
                  })}
                  {/* 成績（3行結合） */}
                  {si === 0 && (
                    <td rowSpan={3} className="border px-2 py-1 text-center font-bold align-middle">
                      {standing ? `${standing.wins}-${standing.losses}` : '-'}
                    </td>
                  )}
                  {/* 順位（3行結合） */}
                  {si === 0 && (
                    <td rowSpan={3} className="border px-2 py-1 text-center font-bold align-middle">
                      {standing?.rank ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          standing.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                          standing.rank === 2 ? 'bg-gray-100 text-gray-700' :
                          'bg-orange-50 text-orange-700'
                        }`}>
                          {standing.rank}位
                        </span>
                      ) : '-'}
                      {standing?.tiebreakReason && (
                        <div className="text-[9px] text-gray-400 mt-0.5">{standing.tiebreakReason}</div>
                      )}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* 対戦順リスト */}
      <div className="mt-4">
        <h3 className="text-sm font-bold text-gray-700 mb-2">対戦順</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {selectedLeague.matchOrder.map(mo => {
            const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
            const team1 = selectedLeague.teams[mo.team1Index - 1];
            const team2 = selectedLeague.teams[mo.team2Index - 1];
            if (!match || !team1 || !team2) return null;

            const isFinished = match.status === 'finished';
            const isCurrent = mo.matchNumber === currentMatchNumber;

            return (
              <div
                key={mo.matchNumber}
                onClick={() => setEditingMatch(match)}
                className={`p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                  isFinished ? 'bg-green-50 border-green-200' :
                  isCurrent ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' :
                  'bg-white border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-gray-500">第{mo.matchNumber}対戦</span>
                  {isFinished ? (
                    <Check size={14} className="text-green-500" />
                  ) : isCurrent ? (
                    <Play size={14} className="text-blue-500" />
                  ) : (
                    <Circle size={14} className="text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className={`flex-1 text-center truncate ${match.winnerId === team1.teamId ? 'font-bold text-blue-700' : ''}`}>
                    {team1.teamName.split(' ')[0]}
                  </span>
                  <span className="text-gray-400 shrink-0">
                    {isFinished ? `${match.winsTeam1}-${match.winsTeam2}` : 'vs'}
                  </span>
                  <span className={`flex-1 text-center truncate ${match.winnerId === team2.teamId ? 'font-bold text-blue-700' : ''}`}>
                    {team2.teamName.split(' ')[0]}
                  </span>
                </div>
              </div>
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

  return content;
}
