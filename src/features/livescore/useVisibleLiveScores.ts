// =============================================
// 観戦向けに表示するライブスコアの絞り込み
//
// 「進行中の試合を先に、同じ状態ならコート順」で並べ、
// 終了した試合も一定時間だけ FINAL として残す。
// 観戦ページと埋め込みページで同じ並びにするために共通化している。
// =============================================

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { LiveScore } from '../../db/database';
import { useNow } from './useNow';

/** 終了後もこの時間だけ表示に残す（既定15分） */
export const DEFAULT_FINISHED_WINDOW_MS = 15 * 60 * 1000;

export function useVisibleLiveScores(finishedWindowMs = DEFAULT_FINISHED_WINDOW_MS): {
  visible: LiveScore[];
  liveCount: number;
  now: number;
} {
  const now = useNow(5000);
  const all = useLiveQuery(() => db.liveScores.toArray(), []) || [];

  const visible = all
    .filter(l => l.status === 'live' || now - l.updatedAt < finishedWindowMs)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
      const ca = a.courtName || '￿';
      const cb = b.courtName || '￿';
      if (ca !== cb) return ca.localeCompare(cb, 'ja', { numeric: true });
      return a.matchOrder - b.matchOrder;
    });

  return { visible, liveCount: visible.filter(l => l.status === 'live').length, now };
}
