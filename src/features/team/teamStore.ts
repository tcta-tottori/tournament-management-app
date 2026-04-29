import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding,
  TeamPlacementBracket, PlacementCategory, TeamBracketMatch,
  TeamPhase, TeamTournamentInfo, ExcelSheetData, SubMatchScore,
  MatchType, BracketSubMatchScore, TeamMember, TiebreakRuleId
} from './types';
import { calculateTeamStandings, generateAllBrackets, regenerateLeagueMatches, determineTeamWinner, MATCH_TYPE_ORDER, DEFAULT_TIEBREAK_ORDER } from './teamLogic';

/**
 * ブラケット再構築用ヘルパ。slotsArray と byePositions から R1 のマッチを組み、
 * BYE分は次ラウンドへ自動進出させた状態の bracket オブジェクトを返す。
 * excludeTeamIds を渡すと、そのチームをこのブラケットの teams からも除外する
 * （他ブラケットへ移籍したチームの後始末用）。
 */
function rebuildBracketObject(
  bracket: TeamPlacementBracket,
  slotsArray: (string | null)[],
  byePositions: Set<number> | undefined,
  allTeams: TeamEntry[],
  excludeTeamIds?: Set<string>,
): TeamPlacementBracket {
  const drawSize = slotsArray.length;
  const totalRounds = Math.log2(drawSize);
  const matches: TeamBracketMatch[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = drawSize / Math.pow(2, round);
    for (let pos = 1; pos <= matchesInRound; pos++) {
      const matchId = `bracket-${bracket.category}-R${round}-${pos}`;
      const nextRound = round + 1;
      const nextPos = Math.ceil(pos / 2);
      const nextMatchId = round < totalRounds ? `bracket-${bracket.category}-R${nextRound}-${nextPos}` : null;
      const nextSlot = pos % 2 === 1 ? 'team1' as const : 'team2' as const;
      matches.push({
        matchId, category: bracket.category, round, position: pos,
        team1Id: null, team2Id: null, team1Name: '', team2Name: '',
        team1League: '', team2League: '',
        subMatches: MATCH_TYPE_ORDER.map(type => ({ type, score1: null, score2: null, tiebreakScore: null, winnerId: null })),
        winsTeam1: 0, winsTeam2: 0,
        winnerId: null, status: 'waiting' as const, isBye: false,
        nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
      });
    }
  }

  const r1 = matches.filter(m => m.round === 1);
  for (let i = 0; i < r1.length; i++) {
    const tid1 = slotsArray[i * 2];
    const tid2 = slotsArray[i * 2 + 1];
    const t1 = tid1 ? allTeams.find(t => t.teamId === tid1) : null;
    const t2 = tid2 ? allTeams.find(t => t.teamId === tid2) : null;
    if (t1) { r1[i].team1Id = t1.teamId; r1[i].team1Name = t1.teamName; r1[i].team1League = t1.leagueId; }
    if (t2) { r1[i].team2Id = t2.teamId; r1[i].team2Name = t2.teamName; r1[i].team2League = t2.leagueId; }
    const s1IsBye = byePositions ? byePositions.has(i * 2) : !tid1;
    const s2IsBye = byePositions ? byePositions.has(i * 2 + 1) : !tid2;
    if (r1[i].team1Id && !r1[i].team2Id && s2IsBye) {
      r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team1Id; r1[i].team2Name = 'BYE';
    } else if (!r1[i].team1Id && r1[i].team2Id && s1IsBye) {
      r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team2Id; r1[i].team1Name = 'BYE';
    } else if (r1[i].team1Id && r1[i].team2Id) {
      r1[i].status = 'ready';
    }
  }

  for (const m of r1) {
    if (m.isBye && m.winnerId && m.nextMatchId) {
      const next = matches.find(nm => nm.matchId === m.nextMatchId);
      if (next) {
        const team = allTeams.find(t => t.teamId === m.winnerId);
        if (m.nextSlot === 'team1') {
          next.team1Id = m.winnerId; next.team1Name = team?.teamName || ''; next.team1League = team?.leagueId || '';
        } else {
          next.team2Id = m.winnerId; next.team2Name = team?.teamName || ''; next.team2League = team?.leagueId || '';
        }
        if (next.team1Id && next.team2Id) next.status = 'ready';
      }
    }
  }

  const assignedTeams = slotsArray.filter((id): id is string => id !== null)
    .map((teamId, i) => {
      const existing = bracket.teams.find(t => t.teamId === teamId)
        || (() => { const a = allTeams.find(t => t.teamId === teamId); return a ? { teamId: a.teamId, teamName: a.teamName, leagueId: a.leagueId, seedPosition: 0 } : null; })();
      return existing ? { ...existing, seedPosition: i + 1 } : null;
    }).filter((t): t is NonNullable<typeof t> => t !== null);
  const assignedIds = new Set(assignedTeams.map(t => t.teamId));
  const unassignedTeams = bracket.teams.filter(t =>
    !assignedIds.has(t.teamId) && !(excludeTeamIds && excludeTeamIds.has(t.teamId))
  );
  const allBracketTeams = [...assignedTeams, ...unassignedTeams];

  return { ...bracket, teams: allBracketTeams, matches };
}

