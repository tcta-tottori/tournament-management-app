// =============================================
// ライブスコアの選手番号（ドロー番号）
//
// 結果表・結果画像と同じ「番号 選手名（所属）」で表示するための番号を返す。
// 配信開始時に LiveScore へ記録しているが、この対応より前に始まった試合や
// 抽選をやり直した試合では持っていないため、ドローから引き直して補う。
// =============================================

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { LiveScore } from '../../db/database';

export interface PlayerNumbers {
  p1?: number;
  p2?: number;
}

export function usePlayerNumbers(live: LiveScore | null | undefined): PlayerNumbers {
  const eventId = live?.eventId ?? '';
  const entry1 = live?.player1EntryId ?? null;
  const entry2 = live?.player2EntryId ?? null;
  const stored1 = live?.player1Number;
  const stored2 = live?.player2Number;

  const fromDraw = useLiveQuery(async () => {
    if (!eventId) return null;
    if (stored1 != null && stored2 != null) return null;
    const draw = await db.draws.where('eventId').equals(eventId).first();
    if (!draw) return null;
    const positionOf = (entryId: string | null) =>
      entryId ? draw.slots.find(s => s.entryId === entryId)?.position : undefined;
    return { p1: positionOf(entry1), p2: positionOf(entry2) };
  }, [eventId, entry1, entry2, stored1, stored2]);

  return {
    p1: stored1 ?? fromDraw?.p1,
    p2: stored2 ?? fromDraw?.p2,
  };
}
