// =============================================
// ライブスコア — DB 操作
//
// liveScores テーブルへの書き込みは同期エンジンの Dexie フックに拾われ、
// そのまま WebSocket で観戦端末へ配信される（＝1ポイント毎にリアルタイム反映）。
// =============================================

import { db } from '../../db/database';
import { propagateByes } from '../draw/rebuildMatches';
import type { LiveScore, LiveScoreConfig, MatchFormatType } from '../../db/database';
import {
  applyConfig,
  buildConfig,
  buildScoreString,
  createInitialState,
  type ScoreState,
} from './liveScoreEngine';

/** ライブスコア開始に必要な情報 */
export interface StartLiveScoreParams {
  /** 対象試合の Dexie 内部ID */
  dbId: number;
  eventName: string;
  roundName: string;
  gameRuleText?: string | null;
  requiredGames?: number | null;
  matchFormat?: MatchFormatType;
  /** 先にサーブする側（省略時はプレイヤー1） */
  server?: 1 | 2;
}

/**
 * 指定試合のライブスコアを開始（既にあれば再開）する。
 * 併せて試合ステータスを「試合中」にする。
 * @returns 作成/取得した LiveScore の matchId（画面遷移のキーに使う）
 */
export async function startLiveScore(params: StartLiveScoreParams): Promise<LiveScore | null> {
  const match = await db.matches.get(params.dbId);
  if (!match) return null;

  // ドロー番号（テロップの「番号 選手名（所属）」表示用）。
  // 結果表・結果画像と同じくドローのポジション番号をそのまま使う。
  const draw = await db.draws.where('eventId').equals(match.eventId).first();
  const numberOf = (entryId: string | null): number | undefined => {
    if (!entryId || !draw) return undefined;
    const slot = draw.slots.find(s => s.entryId === entryId);
    return slot && slot.position > 0 ? slot.position : undefined;
  };
  const player1Number = numberOf(match.player1EntryId);
  const player2Number = numberOf(match.player2EntryId);

  const existing = await findLiveScore(match.matchId, match.eventId);
  if (existing) {
    // 既存のライブスコアを再開（終了済みなら live に戻す）。
    // ドロー番号を持たない古い記録はここで補う。
    const patch: Partial<LiveScore> = {};
    if (existing.player1Number == null && player1Number != null) patch.player1Number = player1Number;
    if (existing.player2Number == null && player2Number != null) patch.player2Number = player2Number;
    if (existing.status === 'finished') patch.status = 'live';
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await db.liveScores.update(existing.id!, patch);
    }
    return { ...existing, ...patch };
  }

  const event = await db.events.where('eventId').equals(match.eventId).first();
  const court = match.courtId
    ? await db.courts.where('courtId').equals(match.courtId).first()
    : undefined;

  // シード番号（中継テロップの「(1)」表示用）。
  // entries は entryId にインデックスが無いため、種目で絞ってから突き合わせる。
  const eventEntries = await db.entries.where('eventId').equals(match.eventId).toArray();
  const seedOf = (entryId: string | null): number | undefined => {
    if (!entryId) return undefined;
    const entry = eventEntries.find(e => e.entryId === entryId);
    return entry?.seedNo && entry.seedNo > 0 ? entry.seedNo : undefined;
  };

  const config: LiveScoreConfig = buildConfig({
    gameRuleText: params.gameRuleText,
    requiredGames: params.requiredGames,
    matchFormat: params.matchFormat,
  });
  const initial = createInitialState(params.server ?? 1);
  const now = Date.now();

  const record: LiveScore = {
    matchId: match.matchId,
    eventId: match.eventId,
    tournamentId: event?.tournamentId || '',
    eventName: params.eventName || event?.name || '',
    roundName: params.roundName || `${match.round}回戦`,
    matchOrder: match.matchOrder,
    courtId: match.courtId,
    courtName: court?.name || '',
    player1Name: match.player1Name,
    player2Name: match.player2Name,
    player1Affiliation: match.player1Affiliation,
    player2Affiliation: match.player2Affiliation,
    player1EntryId: match.player1EntryId,
    player2EntryId: match.player2EntryId,
    player1Number,
    player2Number,
    player1Seed: seedOf(match.player1EntryId),
    player2Seed: seedOf(match.player2EntryId),
    config,
    ...initial,
    startedAt: now,
    updatedAt: now,
  };

  const id = await db.liveScores.add(record);

  // 試合が未開始なら「試合中」にする
  if (match.status === 'waiting' || match.status === 'ready') {
    await db.matches.update(params.dbId, { status: 'playing', updatedAt: now });
  }

  return { ...record, id };
}

/** matchId + eventId でライブスコアを取得 */
export async function findLiveScore(matchId: string, eventId: string): Promise<LiveScore | undefined> {
  const rows = await db.liveScores.where('matchId').equals(matchId).toArray();
  if (rows.length === 0) return undefined;
  return rows.find(r => r.eventId === eventId) ?? rows[0];
}

/** 進行状態を保存（1ポイント毎に呼ばれる。ここでの update がそのまま配信される） */
export async function saveScoreState(live: LiveScore, next: ScoreState): Promise<void> {
  if (live.id == null) return;
  await db.liveScores.update(live.id, {
    sets: next.sets,
    p1Points: next.p1Points,
    p2Points: next.p2Points,
    isTiebreak: next.isTiebreak,
    isSuperTiebreak: next.isSuperTiebreak,
    server: next.server,
    status: next.status,
    winner: next.winner,
    lastPointBy: next.lastPointBy,
    tiebreakFirstServer: next.tiebreakFirstServer ?? null,
    updatedAt: Date.now(),
  });
}

