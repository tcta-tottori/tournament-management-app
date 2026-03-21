import { useEffect, useRef, useCallback } from 'react';
import { Megaphone, Square, Volume2 } from 'lucide-react';
import { useBulkCallStore } from '../../stores/bulkCallStore';
import { db } from '../../db/database';

/** 利用可能な日本語女性音声を取得 */
function getJapaneseFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
  const preferredKeywords = ['nanami', 'kyoko', 'o-ren', 'haruka', 'sayaka', 'ayumi', 'mei', 'mizuki', 'google', 'female'];
  for (const kw of preferredKeywords) {
    const found = jaVoices.find(v => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }
  return jaVoices[0] || null;
}

const CHUNK_PAUSE_MS = 600;

/** テキストを音声再生する Promise */
function speakText(text: string, rate: number, repeatCount: number, abortRef: React.RefObject<boolean>): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const voice = getJapaneseFemaleVoice();
    const baseChunks = text.split('。').filter(s => s.trim()).map(s => s + '。');
    const repeatChunks = ['繰り返します。', ...baseChunks];
    const effectiveRepeatCount = Math.min(repeatCount, 3);
    let repeatIdx = 0;

    function speakChunks() {
      const chunks = repeatIdx === 0 ? baseChunks : repeatChunks;
      let index = 0;

      function speakNext() {
        if (abortRef.current) { resolve(); return; }
        if (index >= chunks.length) {
          repeatIdx++;
          if (repeatIdx < effectiveRepeatCount) {
            setTimeout(() => {
              if (!abortRef.current) speakChunks();
              else resolve();
            }, 2500);
          } else {
            resolve();
          }
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = 'ja-JP';
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (voice) utterance.voice = voice;

        utterance.onend = () => {
          index++;
          if (index < chunks.length) {
            setTimeout(() => speakNext(), CHUNK_PAUSE_MS);
          } else {
            speakNext();
          }
        };
        utterance.onerror = () => {
          index++;
          speakNext();
        };
        synth.speak(utterance);
      }
      speakNext();
    }
    speakChunks();
  });
}

/** 「続きまして」を話す Promise */
function speakBridge(rate: number, abortRef: React.RefObject<boolean>): Promise<void> {
  return new Promise((resolve) => {
    if (abortRef.current) { resolve(); return; }
    const synth = window.speechSynthesis;
    const voice = getJapaneseFemaleVoice();
    const utterance = new SpeechSynthesisUtterance('続きまして。');
    utterance.lang = 'ja-JP';
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      setTimeout(() => resolve(), 400);
    };
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}

export default function BulkCallOverlay() {
  const { isActive, items, currentIndex, rate, aborted, setRate, abort, reset } = useBulkCallStore();
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  // sync abortRef
  useEffect(() => { abortRef.current = aborted; }, [aborted]);

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
        await speakBridge(latestState.rate, abortRef);
        if (abortRef.current) break;
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
      await speakText(item.callText, latestState.rate, latestState.repeatCount, abortRef);
      if (abortRef.current) break;

      // 次へ進む
      useBulkCallStore.getState().next();
    }

    runningRef.current = false;
    // 全完了
    const finalState = useBulkCallStore.getState();
    if (!finalState.aborted && finalState.currentIndex >= finalState.items.length) {
      setTimeout(() => reset(), 3000);
    }
  }, []);

  // コール開始時に自動で実行
  useEffect(() => {
    if (isActive && !aborted && !runningRef.current) {
      runSequence();
    }
  }, [isActive, runSequence]);

  const handleAbort = useCallback(() => {
    window.speechSynthesis.cancel();
    abort();
  }, [abort]);

  if (!isActive && items.length === 0) return null;

  const isComplete = !isActive && !aborted && currentIndex >= items.length && items.length > 0;
  const wasAborted = aborted;

  // 完了/中断後は3秒で消える
  useEffect(() => {
    if (isComplete || wasAborted) {
      const timer = setTimeout(() => reset(), 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, wasAborted, reset]);

  if (!isActive && !isComplete && !wasAborted) return null;

  const current = items[Math.min(currentIndex, items.length - 1)];
  const progress = items.length > 0 ? Math.round(((currentIndex) / items.length) * 100) : 0;

  return (
    <div className="fixed top-[56px] right-3 z-50 w-80">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 overflow-hidden">
        {/* Header */}
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

        {/* Content */}
        <div className="px-4 py-3 space-y-2.5">
          {/* Progress bar */}
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

          {/* Current call info */}
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

          {/* Speed control */}
          {isActive && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 font-medium shrink-0">速度</span>
              <input
                type="range"
                min="0.5"
                max="1.2"
                step="0.05"
                value={rate}
                onChange={e => setRate(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-emerald-500"
              />
              <span className="text-[10px] font-mono text-emerald-600 font-bold w-8 text-right">{rate.toFixed(2)}</span>
            </div>
          )}

          {/* Court list mini */}
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
