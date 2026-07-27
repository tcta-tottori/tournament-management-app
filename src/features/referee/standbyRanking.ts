import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match, type Court } from '../../db/database';

/** 控え／入るコートのランキング情報 */
export interface StandbyEntry {
  /** 空きコートに割り当てられた場合の入るコート名（対戦順で若い順） */
  enterCourtName: string | null;
  /** 控え番号ラベル（控え1〜控え5）。6番目以降・入るコート割当時は null */
  standbyLabel: string | null;
}

/** 最大何番目まで「控え」として番号表示するか */
export const MAX_STANDBY = 5;

/**
 * 全種目の試合とコートから、対戦順（開始時刻→コート→ラウンド→ポジション→対戦順）に
 * 沿って「入れる（空きコート割当）」と「控え1〜5」を算出する。
 * 対戦順シートとドロー画面で共通の控え状況を表示するために使用する。
 */
export function computeStandbyMap(matches: Match[], courts: Court[]): Map<string, StandbyEntry> {
  const courtNameById = new Map(courts.map(c => [c.courtId, c.name]));

  // 現在使用中（試合中）のコート名 → 空きコート名を算出
  const playingCourtNames = new Set<string>();
  for (const m of matches) {
    if (m.status === 'playing' && m.courtId) {
      const n = courtNameById.get(m.courtId);
      if (n) playingCourtNames.add(n);
    }
  }
  const emptyCourtNames = courts
    .filter(c => c.isAvailable && !playingCourtNames.has(c.name))
    .map(c => c.name);
  const emptyCourtSet = new Set(emptyCourtNames);

  const toMin = (t?: string | null) => {
    if (!t) return Number.POSITIVE_INFINITY;
    const mm = t.match(/^(\d{1,2}):(\d{2})$/);
    return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : Number.POSITIVE_INFINITY;
  };
  // 対戦順（開始時刻→対戦順(matchOrder)→ラウンド→ポジション）で並べる。
  // matchOrder が大会全体の正規の対戦順なので、控えの採番はこれに従う。
  const waiting = matches
    .filter(m =>
      (m.status === 'waiting' || m.status === 'ready')
      && !!m.player1Name && !!m.player2Name
      && m.player1Name !== 'BYE' && m.player2Name !== 'BYE')
    .sort((a, b) => {
      const ta = toMin(a.scheduledTime), tb = toMin(b.scheduledTime);
      if (ta !== tb) return ta - tb;
      const oa = a.matchOrder || 9999, ob = b.matchOrder || 9999;
      if (oa !== ob) return oa - ob;
      if (a.round !== b.round) return a.round - b.round;
      return (a.position || 0) - (b.position || 0);
    });

  // 入るコートの割当:
  // 1) まず各試合の割当コート(courtId)が空いていれば、その自コートへ入れる（対戦順の若い方を優先）。
  // 2) 余った空きコートは、対戦順の若い未割当試合へ順に割り当てる。
  const enterByMatch = new Map<string, string>();
  const usedCourts = new Set<string>();
  for (const m of waiting) {
    const own = m.courtId ? courtNameById.get(m.courtId) : undefined;
    if (own && emptyCourtSet.has(own) && !usedCourts.has(own)) {
      enterByMatch.set(m.matchId, own);
      usedCourts.add(own);
    }
  }
  const leftoverCourts = emptyCourtNames.filter(n => !usedCourts.has(n));
  let li = 0;
  for (const m of waiting) {
    if (li >= leftoverCourts.length) break;
    if (enterByMatch.has(m.matchId)) continue;
    enterByMatch.set(m.matchId, leftoverCourts[li++]);
  }

  // 控え番号は「入れない」試合を対戦順で1から採番
  const map = new Map<string, StandbyEntry>();
  let standbyIdx = 0;
  for (const m of waiting) {
    const enter = enterByMatch.get(m.matchId);
    if (enter) {
      map.set(m.matchId, { enterCourtName: enter, standbyLabel: null });
    } else {
      standbyIdx++;
      map.set(m.matchId, { enterCourtName: null, standbyLabel: standbyIdx <= MAX_STANDBY ? `控え${standbyIdx}` : null });
    }
  }
  return map;
}

/** 大会全体の控えランキングを購読するフック */
export function useStandbyMap(tournamentId: string | null): Map<string, StandbyEntry> {
  const data = useLiveQuery(async () => {
    if (!tournamentId) return { matches: [] as Match[], courts: [] as Court[] };
    const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
    const eventIds = events.map(e => e.eventId);
    const matches = eventIds.length ? await db.matches.where('eventId').anyOf(eventIds).toArray() : [];
    const courts = await db.courts.where('tournamentId').equals(tournamentId).toArray();
    return { matches, courts };
  }, [tournamentId]) || { matches: [] as Match[], courts: [] as Court[] };
  return useMemo(() => computeStandbyMap(data.matches, data.courts), [data]);
}
