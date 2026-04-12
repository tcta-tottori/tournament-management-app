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
  /** useSpeechSynthesis.stop への参照（cancel 時に正しく停止するため） */
  _stopFn: (() => void) | null;
  /** コール開始（ポップアップを表示） */
  start: (content: TeamCallContent, stopFn: () => void) => void;
  /** コール正常終了（onComplete から呼ばれる） */
  finish: () => void;
  /** コール強制停止（音声も即時停止） */
  cancel: () => void;
}

/**
 * 団体戦・決勝トーナメントのコール状態をグローバルに保持するストア。
 *
 * useSpeechSynthesis 自体はコンポーネントスコープなので、画面遷移や
 * ダイアログを閉じても続いているコール状態を表すために別途グローバル
 * 状態として持つ。右下のステータスバブル (TeamCallStatusBubble) が
 * これを購読して常時表示する。
 */
export const useTeamCallStore = create<TeamCallState>((set, get) => ({
  isActive: false,
  content: null,
  _stopFn: null,
  start: (content, stopFn) => set({ isActive: true, content, _stopFn: stopFn }),
  finish: () => set({ isActive: false, content: null, _stopFn: null }),
  cancel: () => {
    const { _stopFn } = get();
    if (_stopFn) {
      _stopFn(); // useSpeechSynthesis.stop() — cancelledRef=true + speechSynthesis.cancel()
    } else {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    set({ isActive: false, content: null, _stopFn: null });
  },
}));
