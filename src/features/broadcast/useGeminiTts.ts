import { useCallback, useEffect, useState } from 'react';
import { geminiTts } from './geminiTts';
import type { VoiceSettings } from './types';

/**
 * Gemini TTS 用フック。
 * 既存の `useSpeechSynthesis` と互換性のあるシグネチャを提供するため、
 * `speak(text, settings, onComplete)` として呼び出せる。
 * ただし利用するのは `settings.repeatCount` のみ（rate/pitch/volume は
 * Gemini では無効）。
 */
export function useGeminiTts() {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(geminiTts.isSpeaking);

  useEffect(() => geminiTts.subscribe(setIsSpeaking), []);

  const speak = useCallback(
    (text: string, settings?: Partial<VoiceSettings>, onComplete?: () => void) => {
      const repeatCount = settings?.repeatCount ?? 1;
      geminiTts.speak(text, { repeatCount, onComplete });
    },
    [],
  );

  const stop = useCallback(() => {
    geminiTts.stop();
  }, []);

  return { isSpeaking, speak, stop };
}
