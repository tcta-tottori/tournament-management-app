/**
 * Google Drive API v3 ユーティリティ
 * Google Identity Services (GIS) で OAuth2 認証を行い、
 * 共有フォルダ「鳥取テニス協会バックアップ」内でファイル管理する
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_FOLDER_NAME = '鳥取テニス協会バックアップ';
const SUB_FOLDER_NAME = '大会運営システム';
const SCOPES = 'https://www.googleapis.com/auth/drive';

/** デフォルト OAuth2 Client ID（全ユーザー共通） */
export const DEFAULT_CLIENT_ID = '316429350105-v1tpv97kkq6jkg9gmu57aqt7btic6qod.apps.googleusercontent.com';

// localStorage キー
const TOKEN_KEY = 'gdrive_backup_token';
const EXPIRY_KEY = 'gdrive_backup_expiry';
const CLIENT_ID_KEY = 'gdrive_client_id';
const SCOPE_KEY = 'gdrive_backup_scope';

// スコープ変更時（または初回スコープ記録時）に古いトークンを自動無効化
(() => {
  const savedScope = localStorage.getItem(SCOPE_KEY);
  if (savedScope !== SCOPES) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.setItem(SCOPE_KEY, SCOPES);
  }
})();

export interface GoogleDriveFile {
  id: string;
  name: string;
  size: string;
  modifiedTime: string;
  mimeType: string;
}


// ================================================================
// GIS (Google Identity Services) ローダー
// ================================================================
let gisLoaded = false;
let tokenClient: any = null;

/** GIS ライブラリを動的にロード */
export function loadGisScript(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.getElementById('gis-script')) {
      gisLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Google Identity Services の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

/** OAuth2 トークン取得 (ポップアップ) */
export function requestAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services が読み込まれていません'));
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const token = response.access_token;
        const expiresIn = response.expires_in || 3600;
        const expiryTime = Date.now() + expiresIn * 1000;
        saveToken(token, expiryTime);
        resolve(token);
      },
      error_callback: (err: any) => {
        reject(new Error(err.message || 'OAuth認証に失敗しました'));
      },
    });
    tokenClient.requestAccessToken();
  });
}

/** トークンを取り消し */
export function revokeToken(token: string): void {
  const google = (window as any).google;
  if (google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token);
  }
  clearToken();
}

// ================================================================
// トークン管理
// ================================================================
export function saveToken(token: string, expiry: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
}

export function getSavedToken(): string {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) || '0');
  if (token && Date.now() < expiry) return token;
  // 期限切れの場合はクリア
  if (token) clearToken();
  return '';
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function isTokenValid(): boolean {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) || '0');
  const scopeOk = localStorage.getItem(SCOPE_KEY) === SCOPES;
  return !!token && Date.now() < expiry && scopeOk;
}

// Client ID 管理
export function getSavedClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
}

export function saveClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_KEY, clientId);
}

export function clearClientId(): void {
  localStorage.removeItem(CLIENT_ID_KEY);
}

// ================================================================
// Drive API ヘルパー
// ================================================================
function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/** トークンの有効性とスコープを確認 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const infoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!infoRes.ok) return false;
    const info = await infoRes.json();
    const scopes = (info.scope || '').split(' ');
    // 要求スコープ (drive) がトークンに含まれているか確認
    const hasRequiredScope = scopes.some((s: string) => s === SCOPES);
    if (!hasRequiredScope) {
      console.warn('[GDrive] スコープ不足。付与済み:', scopes, '必要:', SCOPES);
      clearToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** ユーザー情報を取得 */
export async function getUserEmail(token: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`, {
    headers: headers(token),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.user?.emailAddress || '';
}

// ================================================================
// フォルダ管理
// ================================================================

/** 名前でフォルダを検索 (親フォルダ指定可) */
async function findFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[GDrive] findFolder "${name}" failed:`, res.status, err.error?.message);
    return null;
  }
  const data = await res.json();
  console.log(`[GDrive] findFolder "${name}" (parent=${parentId || 'any'}): found ${data.files?.length || 0} results`);
  return data.files?.[0]?.id || null;
}

