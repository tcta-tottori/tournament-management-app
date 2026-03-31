import { useState } from 'react';
import { Check, MapPin, Pencil } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedScoreInput from './MixedScoreInput';
import type { LeagueMatchScore } from './types';

export default function MixedDrawView() {
  const { leagues, leagueMatches } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<LeagueMatchScore | null>(null);

  return (
    <div className="p-2 sm:p-4 space-y-3">
      <AllLeaguesView onEditMatch={setEditingMatch} />

      {editingMatch && (
        <MixedScoreInput
          match={editingMatch}
          teams={leagues.find(l => l.leagueId === editingMatch.leagueId)?.teams || []}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </div>
  );
}

/** 全リーグ一覧表示 */
function AllLeaguesView({ onEditMatch }: { onEditMatch: (m: LeagueMatchScore) => void }) {
  const { leagues, leagueMatches, updateCourtName } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  return (
    <div className="space-y-3">
      {leagues.map(league => {
        const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
        const finishedCount = lMatches.filter(m => m.status === 'finished').length;
        const totalCount = lMatches.length;
        const standings = allStandings.get(league.leagueId) || [];
        const isComplete = finishedCount === totalCount && totalCount > 0;

        // スコアマトリックス
        const scoreMatrix = new Map<string, LeagueMatchScore>();
        for (const m of lMatches) {
          scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
          scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
        }

        const getCellDisplay = (rowTeamId: string, colTeamId: string) => {
          if (rowTeamId === colTeamId) return { text: '―', color: 'text-gray-300', bg: 'bg-gray-100' };
          const match = scoreMatrix.get(`${rowTeamId}-${colTeamId}`);
          if (!match || match.status !== 'finished') return { text: '', color: '', bg: 'bg-white hover:bg-emerald-50 cursor-pointer' };
          const isTeam1 = match.team1Id === rowTeamId;
          const myScore = isTeam1 ? match.score1 : match.score2;
          const oppScore = isTeam1 ? match.score2 : match.score1;
          const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
          return {
            text: `${myScore}-${oppScore}`,
            color: won ? 'text-emerald-700 font-bold' : 'text-red-600',
            bg: won ? 'bg-emerald-50 cursor-pointer' : 'bg-red-50 cursor-pointer',
          };
        };

        return (
          <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* リーグヘッダー */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
              <span className="w-8 h-8 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-sm font-bold rounded-lg flex items-center justify-center shadow shrink-0">
                {league.leagueId.trim()}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-800 text-sm">
                  {league.leagueId.trim()}リーグ
                  <span className="text-xs font-normal text-gray-400 ml-1">{league.teams.length}ペア</span>
                </h3>
                {editingCourtId === league.leagueId ? (
                  <div className="flex items-center gap-1">
                    <MapPin size={10} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={courtInput}
                      onChange={e => setCourtInput(e.target.value)}
                      onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                        if (e.key === 'Escape') setEditingCourtId(null);
                      }}
                      className="px-1 py-0 text-xs border border-emerald-400 rounded focus:outline-none w-24"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                    className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-emerald-600 transition-colors"
                  >
                    <MapPin size={10} />
                    {league.courtName || '(コート未設定)'}
                    <Pencil size={8} className="opacity-40" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-500">{finishedCount}/{totalCount}</span>
                {isComplete && <Check size={14} className="text-emerald-500" />}
                <div className="w-12 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                    style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 対戦マトリックス */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm" style={{ minWidth: league.teams.length >= 5 ? 620 : 520 }}>
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-1.5 sm:px-2 py-1 text-left text-[10px] sm:text-xs text-gray-500 w-6">#</th>
                    <th className="px-1.5 sm:px-2 py-1 text-left text-[10px] sm:text-xs text-gray-500 min-w-[100px] sm:min-w-[140px]">ペア名</th>
                    <th className="px-1.5 sm:px-2 py-1 text-left text-[10px] sm:text-xs text-gray-500 min-w-[60px] sm:min-w-[80px]">所属</th>
                    {league.teams.map((_, i) => (
                      <th key={i} className="px-0.5 sm:px-1 py-1 text-center text-[10px] sm:text-xs text-gray-500 w-12 sm:w-16">
                        <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] sm:text-[10px] font-bold">{i + 1}</span>
                      </th>
                    ))}
                    <th className="px-1 sm:px-2 py-1 text-center text-[10px] sm:text-xs text-gray-500 w-10 sm:w-14">勝敗</th>
                    <th className="px-1 sm:px-2 py-1 text-center text-[10px] sm:text-xs text-gray-500 w-8 sm:w-10">位</th>
                  </tr>
                </thead>
                <tbody>
                  {league.teams.map((team, rowIdx) => {
                    const standing = standings.find(s => s.teamId === team.teamId);
                    return (
                      <tr key={team.teamId} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="px-1.5 sm:px-2 py-1">
                          <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] sm:text-[10px] font-bold">{rowIdx + 1}</span>
                        </td>
                        <td className="px-1.5 sm:px-2 py-1">
                          <div className="text-[11px] sm:text-xs font-medium text-gray-800 leading-tight truncate">{team.male.name}</div>
                          <div className="text-[11px] sm:text-xs text-gray-500 leading-tight truncate">{team.female.name}</div>
                        </td>
                        <td className="px-1.5 sm:px-2 py-1">
                          <div className="text-[10px] sm:text-[11px] text-gray-400 leading-tight truncate">{team.male.affiliation}</div>
                          <div className="text-[10px] sm:text-[11px] text-gray-300 leading-tight truncate">{team.female.affiliation}</div>
                        </td>
                        {league.teams.map((colTeam, colIdx) => {
                          const cell = getCellDisplay(team.teamId, colTeam.teamId);
                          return (
                            <td
                              key={colIdx}
                              className={`px-0.5 sm:px-1 py-1 text-center text-[10px] sm:text-xs ${cell.color} ${cell.bg} border-l border-gray-100 transition-colors`}
                              onClick={() => {
                                if (team.teamId === colTeam.teamId) return;
                                const match = lMatches.find(m =>
                                  (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
                                  (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
                                );
                                if (match) onEditMatch(match);
                              }}
                            >
                              {cell.text || (team.teamId !== colTeam.teamId && <span className="text-gray-300 text-[9px]">-</span>)}
                            </td>
                          );
                        })}
                        <td className="px-1 sm:px-2 py-1 text-center text-[10px] sm:text-xs font-semibold text-gray-700 border-l border-gray-200">
                          {standing ? `${standing.wins}-${standing.losses}` : '-'}
                        </td>
                        <td className="px-1 sm:px-2 py-1 text-center border-l border-gray-200">
                          {/* 全試合完了時のみ順位表示 */}
                          {isComplete && standing && standing.rank > 0 && (
                            <span className={`inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[9px] sm:text-[10px] font-bold
                              ${standing.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                standing.rank === 2 ? 'bg-gray-200 text-gray-600' :
                                standing.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
                            `}>
                              {standing.rank}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
