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
  RefreshCw,
  FileJson,
  Shield,
  Trophy,
  Calendar,
} from 'lucide-react';

/** Google ドライブのカラーSVGロゴ */
const GoogleDriveLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

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
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <header className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-2xl shadow-lg">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          </div>
          <div className="relative px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">バックアップ</h1>
                <p className="text-sm text-emerald-50 mt-0.5">大会データをまとめて安全に保存・復元</p>
              </div>
            </div>
          </div>
        </header>

        {/* 現在の大会情報カード */}
        {tournamentName && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-600 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">現在の大会</div>
                <div className="font-bold text-slate-800 truncate">{tournamentName}</div>
                {mixedStore.tournamentInfo?.date && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {mixedStore.tournamentInfo.date}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* データ内容 説明 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
          <div className="text-xs text-slate-500 mb-2 font-medium">バックアップに含まれるデータ</div>
          <div className="flex flex-wrap gap-2">
            {['エントリー', '予選リーグ', '決勝トーナメント', '選手情報', 'ふりがな', '試合結果'].map(item => (
              <span key={item} className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600 font-medium">{item}</span>
            ))}
          </div>
        </div>

        {/* ローカル保存 */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">ローカル保存</h2>
              <p className="text-xs text-slate-500">お使いの端末にJSONファイルとして保存</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExport}
                disabled={isExporting || isImporting}
                className="group relative overflow-hidden flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-2.5">
                  {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  <span>バックアップ保存</span>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isExporting || isImporting}
                className="group relative overflow-hidden flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold bg-white border-2 border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-600 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span>バックアップ復元</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            </div>

            {status && (
              <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm border ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span className="flex-1">{status.message}</span>
              </div>
            )}
          </div>
        </section>

        {/* Google ドライブ */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm">
              <GoogleDriveLogo size={22} />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-slate-800">Google ドライブ</h2>
              <p className="text-xs text-slate-500">クラウドに自動保管、どこからでも復元可能</p>
            </div>
            {isGdriveConnected && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-700">接続中</span>
              </div>
            )}
          </div>
          <div className="p-5 space-y-4">
            {!isGdriveConnected ? (
              <div className="flex items-center gap-3 px-4 py-4 rounded-xl bg-amber-50 border border-amber-200">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                <div className="text-sm text-amber-800">
                  <div className="font-medium">Google ドライブに未接続</div>
                  <div className="text-xs text-amber-600 mt-0.5">データページから接続設定を行ってください</div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleDriveUpload}
                    disabled={isUploading || isDownloading !== null}
                    className="group relative overflow-hidden flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-center gap-2.5">
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                      <span>ドライブに保存</span>
                    </div>
                  </button>

                  <button
                    onClick={handleDriveListFiles}
                    disabled={isLoadingFiles || isUploading || isDownloading !== null}
                    className="flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold bg-white border-2 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-600 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                  >
                    {isLoadingFiles ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    <span>ファイル一覧を更新</span>
                  </button>
                </div>

                {driveFiles.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <GoogleDriveLogo size={14} />
                      <span className="text-xs font-bold text-slate-600">保存済みバックアップ ({driveFiles.length}件)</span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {driveFiles.map(file => (
                        <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileJson className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{file.name}</div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span>{new Date(file.modifiedTime).toLocaleString('ja-JP')}</span>
                              {file.size && <><span>•</span><span>{(Number(file.size) / 1024).toFixed(1)} KB</span></>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDriveRestore(file)}
                            disabled={isDownloading !== null || isUploading}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
                          >
                            {isDownloading === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            復元
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {driveStatus && (
                  <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm border ${
                    driveStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {driveStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="flex-1">{driveStatus.message}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* フッター注意書き */}
        <div className="flex items-start gap-2 px-4 py-3 text-xs text-slate-500">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <p>バックアップには大会の全データが含まれます。復元すると現在のデータは上書きされるのでご注意ください。</p>
        </div>
      </div>
    </div>
  );
}
