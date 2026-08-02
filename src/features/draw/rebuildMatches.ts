// =============================================
// ドローから対戦表（matches）を作り直す共通処理
//
// エントリー確定（個別・全種目一括）と、ドロー画面の「あたり修正」から
// 同じロジックで対戦表を組み直すためにここへ集約する。
//
// 重要: 既存の試合は全削除せず matchId で突き合わせて更新する。
// 対戦カードが変わっていない試合は、入力済みのスコア・勝者・状態・コート・
// 審判をそのまま引き継ぐ（試合の内部IDも保つので、ライブスコアやコート状況
// の紐付けも切れない）。
// =============================================

import { db } from '../../db/database';
import type { Draw, Match } from '../../db/database';

/** ドローのスロット（entryId / BYE / シード） */
type SlotLike = { position: number; entryId: string | null; seed: number; isBye: boolean };

/**
 * リーグ戦の対戦順を生成（サークル法）。
 * 3人: 1-2, 2-3, 1-3 / 4人: 1-4, 2-3, 1-3, 2-4, 1-2, 3-4 ...
 */
export function generateLeagueMatchOrder(n: number): [number, number][] {
  if (n < 2) return [];
  if (n === 2) return [[0, 1]];
  if (n === 3) return [[0, 1], [1, 2], [0, 2]];
  const pairs: [number, number][] = [];
  const isOdd = n % 2 !== 0;
  const total = isOdd ? n + 1 : n; // 奇数の場合ダミー追加
  const fixed = 0;
  const rotating = Array.from({ length: total - 1 }, (_, i) => i + 1);
  for (let round = 0; round < total - 1; round++) {
    if (!isOdd || rotating[0] < n) {
      const a = fixed;
      const b = rotating[0];
      if (a < n && b < n) pairs.push([Math.min(a, b), Math.max(a, b)]);
    }
    for (let i = 1; i <= (total - 2) / 2; i++) {
      const a = rotating[i];
      const b = rotating[total - 2 - i];
      if (a < n && b < n) pairs.push([Math.min(a, b), Math.max(a, b)]);
    }
    rotating.push(rotating.shift()!);
  }
  return pairs;
}

/** 種目がリーグ戦（総当たり）かどうか */
export async function isLeagueEvent(eventId: string, draw: Draw): Promise<boolean> {
  const event = await db.events.where('eventId').equals(eventId).first();
  const eventType = event?.type as string | undefined;
  const ds = draw.drawSize;
  const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
  return (
    eventType === 'league' || eventType === 'round-robin' ||
    draw.drawType === 'roundRobin' ||
    (ds > 0 && !isPowerOf2) ||
    /リーグ/i.test(event?.name || '')
  );
}

