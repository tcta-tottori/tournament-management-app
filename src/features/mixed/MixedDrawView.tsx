import { useState } from 'react';
import { Check, MapPin, Pencil, Info, FlaskConical } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedScoreInput from './MixedScoreInput';
import type { LeagueMatchScore } from './types';
import { GameRatioCell } from './GameRatioCell';

/** リーグバッジカラー (エントリーページと統一) */
const LEAGUE_COLORS = [
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-700' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-700' },
];

/** 名前を5文字幅基準でスペース調整して表示 */
function AlignedName({ name }: { name: string }) {
  // 姓と名の間のスペースを調整して全体を5文字幅程度に揃える
  const parts = name.split(/[\s\u3000]+/);
  if (parts.length >= 2) {
    const sei = parts[0];
    const mei = parts.slice(1).join('');
    const totalLen = sei.length + mei.length;
    // 5文字基準: 合計が少ないほどスペースを広げる
    const gapClass = totalLen <= 3 ? 'gap-[1em]' : totalLen <= 4 ? 'gap-[0.5em]' : 'gap-[0.25em]';
    return <span className={`inline-flex ${gapClass}`}><span>{sei}</span><span>{mei}</span></span>;
  }
  return <span>{name}</span>;
}

export default function MixedDrawView() {
  const { leagues, leagueMatches, fillAllScoresForTest } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<LeagueMatchScore | null>(null);
  const [clickY, setClickY] = useState<number | undefined>(undefined);

  const handleEditMatch = (m: LeagueMatchScore, e?: React.MouseEvent) => {
    setClickY(e?.clientY);
    setEditingMatch(m);
  };

  const hasUnfinished = leagueMatches.some(m => m.status !== 'finished');

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* テストボタン */}
      {hasUnfinished && (
        <div className="flex justify-end">
          <button
            onClick={() => { if (confirm('テスト用：全ての予選リーグ未完了試合を6-4で入力しますか？')) fillAllScoresForTest(); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-white text-purple-600 border border-purple-200 hover:bg-purple-50 hover:border-purple-300 transition-all active:scale-95 shadow-sm"
          >
            <FlaskConical size={14} />
            テスト: 全6-4入力
          </button>
        </div>
      )}

      <AllLeaguesView onEditMatch={handleEditMatch} />

      {editingMatch && (
        <MixedScoreInput
          match={editingMatch}
          teams={leagues.find(l => l.leagueId === editingMatch.leagueId)?.teams || []}
          onClose={() => setEditingMatch(null)}
          anchorY={clickY}
        />
      )}
    </div>
  );
}

/** タイブレークスコアの表示テキストを生成 */
function formatScoreText(match: LeagueMatchScore, rowTeamId: string): string {
  const isTeam1 = match.team1Id === rowTeamId;
  const myScore = isTeam1 ? match.score1 : match.score2;
  const oppScore = isTeam1 ? match.score2 : match.score1;
  const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);

  if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
    if (won) {
      return `${myScore}-${oppScore}(${match.tiebreakScore})`;
    } else {
      return `(${match.tiebreakScore})${myScore}-${oppScore}`;
    }
  }
  return `${myScore}-${oppScore}`;
}

