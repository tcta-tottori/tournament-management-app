import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match, type Court } from '../../db/database';

/** 控え／入るコートのランキング情報 */
export interface StandbyEntry {
  /** 空きコートに割り当てられた場合の入るコート名（対戦順で若い順） */
  enterCourtName: string | null;
  /** 控え番号ラベル（控え1〜控え5）。大会全体で対戦順に採番し、6番目以降は null */
  standbyLabel: string | null;
}

/** 大会全体で最大何番目まで「控え」として番号表示するか */
export const MAX_STANDBY = 5;

/**
 * 大会全体で一意な試合キー。
 *
 * matchId は `M-R1-2` のように「種目内での連番」でしか採番されておらず、
 * 種目が違えば同じ matchId が普通に重複する（例: 男子B級と女子A級の両方に M-R1-2 がある）。
 * そのため matchId だけを Map のキーにすると、後から書き込んだ別種目の試合で
 * 値が上書きされ、控え番号が消える等の不具合になる。
 * 種目をまたいで試合を識別する場合は必ずこのキーを使うこと。
 */
export const matchKey = (m: { eventId: string; matchId: string }) => `${m.eventId}::${m.matchId}`;

const toMin = (t?: string | null) => {
  if (!t) return Number.POSITIVE_INFINITY;
  const mm = t.match(/^(\d{1,2}):(\d{2})$/);
  return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : Number.POSITIVE_INFINITY;
};

/**
 * 「対戦順に並んだ試合リスト」からコート割当と控え番号を算出する。
 * orderedMatches は表示と同じ対戦順で渡すこと（採番＝表示順にするため再ソートしない）。
 *
 * 戻り値の Map のキーは matchKey(試合)（= `eventId::matchId`）。
 * matchId は種目内でしか一意でないため、matchId 単独をキーにしてはいけない。
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

  // 入れる（対戦相手が決まった待機）試合を対戦順のまま抽出（再ソートしない）。
  // status は「試合中・終了・不戦勝以外」を待機とみなす（waiting/ready のほか、
  // 同期・復元で status が欠落したケースも控えに含めるため、除外リスト方式にする）。
  const waiting = orderedMatches.filter(m =>
    m.status !== 'playing' && m.status !== 'finished' && m.status !== 'walkover'
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
      enterByMatch.set(matchKey(m), court);
      remaining.delete(court);
    }
  }

  // 控え番号は大会全体で待機試合を対戦順に上から1..MAX_STANDBY で採番する（全体で控え1〜5）。
  // ただし「空きコートに今すぐ入れる試合(enterCourtName付き)」は控えではなく“入る”側なので
  // 採番対象から除外する。これにより、コート（1〜16面）へ入る試合と、その後ろで待つ
  // 控え（1〜5）が混ざらず、実際に入るコートが違っても対戦順の上から順に控え1・2・3…と
  // 割り振られる（例: 9:00 の試合が各コートに入り、9:40 の上位5試合が控え1〜5になる）。
  const map = new Map<string, StandbyEntry>();
  let idx = 0;
  for (const m of waiting) {
    const enter = enterByMatch.get(matchKey(m)) || null;
    let standbyLabel: string | null = null;
    if (!enter) {
      idx++;
      standbyLabel = idx <= MAX_STANDBY ? `控え${idx}` : null;
    }
    map.set(matchKey(m), {
      enterCourtName: enter,
      standbyLabel,
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
