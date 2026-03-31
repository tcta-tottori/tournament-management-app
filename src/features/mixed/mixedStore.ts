import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding,
  PlacementBracket, PlacementCategory, BracketMatch,
  MixedPhase, TournamentInfo
} from './types';
import { calculateLeagueStandings, generateAllBrackets, regenerateLeagueMatches } from './mixedLogic';

interface MixedState {
  // Data
  tournamentInfo: TournamentInfo | null;
  leagues: MixedLeague[];
  leagueMatches: LeagueMatchScore[];
  brackets: PlacementBracket[];
  allTeams: MixedTeam[];

  // UI State
  currentPhase: MixedPhase;
  selectedLeagueId: string | null;
  selectedBracketCategory: PlacementCategory;
  importFileName: string;
  isImported: boolean;

  // Actions: Import
  importData: (info: TournamentInfo, leagues: MixedLeague[], matches: LeagueMatchScore[]) => void;
  resetAll: () => void;

  // Actions: League
  updateLeagueScore: (matchId: string, score1: number, score2: number) => void;
  setLeagueMatchStatus: (matchId: string, status: LeagueMatchScore['status']) => void;

  // Actions: Standings & Brackets
  getStandings: () => Map<string, LeagueStanding[]>;
  generateBrackets: () => void;

  // Actions: Tournament
  updateBracketScore: (matchId: string, score1: number, score2: number) => void;
  setBracketMatchStatus: (matchId: string, status: BracketMatch['status']) => void;
  advanceWinner: (matchId: string) => void;

  // Court & Team editing
  updateCourtName: (leagueId: string, courtName: string) => void;
  updateTeamPlayer: (teamId: string, field: 'maleName' | 'maleAffiliation' | 'femaleName' | 'femaleAffiliation', value: string) => void;

  // Team status & league move
  setTeamStatus: (teamId: string, status: 'entry' | 'def') => void;
  moveTeamToLeague: (teamId: string, targetLeagueId: string) => void;

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

      resetAll: () => set({
        tournamentInfo: null,
        leagues: [],
        leagueMatches: [],
        brackets: [],
        allTeams: [],
        currentPhase: 'import',
        selectedLeagueId: null,
        selectedBracketCategory: '1st',
        importFileName: '',
        isImported: false,
      }),

      updateLeagueScore: (matchId, score1, score2) => {
        set(state => ({
          leagueMatches: state.leagueMatches.map(m => {
            if (m.matchId !== matchId) return m;
            const winnerId = score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null;
            return { ...m, score1, score2, winnerId, status: 'finished' as const };
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

      updateBracketScore: (matchId, score1, score2) => {
        set(state => ({
          brackets: state.brackets.map(b => ({
            ...b,
            matches: b.matches.map(m => {
              if (m.matchId !== matchId) return m;
              const winnerId = score1 > score2 ? m.team1Id : score2 > score1 ? m.team2Id : null;
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

      setCurrentPhase: (phase) => set({ currentPhase: phase }),
      setSelectedLeagueId: (id) => set({ selectedLeagueId: id }),
      setSelectedBracketCategory: (cat) => set({ selectedBracketCategory: cat }),
      setImportFileName: (name) => set({ importFileName: name }),
    }),
    { name: 'mixed-tournament-storage' }
  )
);
