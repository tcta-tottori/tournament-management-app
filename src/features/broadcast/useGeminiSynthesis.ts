import { useState, useCallback, useRef, useEffect } from 'react';

/** Gemini TTS で利用可能な事前構築音声（一部抜粋・日本語に向くもの中心） */
export const GEMINI_VOICES: { name: string; label: string }[] = [
  { name: 'Kore', label: 'Kore（しっかりした女性）' },
  { name: 'Aoede', label: 'Aoede（軽やかな女性）' },
  { name: 'Leda', label: 'Leda（若々しい女性）' },
  { name: 'Zephyr', label: 'Zephyr（明るい女性）' },
  { name: 'Callirhoe', label: 'Callirhoe（落ち着いた女性）' },
  { name: 'Autonoe', label: 'Autonoe（柔らかい女性）' },
  { name: 'Despina', label: 'Despina（透明感のある女性）' },
  { name: 'Erinome', label: 'Erinome（はきはきした女性）' },
  { name: 'Puck', label: 'Puck（軽快な男性）' },
  { name: 'Charon', label: 'Charon（落ち着いた男性）' },
  { name: 'Fenrir', label: 'Fenrir（力強い男性）' },
  { name: 'Orus', label: 'Orus（標準的な男性）' },
];

const STORAGE_VOICE = 'gemini_tts_voice';
const STORAGE_STYLE = 'gemini_tts_style';
const STORAGE_SERVER = 'gemini_tts_server';

/** Gemini TTS プロキシのデフォルト URL（sync-server と同居） */
function getDefaultServerUrl(): string {
  // sync-settings-storage に保存されている WebSocket URL を流用して http(s):// に変換
  try {
    const raw = localStorage.getItem('sync-settings-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const wsUrl: string | undefined = parsed?.state?.serverUrl;
      if (wsUrl) {
        const u = new URL(wsUrl);
        const proto = u.protocol === 'wss:' ? 'https:' : 'http:';
        return `${proto}//${u.host}`;
      }
    }
  } catch {
    // 無効な値は無視
  }
  // フォールバック: ブラウザと同一ホストの 8787 番
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8787`;
  }
  return 'http://localhost:8787';
}

export interface UseGeminiSynthesisReturn {
  isAvailable: boolean;
  isSpeaking: boolean;
  voiceName: string;
  styleInstruction: string;
  serverUrl: string;
  setVoiceName: (name: string) => void;
  setStyleInstruction: (s: string) => void;
  setServerUrl: (url: string) => void;
  checkAvailability: () => Promise<boolean>;
  speak: (text: string, repeatCount?: number) => Promise<void>;
  stop: () => void;
}

export function useGeminiSynthesis(): UseGeminiSynthesisReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceName, setVoiceNameState] = useState(
    () => localStorage.getItem(STORAGE_VOICE) || 'Kore'
  );
  const [styleInstruction, setStyleInstructionState] = useState(
    () => localStorage.getItem(STORAGE_STYLE) || '落ち着いた女性アナウンサーの声で、はっきりと丁寧に読み上げてください'
  );
  const [serverUrl, setServerUrlState] = useState(
    () => localStorage.getItem(STORAGE_SERVER) || getDefaultServerUrl()
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  const setVoiceName = useCallback((name: string) => {
    setVoiceNameState(name);
    localStorage.setItem(STORAGE_VOICE, name);
  }, []);

  const setStyleInstruction = useCallback((s: string) => {
    setStyleInstructionState(s);
    localStorage.setItem(STORAGE_STYLE, s);
  }, []);

  const setServerUrl = useCallback((url: string) => {
    setServerUrlState(url);
    localStorage.setItem(STORAGE_SERVER, url);
  }, []);

  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/gemini-status`, { method: 'GET' });
      if (!res.ok) {
        setIsAvailable(false);
        return false;
      }
      const data = await res.json();
      const ok = !!data.available;
      setIsAvailable(ok);
      return ok;
    } catch {
      setIsAvailable(false);
      return false;
    }
  }, [serverUrl]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const synthesizeAndPlay = useCallback(async (text: string): Promise<void> => {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/gemini-tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName,
        styleInstruction: styleInstruction || undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini TTS HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;

    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { cleanupAudio(); resolve(); };
      audio.onerror = () => { cleanupAudio(); reject(new Error('audio playback error')); };
      audio.play().catch(reject);
    });
  }, [serverUrl, voiceName, styleInstruction, cleanupAudio]);

  const speak = useCallback(async (text: string, repeatCount: number = 1) => {
    stopRequestedRef.current = false;
    setIsSpeaking(true);
    try {
      const effectiveRepeat = Math.min(Math.max(1, repeatCount), 3);
      for (let i = 0; i < effectiveRepeat; i++) {
        if (stopRequestedRef.current) break;
        const speakText = i === 0 ? text : `繰り返します。${text}`;
        await synthesizeAndPlay(speakText);
        if (i < effectiveRepeat - 1 && !stopRequestedRef.current) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, 1000);
            const check = setInterval(() => {
              if (stopRequestedRef.current) {
                clearTimeout(timer);
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }
      }
    } catch (err) {
      console.error('Gemini TTS speak error:', err);
    } finally {
      setIsSpeaking(false);
    }
  }, [synthesizeAndPlay]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    cleanupAudio();
    setIsSpeaking(false);
  }, [cleanupAudio]);

  return {
    isAvailable,
    isSpeaking,
    voiceName,
    styleInstruction,
    serverUrl,
    setVoiceName,
    setStyleInstruction,
    setServerUrl,
    checkAvailability,
    speak,
    stop,
  };
}
