// =============================================
// BroadcastChannel トランスポート
// 同一デバイス上の複数タブ間でデータを同期
// =============================================

import type { SyncMessage, SyncTransport, SyncConnectionState } from './types';

const CHANNEL_PREFIX = 'tennis-sync-';

export class BroadcastTransport implements SyncTransport {
  private channel: BroadcastChannel | null = null;
  private messageHandlers: ((msg: SyncMessage) => void)[] = [];
  private stateHandlers: ((state: SyncConnectionState) => void)[] = [];
  private state: SyncConnectionState = 'disconnected';

  connect(roomCode: string): void {
    this.disconnect();
    try {
      this.channel = new BroadcastChannel(`${CHANNEL_PREFIX}${roomCode}`);
      this.channel.onmessage = (event: MessageEvent) => {
        try {
          const msg = event.data as SyncMessage;
          if (msg && msg.type && msg.deviceId) {
            for (const handler of this.messageHandlers) {
              handler(msg);
            }
          }
        } catch {
          // 不正なメッセージは無視
        }
      };
      this.setState('connected');
    } catch {
      this.setState('disconnected');
    }
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.setState('disconnected');
  }

  send(message: SyncMessage): void {
    if (this.channel && this.state === 'connected') {
      try {
        this.channel.postMessage(message);
      } catch {
        // BroadcastChannel が閉じている場合等
      }
    }
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

  private setState(state: SyncConnectionState): void {
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }
}
