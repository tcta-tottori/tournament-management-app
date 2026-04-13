import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyncConnectionState, SyncPeer } from './types';

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
  setError: (error: string | null) => void;
  setPanelOpen: (open: boolean) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      // 永続化設定
      deviceId: getOrCreateDeviceId(),
      deviceName: getDefaultDeviceName(),
      serverUrl: '',
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
      setError: (error) => set({ error }),
      setPanelOpen: (open) => set({ panelOpen: open }),
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
