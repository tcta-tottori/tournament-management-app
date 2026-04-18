import { useCallback, useEffect, useState } from 'react';
import { useSpeechSynthesis } from './useSpeechSynthesis';
import { useVoicevoxSynthesis } from './useVoicevoxSynthesis';
import { useGeminiSynthesis } from './useGeminiSynthesis';
import type { VoiceSettings } from './types';

export type AudioEngine = 'webSpeech' | 'voicevox' | 'gemini';

const ENGINE_STORAGE_KEY = 'broadcast_engine';

function readEngine(): AudioEngine {
  if (typeof localStorage === 'undefined') return 'webSpeech';
  const v = localStorage.getItem(ENGINE_STORAGE_KEY);
  return v === 'voicevox' || v === 'gemini' ? v : 'webSpeech';
}

/** teamCallStore 等、フック外部から全エンジン停止を呼べるようにするためのレジストリ */
let globalStopRef: (() => void) | null = null;
export function stopAllSpeech(): void {
  try { globalStopRef?.(); } catch { /* noop */ }
}

/**
 * アプリ全体のコール用音声フック。
 * 放送コール画面で選択されたエンジン（Web Speech / VOICEVOX / Gemini）を
 * localStorage から読み取り、適切なエンジンへルーティングする。
 * `useSpeechSynthesis` と同じ `speak(text, settings, onComplete)` / `stop()` / `isSpeaking`
 * インターフェイスを提供するため、既存呼び出し側はそのまま差し替え可能。
 */
export function useCallSpeech() {
  const webSpeech = useSpeechSynthesis();
  const voicevox = useVoicevoxSynthesis();
  const gemini = useGeminiSynthesis();

  const [engine, setEngine] = useState<AudioEngine>(readEngine);

  // 他タブ/他コンポーネントからの変更を検知
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENGINE_STORAGE_KEY) setEngine(readEngine());
    };
    window.addEventListener('storage', onStorage);
    // 同一タブ内での変更用: 500ms ごとに同期
    const t = setInterval(() => setEngine(prev => {
      const v = readEngine();
      return v === prev ? prev : v;
    }), 500);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, []);

  const isSpeaking =
    engine === 'voicevox' ? voicevox.isSpeaking
    : engine === 'gemini' ? gemini.isSpeaking
    : webSpeech.isSpeaking;

  const speak = useCallback((text: string, settings: VoiceSettings, onComplete?: () => void) => {
    const repeat = settings?.repeatCount ?? 1;
    if (engine === 'voicevox' && voicevox.isAvailable) {
      voicevox.speak(text, repeat).finally(() => onComplete?.());
      return;
    }
    if (engine === 'gemini' && gemini.isAvailable) {
      gemini.speak(text, repeat).finally(() => onComplete?.());
      return;
    }
    // フォールバック: Web Speech
    webSpeech.speak(text, settings, onComplete);
  }, [engine, voicevox, gemini, webSpeech]);

  const stop = useCallback(() => {
    webSpeech.stop();
    voicevox.stop();
    gemini.stop();
  }, [webSpeech, voicevox, gemini]);

  // 外部（teamCallStore など）から全停止できるように最新 stop を登録
  useEffect(() => {
    globalStopRef = stop;
    return () => { if (globalStopRef === stop) globalStopRef = null; };
  }, [stop]);

  return {
    engine,
    isSpeaking,
    speak,
    stop,
    // Web Speech 互換のため既存フィールドを転送（利用側のため）
    voiceName: webSpeech.voiceName,
    voicesLoaded: webSpeech.voicesLoaded,
  };
}