/**
 * 既存ブラケットの R1 マッチからスロット配列と BYE 集合を抽出する。
 */
function extractSlotsFromBracket(bracket: TeamPlacementBracket): {
  slots: (string | null)[];
  byes: Set<number>;
} {
  const drawSize = bracket.drawSize;
  const slots: (string | null)[] = Array(drawSize).fill(null);
  const byes = new Set<number>();
  const r1 = bracket.matches.filter(m => m.round === 1).sort((a, b) => a.position - b.position);
  r1.forEach((m, i) => {
    const i1 = i * 2;
    const i2 = i * 2 + 1;
    if (m.isBye) {
      if (m.team1Id && (!m.team2Id || m.team2Name === 'BYE')) {
        slots[i1] = m.team1Id;
        byes.add(i2);
      } else if (m.team2Id && (!m.team1Id || m.team1Name === 'BYE')) {
        slots[i2] = m.team2Id;
        byes.add(i1);
      } else {
        byes.add(i1); byes.add(i2);
      }
    } else {
      slots[i1] = m.team1Id;
      slots[i2] = m.team2Id;
    }
  });
  return { slots, byes };
}

interface TeamState {
  // Data
  tournamentInfo: TeamTournamentInfo | null;
  leagues: TeamLeague[];
  leagueMatches: TeamLeagueMatch[];
  brackets: TeamPlacementBracket[];
  allTeams: TeamEntry[];
  rawExcelSheets: ExcelSheetData[];

  // UI State
  currentPhase: TeamPhase;
  selectedLeagueId: string | null;
  selectedBracketCategory: PlacementCategory;
  importFileName: string;
  isImported: boolean;
  rankOverrides: Record<string, Record<string, number>>;
  bracketCourtAssignments: Record<string, { courtNames: string[]; startedAt: number }>;
  lastStandingsHash: string;
  tiebreakOrder: TiebreakRuleId[];

  // Actions: Import
  importData: (info: TeamTournamentInfo, leagues: TeamLeague[], matches: TeamLeagueMatch[]) => void;
  setRawExcelSheets: (sheets: ExcelSheetData[]) => void;
  resetAll: () => void;

  // Actions: League
  updateSubMatchScore: (matchId: string, matchType: MatchType, score1: number, score2: number, tiebreakScore?: number | null) => void;
  updateSubMatchPlayers: (matchId: string, matchType: MatchType, players1: string[], players2: string[]) => void;
  clearSubMatchScore: (matchId: string, matchType: MatchType) => void;
  setLeagueMatchStatus: (matchId: string, status: TeamLeagueMatch['status']) => void;
  setTiebreakOrder: (order: TiebreakRuleId[]) => void;

  // Actions: Standings & Brackets
  getStandings: () => Map<string, TeamLeagueStanding[]>;
  generateBrackets: () => void;

  // Actions: Tournament
  updateBracketSubMatchScore: (matchId: string, matchType: MatchType, score1: number, score2: number, tiebreakScore?: number | null) => void;
  updateBracketSubMatchPlayers: (matchId: string, matchType: MatchType, players1: string[], players2: string[]) => void;
  clearBracketSubMatchScore: (matchId: string, matchType: MatchType) => void;
  setBracketMatchStatus: (matchId: string, status: TeamBracketMatch['status']) => void;
  advanceWinner: (matchId: string) => void;

