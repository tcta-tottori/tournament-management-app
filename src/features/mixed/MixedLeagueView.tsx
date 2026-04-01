import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Circle, Play, MapPin, Pencil, Maximize2, X, BookOpen, FlaskConical } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { LeagueMatchScore } from './types';
import { calculateLeagueStandings } from './mixedLogic';
import MixedScoreInput from './MixedScoreInput';
import { GameRatioCell } from './GameRatioCell';

/** リーグバッジカラー (エントリーページと統一) */
const LEAGUE_COLORS = [
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', header: 'from-emerald-500 to-teal-600' },
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', header: 'from-blue-500 to-indigo-600' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', header: 'from-purple-500 to-violet-600' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700', header: 'from-rose-500 to-pink-600' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', header: 'from-amber-500 to-orange-600' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', header: 'from-cyan-500 to-sky-600' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-700', header: 'from-lime-500 to-green-600' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-700', header: 'from-fuchsia-500 to-purple-600' },
];

export default function MixedLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId, updateCourtName, tournamentInfo, fillAllScoresForTest } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<LeagueMatchScore | null>(null);
  const [editingCourt, setEditingCourt] = useState(false);
  const [courtNameInput, setCourtNameInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  if (!selectedLeague) return <div className="text-center text-gray-400 py-12">データがありません</div>;

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  // Determine current match: first unfinished match in matchOrder
  const currentMatchNumber = useMemo(() => {
    for (const mo of selectedLeague.matchOrder) {
      const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
      if (!match || match.status !== 'finished') return mo.matchNumber;
    }
    return null;
  }, [selectedLeague.matchOrder, leagueMatchList]);

  const currentMatch = currentMatchNumber ? leagueMatchList.find(m => m.matchNumber === currentMatchNumber) : null;
  const currentMatchTeam1 = currentMatch ? selectedLeague.teams.find(t => t.teamId === currentMatch.team1Id) : null;
  const currentMatchTeam2 = currentMatch ? selectedLeague.teams.find(t => t.teamId === currentMatch.team2Id) : null;

  // Score matrix
  const scoreMatrix = new Map<string, LeagueMatchScore>();
  for (const m of leagueMatchList) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  const getMatchBetween = (team1Id: string, team2Id: string): LeagueMatchScore | undefined => {
    return scoreMatrix.get(`${team1Id}-${team2Id}`);
  };

  const getCellDisplay = (rowTeamId: string, colTeamId: string): { text: string; color: string; bg: string; isCurrent: boolean } => {
    if (rowTeamId === colTeamId) return { text: '__DIAG__', color: '', bg: 'bg-gray-100', isCurrent: false };
    const match = getMatchBetween(rowTeamId, colTeamId);

    // Check if this cell corresponds to the current match
    const isCurrent = !!currentMatch && !!match && (
      (match.team1Id === currentMatch.team1Id && match.team2Id === currentMatch.team2Id) ||
      (match.team1Id === currentMatch.team2Id && match.team2Id === currentMatch.team1Id)
    );

    if (!match || match.status !== 'finished') {
      return {
        text: '',
        color: 'text-gray-400',
        bg: `bg-white hover:bg-emerald-50 cursor-pointer ${isCurrent ? 'league-match-blink' : ''}`,
        isCurrent
      };
    }

    const isTeam1 = match.team1Id === rowTeamId;
    const myScore = isTeam1 ? match.score1 : match.score2;
    const oppScore = isTeam1 ? match.score2 : match.score1;
    const won = match.winnerId === rowTeamId;

    // DEF display: if scores are both 0 or null-like with a winner
    const isDef = match.winnerId && (match.score1 === 0 && match.score2 === 0);

    return {
      text: isDef ? (won ? 'DEF勝' : 'DEF負') : `${myScore}-${oppScore}`,
      color: won ? 'text-emerald-700 font-bold' : 'text-red-600',
      bg: `${won ? 'bg-emerald-50' : 'bg-red-50'} cursor-pointer`,
      isCurrent: false,
    };
  };

  const scoreMatrixTable = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
            <th className="px-3 py-2 text-left text-xs text-gray-500 w-8">#</th>
            <th className="px-3 py-2 text-left text-xs text-gray-500">ペア名 / 所属</th>
            {selectedLeague.teams.map((_, i) => (
              <th key={i} className="px-2 py-2 text-center text-xs text-gray-500 w-20">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  {i + 1}
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-center text-xs text-gray-500 w-16">勝敗</th>
            <th className="px-2 py-2 text-center text-xs text-gray-500 w-20">ゲーム率</th>
            <th className="px-3 py-2 text-center text-xs text-gray-500 w-12">順位</th>
          </tr>
        </thead>
        <tbody>
          {selectedLeague.teams.map((team, rowIdx) => {
            const standing = standings.find(s => s.teamId === team.teamId);
            return (
              <tr key={team.teamId} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <div className="flex flex-col items-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full text-sm font-bold">
                      {rowIdx + 1}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 mt-0.5">No.{team.pairNumber}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center">
                    <div className="shrink-0" style={{ width: 120 }}>
                      <div className="text-sm font-bold text-gray-800"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{team.male.name.replace(/[\s\u3000]+/g, '')}</span></div>
                      <div className="text-sm font-bold text-gray-800"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{team.female.name.replace(/[\s\u3000]+/g, '')}</span></div>
                    </div>
                    <div className="w-px h-8 bg-gray-200 mx-2 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 truncate">{team.male.affiliation}</div>
                      <div className="text-xs text-gray-400 truncate">{team.female.affiliation}</div>
                    </div>
                  </div>
                </td>
                {selectedLeague.teams.map((colTeam, colIdx) => {
                  const cell = getCellDisplay(team.teamId, colTeam.teamId);
                  return (
                    <td
                      key={colIdx}
                      className={`px-2 py-2 text-center text-sm ${cell.color} ${cell.bg} border-l border-gray-100 transition-colors ${cell.text === '__DIAG__' ? 'relative' : ''}`}
                      onClick={() => {
                        if (team.teamId === colTeam.teamId) return;
                        const forwardMatch = leagueMatchList.find(m =>
                          (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
                          (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
                        );
                        if (forwardMatch) setEditingMatch(forwardMatch);
                      }}
                    >
                      {cell.text === '__DIAG__' ? (
                        <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none"><line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1" /></svg>
                      ) : (cell.text || (team.teamId !== colTeam.teamId && (
                        <span className="text-gray-300 text-xs">未入力</span>
                      )))}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center text-sm font-semibold text-gray-700 border-l border-gray-200">
                  {standing ? `${standing.wins}-${standing.losses}` : '-'}
                </td>
                <td className="px-2 py-2 text-center text-xs font-mono text-gray-600 border-l border-gray-200">
                  {standing ? <GameRatioCell gamesWon={standing.gamesWon} gamesLost={standing.gamesLost} /> : '-'}
                </td>
                <td className="px-3 py-2 text-center border-l border-gray-200">
                  {standing && standing.rank > 0 && (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold
                        ${standing.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          standing.rank === 2 ? 'bg-gray-200 text-gray-600' :
                          standing.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
                      `}>
                        {standing.rank}
                      </span>
                      {standing.tiebreakReason && (
                        <span className="text-[9px] text-gray-400 whitespace-nowrap leading-tight">{standing.tiebreakReason}</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* Blink animation style */}
      <style>{`
        @keyframes league-match-highlight {
          0%, 100% { background-color: rgba(253, 224, 71, 0.25); }
          50% { background-color: rgba(253, 224, 71, 0.65); }
        }
        .league-match-blink {
          animation: league-match-highlight 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Left sidebar: league list */}
      <div className="w-48 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
        <div className="p-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700">リーグ一覧</h3>
        </div>
        <div className="p-2 space-y-1">
          {leagues.map((league, leagueIdx) => {
            const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
            const lFinished = lMatches.filter(m => m.status === 'finished').length;
            const lTotal = lMatches.length;
            const isComplete = lFinished === lTotal && lTotal > 0;
            const isActive = league.leagueId === selectedLeague.leagueId;
            const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];

            return (
              <button
                key={league.leagueId}
                onClick={() => setSelectedLeagueId(league.leagueId)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${isActive
                    ? `bg-gradient-to-r ${colors.from} ${colors.to} text-white shadow-md`
                    : 'hover:bg-gray-100 text-gray-700'
                  }
                `}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${isActive ? 'bg-white/20' : isComplete ? `${colors.badge}` : 'bg-gray-100 text-gray-500'}
                `}>
                  {isComplete ? <Check size={12} /> : league.leagueId.trim()}
                </div>
                <span className="flex-1 text-left font-medium">{league.leagueId.trim()}リーグ</span>
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  {lFinished}/{lTotal}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* League header */}
        {(() => {
          const _lidx = Math.max(0, leagues.findIndex(l => l.leagueId === selectedLeague.leagueId));
          const _lc = LEAGUE_COLORS[_lidx % LEAGUE_COLORS.length];
          return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className={`bg-gradient-to-r ${_lc.header} text-white px-4 py-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-lg font-bold">
                  {selectedLeague.leagueId.trim()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{selectedLeague.leagueId.trim()}リーグ</h2>
                  {editingCourt ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        type="text"
                        value={courtNameInput}
                        onChange={e => setCourtNameInput(e.target.value)}
                        onBlur={() => { updateCourtName(selectedLeague.leagueId, courtNameInput); setEditingCourt(false); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateCourtName(selectedLeague.leagueId, courtNameInput); setEditingCourt(false); }
                          if (e.key === 'Escape') setEditingCourt(false);
                        }}
                        className="px-2 py-0.5 text-sm border border-white/30 bg-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:bg-white/30 w-32"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCourt(true); setCourtNameInput(selectedLeague.courtName); }}
                      className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors mt-0.5"
                    >
                      <MapPin size={11} />
                      {selectedLeague.courtName || '(未設定)'}
                      <Pencil size={9} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tournamentInfo?.rules && tournamentInfo.rules.length > 0 && (
                  <button onClick={() => setShowRules(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] bg-white/15 rounded-lg hover:bg-white/25 transition-colors">
                    <BookOpen size={12} />
                    ルール
                  </button>
                )}
                {leagueMatches.some(m => m.status !== 'finished') && (
                  <button
                    onClick={() => { if (confirm('テスト用：全ての予選リーグ未完了試合を6-4で入力しますか？')) fillAllScoresForTest(); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] bg-white/15 rounded-lg hover:bg-white/25 transition-colors"
                  >
                    <FlaskConical size={12} />
                    テスト6-4
                  </button>
                )}
                <button onClick={() => setIsFullscreen(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] bg-white/15 rounded-lg hover:bg-white/25 transition-colors">
                  <Maximize2 size={12} />
                  全画面
                </button>
                <div className="text-right">
                  <div className="text-sm font-bold">{finishedCount}/{totalCount}</div>
                  <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
          );
        })()}

        {/* Score matrix table */}
        {scoreMatrixTable}

        {/* Match order */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">対戦順</h3>
          <div className="flex flex-wrap gap-2">
            {selectedLeague.matchOrder.map(mo => {
              const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
              const isFinished = match?.status === 'finished';
              const isPlaying = match?.status === 'playing';
              const isCurrent = mo.matchNumber === currentMatchNumber;
              return (
                <button
                  key={mo.matchNumber}
                  onClick={() => match && setEditingMatch(match)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border
                    ${isFinished
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isPlaying
                        ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
                        : isCurrent
                          ? 'bg-yellow-200 text-yellow-800 font-bold border-yellow-300 league-match-blink'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }
                  `}
                >
                  {isCurrent && !isFinished && <span className="text-yellow-700">▶</span>}
                  <span className="font-mono text-xs">第{mo.matchNumber}試合</span>
                  <span className="font-bold">
                    {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-{String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                  </span>
                  {isFinished && match && (
                    <span className="text-xs ml-1">({match.score1}-{match.score2})</span>
                  )}
                  {isFinished ? <Check size={14} /> : isPlaying ? <Play size={14} /> : <Circle size={14} />}
                </button>
              );
            })}
          </div>

          {/* Current match indicator */}
          {currentMatch && currentMatchNumber && (
            <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              現在: 第{currentMatchNumber}試合（{currentMatchTeam1?.teamName || '?'} vs {currentMatchTeam2?.teamName || '?'}）{finishedCount}/{totalCount} 完了
            </div>
          )}
        </div>

        {/* Standings table */}
        {standings.length > 0 && finishedCount > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">暫定順位</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-2 text-center w-10">順位</th>
                  <th className="py-2 px-2 text-left">ペア名</th>
                  <th className="py-2 px-2 text-center w-16">勝敗</th>
                  <th className="py-2 px-2 text-center w-16">取得G</th>
                  <th className="py-2 px-2 text-center w-16">失G</th>
                  <th className="py-2 px-2 text-center w-20">ゲーム率</th>
                  <th className="py-2 px-2 text-left w-28">判定理由</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.teamId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                        ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-200 text-gray-600'}
                      `}>
                        {s.rank}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-800">{s.teamName}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-700">{s.wins}-{s.losses}</td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-600">{s.gamesWon}</td>
                    <td className="py-2 px-2 text-center font-mono text-red-500">{s.gamesLost}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-600">
                      <GameRatioCell gamesWon={s.gamesWon} gamesLost={s.gamesLost} />
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-400">
                      {s.tiebreakReason || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Score input dialog */}
      {editingMatch && (
        <MixedScoreInput
          match={editingMatch}
          teams={selectedLeague.teams}
          onClose={() => setEditingMatch(null)}
        />
      )}

      {/* Rules popup */}
      {showRules && tournamentInfo?.rules && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowRules(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-w-[95vw] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <BookOpen size={16} />
                大会ルール
              </h3>
              <button onClick={() => setShowRules(false)} className="p-1 hover:bg-white/20 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <ul className="space-y-2">
                {tournamentInfo.rules.map((rule, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-amber-500 flex-shrink-0">&#x25CF;</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fullscreen portal (mobile) */}
      {isFullscreen && createPortal(
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <h3 className="font-bold text-sm">
              {selectedLeague.leagueId.trim()}リーグ {selectedLeague.courtName && `(${selectedLeague.courtName})`}
            </h3>
            <button onClick={() => setIsFullscreen(false)} className="p-1.5 hover:bg-white/20 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div style={{ transform: 'rotate(0deg)', minWidth: '100%' }}>
              {scoreMatrixTable}
            </div>
            {/* Current match info in fullscreen */}
            {currentMatch && currentMatchNumber && (
              <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                現在: 第{currentMatchNumber}試合（{currentMatchTeam1?.teamName || '?'} vs {currentMatchTeam2?.teamName || '?'}）{finishedCount}/{totalCount} 完了
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
