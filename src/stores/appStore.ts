import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// グローバルに保持するアプリの状態
interface AppState {
  currentTournamentId: string | null;  // 現在作業中の大会ID
  setCurrentTournamentId: (id: string | null) => void;
  
  // 今後システムでグローバルに切り替えるステータスがある場合はこちらに追加
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTournamentId: null,
      setCurrentTournamentId: (id) => set({ currentTournamentId: id }),
    }),
    {
      name: 'tennis-tournament-storage', // localStorage に保存
    }
  )
);
