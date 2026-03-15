import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import AppLayout from './components/layout/AppLayout'
import DataManagement from './features/data/DataManagement'
import EntryList from './features/entry/EntryList'
import EntryRegistration from './features/entry/EntryRegistration'

// ダミーコンポーネント（今後各Featureで実装）
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center p-8 h-full">
    <h2 className="text-2xl font-bold text-gray-500">{title} 画面 (作成中)</h2>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/live" element={<Placeholder title="一般公開用LIVE" />} />
        
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/data" replace />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="entry" element={<EntryRegistration />} />
          <Route path="entry-list" element={<EntryList />} />
          <Route path="draw-lot" element={<Placeholder title="S-04 抽選" />} />
          <Route path="draw-table" element={<Placeholder title="S-05 ドロー表" />} />
          <Route path="referee" element={<Placeholder title="S-06 対戦順・審判用紙" />} />
          <Route path="score" element={<Placeholder title="S-07 スコアボード" />} />
          <Route path="schedule" element={<Placeholder title="S-08 コート時間割" />} />
          <Route path="dashboard" element={<Placeholder title="S-09 ライブダッシュボード" />} />
          <Route path="backup" element={<Placeholder title="S-10 バックアップ" />} />
          <Route path="manual" element={<Placeholder title="S-11 マニュアル" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
