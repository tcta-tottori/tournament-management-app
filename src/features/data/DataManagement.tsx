import { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Database as DatabaseIcon, ListChecks, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertTriangle, Trophy, Calendar, MapPin, Pencil, Users, Eraser, FlaskConical } from 'lucide-react';
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
import { useTeamStore } from '../team/teamStore';
import { fillTestScores } from '../score/testScoreFiller';

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
    <section className="bg-white rounded-xl shadow-sm border border-primary-200 overflow-hidden">
      <div className="bg-gradient-to-r from-primary-50 to-white px-4 py-3 border-b border-primary-100">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-primary-700">ミックス大会情報</h2>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* 大会名 */}
        <div className="flex items-start gap-3">
          <Trophy className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">大会名</div>
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-primary-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('name')} className="flex items-center gap-1 text-sm font-bold text-gray-800 hover:text-primary-600 transition-colors">
                {tournamentInfo.name}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 日付 */}
        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">開催日</div>
            {editingField === 'date' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-primary-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('date')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-primary-600 transition-colors">
                  {tournamentInfo.date || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveDate && dateOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('date', e.target.value); }}
                    defaultValue=""
                    className="text-xs border border-primary-300 bg-primary-50 text-primary-700 rounded-lg px-2 py-1 cursor-pointer"
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
          <MapPin className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">会場</div>
            {editingField === 'venue' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-primary-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('venue')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-primary-600 transition-colors">
                  {tournamentInfo.venue || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveVenue && venueOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('venue', e.target.value); }}
                    defaultValue=""
                    className="text-xs border border-primary-300 bg-primary-50 text-primary-700 rounded-lg px-2 py-1 cursor-pointer"
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
          <Users className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 font-medium">参加状況</div>
            <div className="text-sm text-gray-700">
              {allTeams.length}ペア / {leagues.length}リーグ
              {entryCount > 0 && <span className="text-primary-600 ml-2">Entry {entryCount}</span>}
              {defCount > 0 && <span className="text-primary-500 ml-2">DEF {defCount}</span>}
            </div>
          </div>
        </div>

        {/* ルール */}
        {tournamentInfo.rules.length > 0 && (
          <div className="mt-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="text-[10px] font-medium text-primary-600 mb-1">ゲームルール</div>
            <div className="text-xs text-primary-700">
              {tournamentInfo.rules.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** 団体戦 大会情報表示・編集セクション */
function TeamTournamentInfoSection() {
  const { tournamentInfo, updateTournamentInfo, leagues, allTeams } = useTeamStore();
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

  const entryCount = allTeams.filter(t => t.status === 'entry').length;
  const defCount = allTeams.filter(t => t.status === 'def').length;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-white px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-700">団体戦 大会情報</h2>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* 大会名 */}
        <div className="flex items-start gap-3">
          <Trophy className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">大会名</div>
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-500"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('name')} className="flex items-center gap-1 text-sm font-bold text-gray-800 hover:text-gray-600 transition-colors">
                {tournamentInfo.name}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 日付 */}
        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">開催日</div>
            {editingField === 'date' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-500"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('date')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-600 transition-colors">
                {tournamentInfo.date || '(未設定)'}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 会場 */}
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 font-medium">会場</div>
            {editingField === 'venue' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full px-2 py-1 text-sm border border-gray-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-500"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('venue')} className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-600 transition-colors">
                {tournamentInfo.venue || '(未設定)'}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 統計 */}
        <div className="flex items-start gap-3">
          <Users className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 font-medium">参加状況</div>
            <div className="text-sm text-gray-700">
              {allTeams.length}チーム / {leagues.length}リーグ
              {entryCount > 0 && <span className="text-gray-600 ml-2">Entry {entryCount}</span>}
              {defCount > 0 && <span className="text-primary-500 ml-2">DEF {defCount}</span>}
            </div>
          </div>
        </div>

        {/* ルール */}
        {tournamentInfo.rules.length > 0 && (
          <div className="mt-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="text-[10px] font-medium text-primary-600 mb-1">ゲームルール</div>
            <div className="text-xs text-primary-700">
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
  const isTeamImported = useTeamStore(s => s.isImported);

  // セクション開閉状態
  const [dataImportOpen, setDataImportOpen] = useState(true);
  const [playerListOpen, setPlayerListOpen] = useState(false);

  // GDriveからダウンロードされたデータを DrawMeetingImport に渡すための state
  const [externalTournamentExcel, setExternalTournamentExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);
  const [externalScheduleExcel, setExternalScheduleExcel] = useState<{ arrayBuffer: ArrayBuffer; fileName: string } | null>(null);
  // ウィザードからの自動インポート情報
  const [wizardAutoImport, setWizardAutoImport] = useState<{ name: string; date: string; venue: string; reserveDate: string; courtNames?: string } | null>(null);
  // ウィザード自動インポートでDBに書き込まれた大会ID（時間割自動生成に使用）
  const [wizardImportedTournamentId, setWizardImportedTournamentId] = useState<string | null>(null);

  // 全データリセット用
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // シート別クリア用
  const [pendingClear, setPendingClear] = useState<null | { title: string; message: string; run: () => void | Promise<void> }>(null);
  const [clearDoneLabel, setClearDoneLabel] = useState<string | null>(null);
  const drawCount = useLiveQuery(() => db.draws.count(), [], 0);
  const matchCount = useLiveQuery(() => db.matches.count(), [], 0);
  const hasDrawData = (drawCount ?? 0) > 0 || (matchCount ?? 0) > 0;

  // テスト用スコア一括入力（運営画面のみ・観戦用ページには出さない）
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [showTestScoreConfirm, setShowTestScoreConfirm] = useState(false);
  const [testScoreRunning, setTestScoreRunning] = useState(false);
  const [testScoreResult, setTestScoreResult] = useState<string | null>(null);
  const hasIndividualMatches = (matchCount ?? 0) > 0 && !isTeamImported && !isMixedImported;

  const handleFillTestScores = useCallback(async () => {
    setShowTestScoreConfirm(false);
    if (!currentTournamentId) return;
    setTestScoreRunning(true);
    setTestScoreResult(null);
    try {
      const res = await fillTestScores(currentTournamentId);
      setTestScoreResult(
        res.filledCount === 0
          ? 'スコアを入力できる試合がありませんでした。エントリーを確定してからお試しください。'
          : `${res.eventCount}種目・${res.filledCount}試合にテストスコアを入力しました（${res.details.map(d => `${d.eventName} ${d.filled}`).join(' / ')}）`,
      );
    } catch (err) {
      console.error('テストスコア入力に失敗:', err);
      setTestScoreResult(`テストスコアの入力に失敗しました: ${(err as Error).message}`);
    } finally {
      setTestScoreRunning(false);
    }
  }, [currentTournamentId]);

  const runPendingClear = useCallback(async () => {
    if (!pendingClear) return;
    const label = pendingClear.title;
    try {
      await pendingClear.run();
      setClearDoneLabel(label);
      setTimeout(() => setClearDoneLabel(null), 3000);
    } catch (err) {
      console.error('Sheet clear failed:', err);
    }
    setPendingClear(null);
  }, [pendingClear]);

  // クリア対象（読み込まれているデータに応じて表示）
  const clearItems = [
    isTeamImported && {
      key: 'team-bracket',
      label: '団体戦：決勝トーナメント',
      desc: '順位トーナメントの試合・結果を削除（予選リーグ・チームは保持）',
      message: '団体戦の決勝トーナメント（順位トーナメント）のデータを削除します。\n\n予選リーグの結果・チーム構成は保持されます。\nこの操作は取り消せません。',
      run: () => useTeamStore.getState().clearBrackets(),
    },
    isTeamImported && {
      key: 'team-league',
      label: '団体戦：予選リーグ結果',
      desc: '予選リーグのスコアをすべて消去（対戦表・チームは保持）',
      message: '団体戦の予選リーグの結果（スコア）をすべて削除します。\n\n対戦表・チーム構成は保持されます。\nこの操作は取り消せません。',
      run: () => useTeamStore.getState().clearLeagueResults(),
    },
    isMixedImported && {
      key: 'mixed-bracket',
      label: 'ミックス：決勝トーナメント',
      desc: '決勝トーナメントの試合・結果を削除（予選リーグは保持）',
      message: 'ミックスの決勝トーナメントのデータを削除します。\n\n予選リーグの結果は保持されます。\nこの操作は取り消せません。',
      run: () => useMixedStore.getState().clearBrackets(),
    },
    isMixedImported && {
      key: 'mixed-league',
      label: 'ミックス：予選リーグ結果',
      desc: '予選リーグのスコアをすべて消去（対戦表は保持）',
      message: 'ミックスの予選リーグの結果（スコア）をすべて削除します。\n\n対戦表は保持されます。\nこの操作は取り消せません。',
      run: () => useMixedStore.getState().clearLeagueResults(),
    },
    hasDrawData && {
      key: 'draws',
      label: 'シングルス/ダブルス：対戦表・試合結果',
      desc: 'ドロー（対戦表）と試合結果を削除（エントリー・選手は保持）',
      message: 'シングルス/ダブルスの対戦表（ドロー）と試合結果を削除します。\n\nエントリー・選手データは保持されます。\nこの操作は取り消せません。',
      run: async () => {
        await db.transaction('rw', [db.draws, db.matches], async () => {
          await db.draws.clear();
          await db.matches.clear();
        });
      },
    },
  ].filter(Boolean) as { key: string; label: string; desc: string; message: string; run: () => void | Promise<void> }[];

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
  const handleWizardTournamentConfirmed = useCallback((arrayBuffer: ArrayBuffer, fileName: string, info: { name: string; date: string; venue: string; reserveDate: string; courtNames?: string }) => {
    setWizardImportedTournamentId(null);
    setWizardAutoImport(info);
    setExternalTournamentExcel({ arrayBuffer, fileName });
    setDataImportOpen(true);
  }, []);

  // ウィザード自動インポートがDBへの書込を完了したとき（時間割自動生成用にIDを保持）
  const handleAutoImportComplete = useCallback((tournamentId: string) => {
    setWizardImportedTournamentId(tournamentId);
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
      // 団体戦データもリセット
      useTeamStore.getState().resetAll();
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

      {/* 団体戦 大会情報 */}
      {isTeamImported && <TeamTournamentInfoSection />}

      {/* Google ドライブ連携（接続 + 一括読込 + フォルダ + 大会/時間割読込） */}
      <DataSync
        onConnectionChange={handleConnectionChange}
        onDataLoaded={handleDataLoaded}
        onTournamentExcelLoaded={handleTournamentExcelLoaded}
        onScheduleExcelLoaded={handleScheduleExcelLoaded}
        onWizardTournamentConfirmed={handleWizardTournamentConfirmed}
        wizardImportedTournamentId={wizardImportedTournamentId}
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
              onAutoImportComplete={handleAutoImportComplete}
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

      {/* テスト用スコア一括入力（動作確認用・観戦用ページには表示しない） */}
      {hasIndividualMatches && (
        <section className="rounded-xl overflow-hidden border border-gray-200/70 bg-gradient-to-r from-gray-50/70 to-gray-50/40">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-800">テスト用スコア一括入力</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                全種目（トーナメント・リーグ）の試合に 8-4 / 6-4 のスコアを決勝まで入力します。動作確認用で、既存のスコアは上書きされます。
              </p>
            </div>
            <button
              onClick={() => setShowTestScoreConfirm(true)}
              disabled={testScoreRunning || !currentTournamentId}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {testScoreRunning ? '入力中...' : 'テストスコア入力'}
            </button>
          </div>
          {testScoreResult && (
            <div className="px-5 pb-3 -mt-1">
              <div className="flex items-start gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                <p className="text-xs text-gray-700 font-medium leading-relaxed">{testScoreResult}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* シート別データクリア */}
      {clearItems.length > 0 && (
        <section className="rounded-xl overflow-hidden border border-primary-200/70 bg-gradient-to-r from-primary-50/70 to-primary-50/40">
          <div className="px-5 py-3.5 border-b border-primary-200/60 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-primary-200 shadow-sm flex items-center justify-center shrink-0">
              <Eraser className="w-4.5 h-4.5 text-primary-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">シート別データクリア</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">決勝トーナメントなど、区分ごとにデータを個別に削除できます</p>
            </div>
          </div>
          <div className="p-4 grid gap-2.5 sm:grid-cols-2">
            {clearItems.map(item => (
              <div key={item.key} className="flex items-center gap-3 px-3.5 py-3 bg-white rounded-xl border border-primary-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800">{item.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
                <button
                  onClick={() => setPendingClear({ title: item.label, message: item.message, run: item.run })}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 hover:border-primary-300 transition-all shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  クリア
                </button>
              </div>
            ))}
          </div>
          {clearDoneLabel && (
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-lg border border-primary-200">
                <span className="w-2 h-2 rounded-full bg-primary-400 shrink-0" />
                <p className="text-xs text-primary-700 font-medium">「{clearDoneLabel}」をクリアしました</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 全データリセット */}
      <section className="rounded-xl overflow-hidden border border-red-200/60 bg-gradient-to-r from-red-50/80 to-primary-50/50">
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
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-lg border border-primary-200">
              <span className="w-2 h-2 rounded-full bg-primary-400 shrink-0" />
              <p className="text-xs text-primary-700 font-medium">全データをリセットしました</p>
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

      {/* テストスコア入力の確認ダイアログ */}
      <ConfirmDialog
        open={showTestScoreConfirm}
        title="テスト用スコアを入力"
        message={"全種目（トーナメント・リーグ）の試合に、決勝までテスト用のスコアを入力します。\n\n・スコアは 8-4 / 6-4（種目のゲーム数に応じて）\n・トーナメントは勝者を次の回戦へ繰り上げます\n・既存のスコア・勝敗はすべて上書きされます\n\n動作確認用の機能です。実際の大会データがある場合は実行しないでください。"}
        danger
        confirmLabel="入力する"
        onConfirm={handleFillTestScores}
        onCancel={() => setShowTestScoreConfirm(false)}
      />

      {/* シート別クリア確認ダイアログ */}
      <ConfirmDialog
        open={pendingClear !== null}
        title={pendingClear ? `${pendingClear.title} をクリア` : ''}
        message={pendingClear?.message ?? ''}
        danger
        confirmLabel="クリア実行"
        onConfirm={runPendingClear}
        onCancel={() => setPendingClear(null)}
      />
    </div>
  );
}
