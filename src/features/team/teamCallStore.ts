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
 */
export function teamCallSpeak(
  text: string,
  opts: { rate?: number; pitch?: number; volume?: number } = {},
  onComplete?: () => void,
) {
  _cancelled = false;

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onComplete?.();
    return;
  }

  const synth = window.speechSynthesis;

  try {
    // 過去にキューに残った発話をクリア
    synth.cancel();
  } catch { /* ignore */ }

  try {
    const voice = getJaVoice();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = opts.rate ?? 0.95;
    utterance.pitch = opts.pitch ?? 1.0;
    utterance.volume = opts.volume ?? 1.0;
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      if (!_cancelled) onComplete?.();
    };
    utterance.onerror = () => {
      if (!_cancelled) onComplete?.();
    };

    synth.speak(utterance);

    // cancel() 直後の speak() が無視された場合の再試行
    setTimeout(() => {
      try {
        if (!_cancelled && !synth.speaking && !synth.pending) {
          const u2 = new SpeechSynthesisUtterance(text);
          u2.lang = 'ja-JP';
          u2.rate = opts.rate ?? 0.95;
          u2.pitch = opts.pitch ?? 1.0;
          u2.volume = opts.volume ?? 1.0;
          if (voice) u2.voice = voice;
          u2.onend = () => { if (!_cancelled) onComplete?.(); };
          u2.onerror = () => { if (!_cancelled) onComplete?.(); };
          synth.speak(u2);
        }
      } catch { /* ignore */ }
    }, 250);
  } catch {
    onComplete?.();
  }
}

export function teamCallSpeechCancel() {
  _cancelled = true;
  try { window.speechSynthesis.cancel(); } catch {}
}
