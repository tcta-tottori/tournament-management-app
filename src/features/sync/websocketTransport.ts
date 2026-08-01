// =============================================
// WebSocket トランスポート
// 別端末間のリアルタイム同期（中継サーバー経由）
// =============================================

import type { SyncMessage, SyncTransport, SyncConnectionState } from './types';

/** 再接続の指数バックオフ設定 */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
/**
 * 再接続の指数バックオフの上限段数。
 * 試行そのものは打ち切らない（観戦端末は一日中開きっぱなしになるため、
 * 一定回数で諦めると復帰できなくなる）。待ち時間だけ RECONNECT_MAX_MS で頭打ちにする。
 */
const RECONNECT_BACKOFF_STEPS = 6;

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
  /** 接続が開いた（join 送信済み）タイミングの通知先 */
  private openHandlers: (() => void)[] = [];
  /** 切断中に送れなかった変更を保持し、再接続時に送信するキュー */
  private outboundQueue: SyncMessage[] = [];
  private queueHandlers: ((count: number) => void)[] = [];
  private state: SyncConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** 復帰トリガ（画面復帰・オンライン復帰）の解除関数 */
  private wakeUnsubscribe: (() => void) | null = null;
  /** 直近の ping 送信時刻（往復時間の計測用） */
  private pingSentAt = 0;
  /** 中継サーバーとの往復時間(ms)。ライブスコアの配信遅延の目安 */
  private latencyMs: number | null = null;
  private latencyHandlers: ((ms: number) => void)[] = [];

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
    this.setupWakeTriggers();
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    this.teardownWakeTriggers();
    if (this.ws) {
      // leave メッセージを送信
      this.sendEnvelope({ action: 'leave', roomCode: this.roomCode });
      this.closeSocket();
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

  /**
   * 接続が確立して join を送り終えたタイミングを購読する。
   * device-hello / request-snapshot などの制御メッセージは
   * ソケットが開く前に送っても捨てられるため、ここで送り直す必要がある。
   */
  onOpen(handler: () => void): void {
    this.openHandlers.push(handler);
  }

  getState(): SyncConnectionState {
    return this.state;
  }

  /** 中継サーバーとの往復時間(ms)の変化を購読 */
  onLatency(handler: (ms: number) => void): void {
    this.latencyHandlers.push(handler);
  }

  /** 直近に計測した往復時間(ms)。未計測なら null */
  getLatencyMs(): number | null {
    return this.latencyMs;
  }

  /** 切断していれば即座に再接続を試みる（画面復帰時などに使う） */
  reconnectNow(): void {
    if (this.intentionalClose || !this.serverUrl || !this.roomCode) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  // === 内部実装 ===

  /**
   * スマホでは画面を閉じている間に WebSocket が切られることが多く、
   * バックオフ待ちのまま復帰が遅れて「観戦ページが止まって見える」原因になる。
   * 画面復帰・オンライン復帰を検知して即座に張り直す。
   */
  private setupWakeTriggers(): void {
    if (this.wakeUnsubscribe || typeof window === 'undefined') return;
    const onWake = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.reconnectNow();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    this.wakeUnsubscribe = () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }

  /** 現在のソケットのハンドラを外して閉じる（再接続の連鎖を断ち切る） */
  private closeSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // 既に閉じている場合は無視
    }
  }

  private teardownWakeTriggers(): void {
    if (this.wakeUnsubscribe) {
      this.wakeUnsubscribe();
      this.wakeUnsubscribe = null;
    }
  }

  private doConnect(): void {
    // 既存ソケットを閉じるときはハンドラを外してから閉じる。
    // 外さないと、閉じた古いソケットの onclose が再接続を予約し、
    // その再接続が今のソケットをまた閉じる…という無限ループになり、
    // 観戦端末の接続が1秒おきに切れ続けて配信を取りこぼしていた。
    this.closeSocket();
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    // 古いソケットのイベントで状態を動かさないよう、常に現行ソケットか確認する
    const isCurrent = () => this.ws === ws;

    this.ws.onopen = () => {
      if (!isCurrent()) return;
      this.reconnectAttempt = 0;
      this.setState('connected');
      // ルームに参加
      this.sendEnvelope({ action: 'join', roomCode: this.roomCode, viewer: this.viewer });
      // 切断中に溜まった変更を送信
      this.flushQueue();
      // 定期 ping
      this.startPing();
      // 制御メッセージ（hello / スナップショット要求）はここで初めて送れる
      for (const h of this.openHandlers) h();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (!isCurrent()) return;
      try {
        const data = JSON.parse(event.data as string);
        // ping への応答。往復時間を計測してライブスコアの遅延表示に使う
        if (data && data.action === 'pong') {
          if (this.pingSentAt > 0) {
            this.latencyMs = Math.max(0, Date.now() - this.pingSentAt);
            this.pingSentAt = 0;
            for (const h of this.latencyHandlers) h(this.latencyMs);
          }
          return;
        }
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
      if (!isCurrent()) return;
      this.ws = null;
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.setState('reconnecting');
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_STEPS)),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    const ping = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.pingSentAt = Date.now();
          this.ws.send(JSON.stringify({ action: 'ping' }));
        } catch { /* ignore */ }
      }
    };
    // 接続直後に1回計測し、以降は定期的に更新する
    ping();
    this.pingTimer = setInterval(ping, 15000);
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
