/**
 * Firestore 同期ステータスバッジ
 *
 * ヘッダー右上に表示し、リアルタイム同期の状態を視覚的に通知する。
 * Firebase 未設定時（disabled）は非表示。
 */
import { useState, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudOff, Cloud } from 'lucide-react';
import { useSyncStatus, useManualSync } from '../../hooks/useFirestoreSync';
import { isFirebaseEnabled } from '../../lib/firebase';

export default function SyncStatusBadge() {
  const { status, message } = useSyncStatus();
  const { triggerFullSync } = useManualSync();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await triggerFullSync();
    } finally {
      setIsSyncing(false);
    }
  }, [triggerFullSync, isSyncing]);

  // Firebase 未設定時は非表示
  if (!isFirebaseEnabled) return null;

  const configs: Record<
    string,
    { icon: typeof Wifi; label: string; color: string; bg: string; pulse?: boolean }
  > = {
    idle: {
      icon: Cloud,
      label: 'LIVE 同期中',
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/20',
    },
    syncing: {
      icon: RefreshCw,
      label: '同期中...',
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/20',
      pulse: true,
    },
    error: {
      icon: CloudOff,
      label: '同期エラー',
      color: 'text-amber-300',
      bg: 'bg-amber-500/20',
    },
    offline: {
      icon: WifiOff,
      label: 'オフライン',
      color: 'text-red-300',
      bg: 'bg-red-500/20',
    },
    disabled: {
      icon: CloudOff,
      label: '同期無効',
      color: 'text-gray-400',
      bg: 'bg-gray-500/20',
    },
  };

  const config = configs[status] || configs.disabled;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleManualSync}
        disabled={isSyncing}
        className={`
          flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
          ${config.bg} ${config.color}
          hover:brightness-125 transition-all cursor-pointer
          ${config.pulse ? 'animate-pulse' : ''}
        `}
        title={message || config.label}
      >
        <Icon className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">{config.label}</span>
      </button>
    </div>
  );
}
