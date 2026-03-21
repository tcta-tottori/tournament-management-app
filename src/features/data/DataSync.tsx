import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import type { AffiliationFurigana } from '../../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock,
  Download, Upload, FolderOpen, FileSpreadsheet, LogIn, LogOut, Users, Building2, Layers,
  X, Loader2, CalendarClock, FileJson,
} from 'lucide-react';
import DriveLoadingModal, { type LoadingStep } from '../../components/ui/DriveLoadingModal';
import {
  getSavedToken as gdriveGetSavedToken,
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
  connectWithDefaultClientId,
  downloadFuriganaExcel,
  downloadAffiliationExcel,
  uploadFuriganaExcel,
  uploadAffiliationExcel,
  getSharedFolderLink,
  getUserEmail,
  revokeToken,
  clearToken,
  clearFolderCache,
  loadGisScript,
  listTournamentExcelFiles,
  downloadTournamentExcel,
  listScheduleExcelFiles,
  downloadScheduleExcel,
  type GoogleDriveFile,
} from '../backup/googleDriveApi';

const LS_KEY_LAST_SYNC = 'dataSyncLastTimestamp';

/** Google Drive ブランドアイコン */
function GoogleDriveIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L3.45 44.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
      <path d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.85 53z" fill="#2684FC"/>
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00"/>
    </svg>
  );
}

/** スペースを全角半角問わず除去 */
function removeSpaces(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

/** 正規化キー生成: スペース除去 + 小文字化 */
function normalizeKey(s: string): string {
  return s.replace(/[\s\u3000]+/g, '').toLowerCase();
}

async function deduplicateFuriganaDict(): Promise<number> {
  const all = await db.furiganaDict.toArray();
  const seen = new Map<string, typeof all[0]>();
  const toDelete: string[] = [];
  for (const entry of all) {
    const key = normalizeKey(entry.name);
    const existing = seen.get(key);
    if (existing) {
      if ((entry.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        toDelete.push(existing.name);
        seen.set(key, entry);
      } else {
        toDelete.push(entry.name);
      }
    } else {
      seen.set(key, entry);
    }
  }
  if (toDelete.length > 0) await db.furiganaDict.bulkDelete(toDelete);
  return toDelete.length;
}

async function deduplicatePlayers(): Promise<number> {
  const all = await db.players.toArray();
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const key = p.playerId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const toDelete: number[] = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const aHas = a.furigana ? 1 : 0;
      const bHas = b.furigana ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return (b.id || 0) - (a.id || 0);
    });
    for (let i = 1; i < group.length; i++) {
      if (group[i].id) toDelete.push(group[i].id!);
    }
  }
  if (toDelete.length > 0) await db.players.bulkDelete(toDelete);
  return toDelete.length;
}

async function deduplicateAffiliation(): Promise<number> {
  const all = await db.affiliationFurigana.toArray();
  const seen = new Map<string, typeof all[0]>();
  const toDelete: number[] = [];
  for (const entry of all) {
    const key = normalizeKey(entry.name);
    const existing = seen.get(key);
    if (existing) {
      if ((entry.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        toDelete.push(existing.id!);
        seen.set(key, entry);
      } else {
        toDelete.push(entry.id!);
      }
    } else {
      seen.set(key, entry);
    }
  }
  if (toDelete.length > 0) await db.affiliationFurigana.bulkDelete(toDelete);
  return toDelete.length;
}

// ============================================================
// 共有ヘルパー hooks
// ============================================================

function useModalState() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalSteps, setModalSteps] = useState<LoadingStep[]>([]);
  const [modalResult, setModalResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const [modalProgress, setModalProgress] = useState(0);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setModalResult(null);
  }, []);

  const handleTimeout = useCallback(() => {
    setModalResult({ success: false, message: '読み込みがタイムアウトしました（8秒以上応答なし）' });
  }, []);

  const updateStep = useCallback((steps: LoadingStep[], index: number, patch: Partial<LoadingStep>): LoadingStep[] => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    return next;
  }, []);

  return {
    modalOpen, setModalOpen, modalTitle, setModalTitle,
    modalSteps, setModalSteps, modalResult, setModalResult,
    modalProgress, setModalProgress,
    handleModalClose, handleTimeout, updateStep,
  };
}

// ============================================================
// ふりがな・所属の内部読込処理
// ============================================================

