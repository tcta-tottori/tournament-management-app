import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import AppLayout from './components/layout/AppLayout'
import DataManagement from './features/data/DataManagement'

import EntryRegistration from './features/entry/EntryRegistration'
import DrawGenerator from './features/draw/DrawGenerator'
import DrawBoard from './features/draw/DrawBoard'
import MatchManager from './features/referee/MatchManager'
import ScheduleSheet from './features/schedule/ScheduleSheet'
import Scoreboard from './features/score/Scoreboard'
import CourtSchedule from './features/schedule/CourtSchedule'
import LiveDashboard from './features/live/LiveDashboard'
import BackupRestore from './features/backup/BackupRestore'
import Manual from './features/manual/Manual'
import BroadcastPanel from './features/broadcast/BroadcastPanel'
import CourtMap from './features/courtmap/CourtMap'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/live" element={<LiveDashboard />} />

        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="entry" element={<EntryRegistration />} />

          <Route path="draw-lot" element={<DrawGenerator />} />
          <Route path="draw-table" element={<DrawBoard />} />
          <Route path="referee" element={<MatchManager />} />
          <Route path="schedule-sheet" element={<ScheduleSheet />} />
          <Route path="score" element={<Scoreboard />} />
          <Route path="schedule" element={<CourtSchedule />} />
          <Route path="dashboard" element={<LiveDashboard />} />
          <Route path="backup" element={<BackupRestore />} />
          <Route path="manual" element={<Manual />} />
          <Route path="broadcast" element={<BroadcastPanel />} />
          <Route path="court-map" element={<CourtMap />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
