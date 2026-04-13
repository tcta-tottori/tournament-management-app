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
  /** コール開始（ポップアップを表示） */
  start: (content: TeamCallContent) => void;
  /** コール正常終了（onComplete から呼ばれる） */
  finish: () => void;
  /** コール強制停止（音声も即時停止） */
  cancel: () => void;
}

/**
 * 団体戦・決勝トーナメントのコール状態をグローバルに保持するストア。
 * 右下のステータスバブル (TeamCallStatusBubble) がこれを購読して常時表示する。
 */
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
// React 非依存のスタンドアロン音声再生エンジン
// - window.speechSynthesis を直接操作
// - React の state / hook / ライフサイクルに一切依存しない
// - ユーザージェスチャーコンテキストを確実に維持
// =========================================================================

const CHUNK_PAUSE_MS = 600;
const VOICE_STORAGE_KEY = 'speech-voice-key';

let _cancelled = false;

function getJaVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
  const savedKey = localStorage.getItem(VOICE_STORAGE_KEY) || 'kyoko';

  // 保存されたキーで検索
  const saved = jaVoices.find(v => v.name.toLowerCase().includes(savedKey));
  if (saved) return saved;

  // 推奨リストで検索
  for (const key of ['kyoko', 'flo', 'shelley', 'sandy']) {
    const found = jaVoices.find(v => v.name.toLowerCase().includes(key));
    if (found) return found;
  }

  return jaVoices[0] || null;
}

/**
 * 音声コールを開始する（React 非依存）。
 * クリックイベントハンドラから直接呼び出すこと（ユーザージェスチャー維持）。
 */
export function teamCallSpeak(
  text: string,
  opts: { rate?: number; pitch?: number; volume?: number } = {},
  onComplete?: () => void,
) {
  const synth = window.speechSynthesis;
  _cancelled = false;

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
        speakNext(); // → onComplete
      }
    };
    utterance.onerror = () => {
      if (_cancelled) return;
      index++;
      speakNext();
    };
    synth.speak(utterance);
  }

  // 同期的に即座に開始（ユーザージェスチャーコンテキスト内で実行）
  speakNext();
}

/** 音声コールを停止する */
export function teamCallSpeechCancel() {
  _cancelled = true;
  try { window.speechSynthesis.cancel(); } catch {}
}
