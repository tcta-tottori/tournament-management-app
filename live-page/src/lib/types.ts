/**
 * 公開ライブページ用型定義
 * 運営システムの database.ts と同期する
 */

export interface Tournament {
  tournamentId: string;
  name: string;
  date: string;
  venue: string;
  reserveDate: string;
  reserveVenue: string;
  createdAt: number;
  _syncedAt?: unknown;
}

export interface Event {
  tournamentId: string;
  eventId: string;
  name: string;
  type: 'Singles' | 'Doubles' | 'Team';
  gameRules: {
    sets: number;
    games: number;
    deuce: boolean;
    tiebreakPoint: number;
  };
  roundGameRules?: RoundGameRule[];
  _syncedAt?: unknown;
}

export interface RoundGameRule {
  roundLabel: string;
  ruleText: string;
  games: number;
  matchFormat?: 'game' | 'twoSetsSuper10';
}

export interface Match {
  eventId: string;
  matchId: string;
  round: number;
  matchOrder: number;
  position: number;
  player1EntryId: string | null;
  player2EntryId: string | null;
  player1Name: string;
  player2Name: string;
  player1Affiliation: string;
  player2Affiliation: string;
  score: string;
  winnerEntryId: string | null;
  gameRule?: string;
  courtId: string | null;
  scheduledTime: string | null;
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'walkover';
  refereeId: string | null;
  refereeName: string;
  updatedAt: number;
  _syncedAt?: unknown;
}

export interface Draw {
  eventId: string;
  drawSize: number;
  drawType?: 'tournament' | 'roundRobin';
  slots: DrawSlot[];
  updatedAt: number;
  _syncedAt?: unknown;
}

export interface DrawSlot {
  position: number;
  entryId: string | null;
  seed: number;
  isBye: boolean;
}

export interface Court {
  tournamentId: string;
  courtId: string;
  name: string;
  surface: string;
  isAvailable: boolean;
  currentMatchId: string | null;
  order: number;
  _syncedAt?: unknown;
}

export interface Player {
  playerId: string;
  name: string;
  furigana: string;
  affiliation: string;
  rankings: Record<string, number>;
  _syncedAt?: unknown;
}

export interface Entry {
  eventId: string;
  entryId: string;
  playerId: string;
  partnerId?: string;
  teamId?: string;
  seedNo?: number;
  rankPoint: number;
  status: 'active' | 'withdrawn';
  _syncedAt?: unknown;
}

export interface LiveState {
  activeMatchIds: string[];
  ticker?: string;
  lastUpdated: unknown;
}

/** ミックスダブルスデータ（mixedStore のスナップショット） */
export interface MixedData {
  tournamentInfo?: {
    name: string;
    date: string;
    venue: string;
  };
  leagues: MixedLeague[];
  leagueMatches: MixedLeagueMatch[];
  brackets: MixedBracket[];
  allTeams: MixedTeam[];
  currentPhase: string;
  _syncedAt?: unknown;
}

export interface MixedTeam {
  teamId: string;
  leagueId: string;
  numberInLeague: number;
  pairNumber: number;
  male: { name: string; affiliation: string };
  female: { name: string; affiliation: string };
  teamName: string;
  status: string;
}

export interface MixedLeague {
  leagueId: string;
  teamIds: string[];
}

export interface MixedLeagueMatch {
  matchId: string;
  leagueId: string;
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  score1: number | null;
  score2: number | null;
  tiebreakScore?: string;
  winnerId: string | null;
  status: 'waiting' | 'playing' | 'finished';
  courtId?: string;
}

export interface MixedBracket {
  category: string;
  matches: MixedBracketMatch[];
}

export interface MixedBracketMatch {
  matchId: string;
  category: string;
  round: number;
  position: number;
  team1Id: string | null;
  team2Id: string | null;
  score1: number | null;
  score2: number | null;
  tiebreakScore?: string;
  winnerId: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'bye';
  isBye?: boolean;
  courtId?: string;
}
