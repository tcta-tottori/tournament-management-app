import { useState, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { Github, RefreshCw, CheckCircle2, AlertCircle, Clock, FolderOpen, FileSpreadsheet, Upload } from 'lucide-react';
import { getSavedToken } from '../backup/githubApi';
import {
  getSavedToken as gdriveGetSavedToken,
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
  getSharedFolderLink,
} from '../backup/googleDriveApi';

const LS_KEY_LAST_SYNC = 'dataSyncLastTimestamp';

// ドロー会議システムのリポジトリ設定
const DRAW_REPO_OWNER = 'tcta-tottori';
const DRAW_REPO_NAME = 'tottori-tennis-draw';
const BACKUP_DIR = 'backups';

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

/** GitHub API でドロー会議システムの最新バックアップを取得 */
async function fetchLatestDrawBackup(token: string): Promise<any> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
  };

  const listUrl = `https://api.github.com/repos/${DRAW_REPO_OWNER}/${DRAW_REPO_NAME}/contents/${BACKUP_DIR}`;
  const listRes = await fetch(listUrl, { headers });

  if (listRes.status === 404) {
    throw new Error('ドロー会議システムのバックアップフォルダが見つかりません');
  }
  if (!listRes.ok) {
    throw new Error(`GitHub API エラー (${listRes.status})`);
  }

  const files = await listRes.json();
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('バックアップファイルがありません');
  }

  const jsonFiles = files
    .filter((f: any) => f.type === 'file' && f.name.endsWith('.json'))
    .sort((a: any, b: any) => b.name.localeCompare(a.name));

  if (jsonFiles.length === 0) {
    throw new Error('バックアップファイルがありません');
  }

  const latest = jsonFiles[0];
  const fileRes = await fetch(
    `https://api.github.com/repos/${DRAW_REPO_OWNER}/${DRAW_REPO_NAME}/contents/${latest.path}`,
    { headers }
  );

  if (!fileRes.ok) {
    throw new Error(`バックアップダウンロード失敗 (${fileRes.status})`);
  }

  const fileData = await fileRes.json();
  const content = atob(fileData.content.replace(/\n/g, ''));
  return { data: JSON.parse(decodeURIComponent(escape(content))), fileName: latest.name };
}

/** Google Drive からドロー会議システムの最新バックアップを取得 */
async function fetchLatestDrawBackupFromGDrive(token: string): Promise<any> {
  // ドロー会議システムのバックアップフォルダを検索
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const hdrs = { Authorization: `Bearer ${token}` };

  // 「鳥取テニス協会バックアップ」フォルダを検索
  const rootQ = `name='鳥取テニス協会バックアップ' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const rootRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: rootQ, fields: 'files(id)', pageSize: '1' })}`, { headers: hdrs });
  if (!rootRes.ok) throw new Error(`Google Drive API エラー (${rootRes.status})`);
  const rootData = await rootRes.json();
  const rootId = rootData.files?.[0]?.id;
  if (!rootId) throw new Error('Google Drive に「鳥取テニス協会バックアップ」フォルダが見つかりません');

  // 「ドロー会議システム」サブフォルダを検索
  const subQ = `name='ドロー会議システム' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`;
  const subRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: subQ, fields: 'files(id)', pageSize: '1' })}`, { headers: hdrs });
  if (!subRes.ok) throw new Error(`Google Drive API エラー (${subRes.status})`);
  const subData = await subRes.json();
  const subId = subData.files?.[0]?.id;
  if (!subId) throw new Error('Google Drive に「ドロー会議システム」フォルダが見つかりません');

  // フォルダ内のJSONバックアップを最新順で取得
  const filesQ = `'${subId}' in parents and trashed=false and mimeType='application/json'`;
  const filesRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: filesQ, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '1' })}`, { headers: hdrs });
  if (!filesRes.ok) throw new Error(`Google Drive API エラー (${filesRes.status})`);
  const filesData = await filesRes.json();
  const latest = filesData.files?.[0];
  if (!latest) throw new Error('Google Drive にドロー会議のバックアップファイルがありません');

  // ダウンロード
  const dlRes = await fetch(`${DRIVE_API}/files/${latest.id}?alt=media`, { headers: hdrs });
  if (!dlRes.ok) throw new Error(`ダウンロード失敗 (${dlRes.status})`);
  const data = await dlRes.json();
  return { data, fileName: latest.name };
}

