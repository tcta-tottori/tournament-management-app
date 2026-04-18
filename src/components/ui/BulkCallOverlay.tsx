import { useEffect, useRef, useCallback } from 'react';
import { Megaphone, Square, Volume2 } from 'lucide-react';
import { useBulkCallStore } from '../../stores/bulkCallStore';
import { db } from '../../db/database';
import { geminiTts } from '../../features/broadcast/geminiTts';

/** 「続きまして。」のつなぎフレーズを Gemini で話す */
async function speakBridge(signal: { aborted: boolean }): Promise<void> {
  if (signal.aborted) return;
  await geminiTts.speak('続きまして。', { repeatCount: 1 });
  await new Promise(resolve => setTimeout(resolve, 400));
}

/** コール本文を Gemini で話す */
async function speakCall(text: string, repeatCount: number, signal: { aborted: boolean }): Promise<void> {
  if (signal.aborted) return;
  await geminiTts.speak(text, { repeatCount });
}

export default function BulkCallOverlay() {
  const { isActive, items, currentIndex, aborted, abort, reset } = useBulkCallStore();
  const abortRef = useRef({ aborted: false });
  const runningRef = useRef(false);

  // sync abortRef
  useEffect(() => { abortRef.current.aborted = aborted; }, [aborted]);

  const runSequence = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const store = useBulkCallStore.getState();
    const allItems = store.items;

    for (let i = store.currentIndex; i < allItems.length; i++) {
      const latestState = useBulkCallStore.getState();
      if (latestState.aborted || !latestState.isActive) break;

      const item = allItems[i];

      // つなぎ言葉（2番目以降）
      if (i > 0) {
        await speakBridge(abortRef.current);
        if (abortRef.current.aborted) break;
      }

      // DB更新: playing状態にする
      if (item.dbId) {
        await db.matches.update(item.dbId, { status: 'playing', updatedAt: Date.now() });
        const court = await db.courts.where('courtId').equals(item.courtId).first();
        if (court?.id) {
          await db.courts.update(court.id, { currentMatchId: item.matchId });
        }
      }

      // 音声再生
      await speakCall(item.callText, latestState.repeatCount, abortRef.current);
      if (abortRef.current.aborted) break;

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

  useEffect(() => {
    if (isComplete || wasAborted) {
      const timer = setTimeout(() => reset(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, wasAborted, reset]);

  if (!isActive && items.length === 0) return null;
  if (!isActive && !isComplete && !wasAborted) return null;

  const current = items[Math.min(currentIndex, items.length - 1)];
  const progress = items.length > 0 ? Math.round(((currentIndex) / items.length) * 100) : 0;

  return (
    <div className="fixed top-[56px] right-3 z-50 w-80">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 flex items-center gap-2">
          <div className="relative">
            <Megaphone className="w-5 h-5 text-white" />
            {isActive && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold">
              {isComplete ? 'コール完了' : wasAborted ? 'コール中断' : '一斉コール中'}
            </p>
            <p className="text-white/70 text-[10px]">
              {isComplete
                ? `${items.length}コート完了`
                : wasAborted
                  ? `${currentIndex}/${items.length}コート完了`
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

          {current && isActive && (
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
                  key={item.matchId}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all ${
                    i < currentIndex
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