/** 全リーグ一覧表示 */
function AllLeaguesView({ onEditMatch }: { onEditMatch: (m: LeagueMatchScore, e?: React.MouseEvent) => void }) {
  const { leagues, leagueMatches, updateCourtName } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  return (
    <>
      {/* 点滅アニメーション */}
      <style>{`
        @keyframes cell-blink {
          0%, 100% { background-color: rgba(253, 224, 71, 0.2); }
          50% { background-color: rgba(253, 224, 71, 0.6); }
        }
        .cell-blink { animation: cell-blink 1.5s ease-in-out infinite; }
        @keyframes badge-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .badge-blink { animation: badge-blink 1.5s ease-in-out infinite; }
      `}</style>

      <div className="space-y-4">
        {leagues.map((league, leagueIdx) => {
          const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finishedCount = lMatches.filter(m => m.status === 'finished').length;
          const totalCount = lMatches.length;
          const standings = allStandings.get(league.leagueId) || [];
          const isComplete = finishedCount === totalCount && totalCount > 0;
          const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];
          const hasTiebreak = standings.some(s => s.tiebreakReason);

          // 現在の対戦を特定
          const currentMatchNumber = (() => {
            for (const mo of league.matchOrder) {
              const match = lMatches.find(m => m.matchNumber === mo.matchNumber);
              if (!match || match.status !== 'finished') return mo.matchNumber;
            }
            return null;
          })();
          const currentMatch = currentMatchNumber ? lMatches.find(m => m.matchNumber === currentMatchNumber) : null;

          const scoreMatrix = new Map<string, LeagueMatchScore>();
          for (const m of lMatches) {
            scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
            scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
          }

          const isCellCurrent = (team1Id: string, team2Id: string) => {
            if (!currentMatch) return false;
            return (
              (currentMatch.team1Id === team1Id && currentMatch.team2Id === team2Id) ||
              (currentMatch.team1Id === team2Id && currentMatch.team2Id === team1Id)
            );
          };

          const getCellDisplay = (rowTeamId: string, colTeamId: string) => {
            if (rowTeamId === colTeamId) return { text: '―', color: 'text-gray-300', bg: 'bg-gray-50' };
            const match = scoreMatrix.get(`${rowTeamId}-${colTeamId}`);
            const current = isCellCurrent(rowTeamId, colTeamId);
            if (!match || match.status !== 'finished') {
              return { text: '', color: '', bg: current ? 'cell-blink cursor-pointer' : 'bg-white hover:bg-emerald-50 cursor-pointer' };
            }
            const isTeam1 = match.team1Id === rowTeamId;
            const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
            return {
              text: formatScoreText(match, rowTeamId),
              color: won ? 'text-emerald-700 font-bold' : 'text-red-600',
              bg: won ? 'bg-emerald-50 cursor-pointer' : 'bg-red-50 cursor-pointer',
            };
          };

          return (
            <div key={league.leagueId} className={`bg-white rounded-xl shadow-sm border ${colors.border} overflow-hidden`}>
              {/* リーグヘッダー */}
              <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r ${colors.light} border-b ${colors.border}`}>
                <span className={`w-8 h-8 bg-gradient-to-br ${colors.from} ${colors.to} text-white text-sm font-bold rounded-lg flex items-center justify-center shadow shrink-0`}>
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
                      className={`h-full bg-gradient-to-r ${colors.from} ${colors.to} rounded-full transition-all`}
                      style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 対戦マトリックス — scrollbar-thin */}
              <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
                <table className="w-full text-xs sm:text-sm" style={{ minWidth: league.teams.length >= 5 ? 680 : 540 }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-6">#</th>
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-[120px] sm:w-[150px]">ペア名</th>
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-[80px] sm:w-[100px]">所属</th>
                      {league.teams.map((_, i) => (
                        <th key={i} className="px-0.5 sm:px-1 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-12 sm:w-[60px]">
                          <span className={`inline-flex items-center justify-center w-5 h-5 ${colors.badge} rounded-full text-[10px] font-bold`}>{i + 1}</span>
                        </th>
                      ))}
                      <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-10 sm:w-14">勝敗</th>
                      <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-8 sm:w-10">位</th>
                      {isComplete && hasTiebreak && (
                        <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-20 sm:w-28">判定</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {league.teams.map((team, rowIdx) => {
                      const standing = standings.find(s => s.teamId === team.teamId);
                      return (
                        <tr key={team.teamId} className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="px-1.5 sm:px-2 py-1.5">
                            <span className={`inline-flex items-center justify-center w-5 h-5 ${colors.badge} rounded-full text-[10px] font-bold`}>{rowIdx + 1}</span>
                          </td>
                          <td className="px-1.5 sm:px-2 py-1.5 w-[120px] sm:w-[150px]">
                            <div className="text-[11px] sm:text-xs font-bold text-gray-800 leading-tight"><AlignedName name={team.male.name} /></div>
                            <div className="text-[11px] sm:text-xs font-bold text-gray-800 leading-tight"><AlignedName name={team.female.name} /></div>
                          </td>
                          <td className="px-1.5 sm:px-2 py-1.5 w-[80px] sm:w-[100px]">
                            <div className="text-[10px] sm:text-[11px] text-gray-400 leading-tight truncate">{team.male.affiliation}</div>
                            <div className="text-[10px] sm:text-[11px] text-gray-400 leading-tight truncate">{team.female.affiliation}</div>
                          </td>
                          {league.teams.map((colTeam, colIdx) => {
                            const cell = getCellDisplay(team.teamId, colTeam.teamId);
                            return (
                              <td
                                key={colIdx}
                                className={`px-0.5 sm:px-1 py-1.5 text-center text-[9px] sm:text-[11px] ${cell.color} ${cell.bg} border-l border-gray-100 transition-colors whitespace-nowrap`}
                                onClick={e => {
                                  if (team.teamId === colTeam.teamId) return;
                                  const match = lMatches.find(m =>
                                    (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
                                    (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
                                  );
                                  if (match) onEditMatch(match, e);
                                }}
                              >
                                {cell.text || (team.teamId !== colTeam.teamId && <span className="text-gray-300 text-[9px]">-</span>)}
                              </td>
                            );
                          })}
                          <td className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold text-gray-700 border-l border-gray-200">
                            {standing ? `${standing.wins}-${standing.losses}` : '-'}
                          </td>
                          <td className="px-1 sm:px-2 py-1.5 text-center border-l border-gray-200">
                            {isComplete && standing && standing.rank > 0 && (
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
                                ${standing.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                  standing.rank === 2 ? 'bg-gray-200 text-gray-600' :
                                  standing.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
                              `}>
                                {standing.rank}
                              </span>
                            )}
                          </td>
                          {isComplete && hasTiebreak && (
                            <td className="px-1 sm:px-2 py-1.5 text-center border-l border-gray-200">
                              {standing?.tiebreakReason && (
                                standing.tiebreakReason.startsWith('ゲーム率') ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <Info size={9} className="shrink-0" />
                                    <GameRatioCell gamesWon={standing.gamesWon} gamesLost={standing.gamesLost} className="text-[9px] sm:text-[10px]" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <Info size={9} className="shrink-0" />
                                    {standing.tiebreakReason}
                                  </span>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 対戦順 */}
              {league.matchOrder.length > 0 && (
                <div className={`px-3 py-2 bg-gradient-to-r ${colors.light} border-t ${colors.border}`}>
                  <div className="text-[10px] font-bold text-gray-500 mb-1">対戦順</div>
                  <div className="flex flex-wrap gap-1">
                    {league.matchOrder.map(mo => {
                      const match = lMatches.find(m => m.matchNumber === mo.matchNumber);
                      const isFinished = match?.status === 'finished';
                      const isCurrent = mo.matchNumber === currentMatchNumber;
                      return (
                        <span
                          key={mo.matchNumber}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${isFinished ? `${colors.badge}` :
                              isCurrent ? 'bg-yellow-200 text-yellow-800 font-bold badge-blink' :
                              'bg-white text-gray-400 border border-gray-200'}
                          `}
                        >
                          {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-{String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                          {isFinished && match && <span className="text-[9px] ml-0.5 opacity-70">({match.score1}-{match.score2})</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
