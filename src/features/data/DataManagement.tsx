import { useState, useCallback, useEffect } from 'react';
import { Database as DatabaseIcon, ListChecks, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';
import {
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
} from '../backup/googleDriveApi';
import PlayerDataList from './PlayerDataList';
import DataImport from './DrawMeetingImport';
import DataSync, { FuriganaAffiliationOps } from './DataSync';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

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

  // 全データリセット用
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

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

  // 全データリセット
  const handleResetAll = useCallback(async () => {
    setShowResetConfirm(false);
    try {
      await db.transaction('rw', [db.tournaments, db.players, db.events, db.entries, db.draws, db.matches, db.courts], async () => {
        await db.tournaments.clear();
        await db.players.clear();
        await db.events.clear();
        await db.entries.clear();
        await db.draws.clear();
        await db.matches.clear();
        await db.courts.clear();
      });
      // Zustand store リセット
      useAppStore.getState().setCurrentTournamentId(null);
      useAppStore.getState().setImportedSchedule([]);
      useAppStore.getState().setScheduleSlots([]);
      useAppStore.getState().setAllScheduleMatches([]);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      console.error('Reset failed:', err);
    }
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

      {/* 全データリセット */}
      <section className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-gray-600">全データリセット</span>
            <span className="text-[11px] text-gray-400">（大会・エントリー・対戦表・時間割をすべて削除）</span>
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            リセット
          </button>
        </div>
        {resetDone && (
          <div className="px-4 pb-3">
            <p className="text-xs text-green-600 font-medium">全データをリセットしました。</p>
          </div>
        )}
      </section>

      {/* リセット確認ダイアログ */}
      <ConfirmDialog
        open={showResetConfirm}
        title="全データリセット"
        message={"以下のデータをすべて削除します：\n・大会情報\n・選手データ\n・エントリー\n・ドロー・対戦表\n・試合結果\n・コート設定\n・時間割\n\n※ふりがな・所属辞書は保持されます\n※この操作は取り消せません"}
        danger
        confirmLabel="リセット実行"
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
