/**
 * Firestore リアルタイムリスナーフック
 * onSnapshot で購読し、データ変更時に自動更新する
 */
import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { db } from './firebase';
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

/** 接続状態 */
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

/** 汎用コレクション購読 */
function useCollection<T>(q: Query<DocumentData> | null): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) {
      setData([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as T);
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error('[Firestore]', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [q]);

  return { data, loading };
}

/** 全大会を購読 */
export function useTournaments(): { data: Tournament[]; loading: boolean } {
  const [q] = useState(() => collection(db, 'tournaments'));
  return useCollection<Tournament>(q);
}

/** 特定の大会を購読 */
export function useTournament(tournamentId: string | undefined): {
  data: Tournament | null;
  loading: boolean;
} {
  const [data, setData] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) {
      setData(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'tournaments', tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as Tournament) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[Firestore]', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [tournamentId]);

  return { data, loading };
}

/** 大会に紐づく種目を購読 */
export function useEvents(tournamentId: string | undefined): {
  data: Event[];
  loading: boolean;
} {
  const [q, setQ] = useState<Query<DocumentData> | null>(null);

  useEffect(() => {
    if (!tournamentId) {
      setQ(null);
      return;
    }
    setQ(query(collection(db, 'events'), where('tournamentId', '==', tournamentId)));
  }, [tournamentId]);

  return useCollection<Event>(q);
}

/** 種目に紐づく試合を購読 */
export function useMatches(eventId: string | undefined): {
  data: Match[];
  loading: boolean;
} {
  const [q, setQ] = useState<Query<DocumentData> | null>(null);

  useEffect(() => {
    if (!eventId) {
      setQ(null);
      return;
    }
    setQ(
      query(
        collection(db, 'matches'),
        where('eventId', '==', eventId),
        orderBy('round'),
        orderBy('position'),
      ),
    );
  }, [eventId]);

  return useCollection<Match>(q);
}

/** 大会の全試合を購読（複数種目） */
export function useAllMatches(eventIds: string[]): {
  data: Match[];
  loading: boolean;
} {
  const [q, setQ] = useState<Query<DocumentData> | null>(null);

  useEffect(() => {
    if (eventIds.length === 0) {
      setQ(null);
      return;
    }
    // Firestore 'in' は最大30件
    const ids = eventIds.slice(0, 30);
    setQ(query(collection(db, 'matches'), where('eventId', 'in', ids)));
  }, [eventIds.join(',')]);

  return useCollection<Match>(q);
}

/** コートを購読 */
export function useCourts(tournamentId: string | undefined): {
  data: Court[];
  loading: boolean;
} {
  const [q, setQ] = useState<Query<DocumentData> | null>(null);

  useEffect(() => {
    if (!tournamentId) {
      setQ(null);
      return;
    }
    setQ(
      query(
        collection(db, 'courts'),
        where('tournamentId', '==', tournamentId),
        orderBy('order'),
      ),
    );
  }, [tournamentId]);

  return useCollection<Court>(q);
}

/** ドローを購読 */
export function useDraw(eventId: string | undefined): {
  data: Draw | null;
  loading: boolean;
} {
  const [data, setData] = useState<Draw | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) {
      setData(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'draws', eventId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as Draw) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[Firestore]', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [eventId]);

  return { data, loading };
}

/** エントリーを購読 */
export function useEntries(eventId: string | undefined): {
  data: Entry[];
  loading: boolean;
} {
  const [q, setQ] = useState<Query<DocumentData> | null>(null);

  useEffect(() => {
    if (!eventId) {
      setQ(null);
      return;
    }
    setQ(query(collection(db, 'entries'), where('eventId', '==', eventId)));
  }, [eventId]);

  return useCollection<Entry>(q);
}

/** ライブステートを購読 */
export function useLiveState(tournamentId: string | undefined): {
  data: LiveState | null;
  loading: boolean;
} {
  const [data, setData] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) {
      setData(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'liveState', tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as LiveState) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[Firestore]', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [tournamentId]);

  return { data, loading };
}

/** ミックスダブルスデータを購読 */
export function useMixedData(tournamentId: string | undefined): {
  data: MixedData | null;
  loading: boolean;
} {
  const [data, setData] = useState<MixedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) {
      setData(null);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'mixedData', tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as MixedData) : null);
        setLoading(false);
      },
      (err) => {
        console.error('[Firestore]', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [tournamentId]);

  return { data, loading };
}
