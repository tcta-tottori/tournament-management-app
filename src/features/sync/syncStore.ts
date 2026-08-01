import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyncConnectionState, SyncPeer } from './types';

// =============================================
// ビルド時に埋め込まれるインターネット公開用の既定設定
// GitHub Actions のシークレット/変数から注入される。
//   VITE_SYNC_SERVER_URL … 公開中継サーバー(wss://xxx.onrender.com)
//   VITE_PUBLIC_ROOM      … HP掲載用の固定ルームコード(例: TCTA01)
// これらが設定されていれば、各端末は個別設定なしで
// インターネット越しに観戦データを閲覧・配信できる。
// =============================================

/** 既定の中継サーバーURL（未設定なら空文字） */
export const DEFAULT_SERVER_URL: string =
  ((import.meta.env.VITE_SYNC_SERVER_URL as string | undefined) || '').trim();

/** HP掲載用の固定公開ルームコード（未設定なら空文字） */
export const PUBLIC_ROOM: string =
  ((import.meta.env.VITE_PUBLIC_ROOM as string | undefined) || '').trim().toUpperCase();

/** インターネット公開が有効か（サーバーURLが埋め込まれているか） */
export const PUBLIC_PUBLISH_ENABLED = !!DEFAULT_SERVER_URL;

// デバイスIDの生成・保持
function getOrCreateDeviceId(): string {
  const key = 'sync-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function getDefaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'Android';
  if (/Android/i.test(ua)) return 'Android Tablet';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Win/i.test(ua)) return 'Windows PC';
  return 'Device';
}

interface SyncState {
  // === 永続化する設定 ===
  deviceId: string;
  deviceName: string;
  serverUrl: string;
  autoConnect: boolean;
  lastRoomCode: string;

  // === ランタイム状態（永続化しない） ===
  connectionState: SyncConnectionState;
  roomCode: string;
  peers: SyncPeer[];
  syncEnabled: boolean;
  lastSyncAt: number | null;
  pendingChanges: number;
  error: string | null;
  panelOpen: boolean;
  /** 中継サーバーとの往復時間(ms)。ライブスコアの配信遅延の目安として表示する */
  latencyMs: number | null;

  // === アクション ===
  setDeviceName: (name: string) => void;
  setServerUrl: (url: string) => void;
  setAutoConnect: (auto: boolean) => void;
  setLastRoomCode: (code: string) => void;
  setConnectionState: (state: SyncConnectionState) => void;
  setRoomCode: (code: string) => void;
  addPeer: (peer: SyncPeer) => void;
  removePeer: (deviceId: string) => void;
  updatePeerLastSeen: (deviceId: string) => void;
  clearPeers: () => void;
  setSyncEnabled: (enabled: boolean) => void;
  setLastSyncAt: (ts: number) => void;
  incrementPending: () => void;
  decrementPending: () => void;
  resetPending: () => void;
  setPendingChanges: (n: number) => void;
  setError: (error: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  setLatencyMs: (ms: number | null) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      // 永続化設定
      deviceId: getOrCreateDeviceId(),
      deviceName: getDefaultDeviceName(),
      serverUrl: DEFAULT_SERVER_URL,
      autoConnect: false,
      lastRoomCode: '',

      // ランタイム状態
      connectionState: 'disconnected',
      roomCode: '',
      peers: [],
      syncEnabled: false,
      lastSyncAt: null,
      pendingChanges: 0,
      error: null,
      panelOpen: false,
      latencyMs: null,

      // アクション
      setDeviceName: (name) => set({ deviceName: name }),
      setServerUrl: (url) => set({ serverUrl: url }),
      setAutoConnect: (auto) => set({ autoConnect: auto }),
      setLastRoomCode: (code) => set({ lastRoomCode: code }),
      setConnectionState: (state) => set({ connectionState: state, error: state === 'connected' ? null : undefined }),
      setRoomCode: (code) => set({ roomCode: code }),
      addPeer: (peer) =>
        set((s) => {
          const existing = s.peers.find((p) => p.deviceId === peer.deviceId);
          if (existing) {
            return { peers: s.peers.map((p) => (p.deviceId === peer.deviceId ? { ...p, ...peer, lastSeen: Date.now() } : p)) };
          }
          return { peers: [...s.peers, peer] };
        }),
      removePeer: (deviceId) =>
        set((s) => ({ peers: s.peers.filter((p) => p.deviceId !== deviceId) })),
      updatePeerLastSeen: (deviceId) =>
        set((s) => ({
          peers: s.peers.map((p) =>
            p.deviceId === deviceId ? { ...p, lastSeen: Date.now() } : p
          ),
        })),
      clearPeers: () => set({ peers: [] }),
      setSyncEnabled: (enabled) => set({ syncEnabled: enabled }),
      setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
      incrementPending: () => set((s) => ({ pendingChanges: s.pendingChanges + 1 })),
      decrementPending: () => set((s) => ({ pendingChanges: Math.max(0, s.pendingChanges - 1) })),
      resetPending: () => set({ pendingChanges: 0 }),
      setPendingChanges: (n) => set({ pendingChanges: Math.max(0, n) }),
      setError: (error) => set({ error }),
      setPanelOpen: (open) => set({ panelOpen: open }),
      setLatencyMs: (ms) => set({ latencyMs: ms }),
    }),
    {
      name: 'sync-settings-storage',
      partialize: (state) => ({
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        serverUrl: state.serverUrl,
        autoConnect: state.autoConnect,
        lastRoomCode: state.lastRoomCode,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SyncState>;
        return {
          ...current,
          ...p,
          // 保存済みのURLが空なら、ビルドに埋め込まれた既定サーバーを使う。
          // これで既存ユーザーでも設定不要でインターネット公開に追随できる。
          serverUrl: p.serverUrl && p.serverUrl.trim() ? p.serverUrl : DEFAULT_SERVER_URL,
        };
      },
    }
  )
);

/** ルームコードを生成（6桁の英数字） */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
