import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding,
  PlacementBracket, PlacementCategory, BracketMatch,
  MixedPhase, TournamentInfo, ExcelSheetData
} from './types';
import { calculateLeagueStandings, generateAllBrackets, regenerateLeagueMatches } from './mixedLogic';

interface MixedState {
  // Data
  tournamentInfo: TournamentInfo | null;
  leagues: MixedLeague[];
  leagueMatches: LeagueMatchScore[];
  brackets: PlacementBracket[];
  allTeams: MixedTeam[];
  rawExcelSheets: ExcelSheetData[];

  // UI State
  currentPhase: MixedPhase;
  selectedLeagueId: string | null;
  selectedBracketCategory: PlacementCategory;
  importFileName: string;
  isImported: boolean;
  /** 抽選で決定した順位オーバーライド: leagueId -> { teamId -> rank } */
  rankOverrides: Record<string, Record<string, number>>;
  /** ブラケット試合のコート割当: matchId -> { courtName, startedAt } */
  bracketCourtAssignments: Record<string, { courtName: string; startedAt: number }>;

  // Actions: Import
  importData: (info: TournamentInfo, leagues: MixedLeague[], matches: LeagueMatchScore[]) => void;
  setRawExcelSheets: (sheets: ExcelSheetData[]) => void;
  resetAll: () => void;

  // Actions: League
  updateLeagueScore: (matchId: string, score1: number, score2: number, tiebreakScore?: number | null, overrideWinnerId?: string | null) => void;
  setLeagueMatchStatus: (matchId: string, status: LeagueMatchScore['status']) => void;

  // Actions: Standings & Brackets
  getStandings: () => Map<string, LeagueStanding[]>;
  generateBrackets: () => void;

  // Actions: Tournament
  updateBracketScore: (matchId: string, score1: number, score2: number, overrideWinnerId?: string | null) => void;
  setBracketMatchStatus: (matchId: string, status: BracketMatch['status']) => void;
  advanceWinner: (matchId: string) => void;

  // Court & Team editing
  updateCourtName: (leagueId: string, courtName: string) => void;
  updateTeamPlayer: (teamId: string, field: 'maleName' | 'maleAffiliation' | 'femaleName' | 'femaleAffiliation', value: string) => void;

  // Team status & league move
  setTeamStatus: (teamId: string, status: 'none' | 'entry' | 'def') => void;
  setLeagueAllStatus: (leagueId: string, status: 'none' | 'entry' | 'def') => void;
  setAllTeamsStatus: (status: 'none' | 'entry' | 'def') => void;
  moveTeamToLeague: (teamId: string, targetLeagueId: string) => void;

  // Tournament info editing
  updateTournamentInfo: (field: 'name' | 'date' | 'venue', value: string) => void;

  // Bracket seed shuffle (roulette)
  shuffleBracketSeeds: (category: PlacementCategory, newOrder: string[]) => void;

  // Rebuild bracket from raw 16-slot array (null=BYE)
  rebuildBracketFromSlots: (category: PlacementCategory, slots: (string | null)[]) => void;

  // Auto-populate non-1st brackets from league standings
  autoPopulateBrackets: () => void;

  // Re-generate brackets with correct draw sheet ordering (preserves 1st bracket if matches started)
  regenerateBrackets: () => void;

  // Navigation
  setCurrentPhase: (phase: MixedPhase) => void;
  setRankOverride: (leagueId: string, teamId: string, rank: number) => void;
  assignBracketMatchToCourt: (matchId: string, courtName: string) => void;
  removeBracketMatchFromCourt: (matchId: string) => void;
  setSelectedLeagueId: (id: string | null) => void;
  setSelectedBracketCategory: (cat: PlacementCategory) => void;
  setImportFileName: (name: string) => void;
  updateGameRule: (teamCount: number, rule: string) => void;

  // Test helpers
  fillAllScoresForTest: () => void;
}

