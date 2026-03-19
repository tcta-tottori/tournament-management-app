import { useState, useRef, useEffect, useCallback } from 'react';
import { db } from '../../db/database';
import * as XLSX from 'xlsx';
import {
  Save, Download, Upload, Trash2, AlertTriangle, CheckCircle,
  Github, RefreshCw, Key, FolderOpen, FileDown, FileUp,
  FileSpreadsheet, Clock, HardDrive, X
} from 'lucide-react';

/** Google Drive ブランドアイコン (三角形ロゴ) */
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

// Google Drive ブランドカラー
const GDRIVE_COLOR = {
  bg: 'bg-[#1a73e8]',
  bgHover: 'hover:bg-[#1557b0]',
  text: 'text-[#1a73e8]',
  bgLight: 'bg-[#e8f0fe]',
  border: 'border-[#1a73e8]/20',
};
import {
  listBackups, downloadBackup, uploadBackup, deleteBackup, validateToken,
  getSavedToken, saveToken, clearToken,
  type GitHubBackupFile, type GitHubConfig
} from './githubApi';
import {
  listBackups as gdriveListBackups,
  downloadBackup as gdriveDownloadBackup,
  uploadBackup as gdriveUploadBackup,
  deleteBackup as gdriveDeleteBackup,
  loadGisScript,
  requestAccessToken,
  revokeToken,
  getSavedToken as gdriveGetSavedToken,
  getSavedClientId,
  saveClientId,
  clearClientId,
  isTokenValid as gdriveIsTokenValid,
  getUserEmail,
  getSharedFolderLink,
  clearFolderCache,
  type GoogleDriveFile,
  type GoogleDriveConfig,
} from './googleDriveApi';

// バックアップデータ生成
async function buildBackupData() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    tables: {
      tournaments: await db.tournaments.toArray(),
      players: await db.players.toArray(),
      furiganaDict: await db.furiganaDict.toArray(),
      events: await db.events.toArray(),
      entries: await db.entries.toArray(),
      draws: await db.draws.toArray(),
      matches: await db.matches.toArray(),
      courts: await db.courts.toArray(),
    }
  };
}

// バックアップデータの復元
async function restoreBackupData(data: any) {
  if (!data.tables || !data.version) {
    throw new Error('無効なバックアップファイルです');
  }

  const expectedTables = ['tournaments', 'players', 'events', 'entries', 'draws', 'matches', 'courts'];
  for (const tableName of expectedTables) {
    if (data.tables[tableName] && !Array.isArray(data.tables[tableName])) {
      throw new Error(`テーブル "${tableName}" のデータ形式が不正です`);
    }
  }

  const stripId = <T extends Record<string, unknown>>(records: T[]): Omit<T, 'id'>[] =>
    records.map(({ id, ...rest }) => rest as Omit<T, 'id'>);

  await db.transaction('rw',
    [db.tournaments, db.players, db.furiganaDict,
      db.events, db.entries, db.draws, db.matches, db.courts],
    async () => {
      await db.tournaments.clear();
      await db.players.clear();
      await db.furiganaDict.clear();
      await db.events.clear();
      await db.entries.clear();
      await db.draws.clear();
      await db.matches.clear();
      await db.courts.clear();

      if (data.tables.tournaments?.length) await db.tournaments.bulkAdd(stripId(data.tables.tournaments) as any);
      if (data.tables.players?.length) await db.players.bulkAdd(stripId(data.tables.players) as any);
      if (data.tables.furiganaDict?.length) await db.furiganaDict.bulkAdd(data.tables.furiganaDict);
      if (data.tables.events?.length) await db.events.bulkAdd(stripId(data.tables.events) as any);
      if (data.tables.entries?.length) await db.entries.bulkAdd(stripId(data.tables.entries) as any);
      if (data.tables.draws?.length) await db.draws.bulkAdd(stripId(data.tables.draws) as any);
      if (data.tables.matches?.length) await db.matches.bulkAdd(stripId(data.tables.matches) as any);
      if (data.tables.courts?.length) await db.courts.bulkAdd(stripId(data.tables.courts) as any);
    }
  );
}

// ファイルサイズのフォーマット
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 日付フォーマット (ファイル名から)
function parseBackupDate(fileName: string): string {
  // backup-2026-03-18-153000.json → 2026/03/18 15:30
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
  }
  return fileName;
}

