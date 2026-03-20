import { useState, useCallback, useEffect } from 'react';
import { Database as DatabaseIcon, ListChecks, FileJson, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
} from '../backup/googleDriveApi';
import PlayerDataList from './PlayerDataList';
import DataImport from './DrawMeetingImport';
import DataSync from './DataSync';

export default function DataManagement() {
  // 共有 Google Drive 接続状態（再レンダリングトリガー用）
  const [, setGdriveVersion] = useState(0);
  const gdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();

  // セクション開閉状態
  const [dataImportOpen, setDataImportOpen] = useState(true);
  const [playerListOpen, setPlayerListOpen] = useState(false);

  // DataSync の接続/切断時に再評価をトリガー
  const handleConnectionChange = useCallback(() => {
    setGdriveVersion(v => v + 1);
  }, []);

  // データ読込成功時に所属・ふりがな一覧パネルを自動展開
  const handleDataLoaded = useCallback(() => {
    setPlayerListOpen(true);
  }, []);

  // 初回マウント時にも接続状態を評価
  useEffect(() => {
    setGdriveVersion(v => v + 1);
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <header className="bg-white p-4 rounded-xl card-tottori">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DatabaseIcon className="w-6 h-6 text-primary-500" />
            データ管理
          </h1>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">
            Google ドライブからのデータ読込、所属・ふりがなの管理を行います。
          </p>
        </div>
      </header>

      {/* Google ドライブ連携（接続 + 全Drive機能を統合） */}
      <DataSync onConnectionChange={handleConnectionChange} onDataLoaded={handleDataLoaded} />

      {/* 大会データ読込パネル */}
      <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
        <button
          onClick={() => setDataImportOpen(!dataImportOpen)}
          className="w-full bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between hover:bg-primary-100/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {dataImportOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <FileJson className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-primary-600">大会データ読込</h2>
          </div>
        </button>
        {dataImportOpen && (
          <div className="p-4">
            <DataImport gdriveConnected={gdriveConnected} onGDriveConnectionChange={handleConnectionChange} />
          </div>
        )}
      </section>

      {/* 所属・ふりがな一覧パネル */}
      <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
        <button
          onClick={() => setPlayerListOpen(!playerListOpen)}
          className="w-full bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between hover:bg-primary-100/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {playerListOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <ListChecks className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-primary-600">所属・ふりがな一覧</h2>
          </div>
        </button>
        {playerListOpen && (
          <div className="p-5">
            <PlayerDataList />
          </div>
        )}
      </section>
    </div>
  );
}
