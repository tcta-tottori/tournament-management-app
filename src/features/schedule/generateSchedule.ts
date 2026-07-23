/**
 * generateSchedule.ts
 * 時間割Excelが無い場合に、確定済みドローから時間割（ImportedScheduleItem[]）を
 * 自動生成する。ドロー表に書かれた開始時刻から使用コート数を判定し、
 * autoSchedule でコート×時間枠に配置する。
 */

import { db } from '../../db/database';
import type { ImportedScheduleItem } from '../../stores/appStore';
import {
  extractMatchesFromDraw,
  autoSchedule,
  assignVenueCourtNames,
  type ScheduleConfig,
  type EventInfo,
  type Entry as ScheduleEntry,
  type Player as SchedulePlayer,
  type Draw as ScheduleDraw,
  type ScheduleMatch,
} from './scheduleEngine';

export interface GenerateScheduleOptions {
  /** 使用コート名（明示指定）。未指定なら courtCount から自動割当。 */
  courtNames?: string[];
  /** 使用コート数（courtNames 未指定時に使用）。 */
  courtCount?: number;
  /** 1試合の所要時間（分）。既定40分。 */
  matchDuration?: number;
  /** 開始時刻 'HH:MM'。既定 '09:00'。 */
  startTime?: string;
}

export interface GenerateScheduleResult {
  items: ImportedScheduleItem[];
  courtNames: string[];
  matchCount: number;
  usedCourtCount: number;
}

/**
 * 確定済みドローから時間割アイテムを生成する。
 * DBの draws / entries / players を読み、autoSchedule で配置する。
 */
export async function generateScheduleFromDraws(
  tournamentId: string,
  options: GenerateScheduleOptions = {},
): Promise<GenerateScheduleResult> {
  const matchDuration = options.matchDuration ?? 40;
  const startTime = options.startTime || '09:00';

  // コート名を決定（明示指定 > コート数から自動割当 > 既定6面）
  const courtNames =
    options.courtNames && options.courtNames.length > 0
      ? options.courtNames
      : assignVenueCourtNames(options.courtCount && options.courtCount > 0 ? options.courtCount : 6);

  if (courtNames.length === 0) {
    return { items: [], courtNames: [], matchCount: 0, usedCourtCount: 0 };
  }

  // 種目・選手を読み込み
  const allEvents = await db.events.where('tournamentId').equals(tournamentId).toArray();
  if (allEvents.length === 0) {
    return { items: [], courtNames, matchCount: 0, usedCourtCount: 0 };
  }

  const allPlayers = await db.players.toArray();
  const playersList: SchedulePlayer[] = allPlayers.map((p) => ({
    playerId: p.playerId,
    name: p.name,
  }));

  // 開始時刻('HH:MM')をスロットindexに変換する
  const startMinutes = (() => {
    const [h, m] = startTime.split(':').map((s) => parseInt(s, 10));
    return h * 60 + m;
  })();
  const timeToSlot = (hm: string): number | null => {
    const mt = hm.match(/^(\d{1,2}):(\d{2})$/);
    if (!mt) return null;
    const mins = parseInt(mt[1], 10) * 60 + parseInt(mt[2], 10);
    const slot = Math.round((mins - startMinutes) / matchDuration);
    return slot >= 0 ? slot : 0;
  };

  // 各種目のドローから試合を抽出
  let allScheduleMatches: ScheduleMatch[] = [];
  // ドロー表の記載時刻から算出した、試合ごとの目標スロット
  const targetSlotByMatchId = new Map<string, number>();
  for (let idx = 0; idx < allEvents.length; idx++) {
    const evt = allEvents[idx];
    const draw = await db.draws.where('eventId').equals(evt.eventId).first();
    if (!draw) continue;
    // ラウンドロビン（決勝リーグ等）はトーナメント抽出の対象外
    if (draw.drawType === 'roundRobin') continue;

    const entries = await db.entries.where('eventId').equals(evt.eventId).toArray();

    const eventInfo: EventInfo = {
      eventCode: evt.eventId,
      eventName: evt.name,
      eventOrder: idx,
    };
    const drawData: ScheduleDraw = {
      eventId: evt.eventId,
      drawSize: draw.drawSize,
      slots: draw.slots,
    };
    const entryList: ScheduleEntry[] = entries.map((e) => ({
      entryId: e.entryId,
      playerId: e.playerId,
      partnerId: e.partnerId,
    }));

    const extracted = extractMatchesFromDraw(drawData, entryList, playersList, eventInfo);

    // ドロー表に記載された1回戦の開始時刻を、各試合の目標スロットに変換
    const matchTimes = draw.matchTimes;
    if (matchTimes) {
      for (const m of extracted) {
        if (m.round !== 1) continue;
        // 1回戦の試合のペア上側位置 = 2*matchNumInRound - 1
        const topPos = 2 * m.matchNumInRound - 1;
        const hm = matchTimes[topPos];
        if (!hm) continue;
        const slot = timeToSlot(hm);
        if (slot != null) targetSlotByMatchId.set(m.matchId, slot);
      }
    }

    allScheduleMatches = allScheduleMatches.concat(extracted);
  }

  if (allScheduleMatches.length === 0) {
    return { items: [], courtNames, matchCount: 0, usedCourtCount: 0 };
  }

  // 自動スケジューリング（ドロー表の記載時刻を優先）
  const config: ScheduleConfig = {
    courtCount: courtNames.length,
    courtNames,
    matchDuration,
    startTime,
    targetSlotByMatchId: targetSlotByMatchId.size > 0 ? targetSlotByMatchId : undefined,
  };
  const slots = autoSchedule(allScheduleMatches, config);

  // engine matchId → ScheduleMatch（種目名・選手名の参照用）
  const matchMap = new Map(allScheduleMatches.map((m) => [m.matchId, m]));

  // ScheduleSlot → ImportedScheduleItem 変換
  const items: ImportedScheduleItem[] = [];
  // 時刻→コート順に並べて matchOrder を採番
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    const ca = parseInt(a.courtName, 10) || 0;
    const cb = parseInt(b.courtName, 10) || 0;
    return ca - cb;
  });

  let order = 0;
  for (const slot of sortedSlots) {
    const m = matchMap.get(slot.matchId);
    if (!m) continue;
    order++;
    items.push({
      eventName: m.eventName,
      roundLabel: slot.roundLabel,
      matchOrder: order,
      courtName: slot.courtName,
      startTime: slot.startTime,
      player1Hint: m.players[0] || undefined,
      player2Hint: m.players[1] || undefined,
    });
  }

  const usedCourts = new Set(items.map((i) => i.courtName));
  return {
    items,
    courtNames,
    matchCount: items.length,
    usedCourtCount: usedCourts.size,
  };
}