export default function BackupRestore() {
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<'gdrive' | 'github' | 'local' | 'excel' | 'danger'>('gdrive');

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Save className="w-6 h-6 text-primary-500" />
          バックアップ・復元
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Google ドライブ・GitHub でのバックアップ管理、ローカルファイルのインポート・エクスポート
        </p>
      </header>

      {/* ステータスメッセージ */}
      {status && (
        <div className={`p-3 rounded-xl border flex items-start gap-3 ${
          status.type === 'success' ? 'bg-green-50 border-green-200 text-green-600' :
          status.type === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
          'bg-primary-50 border-primary-500/30 text-primary-500'
        }`}>
          {status.type === 'success' ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" /> :
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />}
          <p className="text-sm flex-1">{status.message}</p>
          <button onClick={() => setStatus(null)} className="shrink-0 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* セクション切り替えタブ */}
      <div className="flex gap-1 bg-white rounded-xl shadow-sm border border-border-main p-1.5">
        {([
          { key: 'gdrive' as const, label: 'Google ドライブ', icon: GoogleDriveIcon, color: 'text-[#1a73e8]' },
          { key: 'github' as const, label: 'GitHub', icon: Github, color: 'text-gray-900' },
          { key: 'local' as const, label: 'ローカル JSON', icon: HardDrive, color: 'text-primary-500' },
          { key: 'excel' as const, label: 'Excel', icon: FileSpreadsheet, color: 'text-green-600' },
          { key: 'danger' as const, label: 'データ管理', icon: AlertTriangle, color: 'text-red-500' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              activeSection === tab.key
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-gray-500 hover:bg-primary-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* セクション内容 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeSection === 'gdrive' && <GoogleDriveSection setStatus={setStatus} />}
        {activeSection === 'github' && <GitHubSection setStatus={setStatus} />}
        {activeSection === 'local' && <LocalSection setStatus={setStatus} />}
        {activeSection === 'excel' && <ExcelSection setStatus={setStatus} />}
        {activeSection === 'danger' && <DangerSection setStatus={setStatus} />}
      </div>
    </div>
  );
}

// ================================================================
// Google ドライブ バックアップセクション
// ================================================================
function GoogleDriveSection({ setStatus }: { setStatus: (s: any) => void }) {
  const [clientId, setClientId] = useState(getSavedClientId());
  const [clientIdInput, setClientIdInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [backups, setBackups] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isImportingLatest, setIsImportingLatest] = useState(false);
  const [showSetup, setShowSetup] = useState(!clientId);
  const [folderLink, setFolderLink] = useState('');

  const getConfig = (): GoogleDriveConfig => ({ accessToken: gdriveGetSavedToken() });

  const loadBackups = async (token?: string) => {
    setIsLoading(true);
    try {
      const t = token || gdriveGetSavedToken();
      const files = await gdriveListBackups({ accessToken: t });
      setBackups(files);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `一覧取得失敗: ${err}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Google ドライブに接続 (OAuth2 ポップアップ)
  const handleConnect = async () => {
    const cid = clientId || clientIdInput.trim();
    if (!cid) {
      setStatus({ type: 'error', message: 'Client ID を入力してください' });
      return;
    }
    setIsConnecting(true);
    try {
      await loadGisScript();
      const token = await requestAccessToken(cid);
      if (cid !== clientId) {
        saveClientId(cid);
        setClientId(cid);
      }
      const email = await getUserEmail(token);
      setUserEmail(email);
      setIsConnected(true);
      setShowSetup(false);
      setStatus({ type: 'success', message: `Google ドライブに接続しました (${email})` });
      await loadBackups(token);
      try {
        const link = await getSharedFolderLink(token);
        setFolderLink(link);
      } catch { /* ignore */ }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `接続失敗: ${err}` });
    } finally {
      setIsConnecting(false);
    }
  };

  // 初期接続チェック
  useEffect(() => {
    if (clientId && gdriveIsTokenValid()) {
      const token = gdriveGetSavedToken();
      setIsConnected(true);
      setShowSetup(false);
      getUserEmail(token).then(email => setUserEmail(email));
      loadBackups(token);
      getSharedFolderLink(token).then(link => setFolderLink(link)).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDisconnect = () => {
    const token = gdriveGetSavedToken();
    if (token) revokeToken(token);
    clearFolderCache();
    setIsConnected(false);
    setBackups([]);
    setUserEmail('');
    setFolderLink('');
    setStatus({ type: 'info', message: 'Google ドライブから切断しました' });
  };

  const handleResetClientId = () => {
    handleDisconnect();
    clearClientId();
    setClientId('');
    setShowSetup(true);
  };

  // エクスポート
  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const data = await buildBackupData();
      const now = new Date();
      const fileName = `backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.json`;
      await gdriveUploadBackup(getConfig(), fileName, data);
      setStatus({ type: 'success', message: `Google ドライブに保存しました: ${fileName}` });
      await loadBackups();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `保存失敗: ${err}` });
    } finally {
      setIsSaving(false);
    }
  };

  // 最新インポート
  const handleImportLatest = async () => {
    setIsImportingLatest(true);
    setStatus(null);
    try {
      const files = await gdriveListBackups(getConfig());
      if (files.length === 0) {
        setStatus({ type: 'error', message: 'Google ドライブにバックアップファイルがありません' });
        return;
      }
      const latest = files[0];
      if (!confirm(`最新のバックアップを復元しますか？\n${latest.name}\n\n現在のデータは全て上書きされます。`)) return;
      const data = await gdriveDownloadBackup(getConfig(), latest);
      await restoreBackupData(data);
      setStatus({ type: 'success', message: `復元完了: ${latest.name}` });
      await loadBackups();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `インポート失敗: ${err}` });
    } finally {
      setIsImportingLatest(false);
    }
  };

  // 個別復元
  const handleRestore = async (file: GoogleDriveFile) => {
    if (!confirm(`このバックアップを復元しますか？\n${file.name}\n\n現在のデータは全て上書きされます。`)) return;
    setIsRestoring(file.id);
    setStatus(null);
    try {
      const data = await gdriveDownloadBackup(getConfig(), file);
      await restoreBackupData(data);
      setStatus({ type: 'success', message: `復元完了: ${file.name} (ver ${data.version})` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `復元失敗: ${err}` });
    } finally {
      setIsRestoring(null);
    }
  };

  // 削除
  const handleDelete = async (file: GoogleDriveFile) => {
    if (!confirm(`このバックアップを削除しますか？\n${file.name}`)) return;
    try {
      await gdriveDeleteBackup(getConfig(), file);
      setStatus({ type: 'success', message: `削除しました: ${file.name}` });
      await loadBackups();
    } catch (err) {
      setStatus({ type: 'error', message: `削除失敗: ${err}` });
    }
  };

  const formatModifiedTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      {/* 接続設定 */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <GoogleDriveIcon className="w-5 h-5" />
            Google ドライブ バックアップ
          </h2>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {userEmail || '接続中'}
              </span>
              <button onClick={handleDisconnect} className="text-xs text-gray-500 hover:text-red-500 transition-colors">
                切断
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">未接続</span>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Google ドライブの共有フォルダ
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono mx-1">鳥取テニス協会バックアップ/大会運営システム</code>
          にバックアップを保存・管理します。
        </p>

        {!isConnected && (
          <div className="space-y-3">
            {showSetup ? (
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-border-main">
                <label className="text-xs font-medium text-gray-600">
                  Google Cloud Console の OAuth 2.0 Client ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={e => setClientIdInput(e.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                    className="flex-1 px-3 py-2 border border-border-main rounded-lg text-sm font-mono focus:ring-[3px] focus:ring-primary-500/15 focus:border-primary-500 outline-none"
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!clientIdInput.trim() || isConnecting}
                    className={`px-4 py-2 ${GDRIVE_COLOR.bg} text-white rounded-lg text-sm font-medium ${GDRIVE_COLOR.bgHover} disabled:opacity-50 transition-colors whitespace-nowrap`}
                  >
                    {isConnecting ? '接続中...' : 'Google で認証'}
                  </button>
                </div>
                <div className="text-[11px] text-gray-400 space-y-0.5">
                  <p>1. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a> でプロジェクトを作成</p>
                  <p>2. Google Drive API を有効化</p>
                  <p>3. OAuth 同意画面を設定 → 認証情報 → OAuth 2.0 クライアント ID を作成</p>
                  <p>4. 承認済み JavaScript 生成元にアプリの URL を追加</p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className={`flex items-center gap-2 ${GDRIVE_COLOR.bg} text-white px-5 py-2.5 rounded-md font-medium ${GDRIVE_COLOR.bgHover} disabled:opacity-50 shadow-sm transition-colors`}
              >
                <GoogleDriveIcon className="w-4 h-4" />
                {isConnecting ? '認証中...' : 'Google ドライブに接続'}
              </button>
            )}
          </div>
        )}

        {isConnected && (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-2 ${GDRIVE_COLOR.bg} text-white px-6 py-3 rounded-lg font-semibold ${GDRIVE_COLOR.bgHover} disabled:opacity-50 shadow-sm transition-colors text-sm`}
              >
                <GoogleDriveIcon className="w-4 h-4" />
                {isSaving ? 'エクスポート中...' : 'Google ドライブにエクスポート'}
              </button>
              <button
                onClick={handleImportLatest}
                disabled={isImportingLatest}
                className={`flex items-center gap-2 ${GDRIVE_COLOR.bg} text-white px-6 py-3 rounded-lg font-semibold ${GDRIVE_COLOR.bgHover} disabled:opacity-50 shadow-sm transition-colors text-sm`}
              >
                <GoogleDriveIcon className="w-4 h-4" />
                {isImportingLatest ? 'インポート中...' : 'Google ドライブからインポート（最新）'}
              </button>
              {folderLink && (
                <a
                  href={folderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 ${GDRIVE_COLOR.bgLight} ${GDRIVE_COLOR.text} px-5 py-3 rounded-lg font-semibold hover:brightness-95 transition-all text-sm border ${GDRIVE_COLOR.border}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  バックアップフォルダを開く
                </a>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadBackups()}
                disabled={isLoading}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                一覧を更新
              </button>
              <button
                onClick={handleResetClientId}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
              >
                Client ID を変更
              </button>
            </div>
          </div>
        )}
      </div>

      {/* バックアップ一覧 */}
      {isConnected && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
            <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2">
              <GoogleDriveIcon className="w-4 h-4" />
              保存済みバックアップ
            </h3>
            <span className="text-xs text-gray-400">{backups.length} 件</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">読込中...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <GoogleDriveIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">バックアップファイルがありません</p>
            </div>
          ) : (
            <div className="divide-y divide-border-main max-h-[400px] overflow-auto">
              {backups.map(file => (
                <div key={file.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#e8f0fe]/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatModifiedTime(file.modifiedTime)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatSize(Number(file.size))}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRestore(file)}
                      disabled={isRestoring === file.id}
                      className={`px-3 py-1.5 text-xs font-medium ${GDRIVE_COLOR.bgLight} ${GDRIVE_COLOR.text} rounded-md hover:brightness-95 disabled:opacity-50 transition-colors`}
                    >
                      {isRestoring === file.id ? '復元中...' : '復元'}
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// GitHub バックアップセクション
// ================================================================
function GitHubSection({ setStatus }: { setStatus: (s: any) => void }) {
  const [token, setToken] = useState(getSavedToken());
  const [tokenInput, setTokenInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [backups, setBackups] = useState<GitHubBackupFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isImportingLatest, setIsImportingLatest] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);

  const config: GitHubConfig = { token };

  // トークンの検証と接続
  const handleConnect = useCallback(async (t: string) => {
    if (!t) return;
    setIsValidating(true);
    try {
      const valid = await validateToken(t);
      if (valid) {
        saveToken(t);
        setToken(t);
        setIsConnected(true);
        setShowTokenInput(false);
        setStatus({ type: 'success', message: 'GitHub に接続しました' });
        // バックアップ一覧を読み込む
        await loadBackups(t);
      } else {
        setStatus({ type: 'error', message: 'トークンが無効です。権限を確認してください。' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: `接続エラー: ${err}` });
    } finally {
      setIsValidating(false);
    }
  }, [setStatus]);

  const loadBackups = async (t?: string) => {
    setIsLoading(true);
    try {
      const files = await listBackups({ token: t || token });
      setBackups(files);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `一覧取得失敗: ${err}` });
    } finally {
      setIsLoading(false);
    }
  };

  // 初期接続チェック
  useEffect(() => {
    if (token) {
      handleConnect(token);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDisconnect = () => {
    clearToken();
    setToken('');
    setIsConnected(false);
    setBackups([]);
    setStatus({ type: 'info', message: 'GitHub から切断しました' });
  };

  // GitHub にバックアップを保存
  const handleSaveToGitHub = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const data = await buildBackupData();
      const now = new Date();
      const fileName = `backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.json`;

      await uploadBackup(config, fileName, data);
      setStatus({ type: 'success', message: `GitHub に保存しました: ${fileName}` });
      await loadBackups();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `保存失敗: ${err}` });
    } finally {
      setIsSaving(false);
    }
  };

  // GitHub から最新のバックアップをワンクリックで復元
  const handleImportLatest = async () => {
    setIsImportingLatest(true);
    setStatus(null);
    try {
      const files = await listBackups(config);
      if (files.length === 0) {
        setStatus({ type: 'error', message: 'GitHub にバックアップファイルがありません' });
        return;
      }
      const latest = files[0];
      if (!confirm(`最新のバックアップを復元しますか？\n${latest.name}\n\n現在のデータは全て上書きされます。`)) return;

      const data = await downloadBackup(config, latest);
      await restoreBackupData(data);
      setStatus({ type: 'success', message: `復元完了: ${latest.name}` });
      await loadBackups();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `インポート失敗: ${err}` });
    } finally {
      setIsImportingLatest(false);
    }
  };

  // GitHub からバックアップを復元
  const handleRestoreFromGitHub = async (file: GitHubBackupFile) => {
    if (!confirm(`このバックアップを復元しますか？\n${file.name}\n\n現在のデータは全て上書きされます。`)) return;

    setIsRestoring(file.name);
    setStatus(null);
    try {
      const data = await downloadBackup(config, file);
      await restoreBackupData(data);
      setStatus({ type: 'success', message: `復元完了: ${file.name} (ver ${data.version})` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `復元失敗: ${err}` });
    } finally {
      setIsRestoring(null);
    }
  };

  // GitHub のバックアップを削除
  const handleDeleteFromGitHub = async (file: GitHubBackupFile) => {
    if (!confirm(`このバックアップを削除しますか？\n${file.name}`)) return;
    try {
      await deleteBackup(config, file);
      setStatus({ type: 'success', message: `削除しました: ${file.name}` });
      await loadBackups();
    } catch (err) {
      setStatus({ type: 'error', message: `削除失敗: ${err}` });
    }
  };

  return (
    <div className="space-y-4">
      {/* 接続設定 */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Github className="w-5 h-5" />
            GitHub バックアップ
          </h2>
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                接続中
              </span>
              <button
                onClick={handleDisconnect}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                切断
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">未接続</span>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          GitHub リポジトリの <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">backups/</code> フォルダにバックアップを保存・管理します。
        </p>

        {!isConnected && (
          <div className="space-y-3">
            {!showTokenInput ? (
              <button
                onClick={() => setShowTokenInput(true)}
                className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-md font-medium hover:bg-gray-800 shadow-sm transition-colors"
              >
                <Key className="w-4 h-4" />
                GitHub トークンを設定
              </button>
            ) : (
              <div className="space-y-2 bg-gray-50 p-4 rounded-lg border border-border-main">
                <label className="text-xs font-medium text-gray-600">
                  Personal Access Token (Contents の read/write 権限が必要)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxx"
                    className="flex-1 px-3 py-2 border border-border-main rounded-lg text-sm font-mono focus:ring-[3px] focus:ring-primary-500/15 focus:border-primary-500 outline-none"
                  />
                  <button
                    onClick={() => handleConnect(tokenInput)}
                    disabled={!tokenInput || isValidating}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isValidating ? '検証中...' : '接続'}
                  </button>
                  <button
                    onClick={() => { setShowTokenInput(false); setTokenInput(''); }}
                    className="px-3 py-2 text-gray-500 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                  >
                    取消
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens で作成
                </p>
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleSaveToGitHub}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-black disabled:opacity-50 shadow-sm transition-colors text-sm"
              >
                <Upload className="w-4 h-4" />
                {isSaving ? 'エクスポート中...' : 'GitHub にエクスポート'}
              </button>
              <button
                onClick={handleImportLatest}
                disabled={isImportingLatest}
                className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-black disabled:opacity-50 shadow-sm transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                {isImportingLatest ? 'インポート中...' : 'GitHub からインポート（最新）'}
              </button>
            </div>
            <button
              onClick={() => loadBackups()}
              disabled={isLoading}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              一覧を更新
            </button>
          </div>
        )}
      </div>

      {/* バックアップ一覧 */}
      {isConnected && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
            <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary-500" />
              保存済みバックアップ
            </h3>
            <span className="text-xs text-gray-400">{backups.length} 件</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">読込中...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Github className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">バックアップファイルがありません</p>
            </div>
          ) : (
            <div className="divide-y divide-border-main max-h-[400px] overflow-auto">
              {backups.map(file => (
                <div key={file.sha} className="px-4 py-3 flex items-center gap-3 hover:bg-primary-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {parseBackupDate(file.name)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatSize(file.size)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRestoreFromGitHub(file)}
                      disabled={isRestoring === file.name}
                      className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-md hover:bg-primary-100 disabled:opacity-50 transition-colors"
                    >
                      {isRestoring === file.name ? '復元中...' : '復元'}
                    </button>
                    <button
                      onClick={() => handleDeleteFromGitHub(file)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// ローカル JSON セクション
// ================================================================
function LocalSection({ setStatus }: { setStatus: (s: any) => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const data = await buildBackupData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tennis-tournament-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const counts = Object.entries(data.tables).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      setStatus({ type: 'success', message: `JSON エクスポート完了 (${counts})` });
    } catch (err) {
      setStatus({ type: 'error', message: `エクスポート失敗: ${err}` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setStatus(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!confirm('現在のデータを上書きしてインポートしますか？\n既存データは全て置き換えられます。')) {
        setIsImporting(false);
        return;
      }

      await restoreBackupData(data);
      setStatus({ type: 'success', message: `JSON インポート完了 (ver ${data.version}, ${data.exportedAt})` });
    } catch (err) {
      setStatus({ type: 'error', message: `インポート失敗: ${err}` });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* エクスポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FileDown className="w-5 h-5 text-primary-500" />
          JSON エクスポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          全データベースの完全バックアップを JSON ファイルとしてダウンロードします。
        </p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'エクスポート中...' : 'JSON ダウンロード'}
        </button>
      </div>

      {/* インポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FileUp className="w-5 h-5 text-primary-500" />
          JSON インポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          バックアップ JSON ファイルからデータを復元します。現在のデータは全て上書きされます。
        </p>
        <label className={`inline-flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 shadow-sm transition-colors cursor-pointer ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          {isImporting ? 'インポート中...' : 'JSON ファイルを選択'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

// ================================================================
// Excel インポート/エクスポート セクション
// ================================================================

const TABLE_LABELS: Record<string, string> = {
  tournaments: '大会情報',
  players: '選手マスタ',
  events: '種目',
  entries: 'エントリー',
  draws: 'ドロー結果',
  matches: '試合記録',
  courts: 'コート',
  furiganaDict: 'ふりがな辞書',
};

function ExcelSection({ setStatus }: { setStatus: (s: any) => void }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Excel エクスポート: 全テーブルを各シートに出力
  const handleExcelExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const data = await buildBackupData();
      const wb = XLSX.utils.book_new();

      // メタデータシート
      const metaSheet = XLSX.utils.aoa_to_sheet([
        ['バックアップ情報'],
        ['バージョン', data.version],
        ['エクスポート日時', data.exportedAt],
        [''],
        ['テーブル', 'レコード数'],
        ...Object.entries(data.tables).map(([k, v]) => [TABLE_LABELS[k] || k, v.length]),
      ]);
      XLSX.utils.book_append_sheet(wb, metaSheet, '概要');

      // 各テーブルをシートに出力
      for (const [tableName, records] of Object.entries(data.tables)) {
        if (!records || records.length === 0) continue;
        const sheetName = TABLE_LABELS[tableName] || tableName;

        // ネストされたオブジェクトや配列はJSON文字列に変換
        const flatRecords = records.map((r: any) => {
          const flat: Record<string, any> = {};
          for (const [key, val] of Object.entries(r)) {
            if (val !== null && typeof val === 'object') {
              flat[key] = JSON.stringify(val);
            } else {
              flat[key] = val;
            }
          }
          return flat;
        });

        const ws = XLSX.utils.json_to_sheet(flatRecords);
        XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excelのシート名は31文字まで
      }

      const fileName = `tennis-tournament-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setStatus({ type: 'success', message: `Excel エクスポート完了: ${fileName}` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Excel エクスポート失敗: ${err}` });
    } finally {
      setIsExporting(false);
    }
  };

  // Excel インポート
  const handleDirectExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Excel ファイルからデータをインポートしますか？\n現在のデータは全て上書きされます。')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    setStatus(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });

      // テーブル名の逆引きマップ
      const labelToTable: Record<string, string> = {};
      for (const [k, v] of Object.entries(TABLE_LABELS)) {
        labelToTable[v] = k;
      }

      const tables: Record<string, any[]> = {};
      for (const sheetName of wb.SheetNames) {
        if (sheetName === '概要') continue;
        const tableName = labelToTable[sheetName] || sheetName;
        const ws = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        // JSON文字列をパースして元のオブジェクトに復元
        const restored = rows.map(row => {
          const obj: Record<string, any> = {};
          for (const [key, val] of Object.entries(row as Record<string, any>)) {
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
              try {
                obj[key] = JSON.parse(val);
              } catch {
                obj[key] = val;
              }
            } else {
              obj[key] = val;
            }
          }
          return obj;
        });
        tables[tableName] = restored;
      }

      // バックアップデータ形式に変換して復元
      const backupData = { version: 3, tables };
      await restoreBackupData(backupData);

      const counts = Object.entries(tables).map(([k, v]) => `${TABLE_LABELS[k] || k}: ${v.length}`).join(', ');
      setStatus({ type: 'success', message: `Excel インポート完了 (${counts})` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Excel インポート失敗: ${err}` });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* エクスポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          Excel エクスポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          全データベースを Excel ファイルとしてエクスポートします。各テーブルが個別のシートに出力されます。
        </p>
        <button
          onClick={handleExcelExport}
          disabled={isExporting}
          className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'エクスポート中...' : 'Excel ダウンロード'}
        </button>
      </div>

      {/* インポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FileUp className="w-5 h-5 text-green-600" />
          Excel インポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          エクスポートした Excel ファイルからデータを復元します。シート名がテーブル名に対応します。
        </p>
        <label className={`inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-green-700 shadow-sm transition-colors cursor-pointer ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          {isImporting ? 'インポート中...' : 'Excel ファイルを選択'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleDirectExcelImport}
            className="hidden"
          />
        </label>
      </div>

      {/* テーブル参照 */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-5">
        <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-gray-400" />
          シート名とテーブルの対応
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(TABLE_LABELS).map(([key, label]) => (
            <div key={key} className="bg-gray-50 rounded-md px-3 py-2 text-center">
              <p className="text-xs font-medium text-gray-900">{label}</p>
              <p className="text-[10px] text-gray-400 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// データ管理 (危険ゾーン) セクション
// ================================================================
function DangerSection({ setStatus }: { setStatus: (s: any) => void }) {
  const handleClearAll = async () => {
    if (!confirm('全てのデータを削除しますか？\nこの操作は取り消せません。先にバックアップを取ることを推奨します。')) return;
    if (!confirm('本当に全データを削除しますか？（最終確認）')) return;

    try {
      await db.transaction('rw',
        [db.tournaments, db.players, db.furiganaDict,
          db.events, db.entries, db.draws, db.matches, db.courts],
        async () => {
          await db.tournaments.clear();
          await db.players.clear();
          await db.furiganaDict.clear();
          await db.events.clear();
          await db.entries.clear();
          await db.draws.clear();
          await db.matches.clear();
          await db.courts.clear();
        }
      );
      setStatus({ type: 'success', message: '全データを削除しました' });
    } catch (err) {
      setStatus({ type: 'error', message: `削除失敗: ${err}` });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-[#dc2626]/30 p-5">
        <h2 className="font-bold text-red-600 mb-2 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          全データ削除
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          データベース内の全てのデータを削除します。この操作は取り消せません。<br />
          必ず事前に GitHub またはローカルにバックアップを取ってから実行してください。
        </p>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-2 bg-danger text-white px-5 py-2.5 rounded-md font-medium hover:bg-red-800 shadow-sm transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          全データを削除
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-bold text-amber-700 text-sm mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          注意事項
        </h3>
        <ul className="text-xs text-amber-600 space-y-1">
          <li>- 削除されるデータ: 大会情報、選手マスタ、ふりがな辞書、種目、エントリー、ドロー、試合記録、コート</li>
          <li>- 大会運営中にデータを削除すると復旧が困難です</li>
          <li>- GitHub バックアップから復元すれば元の状態に戻せます</li>
        </ul>
      </div>
    </div>
  );
}
