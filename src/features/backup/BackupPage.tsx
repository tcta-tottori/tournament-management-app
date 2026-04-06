import { useState, useCallback, useRef } from 'react';
import { db } from '../../db/database';
import { exportFullBackup, importFullBackup, validateBackupData } from './backupEngine';
import { useMixedStore } from '../mixed/mixedStore';
import {
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
  getSavedToken,
  uploadBackupJson,
  listBackupFiles,
  downloadBackupFile,
  type GoogleDriveFile,
} from './googleDriveApi';
import {
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cloud,
  RefreshCw,
  FileJson,
} from 'lucide-react';

const MIXED_STORAGE_KEY = 'mixed-tournament-storage';

/** DB + ミックスダブルスを統合した軽量バックアップを生成 */
async function buildUnifiedBackup() {
  const dbData = await exportFullBackup();
  const mixedRaw = localStorage.getItem(MIXED_STORAGE_KEY);
  let mixedState: any = null;
  let tournamentName = '';
  let tournamentDate = '';
  if (mixedRaw) {
    try {
      const parsed = JSON.parse(mixedRaw);
      const state = parsed?.state || parsed;
      tournamentName = state?.tournamentInfo?.name || '';
      tournamentDate = state?.tournamentInfo?.date || '';
      // rawExcelSheetsを除外して軽量化
      mixedState = { ...state, rawExcelSheets: [] };
    } catch { /* ignore */ }
  }
  return {
    _type: 'unified-backup',
    _version: 2,
    createdAt: new Date().toISOString(),
    tournamentName,
    tournamentDate,
    db: dbData,
    mixed: mixedState,
  };
}

/** 統合バックアップを復元 */
async function restoreUnifiedBackup(data: any): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  // DB復元
  if (data.db && validateBackupData(data.db)) {
    const result = await importFullBackup(data.db, true);
    imported += result.imported;
    errors.push(...result.errors);
  } else if (data.tables && validateBackupData(data)) {
    // 旧形式（DB onlyバックアップ）のフォールバック
    const result = await importFullBackup(data, true);
    imported += result.imported;
    errors.push(...result.errors);
  }

  // ミックスダブルス復元
  if (data.mixed) {
    try {
      const persistData = { state: data.mixed, version: 4 };
      localStorage.setItem(MIXED_STORAGE_KEY, JSON.stringify(persistData));
      imported += 1;
    } catch (e) {
      errors.push(`ミックスダブルス: ${(e as Error).message}`);
    }
  } else if (data._type === 'mixed-tournament-backup' && data.state) {
    // 旧ミックス単体バックアップのフォールバック
    try {
      const persistData = { state: data.state, version: 4 };
      localStorage.setItem(MIXED_STORAGE_KEY, JSON.stringify(persistData));
      imported += 1;
    } catch (e) {
      errors.push(`ミックスダブルス: ${(e as Error).message}`);
    }
  }

  return { imported, errors };
}

/** バックアップデータの形式チェック */
function isValidBackup(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  // 統合バックアップ
  if (data._type === 'unified-backup') return true;
  // 旧DBバックアップ
  if (data.tables && data.stats) return true;
  // 旧ミックス単体バックアップ
  if (data._type === 'mixed-tournament-backup' && data.state) return true;
  return false;
}

