// 団体戦 データ型定義

/** 個人選手 */
export interface TeamPlayer {
  name: string;
  affiliation: string;
  /** 表示名（省略時は苗字の先頭2文字） */
  displayName?: string;
}

/** チームメンバー（団体戦） */
export interface TeamMember {
  player: TeamPlayer;
  gender: 'M' | 'F';
}

/** 団体戦チーム */
export interface TeamEntry {
  teamId: string;           // "A-1", "B-3" etc.
  leagueId: string;         // "A" ~ "E"
  numberInLeague: number;   // 1-based
  teamNumber: number;       // Excel上の通し番号(①~㉒)
  teamName: string;         // "プラセール ルナ" etc.
  members: TeamMember[];    // チームメンバー一覧
  status: 'none' | 'entry' | 'def';
}

/**
 * 対戦種目
 * - 団体戦 (3対戦制): MIX / WD / MD
 * - クラブ対抗戦 (5対戦制): D3 / D2 / D1 / S2 / S1（全て男子）
 */
export type MatchType = 'MIX' | 'WD' | 'MD' | 'D3' | 'D2' | 'D1' | 'S2' | 'S1';

/** 対戦フォーマット */
export type TournamentMatchFormat = 'team' | 'club';

/** 対戦順定義 */
export interface MatchOrderEntry {
  matchNumber: number;
  team1Index: number;       // 1-based (①=1, ②=2...)
  team2Index: number;
}

/** リーグ */
export interface TeamLeague {
  leagueId: string;
  courtName: string;        // "5～8番コート" etc.
  teams: TeamEntry[];
  matchOrder: MatchOrderEntry[];
}

/** 種目別スコア */
export interface SubMatchScore {
  type: MatchType;
  score1: number | null;    // team1の取得ゲーム数
  score2: number | null;    // team2の取得ゲーム数
  tiebreakScore: number | null;
  winnerId: string | null;
  /** team1側の選手苗字（最大2名） */
  players1?: string[];
  /** team2側の選手苗字（最大2名） */
  players2?: string[];
  /** 打ち切り（途中終了）。true の場合チーム勝利数にはカウントしない */
  terminated?: boolean;
}

/** リーグ戦の1対戦（3種目セット） */
export interface TeamLeagueMatch {
  matchId: string;          // "league-A-1"
  leagueId: string;
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  subMatches: SubMatchScore[];  // MIX, WD, MD の3種目
  winnerId: string | null;      // 2本先取で勝利したチーム
  winsTeam1: number;           // team1の種目勝利数 (0-3 / 0-5)
  winsTeam2: number;           // team2の種目勝利数 (0-3 / 0-5)
  status: 'waiting' | 'playing' | 'finished';
}

/** リーグ順位表 */
export interface TeamLeagueStanding {
  teamId: string;
  teamName: string;
  leagueId: string;
  rank: number;
  wins: number;              // 対戦勝利数
  losses: number;            // 対戦敗北数
  pointsWon: number;         // 取得ポイント（種目勝利数合計）
  pointsLost: number;        // 失ポイント
  gamesWon: number;          // 取得ゲーム数合計
  gamesLost: number;         // 失ゲーム数合計
  gameRatio: number;         // ゲーム率
  tiebreakReason?: string;
}

/** 順位別トーナメントカテゴリ */
export type PlacementCategory = '1st' | '2nd' | '3rd' | '4th';

/** トーナメント1試合の種目別スコア */
export interface BracketSubMatchScore {
  type: MatchType;
  score1: number | null;
  score2: number | null;
  tiebreakScore: number | null;
  winnerId: string | null;
  players1?: string[];
  players2?: string[];
  /** 打ち切り（途中終了）。true の場合チーム勝利数にはカウントしない */
  terminated?: boolean;
}

/** タイブレーク判定ルール */
export type TiebreakRuleId = 'points' | 'gameRatio' | 'headToHead';

/** トーナメント1試合 */
export interface TeamBracketMatch {
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
  subMatches: BracketSubMatchScore[];
  winsTeam1: number;
  winsTeam2: number;
  winnerId: string | null;
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'bye';
  isBye: boolean;
  nextMatchId: string | null;
  nextSlot: 'team1' | 'team2' | null;
}

/** トーナメントブラケット */
export interface TeamPlacementBracket {
  category: PlacementCategory;
  label: string;
  drawSize: number;
  teams: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[];
  matches: TeamBracketMatch[];
}

/** フェーズ */
export type TeamPhase = 'import' | 'league' | 'standings' | 'tournament';

/** 大会情報 */
export interface TeamTournamentInfo {
  name: string;
  date: string;
  venue: string;
  rules: string[];
  gameRules?: Record<number, string>;
  bracketGameRule?: string;
  bracketOrders?: {
    '2nd'?: string[];
    '3rd'?: string[];
    '4th'?: string[];
  };
  /** 順位トーナメントの表示名カスタマイズ（例: '3位' を '3・4位' に） */
  bracketLabels?: Partial<Record<PlacementCategory, string>>;
  /**
   * 対戦フォーマット。'team'(既定)はMIX/WD/MDの3対戦、'club'はD3/D2/D1/S2/S1の5対戦。
   * 'club' の場合は順位別トーナメントを実施せず、リーグ戦のみで完結する。
   */
  matchFormat?: TournamentMatchFormat;
}

/** Excelシート生データ */
export interface ExcelSheetData {
  name: string;
  data: string[][];
}
