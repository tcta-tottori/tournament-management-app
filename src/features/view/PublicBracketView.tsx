import { useMemo, useState } from 'react';
import { Trophy, Medal, Award, Users, Info } from 'lucide-react';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import type {
  PlacementCategory,
  PlacementBracket,
  BracketMatch,
} from '../mixed/types';
import type {
  TeamPlacementBracket,
  TeamBracketMatch,
} from '../team/types';

const CATEGORY_TABS: { id: PlacementCategory; label: string; icon: React.ElementType; color: string }[] = [
  { id: '1st', label: '1位', icon: Trophy, color: 'from-yellow-500 to-amber-600' },
  { id: '2nd', label: '2位', icon: Medal, color: 'from-gray-400 to-gray-500' },
  { id: '3rd', label: '3位', icon: Award, color: 'from-orange-400 to-orange-500' },
  { id: '4th', label: '4・5位', icon: Users, color: 'from-slate-400 to-slate-500' },
];

const LEAGUE_BADGE_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-purple-100 text-purple-700',
  D: 'bg-rose-100 text-rose-700',
  E: 'bg-amber-100 text-amber-700',
  F: 'bg-cyan-100 text-cyan-700',
  G: 'bg-lime-100 text-lime-700',
  H: 'bg-fuchsia-100 text-fuchsia-700',
  I: 'bg-emerald-100 text-emerald-700',
  J: 'bg-blue-100 text-blue-700',
  K: 'bg-purple-100 text-purple-700',
  L: 'bg-rose-100 text-rose-700',
  M: 'bg-amber-100 text-amber-700',
};

function getRoundLabel(round: number, total: number): string {
  if (round === total) return '決勝';
  if (round === total - 1) return '準決勝';
  if (round === total - 2) return '準々決勝';
  return `${round}回戦`;
}

/**
 * 決勝トーナメント公開ビュー
 */
export default function PublicBracketView() {
  const mixedImported = useMixedStore(s => s.isImported);
  const teamImported = useTeamStore(s => s.isImported);
  const mixedBrackets = useMixedStore(s => s.brackets);
  const teamBrackets = useTeamStore(s => s.brackets);

  const [category, setCategory] = useState<PlacementCategory>('1st');

  const brackets = mixedImported ? mixedBrackets : teamImported ? teamBrackets : [];
  const selected = brackets.find(b => b.category === category) || brackets[0];

  if (!selected) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
        <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">決勝トーナメントデータがまだありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map(t => {
          const isActive = (selected.category === t.id);
          const exists = brackets.some(b => b.category === t.id);
          return (
            <button
              key={t.id}
              disabled={!exists}
              onClick={() => exists && setCategory(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all border ${
                isActive
                  ? `bg-gradient-to-r ${t.color} text-white border-transparent shadow-sm`
                  : exists
                  ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}トーナメント
            </button>
          );
        })}
      </div>

      {mixedImported ? (
        <MixedBracketDisplay bracket={selected as PlacementBracket} />
      ) : (
        <TeamBracketDisplay bracket={selected as TeamPlacementBracket} />
      )}
    </div>
  );
}

// =========================================================================
// ミックス用ブラケット表示
// =========================================================================