  // Team status
  setTeamStatus: (teamId: string, status: 'none' | 'entry' | 'def') => void;
  setLeagueAllStatus: (leagueId: string, status: 'none' | 'entry' | 'def') => void;
  setAllTeamsStatus: (status: 'none' | 'entry' | 'def') => void;
  setTeamMembers: (teamId: string, members: TeamMember[]) => void;
  updateTeamName: (teamId: string, name: string) => void;
  updatePlayerDisplayName: (teamId: string, playerName: string, displayName: string | undefined) => void;

  // Navigation
  setCurrentPhase: (phase: TeamPhase) => void;
  setRankOverride: (leagueId: string, teamId: string, rank: number) => void;
  assignBracketMatchToCourt: (matchId: string, courtNames: string[]) => void;
  removeBracketMatchFromCourt: (matchId: string) => void;
  setSelectedLeagueId: (id: string | null) => void;
  setSelectedBracketCategory: (cat: PlacementCategory) => void;
  setImportFileName: (name: string) => void;
  updateGameRule: (teamCount: number, rule: string) => void;
  updateBracketGameRule: (rule: string) => void;
  updateCourtName: (leagueId: string, courtName: string) => void;
  updateTournamentInfo: (field: 'name' | 'date' | 'venue', value: string) => void;

  // Shuffle & rebuild
  shuffleBracketSeeds: (category: PlacementCategory, newOrder: string[]) => void;
  rebuildBracketFromSlots: (category: PlacementCategory, slots: (string | null)[], byePositions?: Set<number>) => void;
  /**
   * 並べ替えパネル用: 複数ブラケットへの変更を一括適用する。
   * targetCategory のスロット/BYEを更新し、externalImports で指定されたチームを
   * 元ブラケットから取り除く（取り除いたスロットはBYEになる）。
   */
  applyBracketReorder: (
    targetCategory: PlacementCategory,
    targetSlots: (string | null)[],
    targetByes: Set<number>,
    externalImports: Array<{ teamId: string; fromCategory: PlacementCategory }>
  ) => void;
  autoPopulateBrackets: () => void;
  regenerateBrackets: () => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      tournamentInfo: null,
      leagues: [],
      leagueMatches: [],
      brackets: [],
      allTeams: [],
      rawExcelSheets: [],
      currentPhase: 'import',
      selectedLeagueId: null,
      selectedBracketCategory: '1st',
      importFileName: '',
      isImported: false,
      rankOverrides: {},
      bracketCourtAssignments: {},
      lastStandingsHash: '',
      tiebreakOrder: DEFAULT_TIEBREAK_ORDER,

      setTiebreakOrder: (order) => set({ tiebreakOrder: order }),

