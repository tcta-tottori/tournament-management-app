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

export class WebSocketTransport implements SyncTransport {
  private ws: WebSocket | null = null;
  private serverUrl = '';
  private roomCode = '';
  private viewer = false;
  private messageHandlers: ((msg: SyncMessage) => void)[] = [];
  private stateHandlers: ((state: SyncConnectionState) => void)[] = [];
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
    this.setState('disconnected');
  }

  send(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendEnvelope({
        action: 'broadcast',
        roomCode: this.roomCode,
        payload: message,
      });
    }
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
