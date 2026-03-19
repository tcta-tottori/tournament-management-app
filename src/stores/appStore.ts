import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduleSlot, ScheduleMatch } from '../features/schedule/scheduleEngine';

// スケジュール設定（ページ遷移しても保持）
export interface ScheduleConfig {
  startTime: string;
  matchDuration: number;
  courtBlocks: Record<string, boolean>;
}

// グローバルに保持するアプリの状態
interface AppState {
  currentTournamentId: string | null;  // 現在作業中の大会ID
  setCurrentTournamentId: (id: string | null) => void;

  // スケジュール設定（ページ遷移しても保持）
  scheduleConfig: ScheduleConfig;
  setScheduleConfig: (config: Partial<ScheduleConfig>) => void;

  // スケジュールデータ（ページ遷移しても保持）
  scheduleSlots: ScheduleSlot[];
  setScheduleSlots: (slots: ScheduleSlot[]) => void;
  allScheduleMatches: ScheduleMatch[];
  setAllScheduleMatches: (matches: ScheduleMatch[]) => void;
}

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  startTime: '09:00',
  matchDuration: 40,
  courtBlocks: { A: true, B: true, C: true, D: true },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTournamentId: null,
      setCurrentTournamentId: (id) => set({ currentTournamentId: id }),
      scheduleConfig: DEFAULT_SCHEDULE_CONFIG,
      setScheduleConfig: (config) =>
        set((state) => ({
          scheduleConfig: { ...state.scheduleConfig, ...config },
        })),
      scheduleSlots: [],
      setScheduleSlots: (slots) => set({ scheduleSlots: slots }),
      allScheduleMatches: [],
      setAllScheduleMatches: (matches) => set({ allScheduleMatches: matches }),
    }),
    {
      name: 'tennis-tournament-storage', // localStorage に保存
    }
  )
);
