// =============================================
// 同期ステータスインジケーター
// 赤背景のメニュー内に表示する小さなステータスアイコン
// =============================================

import { useState } from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';
import { useSyncStore } from './syncStore';
import SyncPanel from './SyncPanel';

export default function SyncStatusIndicator() {
  const { syncEnabled, connectionState, peers, pendingChanges } = useSyncStore();
  const [panelOpen, setPanelOpen] = useState(false);

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  // 同期有効なのに未接続 = 切断警告
  const isDisconnectedWarn = syncEnabled && connectionState === 'disconnected';
  const hasPending = pendingChanges > 0;

  return (
    <>
      <button
        onClick={() => setPanelOpen(true)}
        className="header-link relative"
        title={
          isDisconnectedWarn
            ? `同期が切断中${hasPending ? `（未送信 ${pendingChanges}件）` : ''}`
            : isConnected
            ? `同期中 (${peers.length + 1}台)${hasPending ? ` / 未送信 ${pendingChanges}件` : ''}`
            : isConnecting
            ? '接続中...'
            : '同期設定を開く'
        }
      >
        {isDisconnectedWarn ? (
          <AlertTriangle className="w-3.5 h-3.5 text-white animate-pulse" />
        ) : isConnecting ? (
          <Loader2 className="w-3.5 h-3.5 text-white/80 animate-spin" />
        ) : isConnected ? (
          <Wifi className="w-3.5 h-3.5 text-white" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-white/55" />
        )}
        <span>
          {isDisconnectedWarn ? '切断' : isConnecting ? '接続中' : isConnected ? `同期${peers.length + 1}` : '同期'}
          {hasPending ? `(${pendingChanges})` : ''}
        </span>
      </button>
      <SyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
