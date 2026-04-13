// =============================================
// 同期ステータスインジケーター
// ヘッダーバーに表示する小さなステータスアイコン
// =============================================

import { useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useSyncStore } from './syncStore';
import SyncPanel from './SyncPanel';

export default function SyncStatusIndicator() {
  const { syncEnabled, connectionState, peers } = useSyncStore();
  const [panelOpen, setPanelOpen] = useState(false);

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';

  return (
    <>
      <button
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all hover:bg-white/10"
        title={
          isConnected
            ? `同期中 (${peers.length + 1}台)`
            : isConnecting
            ? '接続中...'
            : '同期設定を開く'
        }
      >
        {isConnecting ? (
          <Loader2 className="w-3.5 h-3.5 text-amber-300 animate-spin" />
        ) : isConnected ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-300" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-white/40" />
        )}
        {isConnected && (
          <span className="text-[10px] font-bold text-emerald-300">
            {peers.length + 1}
          </span>
        )}
      </button>
      <SyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
