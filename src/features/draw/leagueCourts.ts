// =============================================================================
// リーグ戦のコート割り当て
//
// リーグ戦（総当たり）は1〜2面を固定で使い、そのコートが空いたら次の対戦を
// 入れていく。試合ごとにコートを選ぶトーナメントとは運用が違うため、
// 割り当てはドロー（＝リーグ）単位で持つ（Draw.leagueCourtIds）。
//
// 割り当てたコートはそのリーグの専有になり、他の種目の「入るコート」候補からは
// 外す。ここではその判定に使う小さなマップづくりだけを担当する。
// =============================================================================

import type { Court, Draw, Match } from '../../db/database';

/** 1リーグに割り当てられる最大コート数 */
export const MAX_LEAGUE_COURTS = 2;

/** eventId → そのリーグが使うコートID（1〜2面）。割り当ての無い種目は含めない。 */
export function buildLeagueCourtMap(draws: Draw[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const d of draws) {
    const ids = (d.leagueCourtIds || []).filter(Boolean);
    if (ids.length > 0) map.set(d.eventId, ids.slice(0, MAX_LEAGUE_COURTS));
  }
  return map;
}

/**
 * コート名 → そのコートを専有しているリーグの eventId。
 * コートは名前で一意に扱う（同名のコート定義が複数あっても1面として数えるため）。
 */
export function buildReservedCourtNames(
  leagueCourtIds: Map<string, string[]>,
  courts: Court[],
): Map<string, string> {
  const nameById = new Map(courts.map(c => [c.courtId, c.name]));
  const reserved = new Map<string, string>();
  for (const [eventId, ids] of leagueCourtIds) {
    for (const id of ids) {
      const name = nameById.get(id);
      if (name) reserved.set(name, eventId);
    }
  }
  return reserved;
}

/**
 * リーグに割り当てたコートのうち、いま試合が入っていないもの。
 * 大会全体の進行中試合を見て判定する（他種目が同じコートを使っていないかも見る）。
 */
export function freeLeagueCourts(
  assignedIds: string[],
  courts: Court[],
  playingMatches: Match[],
): Court[] {
  const nameById = new Map(courts.map(c => [c.courtId, c.name]));
  const busyNames = new Set<string>();
  for (const m of playingMatches) {
    const name = m.courtId ? nameById.get(m.courtId) : undefined;
    if (name) busyNames.add(name);
  }
  const seen = new Set<string>();
  const free: Court[] = [];
  for (const id of assignedIds) {
    const court = courts.find(c => c.courtId === id);
    if (!court || court.isAvailable === false) continue;
    if (busyNames.has(court.name) || seen.has(court.name)) continue;
    seen.add(court.name);
    free.push(court);
  }
  return free.sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0));
}