function MixedBracketDisplay({ bracket }: { bracket: PlacementBracket }) {
  const allTeams = useMixedStore(s => s.allTeams);

  const totalRounds = Math.max(1, Math.log2(bracket.drawSize));
  const matchesByRound: BracketMatch[][] = useMemo(() => {
    const byRound: BracketMatch[][] = [];
    for (let r = 1; r <= totalRounds; r++) {
      byRound.push(bracket.matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
    }
    return byRound;
  }, [bracket, totalRounds]);

  const MATCH_HEIGHT = 110;
  const MATCH_WIDTH = 260;
  const ROUND_GAP = 36;
  const MATCH_GAP = 20;
  const GRID_UNIT = MATCH_HEIGHT + MATCH_GAP;

  const getMatchY = (roundIdx: number, matchIdx: number) => {
    const spacing = Math.pow(2, roundIdx);
    const offset = ((spacing - 1) * GRID_UNIT) / 2;
    return 36 + matchIdx * spacing * GRID_UNIT + offset + MATCH_HEIGHT / 2;
  };

  const r1count = matchesByRound[0]?.length || 0;
  const svgHeight = Math.max(200, r1count * GRID_UNIT + 36);
  const svgWidth = (MATCH_WIDTH + ROUND_GAP) * totalRounds;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
      <div className="relative" style={{ minWidth: svgWidth, height: svgHeight }}>
        {/* 接続線 */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: svgWidth, height: svgHeight }}>
          {matchesByRound.slice(0, -1).map((roundMatches, roundIdx) => {
            const x1 = roundIdx * (MATCH_WIDTH + ROUND_GAP) + MATCH_WIDTH;
            const x2 = (roundIdx + 1) * (MATCH_WIDTH + ROUND_GAP);
            const xMid = (x1 + x2) / 2;
            const pairs: React.ReactNode[] = [];
            for (let i = 0; i < roundMatches.length; i += 2) {
              if (i + 1 >= roundMatches.length) break;
              const y1 = getMatchY(roundIdx, i);
              const y2 = getMatchY(roundIdx, i + 1);
              const yNext = getMatchY(roundIdx + 1, Math.floor(i / 2));
              pairs.push(
                <g key={`l-${roundIdx}-${i}`}>
                  <line x1={x1} y1={y1} x2={xMid} y2={y1} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={x1} y1={y2} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={y1} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={yNext} x2={x2} y2={yNext} stroke="#c9cdd3" strokeWidth="1.5" />
                </g>
              );
            }
            return pairs;
          })}
        </svg>

        {matchesByRound.map((roundMatches, roundIdx) => {
          const round = roundIdx + 1;
          const colX = roundIdx * (MATCH_WIDTH + ROUND_GAP);
          return (
            <div key={round}>
              <div className="absolute" style={{ left: colX, top: 0, width: MATCH_WIDTH }}>
                <div className="text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                      round === totalRounds
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'
                        : round === totalRounds - 1
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {getRoundLabel(round, totalRounds)}
                  </span>
                </div>
              </div>

              {roundMatches.map((match, matchIdx) => {
                const centerY = getMatchY(roundIdx, matchIdx);
                const isBye = match.isBye;

                if (isBye) {
                  const winnerId = match.winnerId;
                  const winnerData = winnerId ? allTeams.find(t => t.teamId === winnerId) : null;
                  const winnerLeague =
                    winnerId === match.team1Id ? match.team1League : match.team2League;
                  const boxH = 48;
                  return (
                    <div
                      key={match.matchId}
                      className="absolute"
                      style={{ left: colX, top: centerY - boxH / 2, width: MATCH_WIDTH }}
                    >
                      <div
                        className="flex items-center gap-1.5 px-2 rounded-lg border border-gray-200 bg-white"
                        style={{ height: boxH }}
                      >
                        {winnerLeague && (
                          <span
                            className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              LEAGUE_BADGE_COLORS[winnerLeague.trim()] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {winnerLeague}
                          </span>
                        )}
                        {winnerData ? (
                          <span className="text-sm font-bold text-gray-800 truncate">
                            {winnerData.teamName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            {match.team1Name || match.team2Name || 'BYE'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                const w1 = match.winnerId === match.team1Id && match.winnerId != null;
                const w2 = match.winnerId === match.team2Id && match.winnerId != null;

                return (
                  <div
                    key={match.matchId}
                    className="absolute"
                    style={{
                      left: colX,
                      top: centerY - MATCH_HEIGHT / 2,
                      width: MATCH_WIDTH,
                    }}
                  >
                    <div
                      className={`rounded-lg border-2 overflow-hidden ${
                        match.status === 'playing'
                          ? 'border-green-400 shadow-md'
                          : match.status === 'finished'
                          ? 'border-emerald-300 shadow-sm'
                          : match.team1Id && match.team2Id
                          ? 'border-blue-300'
                          : 'border-gray-200'
                      }`}
                      style={{ height: MATCH_HEIGHT }}
                    >
                      <MixedSlot match={match} slot="team1" isWinner={w1} isLoser={match.winnerId !== null && !w1} />
                      <div className="border-t border-gray-100" />
                      <MixedSlot match={match} slot="team2" isWinner={w2} isLoser={match.winnerId !== null && !w2} />
                      {match.team1Id && match.team2Id && (
                        <div
                          className={`flex items-center justify-center text-[10px] font-medium border-t border-gray-100 py-0.5 ${
                            match.status === 'playing'
                              ? 'bg-green-50 text-green-700'
                              : match.status === 'finished'
                              ? 'bg-gray-50 text-gray-500'
                              : 'bg-amber-50/50 text-amber-600'
                          }`}
                        >
                          {match.status === 'playing' && (
                            <>
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                              試合中
                            </>
                          )}
                          {match.status === 'finished' && '試合終了'}
                          {match.status === 'waiting' && '待機中'}
                          {match.status === 'ready' && '準備完了'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MixedSlot({
  match,
  slot,
  isWinner,
  isLoser,
}: {
  match: BracketMatch;
  slot: 'team1' | 'team2';
  isWinner: boolean;
  isLoser: boolean;
}) {
  const teamId = slot === 'team1' ? match.team1Id : match.team2Id;
  const name = slot === 'team1' ? match.team1Name : match.team2Name;
  const league = slot === 'team1' ? match.team1League : match.team2League;
  const score = slot === 'team1' ? match.score1 : match.score2;
  const tb = match.tiebreakScore;

  const s1 = match.score1 ?? 0;
  const s2 = match.score2 ?? 0;
  let defLabel = '';
  if (match.winnerId && match.status === 'finished') {
    const w1 = match.winnerId === match.team1Id;
    const w2 = match.winnerId === match.team2Id;
    if (s1 === 0 && s2 === 0) {
      if ((slot === 'team2' && w1) || (slot === 'team1' && w2)) defLabel = 'W.O';
    } else if ((w1 && s1 < s2) || (w2 && s2 < s1)) {
      if ((slot === 'team2' && w1) || (slot === 'team1' && w2)) defLabel = 'Ret';
    }
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 min-h-[42px] ${
        isWinner ? 'bg-emerald-50' : 'bg-white'
      }`}
    >
      {league && (
        <span
          className={`shrink-0 rounded text-[9px] font-bold flex items-center justify-center w-5 h-5 ${
            LEAGUE_BADGE_COLORS[league.trim()] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {league}
        </span>
      )}
      <span
        className={`flex-1 truncate text-sm ${
          isWinner ? 'font-bold text-emerald-800' : 'text-gray-700'
        }`}
      >
        {teamId || name ? name || '―' : <span className="text-gray-300 text-xs">未配置</span>}
      </span>
      {defLabel ? (
        <span className={`font-mono font-bold text-xs shrink-0 ${defLabel === 'W.O' ? 'text-gray-400' : 'text-red-500'}`}>
          {defLabel}
        </span>
      ) : score !== null ? (
        <span
          className={`font-mono font-bold text-base shrink-0 ${
            isWinner ? 'text-emerald-600' : 'text-gray-500'
          }`}
        >
          {score}
          {isLoser && tb != null && (
            <span className="text-[9px] text-blue-500 align-super ml-0.5">({tb})</span>
          )}
        </span>
      ) : null}
    </div>
  );
}

// =========================================================================
// 団体戦用ブラケット表示
// =========================================================================

function TeamBracketDisplay({ bracket }: { bracket: TeamPlacementBracket }) {
  const totalRounds = Math.max(1, Math.log2(bracket.drawSize));
  const matchesByRound: TeamBracketMatch[][] = useMemo(() => {
    const byRound: TeamBracketMatch[][] = [];
    for (let r = 1; r <= totalRounds; r++) {
      byRound.push(bracket.matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
    }
    return byRound;
  }, [bracket, totalRounds]);

  const MATCH_HEIGHT = 110;
  const MATCH_WIDTH = 260;
  const ROUND_GAP = 36;
  const MATCH_GAP = 20;
  const GRID_UNIT = MATCH_HEIGHT + MATCH_GAP;

  const getMatchY = (roundIdx: number, matchIdx: number) => {
    const spacing = Math.pow(2, roundIdx);
    const offset = ((spacing - 1) * GRID_UNIT) / 2;
    return 36 + matchIdx * spacing * GRID_UNIT + offset + MATCH_HEIGHT / 2;
  };

  const r1count = matchesByRound[0]?.length || 0;
  const svgHeight = Math.max(200, r1count * GRID_UNIT + 36);
  const svgWidth = (MATCH_WIDTH + ROUND_GAP) * totalRounds;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
      <div className="relative" style={{ minWidth: svgWidth, height: svgHeight }}>
        <svg className="absolute inset-0 pointer-events-none" style={{ width: svgWidth, height: svgHeight }}>
          {matchesByRound.slice(0, -1).map((roundMatches, roundIdx) => {
            const x1 = roundIdx * (MATCH_WIDTH + ROUND_GAP) + MATCH_WIDTH;
            const x2 = (roundIdx + 1) * (MATCH_WIDTH + ROUND_GAP);
            const xMid = (x1 + x2) / 2;
            const pairs: React.ReactNode[] = [];
            for (let i = 0; i < roundMatches.length; i += 2) {
              if (i + 1 >= roundMatches.length) break;
              const y1 = getMatchY(roundIdx, i);
              const y2 = getMatchY(roundIdx, i + 1);
              const yNext = getMatchY(roundIdx + 1, Math.floor(i / 2));
              pairs.push(
                <g key={`tl-${roundIdx}-${i}`}>
                  <line x1={x1} y1={y1} x2={xMid} y2={y1} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={x1} y1={y2} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={y1} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={yNext} x2={x2} y2={yNext} stroke="#c9cdd3" strokeWidth="1.5" />
                </g>
              );
            }
            return pairs;
          })}
        </svg>

        {matchesByRound.map((roundMatches, roundIdx) => {
          const round = roundIdx + 1;
          const colX = roundIdx * (MATCH_WIDTH + ROUND_GAP);
          return (
            <div key={round}>
              <div className="absolute" style={{ left: colX, top: 0, width: MATCH_WIDTH }}>
                <div className="text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                      round === totalRounds
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'
                        : round === totalRounds - 1
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {getRoundLabel(round, totalRounds)}
                  </span>
                </div>
              </div>

              {roundMatches.map((match, matchIdx) => {
                const centerY = getMatchY(roundIdx, matchIdx);
                const isBye = match.isBye;
                if (isBye) {
                  const winnerLeague =
                    match.winnerId === match.team1Id ? match.team1League : match.team2League;
                  const winnerName =
                    match.winnerId === match.team1Id ? match.team1Name : match.team2Name;
                  return (
                    <div
                      key={match.matchId}
                      className="absolute"
                      style={{ left: colX, top: centerY - 24, width: MATCH_WIDTH }}
                    >
                      <div className="flex items-center gap-1.5 px-2 rounded-lg border border-gray-200 bg-white h-12">
                        {winnerLeague && (
                          <span
                            className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              LEAGUE_BADGE_COLORS[winnerLeague.trim()] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {winnerLeague}
                          </span>
                        )}
                        {winnerName ? (
                          <span className="text-sm font-bold text-gray-800 truncate">{winnerName}</span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">BYE</span>
                        )}
                      </div>
                    </div>
                  );
                }

                const w1 = match.winnerId === match.team1Id && match.winnerId != null;
                const w2 = match.winnerId === match.team2Id && match.winnerId != null;

                return (
                  <div
                    key={match.matchId}
                    className="absolute"
                    style={{ left: colX, top: centerY - MATCH_HEIGHT / 2, width: MATCH_WIDTH }}
                  >
                    <div
                      className={`rounded-lg border-2 overflow-hidden ${
                        match.status === 'playing'
                          ? 'border-green-400 shadow-md'
                          : match.status === 'finished'
                          ? 'border-emerald-300 shadow-sm'
                          : match.team1Id && match.team2Id
                          ? 'border-blue-300'
                          : 'border-gray-200'
                      }`}
                      style={{ height: MATCH_HEIGHT }}
                    >
                      <TeamSlot match={match} slot="team1" isWinner={w1} />
                      <div className="border-t border-gray-100" />
                      <TeamSlot match={match} slot="team2" isWinner={w2} />
                      {match.team1Id && match.team2Id && (
                        <div
                          className={`flex items-center justify-center text-[10px] font-medium border-t border-gray-100 py-0.5 ${
                            match.status === 'playing'
                              ? 'bg-green-50 text-green-700'
                              : match.status === 'finished'
                              ? 'bg-gray-50 text-gray-500'
                              : 'bg-amber-50/50 text-amber-600'
                          }`}
                        >
                          {match.status === 'playing' && (
                            <>
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                              試合中
                            </>
                          )}
                          {match.status === 'finished' && '試合終了'}
                          {match.status === 'waiting' && '待機中'}
                          {match.status === 'ready' && '準備完了'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamSlot({
  match,
  slot,
  isWinner,
}: {
  match: TeamBracketMatch;
  slot: 'team1' | 'team2';
  isWinner: boolean;
}) {
  const teamId = slot === 'team1' ? match.team1Id : match.team2Id;
  const name = slot === 'team1' ? match.team1Name : match.team2Name;
  const league = slot === 'team1' ? match.team1League : match.team2League;
  const wins = slot === 'team1' ? match.winsTeam1 : match.winsTeam2;
  const showScore = match.status === 'finished' || match.status === 'playing';

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 min-h-[42px] ${
        isWinner ? 'bg-emerald-50' : 'bg-white'
      }`}
    >
      {league && (
        <span
          className={`shrink-0 rounded text-[9px] font-bold flex items-center justify-center w-5 h-5 ${
            LEAGUE_BADGE_COLORS[league.trim()] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {league}
        </span>
      )}
      <span
        className={`flex-1 truncate text-sm ${
          isWinner ? 'font-bold text-emerald-800' : 'text-gray-700'
        }`}
      >
        {teamId || name ? name || '―' : <span className="text-gray-300 text-xs">未配置</span>}
      </span>
      {showScore && (
        <span
          className={`font-mono font-bold text-base shrink-0 ${
            isWinner ? 'text-emerald-600' : 'text-gray-500'
          }`}
        >
          {wins}
        </span>
      )}
    </div>
  );
}
