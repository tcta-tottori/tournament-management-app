// =============================================
// 公開ビュー用 同期ブートストラップ
// URL の ?room=XXX&server=YYY を検知して
// syncEngine を観戦モードで起動する
// =============================================

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { syncEngine } from '../sync/syncEngine';
import { useSyncStore, DEFAULT_SERVER_URL, PUBLIC_ROOM } from '../sync/syncStore';

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
  /** 手動でデータを取り直す */
  refresh: () => void;
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

  // URL に指定が無ければ、ビルドに埋め込まれた固定の公開ルーム/サーバーを使う。
  // これにより HP には ...  /view/league （クエリ無し）を貼るだけでよい。
  const room = params.get('room') || PUBLIC_ROOM;
  const server = params.get('server') || DEFAULT_SERVER_URL;
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

  const refresh = useCallback(() => {
    if (!room) return;
    if (syncEngine.isActive()) {
      syncEngine.refreshViewer();
    } else {
      syncEngine.start(room, server || undefined, true);
      setStarted(true);
    }
  }, [room, server]);

  return {
    hasRoom: !!room,
    roomCode: started ? roomCode : room,
    serverConfigured: !!server,
    connectionState,
    lastSyncAt,
    error,
    refresh,
  };
}
