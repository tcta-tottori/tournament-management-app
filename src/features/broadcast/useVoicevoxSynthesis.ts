import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_SPEAKER_ID = 8; // 春日部つむぎ（落ち着いた女性声）
const VOICEVOX_BASE_URL = 'http://localhost:50021';

export interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: { name: string; id: number }[];
}

export interface UseVoicevoxSynthesisReturn {
  isAvailable: boolean;
  isSpeaking: boolean;
  speakerId: number;
  speakers: VoicevoxSpeaker[];
  speedScale: number;
  pitchScale: number;
  volumeScale: number;
  checkAvailability: () => Promise<boolean>;
  fetchSpeakers: () => Promise<void>;
  speak: (text: string, repeatCount?: number) => Promise<void>;
  stop: () => void;
  setSpeakerId: (id: number) => void;
  setSpeedScale: (v: number) => void;
  setPitchScale: (v: number) => void;
  setVolumeScale: (v: number) => void;
}

export function useVoicevoxSynthesis(): UseVoicevoxSynthesisReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakerId, setSpeakerId] = useState(() => {
    const saved = localStorage.getItem('voicevox_speaker_id');
    return saved ? parseInt(saved, 10) : DEFAULT_SPEAKER_ID;
  });
  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [speedScale, setSpeedScale] = useState(() => {
    const saved = localStorage.getItem('voicevox_speed');
    return saved ? parseFloat(saved) : 0.9;
  });
  const [pitchScale, setPitchScale] = useState(() => {
    const saved = localStorage.getItem('voicevox_pitch');
    return saved ? parseFloat(saved) : -0.05;
  });
  const [volumeScale, setVolumeScale] = useState(() => {
    const saved = localStorage.getItem('voicevox_volume');
    return saved ? parseFloat(saved) : 1.0;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  // 設定をlocalStorageに保存
  useEffect(() => { localStorage.setItem('voicevox_speaker_id', String(speakerId)); }, [speakerId]);
  useEffect(() => { localStorage.setItem('voicevox_speed', String(speedScale)); }, [speedScale]);
  useEffect(() => { localStorage.setItem('voicevox_pitch', String(pitchScale)); }, [pitchScale]);
  useEffect(() => { localStorage.setItem('voicevox_volume', String(volumeScale)); }, [volumeScale]);

  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${VOICEVOX_BASE_URL}/version`, { method: 'GET' });
      const available = res.ok;
      setIsAvailable(available);
      return available;
    } catch {
      setIsAvailable(false);
      return false;
    }
  }, []);

  const fetchSpeakers = useCallback(async () => {
    try {
      const res = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
      if (res.ok) {
        const data: VoicevoxSpeaker[] = await res.json();
        setSpeakers(data);
      }
    } catch {
      // VOICEVOXが起動していない場合は無視
    }
  }, []);

  // 初回マウント時に接続確認
  useEffect(() => {
    checkAvailability().then(ok => {
      if (ok) fetchSpeakers();
    });
  }, [checkAvailability, fetchSpeakers]);

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
    // 1. AudioQuery生成
    const queryRes = await fetch(
      `${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: 'POST' }
    );
    if (!queryRes.ok) throw new Error('audio_query failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = await queryRes.json();

    // 2. パラメータ上書き
    query.speedScale = speedScale;
    query.pitchScale = pitchScale;
    query.volumeScale = volumeScale;
    query.prePhonemeLength = 0.1;
    query.postPhonemeLength = 0.2;

    // 3. 音声合成
    const synthRes = await fetch(
      `${VOICEVOX_BASE_URL}/synthesis?speaker=${speakerId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'audio/wav' },
        body: JSON.stringify(query),
      }
    );
    if (!synthRes.ok) throw new Error('synthesis failed');

    const blob = await synthRes.blob();
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;

    // 4. 再生
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        cleanupAudio();
        resolve();
      };
      audio.onerror = () => {
        cleanupAudio();
        reject(new Error('audio playback error'));
      };
      audio.play().catch(reject);
    });
  }, [speakerId, speedScale, pitchScale, volumeScale, cleanupAudio]);

  const speak = useCallback(async (text: string, repeatCount: number = 1) => {
    stopRequestedRef.current = false;
    setIsSpeaking(true);

    try {
      const effectiveRepeat = Math.min(repeatCount, 3);
      for (let i = 0; i < effectiveRepeat; i++) {
        if (stopRequestedRef.current) break;

        const speakText = i === 0 ? text : `繰り返します。${text}`;
        await synthesizeAndPlay(speakText);

        // リピート間のポーズ
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
      console.error('VOICEVOX speak error:', err);
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
    speakerId,
    speakers,
    speedScale,
    pitchScale,
    volumeScale,
    checkAvailability,
    fetchSpeakers,
    speak,
    stop,
    setSpeakerId,
    setSpeedScale,
    setPitchScale,
    setVolumeScale,
  };
}
