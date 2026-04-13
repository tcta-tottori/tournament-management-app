// =============================================
// マルチデバイス同期 — 型定義
// =============================================

/** 同期メッセージの種別 */
export type SyncMessageType =
  | 'dexie-change'        // Dexie テーブルの個別変更
  | 'zustand-snapshot'    // Zustand ストアの全体スナップショット
  | 'request-snapshot'    // 新規参加端末からのスナップショット要求
  | 'snapshot-response'   // スナップショット応答
  | 'device-hello'        // 端末参加通知
  | 'device-bye';         // 端末離脱通知

/** Dexie テーブル変更内容 */
export interface DexieChangePayload {
  table: string;                          // テーブル名 (tournaments, matches, etc.)
  operation: 'create' | 'update' | 'delete';
  key: number | string;                   // プライマリキー
  data?: Record<string, unknown>;         // create/update 時のデータ
  modifications?: Record<string, unknown>; // update 時の差分
}

/** Zustand ストアスナップショット */
export interface ZustandSnapshotPayload {
  store: 'mixed' | 'team' | 'app';
  state: Record<string, unknown>;
}

/** スナップショット応答（全データ） */
export interface SnapshotResponsePayload {
  dexie: {
    table: string;
    rows: Record<string, unknown>[];
  }[];
  zustand: {
    store: string;
    state: Record<string, unknown>;
  }[];
}

/** 同期メッセージ本体 */
export interface SyncMessage {
  type: SyncMessageType;
  deviceId: string;
  deviceName: string;
  roomCode: string;
  timestamp: number;
  payload:
    | DexieChangePayload
    | ZustandSnapshotPayload
    | SnapshotResponsePayload
    | null;
}

/** 同期の接続状態 */
export type SyncConnectionState =
  | 'disconnected'   // 未接続
  | 'connecting'     // 接続中
  | 'connected'      // 接続済み
  | 'reconnecting';  // 再接続中

/** 同期ルームの情報 */
export interface SyncRoom {
  roomCode: string;
  createdAt: number;
  deviceCount: number;
}

/** 接続中のデバイス情報 */
export interface SyncPeer {
  deviceId: string;
  deviceName: string;
  joinedAt: number;
  lastSeen: number;
}

/** トランスポート層の共通インターフェース */
export interface SyncTransport {
  connect(roomCode: string): void;
  disconnect(): void;
  send(message: SyncMessage): void;
  onMessage(handler: (message: SyncMessage) => void): void;
  onStateChange(handler: (state: SyncConnectionState) => void): void;
  getState(): SyncConnectionState;
}