/**
 * 試合途中でゲームルールを変更する。
 * 新しいルールに合わせて進行状態（タイブレーク判定等）も調整して保存する。
 */
export async function updateLiveScoreConfig(live: LiveScore, config: LiveScoreConfig): Promise<ScoreState | null> {
  if (live.id == null) return null;
  const next = applyConfig(live, config);
  await db.liveScores.update(live.id, {
    config,
    sets: next.sets,
    p1Points: next.p1Points,
    p2Points: next.p2Points,
    isTiebreak: next.isTiebreak,
    isSuperTiebreak: next.isSuperTiebreak,
    server: next.server,
    tiebreakFirstServer: next.tiebreakFirstServer ?? null,
    updatedAt: Date.now(),
  });
  return next;
}

/** コート情報を更新（途中でコートが変わった場合） */
export async function updateLiveScoreCourt(live: LiveScore, courtId: string | null, courtName: string): Promise<void> {
  if (live.id == null) return;
  await db.liveScores.update(live.id, { courtId, courtName, updatedAt: Date.now() });
}

/**
 * ライブスコアの結果を試合データへ確定反映する。
 * スコア入力ダイアログの「結果確定」と同じ処理
 * （勝者を次ラウンドへ送る。リーグ戦では送らない）。
 */
export async function finalizeLiveScore(live: LiveScore, winner: 1 | 2): Promise<void> {
  const match = await db.matches
    .where('matchId').equals(live.matchId)
    .filter(m => m.eventId === live.eventId)
    .first();
  if (!match?.id) return;

  const scoreStr = buildScoreString(live, live.config) || '(スコア未入力)';
  const winnerEntryId = winner === 1 ? match.player1EntryId : match.player2EntryId;
  const winnerName = winner === 1 ? match.player1Name : match.player2Name;
  const winnerAff = winner === 1 ? match.player1Affiliation : match.player2Affiliation;
  const now = Date.now();

  await db.matches.update(match.id, {
    status: 'finished',
    score: scoreStr,
    winnerEntryId,
    updatedAt: now,
  });

  // リーグ戦（総当たり）は次ラウンドへの繰り上げを行わない
  const draw = await db.draws.where('eventId').equals(live.eventId).first();
  const isLeague = draw?.drawType === 'roundRobin';
  if (!isLeague) {
    const nextRound = match.round + 1;
    const nextPosition = Math.ceil(match.position / 2);
    const nextMatch = await db.matches
      .where('eventId').equals(match.eventId)
      .filter(m => m.round === nextRound && m.position === nextPosition)
      .first();
    if (nextMatch?.id) {
      const isUpper = match.position % 2 === 1;
      await db.matches.update(nextMatch.id, {
        ...(isUpper
          ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
          : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }),
        updatedAt: now,
      });
    }
  }

  // 次の相手がBYEだけの枠なら、そのまま更に次の回戦へ送る
  if (!isLeague) await propagateByes(live.eventId);

  if (live.id != null) {
    await db.liveScores.update(live.id, { status: 'finished', winner, updatedAt: now });
  }
}

/**
 * 確定済みの結果を取り消して「試合中」に戻す。
 * ライブスコアで「1つ戻す」を押して終了状態から巻き戻したときに使う。
 * 次ラウンドへ送った勝者もクリアする。
 */
export async function revertLiveScoreResult(live: LiveScore): Promise<void> {
  const match = await db.matches
    .where('matchId').equals(live.matchId)
    .filter(m => m.eventId === live.eventId)
    .first();
  if (!match?.id) return;
  const now = Date.now();

  await db.matches.update(match.id, {
    status: 'playing',
    score: '',
    winnerEntryId: null,
    updatedAt: now,
  });

  const draw = await db.draws.where('eventId').equals(live.eventId).first();
  if (draw?.drawType === 'roundRobin') return;

  const nextMatch = await db.matches
    .where('eventId').equals(match.eventId)
    .filter(m => m.round === match.round + 1 && m.position === Math.ceil(match.position / 2))
    .first();
  if (!nextMatch?.id) return;

  // 自分の山から送り込んだ側だけを空に戻す
  const isUpper = match.position % 2 === 1;
  await db.matches.update(nextMatch.id, {
    ...(isUpper
      ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
      : { player2EntryId: null, player2Name: '', player2Affiliation: '' }),
    updatedAt: now,
  });

  // BYEで送っていた勝ち上がりも取り消す
  await propagateByes(live.eventId);
}

/** ライブスコアを削除（配信を止めて記録を消す） */
export async function deleteLiveScore(live: LiveScore): Promise<void> {
  if (live.id == null) return;
  await db.liveScores.delete(live.id);
}

/** 配信中（および直近で終了した）ライブスコアを取得 */
export async function listVisibleLiveScores(finishedWindowMs = 10 * 60 * 1000): Promise<LiveScore[]> {
  const all = await db.liveScores.toArray();
  const now = Date.now();
  return all
    .filter(l => l.status === 'live' || now - l.updatedAt < finishedWindowMs)
    .sort((a, b) => {
      // 進行中を先に、その中はコート名順
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
      const ca = a.courtName || '￿';
      const cb = b.courtName || '￿';
      if (ca !== cb) return ca.localeCompare(cb, 'ja', { numeric: true });
      return a.matchOrder - b.matchOrder;
    });
}
