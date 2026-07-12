// =============================================
// WebSocket トランスポート
// 別端末間のリアルタイム同期（中継サーバー経由）
// =============================================

import type { SyncMessage, SyncTransport, SyncConnectionState } from './types';

/** 再接続の指数バックオフ設定 */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 20;

/** WebSocket 中継サーバー宛のメッセージラッパー */
interface WsEnvelope {
  action: 'join' | 'leave' | 'broadcast' | 'cache';
  roomCode: string;
  payload?: SyncMessage;
  /** join 時のみ: 観戦（読み取り専用）端末かどうか */
  viewer?: boolean;
}

/** オフライン中に保持する送信キューの上限 */
const MAX_QUEUE = 1000;

export class WebSocketTransport implements SyncTransport {
  private ws: WebSocket | null = null;
  private serverUrl = '';
  private roomCode = '';
  private viewer = false;
  private messageHandlers: ((msg: SyncMessage) => void)[] = [];
  private stateHandlers: ((state: SyncConnectionState) => void)[] = [];
  /** 切断中に送れなかった変更を保持し、再接続時に送信するキュー */
  private outboundQueue: SyncMessage[] = [];
  private queueHandlers: ((count: number) => void)[] = [];
  private state: SyncConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(serverUrl?: string) {
    if (serverUrl) this.serverUrl = serverUrl;
  }

  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  /** 観戦（読み取り専用）端末として接続するかを設定 */
  setViewer(viewer: boolean): void {
    this.viewer = viewer;
  }

  connect(roomCode: string): void {
    if (!this.serverUrl) return;
    this.roomCode = roomCode;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws) {
      // leave メッセージを送信
      this.sendEnvelope({ action: 'leave', roomCode: this.roomCode });
      this.ws.close();
      this.ws = null;
    }
    // 意図的な切断（同期停止）ではキューを破棄する
    if (this.outboundQueue.length > 0) {
      this.outboundQueue = [];
      this.notifyQueue();
    }
    this.setState('disconnected');
  }

  send(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendEnvelope({
        action: 'broadcast',
        roomCode: this.roomCode,
        payload: message,
      });
    } else {
      // 切断中はデータ変更をキューに退避し、再接続時に送信する
      this.enqueue(message);
    }
  }

  /** キュー件数の変化を購読 */
  onQueueChange(handler: (count: number) => void): void {
    this.queueHandlers.push(handler);
  }

  /** 現在の未送信件数 */
  getQueueLength(): number {
    return this.outboundQueue.length;
  }

  private notifyQueue(): void {
    for (const h of this.queueHandlers) h(this.outboundQueue.length);
  }

  /** 切断中の変更をキューに積む（データ変更のみ対象） */
  private enqueue(message: SyncMessage): void {
    // 送信対象は実データの変更のみ。制御メッセージ(hello/bye/request等)は捨てる
    if (message.type !== 'dexie-change' && message.type !== 'zustand-snapshot') {
      return;
    }
    // Zustand スナップショットは全体状態なので、同一ストアの古いものは破棄し最新のみ保持
    if (message.type === 'zustand-snapshot') {
      const store = (message.payload as { store?: string } | null)?.store;
      if (store) {
        this.outboundQueue = this.outboundQueue.filter(
          (m) => !(m.type === 'zustand-snapshot' && (m.payload as { store?: string } | null)?.store === store)
        );
      }
    }
    this.outboundQueue.push(message);
    // 上限超過時は最も古い変更から破棄（メモリ保護）
    while (this.outboundQueue.length > MAX_QUEUE) {
      this.outboundQueue.shift();
    }
    this.notifyQueue();
  }

  /** キューに溜まった変更をまとめて送信 */
  private flushQueue(): void {
    if (this.outboundQueue.length === 0) return;
    const pending = this.outboundQueue;
    this.outboundQueue = [];
    for (const msg of pending) {
      this.sendEnvelope({ action: 'broadcast', roomCode: this.roomCode, payload: msg });
    }
    this.notifyQueue();
  }

  /**
   * 中継サーバーに最新スナップショットをキャッシュ登録する。
   * 他端末へは中継されず、後から参加する観戦端末への初期配信に使われる。
   */
  sendCache(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendEnvelope({
        action: 'cache',
        roomCode: this.roomCode,
        payload: message,
      });
    }
  }

  /** WebSocket が接続済みか */
  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  onMessage(handler: (message: SyncMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onStateChange(handler: (state: SyncConnectionState) => void): void {
    this.stateHandlers.push(handler);
  }

  getState(): SyncConnectionState {
    return this.state;
  }

  // === 内部実装 ===

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      // ルームに参加
      this.sendEnvelope({ action: 'join', roomCode: this.roomCode, viewer: this.viewer });
      // 切断中に溜まった変更を送信
      this.flushQueue();
      // 定期 ping
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        // サーバーからのブロードキャストメッセージ
        if (data && data.type && data.deviceId) {
          const msg = data as SyncMessage;
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        }
      } catch {
        // パース失敗は無視
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      // onclose で再接続をハンドリング
    };
  }

  private sendEnvelope(envelope: WsEnvelope): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(envelope));
      } catch {
        // 送信失敗
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      this.setState('disconnected');
      return;
    }
    this.setState('reconnecting');
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ action: 'ping' }));
        } catch { /* ignore */ }
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: SyncConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }
}
