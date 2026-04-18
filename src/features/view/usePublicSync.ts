// =============================================
// 公開ビュー用 同期ブートストラップ
// URL の ?room=XXX&server=YYY を検知して
// syncEngine を観戦モードで起動する
// =============================================

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { syncEngine } from '../sync/syncEngine';
import { useSyncStore } from '../sync/syncStore';

export interface PublicSyncStatus {
  /** URL にルーム指定があるか */
  hasRoom: boolean;
  /** 現在接続中のルームコード */
  roomCode: string;
  /** サーバー設定の有無 */
  serverConfigured: boolean;
  /** 接続状態 */
  connectionState: ReturnType<typeof useSyncStore.getState>['connectionState'];
  /** 最後にデータを受信した時刻 */
  lastSyncAt: number | null;
  /** エラー */
  error: string | null;
}

/**
 * URL パラメータからルーム情報を取得し、観戦モードで同期エンジンを起動する。
 * 公開ビューのレイアウトで一度だけ呼び出す想定。
 */
export function usePublicSync(): PublicSyncStatus {
  const [params] = useSearchParams();
  const connectionState = useSyncStore(s => s.connectionState);
  const lastSyncAt = useSyncStore(s => s.lastSyncAt);
  const error = useSyncStore(s => s.error);
  const roomCode = useSyncStore(s => s.roomCode);

  const room = params.get('room') || '';
  const server = params.get('server') || '';
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!room) return;

    const syncStore = useSyncStore.getState();
    // 端末名を観戦者に固定（運営端末と区別）
    syncStore.setDeviceName('観戦端末');
    if (server) {
      syncStore.setServerUrl(server);
    }

    // 既に同じルームに同モードで接続中ならスキップ
    if (
      syncEngine.isActive() &&
      syncEngine.isViewerMode() &&
      syncStore.roomCode === room
    ) {
      setStarted(true);
      return;
    }

    syncEngine.start(room, server || undefined, true);
    setStarted(true);

    return () => {
      // 公開ビューから離脱したら同期を停止
      if (syncEngine.isActive() && syncEngine.isViewerMode()) {
        syncEngine.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, server]);

  return {
    hasRoom: !!room,
    roomCode: started ? roomCode : room,
    serverConfigured: !!server,
    connectionState,
    lastSyncAt,
    error,
  };
}
