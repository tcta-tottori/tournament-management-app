// =============================================
// ライブスコア 公開ビュー（観戦用）
//
// 運営端末の入力を WebSocket 経由で受信し、
// テレビ中継風のスコアテロップでリアルタイム表示する。
// =============================================

import { useLiveQuery } from 'dexie-react-hooks';
import { Radio, Clock } from 'lucide-react';
import { db } from '../../db/database';
import { useSyncStore } from '../sync/syncStore';
import LiveScoreBoard from '../livescore/LiveScoreBoard';
import { summarize } from '../livescore/liveScoreEngine';
import { useNow } from '../livescore/useNow';

/** 終了後もこの時間だけ FINAL 表示で残す */
const FINISHED_WINDOW_MS = 15 * 60 * 1000;

export default function PublicLiveScoreView() {
  // 「◯秒前に更新」表示と FINAL の表示期限判定に使う時計
  const now = useNow(5000);

  const lastSyncAt = useSyncStore(s => s.lastSyncAt);
  const latencyMs = useSyncStore(s => s.latencyMs);

  const all = useLiveQuery(() => db.liveScores.toArray(), []) || [];

  const visible = all
    .filter(l => l.status === 'live' || now - l.updatedAt < FINISHED_WINDOW_MS)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
      const ca = a.courtName || '￿';
      const cb = b.courtName || '￿';
      if (ca !== cb) return ca.localeCompare(cb, 'ja', { numeric: true });
      return a.matchOrder - b.matchOrder;
    });

  const liveCount = visible.filter(l => l.status === 'live').length;

  return (
    <div className="max-w-3xl mx-auto px-3 py-4 space-y-4">
      {/* 見出し */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-800">
          <span className="relative flex h-2.5 w-2.5">
            {liveCount > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${liveCount > 0 ? 'bg-red-500' : 'bg-gray-300'}`} />
          </span>
          ライブスコア
          {liveCount > 0 && <span className="text-xs font-bold text-red-600">{liveCount}試合 進行中</span>}
        </h2>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          {latencyMs != null && <span>配信遅延 約{latencyMs}ms</span>}
          {lastSyncAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(now - lastSyncAt)}に更新
            </span>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <Radio className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">現在ライブスコアを配信中の試合はありません。</p>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            運営がコートでライブスコアを開始すると、ここに1ポイントごとの経過が表示されます。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {visible.map(l => (
            <div key={`${l.eventId}-${l.matchId}`}>
              <LiveScoreBoard live={l} size="md" />
              <p className="mt-1 text-[11px] text-gray-500">
                {l.status === 'finished' ? '最終スコア ' : 'スコア '}
                <span className="font-bold text-gray-700">{summarize(l, l.config)}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center leading-relaxed pt-2">
        ライブスコアは運営端末の入力に合わせて自動更新されます（更新の操作は不要です）。
      </p>
    </div>
  );
}

function relativeTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  return `${Math.floor(m / 60)}時間前`;
}