async function doDownloadFurigana(token: string): Promise<{ success: boolean; details: string[] }> {
  const file = await downloadFuriganaExcel(token);
  if (!file) throw new Error('「ふりがな一覧」フォルダにExcelファイルがありません');
  const wb = XLSX.read(file.data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws);
  const now = Date.now();
  let dictCount = 0;
  for (const row of rows) {
    const name = String(row['氏名'] || row['選手名'] || row['漢字'] || row['name'] || '').trim();
    const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
    if (!name || !furigana) continue;
    const key = removeSpaces(name);
    await db.furiganaDict.put({ name: key, furigana: removeSpaces(furigana), type: 'manual' as const, updatedAt: now });
    dictCount++;
  }
  let playerCount = 0;
  const allPlayers = await db.players.toArray();
  for (const p of allPlayers) {
    const dictEntry = await db.furiganaDict.get(p.playerId);
    if (dictEntry && dictEntry.furigana && p.furigana !== dictEntry.furigana) {
      await db.players.update(p.id!, { furigana: dictEntry.furigana });
      playerCount++;
    }
  }
  const dedupCount = await deduplicateFuriganaDict();
  const playerDedupCount = await deduplicatePlayers();
  const details = [`ファイル: ${file.fileName}`, `ふりがな辞書: ${dictCount}件`];
  if (dedupCount > 0) details.push(`辞書重複削除: ${dedupCount}件`);
  if (playerDedupCount > 0) details.push(`選手重複削除: ${playerDedupCount}件`);
  if (playerCount > 0) details.push(`選手に適用: ${playerCount}名`);
  return { success: true, details };
}

async function doDownloadAffiliation(token: string): Promise<{ success: boolean; details: string[] }> {
  const file = await downloadAffiliationExcel(token);
  if (!file) throw new Error('「所属一覧」フォルダにExcelファイルがありません');
  const wb = XLSX.read(file.data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws);
  const now = Date.now();
  let count = 0;
  for (const row of rows) {
    const name = String(row['所属名'] || row['name'] || '').trim();
    const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
    if (!name || !furigana) continue;
    const existing = await db.affiliationFurigana.where('name').equals(name).first();
    if (existing) {
      await db.affiliationFurigana.update(existing.id!, { furigana, updatedAt: now });
    } else {
      await db.affiliationFurigana.add({ name, furigana, updatedAt: now } as AffiliationFurigana);
    }
    count++;
  }
  const dedupCount = await deduplicateAffiliation();
  const details = [`ファイル: ${file.fileName}`, `所属ふりがな: ${count}件`];
  if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
  return { success: true, details };
}

// ============================================================
// DataSync メインコンポーネント（Google ドライブ連携）
// ============================================================

interface DataSyncProps {
  onConnectionChange?: () => void;
  onDataLoaded?: () => void;
  /** GDriveから大会Excelダウンロード完了時 */
  onTournamentExcelLoaded?: (arrayBuffer: ArrayBuffer, fileName: string) => void;
  /** GDriveから時間割Excelダウンロード完了時 */
  onScheduleExcelLoaded?: (arrayBuffer: ArrayBuffer, fileName: string) => void;
}

