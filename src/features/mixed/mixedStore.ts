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

  // Auto-populate non-1st brackets from league standings
  autoPopulateBrackets: () => void;

  // Navigation
  setCurrentPhase: (phase: MixedPhase) => void;
  setSelectedLeagueId: (id: string | null) => void;
  setSelectedBracketCategory: (cat: PlacementCategory) => void;
  setImportFileName: (name: string) => void;
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

      resetAll: () => set({
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
      }),

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
        const { leagues, leagueMatches } = get();
        return calculateLeagueStandings(leagues, leagueMatches);
      },

      generateBrackets: () => {
        const { leagues, leagueMatches, allTeams } = get();
        const standings = calculateLeagueStandings(leagues, leagueMatches);
        const brackets = generateAllBrackets(standings, allTeams, leagues);
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
          return {
            leagues: state.leagues.map(l => ({ ...l, teams: l.teams.map(updateTeam) })),
            allTeams: state.allTeams.map(updateTeam),
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
          // Reorder teams based on newOrder
          const reorderedTeams = newOrder.map((teamId, i) => {
            const existing = bracket.teams.find(t => t.teamId === teamId);
            return existing ? { ...existing, seedPosition: i + 1 } : null;
          }).filter((t): t is NonNullable<typeof t> => t !== null);

          // Regenerate matches with new team order
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

          // Place teams in round 1
          const r1 = matches.filter(m => m.round === 1);
          for (let i = 0; i < r1.length; i++) {
            const t1 = i * 2 < reorderedTeams.length ? reorderedTeams[i * 2] : null;
            const t2 = i * 2 + 1 < reorderedTeams.length ? reorderedTeams[i * 2 + 1] : null;
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

      autoPopulateBrackets: () => {
        const { leagues, leagueMatches, allTeams } = get();
        // Check if all leagues are complete
        const allComplete = leagues.every(l => {
          const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
          return lm.length > 0 && lm.every(m => m.status === 'finished');
        });
        if (!allComplete) return;

        const standings = calculateLeagueStandings(leagues, leagueMatches);
        const brackets = generateAllBrackets(standings, allTeams, leagues);
        set({ brackets });
      },

      setCurrentPhase: (phase) => set({ currentPhase: phase }),
      setSelectedLeagueId: (id) => set({ selectedLeagueId: id }),
      setSelectedBracketCategory: (cat) => set({ selectedBracketCategory: cat }),
      setImportFileName: (name) => set({ importFileName: name }),
    }),
    { name: 'mixed-tournament-storage' }
  )
);
