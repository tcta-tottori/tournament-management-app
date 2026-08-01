// =============================================
// ライブスコア入力 — 専用画面
//
// 対戦順 / タイムテーブル / ドロー の各画面から「ライブスコア開始」で遷移する。
// 1タップ＝1ポイントで進行し、更新はそのまま観戦ページへ配信される。
// =============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Undo2, RefreshCw, Trophy, Wifi, WifiOff, Radio,
  Minus, Plus, Repeat, Trash2, Gauge,
} from 'lucide-react';
import { db } from '../../db/database';
import type { LiveScore } from '../../db/database';
import { useSyncStore } from '../sync/syncStore';
import LiveScoreBoard from './LiveScoreBoard';
import {
  adjustGames, awardPoint, pointLabel, summarize, toggleServer, wonSets,
  type ScoreState,
} from './liveScoreEngine';
import { deleteLiveScore, finalizeLiveScore, revertLiveScoreResult, saveScoreState } from './liveScoreApi';
import { useNow } from './useNow';

/** 状態から ScoreState 部分だけを取り出す */
function toState(live: LiveScore): ScoreState {
  return {
    sets: live.sets,
    p1Points: live.p1Points,
    p2Points: live.p2Points,
    isTiebreak: live.isTiebreak,
    isSuperTiebreak: live.isSuperTiebreak,
    server: live.server,
    status: live.status,
    winner: live.winner,
    lastPointBy: live.lastPointBy,
  };
}