/** フォルダを作成 */
async function createFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      ...headers(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `フォルダ作成失敗 (${res.status})`);
  }
  const data = await res.json();
  return data.id;
}

/** フォルダIDキャッシュをクリア */
export function clearFolderCache(): void {
  // サブフォルダキャッシュ等をリセット
}

/** 共有フォルダのリンクを取得 */
export async function getSharedFolderLink(token: string): Promise<string> {
  let rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) rootId = await createFolder(token, ROOT_FOLDER_NAME);
  return `https://drive.google.com/drive/folders/${rootId}`;
}

// ================================================================
// ふりがな一覧・所属一覧 フォルダ操作
// ================================================================

const FURIGANA_FOLDER_NAME = 'ふりがな一覧';
const AFFILIATION_FOLDER_NAME = '所属一覧';
const BACKUP_FOLDER_NAME = 'バックアップ';
const RESULTS_FOLDER_NAME = '大会結果';

/** ルートフォルダ/大会運営システム配下の特定サブフォルダIDを検索（作成しない）
 * @returns フォルダID、見つからない場合は null
 * @throws フォルダ階層が見つからない場合、詳細エラーを throw
 */
async function findSubFolderId(token: string, subName: string): Promise<string | null> {
  const rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) {
    throw new Error(`「${ROOT_FOLDER_NAME}」フォルダが見つかりません。Google Drive に接続し直してください。`);
  }
  const sysId = await findFolder(token, SUB_FOLDER_NAME, rootId);
  if (!sysId) {
    throw new Error(`「${ROOT_FOLDER_NAME}/${SUB_FOLDER_NAME}」フォルダが見つかりません。`);
  }
  return findFolder(token, subName, sysId);
}

/** ルートフォルダ/大会運営システム配下の特定サブフォルダIDを取得（なければ作成） */
async function getOrCreateSubFolderId(token: string, subName: string): Promise<string> {
  let rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) rootId = await createFolder(token, ROOT_FOLDER_NAME);
  let sysId = await findFolder(token, SUB_FOLDER_NAME, rootId);
  if (!sysId) sysId = await createFolder(token, SUB_FOLDER_NAME, rootId);
  let subId = await findFolder(token, subName, sysId);
  if (!subId) subId = await createFolder(token, subName, sysId);
  return subId;
}

/** 指定フォルダ内の最新 xlsx ファイルを取得 */
async function getLatestXlsx(
  token: string,
  folderId: string,
): Promise<GoogleDriveFile | null> {
  // xlsx の MIME: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  // Google Sheets の場合もあるので拡張対応
  const q = `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or name contains '.xlsx' or name contains '.xls')`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) return null;
  const data = await res.json();
  const file = data.files?.[0];
  if (!file) return null;
  return { id: file.id, name: file.name, size: file.size || '0', modifiedTime: file.modifiedTime, mimeType: file.mimeType };
}

/** ファイルのバイナリをダウンロード */
async function downloadFileBlob(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`ダウンロード失敗 (${res.status})`);
  return res.arrayBuffer();
}

/** ふりがな一覧フォルダから最新Excelをダウンロード */
export async function downloadFuriganaExcel(token: string): Promise<{ data: ArrayBuffer; fileName: string } | null> {
  const folderId = await findSubFolderId(token, FURIGANA_FOLDER_NAME);
  if (!folderId) return null;
  const file = await getLatestXlsx(token, folderId);
  if (!file) return null;
  const data = await downloadFileBlob(token, file.id);
  return { data, fileName: file.name };
}

/** 所属一覧フォルダから最新Excelをダウンロード */
export async function downloadAffiliationExcel(token: string): Promise<{ data: ArrayBuffer; fileName: string } | null> {
  const folderId = await findSubFolderId(token, AFFILIATION_FOLDER_NAME);
  if (!folderId) return null;
  const file = await getLatestXlsx(token, folderId);
  if (!file) return null;
  const data = await downloadFileBlob(token, file.id);
  return { data, fileName: file.name };
}

