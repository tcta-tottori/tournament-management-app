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
        className="relative flex items-center gap-1 px-2 py-1 rounded-lg transition-all hover:bg-white/20"
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
        {isConnected && !hasPending && (
          <span className="text-[10px] font-bold text-white">
            {peers.length + 1}
          </span>
        )}
        {/* 未送信件数バッジ */}
        {hasPending && (
          <span className="text-[10px] font-bold text-white">
            {pendingChanges}
          </span>
        )}
      </button>
      <SyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
