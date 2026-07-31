import { useEffect, useRef, useCallback } from 'react';
import { Megaphone, Square, Volume2, Loader2 } from 'lucide-react';
import { useBulkCallStore, type BulkCallItem } from '../../stores/bulkCallStore';
import { db } from '../../db/database';
import { findOccupyingMatch } from '../../db/courtOccupancy';
import { geminiTts } from '../../features/broadcast/geminiTts';

/** 音声生成の並列数（多すぎるとAPIのレート制限に掛かるため控えめに） */
const PREFETCH_CONCURRENCY = 4;
/** コート間の無音（詰めすぎないための最小限の間） */
const GAP_MS = 250;

/** 2コート目以降は「続きまして。」を同じ音声データに含める（別リクエストにしない） */
function callTextOf(item: BulkCallItem, index: number): string {
  return index === 0 ? item.callText : `続きまして。${item.callText}`;
}

/**
 * 全コート分の音声を先に生成する。
 * コートごとに生成→再生を繰り返すとコート間に生成待ちの間が空くため、
 * 先に全部を並列で作ってから続けて再生する。
 */
async function prefetchAll(
  items: BulkCallItem[],
  repeatCount: number,
  signal: { aborted: boolean },
  onProgress: (done: number) => void,
): Promise<(Blob | null)[]> {
  const blobs: (Blob | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length || signal.aborted) return;
      const text = callTextOf(items[i], i);
      try {
        blobs[i] = await geminiTts.synthesize(text, { repeatCount });
      } catch {
        // 一時的な失敗は1回だけ再試行する
        try {
          if (!signal.aborted) blobs[i] = await geminiTts.synthesize(text, { repeatCount });
        } catch (err) {
          console.error('[一斉コール] 音声生成に失敗', items[i].courtName, err);
        }
      }
      done++;
      onProgress(done);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, items.length) }, worker),
  );
  return blobs;
}

export default function BulkCallOverlay() {
  const { isActive, items, currentIndex, aborted, phase, preparedCount, abort, reset } = useBulkCallStore();
  const abortRef = useRef({ aborted: false });
  const runningRef = useRef(false);

  // sync abortRef
  useEffect(() => { abortRef.current.aborted = aborted; }, [aborted]);

  const runSequence = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const store = useBulkCallStore.getState();
    const allItems = store.items;
    const repeatCount = store.repeatCount;

    // --- 1) 全コート分の音声をまとめて生成 ---
    useBulkCallStore.getState().setPhase('preparing');
    const blobs = await prefetchAll(
      allItems,
      repeatCount,
      abortRef.current,
      (n) => useBulkCallStore.getState().setPreparedCount(n),
    );

    // 1件も生成できなかった場合はコールを中止する（無音のまま試合が開始されるのを防ぐ）
    if (!abortRef.current.aborted && blobs.every(b => b === null)) {
      alert('音声の生成に失敗しました。音声設定（APIキー・中継サーバー）をご確認ください。');
      useBulkCallStore.getState().abort();
      runningRef.current = false;
      return;
    }

    // --- 2) 生成済みの音声を間を空けずに連続再生 ---
    if (!abortRef.current.aborted) useBulkCallStore.getState().setPhase('calling');

    for (let i = store.currentIndex; i < allItems.length; i++) {
      const latestState = useBulkCallStore.getState();
      if (latestState.aborted || !latestState.isActive) break;

      const item = allItems[i];

      // DB更新: playing状態にする（コートが別の試合で埋まっている場合は開始しない）
      if (item.dbId) {
        const match = await db.matches.get(item.dbId);
        const occupied = await findOccupyingMatch(item.courtId, item.dbId);
        if (match && !occupied && match.status !== 'finished' && match.status !== 'walkover') {
          await db.matches.update(item.dbId, { status: 'playing', updatedAt: Date.now() });
          const court = await db.courts.where('courtId').equals(item.courtId).first();
          if (court?.id) {
            await db.courts.update(court.id, { currentMatchId: item.matchId });
          }
        }
      }

      // 音声再生（生成済み）
      const blob = blobs[i];
      if (blob) {
        await geminiTts.playBlob(blob);
        if (abortRef.current.aborted) break;
        if (i < allItems.length - 1) {
          await new Promise(resolve => setTimeout(resolve, GAP_MS));
        }
      }

      // 次へ進む
      useBulkCallStore.getState().next();
    }

    runningRef.current = false;
    const finalState = useBulkCallStore.getState();
    if (!finalState.aborted && finalState.currentIndex >= finalState.items.length) {
      setTimeout(() => reset(), 3000);
    }
  }, [reset]);

  useEffect(() => {
    if (isActive && !aborted && !runningRef.current) {
      runSequence();
    }
  }, [isActive, aborted, runSequence]);

  const handleAbort = useCallback(() => {
    geminiTts.stop();
    abort();
  }, [abort]);

  const isComplete = !isActive && !aborted && currentIndex >= items.length && items.length > 0;
  const wasAborted = aborted && items.length > 0;
  const isPreparing = isActive && phase === 'preparing';

  useEffect(() => {
    if (isComplete || wasAborted) {
      const timer = setTimeout(() => reset(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, wasAborted, reset]);

  if (!isActive && items.length === 0) return null;
  if (!isActive && !isComplete && !wasAborted) return null;

  const current = items[Math.min(currentIndex, items.length - 1)];
  const progress = items.length === 0
    ? 0
    : isPreparing
      ? Math.round((preparedCount / items.length) * 100)
      : Math.round((currentIndex / items.length) * 100);

  return (
    <div className="fixed top-[56px] right-3 z-50 w-80">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 flex items-center gap-2">
          <div className="relative">
            {isPreparing
              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
              : <Megaphone className="w-5 h-5 text-white" />}
            {isActive && !isPreparing && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold">
              {isComplete ? 'コール完了' : wasAborted ? 'コール中断' : isPreparing ? '音声を準備中' : '一斉コール中'}
            </p>
            <p className="text-white/70 text-[10px]">
              {isComplete
                ? `${items.length}コート完了`
                : wasAborted
                  ? `${currentIndex}/${items.length}コート完了`
                  : isPreparing
                    ? `${preparedCount}/${items.length}コート読込済み`
                    : `${currentIndex + 1}/${items.length}コート`
              }
            </p>
          </div>
          {isActive && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition-colors backdrop-blur-sm"
            >
              <Square className="w-3 h-3" />
              中断
            </button>
          )}
        </div>

        <div className="px-4 py-3 space-y-2.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 font-medium">進捗</span>
              <span className="text-xs font-bold text-emerald-600">{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {isPreparing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
              <Loader2 className="w-4 h-4 text-emerald-500 shrink-0 animate-spin" />
              <p className="text-[11px] text-emerald-700 font-medium">
                全{items.length}コート分の音声を読み込んでから、続けてコールします
              </p>
            </div>
          )}

          {current && isActive && !isPreparing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
              <Volume2 className="w-4 h-4 text-emerald-500 shrink-0 animate-pulse" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-emerald-800 truncate">
                  {current.courtName}番コート
                </p>
                <p className="text-[10px] text-emerald-600 truncate">
                  {current.player1Name} vs {current.player2Name}
                </p>
              </div>
            </div>
          )}

          {isActive && items.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {items.map((item, i) => (
                <span
                  key={`${item.courtName}-${item.matchId}`}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all ${
                    isPreparing
                      ? (i < preparedCount ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400')
                      : i < currentIndex
                        ? 'bg-emerald-100 text-emerald-600'
                        : i === currentIndex
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 animate-pulse'
                          : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {item.courtName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