      updateSubMatchPlayers: (matchId, matchType, players1, players2) => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m => {
            if (m.matchId !== matchId) return m;
            return {
              ...m,
              subMatches: m.subMatches.map(sm =>
                sm.type === matchType ? { ...sm, players1, players2 } : sm
              ),
            };
          }),
        }));
      },

      importData: (info, leagues, matches) => {
        try { localStorage.removeItem('team-tournament-storage'); } catch {}
        const allTeams = leagues.flatMap(l => l.teams);
        set({
          tournamentInfo: info,
          leagues,
          leagueMatches: matches,
          allTeams,
          isImported: true,
          currentPhase: 'league',
          selectedLeagueId: leagues[0]?.leagueId || null,
          brackets: [],
          rankOverrides: {},
          bracketCourtAssignments: {},
          lastStandingsHash: '',
        });
      },

      setRawExcelSheets: (sheets) => set({ rawExcelSheets: sheets }),

      resetAll: () => {
        try { localStorage.removeItem('team-tournament-storage'); } catch {}
        set({
          tournamentInfo: null,
          leagues: [],
          leagueMatches: [],
          brackets: [],
          allTeams: [],
          rawExcelSheets: [],
          currentPhase: 'import',
          selectedLeagueId: null,
          selectedBracketCategory: '1st',
          importFileName: '',
          isImported: false,
          rankOverrides: {},
          bracketCourtAssignments: {},
          lastStandingsHash: '',
        });
      },

      updateSubMatchScore: (matchId, matchType, score1, score2, tiebreakScore) => {
        set(state => {
          const newMatches = state.leagueMatches.map(m => {
            if (m.matchId !== matchId) return m;
            const newSubMatches = m.subMatches.map(sm => {
              if (sm.type !== matchType) return sm;
              const tb = tiebreakScore !== undefined ? tiebreakScore : null;
              const winnerId = score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null;
              return { ...sm, score1, score2, tiebreakScore: tb, winnerId };
            });
            const { winnerId, winsTeam1, winsTeam2 } = determineTeamWinner(newSubMatches, m.team1Id, m.team2Id);
            const allFinished = newSubMatches.every(sm => sm.winnerId !== null);
            return {
              ...m,
              subMatches: newSubMatches,
              winnerId,
              winsTeam1,
              winsTeam2,
              status: allFinished ? 'finished' as const : m.status,
            };
          });
          return { leagueMatches: newMatches };
        });
      },

      clearSubMatchScore: (matchId, matchType) => {
        set(state => {
          const newMatches = state.leagueMatches.map(m => {
            if (m.matchId !== matchId) return m;
            const newSubMatches = m.subMatches.map(sm => {
              if (sm.type !== matchType) return sm;
              return { ...sm, score1: null, score2: null, tiebreakScore: null, winnerId: null };
            });
            const { winnerId, winsTeam1, winsTeam2 } = determineTeamWinner(newSubMatches, m.team1Id, m.team2Id);
            const allFinished = newSubMatches.every(sm => sm.winnerId !== null);
            return {
              ...m,
              subMatches: newSubMatches,
              winnerId,
              winsTeam1,
              winsTeam2,
              status: allFinished ? 'finished' as const : 'waiting' as const,
            };
          });
          return { leagueMatches: newMatches };
        });
      },

      setLeagueMatchStatus: (matchId, status) => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m =>
            m.matchId === matchId ? { ...m, status } : m
          ),
        }));
      },

      getStandings: () => {
        const { leagues, leagueMatches, rankOverrides, tiebreakOrder } = get();
        return calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder);
      },

      generateBrackets: () => {
        const { leagues, leagueMatches, allTeams, tournamentInfo, rankOverrides } = get();
        const standings = calculateTeamStandings(leagues, leagueMatches, rankOverrides, get().tiebreakOrder);
        const brackets = generateAllBrackets(standings, allTeams, leagues, tournamentInfo?.bracketOrders);
        set({ brackets, currentPhase: 'tournament' });
      },

      updateBracketSubMatchScore: (matchId, matchType, score1, score2, tiebreakScore) => {
        set(state => {
          let becameFinished = false;
          const brackets = state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m => {
              if (m.matchId !== matchId) return m;
              const newSubMatches = m.subMatches.map(sm => {
                if (sm.type !== matchType) return sm;
                const tb = tiebreakScore !== undefined ? tiebreakScore : null;
                const winnerId = score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null;
                return { ...sm, score1, score2, tiebreakScore: tb, winnerId };
              });
              let winsTeam1 = 0, winsTeam2 = 0;
              for (const sm of newSubMatches) {
                if (sm.winnerId === m.team1Id) winsTeam1++;
                else if (sm.winnerId === m.team2Id) winsTeam2++;
              }
              const allFinished = newSubMatches.every(sm => sm.winnerId !== null);
              let winnerId: string | null = null;
              if (winsTeam1 >= 2) winnerId = m.team1Id;
              else if (winsTeam2 >= 2) winnerId = m.team2Id;
              else if (allFinished) winnerId = winsTeam1 > winsTeam2 ? m.team1Id : m.team2Id;
              const nextStatus = (winnerId ? 'finished' : m.status) as TeamBracketMatch['status'];
              if (nextStatus === 'finished' && m.status !== 'finished') becameFinished = true;
              return {
                ...m,
                subMatches: newSubMatches,
                winsTeam1,
                winsTeam2,
                winnerId,
                status: nextStatus,
              };
            }),
          }));
          // 試合終了時はコート割当を自動解放（複数コート併用に対応）
          let bracketCourtAssignments = state.bracketCourtAssignments;
          if (becameFinished && bracketCourtAssignments[matchId]) {
            const { [matchId]: _, ...rest } = bracketCourtAssignments;
            bracketCourtAssignments = rest;
          }
          return { brackets, bracketCourtAssignments };
        });
      },

      updateBracketSubMatchPlayers: (matchId, matchType, players1, players2) => {
        set(state => ({
          brackets: state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m => {
              if (m.matchId !== matchId) return m;
              return {
                ...m,
                subMatches: m.subMatches.map(sm =>
                  sm.type === matchType ? { ...sm, players1, players2 } : sm
                ),
              };
            }),
          })),
        }));
      },

      clearBracketSubMatchScore: (matchId, matchType) => {
        set(state => ({
          brackets: state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m => {
              if (m.matchId !== matchId) return m;
              const newSubMatches = m.subMatches.map(sm => {
                if (sm.type !== matchType) return sm;
                return { ...sm, score1: null, score2: null, tiebreakScore: null, winnerId: null };
              });
              let winsTeam1 = 0, winsTeam2 = 0;
              for (const sm of newSubMatches) {
                if (sm.winnerId === m.team1Id) winsTeam1++;
                else if (sm.winnerId === m.team2Id) winsTeam2++;
              }
              return { ...m, subMatches: newSubMatches, winsTeam1, winsTeam2, winnerId: null, status: 'playing' as const };
            }),
          })),
        }));
      },

      setBracketMatchStatus: (matchId, status) => {
        set(state => ({
          brackets: state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m =>
              m.matchId === matchId ? { ...m, status } : m
            ),
          })),
        }));
      },

      advanceWinner: (matchId) => {
        set(state => {
          const newBrackets = state.brackets.map(b => {
            const match = b.matches.find(m => m.matchId === matchId);
            if (!match || !match.winnerId || !match.nextMatchId) return b;
            const winnerTeam = state.allTeams.find(t => t.teamId === match.winnerId);
            const winnerName = winnerTeam?.teamName || '';
            const winnerLeague = winnerTeam?.leagueId || '';
            return {
              ...b,
              matches: b.matches.map(m => {
                if (m.matchId !== match.nextMatchId) return m;
                if (match.nextSlot === 'team1') {
                  return { ...m, team1Id: match.winnerId, team1Name: winnerName, team1League: winnerLeague, status: m.team2Id ? 'ready' as const : m.status };
                } else {
                  return { ...m, team2Id: match.winnerId, team2Name: winnerName, team2League: winnerLeague, status: m.team1Id ? 'ready' as const : m.status };
                }
              }),
            };
          });
          return { brackets: newBrackets };
        });
      },

      setTeamStatus: (teamId, status) => {
        set(state => {
          const updateTeam = (team: TeamEntry): TeamEntry =>
            team.teamId === teamId ? { ...team, status } : team;
          let newLeagueMatches = state.leagueMatches;
          if (status === 'def') {
            newLeagueMatches = state.leagueMatches.map(m => {
              if (m.status === 'finished') return m;
              if (m.team1Id === teamId) {
                const subMatches = m.subMatches.map(sm => ({
                  ...sm, score1: 0, score2: 0, winnerId: m.team2Id,
                }));
                return { ...m, subMatches, winnerId: m.team2Id, winsTeam1: 0, winsTeam2: 3, status: 'finished' as const };
              }
              if (m.team2Id === teamId) {
                const subMatches = m.subMatches.map(sm => ({
                  ...sm, score1: 0, score2: 0, winnerId: m.team1Id,
                }));
                return { ...m, subMatches, winnerId: m.team1Id, winsTeam1: 3, winsTeam2: 0, status: 'finished' as const };
              }
              return m;
            });
          }
          if (status !== 'def') {
            newLeagueMatches = state.leagueMatches.map(m => {
              if ((m.team1Id === teamId || m.team2Id === teamId) &&
                  m.status === 'finished' && m.subMatches.every(sm => sm.score1 === 0 && sm.score2 === 0)) {
                const subMatches = m.subMatches.map(sm => ({
                  ...sm, score1: null, score2: null, winnerId: null,
                }));
                return { ...m, subMatches, winnerId: null, winsTeam1: 0, winsTeam2: 0, status: 'waiting' as const };
              }
              return m;
            });
          }
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(updateTeam) })),
            allTeams: state.allTeams.map(updateTeam),
            leagueMatches: newLeagueMatches,
          };
        });
      },

      setLeagueAllStatus: (leagueId, status) => {
        set(state => {
          const updateTeam = (team: TeamEntry): TeamEntry =>
            team.leagueId === leagueId ? { ...team, status } : team;
          return {
            leagues: state.leagues.map(l => l.leagueId === leagueId ? { ...l, teams: l.teams.map(t => ({ ...t, status })) } : l),
            allTeams: state.allTeams.map(updateTeam),
          };
        });
      },

      setAllTeamsStatus: (status) => {
        set(state => ({
          leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(t => ({ ...t, status })) })),
          allTeams: state.allTeams.map(t => ({ ...t, status })),
        }));
      },

      setTeamMembers: (teamId, members) => {
        set(state => {
          const update = (t: TeamEntry): TeamEntry => t.teamId === teamId ? { ...t, members } : t;
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(update) })),
            allTeams: state.allTeams.map(update),
          };
        });
      },

      updateTeamName: (teamId, name) => {
        set(state => {
          const update = (t: TeamEntry): TeamEntry => t.teamId === teamId ? { ...t, teamName: name } : t;
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(update) })),
            allTeams: state.allTeams.map(update),
          };
        });
      },

      updatePlayerDisplayName: (teamId, playerName, displayName) => {
        set(state => {
          const updateMember = (t: TeamEntry): TeamEntry => {
            if (t.teamId !== teamId) return t;
            return {
              ...t,
              members: t.members.map(m =>
                m.player.name === playerName
                  ? { ...m, player: { ...m.player, displayName: displayName || undefined } }
                  : m
              ),
            };
          };
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(updateMember) })),
            allTeams: state.allTeams.map(updateMember),
          };
        });
      },

      setCurrentPhase: (phase) => set({ currentPhase: phase }),
      setRankOverride: (leagueId, teamId, rank) => set(state => ({
        rankOverrides: { ...state.rankOverrides, [leagueId]: { ...state.rankOverrides[leagueId], [teamId]: rank } },
      })),
      assignBracketMatchToCourt: (matchId, courtNames) => set(state => {
        const brackets = state.brackets.map(b => ({
          ...b,
          matches: b.matches.map(m => m.matchId === matchId ? { ...m, status: 'playing' as const } : m),
        }));
        return {
          brackets,
          bracketCourtAssignments: { ...state.bracketCourtAssignments, [matchId]: { courtNames, startedAt: Date.now() } },
        };
      }),
      removeBracketMatchFromCourt: (matchId) => set(state => {
        const { [matchId]: _, ...rest } = state.bracketCourtAssignments;
        return { bracketCourtAssignments: rest };
      }),
      setSelectedLeagueId: (id) => set({ selectedLeagueId: id }),
      setSelectedBracketCategory: (cat) => set({ selectedBracketCategory: cat }),
      setImportFileName: (name) => set({ importFileName: name }),
      updateGameRule: (teamCount, rule) => set(state => ({
        tournamentInfo: state.tournamentInfo ? {
          ...state.tournamentInfo,
          gameRules: { ...(state.tournamentInfo.gameRules || {}), [teamCount]: rule },
        } : null,
      })),
      updateBracketGameRule: (rule) => set(state => ({
        tournamentInfo: state.tournamentInfo ? { ...state.tournamentInfo, bracketGameRule: rule } : null,
      })),
      updateCourtName: (leagueId, courtName) => {
        set(state => ({
          leagues: state.leagues.map(l =>
            l.leagueId === leagueId ? { ...l, courtName } : l
          ),
        }));
      },
      updateTournamentInfo: (field, value) => {
        set(state => ({
          tournamentInfo: state.tournamentInfo ? { ...state.tournamentInfo, [field]: value } : null,
        }));
      },

      shuffleBracketSeeds: (category, newOrder) => {
        set(state => {
          const bracketIdx = state.brackets.findIndex(b => b.category === category);
          if (bracketIdx === -1) return state;
          const bracket = state.brackets[bracketIdx];
          const reorderedTeams = newOrder.map((teamId, i) => {
            const existing = bracket.teams.find(t => t.teamId === teamId);
            if (existing) return { ...existing, seedPosition: i + 1 };
            const fromAll = state.allTeams.find(t => t.teamId === teamId);
            if (fromAll) return { teamId, teamName: fromAll.teamName, leagueId: fromAll.leagueId, seedPosition: i + 1 };
            return null;
          }).filter((t): t is NonNullable<typeof t> => t !== null);

          const drawSize = bracket.drawSize;
          const totalRounds = Math.log2(drawSize);
          const matches: TeamBracketMatch[] = [];

          for (let round = 1; round <= totalRounds; round++) {
            const matchesInRound = drawSize / Math.pow(2, round);
            for (let pos = 1; pos <= matchesInRound; pos++) {
              const matchId = `bracket-${category}-R${round}-${pos}`;
              const nextRound = round + 1;
              const nextPos = Math.ceil(pos / 2);
              const nextMatchId = round < totalRounds ? `bracket-${category}-R${nextRound}-${nextPos}` : null;
              const nextSlot = pos % 2 === 1 ? 'team1' as const : 'team2' as const;
              matches.push({
                matchId, category, round, position: pos,
                team1Id: null, team2Id: null, team1Name: '', team2Name: '',
                team1League: '', team2League: '',
                subMatches: MATCH_TYPE_ORDER.map(type => ({ type, score1: null, score2: null, tiebreakScore: null, winnerId: null })),
                winsTeam1: 0, winsTeam2: 0,
                winnerId: null, status: 'waiting', isBye: false,
                nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
              });
            }
          }

          // BYE positions for 8-draw (5 teams → 3 BYEs)
          const BYE_POSITIONS = new Set([1, 5, 7]);
          const slots: (typeof reorderedTeams[0] | null)[] = Array(drawSize).fill(null);
          let teamIdx = 0;
          for (let i = 0; i < drawSize; i++) {
            if (BYE_POSITIONS.has(i)) continue;
            if (teamIdx < reorderedTeams.length) {
              slots[i] = reorderedTeams[teamIdx++];
            }
          }

          const r1 = matches.filter(m => m.round === 1);
          for (let i = 0; i < r1.length; i++) {
            const s1 = slots[i * 2];
            const s2 = slots[i * 2 + 1];
            if (s1) { r1[i].team1Id = s1.teamId; r1[i].team1Name = s1.teamName; r1[i].team1League = s1.leagueId; }
            if (s2) { r1[i].team2Id = s2.teamId; r1[i].team2Name = s2.teamName; r1[i].team2League = s2.leagueId; }
            if (r1[i].team1Id && !r1[i].team2Id) {
              r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team1Id; r1[i].team2Name = 'BYE';
            } else if (!r1[i].team1Id && r1[i].team2Id) {
              r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team2Id; r1[i].team1Name = 'BYE';
            } else if (r1[i].team1Id && r1[i].team2Id) {
              r1[i].status = 'ready';
            }
          }

          for (const m of r1) {
            if (m.isBye && m.winnerId && m.nextMatchId) {
              const next = matches.find(nm => nm.matchId === m.nextMatchId);
              if (next) {
                const team = reorderedTeams.find(t => t.teamId === m.winnerId);
                if (m.nextSlot === 'team1') {
                  next.team1Id = m.winnerId; next.team1Name = team?.teamName || ''; next.team1League = team?.leagueId || '';
                } else {
                  next.team2Id = m.winnerId; next.team2Name = team?.teamName || ''; next.team2League = team?.leagueId || '';
                }
                if (next.team1Id && next.team2Id) next.status = 'ready';
              }
            }
          }

          const newBrackets = [...state.brackets];
          newBrackets[bracketIdx] = { ...bracket, teams: reorderedTeams, matches };
          return { brackets: newBrackets };
        });
      },

      rebuildBracketFromSlots: (category, slotsArray, byePositions) => {
        set(state => {
          const bracketIdx = state.brackets.findIndex(b => b.category === category);
          if (bracketIdx === -1) return state;
          const bracket = state.brackets[bracketIdx];
          const newBracket = rebuildBracketObject(bracket, slotsArray, byePositions, state.allTeams);
          const newBrackets = [...state.brackets];
          newBrackets[bracketIdx] = newBracket;
          return { brackets: newBrackets };
        });
      },

      applyBracketReorder: (targetCategory, targetSlots, targetByes, externalImports) => {
        set(state => {
          const newBrackets = [...state.brackets];

          // Step 1: 元ブラケットからチームを取り除き、それぞれを再構築
          const importsBySource = new Map<PlacementCategory, Set<string>>();
          for (const imp of externalImports) {
            const set = importsBySource.get(imp.fromCategory) ?? new Set<string>();
            set.add(imp.teamId);
            importsBySource.set(imp.fromCategory, set);
          }
          for (const [sourceCategory, removedIds] of importsBySource) {
            const idx = newBrackets.findIndex(b => b.category === sourceCategory);
            if (idx === -1) continue;
            const source = newBrackets[idx];
            const { slots: srcSlots, byes: srcByes } = extractSlotsFromBracket(source);
            // 取り除いたチームのスロットは BYE にする
            for (let i = 0; i < srcSlots.length; i++) {
              const id = srcSlots[i];
              if (id && removedIds.has(id)) {
                srcSlots[i] = null;
                srcByes.add(i);
              }
            }
            newBrackets[idx] = rebuildBracketObject(source, srcSlots, srcByes, state.allTeams, removedIds);
          }

          // Step 2: ターゲットブラケットを再構築
          const targetIdx = newBrackets.findIndex(b => b.category === targetCategory);
          if (targetIdx !== -1) {
            const target = newBrackets[targetIdx];
            newBrackets[targetIdx] = rebuildBracketObject(target, targetSlots, targetByes, state.allTeams);
          }

          return { brackets: newBrackets };
        });
      },

      autoPopulateBrackets: () => {
        const { leagues, leagueMatches, allTeams } = get();
        if (leagues.length === 0) return;
        const baseStandings = calculateTeamStandings(leagues, leagueMatches, get().rankOverrides, get().tiebreakOrder);
        const completedStandings = new Map<string, TeamLeagueStanding[]>();
        for (const [leagueId, stds] of baseStandings) {
          const lMatches = leagueMatches.filter(m => m.leagueId === leagueId);
          const isCompleted = lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
          completedStandings.set(leagueId, isCompleted ? stds : []);
        }
        const brackets = generateAllBrackets(completedStandings, allTeams, leagues, get().tournamentInfo?.bracketOrders);
        set({ brackets, bracketCourtAssignments: {} });
      },

      regenerateBrackets: () => {
        const { leagues, leagueMatches, allTeams, brackets: oldBrackets, tournamentInfo, rankOverrides, bracketCourtAssignments } = get();
        const baseStandings = calculateTeamStandings(leagues, leagueMatches, rankOverrides, get().tiebreakOrder);
        const completedStandings = new Map<string, TeamLeagueStanding[]>();
        for (const [leagueId, stds] of baseStandings) {
          const lMatches = leagueMatches.filter(m => m.leagueId === leagueId);
          const isCompleted = lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
          completedStandings.set(leagueId, isCompleted ? stds : []);
        }
        const newBrackets = generateAllBrackets(completedStandings, allTeams, leagues, tournamentInfo?.bracketOrders);
        const preservedCategories = new Set<string>();
        for (const oldB of oldBrackets) {
          const hasRealProgress = oldB.matches.some(m => m.status === 'finished' || m.status === 'playing');
          if (hasRealProgress) {
            const idx = newBrackets.findIndex(b => b.category === oldB.category);
            if (idx >= 0) { newBrackets[idx] = oldB; preservedCategories.add(oldB.category); }
          }
        }
        const newCourtAssignments: Record<string, { courtNames: string[]; startedAt: number }> = {};
        for (const [matchId, ca] of Object.entries(bracketCourtAssignments)) {
          const cat = matchId.match(/^bracket-(\w+)-/)?.[1];
          if (cat && preservedCategories.has(cat)) newCourtAssignments[matchId] = ca;
        }
        set({ brackets: newBrackets, bracketCourtAssignments: newCourtAssignments });
      },
    }),
    {
      name: 'team-tournament-storage',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState && typeof persistedState === 'object') {
          const old = persistedState.bracketCourtAssignments || {};
          const next: Record<string, { courtNames: string[]; startedAt: number }> = {};
          for (const [k, v] of Object.entries(old)) {
            const entry = v as any;
            if (entry && typeof entry === 'object') {
              if (Array.isArray(entry.courtNames)) {
                next[k] = { courtNames: entry.courtNames, startedAt: entry.startedAt || Date.now() };
              } else if (entry.courtName) {
                next[k] = { courtNames: [entry.courtName], startedAt: entry.startedAt || Date.now() };
              }
            }
          }
          persistedState.bracketCourtAssignments = next;
        }
        return persistedState;
      },
    }
  )
);
