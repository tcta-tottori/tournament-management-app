import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import ConnectionIndicator from './components/ui/ConnectionIndicator';
import SummaryPage from './features/summary/SummaryPage';
import TournamentPage from './features/summary/TournamentPage';
import SchedulePage from './features/schedule/SchedulePage';
import LeaguePage from './features/league-view/LeaguePage';
import BracketPage from './features/bracket-view/BracketPage';
import LiveScorePage from './features/live-score/LiveScorePage';
import ResultsPage from './features/results/ResultsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/live">
      <Routes>
        <Route path="/" element={<SummaryPage />} />
        <Route path="/tournament/:id" element={<TournamentPage />} />
        <Route path="/tournament/:id/schedule" element={<SchedulePage />} />
        <Route path="/tournament/:id/league/:eventId" element={<LeaguePage />} />
        <Route path="/tournament/:id/draw/:eventId" element={<BracketPage />} />
        <Route path="/tournament/:id/live" element={<LiveScorePage />} />
        <Route path="/tournament/:id/results" element={<ResultsPage />} />
      </Routes>
      <ConnectionIndicator />
    </BrowserRouter>
  </StrictMode>,
);
