/**
 * データ取得フック（方式B: 静的 JSON ポーリング）
 *
 * Cloudflare Workers KV から JSON を定期取得し、UI を自動更新する。
 * Firebase SDK 不要。fetch のみで動作。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL, POLL_INTERVAL } from './firebase';
import type {
  Tournament,
  Event,
  Match,
  Draw,
  Court,
  Entry,
  LiveState,
  MixedData,
} from './types';

/** ライブスナップショット全体の型 */
export interface LiveSnapshot {
  publishedAt: string;
  tournament: Tournament;
  events: Event[];
  entries: Entry[];
  matches: Match[];
  draws: Draw[];
  courts: Court[];
  liveState: LiveState;
  mixedData?: MixedData;
}

// ───────── 接続状態 ─────────

export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const handleOnline = () => setConnected(true);
    const handleOffline = () => setConnected(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setConnected(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return connected;
}

// ───────── 汎用ポーリングフック ─────────

function usePolling<T>(
  url: string | null,
  interval: number = POLL_INTERVAL,
): { data: T | null; loading: boolean; error: string | null; lastUpdated: Date | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevJson = useRef<string>('');

  const fetchData = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404) {
          // データ未公開
          setData(null);
          setLoading(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.text();
      // 変更があった場合のみ state を更新（不要な再レンダリング抑制）
      if (json !== prevJson.current) {
        prevJson.current = json;
        setData(JSON.parse(json) as T);
        setLastUpdated(new Date());
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fetch error';
      console.error('[LivePage]', msg);
      setError(msg);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    if (!url) return;
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [fetchData, url, interval]);

  return { data, loading, error, lastUpdated };
}

// ───────── 大会一覧 ─────────

interface TournamentListResponse {
  publishedAt: string;
  tournaments: Tournament[];
}

export function useTournaments(): { data: Tournament[]; loading: boolean } {
  const url = API_BASE_URL ? `${API_BASE_URL}/api/tournaments` : null;
  const { data, loading } = usePolling<TournamentListResponse>(url);
  return {
    data: data?.tournaments || [],
    loading,
  };
}

// ───────── 大会スナップショット ─────────

/**
 * 特定の大会の全データを取得するフック。
 * 1つの JSON に全データが含まれるため、個別の useMatches 等は不要。
 */
export function useTournamentSnapshot(tournamentId: string | undefined): {
  snapshot: LiveSnapshot | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
} {
  const url =
    API_BASE_URL && tournamentId
      ? `${API_BASE_URL}/api/publish/${tournamentId}`
      : null;
  const { data, loading, error, lastUpdated } = usePolling<LiveSnapshot>(url);
  return { snapshot: data, loading, error, lastUpdated };
}

// ───────── 便利なデータアクセサ ─────────

/** スナップショットから特定の大会情報を取得 */
export function useTournament(tournamentId: string | undefined) {
  const { snapshot, loading } = useTournamentSnapshot(tournamentId);
  return {
    data: snapshot?.tournament || null,
    loading,
  };
}

/** スナップショットから種目一覧を取得 */
export function useEvents(tournamentId: string | undefined) {
  const { snapshot, loading } = useTournamentSnapshot(tournamentId);
  return {
    data: snapshot?.events || [],
    loading,
  };
}

/** スナップショットから全試合を取得 */
export function useAllMatches(_eventIds: string[], snapshot: LiveSnapshot | null) {
  return {
    data: snapshot?.matches || [],
    loading: false,
  };
}

/** スナップショットから特定種目の試合を取得 */
export function useMatches(eventId: string | undefined, snapshot: LiveSnapshot | null) {
  const matches = (snapshot?.matches || [])
    .filter((m) => m.eventId === eventId)
    .sort((a, b) => a.round - b.round || a.position - b.position);
  return { data: matches, loading: false };
}

/** スナップショットからコート一覧を取得 */
export function useCourts(snapshot: LiveSnapshot | null) {
  const courts = (snapshot?.courts || []).sort((a, b) => a.order - b.order);
  return { data: courts, loading: false };
}

/** スナップショットからドローを取得 */
export function useDraw(eventId: string | undefined, snapshot: LiveSnapshot | null) {
  const draw = (snapshot?.draws || []).find((d) => d.eventId === eventId) || null;
  return { data: draw, loading: false };
}

/** スナップショットからエントリーを取得 */
export function useEntries(eventId: string | undefined, snapshot: LiveSnapshot | null) {
  const entries = (snapshot?.entries || []).filter((e) => e.eventId === eventId);
  return { data: entries, loading: false };
}

/** スナップショットからライブステートを取得 */
export function useLiveState(snapshot: LiveSnapshot | null) {
  return { data: snapshot?.liveState || null, loading: false };
}

/** スナップショットからミックスダブルスデータを取得 */
export function useMixedData(snapshot: LiveSnapshot | null) {
  return { data: (snapshot?.mixedData as MixedData) || null, loading: false };
}
