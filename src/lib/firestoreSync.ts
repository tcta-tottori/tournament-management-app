/**
 * Firestore 同期モジュール
 *
 * Dexie（IndexedDB）のデータを Firestore に書き込むサイドカー。
 * 既存の運営操作には一切影響を与えず、失敗しても運営は継続される。
 */
import {
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseEnabled } from './firebase';
import type {
  Tournament,
  Event,
  Match,
  Draw,
  Court,
  Player,
  Entry,
} from '../db/database';

// ───────── 同期状態管理 ─────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

type SyncListener = (status: SyncStatus, message?: string) => void;
const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = isFirebaseEnabled ? 'idle' : 'disabled';
let currentMessage: string | undefined;

function setStatus(status: SyncStatus, message?: string) {
  currentStatus = status;
  currentMessage = message;
  listeners.forEach((fn) => fn(status, message));
}

export function getSyncStatus(): { status: SyncStatus; message?: string } {
  return { status: currentStatus, message: currentMessage };
}

export function onSyncStatusChange(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ───────── ユーティリティ ─────────

/** Dexie の auto-increment id を除去して Firestore 用データに変換 */
function stripId<T extends { id?: number }>(data: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = data;
  return rest;
}

/** 安全な Firestore 書き込みラッパー */
async function safeWrite(fn: (db: Firestore) => Promise<void>): Promise<void> {
  if (!isFirebaseEnabled) return;
  const db = getFirestoreDb();
  if (!db) return;

  try {
    setStatus('syncing');
    await fn(db);
    setStatus('idle');
  } catch (err) {
    const message = err instanceof Error ? err.message : '同期エラー';
    console.error('[FirestoreSync]', message);
    setStatus('error', message);
    // 3秒後に idle に戻す（一時的エラー表示）
    setTimeout(() => {
      if (currentStatus === 'error') setStatus('idle');
    }, 3000);
  }
}

// ───────── 個別コレクション同期関数 ─────────

/** 大会情報を同期 */
export async function syncTournament(tournament: Tournament): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'tournaments', tournament.tournamentId);
    await setDoc(ref, {
      ...stripId(tournament),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** 種目を同期 */
export async function syncEvent(event: Event): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'events', event.eventId);
    await setDoc(ref, {
      ...stripId(event),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** 試合を同期 */
export async function syncMatch(match: Match): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'matches', match.matchId);
    await setDoc(ref, {
      ...stripId(match),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** 複数試合を一括同期（バッチ書き込み） */
export async function syncMatchesBatch(matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  await safeWrite(async (db) => {
    const batch = writeBatch(db);
    for (const match of matches) {
      const ref = doc(db, 'matches', match.matchId);
      batch.set(ref, {
        ...stripId(match),
        _syncedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  });
}

/** ドローを同期 */
export async function syncDraw(draw: Draw): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'draws', draw.eventId);
    await setDoc(ref, {
      ...stripId(draw),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** コートを同期 */
export async function syncCourt(court: Court): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'courts', court.courtId);
    await setDoc(ref, {
      ...stripId(court),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** 複数コートを一括同期 */
export async function syncCourtsBatch(courts: Court[]): Promise<void> {
  if (courts.length === 0) return;
  await safeWrite(async (db) => {
    const batch = writeBatch(db);
    for (const court of courts) {
      const ref = doc(db, 'courts', court.courtId);
      batch.set(ref, {
        ...stripId(court),
        _syncedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  });
}

/** 選手を同期 */
export async function syncPlayer(player: Player): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'players', player.playerId);
    await setDoc(ref, {
      ...stripId(player),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** エントリーを同期 */
export async function syncEntry(entry: Entry): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'entries', entry.entryId);
    await setDoc(ref, {
      ...stripId(entry),
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}

/** エントリーを一括同期 */
export async function syncEntriesBatch(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  await safeWrite(async (db) => {
    const batch = writeBatch(db);
    for (const entry of entries) {
      const ref = doc(db, 'entries', entry.entryId);
      batch.set(ref, {
        ...stripId(entry),
        _syncedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  });
}

// ───────── ライブステート更新 ─────────

/** ライブステートを更新（アクティブ試合一覧等） */
export async function syncLiveState(
  tournamentId: string,
  data: {
    activeMatchIds: string[];
    ticker?: string;
  },
): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'liveState', tournamentId);
    await setDoc(ref, {
      ...data,
      lastUpdated: serverTimestamp(),
    }, { merge: true });
  });
}

// ───────── フルスナップショット同期 ─────────

/**
 * 大会の全データを一括で Firestore に同期する。
 * 初回同期や手動リフレッシュ時に使用。
 */
export async function syncFullSnapshot(data: {
  tournament: Tournament;
  events: Event[];
  entries: Entry[];
  matches: Match[];
  draws: Draw[];
  courts: Court[];
  players: Player[];
}): Promise<void> {
  if (!isFirebaseEnabled) return;
  const db = getFirestoreDb();
  if (!db) return;

  try {
    setStatus('syncing');

    // Firestore バッチは最大500オペレーション
    const allOps: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

    // Tournament
    allOps.push({
      ref: doc(db, 'tournaments', data.tournament.tournamentId),
      data: { ...stripId(data.tournament), _syncedAt: serverTimestamp() },
    });

    // Events
    for (const event of data.events) {
      allOps.push({
        ref: doc(db, 'events', event.eventId),
        data: { ...stripId(event), _syncedAt: serverTimestamp() },
      });
    }

    // Entries
    for (const entry of data.entries) {
      allOps.push({
        ref: doc(db, 'entries', entry.entryId),
        data: { ...stripId(entry), _syncedAt: serverTimestamp() },
      });
    }

    // Matches
    for (const match of data.matches) {
      allOps.push({
        ref: doc(db, 'matches', match.matchId),
        data: { ...stripId(match), _syncedAt: serverTimestamp() },
      });
    }

    // Draws
    for (const draw of data.draws) {
      allOps.push({
        ref: doc(db, 'draws', draw.eventId),
        data: { ...stripId(draw), _syncedAt: serverTimestamp() },
      });
    }

    // Courts
    for (const court of data.courts) {
      allOps.push({
        ref: doc(db, 'courts', court.courtId),
        data: { ...stripId(court), _syncedAt: serverTimestamp() },
      });
    }

    // Players
    for (const player of data.players) {
      allOps.push({
        ref: doc(db, 'players', player.playerId),
        data: { ...stripId(player), _syncedAt: serverTimestamp() },
      });
    }

    // LiveState
    const activeMatchIds = data.matches
      .filter((m) => m.status === 'playing')
      .map((m) => m.matchId);
    allOps.push({
      ref: doc(db, 'liveState', data.tournament.tournamentId),
      data: {
        activeMatchIds,
        lastUpdated: serverTimestamp(),
      },
    });

    // バッチ書き込み（500件ずつ分割）
    const BATCH_LIMIT = 500;
    for (let i = 0; i < allOps.length; i += BATCH_LIMIT) {
      const chunk = allOps.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.set(op.ref, op.data, { merge: true });
      }
      await batch.commit();
    }

    setStatus('idle');
    console.log(`[FirestoreSync] フルスナップショット同期完了: ${allOps.length}件`);
  } catch (err) {
    const message = err instanceof Error ? err.message : '同期エラー';
    console.error('[FirestoreSync] フルスナップショット同期失敗:', message);
    setStatus('error', message);
  }
}

// ───────── ミックスダブルス同期 ─────────

/** ミックスダブルスデータを同期 */
export async function syncMixedData(
  tournamentId: string,
  mixedData: Record<string, unknown>,
): Promise<void> {
  await safeWrite(async (db) => {
    const ref = doc(db, 'mixedData', tournamentId);
    await setDoc(ref, {
      ...mixedData,
      _syncedAt: serverTimestamp(),
    }, { merge: true });
  });
}
