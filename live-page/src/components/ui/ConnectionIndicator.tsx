import { useConnectionStatus } from '../../lib/useFirestore';

export default function ConnectionIndicator() {
  const connected = useConnectionStatus();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-xs">
      <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className={connected ? 'text-emerald-300' : 'text-red-300'}>
        {connected ? '接続中' : '切断'}
      </span>
    </div>
  );
}
