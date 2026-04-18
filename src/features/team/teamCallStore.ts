import { create } from 'zustand';
import type { PlacementCategory } from './types';
import { stopAllSpeech } from '../broadcast/useCallSpeech';

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
    // 全エンジン（Web Speech / VOICEVOX / Gemini）を停止
    stopAllSpeech();
    try { window.speechSynthesis.cancel(); } catch {}
    set({ isActive: false, content: null });
  },
}));
