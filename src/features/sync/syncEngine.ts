// =============================================
// 同期エンジン
// BroadcastChannel と WebSocket を統合し、
// Dexie / Zustand の変更を双方向に同期する
// =============================================

import { db } from '../../db/database';
import { useSyncStore } from './syncStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { BroadcastTransport } from './broadcastTransport';
import { WebSocketTransport } from './websocketTransport';
import type {
  SyncMessage,
  SyncTransport,
  DexieChangePayload,
  ZustandSnapshotPayload,
  SnapshotResponsePayload,
  SyncConnectionState,
} from './types';

/** リモートから適用中の変更を再ブロードキャストしないためのフラグ */
let isApplyingRemote = false;

/** 同期エンジンのシングルトン */
class SyncEngine {
  private broadcastTransport: BroadcastTransport;
  private wsTransport: WebSocketTransport;
  private transports: SyncTransport[] = [];
  private dexieUnsubscribers: (() => void)[] = [];
  private zustandUnsubscribers: (() => void)[] = [];
  private active = false;
  private roomCode = '';
  /** 観戦用の読み取り専用モード（変更の送信を行わない） */
  private viewerMode = false;

  /** Zustand スナップショット送信のデバウンスタイマー */
  private mixedDebounce: ReturnType<typeof setTimeout> | null = null;
  private teamDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.broadcastTransport = new BroadcastTransport();
    this.wsTransport = new WebSocketTransport();
    this.transports = [this.broadcastTransport, this.wsTransport];

    // メッセージハンドラを登録
    for (const t of this.transports) {
      t.onMessage((msg) => this.handleIncoming(msg));
    }

