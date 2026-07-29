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

const toMin = (t?: string | null) => {
  if (!t) return Number.POSITIVE_INFINITY;
  const mm = t.match(/^(\d{1,2}):(\d{2})$/);
  return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : Number.POSITIVE_INFINITY;
};

/**
 * 「対戦順に並んだ試合リスト」からコート割当と控え番号を算出する。
 * orderedMatches は表示と同じ対戦順で渡すこと（採番＝表示順にするため再ソートしない）。
 */
export function assignStandbyInOrder(orderedMatches: Match[], courts: Court[]): Map<string, StandbyEntry> {
  const courtNameById = new Map(courts.map(c => [c.courtId, c.name]));

  // 現在使用中（試合中）のコート名 → 空きコート名を算出
  const playingCourtNames = new Set<string>();
  for (const m of orderedMatches) {
    if (m.status === 'playing' && m.courtId) {
      const n = courtNameById.get(m.courtId);
      if (n) playingCourtNames.add(n);
    }
  }
  // 空きコート名（重複コート定義があっても名前で一意化し、番号順に整列）
  const availableCourts = new Set(
    courts
      .filter(c => c.isAvailable && !playingCourtNames.has(c.name))
      .map(c => c.name),
  );
  const emptyCourtsSorted = [...availableCourts].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

  // 入れる（対戦相手が決まった待機）試合を対戦順のまま抽出（再ソートしない）
  const waiting = orderedMatches.filter(m =>
    (m.status === 'waiting' || m.status === 'ready')
    && !!m.player1Name && !!m.player2Name
    && m.player1Name !== 'BYE' && m.player2Name !== 'BYE');

  // 入るコートの割当（空きコート数を上限に、対戦順の上から順に割り当てる）:
  // - まず自分の割当コート(courtId)が空いていればそれを優先（LIVEコートマップと一致）
  // - 空いていなければ最も番号の若い空きコートを割り当てる
  // - 空きコートが尽きたら以降は控え
  // これにより初回割付前でも「1〜空きコート数」までしか入るコートが出ず、
  // 以降は自動的に控え1〜5…となる（コート番号が1周して重複しない）。
  const remaining = new Set(availableCourts);
  const enterByMatch = new Map<string, string>();
  for (const m of waiting) {
    if (remaining.size === 0) break;
    const own = m.courtId ? courtNameById.get(m.courtId) : undefined;
    let court: string | undefined;
    if (own && remaining.has(own)) {
      court = own;
    } else {
      court = emptyCourtsSorted.find(n => remaining.has(n));
    }
    if (court) {
      enterByMatch.set(m.matchId, court);
      remaining.delete(court);
    }
  }

  // 控え番号は待機試合を対戦順で上から1..MAX_STANDBY で採番する（「上から振り分け」）。
  // 空きコートに入れる試合(enterCourtName付き)にも控え番号を併記し、番号が飛ばないようにする。
  const map = new Map<string, StandbyEntry>();
  let idx = 0;
  for (const m of waiting) {
    idx++;
    const enter = enterByMatch.get(m.matchId) || null;
    map.set(m.matchId, {
      enterCourtName: enter,
      standbyLabel: idx <= MAX_STANDBY ? `控え${idx}` : null,
    });
  }
  return map;
}

/**
 * 全種目の試合とコートから、対戦順（開始時刻→対戦順(matchOrder)→ラウンド→ポジション）に
 * 沿って控え状況を算出する。ドロー画面など、対戦順リストを持たない画面で使用する。
 */
export function computeStandbyMap(matches: Match[], courts: Court[]): Map<string, StandbyEntry> {
  const ordered = [...matches].sort((a, b) => {
    const ta = toMin(a.scheduledTime), tb = toMin(b.scheduledTime);
    if (ta !== tb) return ta - tb;
    const oa = a.matchOrder || 9999, ob = b.matchOrder || 9999;
    if (oa !== ob) return oa - ob;
    if (a.round !== b.round) return a.round - b.round;
    return (a.position || 0) - (b.position || 0);
  });
  return assignStandbyInOrder(ordered, courts);
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
