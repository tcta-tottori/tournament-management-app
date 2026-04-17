import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import AppLayout from './components/layout/AppLayout'
import DataManagement from './features/data/DataManagement'
import { loadSeedDataIfNeeded } from './db/database'

// 初期データ（ふりがな・所属ふりがな）をプリロード
loadSeedDataIfNeeded();

// PWA Service Worker 更新検知 — 新バージョン検出時に自動リロード
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // 新バージョンがアクティブ化されたらリロード
          window.location.reload();
        }
      });
    });
  });
  // 起動時に即座にアップデートを確認
  navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.update();
  });
}

import EntryRegistration from './features/entry/EntryRegistration'
import DrawGenerator from './features/draw/DrawGenerator'
import DrawBoard from './features/draw/DrawBoard'
import MatchManager from './features/referee/MatchManager'
import ScheduleSheet from './features/schedule/ScheduleSheet'
import Scoreboard from './features/score/Scoreboard'
import CourtSchedule from './features/schedule/CourtSchedule'
import LiveDashboard from './features/live/LiveDashboard'

import Manual from './features/manual/Manual'
import BackupPage from './features/backup/BackupPage';
// ResultsPage は結果タブ削除に伴い廃止
import CourtBracketPage from './features/court-bracket/CourtBracketPage';
import TeamCallStatusBubble from './features/team/TeamCallStatusBubble';
// BroadcastPanel は Scoreboard の MatchActionPanel に統合済み

// 参加者・HP向け公開ビュー
import PublicLayout from './features/view/PublicLayout';
import PublicLeagueView from './features/view/PublicLeagueView';
import PublicBracketView from './features/view/PublicBracketView';
import PublicLiveView from './features/view/PublicLiveView';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/live" element={<LiveDashboard />} />

        {/* 参加者・HP向け公開ビュー（運営メニューなし・読み取り専用） */}
        <Route path="/view" element={<PublicLayout />}>
          <Route index element={<Navigate to="/view/league" replace />} />
          <Route path="league" element={<PublicLeagueView />} />
          <Route path="bracket" element={<PublicBracketView />} />
          <Route path="live" element={<PublicLiveView />} />
        </Route>

        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="entry" element={<EntryRegistration />} />

          <Route path="draw-lot" element={<DrawGenerator />} />
          <Route path="draw-table" element={<DrawBoard />} />
          <Route path="referee" element={<MatchManager />} />
          <Route path="schedule-sheet" element={<ScheduleSheet />} />
          <Route path="score" element={<Scoreboard />} />
          <Route path="court-bracket" element={<CourtBracketPage />} />
          <Route path="schedule" element={<CourtSchedule />} />
          <Route path="dashboard" element={<LiveDashboard />} />
          {/* results ルートは結果タブ削除に伴い廃止 */}

          <Route path="manual" element={<Manual />} />
          <Route path="backup" element={<BackupPage />} />
          {/* broadcast は Scoreboard の MatchActionPanel に統合済み */}
        </Route>
      </Routes>
      {/* 団体戦コール中の右下ステータスバブル（全ルート共通） */}
      <TeamCallStatusBubble />
    </BrowserRouter>
  </StrictMode>,
)
