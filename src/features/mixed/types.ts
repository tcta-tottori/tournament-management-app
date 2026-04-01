// ミックス大会 データ型定義

/** 個人選手 */
export interface MixedPlayer {
  name: string;
  affiliation: string;
}

/** ミックスダブルスペア（1チーム） */
export interface MixedTeam {
  teamId: string;           // "A-1", "B-3" etc.
  leagueId: string;         // "A" ~ "M"
  numberInLeague: number;   // 1-based
  pairNumber: number;       // Excel上の通し番号(1~54)
  male: MixedPlayer;
  female: MixedPlayer;
  teamName: string;         // "藤田・山根" (姓のみ)
  status: 'none' | 'entry' | 'def';  // エントリー状態
}

/** 対戦順定義 */
export interface MatchOrderEntry {
  matchNumber: number;
  team1Index: number;       // 1-based (①=1, ②=2...)
  team2Index: number;
}

/** リーグ */
export interface MixedLeague {
  leagueId: string;
  courtName: string;        // "1コート" etc.
  teams: MixedTeam[];
  matchOrder: MatchOrderEntry[];
}

/** リーグ戦の1試合スコア */
export interface LeagueMatchScore {
  matchId: string;          // "league-A-1"
  leagueId: string;
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  score1: number | null;    // team1の取得ゲーム数
  score2: number | null;    // team2の取得ゲーム数
  tiebreakScore: number | null; // タイブレーク敗者側スコア (7-6時のみ)
  winnerId: string | null;
  status: 'waiting' | 'playing' | 'finished';
}

/** リーグ順位表 */
export interface LeagueStanding {
  teamId: string;
  teamName: string;
  leagueId: string;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameRatio: number;
  headToHeadWin: number;    // 直接対決判定用
  tiebreakReason?: string;  // 順位決定理由 (例: "直接対決", "ゲーム取得率")
}

/** 順位別トーナメントカテゴリ */
export type PlacementCategory = '1st' | '2nd' | '3rd' | '4th';

/** トーナメント1試合 */
export interface BracketMatch {
  matchId: string;
  category: PlacementCategory;
  round: number;
  position: number;
  team1Id: string | null;
  team2Id: string | null;
  team1Name: string;
  team2Name: string;
  team1League: string;
  team2League: string;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'bye';
  isBye: boolean;
  nextMatchId: string | null;
  nextSlot: 'team1' | 'team2' | null;
}

/** トーナメントブラケット */
export interface PlacementBracket {
  category: PlacementCategory;
  label: string;
  drawSize: number;
  teams: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[];
  matches: BracketMatch[];
}

/** フェーズ */
export type MixedPhase = 'import' | 'league' | 'standings' | 'tournament' | 'results';

/** 大会情報 */
export interface TournamentInfo {
  name: string;
  date: string;
  venue: string;
  rules: string[];
  /** 順位別トーナメントの並び順（リーグID配列） */
  bracketOrders?: {
    '2nd'?: string[];
    '3rd'?: string[];
    '4th'?: string[];
  };
}

/** Excelシート生データ（ビューア用） */
export interface ExcelSheetData {
  name: string;
  data: string[][];
}
