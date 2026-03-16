import Dexie, { type EntityTable } from 'dexie';

// ---------------------------
// 1. 大会情報 (Tournament)
// ---------------------------
export interface Tournament {
  id?: number;
  tournamentId: string; // "T-2026-001" 等
  name: string;
  date: string;
  venue: string;
  reserveDate: string;
  reserveVenue: string;
  createdAt: number;
}

// ---------------------------
// 2. 選手マスタ (Player)
// ランキング情報や所属情報を持つ
// ---------------------------
export interface Player {
  id?: number;
  playerId: string;     // ハッシュ等の一意なID
  name: string;         // "山田 太郎"
  furigana: string;     // "ヤマダ タロウ"
  affiliation: string;  // "フューズTC"
  rankings: Record<string, number>; // { "mens-singles": 1500 }
  isManual: boolean;
}

// ---------------------------
// 3. ふりがな辞書 (FuriganaDict)
// Playerとは独立して名前→ふりがなの変換規則を保持
// ---------------------------
export interface FuriganaDict {
  name: string;      // primary key "山田太郎" (スペース除去)
  furigana: string;  // "ヤマダタロウ"
  type: 'auto' | 'manual';
  updatedAt: number;
}

// ---------------------------
// 4. 種目 (Event)
// 大会に紐づく各カテゴリー
// ---------------------------
export interface Event {
  id?: number;
  tournamentId: string; // 外部キー
  eventId: string;      // "E-001"
  name: string;         // "一般男子シングルス"
  type: 'Singles' | 'Doubles' | 'Team';
  gameRules: {
    sets: number;
    games: number;
    deuce: boolean;
    tiebreakPoint: number;
  };
}

// ---------------------------
// 5. エントリーリスト (Entry)
// 種目に対して誰がエントリーしたか
// ---------------------------
export interface Entry {
  id?: number;
  eventId: string;      // 外部キー
  entryId: string;      // "EN-001"
  playerId: string;     // Playerのキー
  partnerId?: string;   // ダブルス時のパートナーのPlayerId
  teamId?: string;      // 団体戦時のチームID
  seedNo?: number;      // シード番号
  rankPoint: number;    // エントリー時の所持ポイント
  status: 'active' | 'withdrawn';
}

// ---------------------------
// 6. ドロー管理 (Draw)
// 抽選結果のポジションとエントリーの紐付けを保持
// ---------------------------
export interface Draw {
  id?: number;
  eventId: string;      // 外部キー
  drawSize: number;
  slots: {
    position: number;   // 1-indexed
    entryId: string | null; 
    seed: number;
    isBye: boolean;
  }[];
  updatedAt: number;
}

// ---------------------------
// 7. 試合管理 (Match)
// ドローの各対戦カードと試合進行・スコアを管理
// ---------------------------
export interface Match {
  id?: number;
  eventId: string;
  matchId: string;         // "M-001"
  round: number;           // ラウンド番号 (1=1回戦, 2=2回戦...)
  matchOrder: number;      // 対戦順 (表示/進行用)
  position: number;        // ドロー内の位置 (1回戦: 1,2,3,4...)
  player1EntryId: string | null;
  player2EntryId: string | null;
  player1Name: string;
  player2Name: string;
  player1Affiliation: string;
  player2Affiliation: string;
  score: string;           // "6-4 6-3" 等のスコア文字列
  winnerEntryId: string | null;
  courtId: string | null;  // 割り当てコートID
  scheduledTime: string | null; // "10:00" 等
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'walkover';
  refereeId: string | null;
  refereeName: string;
  updatedAt: number;
}

// ---------------------------
// 8. コート管理 (Court)
// ---------------------------
export interface Court {
  id?: number;
  tournamentId: string;
  courtId: string;         // "C-001"
  name: string;            // "A-1コート"
  surface: string;         // "ハード" | "オムニ" | "クレー"
  isAvailable: boolean;
  currentMatchId: string | null;
  order: number;           // 表示順
}

// ---------------------------
// データベースクラス定義
// ---------------------------
const db = new Dexie('TennisTournamentDB') as Dexie & {
  tournaments: EntityTable<Tournament, 'id'>;
  players: EntityTable<Player, 'id'>;
  furiganaDict: EntityTable<FuriganaDict, 'name'>;
  events: EntityTable<Event, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  draws: EntityTable<Draw, 'id'>;
  matches: EntityTable<Match, 'id'>;
  courts: EntityTable<Court, 'id'>;
};

// スキーマのバージョン定義
db.version(1).stores({
  tournaments: '++id, tournamentId, name',
  players: '++id, playerId, name, affiliation',
  furiganaDict: 'name',
  events: '++id, tournamentId, eventId, type',
  entries: '++id, eventId, playerId, partnerId, teamId'
});

db.version(2).stores({
  draws: '++id, eventId'
});

db.version(3).stores({
  matches: '++id, eventId, matchId, round, status, courtId',
  courts: '++id, tournamentId, courtId'
});

export { db };
