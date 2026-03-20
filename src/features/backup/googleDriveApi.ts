/**
 * Google Drive API v3 を使ってバックアップファイルを管理するユーティリティ
 * Google Identity Services (GIS) で OAuth2 認証を行い、
 * 共有フォルダ「鳥取テニス協会バックアップ」内でファイル管理する
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_FOLDER_NAME = '鳥取テニス協会バックアップ';
const SUB_FOLDER_NAME = '大会運営システム';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

/** デフォルト OAuth2 Client ID（全ユーザー共通） */
export const DEFAULT_CLIENT_ID = '316429350105-v1tpv97kkq6jkg9gmu57aqt7btic6qod.apps.googleusercontent.com';

// localStorage キー
const TOKEN_KEY = 'gdrive_backup_token';
const EXPIRY_KEY = 'gdrive_backup_expiry';
const CLIENT_ID_KEY = 'gdrive_client_id';

export interface GoogleDriveFile {
  id: string;
  name: string;
  size: string;
  modifiedTime: string;
  mimeType: string;
}

export interface GoogleDriveConfig {
  accessToken: string;
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
  return !!token && Date.now() < expiry;
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

/** トークンの有効性を確認 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: headers(token),
    });
    return res.ok;
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

  const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1' });
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: headers(token) });
  if (!res.ok) return null;
  const data = await res.json();
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

/** バックアップ用のサブフォルダ ID を取得（なければ作成） */
let cachedFolderId: string | null = null;

export async function getBackupFolderId(token: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  // ルートフォルダを検索/作成
  let rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) {
    rootId = await createFolder(token, ROOT_FOLDER_NAME);
  }

  // サブフォルダを検索/作成
  let subId = await findFolder(token, SUB_FOLDER_NAME, rootId);
  if (!subId) {
    subId = await createFolder(token, SUB_FOLDER_NAME, rootId);
  }

  cachedFolderId = subId;
  return subId;
}

/** フォルダIDキャッシュをクリア */
export function clearFolderCache(): void {
  cachedFolderId = null;
}

// ================================================================
// ファイル操作
// ================================================================

/** バックアップファイル一覧を取得 */
export async function listBackups(config: GoogleDriveConfig): Promise<GoogleDriveFile[]> {
  const folderId = await getBackupFolderId(config.accessToken);
  const q = `'${folderId}' in parents and trashed=false and mimeType='application/json'`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: headers(config.accessToken),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `一覧取得失敗 (${res.status})`);
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

/** バックアップファイルの内容をダウンロード */
export async function downloadBackup(config: GoogleDriveConfig, file: GoogleDriveFile): Promise<any> {
  const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
    headers: headers(config.accessToken),
  });

  if (!res.ok) {
    throw new Error(`ダウンロード失敗 (${res.status})`);
  }

  return res.json();
}

/** バックアップファイルをアップロード */
export async function uploadBackup(
  config: GoogleDriveConfig,
  fileName: string,
  content: any
): Promise<void> {
  const folderId = await getBackupFolderId(config.accessToken);
  const jsonStr = JSON.stringify(content, null, 2);

  // multipart upload
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
  };

  const boundary = '----BackupBoundary' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    jsonStr +
    `\r\n--${boundary}--`;

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      ...headers(config.accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `アップロード失敗 (${res.status})`);
  }
}

/** バックアップファイルを削除 */
export async function deleteBackup(config: GoogleDriveConfig, file: GoogleDriveFile): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${file.id}`, {
    method: 'DELETE',
    headers: headers(config.accessToken),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `削除失敗 (${res.status})`);
  }
}

/** 共有フォルダのリンクを取得 */
export async function getSharedFolderLink(token: string): Promise<string> {
  const folderId = await getBackupFolderId(token);
  return `https://drive.google.com/drive/folders/${folderId}`;
}

// ================================================================
// ふりがな一覧・所属一覧 フォルダ操作
// ================================================================

const FURIGANA_FOLDER_NAME = 'ふりがな一覧';
const AFFILIATION_FOLDER_NAME = '所属一覧';

/** ルートフォルダ配下の特定サブフォルダIDを取得（なければ作成） */
async function getSubFolderId(token: string, subName: string): Promise<string> {
  let rootId = await findFolder(token, ROOT_FOLDER_NAME);
  if (!rootId) rootId = await createFolder(token, ROOT_FOLDER_NAME);
  let subId = await findFolder(token, subName, rootId);
  if (!subId) subId = await createFolder(token, subName, rootId);
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
  const folderId = await getSubFolderId(token, FURIGANA_FOLDER_NAME);
  const file = await getLatestXlsx(token, folderId);
  if (!file) return null;
  const data = await downloadFileBlob(token, file.id);
  return { data, fileName: file.name };
}

/** 所属一覧フォルダから最新Excelをダウンロード */
export async function downloadAffiliationExcel(token: string): Promise<{ data: ArrayBuffer; fileName: string } | null> {
  const folderId = await getSubFolderId(token, AFFILIATION_FOLDER_NAME);
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
  const folderId = await getSubFolderId(token, FURIGANA_FOLDER_NAME);
  await uploadXlsxToFolder(token, folderId, fileName, xlsxBuffer);
}

/** 所属一覧フォルダにExcelをアップロード */
export async function uploadAffiliationExcel(token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  const folderId = await getSubFolderId(token, AFFILIATION_FOLDER_NAME);
  await uploadXlsxToFolder(token, folderId, fileName, xlsxBuffer);
}

/** デフォルトClient IDでOAuth接続を開始 */
export async function connectWithDefaultClientId(): Promise<string> {
  await loadGisScript();
  const clientId = getSavedClientId();
  saveClientId(clientId);
  const token = await requestAccessToken(clientId);
  return token;
}