/** フォルダに xlsx ファイルをアップロード（同名があれば上書き） */
async function uploadXlsxToFolder(
  token: string,
  folderId: string,
  fileName: string,
  xlsxBuffer: ArrayBuffer,
): Promise<void> {
  // 既存ファイルを検索して上書き
  const q = `'${folderId}' in parents and trashed=false and name='${fileName}'`;
  const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' });
  const searchRes = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
  const existingId = searchData.files?.[0]?.id;

  const metadata = {
    name: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ...(existingId ? {} : { parents: [folderId] }),
  };

  const boundary = '----XlsxBoundary' + Date.now();
  const metaPart = JSON.stringify(metadata);

  // Build multipart body
  const encoder = new TextEncoder();
  const pre = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  );
  const post = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + xlsxBuffer.byteLength + post.length);
  body.set(pre, 0);
  body.set(new Uint8Array(xlsxBuffer), pre.length);
  body.set(post, pre.length + xlsxBuffer.byteLength);

  const url = existingId
    ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      ...headers(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `アップロード失敗 (${res.status})`);
  }
}

/** ふりがな一覧フォルダにExcelをアップロード */
export async function uploadFuriganaExcel(token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  const folderId = await getOrCreateSubFolderId(token, FURIGANA_FOLDER_NAME);
  await uploadXlsxToFolder(token, folderId, fileName, xlsxBuffer);
}

/** 所属一覧フォルダにExcelをアップロード */
export async function uploadAffiliationExcel(token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  const folderId = await getOrCreateSubFolderId(token, AFFILIATION_FOLDER_NAME);
  await uploadXlsxToFolder(token, folderId, fileName, xlsxBuffer);
}

// ================================================================
// 時間割フォルダ操作
// ================================================================

const SCHEDULE_FOLDER_NAME = '時間割';

/** 時間割フォルダ内のExcelファイル一覧を取得（最新順） */
export async function listScheduleExcelFiles(token: string): Promise<GoogleDriveFile[]> {
  const folderId = await findSubFolderId(token, SCHEDULE_FOLDER_NAME);
  if (!folderId) return [];
  const q = `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or name contains '.xlsx' or name contains '.xls')`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `時間割一覧取得失敗 (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size || '0',
    modifiedTime: f.modifiedTime,
    mimeType: f.mimeType,
  }));
}

/** 時間割フォルダからExcelファイルをダウンロード */
export async function downloadScheduleExcel(token: string, fileId: string): Promise<ArrayBuffer> {
  return downloadFileBlob(token, fileId);
}

/** 時間割フォルダにExcelをアップロード */
export async function uploadScheduleExcel(token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  const folderId = await getOrCreateSubFolderId(token, SCHEDULE_FOLDER_NAME);
  await uploadXlsxToFolder(token, folderId, fileName, xlsxBuffer);
}

// ================================================================
// 大会一覧フォルダ操作（大会運営システム/大会一覧）
// ================================================================

const TOURNAMENT_LIST_FOLDER_NAME = '大会一覧';

/** 大会一覧フォルダ内のExcelファイル一覧を取得（最新順） */
export async function listTournamentExcelFiles(token: string): Promise<GoogleDriveFile[]> {
  const folderId = await findSubFolderId(token, TOURNAMENT_LIST_FOLDER_NAME);
  if (!folderId) {
    throw new Error(`「${SUB_FOLDER_NAME}/${TOURNAMENT_LIST_FOLDER_NAME}」フォルダが見つかりません。Google Drive の接続を切断し、再接続してください。`);
  }
  const q = `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or name contains '.xlsx' or name contains '.xls')`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `大会一覧取得失敗 (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size || '0',
    modifiedTime: f.modifiedTime,
    mimeType: f.mimeType,
  }));
}

/** 大会一覧フォルダからExcelファイルをダウンロード */
export async function downloadTournamentExcel(token: string, fileId: string): Promise<ArrayBuffer> {
  return downloadFileBlob(token, fileId);
}

/** デフォルトClient IDでOAuth接続を開始 */
export async function connectWithDefaultClientId(): Promise<string> {
  await loadGisScript();
  const clientId = getSavedClientId();
  saveClientId(clientId);
  const token = await requestAccessToken(clientId);
  return token;
}