export const useMixedStore = create<MixedState>()(
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

      importData: (info, leagues, matches) => {
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
        });
      },

      setRawExcelSheets: (sheets) => set({ rawExcelSheets: sheets }),

      resetAll: () => {
        // localStorage も明示的にクリア
        try { localStorage.removeItem('mixed-tournament-storage'); } catch {}
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
        });
      },

      updateLeagueScore: (matchId, score1, score2, tiebreakScore, overrideWinnerId) => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m => {
            if (m.matchId !== matchId) return m;
            // Clear: score1=-1 && score2=-1
            if (score1 === -1 && score2 === -1) {
              return { ...m, score1: null, score2: null, tiebreakScore: null, winnerId: null, status: 'waiting' as const };
            }
            const winnerId = overrideWinnerId !== undefined && overrideWinnerId !== null
              ? overrideWinnerId
              : (score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null);
            const tb = tiebreakScore !== undefined ? tiebreakScore : null;
            return { ...m, score1, score2, tiebreakScore: tb, winnerId, status: 'finished' as const };
          }),
        }));
      },

      setLeagueMatchStatus: (matchId, status) => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m =>
            m.matchId === matchId ? { ...m, status } : m
          ),
        }));
      },

      getStandings: () => {
        const { leagues, leagueMatches, rankOverrides } = get();
        return calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
      },

      generateBrackets: () => {
        const { leagues, leagueMatches, allTeams, tournamentInfo, rankOverrides } = get();
        const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
        const brackets = generateAllBrackets(standings, allTeams, leagues, tournamentInfo?.bracketOrders);
        set({ brackets, currentPhase: 'tournament' });
      },

      updateBracketScore: (matchId, score1, score2, overrideWinnerId) => {
        set(state => ({
          brackets: state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m => {
              if (m.matchId !== matchId) return m;
              const winnerId = overrideWinnerId !== undefined && overrideWinnerId !== null
                ? overrideWinnerId
                : (score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null);
              return { ...m, score1, score2, winnerId, status: 'finished' as const };
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

      updateCourtName: (leagueId, courtName) => {
        set(state => ({
          leagues: state.leagues.map(l =>
            l.leagueId === leagueId ? { ...l, courtName } : l
          ),
        }));
      },

      updateTeamPlayer: (teamId, field, value) => {
        const extractLast = (n: string) => n.replace(/\u3000/g, ' ').trim().split(/\s+/)[0] || n;
        set(state => {
          const updateTeam = (team: MixedTeam): MixedTeam => {
            if (team.teamId !== teamId) return team;
            const updated = { ...team };
            if (field === 'maleName') { updated.male = { ...updated.male, name: value }; updated.teamName = extractLast(value) + '・' + extractLast(updated.female.name); }
            else if (field === 'maleAffiliation') updated.male = { ...updated.male, affiliation: value };
            else if (field === 'femaleName') { updated.female = { ...updated.female, name: value }; updated.teamName = extractLast(updated.male.name) + '・' + extractLast(value); }
            else if (field === 'femaleAffiliation') updated.female = { ...updated.female, affiliation: value };
            return updated;
          };
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(updateTeam) })),
            allTeams: state.allTeams.map(updateTeam),
          };
        });
      },

      setTeamStatus: (teamId, status) => {
        set(state => {
          const updateTeam = (team: MixedTeam): MixedTeam =>
            team.teamId === teamId ? { ...team, status } : team;

          // DEFの場合: そのチームの全予選試合を相手勝利(0-0, DEF)にする
          let newLeagueMatches = state.leagueMatches;
          if (status === 'def') {
            newLeagueMatches = state.leagueMatches.map(m => {
              if (m.status === 'finished') return m; // 既に完了済みはそのまま
              if (m.team1Id === teamId) {
                return { ...m, score1: 0, score2: 0, winnerId: m.team2Id, status: 'finished' as const };
              }
              if (m.team2Id === teamId) {
                return { ...m, score1: 0, score2: 0, winnerId: m.team1Id, status: 'finished' as const };
              }
              return m;
            });
          }
          // DEF解除の場合: DEFで自動処理した試合をリセット
          if (status !== 'def') {
            newLeagueMatches = state.leagueMatches.map(m => {
              if ((m.team1Id === teamId || m.team2Id === teamId) &&
                  m.status === 'finished' && m.score1 === 0 && m.score2 === 0) {
                return { ...m, score1: null, score2: null, winnerId: null, status: 'waiting' as const };
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
          const updateTeam = (team: MixedTeam): MixedTeam =>
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

      moveTeamToLeague: (teamId, targetLeagueId) => {
        set(state => {
          // Find the team and its source league
          let movingTeam: MixedTeam | null = null;
          let sourceLeagueId = '';
          for (const l of state.leagues) {
            const t = l.teams.find(t => t.teamId === teamId);
            if (t) { movingTeam = t; sourceLeagueId = l.leagueId; break; }
          }
          if (!movingTeam || sourceLeagueId === targetLeagueId) return state;

          // Update leagues
          const newLeagues = state.leagues.map(l => {
            if (l.leagueId === sourceLeagueId) {
              // Remove team from source
              const newTeams = l.teams.filter(t => t.teamId !== teamId)
                .map((t, i) => ({ ...t, numberInLeague: i + 1 }));
              return { ...l, teams: newTeams, matchOrder: [] };
            }
            if (l.leagueId === targetLeagueId) {
              // Add team to target
              const newNum = l.teams.length + 1;
              const newTeam: MixedTeam = {
                ...movingTeam!,
                leagueId: targetLeagueId,
                teamId: `${targetLeagueId}-${newNum}`,
                numberInLeague: newNum,
              };
              const newTeams = [...l.teams, newTeam];
              return { ...l, teams: newTeams, matchOrder: [] };
            }
            return l;
          });

          // Regenerate matches for affected leagues
          let newMatches = state.leagueMatches.filter(
            m => m.leagueId !== sourceLeagueId && m.leagueId !== targetLeagueId
          );
          for (const l of newLeagues) {
            if (l.leagueId === sourceLeagueId || l.leagueId === targetLeagueId) {
              if (l.teams.length >= 2) {
                newMatches = [...newMatches, ...regenerateLeagueMatches(l)];
              }
            }
          }

          const allTeams = newLeagues.flatMap(l => l.teams);

          return { leagues: newLeagues, leagueMatches: newMatches, allTeams };
        });
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
            // bracket.teams にない場合は allTeams から取得
            const fromAll = state.allTeams.find(t => t.teamId === teamId);
            if (fromAll) return { teamId, teamName: fromAll.teamName, leagueId: fromAll.leagueId, seedPosition: i + 1 };
            return null;
          }).filter((t): t is NonNullable<typeof t> => t !== null);

          const drawSize = bracket.drawSize;
          const totalRounds = Math.log2(drawSize);
          const matches: BracketMatch[] = [];

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
                score1: null, score2: null, winnerId: null,
                status: 'waiting', isBye: false,
                nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
              });
            }
          }

          // 16スロット配列を構築（BYE位置: slot2,slot8,slot16 = index 1,7,15）
          const BYE_POSITIONS = new Set([1, 7, 15]);
          const slots: (typeof reorderedTeams[0] | null)[] = Array(drawSize).fill(null);
          let teamIdx = 0;
          for (let i = 0; i < drawSize; i++) {
            if (BYE_POSITIONS.has(i)) continue; // BYEスロットはnullのまま
            if (teamIdx < reorderedTeams.length) {
              slots[i] = reorderedTeams[teamIdx++];
            }
          }

          // R1マッチにスロットから配置
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

          // BYE winners advance
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

      rebuildBracketFromSlots: (category, slotsArray) => {
        set(state => {
          const bracketIdx = state.brackets.findIndex(b => b.category === category);
          if (bracketIdx === -1) return state;
          const bracket = state.brackets[bracketIdx];
          const drawSize = slotsArray.length;
          const totalRounds = Math.log2(drawSize);
          const matches: BracketMatch[] = [];

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
                score1: null, score2: null, winnerId: null,
                status: 'waiting', isBye: false,
                nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
              });
            }
          }

          const r1 = matches.filter(m => m.round === 1);
          for (let i = 0; i < r1.length; i++) {
            const tid1 = slotsArray[i * 2];
            const tid2 = slotsArray[i * 2 + 1];
            const t1 = tid1 ? state.allTeams.find(t => t.teamId === tid1) : null;
            const t2 = tid2 ? state.allTeams.find(t => t.teamId === tid2) : null;
            if (t1) { r1[i].team1Id = t1.teamId; r1[i].team1Name = t1.teamName; r1[i].team1League = t1.leagueId; }
            if (t2) { r1[i].team2Id = t2.teamId; r1[i].team2Name = t2.teamName; r1[i].team2League = t2.leagueId; }
            if (r1[i].team1Id && !r1[i].team2Id) {
              r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team1Id; r1[i].team2Name = 'BYE';
            } else if (!r1[i].team1Id && r1[i].team2Id) {
              r1[i].isBye = true; r1[i].status = 'bye'; r1[i].winnerId = r1[i].team2Id; r1[i].team1Name = 'BYE';
            } else if (r1[i].team1Id && r1[i].team2Id) {
              r1[i].status = 'ready';
            }
          }

          // BYE winners advance
          for (const m of r1) {
            if (m.isBye && m.winnerId && m.nextMatchId) {
              const next = matches.find(nm => nm.matchId === m.nextMatchId);
              if (next) {
                const team = state.allTeams.find(t => t.teamId === m.winnerId);
                if (m.nextSlot === 'team1') {
                  next.team1Id = m.winnerId; next.team1Name = team?.teamName || ''; next.team1League = team?.leagueId || '';
                } else {
                  next.team2Id = m.winnerId; next.team2Name = team?.teamName || ''; next.team2League = team?.leagueId || '';
                }
                if (next.team1Id && next.team2Id) next.status = 'ready';
              }
            }
          }

          const reorderedTeams = slotsArray.filter((id): id is string => id !== null)
            .map((teamId, i) => {
              const existing = bracket.teams.find(t => t.teamId === teamId);
              return existing ? { ...existing, seedPosition: i + 1 } : null;
            }).filter((t): t is NonNullable<typeof t> => t !== null);

          const newBrackets = [...state.brackets];
          newBrackets[bracketIdx] = { ...bracket, teams: reorderedTeams, matches };
          return { brackets: newBrackets };
        });
      },

      autoPopulateBrackets: () => {
        const { leagues, leagueMatches, allTeams } = get();

        const standings = calculateLeagueStandings(leagues, leagueMatches, get().rankOverrides);
        const brackets = generateAllBrackets(standings, allTeams, leagues, get().tournamentInfo?.bracketOrders);
        set({ brackets });
      },

      regenerateBrackets: () => {
        const { leagues, leagueMatches, allTeams, brackets: oldBrackets, tournamentInfo, rankOverrides } = get();
        const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
        const newBrackets = generateAllBrackets(standings, allTeams, leagues, tournamentInfo?.bracketOrders);

        // 1位トーナメントは試合が始まっていたら維持
        const old1st = oldBrackets.find(b => b.category === '1st');
        if (old1st) {
          const hasStarted = old1st.matches.some(m => m.status === 'finished' || m.status === 'playing' || m.status === 'ready');
          if (hasStarted) {
            const idx = newBrackets.findIndex(b => b.category === '1st');
            if (idx >= 0) newBrackets[idx] = old1st;
          }
        }

        set({ brackets: newBrackets });
      },

      setCurrentPhase: (phase) => set({ currentPhase: phase }),
      setRankOverride: (leagueId, teamId, rank) => set(state => ({
        rankOverrides: { ...state.rankOverrides, [leagueId]: { ...state.rankOverrides[leagueId], [teamId]: rank } },
      })),
      assignBracketMatchToCourt: (matchId, courtName) => set(state => {
        // ステータスをplayingに更新
        const brackets = state.brackets.map(b => ({
          ...b,
          matches: b.matches.map(m => m.matchId === matchId ? { ...m, status: 'playing' as const } : m),
        }));
        return {
          brackets,
          bracketCourtAssignments: { ...state.bracketCourtAssignments, [matchId]: { courtName, startedAt: Date.now() } },
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

      fillAllScoresForTest: () => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m => {
            if (m.status === 'finished') return m;
            // team1が6-4で勝利（テスト用）
            return { ...m, score1: 6, score2: 4, tiebreakScore: null, winnerId: m.team1Id, status: 'finished' as const };
          }),
        }));
      },
    }),
    {
      name: 'mixed-tournament-storage',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v1→v2: 新規フィールドのデフォルト値を補完
          return {
            ...persisted,
            rankOverrides: persisted.rankOverrides ?? {},
            bracketCourtAssignments: persisted.bracketCourtAssignments ?? {},
            rawExcelSheets: persisted.rawExcelSheets ?? [],
          };
        }
        return persisted;
      },
    }
  )
);
