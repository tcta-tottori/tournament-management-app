import { create } from 'zustand';

export interface BulkCallItem {
  matchId: string;
  dbId: number;
  courtName: string;
  courtId: string;
  player1Name: string;
  player2Name: string;
  eventName: string;
  roundLabel: string;
  callText: string;
}

interface BulkCallState {
  /** コール中かどうか */
  isActive: boolean;
  /** コール対象リスト */
  items: BulkCallItem[];
  /** 現在コール中のインデックス */
  currentIndex: number;
  /** 速度 (0.5 - 1.2) */
  rate: number;
  /** 繰り返し回数 */
  repeatCount: number;
  /** 中断されたか */
  aborted: boolean;

  start: (items: BulkCallItem[], rate: number, repeatCount: number) => void;
  next: () => void;
  setRate: (rate: number) => void;
  abort: () => void;
  reset: () => void;
}

export const useBulkCallStore = create<BulkCallState>((set) => ({
  isActive: false,
  items: [],
  currentIndex: 0,
  rate: 0.95,
  repeatCount: 1,
  aborted: false,

  start: (items, rate, repeatCount) => set({
    isActive: true,
    items,
    currentIndex: 0,
    rate,
    repeatCount,
    aborted: false,
  }),

  next: () => set((s) => {
    const nextIdx = s.currentIndex + 1;
    if (nextIdx >= s.items.length) {
      return { isActive: false, currentIndex: nextIdx };
    }
    return { currentIndex: nextIdx };
  }),

  setRate: (rate) => set({ rate }),

  abort: () => set({ aborted: true, isActive: false }),

  reset: () => set({
    isActive: false,
    items: [],
    currentIndex: 0,
    aborted: false,
  }),
}));