    // WebSocket の接続状態をストアに反映
    this.wsTransport.onStateChange((state) => {
      this.updateConnectionState(state);
    });
    this.broadcastTransport.onStateChange(() => {
      this.updateConnectionState();
    });
  }

  // ===========================
  // 公開 API
  // ===========================

  /**
   * 同期を開始（ルームに接続）
   * @param viewerMode true の場合、変更の送信を行わない読み取り専用モード
   */
  start(roomCode: string, serverUrl?: string, viewerMode = false): void {
    if (this.active) this.stop();
    this.roomCode = roomCode;
    this.active = true;
    this.viewerMode = viewerMode;

    const store = useSyncStore.getState();
    store.setRoomCode(roomCode);
    store.setLastRoomCode(roomCode);
    store.setSyncEnabled(true);
    store.setError(null);

    // BroadcastChannel 接続（常に有効）
    this.broadcastTransport.connect(roomCode);

    // WebSocket 接続（サーバーURLが設定されている場合）
    const wsUrl = serverUrl || store.serverUrl;
    if (wsUrl) {
      this.wsTransport.setServerUrl(wsUrl);
      this.wsTransport.connect(roomCode);
    }

    // 送信系フック/サブスクリプションは観戦モードでは登録しない
    if (!viewerMode) {
      this.setupDexieHooks();
      this.setupZustandSubscriptions();
    }

    // 自分の参加を通知
    this.broadcast({
      type: 'device-hello',
      deviceId: store.deviceId,
      deviceName: store.deviceName,
      roomCode,
      timestamp: Date.now(),
      payload: null,
    });

    // 既存デバイスにスナップショットを要求
    this.broadcast({
      type: 'request-snapshot',
      deviceId: store.deviceId,
      deviceName: store.deviceName,
      roomCode,
      timestamp: Date.now(),
      payload: null,
    });
  }

  /** 観戦モードかどうか */
  isViewerMode(): boolean {
    return this.viewerMode;
  }

  /** 同期を停止 */
  stop(): void {
    const store = useSyncStore.getState();

    // 離脱を通知
    if (this.active) {
      this.broadcast({
        type: 'device-bye',
        deviceId: store.deviceId,
        deviceName: store.deviceName,
        roomCode: this.roomCode,
        timestamp: Date.now(),
        payload: null,
      });
    }

    this.active = false;
    this.roomCode = '';
    this.viewerMode = false;

    // トランスポート切断
    for (const t of this.transports) {
      t.disconnect();
    }

    // フック解除
    for (const unsub of this.dexieUnsubscribers) unsub();
    this.dexieUnsubscribers = [];
    for (const unsub of this.zustandUnsubscribers) unsub();
    this.zustandUnsubscribers = [];

    if (this.mixedDebounce) clearTimeout(this.mixedDebounce);
    if (this.teamDebounce) clearTimeout(this.teamDebounce);

    store.setSyncEnabled(false);
    store.setConnectionState('disconnected');
    store.clearPeers();
    store.setRoomCode('');
    store.resetPending();
  }

  /** アクティブかどうか */
  isActive(): boolean {
    return this.active;
  }

  // ===========================
  // メッセージ送受信
  // ===========================

  /** 全トランスポートにメッセージをブロードキャスト */
  private broadcast(msg: SyncMessage): void {
    for (const t of this.transports) {
      t.send(msg);
    }
  }

  /** Dexie の変更をブロードキャスト */
  broadcastDexieChange(payload: DexieChangePayload): void {
    if (!this.active || isApplyingRemote) return;
    const store = useSyncStore.getState();
    this.broadcast({
      type: 'dexie-change',
      deviceId: store.deviceId,
      deviceName: store.deviceName,
      roomCode: this.roomCode,
      timestamp: Date.now(),
      payload,
    });
  }

  /** Zustand のスナップショットをブロードキャスト */
  broadcastZustandSnapshot(storeName: 'mixed' | 'team', state: Record<string, unknown>): void {
    if (!this.active || isApplyingRemote) return;
    const syncStore = useSyncStore.getState();
    this.broadcast({
      type: 'zustand-snapshot',
      deviceId: syncStore.deviceId,
      deviceName: syncStore.deviceName,
      roomCode: this.roomCode,
      timestamp: Date.now(),
      payload: { store: storeName, state } as ZustandSnapshotPayload,
    });
  }

  // ===========================
  // 受信メッセージの処理
  // ===========================

  private handleIncoming(msg: SyncMessage): void {
    const store = useSyncStore.getState();

    // 自分自身のメッセージは無視
    if (msg.deviceId === store.deviceId) return;

    // ルームコードが一致しない場合は無視
    if (msg.roomCode !== this.roomCode) return;

    switch (msg.type) {
      case 'dexie-change':
        this.applyDexieChange(msg.payload as DexieChangePayload);
        store.setLastSyncAt(Date.now());
        break;

      case 'zustand-snapshot':
        this.applyZustandSnapshot(msg.payload as ZustandSnapshotPayload);
        store.setLastSyncAt(Date.now());
        break;

      case 'request-snapshot':
        // 観戦モードでは自身のデータを配信しない
        if (!this.viewerMode) {
          this.sendFullSnapshot(msg.deviceId);
        }
        break;

      case 'snapshot-response':
        this.applyFullSnapshot(msg.payload as SnapshotResponsePayload);
        store.setLastSyncAt(Date.now());
        break;

      case 'device-hello':
        store.addPeer({
          deviceId: msg.deviceId,
          deviceName: msg.deviceName,
          joinedAt: Date.now(),
          lastSeen: Date.now(),
        });
        break;

      case 'device-bye':
        store.removePeer(msg.deviceId);
        break;
    }

    // peer の lastSeen を更新
    store.updatePeerLastSeen(msg.deviceId);
  }

  // ===========================
  // Dexie 変更の検知と適用
  // ===========================

  private setupDexieHooks(): void {
    const engine = this;
    const tables = [
      'tournaments', 'players', 'furiganaDict', 'events',
      'entries', 'draws', 'matches', 'courts', 'affiliationFurigana',
    ] as const;

    for (const tableName of tables) {
      const table = db.table(tableName);

      // creating フック
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createHook = function (this: any, _primKey: any, obj: any) {
        engine.broadcastDexieChange({
          table: tableName,
          operation: 'create',
          key: 0,
          data: { ...obj },
        });
      };
      table.hook('creating', createHook);

      // updating フック
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateHook = function (this: any, mods: any, primKey: any) {
        engine.broadcastDexieChange({
          table: tableName,
          operation: 'update',
          key: primKey as number | string,
          modifications: { ...mods },
        });
      };
      table.hook('updating', updateHook);

      // deleting フック
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deleteHook = function (this: any, primKey: any) {
        engine.broadcastDexieChange({
          table: tableName,
          operation: 'delete',
          key: primKey as number | string,
        });
      };
      table.hook('deleting', deleteHook);

      this.dexieUnsubscribers.push(() => {
        table.hook('creating').unsubscribe(createHook);
        table.hook('updating').unsubscribe(updateHook);
        table.hook('deleting').unsubscribe(deleteHook);
      });
    }
  }

  private async applyDexieChange(payload: DexieChangePayload): Promise<void> {
    isApplyingRemote = true;
    try {
      const table = db.table(payload.table);
      switch (payload.operation) {
        case 'create':
          if (payload.data) {
            // 既存チェック: 同じ論理キーがあれば上書き
            const logicalKey = this.getLogicalKeyField(payload.table);
            if (logicalKey && payload.data[logicalKey]) {
              const existing = await table
                .where(logicalKey)
                .equals(payload.data[logicalKey] as string)
                .first();
              if (existing) {
                const id = (existing as Record<string, unknown>).id ?? (existing as Record<string, unknown>).name;
                if (id !== undefined) {
                  await table.update(id as number, payload.data);
                  break;
                }
              }
            }
            // auto-increment の id を除いて追加
            const { id: _id, ...rest } = payload.data;
            void _id;
            await table.add(rest);
          }
          break;

        case 'update':
          if (payload.key && payload.modifications) {
            await table.update(payload.key as number, payload.modifications);
          }
          break;

        case 'delete':
          if (payload.key) {
            await table.delete(payload.key as number);
          }
          break;
      }
    } catch (err) {
      console.warn('[Sync] Dexie変更適用エラー:', err);
    } finally {
      isApplyingRemote = false;
    }
  }

  /** テーブルごとの論理キーフィールド（重複防止用） */
  private getLogicalKeyField(table: string): string | null {
    const map: Record<string, string> = {
      tournaments: 'tournamentId',
      players: 'playerId',
      events: 'eventId',
      entries: 'entryId',
      draws: 'eventId',
      matches: 'matchId',
      courts: 'courtId',
      furiganaDict: 'name',
      affiliationFurigana: 'name',
    };
    return map[table] || null;
  }

  // ===========================
  // Zustand スナップショットの検知と適用
  // ===========================

  private setupZustandSubscriptions(): void {
    // Mixed Store の監視
    const mixedUnsub = useMixedStore.subscribe(() => {
      if (isApplyingRemote) return;
      // デバウンス（500ms）
      if (this.mixedDebounce) clearTimeout(this.mixedDebounce);
      this.mixedDebounce = setTimeout(() => {
        const state = useMixedStore.getState();
        this.broadcastZustandSnapshot('mixed', this.extractMixedState(state as unknown as Record<string, unknown>));
      }, 500);
    });
    this.zustandUnsubscribers.push(mixedUnsub);

    // Team Store の監視
    const teamUnsub = useTeamStore.subscribe(() => {
      if (isApplyingRemote) return;
      if (this.teamDebounce) clearTimeout(this.teamDebounce);
      this.teamDebounce = setTimeout(() => {
        const state = useTeamStore.getState();
        this.broadcastZustandSnapshot('team', this.extractTeamState(state as unknown as Record<string, unknown>));
      }, 500);
    });
    this.zustandUnsubscribers.push(teamUnsub);
  }

  /** Mixed Store から同期対象のデータのみ抽出（関数を除外） */
  private extractMixedState(state: Record<string, unknown>): Record<string, unknown> {
    const {
      tournamentInfo, leagues, leagueMatches, brackets, allTeams,
      currentPhase, selectedLeagueId, selectedBracketCategory,
      importFileName, isImported, rankOverrides, bracketCourtAssignments,
      lastStandingsHash,
    } = state as Record<string, unknown>;
    return {
      tournamentInfo, leagues, leagueMatches, brackets, allTeams,
      currentPhase, selectedLeagueId, selectedBracketCategory,
      importFileName, isImported, rankOverrides, bracketCourtAssignments,
      lastStandingsHash,
    };
  }

  /** Team Store から同期対象のデータのみ抽出 */
  private extractTeamState(state: Record<string, unknown>): Record<string, unknown> {
    const {
      tournamentInfo, leagues, leagueMatches, brackets, allTeams,
      currentPhase, selectedLeagueId, selectedBracketCategory,
      importFileName, isImported, rankOverrides, bracketCourtAssignments,
      lastStandingsHash, tiebreakOrder,
    } = state as Record<string, unknown>;
    return {
      tournamentInfo, leagues, leagueMatches, brackets, allTeams,
      currentPhase, selectedLeagueId, selectedBracketCategory,
      importFileName, isImported, rankOverrides, bracketCourtAssignments,
      lastStandingsHash, tiebreakOrder,
    };
  }

  private applyZustandSnapshot(payload: ZustandSnapshotPayload): void {
    isApplyingRemote = true;
    try {
      if (payload.store === 'mixed') {
        useMixedStore.setState(payload.state);
      } else if (payload.store === 'team') {
        useTeamStore.setState(payload.state);
      }
    } catch (err) {
      console.warn('[Sync] Zustandスナップショット適用エラー:', err);
    } finally {
      // 次の tick で解除（setState が同期的に subscribe を発火するため）
      setTimeout(() => { isApplyingRemote = false; }, 0);
    }
  }

  // ===========================
  // フルスナップショット（初回同期）
  // ===========================

  private async sendFullSnapshot(_targetDeviceId: string): Promise<void> {
    try {
      const dexieData = await this.exportDexieData();
      const zustandData = this.exportZustandData();
      const store = useSyncStore.getState();
      this.broadcast({
        type: 'snapshot-response',
        deviceId: store.deviceId,
        deviceName: store.deviceName,
        roomCode: this.roomCode,
        timestamp: Date.now(),
        payload: {
          dexie: dexieData,
          zustand: zustandData,
        } as SnapshotResponsePayload,
      });
    } catch (err) {
      console.warn('[Sync] スナップショット送信エラー:', err);
    }
  }

  private async exportDexieData() {
    const tables = [
      'tournaments', 'players', 'events', 'entries',
      'draws', 'matches', 'courts',
    ];
    const result: { table: string; rows: Record<string, unknown>[] }[] = [];
    for (const t of tables) {
      const rows = await db.table(t).toArray();
      result.push({ table: t, rows: rows as Record<string, unknown>[] });
    }
    return result;
  }

  private exportZustandData() {
    const result: { store: string; state: Record<string, unknown> }[] = [];
    const mixedState = useMixedStore.getState();
    if (mixedState.isImported) {
      result.push({ store: 'mixed', state: this.extractMixedState(mixedState as unknown as Record<string, unknown>) });
    }
    const teamState = useTeamStore.getState();
    if (teamState.isImported) {
      result.push({ store: 'team', state: this.extractTeamState(teamState as unknown as Record<string, unknown>) });
    }
    return result;
  }

  private async applyFullSnapshot(payload: SnapshotResponsePayload): Promise<void> {
    isApplyingRemote = true;
    try {
      // Dexie データのインポート
      if (payload.dexie) {
        for (const tableData of payload.dexie) {
          if (tableData.rows.length === 0) continue;
          const table = db.table(tableData.table);
          // 既存データをクリアして上書き
          await table.clear();
          await table.bulkAdd(tableData.rows);
        }
      }
      // Zustand データのインポート
      if (payload.zustand) {
        for (const storeData of payload.zustand) {
          if (storeData.store === 'mixed') {
            useMixedStore.setState(storeData.state);
          } else if (storeData.store === 'team') {
            useTeamStore.setState(storeData.state);
          }
        }
      }
    } catch (err) {
      console.warn('[Sync] フルスナップショット適用エラー:', err);
    } finally {
      setTimeout(() => { isApplyingRemote = false; }, 0);
    }
  }

  // ===========================
  // 接続状態の統合管理
  // ===========================

  private updateConnectionState(wsState?: SyncConnectionState): void {
    const store = useSyncStore.getState();
    const bc = this.broadcastTransport.getState();
    const ws = wsState ?? this.wsTransport.getState();

    // WebSocket が使われていない場合は BroadcastChannel のみで判定
    if (!store.serverUrl) {
      store.setConnectionState(bc);
      return;
    }

    // いずれかが connected なら connected
    if (bc === 'connected' || ws === 'connected') {
      store.setConnectionState('connected');
    } else if (ws === 'connecting' || ws === 'reconnecting') {
      store.setConnectionState(ws);
    } else {
      store.setConnectionState('disconnected');
    }
  }
}

// シングルトンインスタンス
export const syncEngine = new SyncEngine();