// ================================================================
// バックアップフォルダ操作
// ================================================================

/** バックアップフォルダにJSONファイルをアップロード */
export async function uploadBackupJson(
  token: string,
  fileName: string,
  jsonString: string,
): Promise<void> {
  const folderId = await getOrCreateSubFolderId(token, BACKUP_FOLDER_NAME);

  // 既存ファイルを検索して上書き
  const q = `'${folderId}' in parents and trashed=false and name='${fileName}'`;
  const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' });
  const searchRes = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
  const existingId = searchData.files?.[0]?.id;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    ...(existingId ? {} : { parents: [folderId] }),
  };

  const boundary = '----BackupBoundary' + Date.now();
  const metaPart = JSON.stringify(metadata);

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonString}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      ...headers(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `バックアップアップロード失敗 (${res.status})`);
  }
}

/** バックアップフォルダ内のJSONファイル一覧を取得（最新順） */
export async function listBackupFiles(token: string): Promise<GoogleDriveFile[]> {
  const folderId = await findSubFolderId(token, BACKUP_FOLDER_NAME);
  if (!folderId) return [];
  const q = `'${folderId}' in parents and trashed=false and (mimeType='application/json' or name contains '.json')`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `バックアップ一覧取得失敗 (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size || '0',
    modifiedTime: f.modifiedTime,
    mimeType: f.mimeType,
  }));
}

/** バックアップファイルをテキスト文字列としてダウンロード */
export async function downloadBackupFile(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`バックアップダウンロード失敗 (${res.status})`);
  return res.text();
}

// ================================================================
// 大会結果フォルダ操作
// ================================================================

/** 大会結果フォルダにファイルをアップロード */
export async function uploadResultFile(
  token: string,
  fileName: string,
  data: ArrayBuffer | string,
  mimeType: string,
): Promise<void> {
  const folderId = await getOrCreateSubFolderId(token, RESULTS_FOLDER_NAME);

  // 既存ファイルを検索して上書き
  const q = `'${folderId}' in parents and trashed=false and name='${fileName}'`;
  const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' });
  const searchRes = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
  const existingId = searchData.files?.[0]?.id;

  const metadata = {
    name: fileName,
    mimeType,
    ...(existingId ? {} : { parents: [folderId] }),
  };

  const boundary = '----ResultBoundary' + Date.now();
  const metaPart = JSON.stringify(metadata);

  // Build multipart body (バイナリ対応)
  const encoder = new TextEncoder();
  const pre = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const post = encoder.encode(`\r\n--${boundary}--`);

  const dataBytes = typeof data === 'string'
    ? encoder.encode(data)
    : new Uint8Array(data);

  const body = new Uint8Array(pre.length + dataBytes.length + post.length);
  body.set(pre, 0);
  body.set(dataBytes, pre.length);
  body.set(post, pre.length + dataBytes.length);

  const url = existingId
    ? `${UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      ...headers(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `大会結果アップロード失敗 (${res.status})`);
  }
}

/** 大会結果フォルダ内のファイル一覧を取得（最新順） */
export async function listResultFiles(token: string): Promise<GoogleDriveFile[]> {
  const folderId = await findSubFolderId(token, RESULTS_FOLDER_NAME);
  if (!folderId) return [];
  const q = `'${folderId}' in parents and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `大会結果一覧取得失敗 (${res.status})`);
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size || '0',
    modifiedTime: f.modifiedTime,
    mimeType: f.mimeType,
  }));
}

/** 大会結果フォルダのWebリンクを取得 */
export async function getResultsFolderLink(token: string): Promise<string> {
  let rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) rootId = await createFolder(token, ROOT_FOLDER_NAME);
  let sysId = await findFolder(token, SUB_FOLDER_NAME, rootId);
  if (!sysId) sysId = await createFolder(token, SUB_FOLDER_NAME, rootId);
  let resultsId = await findFolder(token, RESULTS_FOLDER_NAME, sysId);
  if (!resultsId) resultsId = await createFolder(token, RESULTS_FOLDER_NAME, sysId);
  return `https://drive.google.com/drive/folders/${resultsId}`;
}
