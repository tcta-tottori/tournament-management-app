/**
 * ライブ公開フック（方式B: 30秒間隔 JSON アップロード）
 *
 * 30秒ごとに Dexie からデータを収集し、Cloudflare Workers にアップロードする。
 * 環境変数未設定時は何も行わない。
 */
import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { db as dexieDb } from '../db/database';
import { isLiveEnabled } from '../lib/liveConfig';
import {
  publishSnapshot,
  getSyncStatus,
  onSyncStatusChange,
  type SyncStatus,
} from '../lib/livePublisher';
import { useAppStore } from '../stores/appStore';

/** 公開間隔（ミリ秒） */
const PUBLISH_INTERVAL = 30_000;

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

// ───────── 定期公開 ─────────

/** Dexie から大会データを収集して JSON を公開する */
async function collectAndPublish(tournamentId: string): Promise<void> {
  const tournament = await dexieDb.tournaments
    .where('tournamentId')
    .equals(tournamentId)
    .first();
  if (!tournament) return;

  const events = await dexieDb.events
    .where('tournamentId')
    .equals(tournamentId)
    .toArray();

  const eventIds = events.map((e) => e.eventId);

  const [entries, matches, draws, courts] = await Promise.all([
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
      .equals(tournamentId)
      .toArray(),
  ]);

  await publishSnapshot({
    tournament,
    events,
    entries,
    matches,
    draws,
    courts,
  });
}

/**
 * 30秒間隔で大会データを JSON として公開するフック。
 * AppLayout で1回だけ呼び出す。
 */
export function useLivePublisher(): void {
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  useEffect(() => {
    if (!isLiveEnabled || !currentTournamentId) return;

    // 初回は即座に公開
    collectAndPublish(currentTournamentId).catch(console.error);

    // 30秒間隔で定期公開
    const timer = setInterval(() => {
      collectAndPublish(currentTournamentId).catch(console.error);
    }, PUBLISH_INTERVAL);

    return () => clearInterval(timer);
  }, [currentTournamentId]);
}

// ───────── 手動公開 ─────────

/**
 * 手動で即座に公開するフック（ボタン押下用）
 */
export function useManualSync() {
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  const triggerFullSync = useCallback(async () => {
    if (!isLiveEnabled || !currentTournamentId) return;
    await collectAndPublish(currentTournamentId);
  }, [currentTournamentId]);

  return { triggerFullSync };
}
