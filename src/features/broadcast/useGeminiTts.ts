import { useCallback, useEffect, useState } from 'react';
import { geminiTts } from './geminiTts';
import type { VoiceSettings } from './types';

/**
 * Gemini TTS 用フック。
 * `speak(text, settings, onComplete, onError)` の形で呼び出せる。
 * 直近のエラーは `lastError` で取得可能。
 */
export function useGeminiTts() {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(geminiTts.isSpeaking);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => geminiTts.subscribe(setIsSpeaking), []);

  const speak = useCallback(
    (
      text: string,
      settings?: Partial<VoiceSettings>,
      onComplete?: () => void,
      onError?: (err: Error) => void,
    ) => {
      const repeatCount = settings?.repeatCount ?? 1;
      setLastError(null);
      geminiTts.speak(text, {
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
    geminiTts.stop();
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  return { isSpeaking, speak, stop, lastError, clearError };
}
