/**
 * ライブ公開モジュール（方式B: 静的JSONアップロード）
 *
 * Dexie のデータを JSON にまとめ、30秒間隔で Cloudflare Workers KV に PUT する。
 * 公開ページはこの JSON を GET してポーリング表示する。
 *
 * メリット:
 *  - Firebase 不要（コストゼロ・同時接続制限なし）
 *  - 公開ページは静的ファイルの fetch のみ（SDK不要、バンドル軽量）
 *  - テニス大会の特性上 30秒間隔で十分（チェンジオーバー90秒）
 */
import { liveApiUrl, liveApiKey, isLiveEnabled } from './liveConfig';
import type {
  Tournament,
  Event,
  Match,
  Draw,
  Court,
  Entry,
} from '../db/database';

// ───────── 同期状態管理 ─────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

type SyncListener = (status: SyncStatus, message?: string) => void;
const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = isLiveEnabled ? 'idle' : 'disabled';
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

// ───────── 公開データ型 ─────────

/** 公開ページが受け取る JSON の構造 */
export interface LiveSnapshot {
  /** スナップショット生成時刻（ISO 8601） */
  publishedAt: string;
  /** 大会情報 */
  tournament: Omit<Tournament, 'id'>;
  /** 種目一覧 */
  events: Omit<Event, 'id'>[];
  /** エントリー一覧 */
  entries: Omit<Entry, 'id'>[];
  /** 全試合データ */
  matches: Omit<Match, 'id'>[];
  /** ドロー一覧 */
  draws: Omit<Draw, 'id'>[];
  /** コート一覧 */
  courts: Omit<Court, 'id'>[];
  /** ライブ状態 */
  liveState: {
    activeMatchIds: string[];
    playingCount: number;
    finishedCount: number;
    totalCount: number;
  };
  /** ミックスダブルスデータ（存在する場合） */
  mixedData?: Record<string, unknown>;
}

// ───────── ユーティリティ ─────────

/** Dexie の auto-increment id を除去 */
function stripId<T extends { id?: number }>(data: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = data;
  return rest;
}

// ───────── JSON アップロード ─────────

/**
 * 大会データのスナップショットを JSON にまとめて Worker にアップロードする。
 */
export async function publishSnapshot(data: {
  tournament: Tournament;
  events: Event[];
  entries: Entry[];
  matches: Match[];
  draws: Draw[];
  courts: Court[];
  mixedData?: Record<string, unknown>;
}): Promise<void> {
  if (!isLiveEnabled || !liveApiUrl) return;

  const activeMatches = data.matches.filter((m) => m.status === 'playing');
  const finishedMatches = data.matches.filter(
    (m) => m.status === 'finished' || m.status === 'walkover',
  );

  const snapshot: LiveSnapshot = {
    publishedAt: new Date().toISOString(),
    tournament: stripId(data.tournament),
    events: data.events.map(stripId),
    entries: data.entries.map(stripId),
    matches: data.matches.map(stripId),
    draws: data.draws.map(stripId),
    courts: data.courts.map(stripId),
    liveState: {
      activeMatchIds: activeMatches.map((m) => m.matchId),
      playingCount: activeMatches.length,
      finishedCount: finishedMatches.length,
      totalCount: data.matches.length,
    },
    mixedData: data.mixedData,
  };

  try {
    setStatus('syncing');

    const url = `${liveApiUrl}/api/publish/${data.tournament.tournamentId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(liveApiKey ? { 'X-API-Key': liveApiKey } : {}),
      },
      body: JSON.stringify(snapshot),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    setStatus('idle');
    console.log(
      `[LivePublisher] 公開完了 (${data.matches.length}試合, ${JSON.stringify(snapshot).length} bytes)`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '公開エラー';
    console.error('[LivePublisher]', message);

    if (!navigator.onLine) {
      setStatus('offline', 'ネットワーク未接続');
    } else {
      setStatus('error', message);
    }

    // 5秒後に idle に戻す（一時的エラー表示）
    setTimeout(() => {
      if (currentStatus === 'error') setStatus('idle');
    }, 5000);
  }
}

/**
 * 大会一覧を公開する（トップページ用）
 */
export async function publishTournamentList(
  tournaments: Tournament[],
): Promise<void> {
  if (!isLiveEnabled || !liveApiUrl) return;

  try {
    const url = `${liveApiUrl}/api/tournaments`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(liveApiKey ? { 'X-API-Key': liveApiKey } : {}),
      },
      body: JSON.stringify({
        publishedAt: new Date().toISOString(),
        tournaments: tournaments.map(stripId),
      }),
    });
  } catch (err) {
    console.error('[LivePublisher] 大会一覧公開失敗:', err);
  }
}
