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
 * クリックイベントハンドラの同期パスから呼ぶこと。
 */
export function teamCallSpeak(
  text: string,
  opts: { rate?: number; pitch?: number; volume?: number } = {},
  onComplete?: () => void,
) {
  _cancelled = false;

  const synth = window.speechSynthesis;

  // 過去にキューに残った発話をクリア
  synth.cancel();

  const voice = getJaVoice();

  // 単一 Utterance で全文を再生（チャンク分割しない）
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

  // 同期的に即座に speak() を呼ぶ
  synth.speak(utterance);

  // Android Chrome 対策: cancel() 直後の speak() が無視される場合に備えて
  // 200ms 後にまだ再生開始していなければ再試行
  setTimeout(() => {
    if (!_cancelled && !synth.speaking && !synth.pending) {
      synth.speak(utterance);
    }
  }, 200);
}

export function teamCallSpeechCancel() {
  _cancelled = true;
  try { window.speechSynthesis.cancel(); } catch {}
}
