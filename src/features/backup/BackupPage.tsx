import { useState, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileJson,
  Cloud,
  RefreshCw,
  Trophy,
} from 'lucide-react';

// テーブル表示名マッピング
const TABLE_LABELS: Record<string, string> = {
  tournaments: '大会',
  players: '選手',
  events: '種目',
  entries: 'エントリー',
  draws: 'ドロー',
  matches: '試合',
  courts: 'コート',
  furiganaDict: 'ふりがな辞書',
  affiliationFurigana: '所属ふりがな',
};

export default function BackupPage() {
  // --- ローカルバックアップ state ---
  const [localStatus, setLocalStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Google ドライブ state ---
  const [driveStatus, setDriveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // --- DB レコード数 (useLiveQuery) ---
  const tournamentCount = useLiveQuery(() => db.tournaments.count()) ?? 0;
  const playerCount = useLiveQuery(() => db.players.count()) ?? 0;
  const eventCount = useLiveQuery(() => db.events.count()) ?? 0;
  const entryCount = useLiveQuery(() => db.entries.count()) ?? 0;
  const drawCount = useLiveQuery(() => db.draws.count()) ?? 0;
  const matchCount = useLiveQuery(() => db.matches.count()) ?? 0;
  const courtCount = useLiveQuery(() => db.courts.count()) ?? 0;
  const furiganaDictCount = useLiveQuery(() => db.furiganaDict.count()) ?? 0;
  const affiliationCount = useLiveQuery(() => db.affiliationFurigana.count()) ?? 0;

  const tableCounts: Record<string, number> = {
    tournaments: tournamentCount,
    players: playerCount,
    events: eventCount,
    entries: entryCount,
    draws: drawCount,
    matches: matchCount,
    courts: courtCount,
    furiganaDict: furiganaDictCount,
    affiliationFurigana: affiliationCount,
  };

  const totalRecords = Object.values(tableCounts).reduce((sum, c) => sum + c, 0);

  // Google ドライブ接続状態
  const isGdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();

  // --- ミックスダブルス バックアップ state ---
  const [mixedStatus, setMixedStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isMixedExporting, setIsMixedExporting] = useState(false);
  const [isMixedImporting, setIsMixedImporting] = useState(false);
  const mixedFileInputRef = useRef<HTMLInputElement>(null);
  const mixedStore = useMixedStore();

  const handleMixedExport = useCallback(() => {
    setIsMixedExporting(true);
    setMixedStatus(null);
    try {
      const raw = localStorage.getItem('mixed-tournament-storage');
      if (!raw) {
        setMixedStatus({ type: 'error', message: 'ミックスダブルスのデータがありません。' });
        setIsMixedExporting(false);
        return;
      }
      const parsed = JSON.parse(raw);
      const stateData = parsed?.state || parsed;

      // 軽量化: rawExcelSheetsを除外
      const exportData = {
        _type: 'mixed-tournament-backup',
        _version: 1,
        exportedAt: new Date().toISOString(),
        tournamentName: stateData?.tournamentInfo?.name || '',
        tournamentDate: stateData?.tournamentInfo?.date || '',
        state: { ...stateData, rawExcelSheets: [] },
      };

      const json = JSON.stringify(exportData);
      const blob = new Blob([json], { type: 'application/json' });

      const name = exportData.tournamentName || 'ミックスダブルス';
      const date = exportData.tournamentDate || new Date().toISOString().slice(0, 10);
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
      setMixedStatus({ type: 'success', message: `バックアップをエクスポートしました（${sizeKB} KB）` });
    } catch (err) {
      setMixedStatus({ type: 'error', message: `エクスポートに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsMixedExporting(false);
    }
  }, []);

  const handleMixedImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsMixedImporting(true);
    setMixedStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed?._type !== 'mixed-tournament-backup' || !parsed?.state) {
        setMixedStatus({ type: 'error', message: 'ミックスダブルスバックアップの形式ではありません。' });
        setIsMixedImporting(false);
        return;
      }

      const name = parsed.tournamentName || '不明';
      const date = parsed.tournamentDate || '不明';
      const confirmed = confirm(
        `このバックアップを復元しますか？\n\n` +
        `大会名: ${name}\n日付: ${date}\n` +
        `エクスポート日時: ${parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ja-JP') : '不明'}\n\n` +
        `※ 現在のミックスダブルスデータは上書きされます。`
      );
      if (!confirmed) {
        setIsMixedImporting(false);
        return;
      }

      // Zustandのpersist形式でlocalStorageに書き込み
      const persistData = { state: parsed.state, version: 4 };
      localStorage.setItem('mixed-tournament-storage', JSON.stringify(persistData));
      // ページをリロードしてZustand storeをhydrateし直す
      window.location.reload();
    } catch (err) {
      setMixedStatus({ type: 'error', message: `インポートに失敗しました: ${(err as Error).message}` });
      setIsMixedImporting(false);
    }
  }, []);

  // ================================================================
  // ローカルバックアップ: エクスポート
  // ================================================================
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setLocalStatus(null);
    try {
      const data = await exportFullBackup();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `バックアップ_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setLocalStatus({ type: 'success', message: `バックアップをエクスポートしました（${data.stats.totalRecords}件）` });
    } catch (err) {
      setLocalStatus({ type: 'error', message: `エクスポートに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ================================================================
  // ローカルバックアップ: インポート
  // ================================================================
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 次回同じファイルを選べるようリセット
    e.target.value = '';

    setIsImporting(true);
    setLocalStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!validateBackupData(parsed)) {
        setLocalStatus({ type: 'error', message: 'バックアップファイルの形式が正しくありません。' });
        setIsImporting(false);
        return;
      }

      const recordCount = parsed.stats.totalRecords;
      const confirmed = confirm(
        `このバックアップを復元しますか？\n\n` +
        `作成日時: ${parsed.createdAt}\n` +
        `レコード数: ${recordCount}件\n\n` +
        `※ 既存データはすべて上書きされます。`
      );

      if (!confirmed) {
        setIsImporting(false);
        return;
      }

      const result = await importFullBackup(parsed, true);
      if (result.errors.length > 0) {
        setLocalStatus({
          type: 'error',
          message: `インポート完了（${result.imported}件）。エラー: ${result.errors.join(', ')}`,
        });
      } else {
        setLocalStatus({ type: 'success', message: `バックアップを復元しました（${result.imported}件）` });
      }
    } catch (err) {
      setLocalStatus({ type: 'error', message: `インポートに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsImporting(false);
    }
  }, []);

  // ================================================================
  // Google ドライブ: アップロード
  // ================================================================
  const handleDriveUpload = useCallback(async () => {
    setIsUploading(true);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const data = await exportFullBackup();
      const json = JSON.stringify(data, null, 2);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `バックアップ_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
      await uploadBackupJson(token, filename, json);
      setDriveStatus({ type: 'success', message: `Google ドライブにアップロードしました（${filename}）` });
      // アップロード後にファイル一覧を更新
      handleDriveListFiles();
    } catch (err) {
      setDriveStatus({ type: 'error', message: `アップロードに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsUploading(false);
    }
  }, []);

  // ================================================================
  // Google ドライブ: ファイル一覧取得
  // ================================================================
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

  // ================================================================
  // Google ドライブ: ダウンロード＆復元
  // ================================================================
  const handleDriveRestore = useCallback(async (file: GoogleDriveFile) => {
    const confirmed = confirm(
      `このバックアップを復元しますか？\n\n` +
      `ファイル名: ${file.name}\n` +
      `更新日時: ${new Date(file.modifiedTime).toLocaleString('ja-JP')}\n\n` +
      `※ 既存データはすべて上書きされます。`
    );
    if (!confirmed) return;

    setIsDownloading(file.id);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const json = await downloadBackupFile(token, file.id);
      const parsed = JSON.parse(json);

      if (!validateBackupData(parsed)) {
        setDriveStatus({ type: 'error', message: 'ダウンロードしたファイルの形式が正しくありません。' });
        return;
      }

      const result = await importFullBackup(parsed, true);
      if (result.errors.length > 0) {
        setDriveStatus({
          type: 'error',
          message: `復元完了（${result.imported}件）。エラー: ${result.errors.join(', ')}`,
        });
      } else {
        setDriveStatus({ type: 'success', message: `バックアップを復元しました（${result.imported}件）` });
      }
    } catch (err) {
      setDriveStatus({ type: 'error', message: `復元に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsDownloading(null);
    }
  }, []);

  // ================================================================
  // Google ドライブ: ミックスダブルスアップロード
  // ================================================================
  const [isMixedDriveUploading, setIsMixedDriveUploading] = useState(false);
  const [mixedDriveFiles, setMixedDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoadingMixedDriveFiles, setIsLoadingMixedDriveFiles] = useState(false);
  const [isMixedDriveDownloading, setIsMixedDriveDownloading] = useState<string | null>(null);

  const handleMixedDriveUpload = useCallback(async () => {
    setIsMixedDriveUploading(true);
    setMixedStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');

      const raw = localStorage.getItem('mixed-tournament-storage');
      if (!raw) throw new Error('ミックスダブルスのデータがありません。');
      const parsed = JSON.parse(raw);
      const stateData = parsed?.state || parsed;

      const exportData = {
        _type: 'mixed-tournament-backup',
        _version: 1,
        exportedAt: new Date().toISOString(),
        tournamentName: stateData?.tournamentInfo?.name || '',
        tournamentDate: stateData?.tournamentInfo?.date || '',
        state: { ...stateData, rawExcelSheets: [] },
      };

      const json = JSON.stringify(exportData);
      const name = exportData.tournamentName || 'ミックスダブルス';
      const date = exportData.tournamentDate || new Date().toISOString().slice(0, 10);
      const filename = `${name}_${date}.json`;

      await uploadBackupJson(token, filename, json);
      setMixedStatus({ type: 'success', message: `Google ドライブにアップロードしました（${filename}）` });
      handleMixedDriveListFiles();
    } catch (err) {
      setMixedStatus({ type: 'error', message: `アップロードに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsMixedDriveUploading(false);
    }
  }, []);

  const handleMixedDriveListFiles = useCallback(async () => {
    setIsLoadingMixedDriveFiles(true);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const files = await listBackupFiles(token);
      // ミックスダブルスバックアップのみフィルタ（大会名含むファイル or 標準バックアップ以外）
      const mixedFiles = files.filter(f => !f.name.startsWith('バックアップ_'));
      setMixedDriveFiles(mixedFiles);
    } catch (err) {
      setMixedStatus({ type: 'error', message: `ファイル一覧の取得に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsLoadingMixedDriveFiles(false);
    }
  }, []);

  const handleMixedDriveRestore = useCallback(async (file: GoogleDriveFile) => {
    const confirmed = confirm(
      `このバックアップを復元しますか？\n\nファイル名: ${file.name}\n\n※ 現在のミックスダブルスデータは上書きされます。`
    );
    if (!confirmed) return;

    setIsMixedDriveDownloading(file.id);
    setMixedStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('Google ドライブに接続されていません。');
      const json = await downloadBackupFile(token, file.id);
      const parsed = JSON.parse(json);

      if (parsed?._type !== 'mixed-tournament-backup' || !parsed?.state) {
        setMixedStatus({ type: 'error', message: 'ミックスダブルスバックアップの形式ではありません。' });
        return;
      }

      const persistData = { state: parsed.state, version: 4 };
      localStorage.setItem('mixed-tournament-storage', JSON.stringify(persistData));
      window.location.reload();
    } catch (err) {
      setMixedStatus({ type: 'error', message: `復元に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsMixedDriveDownloading(null);
    }
  }, []);

  // ================================================================
  // レンダリング
  // ================================================================
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* ヘッダー */}
      <header className="bg-white p-4 rounded-xl card-tottori">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-primary-500" />
            バックアップ
          </h1>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">
            データベースのバックアップ・復元を行います。ローカル保存またはGoogle ドライブへの保存が可能です。
          </p>
        </div>
      </header>

      {/* データベース概要 */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">データベース概要</h2>
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">テーブル</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">レコード数</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(TABLE_LABELS).map(([key, label]) => (
                  <tr key={key} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-700">{label}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-900">
                      {tableCounts[key].toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="py-2 px-3 text-gray-700">合計</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-900">
                    {totalRecords.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* ローカルバックアップ */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <FileJson className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">ローカルバックアップ</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">
            データベースの全データをJSONファイルとしてエクスポート・インポートします。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              disabled={isExporting || isImporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-primary-500 hover:bg-primary-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              エクスポート（JSON保存）
            </button>

            <button
              onClick={handleImportClick}
              disabled={isExporting || isImporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-red-500 hover:bg-red-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              インポート（JSON復元）
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* ステータスメッセージ */}
          {localStatus && (
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                localStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {localStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{localStatus.message}</span>
            </div>
          )}
        </div>
      </section>

      {/* ミックスダブルス バックアップ */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600" />
          <h2 className="font-semibold text-amber-700">ミックスダブルス バックアップ</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">
            エントリー・予選リーグ・決勝トーナメントのデータを軽量なJSONファイルとして保存・復元します。
          </p>

          {mixedStore.isImported && mixedStore.tournamentInfo && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
              <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <div className="font-bold text-gray-800">{mixedStore.tournamentInfo.name || '大会名未設定'}</div>
                <div className="text-xs text-gray-500">
                  {mixedStore.tournamentInfo.date || '日付未設定'}
                  {' ・ '}リーグ数: {mixedStore.leagues.length}
                  {' ・ '}チーム数: {mixedStore.allTeams.length}
                  {' ・ '}トーナメント: {mixedStore.brackets.length}カテゴリ
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleMixedExport}
              disabled={isMixedExporting || isMixedImporting || !mixedStore.isImported}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-amber-500 hover:bg-amber-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isMixedExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              エクスポート（JSON保存）
            </button>

            <button
              onClick={() => mixedFileInputRef.current?.click()}
              disabled={isMixedExporting || isMixedImporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-red-500 hover:bg-red-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isMixedImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              インポート（JSON復元）
            </button>
            <input ref={mixedFileInputRef} type="file" accept=".json" onChange={handleMixedImport} className="hidden" />
          </div>

          {/* Google ドライブ連携 */}
          {isGdriveConnected && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Cloud className="w-4 h-4" />
                <span className="font-medium">Google ドライブ</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleMixedDriveUpload}
                  disabled={isMixedDriveUploading || !mixedStore.isImported}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-amber-500 hover:bg-amber-600 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isMixedDriveUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  ドライブにアップロード
                </button>
                <button
                  onClick={handleMixedDriveListFiles}
                  disabled={isLoadingMixedDriveFiles}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-emerald-600 hover:bg-emerald-700 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingMixedDriveFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  ファイル一覧を取得
                </button>
              </div>

              {mixedDriveFiles.length > 0 && (
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
                      {mixedDriveFiles.map(file => (
                        <tr key={file.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700 truncate max-w-[200px]">
                            <span className="flex items-center gap-1">
                              <FileJson className="w-4 h-4 text-amber-400 shrink-0" />
                              {file.name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{new Date(file.modifiedTime).toLocaleString('ja-JP')}</td>
                          <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap">{file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '-'}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleMixedDriveRestore(file)}
                              disabled={isMixedDriveDownloading !== null}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isMixedDriveDownloading === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                              復元
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {mixedStatus && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
              mixedStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {mixedStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{mixedStatus.message}</span>
            </div>
          )}
        </div>
      </section>

      {/* Google ドライブ バックアップ */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <Cloud className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">Google ドライブ バックアップ</h2>
        </div>
        <div className="p-4 space-y-4">
          {!isGdriveConnected ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>データページからGoogle ドライブに接続してください</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Google ドライブにバックアップをアップロード・復元します。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDriveUpload}
                  disabled={isUploading || isDownloading !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-primary-500 hover:bg-primary-600 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  ドライブにアップロード
                </button>

                <button
                  onClick={handleDriveListFiles}
                  disabled={isLoadingFiles || isUploading || isDownloading !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-emerald-600 hover:bg-emerald-700 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingFiles ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  ファイル一覧を取得
                </button>
              </div>

              {/* ドライブ上のバックアップファイル一覧 */}
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
                      {driveFiles.map((file) => (
                        <tr key={file.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700 truncate max-w-[200px]">
                            <span className="flex items-center gap-1">
                              <FileJson className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              {file.name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-500 whitespace-nowrap">
                            {new Date(file.modifiedTime).toLocaleString('ja-JP')}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap">
                            {file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDriveRestore(file)}
                              disabled={isDownloading !== null || isUploading}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium
                                bg-primary-500 hover:bg-primary-600 text-white
                                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isDownloading === file.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              復元
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ドライブ ステータスメッセージ */}
              {driveStatus && (
                <div
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                    driveStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {driveStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
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