/** ドローの内容から対戦表を組み立てる（DBへは書き込まない） */
export async function buildMatchesFromDraw(
  eventId: string,
  draw: Draw,
  isLeague: boolean,
): Promise<Omit<Match, 'id'>[]> {
  const eventEntries = await db.entries.where('eventId').equals(eventId).toArray();
  const allPlayers = await db.players.toArray();
  const pMap = new Map(allPlayers.map(p => [p.playerId, p]));

  const resolvePlayerFromSlot = (slot: { entryId: string | null; isBye: boolean }) => {
    if (slot.isBye || !slot.entryId) return { name: 'BYE', affiliation: '', entryId: null };
    const entry = eventEntries.find(e => e.entryId === slot.entryId);
    if (!entry) return { name: '(不明)', affiliation: '', entryId: slot.entryId };
    const p1 = pMap.get(entry.playerId);
    const p2 = entry.partnerId ? pMap.get(entry.partnerId) : null;
    const name = p2 && p1 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
    let aff = p1?.affiliation || '';
    if (p2 && p2.affiliation !== p1?.affiliation) aff = `${p1?.affiliation} / ${p2.affiliation}`;
    return { name, affiliation: aff, entryId: slot.entryId };
  };

  const newMatches: Omit<Match, 'id'>[] = [];

  if (isLeague) {
    // === リーグ戦: ラウンドロビン対戦表生成 ===
    const playerSlots = draw.slots.filter(s => s.entryId && !s.isBye);
    const matchPairs = generateLeagueMatchOrder(playerSlots.length);
    let matchOrder = 1;

    for (const [i, j] of matchPairs) {
      const p1Info = resolvePlayerFromSlot(playerSlots[i]);
      const p2Info = resolvePlayerFromSlot(playerSlots[j]);
      newMatches.push({
        eventId,
        matchId: `M-L-${matchOrder}`,
        round: 1,
        matchOrder,
        position: matchOrder,
        player1EntryId: p1Info.entryId,
        player2EntryId: p2Info.entryId,
        player1Name: p1Info.name,
        player2Name: p2Info.name,
        player1Affiliation: p1Info.affiliation,
        player2Affiliation: p2Info.affiliation,
        score: '',
        winnerEntryId: null,
        courtId: null,
        scheduledTime: null,
        status: 'waiting',
        refereeId: null,
        refereeName: '',
        updatedAt: Date.now(),
      });
      matchOrder++;
    }
    return newMatches;
  }

  // === トーナメント戦: ブラケット対戦表生成 ===
  // DBに保存されているドロー位置（position）をそのまま使用する
  const drawSlots: SlotLike[] = draw.slots
    .map(s => ({ position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye }))
    .sort((a, b) => a.position - b.position);

  let matchOrder = 1;

  // 1回戦
  for (let i = 0; i < drawSlots.length; i += 2) {
    const s1 = drawSlots[i];
    const s2 = drawSlots[i + 1];
    if (!s1 || !s2) continue;
    if (s1.isBye && s2.isBye) continue;
    const isWalkover = s1.isBye || s2.isBye;
    const p1Info = resolvePlayerFromSlot(s1);
    const p2Info = resolvePlayerFromSlot(s2);
    // ドロー表に記載された1回戦の開始時刻を標準の予定時刻として設定
    const drawMatchTime = draw.matchTimes?.[Math.min(s1.position, s2.position)] ?? null;

    newMatches.push({
      eventId, matchId: `M-R1-${matchOrder}`, round: 1, matchOrder,
      position: Math.floor(i / 2) + 1,
      player1EntryId: p1Info.entryId, player2EntryId: p2Info.entryId,
      player1Name: p1Info.name, player2Name: p2Info.name,
      player1Affiliation: p1Info.affiliation, player2Affiliation: p2Info.affiliation,
      score: '', winnerEntryId: isWalkover ? (s1.isBye ? p2Info.entryId : p1Info.entryId) : null,
      courtId: null, scheduledTime: isWalkover ? null : drawMatchTime,
      status: isWalkover ? 'walkover' : 'waiting',
      refereeId: null, refereeName: '', updatedAt: Date.now(),
    });
    matchOrder++;
  }

  // 2回戦以降
  const totalRounds = Math.log2(draw.drawSize);
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = draw.drawSize / Math.pow(2, round);
    for (let m = 0; m < matchesInRound; m++) {
      // ドロー表に記載された後続ラウンドの開始時刻を予定時刻として設定
      const drawRoundTime = draw.roundMatchTimes?.[`R${round}-${m + 1}`] ?? null;
      newMatches.push({
        eventId, matchId: `M-R${round}-${m + 1}`, round, matchOrder: matchOrder++,
        position: m + 1,
        player1EntryId: null, player2EntryId: null,
        player1Name: '', player2Name: '',
        player1Affiliation: '', player2Affiliation: '',
        score: '', winnerEntryId: null,
        courtId: null, scheduledTime: drawRoundTime, status: 'waiting',
        refereeId: null, refereeName: '', updatedAt: Date.now(),
      });
    }
  }

  return newMatches;
}

/**
 * 新しく組み立てた対戦表に、既存の試合の進行状況を引き継ぐ。
 * - 1回戦（リーグ戦は全試合）: 対戦カードが同じときだけ結果を引き継ぐ
 * - 2回戦以降: 勝ち上がった選手と結果を引き継ぐ
 *   （ドローから外れた選手が絡む枠はリセットする）
 */
export function mergeWithExisting(
  newMatches: Omit<Match, 'id'>[],
  existingMatches: Match[],
  draw: Draw,
): Omit<Match, 'id'>[] {
  const existingByMatchId = new Map(existingMatches.map(m => [m.matchId, m]));

  // 現在のドローに残っているエントリー
  const liveEntryIds = new Set(
    draw.slots.filter(s => s.entryId && !s.isBye).map(s => s.entryId as string)
  );

  /** 既存試合の進行情報（スコア・勝者・状態・コート・審判）を引き継ぐ */
  const carryProgress = (base: Omit<Match, 'id'>, old: Match): Omit<Match, 'id'> => ({
    ...base,
    score: old.score,
    winnerEntryId: old.winnerEntryId,
    status: old.status,
    gameRule: old.gameRule,
    courtId: old.courtId ?? base.courtId,
    scheduledTime: old.scheduledTime ?? base.scheduledTime,
    refereeId: old.refereeId,
    refereeName: old.refereeName,
    matchOrder: old.matchOrder,
  });

  return newMatches.map(nm => {
    const old = existingByMatchId.get(nm.matchId);
    if (!old) return nm;

    // 1回戦（リーグ戦は全試合）: 対戦カードが同じときだけ結果を引き継ぐ
    if (nm.round === 1) {
      const samePair =
        old.player1EntryId === nm.player1EntryId && old.player2EntryId === nm.player2EntryId;
      if (!samePair) return nm;
      // 不戦勝（BYE）は今回の生成結果を優先する
      if (nm.status === 'walkover') return nm;
      return carryProgress(nm, old);
    }

    // 2回戦以降: 勝ち上がった選手と結果を引き継ぐ
    const keepP1 = !old.player1EntryId || liveEntryIds.has(old.player1EntryId);
    const keepP2 = !old.player2EntryId || liveEntryIds.has(old.player2EntryId);
    if (!keepP1 && !keepP2) return nm;
    const advanced: Omit<Match, 'id'> = {
      ...nm,
      ...(keepP1 ? {
        player1EntryId: old.player1EntryId,
        player1Name: old.player1Name,
        player1Affiliation: old.player1Affiliation,
      } : {}),
      ...(keepP2 ? {
        player2EntryId: old.player2EntryId,
        player2Name: old.player2Name,
        player2Affiliation: old.player2Affiliation,
      } : {}),
    };
    // 片方の勝ち上がりが無効になった試合はスコアを引き継がない
    if (!keepP1 || !keepP2) return advanced;
    return carryProgress(advanced, old);
  });
}

