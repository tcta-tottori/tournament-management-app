import { useState, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import type { AffiliationFurigana } from '../../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock,
  Download, Upload, FolderOpen, FileSpreadsheet, LogIn, LogOut, Users, Building2,
} from 'lucide-react';
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

/** ふりがな辞書の重複削除
 *  名前（スペース差を無視）と所属（大小文字差を無視）が同じエントリを統合
 *  ※ furiganaDict は name がPKなので、スペース違いの別キーが重複として存在しうる
 *  最新の updatedAt を持つエントリを残す
 */
async function deduplicateFuriganaDict(): Promise<number> {
  const all = await db.furiganaDict.toArray();
  const seen = new Map<string, typeof all[0]>();
  const toDelete: string[] = [];

  for (const entry of all) {
    const key = normalizeKey(entry.name);
    const existing = seen.get(key);
    if (existing) {
      // updatedAt が新しい方を残す
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

  if (toDelete.length > 0) {
    await db.furiganaDict.bulkDelete(toDelete);
  }
  return toDelete.length;
}

/** 所属ふりがなの重複削除
 *  所属名のスペース差・大小文字差を同一とみなし統合
 *  最新の updatedAt を持つエントリを残す
 */
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

  if (toDelete.length > 0) {
    await db.affiliationFurigana.bulkDelete(toDelete);
  }
  return toDelete.length;
}

export default function DataSync() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [gdriveFolderLink, setGdriveFolderLink] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const excelFuriganaRef = useRef<HTMLInputElement>(null);
  const excelAffRef = useRef<HTMLInputElement>(null);

  // DB counts for display
  const furiganaDictCount = useLiveQuery(() => db.furiganaDict.count()) ?? 0;
  const affiliationCount = useLiveQuery(() => db.affiliationFurigana.count()) ?? 0;

  // Check connection on mount
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
      // Pre-load GIS script
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
    } catch (err) {
      setResult({ success: false, message: `接続に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, []);

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
  }, []);

  // --- Google Drive からふりがな読込 ---
  const handleDownloadFurigana = useCallback(async () => {
    setIsProcessing(true);
    setProcessingLabel('ふりがな読込中...');
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
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
        await db.furiganaDict.put({
          name: key,
          furigana: removeSpaces(furigana),
          type: 'manual' as const,
          updatedAt: now,
        });
        dictCount++;
      }

      // 既存選手にも適用
      let playerCount = 0;
      const allPlayers = await db.players.toArray();
      for (const p of allPlayers) {
        const dictEntry = await db.furiganaDict.get(p.playerId);
        if (dictEntry && dictEntry.furigana && p.furigana !== dictEntry.furigana) {
          await db.players.update(p.id!, { furigana: dictEntry.furigana });
          playerCount++;
        }
      }

      // 重複削除
      const dedupCount = await deduplicateFuriganaDict();

      updateLastSync();
      const details = [`ファイル: ${file.fileName}`, `ふりがな辞書: ${dictCount}件`];
      if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
      if (playerCount > 0) details.push(`選手に適用: ${playerCount}名`);
      setResult({ success: true, message: 'ふりがなデータを読み込みました', details });
    } catch (err) {
      setResult({ success: false, message: `読込失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, [updateLastSync]);

  // --- Google Drive からふりがな書込 ---
  const handleUploadFurigana = useCallback(async () => {
    setIsProcessing(true);
    setProcessingLabel('ふりがな書込中...');
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      const allDict = await db.furiganaDict.toArray();
      const sorted = allDict.sort((a, b) => a.furigana.localeCompare(b.furigana, 'ja'));
      const data = sorted.map(d => ({
        '氏名': d.name,
        'ふりがな': d.furigana,
        'ソース': d.type,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ふりがな');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const fileName = `ふりがなデータ.xlsx`;
      await uploadFuriganaExcel(token, fileName, buf);
      setResult({ success: true, message: `ふりがなデータ（${data.length}件）を Google ドライブに保存しました` });
    } catch (err) {
      setResult({ success: false, message: `書込失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, []);

  // --- Google Drive から所属読込 ---
  const handleDownloadAffiliation = useCallback(async () => {
    setIsProcessing(true);
    setProcessingLabel('所属読込中...');
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
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
      // 重複削除
      const dedupCount = await deduplicateAffiliation();

      updateLastSync();
      const details = [`ファイル: ${file.fileName}`, `所属ふりがな: ${count}件`];
      if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
      setResult({ success: true, message: '所属ふりがなを読み込みました', details });
    } catch (err) {
      setResult({ success: false, message: `読込失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, [updateLastSync]);

  // --- Google Drive に所属書込 ---
  const handleUploadAffiliation = useCallback(async () => {
    setIsProcessing(true);
    setProcessingLabel('所属書込中...');
    setResult(null);
    try {
      const token = gdriveGetSavedToken();
      if (!token) throw new Error('Google ドライブに接続してください');
      const allAff = await db.affiliationFurigana.toArray();
      const sorted = allAff.filter(a => a.furigana).sort((a, b) => a.furigana.localeCompare(b.furigana, 'ja'));
      const data = sorted.map(a => ({
        '所属名': a.name,
        'ふりがな': a.furigana,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '所属一覧');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const fileName = `所属ふりがな.xlsx`;
      await uploadAffiliationExcel(token, fileName, buf);
      setResult({ success: true, message: `所属ふりがな（${data.length}件）を Google ドライブに保存しました` });
    } catch (err) {
      setResult({ success: false, message: `書込失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  }, []);

  // --- Excelからふりがなインポート ---
  const handleExcelFurigana = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProcessingLabel('Excel読込中...');
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

      // 既存選手にも適用
      let playerCount = 0;
      const allPlayers = await db.players.toArray();
      for (const p of allPlayers) {
        const dictEntry = await db.furiganaDict.get(p.playerId);
        if (dictEntry && dictEntry.furigana && p.furigana !== dictEntry.furigana) {
          await db.players.update(p.id!, { furigana: dictEntry.furigana });
          playerCount++;
        }
      }

      // 重複削除
      const dedupCount = await deduplicateFuriganaDict();

      updateLastSync();
      const details = [`ふりがな辞書: ${count}件`];
      if (dedupCount > 0) details.push(`重複削除: ${dedupCount}件`);
      if (playerCount > 0) details.push(`選手に適用: ${playerCount}名`);
      setResult({ success: true, message: `${count}件のふりがなをインポートしました（${file.name}）`, details });
    } catch (err) {
      setResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      if (excelFuriganaRef.current) excelFuriganaRef.current.value = '';
    }
  }, [updateLastSync]);

  // --- Excelから所属インポート ---
  const handleExcelAff = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProcessingLabel('Excel読込中...');
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
      // 重複削除
      const dedupCount = await deduplicateAffiliation();

      updateLastSync();
      const details2 = [`所属ふりがな: ${count}件`];
      if (dedupCount > 0) details2.push(`重複削除: ${dedupCount}件`);
      setResult({ success: true, message: `${count}件の所属ふりがなをインポートしました（${file.name}）`, details: details2 });
    } catch (err) {
      setResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
      if (excelAffRef.current) excelAffRef.current.value = '';
    }
  }, [updateLastSync]);

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
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
          {/* DB統計 */}
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

      <div className="p-4 space-y-4">
        {/* 接続セクション */}
        {!isConnected ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-3">
              Google ドライブに接続して、ふりがな・所属データの読込/書込を行います
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
            {/* 接続情報バー */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span>{userEmail || 'Google ドライブ接続中'}</span>
                {gdriveFolderLink && (
                  <a href={gdriveFolderLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#1a73e8] hover:underline">
                    <FolderOpen className="w-3.5 h-3.5" /> フォルダを開く
                  </a>
                )}
              </div>
              <button onClick={handleDisconnect} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
                <LogOut className="w-3.5 h-3.5" /> 切断
              </button>
            </div>

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
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] disabled:opacity-50 transition-colors shadow-sm"
                >
                  <GoogleDriveIcon className="w-3.5 h-3.5" />
                  <Download className="w-3.5 h-3.5" />
                  ドライブから読込
                  {isProcessing && processingLabel.includes('ふりがな読込') && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                </button>
                <button
                  onClick={handleUploadFurigana}
                  disabled={isProcessing || furiganaDictCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#1a73e8] bg-[#e8f0fe] rounded-lg hover:bg-[#d2e3fc] disabled:opacity-50 transition-colors border border-[#1a73e8]/20"
                >
                  <GoogleDriveIcon className="w-3.5 h-3.5" />
                  <Upload className="w-3.5 h-3.5" />
                  ドライブに書込
                  {isProcessing && processingLabel.includes('ふりがな書込') && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
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
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <GoogleDriveIcon className="w-3.5 h-3.5" />
                  <Download className="w-3.5 h-3.5" />
                  ドライブから読込
                  {isProcessing && processingLabel.includes('所属読込') && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                </button>
                <button
                  onClick={handleUploadAffiliation}
                  disabled={isProcessing || affiliationCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors border border-purple-200"
                >
                  <GoogleDriveIcon className="w-3.5 h-3.5" />
                  <Upload className="w-3.5 h-3.5" />
                  ドライブに書込
                  {isProcessing && processingLabel.includes('所属書込') && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
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
    </section>
  );
}
