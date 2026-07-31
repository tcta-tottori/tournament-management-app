/**
 * repairDrawTimes.ts
 *
 * 取込済みのドロー表の開始時刻が「タイムゾーンぶんずれて」保存されている場合に補正する。
 *
 * 原因: ドロー表Excelの時刻セル（Dateオブジェクト）をUTCで読んでいたため、
 * 日本時間(UTC+9)のブラウザで取り込むと 9:00 → 0:00、9:40 → 0:40 のように
 * 9時間早い時刻として保存されていた（drawExcelParser の timeValueToHM で修正済み）。
 *
 * 既に取り込み済みの大会はドローを取り込み直さないと直らないため、
 * 「早朝すぎてありえない時刻（6:00より前）」だけをブラウザのUTCオフセットぶん
 * 進めて復旧する。テニスの大会で 0:00〜5:59 開始の試合は無いので、
 * 正しく取り込めているデータを壊すことはない。
 */

import { db } from '../../db/database';

/** 'HH:MM' → 分。不正なら null。 */
function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** 分 → 'HH:MM' */
function minutesToHm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** ずれている可能性がある時刻とみなす上限（この時刻より前なら補正対象） */
const IMPOSSIBLE_BEFORE = 6 * 60;

/**
 * ブラウザのUTCオフセット（分）。日本なら +540。
 * 0以下、または12時間を超える場合は補正しない（誤補正防止）。
 */
function utcOffsetMinutes(): number {
  const off = -new Date().getTimezoneOffset();
  return off > 0 && off <= 12 * 60 ? off : 0;
}

/** 1件の時刻文字列を補正する（対象外ならそのまま返す） */
function shiftIfImpossible(hm: string | undefined | null, offset: number): string | null {
  if (!hm) return null;
  const mins = hmToMinutes(hm);
  if (mins == null || mins >= IMPOSSIBLE_BEFORE) return null;
  const shifted = mins + offset;
  if (shifted >= 24 * 60) return null;
  return minutesToHm(shifted);
}

export interface RepairDrawTimesResult {
  /** 補正した時刻の件数（ドロー表の記載時刻＋試合の予定時刻の合計） */
  repairedCount: number;
}

/**
 * 大会内のドロー表記載時刻・試合の予定時刻のうち、ありえない早朝時刻を補正する。
 * 何も対象が無ければ何も書き込まない。
 */
export async function repairShiftedDrawTimes(tournamentId: string): Promise<RepairDrawTimesResult> {
  const offset = utcOffsetMinutes();
  if (!tournamentId || offset === 0) return { repairedCount: 0 };

  const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const eventIds = events.map((e) => e.eventId);
  if (eventIds.length === 0) return { repairedCount: 0 };

  let repairedCount = 0;

  // --- ドロー表に記載された時刻 ---
  const draws = await db.draws.where('eventId').anyOf(eventIds).toArray();
  for (const draw of draws) {
    if (draw.id == null) continue;
    const patch: Partial<typeof draw> = {};
    let changed = 0;

    if (draw.matchTimes) {
      const next: Record<number, string> = { ...draw.matchTimes };
      for (const [k, v] of Object.entries(draw.matchTimes)) {
        const fixed = shiftIfImpossible(v, offset);
        if (fixed) { next[Number(k)] = fixed; changed++; }
      }
      if (changed > 0) patch.matchTimes = next;
    }

    if (draw.roundMatchTimes) {
      const before = changed;
      const next: Record<string, string> = { ...draw.roundMatchTimes };
      for (const [k, v] of Object.entries(draw.roundMatchTimes)) {
        const fixed = shiftIfImpossible(v, offset);
        if (fixed) { next[k] = fixed; changed++; }
      }
      if (changed > before) patch.roundMatchTimes = next;
    }

    const fixedEventStart = shiftIfImpossible(draw.eventStartTime, offset);
    if (fixedEventStart) { patch.eventStartTime = fixedEventStart; changed++; }

    if (changed > 0) {
      await db.draws.update(draw.id, { ...patch, updatedAt: Date.now() });
      repairedCount += changed;
    }
  }

  // --- 生成済みの試合に書き込まれた予定時刻 ---
  const matches = await db.matches.where('eventId').anyOf(eventIds).toArray();
  for (const m of matches) {
    if (m.id == null) continue;
    const fixed = shiftIfImpossible(m.scheduledTime, offset);
    if (fixed) {
      await db.matches.update(m.id, { scheduledTime: fixed, updatedAt: Date.now() });
      repairedCount++;
    }
  }

  // --- 大会情報の開始時刻 ---
  const tournament = await db.tournaments.where('tournamentId').equals(tournamentId).first();
  if (tournament?.id != null) {
    const fixed = shiftIfImpossible(tournament.drawStartTime, offset);
    if (fixed) {
      await db.tournaments.update(tournament.id, { drawStartTime: fixed });
      repairedCount++;
    }
  }

  return { repairedCount };
}