export default function DataSync({ onConnectionChange, onDataLoaded, onTournamentExcelLoaded, onScheduleExcelLoaded }: DataSyncProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [gdriveFolderLink, setGdriveFolderLink] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const modal = useModalState();

  // 大会一覧ファイルリスト
  const [gdriveFileList, setGdriveFileList] = useState<GoogleDriveFile[]>([]);
  const [showFileList, setShowFileList] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  // 時間割ファイルリスト
  const [scheduleGDriveFiles, setScheduleGDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [showScheduleFileList, setShowScheduleFileList] = useState(false);
  const [loadingScheduleFileId, setLoadingScheduleFileId] = useState<string | null>(null);

  // DB counts
  const furiganaDictCount = useLiveQuery(() => db.furiganaDict.count()) ?? 0;
  const affiliationCount = useLiveQuery(() => db.affiliationFurigana.count()) ?? 0;

  useEffect(() => {
    const checkConnection = async () => {
      const connected = !!getSavedClientId() && gdriveIsTokenValid();
      setIsConnected(connected);
      if (connected) {
        const token = gdriveGetSavedToken();
        if (token) {
          try {
            const email = await getUserEmail(token);
            setUserEmail(email);
            const link = await getSharedFolderLink(token);
            setGdriveFolderLink(link);
          } catch { /* ignore */ }
        }
      }
      loadGisScript().catch(() => {});
    };
    checkConnection();
    try {
      const saved = localStorage.getItem(LS_KEY_LAST_SYNC);
      if (saved) setLastSyncTime(saved);
    } catch { /* ignore */ }
  }, []);

  const updateLastSync = useCallback(() => {
    const now = new Date().toISOString();
    setLastSyncTime(now);
    try { localStorage.setItem(LS_KEY_LAST_SYNC, now); } catch { /* ignore */ }
  }, []);

  // --- Google Drive 接続 ---
  const handleConnect = useCallback(async () => {
    setIsProcessing(true);
    setProcessingLabel('接続中...');
    setResult(null);
    try {
      const token = await connectWithDefaultClientId();
      const email = await getUserEmail(token);
      setUserEmail(email);
      setIsConnected(true);
      try {
        const link = await getSharedFolderLink(token);
        setGdriveFolderLink(link);
      } catch { /* ignore */ }
      setResult({ success: true, message: `Google ドライブに接続しました（${email}）` });
      onConnectionChange?.();
    } catch (err) {
      setResult({ success: false, message: `接続に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, [onConnectionChange]);

  // --- Google Drive 切断 ---
  const handleDisconnect = useCallback(() => {
    const token = gdriveGetSavedToken();
    if (token) revokeToken(token);
    clearToken();
    clearFolderCache();
    setIsConnected(false);
    setUserEmail('');
    setGdriveFolderLink('');
    setResult({ success: true, message: 'Google ドライブから切断しました' });
    onConnectionChange?.();
  }, [onConnectionChange]);

  // --- 一括読込（ふりがな＋所属） ---
  const handleBulkDownload = useCallback(async () => {
    let steps: LoadingStep[] = [
      { label: 'ふりがな一覧を読込中...', status: 'loading' },
      { label: '所属一覧', status: 'waiting' },
    ];
    modal.setModalTitle('一括読込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setIsProcessing(true);
    setProcessingLabel('一括読込中...');
    setResult(null);
    const allDetails: string[] = [];
    let hasError = false;
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      modal.setModalProgress(10);
      try {
        const res = await doDownloadFurigana(token);
        modal.setModalProgress(50);
        steps = modal.updateStep(steps, 0, { status: 'done', label: 'ふりがな一覧を読込完了', detail: res.details[1] });
        allDetails.push('【ふりがな】', ...res.details);
      } catch (err) {
        modal.setModalProgress(50);
        steps = modal.updateStep(steps, 0, { status: 'error', label: `ふりがな読込失敗: ${(err as Error).message}` });
        allDetails.push(`【ふりがな】読込失敗: ${(err as Error).message}`);
        hasError = true;
      }
      steps = modal.updateStep(steps, 1, { status: 'loading', label: '所属一覧を読込中...' });
      modal.setModalSteps([...steps]);
      try {
        const res = await doDownloadAffiliation(token);
        modal.setModalProgress(100);
        steps = modal.updateStep(steps, 1, { status: 'done', label: '所属一覧を読込完了', detail: res.details[1] });
        allDetails.push('【所属】', ...res.details);
      } catch (err) {
        modal.setModalProgress(100);
        steps = modal.updateStep(steps, 1, { status: 'error', label: `所属読込失敗: ${(err as Error).message}` });
        allDetails.push(`【所属】読込失敗: ${(err as Error).message}`);
        hasError = true;
      }
      modal.setModalSteps([...steps]);
      updateLastSync();
      const r = hasError
        ? { success: false, message: '一部の読込に失敗しました', details: allDetails }
        : { success: true, message: 'ふりがな・所属データを一括読込しました', details: allDetails };
      setResult(r);
      modal.setModalResult(r);
      if (!hasError) onDataLoaded?.();
    } catch (err) {
      steps = modal.updateStep(steps, 0, { status: 'error', label: `読込失敗: ${(err as Error).message}` });
      modal.setModalSteps([...steps]);
      const r = { success: false, message: `読込失敗: ${(err as Error).message}` };
      setResult(r);
      modal.setModalResult(r);
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, [updateLastSync, modal, onDataLoaded]);

  // --- GDrive 大会一覧ファイルリスト取得 ---
  const handleListTournamentFiles = useCallback(async () => {
    const token = gdriveGetSavedToken();
    if (!token) return;
    const steps: LoadingStep[] = [{ label: '大会一覧フォルダを取得中...', status: 'loading' }];
    modal.setModalTitle('大会一覧');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    try {
      modal.setModalProgress(30);
      const files = await listTournamentExcelFiles(token);
      modal.setModalProgress(100);
      setGdriveFileList(files);
      if (files.length === 0) {
        steps[0] = { ...steps[0], status: 'error', label: '大会一覧フォルダにファイルがありません' };
        modal.setModalSteps([...steps]);
        modal.setModalResult({ success: false, message: 'Google Drive の「大会一覧」フォルダにファイルがありません。' });
      } else {
        steps[0] = { ...steps[0], status: 'done', label: `${files.length}件のファイルを検出` };
        modal.setModalSteps([...steps]);
        modal.setModalResult({ success: true, message: `${files.length}件のファイルが見つかりました` });
        setTimeout(() => { modal.setModalOpen(false); setShowFileList(true); }, 500);
      }
    } catch (err) {
      steps[0] = { ...steps[0], status: 'error', label: `取得失敗: ${(err as Error).message}` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: false, message: `大会一覧の取得に失敗: ${(err as Error).message}` });
    }
  }, [modal]);

  // --- GDrive 大会ファイル選択→ダウンロード ---
  const handleSelectTournamentFile = useCallback(async (file: GoogleDriveFile) => {
    const token = gdriveGetSavedToken();
    if (!token) return;
    setShowFileList(false);
    let steps: LoadingStep[] = [
      { label: `「${file.name}」をダウンロード中...`, status: 'loading' },
    ];
    modal.setModalTitle('大会データ読込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setLoadingFileId(file.id);
    try {
      modal.setModalProgress(30);
      const arrayBuffer = await downloadTournamentExcel(token, file.id);
      modal.setModalProgress(100);
      steps[0] = { ...steps[0], status: 'done', label: `「${file.name}」をダウンロード完了` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: true, message: `ダウンロード完了` });
      onTournamentExcelLoaded?.(arrayBuffer, file.name);
    } catch (err) {
      steps[0] = { ...steps[0], status: 'error', label: `読込失敗: ${(err as Error).message}` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: false, message: `ファイル読込失敗: ${(err as Error).message}` });
    } finally {
      setLoadingFileId(null);
    }
  }, [modal, onTournamentExcelLoaded]);

  // --- GDrive 時間割ファイルリスト取得 ---
  const handleListScheduleFiles = useCallback(async () => {
    const token = gdriveGetSavedToken();
    if (!token) return;
    const steps: LoadingStep[] = [{ label: '時間割フォルダを取得中...', status: 'loading' }];
    modal.setModalTitle('時間割');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    try {
      modal.setModalProgress(30);
      const files = await listScheduleExcelFiles(token);
      modal.setModalProgress(100);
      setScheduleGDriveFiles(files);
      if (files.length === 0) {
        steps[0] = { ...steps[0], status: 'error', label: '時間割フォルダにファイルがありません' };
        modal.setModalSteps([...steps]);
        modal.setModalResult({ success: false, message: 'Google Drive の「時間割」フォルダにファイルがありません。' });
      } else {
        steps[0] = { ...steps[0], status: 'done', label: `${files.length}件のファイルを検出` };
        modal.setModalSteps([...steps]);
        modal.setModalResult({ success: true, message: `${files.length}件のファイルが見つかりました` });
        setTimeout(() => { modal.setModalOpen(false); setShowScheduleFileList(true); }, 500);
      }
    } catch (err) {
      steps[0] = { ...steps[0], status: 'error', label: `取得失敗: ${(err as Error).message}` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: false, message: `ファイル一覧の取得に失敗: ${(err as Error).message}` });
    }
  }, [modal]);

  // --- GDrive 時間割ファイル選択→ダウンロード ---
  const handleSelectScheduleFile = useCallback(async (file: GoogleDriveFile) => {
    const token = gdriveGetSavedToken();
    if (!token) return;
    setShowScheduleFileList(false);
    let steps: LoadingStep[] = [
      { label: `「${file.name}」をダウンロード中...`, status: 'loading' },
    ];
    modal.setModalTitle('時間割読込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setLoadingScheduleFileId(file.id);
    try {
      modal.setModalProgress(30);
      const arrayBuffer = await downloadScheduleExcel(token, file.id);
      modal.setModalProgress(100);
      steps[0] = { ...steps[0], status: 'done', label: `「${file.name}」をダウンロード完了` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: true, message: `ダウンロード完了` });
      onScheduleExcelLoaded?.(arrayBuffer, file.name);
    } catch (err) {
      steps[0] = { ...steps[0], status: 'error', label: `読込失敗: ${(err as Error).message}` };
      modal.setModalSteps([...steps]);
      modal.setModalResult({ success: false, message: `ファイル読込失敗: ${(err as Error).message}` });
    } finally {
      setLoadingScheduleFileId(null);
    }
  }, [modal, onScheduleExcelLoaded]);

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      {/* ローディングモーダル */}
      <DriveLoadingModal
        open={modal.modalOpen}
        title={modal.modalTitle}
        steps={modal.modalSteps}
        progress={modal.modalProgress}
        result={modal.modalResult}
        onClose={modal.handleModalClose}
        onTimeout={modal.handleTimeout}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-[#e8f0fe] to-[#fce8e6] px-4 py-3 border-b border-border-main flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GoogleDriveIcon className="w-5 h-5" />
          <h2 className="font-semibold text-gray-800">Google ドライブ連携</h2>
          {isConnected && (
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">接続中</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {formattedLastSync && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>最終同期: {formattedLastSync}</span>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-2 text-[10px]">
            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              <Users className="w-3 h-3 inline mr-0.5" />ふりがな {furiganaDictCount}
            </span>
            <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
              <Building2 className="w-3 h-3 inline mr-0.5" />所属 {affiliationCount}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {!isConnected ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-3">
              Google ドライブに接続して、データの読込/書込を行います
            </p>
            <button
              onClick={handleConnect}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] disabled:opacity-50 shadow-md transition-all hover:shadow-lg"
            >
              <LogIn className="w-4 h-4" />
              <GoogleDriveIcon className="w-4 h-4" />
              Google ドライブに接続
              {isProcessing && <RefreshCw className="w-4 h-4 animate-spin" />}
            </button>
          </div>
        ) : (
          <>
            {/* 接続情報 + フォルダ表示 */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span>{userEmail || 'Google ドライブ接続中'}</span>
              </div>
              <div className="flex items-center gap-2">
                {gdriveFolderLink && (
                  <a
                    href={gdriveFolderLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1a73e8] bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    フォルダ
                  </a>
                )}
                <button onClick={handleDisconnect} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> 切断
                </button>
              </div>
            </div>

            {/* 一括読込ボタン */}
            <button
              onClick={handleBulkDownload}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#1a73e8] to-[#8e24aa] rounded-xl hover:from-[#1557b0] hover:to-[#6a1b9a] disabled:opacity-50 transition-all shadow-md hover:shadow-lg"
            >
              <Layers className="w-4 h-4" />
              <GoogleDriveIcon className="w-4 h-4" />
              ふりがな・所属を一括読込
              {isProcessing && processingLabel.includes('一括') && <RefreshCw className="w-4 h-4 animate-spin" />}
            </button>

            {/* 大会データ読込 + 時間割読込 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleListTournamentFiles}
                disabled={isProcessing}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#1a73e8] bg-[#e8f0fe] rounded-lg hover:bg-[#d2e3fc] disabled:opacity-40 transition-colors border border-[#1a73e8]/15"
              >
                <FileJson className="w-4 h-4" />
                大会データ読込
              </button>
              <button
                onClick={handleListScheduleFiles}
                disabled={isProcessing}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#1a73e8] bg-[#e8f0fe] rounded-lg hover:bg-[#d2e3fc] disabled:opacity-40 transition-colors border border-[#1a73e8]/15"
              >
                <CalendarClock className="w-4 h-4" />
                時間割読込
              </button>
            </div>
          </>
        )}

        {/* 結果メッセージ */}
        {result && (
          <div className={`p-3 rounded-lg text-sm ${
            result.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <div className="flex items-start gap-2">
              {result.success
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              }
              <div>
                <p className="font-medium">{result.message}</p>
                {result.details && result.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                    {result.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 大会ファイル選択ポップアップ ── */}
      {showFileList && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowFileList(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <GoogleDriveIcon className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">大会一覧</h3>
                <span className="text-xs text-gray-400">{gdriveFileList.length}件</span>
              </div>
              <button onClick={() => setShowFileList(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {gdriveFileList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FolderOpen className="w-12 h-12 mb-3" />
                  <p className="text-sm">ファイルがありません</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {gdriveFileList.map(f => {
                    const displayName = f.name.replace(/\.(xlsx?|xls)$/i, '');
                    const modDate = new Date(f.modifiedTime);
                    const isLoading = loadingFileId === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleSelectTournamentFile(f)}
                        disabled={!!loadingFileId}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          {isLoading ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-blue-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            更新: {modDate.toLocaleDateString('ja-JP')} {modDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 group-hover:text-primary-500 flex-shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-400 text-center">鳥取テニス協会バックアップ &gt; 大会運営システム &gt; 大会一覧</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── 時間割ファイル選択ポップアップ ── */}
      {showScheduleFileList && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowScheduleFileList(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="w-5 h-5 text-primary-500" />
                <h3 className="text-base font-bold text-gray-900">時間割ファイルを選択</h3>
                <span className="text-xs text-gray-400">{scheduleGDriveFiles.length}件</span>
              </div>
              <button onClick={() => setShowScheduleFileList(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {scheduleGDriveFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FolderOpen className="w-12 h-12 mb-3" />
                  <p className="text-sm">ファイルがありません</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {scheduleGDriveFiles.map(f => {
                    const displayName = f.name.replace(/\.(xlsx?|xls)$/i, '');
                    const modDate = new Date(f.modifiedTime);
                    const isLoading = loadingScheduleFileId === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleSelectScheduleFile(f)}
                        disabled={!!loadingScheduleFileId}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          {isLoading ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-blue-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            更新: {modDate.toLocaleDateString('ja-JP')} {modDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 group-hover:text-primary-500 flex-shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-400 text-center">時間割Excelファイルを選択してください</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

// ============================================================
// ふりがな・所属操作パネル（所属・ふりがな一覧セクション用）
// ============================================================

interface FuriganaAffOpsProps {
  gdriveConnected: boolean;
  onDataLoaded?: () => void;
}

export function FuriganaAffiliationOps({ gdriveConnected, onDataLoaded }: FuriganaAffOpsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [, setProcessingLabel] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const excelFuriganaRef = useRef<HTMLInputElement>(null);
  const excelAffRef = useRef<HTMLInputElement>(null);

  const modal = useModalState();
  const furiganaDictCount = useLiveQuery(() => db.furiganaDict.count()) ?? 0;
  const affiliationCount = useLiveQuery(() => db.affiliationFurigana.count()) ?? 0;

  const updateLastSync = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(LS_KEY_LAST_SYNC, now); } catch { /* ignore */ }
  }, []);

  // --- GDrive ふりがな読込 ---
  const handleDownloadFurigana = useCallback(async () => {
    const steps: LoadingStep[] = [{ label: 'ふりがな一覧を読込中...', status: 'loading' }];
    modal.setModalTitle('ふりがな読込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setIsProcessing(true);
    setProcessingLabel('ふりがな読込中...');
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      modal.setModalProgress(30);
      const res = await doDownloadFurigana(token);
      modal.setModalProgress(100);
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'done', label: 'ふりがな一覧を読込完了' }));
      updateLastSync();
      const r = { success: true, message: 'ふりがなデータを読み込みました', details: res.details };
      setResult(r);
      modal.setModalResult(r);
      onDataLoaded?.();
    } catch (err) {
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'error', label: 'ふりがな読込に失敗' }));
      const r = { success: false, message: `読込失敗: ${(err as Error).message}` };
      setResult(r);
      modal.setModalResult(r);
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, [updateLastSync, modal, onDataLoaded]);

  // --- GDrive ふりがな書込 ---
  const handleUploadFurigana = useCallback(async () => {
    const steps: LoadingStep[] = [{ label: 'ふりがなデータを書込中...', status: 'loading' }];
    modal.setModalTitle('ふりがな書込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setIsProcessing(true);
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      modal.setModalProgress(20);
      const allDict = await db.furiganaDict.toArray();
      const sorted = allDict.sort((a, b) => a.furigana.localeCompare(b.furigana, 'ja'));
      const data = sorted.map(d => ({ '氏名': d.name, 'ふりがな': d.furigana, 'ソース': d.type }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ふりがな');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      modal.setModalProgress(60);
      await uploadFuriganaExcel(token, 'ふりがなデータ.xlsx', buf);
      modal.setModalProgress(100);
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'done', label: 'ふりがなデータを書込完了' }));
      const r = { success: true, message: `ふりがなデータ（${data.length}件）を保存しました` };
      setResult(r);
      modal.setModalResult(r);
    } catch (err) {
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'error', label: 'ふりがな書込に失敗' }));
      const r = { success: false, message: `書込失敗: ${(err as Error).message}` };
      setResult(r);
      modal.setModalResult(r);
    } finally {
      setIsProcessing(false);
    }
  }, [modal]);

  // --- GDrive 所属読込 ---
  const handleDownloadAffiliation = useCallback(async () => {
    const steps: LoadingStep[] = [{ label: '所属一覧を読込中...', status: 'loading' }];
    modal.setModalTitle('所属読込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setIsProcessing(true);
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      modal.setModalProgress(30);
      const res = await doDownloadAffiliation(token);
      modal.setModalProgress(100);
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'done', label: '所属一覧を読込完了' }));
      updateLastSync();
      const r = { success: true, message: '所属ふりがなを読み込みました', details: res.details };
      setResult(r);
      modal.setModalResult(r);
      onDataLoaded?.();
    } catch (err) {
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'error', label: '所属読込に失敗' }));
      const r = { success: false, message: `読込失敗: ${(err as Error).message}` };
      setResult(r);
      modal.setModalResult(r);
    } finally {
      setIsProcessing(false);
    }
  }, [updateLastSync, modal, onDataLoaded]);

  // --- GDrive 所属書込 ---
  const handleUploadAffiliation = useCallback(async () => {
    const steps: LoadingStep[] = [{ label: '所属データを書込中...', status: 'loading' }];
    modal.setModalTitle('所属書込');
    modal.setModalSteps(steps);
    modal.setModalResult(null);
    modal.setModalProgress(0);
    modal.setModalOpen(true);
    setIsProcessing(true);
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      modal.setModalProgress(20);
      const allAff = await db.affiliationFurigana.toArray();
      const sorted = allAff.filter(a => a.furigana).sort((a, b) => a.furigana.localeCompare(b.furigana, 'ja'));
      const data = sorted.map(a => ({ '所属名': a.name, 'ふりがな': a.furigana }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '所属一覧');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      modal.setModalProgress(60);
      await uploadAffiliationExcel(token, '所属ふりがな.xlsx', buf);
      modal.setModalProgress(100);
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'done', label: '所属データを書込完了' }));
      const r = { success: true, message: `所属ふりがな（${data.length}件）を保存しました` };
      setResult(r);
      modal.setModalResult(r);
    } catch (err) {
      modal.setModalSteps(modal.updateStep(steps, 0, { status: 'error', label: '所属書込に失敗' }));
      const r = { success: false, message: `書込失敗: ${(err as Error).message}` };
      setResult(r);
      modal.setModalResult(r);
    } finally {
      setIsProcessing(false);
    }
  }, [modal]);

  // --- Excelからふりがなインポート ---
  const handleExcelFurigana = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const now = Date.now();
      let count = 0;
      for (const row of rows) {
        const name = String(row['氏名'] || row['選手名'] || row['漢字'] || row['name'] || '').trim();
        const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
        if (!name || !furigana) continue;
        await db.furiganaDict.put({ name: removeSpaces(name), furigana: removeSpaces(furigana), type: 'manual' as const, updatedAt: now });
        count++;
      }
      let playerCount = 0;
      const allPlayers = await db.players.toArray();
      for (const p of allPlayers) {
        const dictEntry = await db.furiganaDict.get(p.playerId);
        if (dictEntry && dictEntry.furigana && p.furigana !== dictEntry.furigana) {
          await db.players.update(p.id!, { furigana: dictEntry.furigana });
          playerCount++;
        }
      }
      const dedupCount = await deduplicateFuriganaDict();
      updateLastSync();
      const details = [`ふりがな辞書: ${count}件`];
      if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
      if (playerCount > 0) details.push(`選手に適用: ${playerCount}名`);
      setResult({ success: true, message: `${count}件のふりがなをインポートしました`, details });
      onDataLoaded?.();
    } catch (err) {
      setResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      if (excelFuriganaRef.current) excelFuriganaRef.current.value = '';
    }
  }, [updateLastSync, onDataLoaded]);

  // --- Excelから所属インポート ---
  const handleExcelAff = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const now = Date.now();
      let count = 0;
      for (const row of rows) {
        const name = String(row['所属名'] || row['name'] || '').trim();
        const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
        if (!name || !furigana) continue;
        const existing = await db.affiliationFurigana.where('name').equals(name).first();
        if (existing) {
          await db.affiliationFurigana.update(existing.id!, { furigana, updatedAt: now });
        } else {
          await db.affiliationFurigana.add({ name, furigana, updatedAt: now } as AffiliationFurigana);
        }
        count++;
      }
      const dedupCount = await deduplicateAffiliation();
      updateLastSync();
      const details = [`所属ふりがな: ${count}件`];
      if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
      setResult({ success: true, message: `${count}件の所属ふりがなをインポートしました`, details });
      onDataLoaded?.();
    } catch (err) {
      setResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      if (excelAffRef.current) excelAffRef.current.value = '';
    }
  }, [updateLastSync, onDataLoaded]);

  return (
    <div className="space-y-4">
      <DriveLoadingModal
        open={modal.modalOpen}
        title={modal.modalTitle}
        steps={modal.modalSteps}
        progress={modal.modalProgress}
        result={modal.modalResult}
        onClose={modal.handleModalClose}
        onTimeout={modal.handleTimeout}
      />

      {/* ふりがな操作 */}
      <div className="border border-blue-100 rounded-lg overflow-hidden">
        <div className="bg-blue-50 px-3 py-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-blue-800">ふりがな一覧</h3>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-auto">{furiganaDictCount}件</span>
        </div>
        <div className="p-3 flex flex-wrap gap-2">
          <button
            onClick={handleDownloadFurigana}
            disabled={isProcessing || !gdriveConnected}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] disabled:opacity-50 transition-colors shadow-sm"
          >
            <GoogleDriveIcon className="w-3.5 h-3.5" />
            <Download className="w-3.5 h-3.5" />
            ドライブから読込
          </button>
          <button
            onClick={handleUploadFurigana}
            disabled={isProcessing || !gdriveConnected || furiganaDictCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#1a73e8] bg-[#e8f0fe] rounded-lg hover:bg-[#d2e3fc] disabled:opacity-50 transition-colors border border-[#1a73e8]/20"
          >
            <GoogleDriveIcon className="w-3.5 h-3.5" />
            <Upload className="w-3.5 h-3.5" />
            ドライブに書込
          </button>
          <div className="w-px h-8 bg-gray-200 mx-1 self-center hidden sm:block" />
          <input ref={excelFuriganaRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFurigana} />
          <button
            onClick={() => excelFuriganaRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors border border-emerald-200"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excelから読込
          </button>
        </div>
      </div>

      {/* 所属操作 */}
      <div className="border border-purple-100 rounded-lg overflow-hidden">
        <div className="bg-purple-50 px-3 py-2 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-purple-800">所属一覧</h3>
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-auto">{affiliationCount}件</span>
        </div>
        <div className="p-3 flex flex-wrap gap-2">
          <button
            onClick={handleDownloadAffiliation}
            disabled={isProcessing || !gdriveConnected}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <GoogleDriveIcon className="w-3.5 h-3.5" />
            <Download className="w-3.5 h-3.5" />
            ドライブから読込
          </button>
          <button
            onClick={handleUploadAffiliation}
            disabled={isProcessing || !gdriveConnected || affiliationCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors border border-purple-200"
          >
            <GoogleDriveIcon className="w-3.5 h-3.5" />
            <Upload className="w-3.5 h-3.5" />
            ドライブに書込
          </button>
          <div className="w-px h-8 bg-gray-200 mx-1 self-center hidden sm:block" />
          <input ref={excelAffRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelAff} />
          <button
            onClick={() => excelAffRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors border border-emerald-200"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excelから読込
          </button>
        </div>
      </div>

      {/* 結果メッセージ */}
      {result && (
        <div className={`p-3 rounded-lg text-sm ${
          result.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-start gap-2">
            {result.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{result.message}</p>
              {result.details && result.details.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                  {result.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
