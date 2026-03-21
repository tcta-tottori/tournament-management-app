import { useState, useCallback, useEffect } from 'react';
import { Database as DatabaseIcon, ListChecks, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
} from '../backup/googleDriveApi';
import PlayerDataList from './PlayerDataList';
import DataImport from './DrawMeetingImport';
import DataSync, { FuriganaAffiliationOps } from './DataSync';

export default function DataManagement() {
  // 共有 Google Drive 接続状態（再レンダリングトリガー用）
  const [, setGdriveVersion] = useState(0);
  const gdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();

  // セクション開閉状態
  const [dataImportOpen, setDataImportOpen] = useState(true);
  const [playerListOpen, setPlayerListOpen] = useState(false);

  // GDriveからダウンロードされたデータを DrawMeetingImport に渡すための state
  const [externalTournamentExcel, setExternalTournamentExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);
  const [externalScheduleExcel, setExternalScheduleExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);

  // DataSync の接続/切断時に再評価をトリガー
  const handleConnectionChange = useCallback(() => {
    setGdriveVersion(v => v + 1);
  }, []);

  // データ読込成功時に所属・ふりがな一覧パネルを自動展開
  const handleDataLoaded = useCallback(() => {
    setPlayerListOpen(true);
  }, []);

  // GDriveから大会Excelがダウンロードされたとき
  const handleTournamentExcelLoaded = useCallback((arrayBuffer: ArrayBuffer, fileName: string) => {
    setExternalTournamentExcel({ arrayBuffer, fileName });
    setDataImportOpen(true);
  }, []);

  // GDriveから時間割Excelがダウンロードされたとき
  const handleScheduleExcelLoaded = useCallback((arrayBuffer: ArrayBuffer, fileName: string) => {
    setExternalScheduleExcel({ arrayBuffer, fileName });
    setDataImportOpen(true);
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

      {/* Google ドライブ連携（接続 + 一括読込 + フォルダ + 大会/時間割読込） */}
      <DataSync
        onConnectionChange={handleConnectionChange}
        onDataLoaded={handleDataLoaded}
        onTournamentExcelLoaded={handleTournamentExcelLoaded}
        onScheduleExcelLoaded={handleScheduleExcelLoaded}
      />

      {/* 大会データ読込パネル（Excelボタン方式） */}
      <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
        <button
          onClick={() => setDataImportOpen(!dataImportOpen)}
          className="w-full bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between hover:bg-primary-100/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {dataImportOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <FileSpreadsheet className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-primary-600">大会データ読込</h2>
          </div>
        </button>
        {dataImportOpen && (
          <div className="p-4">
            <DataImport
              externalTournamentExcel={externalTournamentExcel}
              externalScheduleExcel={externalScheduleExcel}
            />
          </div>
        )}
      </section>

      {/* 所属・ふりがな一覧パネル（ふりがな/所属操作 + 一覧） */}
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
          <div className="p-5 space-y-5">
            {/* ふりがな・所属のGDrive読込/書込 + Excel読込 */}
            <FuriganaAffiliationOps gdriveConnected={gdriveConnected} onDataLoaded={handleDataLoaded} />
            {/* 一覧表示 */}
            <PlayerDataList />
          </div>
        )}
      </section>
    </div>
  );
}
