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
// データベースクラス定義
// ---------------------------
const db = new Dexie('TennisTournamentDB') as Dexie & {
  tournaments: EntityTable<Tournament, 'id'>,
  players: EntityTable<Player, 'id'>,
  furiganaDict: EntityTable<FuriganaDict, 'name'>,
  events: EntityTable<Event, 'id'>,
  entries: EntityTable<Entry, 'id'>
};

// スキーマのバージョン定義
db.version(1).stores({
  tournaments: '++id, tournamentId, name',
  players: '++id, playerId, name, affiliation', // rankings等の検索は不要なため省く
  furiganaDict: 'name',
  events: '++id, tournamentId, eventId, type',
  entries: '++id, eventId, playerId, partnerId, teamId'
});

export { db };