export default function LiveScorePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const matchId = params.get('match') || '';
  const eventId = params.get('event') || '';

  const connectionState = useSyncStore(s => s.connectionState);
  const roomCode = useSyncStore(s => s.roomCode);
  const latencyMs = useSyncStore(s => s.latencyMs);

  /** 「1つ戻す」用の履歴（この画面を開いている間のみ保持） */
  const historyRef = useRef<ScoreState[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  /** 経過時間表示用の時計 */
  const now = useNow(1000);

  const live = useLiveQuery(async () => {
    if (!matchId) return null;
    const rows = await db.liveScores.where('matchId').equals(matchId).toArray();
    if (rows.length === 0) return null;
    return (eventId ? rows.find(r => r.eventId === eventId) : undefined) ?? rows[0];
  }, [matchId, eventId]);

  // 画面が開いている間は端末をスリープさせない（コートサイドでの入力用）
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) {
      nav.wakeLock.request('screen')
        .then(s => { if (cancelled) void s.release(); else sentinel = s; })
        .catch(() => { /* 非対応・拒否は無視 */ });
    }
    return () => { cancelled = true; void sentinel?.release().catch(() => {}); };
  }, []);

  const pushHistory = useCallback((state: ScoreState) => {
    historyRef.current = [...historyRef.current.slice(-49), JSON.parse(JSON.stringify(state))];
    setHistoryCount(historyRef.current.length);
  }, []);

  const apply = useCallback(async (next: ScoreState) => {
    if (!live) return;
    setBusy(true);
    try {
      await saveScoreState(live, next);
      // 規定ゲームに達して決着したら、そのまま対戦表・ドローへ反映する
      if (next.status === 'finished' && next.winner && live.status !== 'finished') {
        await finalizeLiveScore({ ...live, ...next }, next.winner);
      }
      // 終了状態から巻き戻したら、確定済みの結果も取り消す
      if (next.status === 'live' && live.status === 'finished') {
        await revertLiveScoreResult(live);
      }
    } finally {
      setBusy(false);
    }
  }, [live]);

  const handlePoint = useCallback(async (player: 1 | 2) => {
    if (!live || live.status === 'finished') return;
    const cur = toState(live);
    pushHistory(cur);
    await apply(awardPoint(cur, live.config, player));
  }, [live, apply, pushHistory]);

  const handleUndo = useCallback(async () => {
    if (!live) return;
    const prev = historyRef.current.pop();
    setHistoryCount(historyRef.current.length);
    if (!prev) return;
    await apply(prev);
  }, [live, apply]);

  const handleAdjust = useCallback(async (player: 1 | 2, delta: number) => {
    if (!live) return;
    const cur = toState(live);
    pushHistory(cur);
    await apply(adjustGames(cur, player, delta));
  }, [live, apply, pushHistory]);

  const handleToggleServer = useCallback(async () => {
    if (!live) return;
    await apply(toggleServer(toState(live)));
  }, [live, apply]);

  const handleFinalize = useCallback(async (winner: 1 | 2) => {
    if (!live) return;
    if (!confirm(`${winner === 1 ? live.player1Name : live.player2Name} の勝利で結果を確定します。よろしいですか？`)) return;
    setBusy(true);
    try {
      await finalizeLiveScore(live, winner);
    } finally {
      setBusy(false);
    }
  }, [live]);

  const handleDelete = useCallback(async () => {
    if (!live) return;
    if (!confirm('この試合のライブスコア配信を終了して記録を削除しますか？（試合結果は残ります）')) return;
    await deleteLiveScore(live);
    navigate(-1);
  }, [live, navigate]);

  const sets = useMemo(() => (live ? wonSets(live) : { p1: 0, p2: 0 }), [live]);

  if (!matchId) {
    return <CenteredNotice text="ライブスコアの対象試合が指定されていません。" onBack={() => navigate(-1)} />;
  }
  if (live === undefined) {
    return <CenteredNotice text="読み込み中..." onBack={() => navigate(-1)} />;
  }
  if (live === null) {
    return <CenteredNotice text="この試合のライブスコアは開始されていません。" onBack={() => navigate(-1)} />;
  }

  const finished = live.status === 'finished';
  const connected = connectionState === 'connected';

  return (
    <div className="min-h-[100dvh] bg-[#0d1b34] text-white flex flex-col">
      {/* ヘッダー */}
      <header className="flex items-center gap-2 px-3 h-14 shrink-0 bg-[#08132a] border-b border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/20 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />戻る
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/50 truncate">
            {[live.eventName, live.roundName].filter(Boolean).join(' ・ ')}
          </p>
          <p className="text-sm font-bold truncate">
            {live.courtName || 'コート未割当'} <span className="text-white/40">#{live.matchOrder}</span>
          </p>
        </div>
        <span
          className={`flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-1 border ${
            connected
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
              : 'bg-white/10 border-white/20 text-white/60'
          }`}
          title={roomCode ? `ルーム: ${roomCode}` : '同期は開始されていません'}
        >
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? '配信中' : '未配信'}
        </span>
      </header>

      {/* 配信されていないときの案内 */}
      {!connected && (
        <div className="mx-3 mt-3 rounded-lg bg-amber-500/15 border border-amber-400/40 px-3 py-2 text-[11px] text-amber-100 leading-relaxed">
          同期が開始されていないため、この端末の中だけで記録されています。
          観戦ページへ配信するには、メニューの「同期」からルームに接続してください。
        </div>
      )}

      {/* スコアボード（観戦ページと同じ見た目） */}
      <div className="px-3 pt-4 pb-2">
        <LiveScoreBoard live={live} size="lg" showMeta={false} />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/50">
          <span>経過 {formatElapsed(now - live.startedAt)}</span>
          <span>
            {live.config.format === 'twoSetsSuper10'
              ? `2セットマッチ＋ファイナル${live.config.superTiebreakTo}ポイントSTB`
              : `${live.config.targetGames}ゲームマッチ（${live.config.targetGames}-${live.config.targetGames}タイブレーク）`}
            {live.config.noAd ? '・ノーアド' : ''}
          </span>
          <span>セット {sets.p1}-{sets.p2}</span>
          {latencyMs != null && (
            <span className="flex items-center gap-1">
              <Gauge className="w-3 h-3" />配信遅延 約{latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* ポイント入力 */}
      <div className="flex-1 px-3 pb-3 flex flex-col gap-3 min-h-0">
        {!finished ? (
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-[220px]">
            {([1, 2] as const).map(p => {
              const name = p === 1 ? live.player1Name : live.player2Name;
              const aff = p === 1 ? live.player1Affiliation : live.player2Affiliation;
              return (
                <button
                  key={p}
                  onClick={() => void handlePoint(p)}
                  disabled={busy}
                  className="relative flex flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-[#1d4ed8] to-[#15328c] active:from-[#2563eb] active:to-[#1d4ed8] border border-white/15 shadow-lg disabled:opacity-60 transition-colors p-3"
                >
                  {live.server === p && (
                    <span className="absolute top-2 right-2 text-[10px] font-black text-[#e8ff4d] bg-black/25 rounded px-1.5 py-0.5">
                      SERVE
                    </span>
                  )}
                  <span className="text-xs text-white/60 truncate max-w-full">{aff}</span>
                  <span className="text-lg sm:text-2xl font-black truncate max-w-full">{name || '(未定)'}</span>
                  <span className="text-5xl sm:text-6xl font-black text-[#e8ff4d] leading-none mt-1">
                    {pointLabel(live, p)}
                  </span>
                  <span className="text-[11px] font-bold text-white/50 mt-1">タップで +1ポイント</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-6">
            <Trophy className="w-10 h-10 text-[#e8ff4d]" />
            <p className="text-xl font-black">
              {live.winner === 1 ? live.player1Name : live.player2Name} の勝利
            </p>
            <p className="text-sm text-white/60">{summarize(live, live.config)}</p>
            <p className="text-[11px] text-white/40 text-center leading-relaxed">
              結果は対戦表・ドローへ反映済みです。<br />観戦ページには FINAL 表示でしばらく残ります。
            </p>
          </div>
        )}

        {/* 操作列 */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => void handleUndo()}
            disabled={busy || historyCount === 0}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-bold hover:bg-white/15 disabled:opacity-40 transition-colors"
          >
            <Undo2 className="w-4 h-4" />1つ戻す
          </button>
          <button
            onClick={() => void handleToggleServer()}
            disabled={busy || finished}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-bold hover:bg-white/15 disabled:opacity-40 transition-colors"
          >
            <Repeat className="w-4 h-4" />サーブ交代
          </button>
          <button
            onClick={() => setShowAdjust(v => !v)}
            disabled={finished}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/10 border border-white/15 text-sm font-bold hover:bg-white/15 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />ゲーム修正
          </button>
        </div>

        {/* ゲーム数の手動修正 */}
        {showAdjust && !finished && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
            <p className="text-[11px] text-white/50">
              現在のセットのゲーム数を直接修正します（ポイントは0-0に戻ります）。
            </p>
            {([1, 2] as const).map(p => (
              <div key={p} className="flex items-center gap-2">
                <span className="flex-1 text-sm font-bold truncate">
                  {(p === 1 ? live.player1Name : live.player2Name) || '(未定)'}
                </span>
                <button
                  onClick={() => void handleAdjust(p, -1)}
                  className="w-10 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center text-lg font-black">
                  {p === 1 ? live.sets[live.sets.length - 1]?.p1 ?? 0 : live.sets[live.sets.length - 1]?.p2 ?? 0}
                </span>
                <button
                  onClick={() => void handleAdjust(p, 1)}
                  className="w-10 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 結果確定 */}
        {!finished && (
          <div className="space-y-2">
            <p className="text-[11px] text-white/40 text-center">
              規定ゲームに達すると自動で確定できます。途中終了（棄権等）もここから確定できます。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map(p => (
                <button
                  key={p}
                  onClick={() => void handleFinalize(p)}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#e8ff4d] text-[#0a2461] text-sm font-black hover:brightness-95 disabled:opacity-50 transition"
                >
                  <Trophy className="w-4 h-4" />
                  {(p === 1 ? live.player1Name : live.player2Name) || '(未定)'} 勝利で確定
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => void handleDelete()}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:bg-white/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />ライブスコア配信を終了して削除
        </button>

        <p className="flex items-center justify-center gap-1.5 text-[10px] text-white/30 pb-2">
          <Radio className="w-3 h-3" />
          入力したポイントは即座に観戦ページへ配信されます
        </p>
      </div>
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

function CenteredNotice({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-[#0d1b34] text-white flex flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm text-white/70 text-center">{text}</p>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm font-bold hover:bg-white/20"
      >
        <ArrowLeft className="w-4 h-4" />戻る
      </button>
    </div>
  );
}