/** バックアップデータからふりがなを抽出して DB に同期する共通処理 */
async function syncFuriganaFromBackupData(
  backupData: any,
  fileName: string,
): Promise<{ details: string[]; playerFuriganaCount: number; furiganaDictCount: number }> {
  const details: string[] = [`バックアップファイル: ${fileName}`];
  let playerFuriganaCount = 0;
  let furiganaDictCount = 0;
  const now = Date.now();

  // バックアップがドロー会議の形式か、大会運営の形式かを判定
  const isDrawSystemBackup = backupData['drawSystem_furigana'] || backupData['drawSystem_rankingBackup'];

  if (isDrawSystemBackup) {
    // === ドロー会議システム形式 ===
    const furiganaData = backupData['drawSystem_furigana'];
    if (furiganaData) {
      try {
        const entries = typeof furiganaData === 'string' ? JSON.parse(furiganaData) : furiganaData;
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (!entry.name || !entry.furigana) continue;
            const key = removeSpaces(entry.name);
            const existing = await db.furiganaDict.get(key);
            if (!existing || existing.type !== 'manual') {
              await db.furiganaDict.put({
                name: key,
                furigana: removeSpaces(entry.furigana),
                type: entry.furiganaEdited ? 'manual' : 'auto',
                updatedAt: now,
              });
              furiganaDictCount++;
            }
            const player = await db.players.where('playerId').equals(key).first();
            if (player && !player.isManual && (!player.furigana || !entry.furiganaEdited)) {
              await db.players.where('playerId').equals(key).modify({
                furigana: entry.furigana,
                affiliation: entry.affiliation || player.affiliation,
              });
              playerFuriganaCount++;
            }
          }
        }
        details.push(`ふりがな辞書: ${furiganaDictCount}件 更新`);
        if (playerFuriganaCount > 0) details.push(`選手ふりがな: ${playerFuriganaCount}件 更新`);
      } catch (e) {
        details.push(`ふりがなデータの解析エラー: ${(e as Error).message}`);
      }
    }

    const rankingBackup = backupData['drawSystem_rankingBackup'];
    if (rankingBackup) {
      try {
        const backup = typeof rankingBackup === 'string' ? JSON.parse(rankingBackup) : rankingBackup;
        const furiganaMap = backup.furiganaMap || {};
        let mapCount = 0;
        for (const [name, furigana] of Object.entries(furiganaMap)) {
          if (!name || !furigana) continue;
          const key = removeSpaces(name);
          const existing = await db.furiganaDict.get(key);
          if (!existing) {
            await db.furiganaDict.put({
              name: key,
              furigana: removeSpaces(furigana as string),
              type: 'auto',
              updatedAt: now,
            });
            mapCount++;
          }
        }
        if (mapCount > 0) details.push(`ランキングふりがな: ${mapCount}件 追加`);
      } catch (e) {
        details.push(`ランキングデータの解析エラー: ${(e as Error).message}`);
      }
    }
  } else if (backupData.tables?.furiganaDict) {
    // === 大会運営システム形式 ===
    const dictEntries = backupData.tables.furiganaDict;
    if (Array.isArray(dictEntries)) {
      for (const entry of dictEntries) {
        if (!entry.name || !entry.furigana) continue;
        const existing = await db.furiganaDict.get(entry.name);
        if (!existing || existing.type !== 'manual') {
          await db.furiganaDict.put({
            name: entry.name,
            furigana: entry.furigana,
            type: entry.type || 'auto',
            updatedAt: now,
          });
          furiganaDictCount++;
        }
      }
      details.push(`ふりがな辞書: ${furiganaDictCount}件 更新`);
    }
    // players テーブルからもふりがなを反映
    const players = backupData.tables.players;
    if (Array.isArray(players)) {
      for (const p of players) {
        if (!p.playerId || !p.furigana) continue;
        const existing = await db.players.where('playerId').equals(p.playerId).first();
        if (existing && !existing.isManual && !existing.furigana) {
          await db.players.where('playerId').equals(p.playerId).modify({
            furigana: p.furigana,
          });
          playerFuriganaCount++;
        }
      }
      if (playerFuriganaCount > 0) details.push(`選手ふりがな: ${playerFuriganaCount}件 更新`);
    }
  } else {
    details.push('ふりがなデータが見つかりませんでした');
  }

  return { details, playerFuriganaCount, furiganaDictCount };
}