/**
 * 1回戦の対戦カードが変わった試合を洗い出す。
 * 「あたり修正」で結果が消える試合を事前に知らせるために使う。
 */
export function findResetMatches(
  newMatches: Omit<Match, 'id'>[],
  existingMatches: Match[],
): Match[] {
  const newByMatchId = new Map(newMatches.map(m => [m.matchId, m]));
  return existingMatches.filter(old => {
    if (!old.score && !old.winnerEntryId) return false;
    const nm = newByMatchId.get(old.matchId);
    if (!nm) return true;
    if (nm.round !== 1) return false;
    return !(old.player1EntryId === nm.player1EntryId && old.player2EntryId === nm.player2EntryId);
  });
}

export interface RebuildResult {
  /** 生成した試合数 */
  generated: number;
  /** 入力済みスコアを引き継いだ試合数 */
  preserved: number;
  /** 対戦カードが変わってスコアを破棄した試合数 */
  reset: number;
}

/**
 * ドローの内容に合わせて種目の対戦表を作り直す。
 * 入力済みのスコアは可能な限り引き継ぐ。
 */
export async function rebuildEventMatches(eventId: string): Promise<RebuildResult | null> {
  const draw = await db.draws.where('eventId').equals(eventId).first();
  if (!draw) return null;

  const isLeague = await isLeagueEvent(eventId, draw);
  const newMatches = await buildMatchesFromDraw(eventId, draw, isLeague);
  const existingMatches = await db.matches.where('eventId').equals(eventId).toArray();
  const mergedMatches = mergeWithExisting(newMatches, existingMatches, draw);
  const resetCount = findResetMatches(newMatches, existingMatches).length;
  const preserved = mergedMatches.filter(m => m.score || m.winnerEntryId).length;

  const existingByMatchId = new Map(existingMatches.map(m => [m.matchId, m]));

  await db.transaction('rw', db.matches, async () => {
    // 今回の生成に無い試合（ドロー変更で消えた分）だけ削除する
    const nextMatchIds = new Set(mergedMatches.map(m => m.matchId));
    const staleIds = existingMatches
      .filter(m => !nextMatchIds.has(m.matchId))
      .map(m => m.id)
      .filter((id): id is number => id !== undefined);
    if (staleIds.length > 0) await db.matches.bulkDelete(staleIds);

    for (const m of mergedMatches) {
      const old = existingByMatchId.get(m.matchId);
      if (old?.id != null) await db.matches.update(old.id, m);
      else await db.matches.add(m);
    }
  });

  // トーナメント戦のみ: BYE勝ちの選手を次ラウンドに反映
  if (!isLeague) {
    for (const wm of mergedMatches.filter(m => m.status === 'walkover')) {
      const nextRound = wm.round + 1;
      const nextPosition = Math.ceil(wm.position / 2);
      const nextMatch = await db.matches
        .where('eventId').equals(eventId)
        .filter(m => m.round === nextRound && m.position === nextPosition)
        .first();
      if (nextMatch?.id && wm.winnerEntryId) {
        const isWinnerP1 = wm.winnerEntryId === wm.player1EntryId;
        const winnerName = isWinnerP1 ? wm.player1Name : wm.player2Name;
        const winnerAff = isWinnerP1 ? wm.player1Affiliation : wm.player2Affiliation;
        const isUpper = wm.position % 2 === 1;
        await db.matches.update(nextMatch.id, {
          ...(isUpper
            ? { player1EntryId: wm.winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
            : { player2EntryId: wm.winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
          ),
          updatedAt: Date.now(),
        });
      }
    }
  }

  return { generated: mergedMatches.length, preserved, reset: resetCount };
}
