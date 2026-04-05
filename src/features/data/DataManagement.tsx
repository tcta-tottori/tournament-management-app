import { useState, useCallback, useEffect } from 'react';
import { Database as DatabaseIcon, ListChecks, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertTriangle, Trophy, Calendar, MapPin, Pencil, Users } from 'lucide-react';
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
import { useMixedStore } from '../mixed/mixedStore';
import MixedExcelViewer from '../mixed/MixedExcelViewer';

/** 予備日を含む文字列から選択肢を生成 */
function parseReserveDayOptions(value: string, type: 'date' | 'venue'): string[] {
  if (!value) return [];
  const options: string[] = [];
  if (type === 'date') {
    // "令和8年4月5日（日）予備日4月11日（土）" → ["令和8年4月5日（日）", full original]
    const mainDate = value.split(/予備日[：:]?/)[0].trim();
    if (mainDate && mainDate !== value) {
      options.push(mainDate);
      options.push(value); // 元のフルテキストも選択肢に
    }
  } else {
    // "ヤマタスポーツパーク（予備日千代テニス場）" → ["ヤマタスポーツパーク", full original]
    const mainVenue = value.replace(/[（(]予備日[^）)]*[）)]/g, '').split(/予備日/)[0].trim();
    if (mainVenue && mainVenue !== value) {
      options.push(mainVenue);
      options.push(value);
    }
  }
  return options;
}

/** ミックス大会情報表示・編集セクション */
function MixedTournamentInfoSection() {
  const { tournamentInfo, updateTournamentInfo, leagues, allTeams } = useMixedStore();
  const [editingField, setEditingField] = useState<'name' | 'date' | 'venue' | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!tournamentInfo) return null;

  const startEdit = (field: 'name' | 'date' | 'venue') => {
    setEditingField(field);
    setEditValue(tournamentInfo[field]);
  };

  const saveEdit = () => {
    if (editingField) {
      updateTournamentInfo(editingField, editValue);
      setEditingField(null);
    }
  };

  const hasReserveDate = /予備日/.test(tournamentInfo.date);
  const hasReserveVenue = /予備日/.test(tournamentInfo.venue);
  const dateOptions = parseReserveDayOptions(tournamentInfo.date, 'date');
  const venueOptions = parseReserveDayOptions(tournamentInfo.venue, 'venue');

  const entryCount = allTeams.filter(t => t.status === 'entry').length;
  const defCount = allTeams.filter(t => t.status === 'def').length;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-emerald-700">ミックス大会情報</h2>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* 大会名 */}
        <div className="flex items-start gap-3">
          <Trophy className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">大会名</div>
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-emerald-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('name')} className="flex items-center gap-1 text-sm font-bold text-gray-800 hover:text-emerald-600 transition-colors">
                {tournamentInfo.name}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 日付 */}
        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">開催日</div>
            {editingField === 'date' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-emerald-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('date')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-emerald-600 transition-colors">
                  {tournamentInfo.date || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveDate && dateOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('date', e.target.value); }}
                    defaultValue=""
                    className="text-xs border border-amber-300 bg-amber-50 text-amber-700 rounded-lg px-2 py-1 cursor-pointer"
                  >
                    <option value="" disabled>予備日を除去...</option>
                    {dateOptions.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 会場 */}
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">会場</div>
            {editingField === 'venue' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-emerald-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('venue')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-emerald-600 transition-colors">
                  {tournamentInfo.venue || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveVenue && venueOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('venue', e.target.value); }}
                    defaultValue=""
                    className="text-xs border border-amber-300 bg-amber-50 text-amber-700 rounded-lg px-2 py-1 cursor-pointer"
                  >
                    <option value="" disabled>予備日を除去...</option>
                    {venueOptions.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 統計 */}
        <div className="flex items-start gap-3">
          <Users className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 font-medium">参加状況</div>
            <div className="text-sm text-gray-700">
              {allTeams.length}ペア / {leagues.length}リーグ
              {entryCount > 0 && <span className="text-emerald-600 ml-2">Entry {entryCount}</span>}
              {defCount > 0 && <span className="text-orange-500 ml-2">DEF {defCount}</span>}
            </div>
          </div>
        </div>

        {/* ルール */}
        {tournamentInfo.rules.length > 0 && (
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-[10px] font-medium text-amber-600 mb-1">ゲームルール</div>
            <div className="text-xs text-amber-700">
              {tournamentInfo.rules.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function DataManagement() {
  // 共有 Google Drive 接続状態（再レンダリングトリガー用）
  const [, setGdriveVersion] = useState(0);
  const gdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();
  const isMixedImported = useMixedStore(s => s.isImported);

  // セクション開閉状態
  const [dataImportOpen, setDataImportOpen] = useState(true);
  const [playerListOpen, setPlayerListOpen] = useState(false);

  // GDriveからダウンロードされたデータを DrawMeetingImport に渡すための state
  const [externalTournamentExcel, setExternalTournamentExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);
  const [externalScheduleExcel, setExternalScheduleExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);
  // ウィザードからの自動インポート情報
  const [wizardAutoImport, setWizardAutoImport] = useState<{ name: string; date: string; venue: string; reserveDate: string } | null>(null);

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
    setWizardAutoImport(null);
    setDataImportOpen(true);
  }, []);

  // ウィザードで大会確認後に自動インポート
  const handleWizardTournamentConfirmed = useCallback((arrayBuffer: ArrayBuffer, fileName: string, info: { name: string; date: string; venue: string; reserveDate: string }) => {
    setWizardAutoImport(info);
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
      useAppStore.getState().setScheduleFileName('');
      useAppStore.getState().setScheduleSlots([]);
      useAppStore.getState().setAllScheduleMatches([]);
      // ミックス大会データもリセット
      useMixedStore.getState().resetAll();
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

      {/* ミックス大会情報 */}
      {isMixedImported && <MixedTournamentInfoSection />}

      {/* Excelデータビューア */}
      {isMixedImported && <MixedExcelViewer />}

      {/* Google ドライブ連携（接続 + 一括読込 + フォルダ + 大会/時間割読込） */}
      <DataSync
        onConnectionChange={handleConnectionChange}
        onDataLoaded={handleDataLoaded}
        onTournamentExcelLoaded={handleTournamentExcelLoaded}
        onScheduleExcelLoaded={handleScheduleExcelLoaded}
        onWizardTournamentConfirmed={handleWizardTournamentConfirmed}
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
              wizardAutoImport={wizardAutoImport}
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
      <section className="rounded-xl overflow-hidden border border-red-200/60 bg-gradient-to-r from-red-50/80 to-orange-50/50">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white border border-red-200 shadow-sm flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-800">全データリセット</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">大会・エントリー・対戦表・試合結果・コート設定・時間割をすべて削除します</p>
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 hover:border-red-300 transition-all shadow-sm shrink-0"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            リセット
          </button>
        </div>
        {resetDone && (
          <div className="px-5 pb-3 -mt-1">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <p className="text-xs text-green-700 font-medium">全データをリセットしました</p>
            </div>
          </div>
        )}
      </section>

      {/* リセット確認ダイアログ */}
      <ConfirmDialog
        open={showResetConfirm}
        title="全データリセット"
        message={"以下のデータをすべて削除します：\n\n・大会情報\n・選手データ\n・エントリー\n・ドロー・対戦表\n・試合結果\n・コート設定\n・時間割\n\nふりがな・所属辞書は保持されます。\nこの操作は取り消せません。"}
        danger
        confirmLabel="リセット実行"
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