export default function DataSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSource, setSyncSource] = useState<'github' | 'gdrive' | 'excel' | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [gdriveFolderLink, setGdriveFolderLink] = useState('');
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Google Drive 接続状態
  const hasGDrive = !!getSavedClientId() && gdriveIsTokenValid();
  const hasGitHub = !!getSavedToken();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY_LAST_SYNC);
      if (saved) setLastSyncTime(saved);
    } catch { /* ignore */ }
    // Google Drive フォルダリンクを取得
    if (hasGDrive) {
      const token = gdriveGetSavedToken();
      if (token) {
        getSharedFolderLink(token).then(link => setGdriveFolderLink(link)).catch(() => {});
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateLastSync = useCallback(() => {
    const now = new Date().toISOString();
    setLastSyncTime(now);
    try { localStorage.setItem(LS_KEY_LAST_SYNC, now); } catch { /* ignore */ }
  }, []);

  // GitHub からふりがなを同期
  const syncFromGitHub = useCallback(async () => {
    setIsSyncing(true);
    setSyncSource('github');
    setSyncResult(null);

    try {
      const token = getSavedToken();
      if (!token) {
        setSyncResult({
          success: false,
          message: 'GitHub トークンが設定されていません。バックアップページでトークンを設定してください。',
        });
        return;
      }

      const { data, fileName } = await fetchLatestDrawBackup(token);
      const result = await syncFuriganaFromBackupData(data, fileName);

      updateLastSync();
      setSyncResult({
        success: true,
        message: 'GitHub からふりがなデータを同期しました',
        details: result.details,
      });
    } catch (err) {
      setSyncResult({
        success: false,
        message: `同期に失敗しました: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncing(false);
      setSyncSource(null);
    }
  }, [updateLastSync]);

  // Google Drive からふりがなを同期
  const syncFromGDrive = useCallback(async () => {
    setIsSyncing(true);
    setSyncSource('gdrive');
    setSyncResult(null);

    try {
      const token = gdriveGetSavedToken();
      if (!token) {
        setSyncResult({
          success: false,
          message: 'Google ドライブに接続されていません。バックアップページで接続してください。',
        });
        return;
      }

      const { data, fileName } = await fetchLatestDrawBackupFromGDrive(token);
      const result = await syncFuriganaFromBackupData(data, fileName);

      updateLastSync();
      setSyncResult({
        success: true,
        message: 'Google ドライブからふりがなデータを同期しました',
        details: result.details,
      });
    } catch (err) {
      setSyncResult({
        success: false,
        message: `同期に失敗しました: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncing(false);
      setSyncSource(null);
    }
  }, [updateLastSync]);

  // Excel からふりがなを同期
  const syncFromExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    setSyncSource('excel');
    setSyncResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      const now = Date.now();
      let dictCount = 0;
      let playerCount = 0;
      const details: string[] = [`ファイル: ${file.name}`];

      for (const row of rows) {
        const name = String(row['漢字'] || row['選手名'] || row['name'] || '').trim();
        const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
        if (!name || !furigana) continue;

        const key = removeSpaces(name);
        const furiganaClean = removeSpaces(furigana);

        // ふりがな辞書に登録
        const existing = await db.furiganaDict.get(key);
        if (!existing || existing.type !== 'manual') {
          await db.furiganaDict.put({
            name: key,
            furigana: furiganaClean,
            type: 'manual',
            updatedAt: now,
          });
          dictCount++;
        }

        // 選手データにも反映
        const player = await db.players.where('playerId').equals(key).first();
        if (player && (!player.furigana || player.furigana !== furigana)) {
          await db.players.where('playerId').equals(key).modify({ furigana });
          playerCount++;
        }
      }

      details.push(`ふりがな辞書: ${dictCount}件 更新`);
      if (playerCount > 0) details.push(`選手ふりがな: ${playerCount}件 更新`);

      updateLastSync();
      setSyncResult({
        success: true,
        message: `Excelからふりがなデータをインポートしました`,
        details,
      });
    } catch (err) {
      setSyncResult({
        success: false,
        message: `インポートに失敗しました: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncing(false);
      setSyncSource(null);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  }, [updateLastSync]);

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden hover:shadow-md transition-all">
      <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">ふりがなデータ同期</h2>
          <span className="text-xs text-gray-500 ml-1">ドロー会議バックアップ連携</span>
        </div>
        {formattedLastSync && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>最終同期: {formattedLastSync}</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs text-gray-500 mb-4">
          ドロー会議システムのバックアップからふりがなデータベースを取得・同期します。
        </p>

        <div className="flex flex-wrap gap-3">
          {/* Google Drive 同期ボタン */}
          <button
            onClick={syncFromGDrive}
            disabled={isSyncing || !hasGDrive}
            className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!hasGDrive ? 'バックアップページでGoogle ドライブに接続してください' : ''}
          >
            <GoogleDriveIcon className="w-4 h-4" />
            <span>Google ドライブから同期</span>
            {isSyncing && syncSource === 'gdrive' && <RefreshCw className="w-4 h-4 animate-spin" />}
          </button>

          {/* GitHub 同期ボタン */}
          <button
            onClick={syncFromGitHub}
            disabled={isSyncing || !hasGitHub}
            className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!hasGitHub ? 'バックアップページでGitHubトークンを設定してください' : ''}
          >
            <Github className="w-4 h-4" />
            <span>GitHub から同期</span>
            {isSyncing && syncSource === 'github' && <RefreshCw className="w-4 h-4 animate-spin" />}
          </button>

          {/* Excel インポートボタン */}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={syncFromExcel}
          />
          <button
            onClick={() => excelInputRef.current?.click()}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <Upload className="w-3.5 h-3.5" />
            <span>Excelから同期</span>
            {isSyncing && syncSource === 'excel' && <RefreshCw className="w-4 h-4 animate-spin" />}
          </button>

          {/* Google Drive フォルダを開く */}
          {gdriveFolderLink && (
            <a
              href={gdriveFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#1a73e8] bg-[#e8f0fe] rounded-lg hover:brightness-95 transition-all border border-[#1a73e8]/20"
            >
              <FolderOpen className="w-4 h-4" />
              フォルダを開く
            </a>
          )}
        </div>

        {/* 未接続の案内 */}
        {!hasGDrive && !hasGitHub && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            バックアップページで GitHub トークンまたは Google ドライブの接続を設定してください。
          </p>
        )}

        {syncResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            syncResult.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <div className="flex items-start gap-2">
              {syncResult.success
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              }
              <div>
                <p className="font-medium">{syncResult.message}</p>
                {syncResult.details && syncResult.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                    {syncResult.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
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