export default function BackupPage() {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google ドライブ
  const [driveStatus, setDriveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const isGdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();
  const mixedStore = useMixedStore();
  const tournamentName = mixedStore.tournamentInfo?.name || '';

  // ================================================================
  // エクスポート
  // ================================================================
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const data = await buildUnifiedBackup();
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });

      const name = data.tournamentName || '大会バックアップ';
      const date = data.tournamentDate || new Date().toISOString().slice(0, 10);
      const filename = `${name}_${date}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKB = (json.length / 1024).toFixed(1);
      setStatus({ type: 'success', message: `バックアップを保存しました（${sizeKB} KB / ${filename}）` });
    } catch (err) {
      setStatus({ type: 'error', message: `エクスポートに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ================================================================
  // インポート
  // ================================================================
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsImporting(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!isValidBackup(parsed)) {
        setStatus({ type: 'error', message: 'バックアップファイルの形式が正しくありません。' });
        setIsImporting(false);
        return;
      }

      const name = parsed.tournamentName || parsed.db?.tables?.tournaments?.[0]?.name || file.name;
      const confirmed = confirm(
        `このバックアップを復元しますか？\n\n` +
        `ファイル: ${file.name}\n` +
        (parsed.tournamentName ? `大会名: ${parsed.tournamentName}\n` : '') +
        (parsed.createdAt ? `作成日時: ${new Date(parsed.createdAt).toLocaleString('ja-JP')}\n` : '') +
        `\n※ 既存データはすべて上書きされます。復元後ページがリロードされます。`
      );
      if (!confirmed) {
        setIsImporting(false);
        return;
      }

      const result = await restoreUnifiedBackup(parsed);
      if (result.errors.length > 0) {
        setStatus({ type: 'error', message: `復元完了（${result.imported}件）。エラー: ${result.errors.join(', ')}` });
        setIsImporting(false);
      } else {
        // 復元成功 → リロードしてストアを再hydrate
        window.location.reload();
      }
    } catch (err) {
      setStatus({ type: 'error', message: `インポートに失敗しました: ${(err as Error).message}` });
      setIsImporting(false);
    }
  }, []);

  // ================================================================
  // Google ドライブ
  // ================================================================
  const handleDriveUpload = useCallback(async () => {
    setIsUploading(true);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');

      const data = await buildUnifiedBackup();
      const json = JSON.stringify(data);
      const name = data.tournamentName || '大会バックアップ';
      const date = data.tournamentDate || new Date().toISOString().slice(0, 10);
      const filename = `${name}_${date}.json`;

      await uploadBackupJson(token, filename, json);
      setDriveStatus({ type: 'success', message: `アップロードしました（${filename}）` });
      handleDriveListFiles();
    } catch (err) {
      setDriveStatus({ type: 'error', message: `アップロードに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDriveListFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const files = await listBackupFiles(token);
      setDriveFiles(files);
      if (files.length === 0) {
        setDriveStatus({ type: 'success', message: 'バックアップファイルはありません。' });
      }
    } catch (err) {
      setDriveStatus({ type: 'error', message: `ファイル一覧の取得に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  const handleDriveRestore = useCallback(async (file: GoogleDriveFile) => {
    const confirmed = confirm(
      `このバックアップを復元しますか？\n\nファイル名: ${file.name}\n更新日時: ${new Date(file.modifiedTime).toLocaleString('ja-JP')}\n\n※ 既存データはすべて上書きされます。復元後ページがリロードされます。`
    );
    if (!confirmed) return;

    setIsDownloading(file.id);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const json = await downloadBackupFile(token, file.id);
      const parsed = JSON.parse(json);

      if (!isValidBackup(parsed)) {
        setDriveStatus({ type: 'error', message: 'バックアップファイルの形式が正しくありません。' });
        return;
      }

      const result = await restoreUnifiedBackup(parsed);
      if (result.errors.length > 0) {
        setDriveStatus({ type: 'error', message: `復元完了（${result.imported}件）。エラー: ${result.errors.join(', ')}` });
        setIsDownloading(null);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setDriveStatus({ type: 'error', message: `復元に失敗しました: ${(err as Error).message}` });
      setIsDownloading(null);
    }
  }, []);

  // ================================================================
  // レンダリング
  // ================================================================
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ヘッダー */}
      <header className="bg-white p-4 rounded-xl card-tottori">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-primary-500" />
          バックアップ
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          大会の全データ（エントリー・予選リーグ・決勝トーナメント・選手情報など）を1つのファイルで保存・復元します。
        </p>
      </header>

      {/* 現在の大会情報 */}
      {tournamentName && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="font-bold text-gray-800">{tournamentName}</span>
          {mixedStore.tournamentInfo?.date && (
            <span className="text-gray-500">({mixedStore.tournamentInfo.date})</span>
          )}
        </div>
      )}

      {/* ローカルバックアップ */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <FileJson className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">ローカル保存</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              disabled={isExporting || isImporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              バックアップ保存
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExporting || isImporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              バックアップ復元
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
          </div>

          {status && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
              status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{status.message}</span>
            </div>
          )}
        </div>
      </section>

      {/* Google ドライブ */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <Cloud className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">Google ドライブ</h2>
        </div>
        <div className="p-4 space-y-4">
          {!isGdriveConnected ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>データページからGoogle ドライブに接続してください</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDriveUpload}
                  disabled={isUploading || isDownloading !== null}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  ドライブに保存
                </button>

                <button
                  onClick={handleDriveListFiles}
                  disabled={isLoadingFiles || isUploading || isDownloading !== null}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  ファイル一覧
                </button>
              </div>

              {driveFiles.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-600">ファイル名</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">更新日時</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">サイズ</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driveFiles.map(file => (
                        <tr key={file.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700 truncate max-w-[200px]">
                            <span className="flex items-center gap-1">
                              <FileJson className="w-4 h-4 text-gray-400 shrink-0" />
                              {file.name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{new Date(file.modifiedTime).toLocaleString('ja-JP')}</td>
                          <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap">{file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '-'}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDriveRestore(file)}
                              disabled={isDownloading !== null || isUploading}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isDownloading === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                              復元
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {driveStatus && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                  driveStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {driveStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{driveStatus.message}</span>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
