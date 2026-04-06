/**
 * Firestore 同期カスタムフック
 *
 * Dexie のデータ変更を監視し、Firestore へ自動的に書き込む。
 * Firebase 未設定時は何も行わない。
 */
import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { db as dexieDb, type Tournament, type Event as TEvent, type Match, type Court, type Draw } from '../db/database';
import { isFirebaseEnabled } from '../lib/firebase';
import {
  syncTournament,
  syncEvent,
  syncMatch,
  syncCourt,
  syncLiveState,
  syncDraw,
  syncFullSnapshot,
  syncMixedData,
  getSyncStatus,
  onSyncStatusChange,
  type SyncStatus,
} from '../lib/firestoreSync';
import { useAppStore } from '../stores/appStore';

// ───────── 同期ステータス購読 ─────────

/** 同期ステータスをリアクティブに取得するフック */
export function useSyncStatus(): { status: SyncStatus; message?: string } {
  const statusRef = useRef(getSyncStatus());

  const subscribe = useCallback((onStoreChange: () => void) => {
    return onSyncStatusChange((status, message) => {
      statusRef.current = { status, message };
      onStoreChange();
    });
  }, []);

  const getSnapshot = useCallback(() => statusRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

// ───────── Dexie 変更監視 & 自動同期 ─────────

/**
 * Dexie テーブルの変更を監視し、Firestore に自動同期するフック。
 * コンポーネントツリーのルート付近（AppLayout等）で1回だけ呼び出す。
 */
export function useFirestoreAutoSync(): void {
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  useEffect(() => {
    if (!isFirebaseEnabled || !currentTournamentId) return;

    // Dexie updating フックの関数参照を保持
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type DexieUpdatingHook = (mods: any, primKey: any, obj: any) => void;

    const tournamentHook: DexieUpdatingHook = (_mods, _primKey, obj: Tournament) => {
      if (obj.tournamentId === currentTournamentId) {
        syncTournament(obj).catch(console.error);
      }
    };

    const eventHook: DexieUpdatingHook = (_mods, _primKey, obj: TEvent) => {
      if (obj.tournamentId === currentTournamentId) {
        syncEvent(obj).catch(console.error);
      }
    };

    const matchHook: DexieUpdatingHook = (_mods, _primKey, obj: Match) => {
      syncMatch(obj).catch(console.error);
      dexieDb.matches
        .where('status')
        .equals('playing')
        .toArray()
        .then((playing) => {
          syncLiveState(currentTournamentId, {
            activeMatchIds: playing.map((m) => m.matchId),
          }).catch(console.error);
        });
    };

    const courtHook: DexieUpdatingHook = (_mods, _primKey, obj: Court) => {
      if (obj.tournamentId === currentTournamentId) {
        syncCourt(obj).catch(console.error);
      }
    };

    const drawHook: DexieUpdatingHook = (_mods, _primKey, obj: Draw) => {
      syncDraw(obj).catch(console.error);
    };

    // フック登録
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dexieDb.tournaments.hook('updating', tournamentHook as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dexieDb.events.hook('updating', eventHook as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dexieDb.matches.hook('updating', matchHook as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dexieDb.courts.hook('updating', courtHook as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dexieDb.draws.hook('updating', drawHook as any);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dexieDb.tournaments.hook('updating').unsubscribe(tournamentHook as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dexieDb.events.hook('updating').unsubscribe(eventHook as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dexieDb.matches.hook('updating').unsubscribe(matchHook as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dexieDb.courts.hook('updating').unsubscribe(courtHook as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dexieDb.draws.hook('updating').unsubscribe(drawHook as any);
    };
  }, [currentTournamentId]);
}

// ───────── 手動同期 ─────────

/**
 * 現在の大会データを全て Firestore に手動同期するフック。
 * 初回同期や「同期リフレッシュ」ボタン用。
 */
export function useManualSync() {
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  const triggerFullSync = useCallback(async () => {
    if (!isFirebaseEnabled || !currentTournamentId) return;

    const tournament = await dexieDb.tournaments
      .where('tournamentId')
      .equals(currentTournamentId)
      .first();
    if (!tournament) return;

    const events = await dexieDb.events
      .where('tournamentId')
      .equals(currentTournamentId)
      .toArray();

    const eventIds = events.map((e) => e.eventId);

    const [entries, matches, draws, courts, players] = await Promise.all([
      eventIds.length > 0
        ? dexieDb.entries.where('eventId').anyOf(eventIds).toArray()
        : [],
      eventIds.length > 0
        ? dexieDb.matches.where('eventId').anyOf(eventIds).toArray()
        : [],
      eventIds.length > 0
        ? dexieDb.draws.where('eventId').anyOf(eventIds).toArray()
        : [],
      dexieDb.courts
        .where('tournamentId')
        .equals(currentTournamentId)
        .toArray(),
      dexieDb.players.toArray(),
    ]);

    await syncFullSnapshot({
      tournament,
      events,
      entries,
      matches,
      draws,
      courts,
      players,
    });
  }, [currentTournamentId]);

  return { triggerFullSync };
}

// ───────── ミックスダブルス同期 ─────────

/**
 * ミックスダブルスの store 変更を Firestore に同期するフック。
 */
export function useMixedSync(
  tournamentId: string | null,
  mixedStoreData: Record<string, unknown> | null,
): void {
  const prevDataRef = useRef<string>('');

  useEffect(() => {
    if (!isFirebaseEnabled || !tournamentId || !mixedStoreData) return;

    const serialized = JSON.stringify(mixedStoreData);
    if (serialized === prevDataRef.current) return;
    prevDataRef.current = serialized;

    syncMixedData(tournamentId, mixedStoreData).catch(console.error);
  }, [tournamentId, mixedStoreData]);
}
