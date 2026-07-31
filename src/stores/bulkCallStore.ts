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

/** 一斉コールの進行フェーズ */
export type BulkCallPhase =
  /** 未実行 */
  | 'idle'
  /** 全コート分の音声を先に生成中 */
  | 'preparing'
  /** 生成済みの音声を続けて再生中 */
  | 'calling';

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
  /** 進行フェーズ（音声準備中 / コール中） */
  phase: BulkCallPhase;
  /** 音声生成が完了したコート数 */
  preparedCount: number;

  start: (items: BulkCallItem[], rate: number, repeatCount: number) => void;
  next: () => void;
  setRate: (rate: number) => void;
  setPhase: (phase: BulkCallPhase) => void;
  setPreparedCount: (n: number) => void;
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
  phase: 'idle',
  preparedCount: 0,

  start: (items, rate, repeatCount) => set({
    isActive: true,
    items,
    currentIndex: 0,
    rate,
    repeatCount,
    aborted: false,
    phase: 'preparing',
    preparedCount: 0,
  }),

  next: () => set((s) => {
    const nextIdx = s.currentIndex + 1;
    if (nextIdx >= s.items.length) {
      return { isActive: false, currentIndex: nextIdx };
    }
    return { currentIndex: nextIdx };
  }),

  setRate: (rate) => set({ rate }),

  setPhase: (phase) => set({ phase }),

  setPreparedCount: (n) => set({ preparedCount: n }),

  abort: () => set({ aborted: true, isActive: false }),

  reset: () => set({
    isActive: false,
    items: [],
    currentIndex: 0,
    aborted: false,
    phase: 'idle',
    preparedCount: 0,
  }),
}));
