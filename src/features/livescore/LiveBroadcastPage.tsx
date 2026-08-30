// =============================================
// ライブ配信 — 配信中の対戦を管理する画面
//
// ライブスコアは各試合の入力画面（/live-score）で進めるが、
// 「いまどの試合を配信しているか」「どの試合の配信を始める／終わるか」を
// まとめて扱う場所が無かった。この画面でそれを一覧管理する。
// =============================================

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Radio, Wifi, WifiOff, Play, Square, Trash2, Gauge, Eye, MapPin, RefreshCw, Clock, Link2, Copy, Check,
} from 'lucide-react';
import { db } from '../../db/database';
import type { LiveScore, Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useSyncStore, DEFAULT_SERVER_URL, PUBLIC_ROOM } from '../sync/syncStore';
import LiveScoreBoard from './LiveScoreBoard';
import type { EmbedTheme } from '../view/EmbedLiveScoreView';
import { deleteLiveScore, startLiveScore, updateLiveScoreCourt } from './liveScoreApi';
import { resolveRequiredGames } from '../score/gameRules';
import { getGameRuleText, getMatchFormat, getRoundName } from '../score/roundRules';
import { useNow } from './useNow';
import { formatCourtLabel } from './courtLabel';

/** 終了後もこの時間だけ一覧に残す */
const FINISHED_WINDOW_MS = 30 * 60 * 1000;

