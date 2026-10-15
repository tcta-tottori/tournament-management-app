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
  tiebreakScore: number | null; // タイブレーク敗者側スコア
  winnerId: string | null;
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'bye';
  isBye: boolean;
  nextMatchId: string | null;
  nextSlot: 'team1' | 'team2' | null;
  /** コンソレーションの試合（round は 0。トーナメント表の線には乗らない） */
  isConsolation?: boolean;
  /** 要項の試合番号（❶ → 1）。番号のない試合は未設定 */
  matchNumber?: number;
}

/** コンソレーションの出場元（試合番号の勝者・敗者） */
export interface ConsolationSource {
  /** 要項の試合番号（❶ → 1） */
  number: number;
  result: 'winner' | 'loser';
}

/** コンソレーション1試合の定義（例: 「❶敗者-❷敗者」） */
export interface ConsolationDef {
  /** この試合の番号（要項に番号が振られていなければ通し番号を補う） */
  number: number;
  source1: ConsolationSource;
  source2: ConsolationSource;
}

/**
 * Excel の順位別トーナメント表から読み取ったトーナメントの形。
 * 1回戦のスロット並び（BYE位置を含む）と試合番号、コンソレーションの組み方を持つ。
 */
export interface BracketLayout {
  /** drawSize 分のスロット。リーグID（1位トーナメントは抽選のため空文字）、null=BYE */
  slots: (string | null)[];
  /** 試合ID → 要項の試合番号 */
  matchNumbers: Record<string, number>;
  /** コンソレーションの試合（要項の記載順） */
  consolation: ConsolationDef[];
}

/** トーナメントブラケット */
export interface PlacementBracket {
  category: PlacementCategory;
  label: string;
  drawSize: number;
  teams: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[];
  matches: BracketMatch[];
  /** 各スロットに入るリーグID（null=BYE）。未配置スロットの表示に使う */
  slotLeagueIds?: (string | null)[];
  /** BYEとなるスロット位置（0始まり） */
  byePositions?: number[];
  /** 試合ID → 要項の試合番号（❶ → 1） */
  matchNumbers?: Record<string, number>;
  /** コンソレーションの組み方。試合本体は matches に isConsolation として入る */
  consolation?: ConsolationDef[];
}

/** フェーズ */
export type MixedPhase = 'import' | 'league' | 'standings' | 'tournament' | 'waiting';

/** 大会情報 */
export interface TournamentInfo {
  name: string;
  date: string;
  venue: string;
  rules: string[];
  /** チーム数別ゲームルール (例: { 4: "ノーアド・6ゲームマッチ（6-6タイブレーク）", 5: "6ゲーム先取" }) */
  gameRules?: Record<number, string>;
  /** 決勝トーナメント用ゲームルール */
  bracketGameRule?: string;
  /** 順位別トーナメントの並び順（リーグID配列） */
  bracketOrders?: {
    '2nd'?: string[];
    '3rd'?: string[];
    '4th'?: string[];
  };
  /** 順位別トーナメント表の形（BYE位置・試合番号・コンソレーション）。bracketOrders より優先 */
  bracketLayouts?: Partial<Record<PlacementCategory, BracketLayout>>;
}

/** Excelシート生データ（ビューア用） */
export interface ExcelSheetData {
  name: string;
  data: string[][];
}
