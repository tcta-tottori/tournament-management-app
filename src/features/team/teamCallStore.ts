import { create } from 'zustand';
import type { PlacementCategory } from './types';

/** コール内容（ポップアップ表示用メタ情報） */
export interface TeamCallContent {
  matchId: string;
  category: PlacementCategory;
  roundLabel: string;
  team1Number: number;
  team1Name: string;
  team2Number: number;
  team2Name: string;
  courtNames: string[];
}

interface TeamCallState {
  isActive: boolean;
  content: TeamCallContent | null;
  start: (content: TeamCallContent) => void;
  finish: () => void;
  cancel: () => void;
}

export const useTeamCallStore = create<TeamCallState>((set) => ({
  isActive: false,
  content: null,
  start: (content) => set({ isActive: true, content }),
  finish: () => set({ isActive: false, content: null }),
  cancel: () => {
    teamCallSpeechCancel();
    set({ isActive: false, content: null });
  },
}));

// =========================================================================
// React 非依存・スタンドアロン音声再生
// =========================================================================

const CHUNK_PAUSE_MS = 600;
const VOICE_STORAGE_KEY = 'speech-voice-key';

let _cancelled = false;

function getJaVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = speechSynthesis.getVoices();
    const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
    const savedKey = localStorage.getItem(VOICE_STORAGE_KEY) || 'kyoko';
    const saved = jaVoices.find(v => v.name.toLowerCase().includes(savedKey));
    if (saved) return saved;
    for (const key of ['kyoko', 'flo', 'shelley', 'sandy']) {
      const found = jaVoices.find(v => v.name.toLowerCase().includes(key));
      if (found) return found;
    }
    return jaVoices[0] || null;
  } catch {
    return null;
  }
}

/**
 * 音声コールを開始する。
 * **必ずクリックイベントハンドラの同期パスから呼ぶこと。**
 */
export function teamCallSpeak(
  text: string,
  opts: { rate?: number; pitch?: number; volume?: number } = {},
  onComplete?: () => void,
) {
  _cancelled = false;

  const synth = window.speechSynthesis;

  // Android Chrome: タブ切替後に一時停止している場合があるためリセット
  try { synth.cancel(); } catch {}
  try { synth.resume(); } catch {}

  const voice = getJaVoice();
  const chunks = text.split('。').filter(s => s.trim()).map(s => s + '。');
  if (chunks.length === 0) {
    onComplete?.();
    return;
  }

  let index = 0;

  function speakNext() {
    if (_cancelled) return;
    if (index >= chunks.length) {
      onComplete?.();
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = 'ja-JP';
      utterance.rate = opts.rate ?? 0.95;
      utterance.pitch = opts.pitch ?? 1.0;
      utterance.volume = opts.volume ?? 1.0;
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (_cancelled) return;
        index++;
        if (index < chunks.length) {
          setTimeout(speakNext, CHUNK_PAUSE_MS);
        } else {
          onComplete?.();
        }
      };
      utterance.onerror = () => {
        if (_cancelled) return;
        // エラーでも次チャンクを試す
        index++;
        if (index < chunks.length) {
          setTimeout(speakNext, 100);
        } else {
          onComplete?.();
        }
      };
      synth.speak(utterance);
    } catch {
      // synth.speak() 自体がエラーの場合
      onComplete?.();
    }
  }

  // cancel() の直後なので少し待ってから再生開始
  // （cancel+即speakはChromeで無視されるバグあり）
  setTimeout(() => {
    if (!_cancelled) speakNext();
  }, 60);
}

export function teamCallSpeechCancel() {
  _cancelled = true;
  try { window.speechSynthesis.cancel(); } catch {}
}
