import { useCallback, useEffect, useState } from 'react';
import { callTts, type CallTtsState } from './callTts';
import type { VoiceSettings } from './types';

/**
 * コール音声用フック（ブラウザ内蔵音声 / Gemini TTS）。
 * `speak(text, settings, onComplete, onError)` の形で呼び出せる。
 * 直近のエラーは `lastError` で取得可能。
 */
export function useCallTts() {
  const [state, setState] = useState<CallTtsState>(callTts.state);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => callTts.subscribe(setState), []);

  const speak = useCallback(
    (
      text: string,
      settings?: Partial<VoiceSettings>,
      onComplete?: () => void,
      onError?: (err: Error) => void,
    ) => {
      const repeatCount = settings?.repeatCount ?? 1;
      setLastError(null);
      callTts.speak(text, {
        repeatCount,
        onComplete,
        onError: (err) => {
          setLastError(err.message || String(err));
          onError?.(err);
        },
      });
    },
    [],
  );

  const stop = useCallback(() => {
    callTts.stop();
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  return {
    isSpeaking: state.isSpeaking,
    isLoading: state.isLoading,
    /** 直近の読み上げで実際に使われたエンジン */
    lastEngine: state.lastEngine,
    /** 直近の生成で実際に使われたモデル ID / 音声名 */
    lastModel: state.lastModel,
    /** Gemini に失敗して内蔵音声に切り替えたときの理由 */
    lastFallbackReason: state.lastFallbackReason,
    /** 直近の生成にかかったミリ秒 */
    lastLatencyMs: state.lastLatencyMs,
    speak,
    stop,
    lastError,
    clearError,
  };
}