export default function LiveBroadcastPage() {
  const navigate = useNavigate();
  const now = useNow(1000);
  const currentTournamentId = useAppStore(s => s.currentTournamentId);

  const connectionState = useSyncStore(s => s.connectionState);
  const roomCode = useSyncStore(s => s.roomCode);
  const serverUrl = useSyncStore(s => s.serverUrl);
  const syncEnabled = useSyncStore(s => s.syncEnabled);
  const latencyMs = useSyncStore(s => s.latencyMs);
  const connected = connectionState === 'connected';

  const [busyKey, setBusyKey] = useState<string | null>(null);

  // --- HP貼り付け用URLの発行設定 ---
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<EmbedTheme>('light');
  const [embedHeight, setEmbedHeight] = useState(480);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];
  const eventIds = useMemo(() => events.map(e => e.eventId), [events]);

  const liveScores = useLiveQuery(() => db.liveScores.toArray(), []) || [];

  const matches = useLiveQuery(
    () => eventIds.length > 0 ? db.matches.where('eventId').anyOf(eventIds).toArray() : [],
    [eventIds]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  const draws = useLiveQuery(
    () => eventIds.length > 0 ? db.draws.where('eventId').anyOf(eventIds).toArray() : [],
    [eventIds]
  ) || [];

  const courtNameOf = useCallback(
    (courtId: string | null) => courts.find(c => c.courtId === courtId)?.name || '',
    [courts]
  );
  const eventOf = useCallback((eventId: string) => events.find(e => e.eventId === eventId), [events]);
  const totalRoundsOf = useCallback((eventId: string) => {
    const draw = draws.find(d => d.eventId === eventId);
    return draw ? Math.max(1, Math.round(Math.log2(Math.max(2, draw.drawSize)))) : 1;
  }, [draws]);

  // --- 配信中 / 直近終了 ---
  const broadcasting = useMemo(
    () => liveScores
      .filter(l => l.status === 'live')
      .sort((a, b) => {
        const ca = a.courtName || '￿', cb = b.courtName || '￿';
        if (ca !== cb) return ca.localeCompare(cb, 'ja', { numeric: true });
        return a.matchOrder - b.matchOrder;
      }),
    [liveScores]
  );
  const recentlyFinished = useMemo(
    () => liveScores
      .filter(l => l.status === 'finished' && now - l.updatedAt < FINISHED_WINDOW_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [liveScores, now]
  );

  // --- 配信を開始できる試合（試合中／準備完了で、まだライブスコアが無いもの）---
  const startable = useMemo(() => {
    const liveKeys = new Set(liveScores.map(l => `${l.eventId}|${l.matchId}`));
    return matches
      .filter(m =>
        (m.status === 'playing' || m.status === 'ready') &&
        !!m.player1Name && !!m.player2Name &&
        m.player1Name !== 'BYE' && m.player2Name !== 'BYE' &&
        !liveKeys.has(`${m.eventId}|${m.matchId}`))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'playing' ? -1 : 1;
        return (a.matchOrder || 0) - (b.matchOrder || 0);
      });
  }, [matches, liveScores]);

  /** ルーム指定のクエリ（既定の公開ルームのときは付けない） */
  const roomQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (syncEnabled && roomCode && roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
    if (syncEnabled && serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
    return qs;
  }, [syncEnabled, roomCode, serverUrl]);

  /** 観戦ページ（大会全体）のURL */
  const publicHref = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const q = roomQuery.toString();
    return `${base}/view/livescore${q ? `?${q}` : ''}`;
  }, [roomQuery]);

  /** HPに貼り付けるライブスコア専用ページの絶対URL */
  const embedUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const qs = new URLSearchParams(roomQuery);
    if (embedTheme !== 'light') qs.set('theme', embedTheme);
    const q = qs.toString();
    return `${window.location.origin}${base}/embed/livescore${q ? `?${q}` : ''}`;
  }, [roomQuery, embedTheme]);

  /** HPの記事に貼り付ける iframe のコード */
  const embedCode = useMemo(
    () =>
      `<iframe src="${embedUrl}" title="ライブスコア" width="100%" height="${embedHeight}" `
      + 'style="border:0;max-width:760px;" loading="lazy"></iframe>',
    [embedUrl, embedHeight]
  );

  /** URL・埋め込みコードをクリップボードへ */
  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(cur => (cur === key ? null : cur)), 2000);
    } catch {
      window.prompt('コピーできませんでした。下のURLを選択してコピーしてください。', text);
    }
  }, []);

  const openInput = useCallback((live: LiveScore) => {
    navigate(`/live-score?match=${encodeURIComponent(live.matchId)}&event=${encodeURIComponent(live.eventId)}`);
  }, [navigate]);

  /** 配信開始（ライブスコアを作って入力画面へ） */
  const handleStart = useCallback(async (m: Match) => {
    if (m.id == null) return;
    const key = `start-${m.id}`;
    setBusyKey(key);
    try {
      const evt = eventOf(m.eventId);
      const totalRounds = totalRoundsOf(m.eventId);
      const ruleText = getGameRuleText(evt, m.round, totalRounds);
      const live = await startLiveScore({
        dbId: m.id,
        eventName: evt?.name || '',
        roundName: getRoundName(m.round, totalRounds),
        gameRuleText: ruleText,
        requiredGames: resolveRequiredGames(ruleText, m.round, totalRounds),
        matchFormat: getMatchFormat(evt, m.round, totalRounds),
      });
      if (!live) { alert('試合データが見つからないため、配信を開始できませんでした。'); return; }
      openInput(live);
    } catch (e) {
      console.error('[ライブ配信] 開始に失敗:', e);
      alert('配信を開始できませんでした。');
    } finally {
      setBusyKey(null);
    }
  }, [eventOf, totalRoundsOf, openInput]);

  /** 配信終了（記録を削除。試合結果は残る） */
  const handleStop = useCallback(async (live: LiveScore) => {
    if (!confirm(`${live.player1Name} vs ${live.player2Name} の配信を終了しますか？\n（試合結果は残ります）`)) return;
    setBusyKey(`stop-${live.id}`);
    try {
      await deleteLiveScore(live);
    } finally {
      setBusyKey(null);
    }
  }, []);

  /** 配信を再開（終了状態から進行中へ戻す） */
  const handleResume = useCallback(async (live: LiveScore) => {
    if (live.id == null) return;
    setBusyKey(`resume-${live.id}`);
    try {
      await db.liveScores.update(live.id, { status: 'live', updatedAt: Date.now() });
    } finally {
      setBusyKey(null);
    }
  }, []);

  /** コートが変わった試合の配信情報を合わせる */
  const handleSyncCourt = useCallback(async (live: LiveScore, match: Match) => {
    setBusyKey(`court-${live.id}`);
    try {
      await updateLiveScoreCourt(live, match.courtId, courtNameOf(match.courtId));
    } finally {
      setBusyKey(null);
    }
  }, [courtNameOf]);

  /** 全配信を終了 */
  const handleStopAll = useCallback(async () => {
    if (broadcasting.length === 0) return;
    if (!confirm(`配信中の${broadcasting.length}試合をすべて終了しますか？\n（試合結果は残ります）`)) return;
    setBusyKey('stop-all');
    try {
      for (const l of broadcasting) await deleteLiveScore(l);
    } finally {
      setBusyKey(null);
    }
  }, [broadcasting]);

  if (!currentTournamentId) {
    return <div className="p-6 text-center text-gray-500">大会を選択してください</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 space-y-4">
      {/* 配信状態 */}
      <div className="bg-white rounded-2xl shadow-sm border border-border-main p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary-500" />
            ライブ配信
          </h2>
          <span className={`flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 border ${
            connected
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          }`}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? `配信中（ルーム ${roomCode || '—'}）` : '未接続'}
          </span>
          {latencyMs != null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Gauge className="w-3.5 h-3.5" />配信遅延 約{latencyMs}ms
            </span>
          )}
          <div className="flex-1" />
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-bold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-2.5 py-1.5 hover:bg-primary-100"
          >
            <Eye className="w-3.5 h-3.5" />観戦ページを開く
          </a>
          <button
            onClick={() => setShowEmbed(v => !v)}
            className={`flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition-colors ${
              showEmbed
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'text-primary-700 bg-primary-50 border-primary-200 hover:bg-primary-100'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />ライブスコアのURLを発行
          </button>
          {broadcasting.length > 0 && (
            <button
              onClick={() => void handleStopAll()}
              disabled={busyKey === 'stop-all'}
              className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-100 disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5" />すべて終了
            </button>
          )}
        </div>
        {!connected && (
          <p className="mt-2 text-[11px] text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2 leading-relaxed">
            同期に接続していないため、入力はこの端末の中だけで記録されます。
            観戦ページへ配信するには、ヘッダーの同期からルームに接続してください。
          </p>
        )}

        {/* HP貼り付け用のURL発行 */}
        {showEmbed && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <p className="text-[11px] text-gray-600 leading-relaxed">
              ライブスコアだけを表示する専用ページです。ヘッダーやメニューは出ないので、
              協会HPの記事にそのまま貼り付けられます。
            </p>

            {/* 表示設定 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-600">背景</span>
                {([
                  { v: 'light' as EmbedTheme, label: '白' },
                  { v: 'dark' as EmbedTheme, label: '濃い緑' },
                  { v: 'transparent' as EmbedTheme, label: '透明' },
                ]).map(o => (
                  <button
                    key={o.v}
                    onClick={() => setEmbedTheme(o.v)}
                    className={`px-2 h-7 rounded-lg text-[11px] font-bold border transition-colors ${
                      embedTheme === o.v
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
                貼り付け枠の高さ
                <input
                  type="number"
                  min={200}
                  max={2000}
                  step={40}
                  value={embedHeight}
                  onChange={e => setEmbedHeight(Math.min(2000, Math.max(200, Number(e.target.value) || 480)))}
                  className="w-20 h-7 rounded-lg border border-gray-300 px-2 text-[11px] font-bold text-gray-800"
                />
                px
              </label>
            </div>

            {/* URL */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-gray-600">観戦用URL（リンクとして案内する場合）</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={embedUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-8 rounded-lg border border-gray-300 bg-white px-2 text-[11px] text-gray-700 font-mono"
                />
                <button
                  onClick={() => void handleCopy(embedUrl, 'url')}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-white bg-primary-600 rounded-lg px-2.5 hover:brightness-110"
                >
                  {copiedKey === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'url' ? 'コピーしました' : 'コピー'}
                </button>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-primary-700 bg-white border border-primary-200 rounded-lg px-2.5 hover:bg-primary-50"
                >
                  <Eye className="w-3.5 h-3.5" />確認
                </a>
              </div>
            </div>

            {/* iframe */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-gray-600">HP貼り付け用コード（記事内に埋め込む場合）</p>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  value={embedCode}
                  onFocus={e => e.currentTarget.select()}
                  rows={3}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white p-2 text-[11px] text-gray-700 font-mono resize-y"
                />
                <button
                  onClick={() => void handleCopy(embedCode, 'code')}
                  className="shrink-0 self-start flex items-center gap-1 text-[11px] font-bold text-white bg-primary-600 rounded-lg px-2.5 py-2 hover:brightness-110"
                >
                  {copiedKey === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'code' ? 'コピーしました' : 'コピー'}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-gray-500 leading-relaxed">
              {roomQuery.get('room')
                ? `ルーム ${roomQuery.get('room')} の配信に接続するURLです。ルームを変えると発行し直しになります。`
                : '既定の公開ルームに接続するURLです。大会が変わってもURLはそのまま使えます。'}
              <br />
              ページを開いている間は自動更新されます（観戦者の操作は不要です）。
            </p>
          </div>
        )}
      </div>

      {/* 配信中 */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-gray-600 flex items-center gap-1.5 px-1">
          <span className="relative flex h-2 w-2">
            {broadcasting.length > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${broadcasting.length > 0 ? 'bg-red-500' : 'bg-gray-300'}`} />
          </span>
          配信中 {broadcasting.length}試合
        </h3>

        {broadcasting.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <Radio className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">配信中の試合はありません。</p>
            <p className="text-[11px] text-gray-400 mt-1">下の「配信を開始できる試合」から始められます。</p>
          </div>
        ) : (
          broadcasting.map(live => {
            const match = matches.find(m => m.matchId === live.matchId && m.eventId === live.eventId);
            const courtChanged = !!match && (match.courtId || null) !== (live.courtId || null);
            return (
              <div key={`${live.eventId}-${live.matchId}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                <LiveScoreBoard live={live} size="sm" />
                {/* スコア・コートはボードに出ているので、ここは経過時間だけにする */}
                <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
                  <Clock className="w-3 h-3" />経過 {formatElapsed(now - live.startedAt)}
                </p>
                {courtChanged && (
                  <button
                    onClick={() => void handleSyncCourt(live, match!)}
                    disabled={busyKey === `court-${live.id}`}
                    className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-2.5 py-1.5 hover:bg-primary-100 disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    コートが「{formatCourtLabel(courtNameOf(match!.courtId)) || '未割当'}」に変わっています — 配信情報を更新
                  </button>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => openInput(live)}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#d2504c] to-[#c63834] rounded-lg px-3 py-2 hover:brightness-110"
                  >
                    <Radio className="w-3.5 h-3.5" />スコア入力を開く
                  </button>
                  <button
                    onClick={() => void handleStop(live)}
                    disabled={busyKey === `stop-${live.id}`}
                    className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-100 disabled:opacity-40"
                  >
                    <Square className="w-3.5 h-3.5" />配信を終了
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 直近終了 */}
      {recentlyFinished.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-gray-600 px-1">終了（観戦ページに表示中）</h3>
          {recentlyFinished.map(live => (
            <div key={`${live.eventId}-${live.matchId}`} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
              <LiveScoreBoard live={live} size="sm" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex-1" />
                <button
                  onClick={() => void handleResume(live)}
                  disabled={busyKey === `resume-${live.id}`}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />配信を再開
                </button>
                <button
                  onClick={() => void handleStop(live)}
                  disabled={busyKey === `stop-${live.id}`}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />一覧から消す
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 配信を開始できる試合 */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-gray-600 px-1">配信を開始できる試合 {startable.length}件</h3>
        {startable.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-[11px] text-gray-400 leading-relaxed">
            試合中・準備完了の試合がありません。<br />
            コートに試合を入れると、ここに配信の候補として並びます。
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {startable.map(m => (
              <div key={`${m.eventId}-${m.matchId}`} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    m.status === 'playing' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {m.status === 'playing' ? '試合中' : '準備完了'}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    {eventOf(m.eventId)?.name} {getRoundName(m.round, totalRoundsOf(m.eventId))}
                  </span>
                  {m.courtId && (
                    <span className="text-[10px] font-bold text-gray-600 flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />{formatCourtLabel(courtNameOf(m.courtId))}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-gray-900 truncate">{m.player1Name}</p>
                <p className="text-[10px] text-gray-400 leading-none my-0.5">vs</p>
                <p className="text-sm font-bold text-gray-900 truncate">{m.player2Name}</p>
                <button
                  onClick={() => void handleStart(m)}
                  disabled={busyKey === `start-${m.id}`}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#d2504c] to-[#c63834] rounded-lg px-3 py-2 hover:brightness-110 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />配信を開始
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed pb-2">
        配信を開始すると、入力したポイントがそのまま観戦ページのライブスコアへ反映されます。
      </p>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
