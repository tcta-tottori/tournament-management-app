/**
 * GitHub Contents API を使ってリポジトリの backups/ フォルダにバックアップファイルを保存・読込するユーティリティ
 */

const REPO_OWNER = 'tcta-tottori';
const REPO_NAME = 'tournament-management-app';
const BACKUP_DIR = 'backups';
const API_BASE = 'https://api.github.com';

export interface GitHubBackupFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string;
}

export interface GitHubConfig {
  token: string;
}

function getHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/** backups/ フォルダ内のファイル一覧を取得 */
export async function listBackups(config: GitHubConfig): Promise<GitHubBackupFile[]> {
  const url = `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${BACKUP_DIR}`;
  const res = await fetch(url, { headers: getHeaders(config.token) });

  if (res.status === 404) {
    // backups/ フォルダがまだ存在しない
    return [];
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API エラー (${res.status})`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((f: any) => f.type === 'file' && f.name.endsWith('.json'))
    .map((f: any) => ({
      name: f.name,
      path: f.path,
      sha: f.sha,
      size: f.size,
      download_url: f.download_url,
    }))
    .sort((a: GitHubBackupFile, b: GitHubBackupFile) => b.name.localeCompare(a.name)); // 新しい順
}

/** バックアップファイルの内容を取得 */
export async function downloadBackup(config: GitHubConfig, file: GitHubBackupFile): Promise<any> {
  // Contents API で Base64 エンコード済みコンテンツを取得
  const url = `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`;
  const res = await fetch(url, { headers: getHeaders(config.token) });

  if (!res.ok) {
    throw new Error(`ダウンロード失敗 (${res.status})`);
  }

  const data = await res.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return JSON.parse(content);
}

/** バックアップファイルをリポジトリに保存 */
export async function uploadBackup(
  config: GitHubConfig,
  fileName: string,
  content: any
): Promise<void> {
  const path = `${BACKUP_DIR}/${fileName}`;
  const url = `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;

  // 既存ファイルの sha を取得（上書き用）
  let sha: string | undefined;
  try {
    const existing = await fetch(url, { headers: getHeaders(config.token) });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch {
    // ファイルが存在しない場合は新規作成
  }

  const jsonStr = JSON.stringify(content, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

  const body: any = {
    message: `backup: ${fileName}`,
    content: encoded,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(config.token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `アップロード失敗 (${res.status})`);
  }
}

/** バックアップファイルを削除 */
export async function deleteBackup(config: GitHubConfig, file: GitHubBackupFile): Promise<void> {
  const url = `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(config.token),
    body: JSON.stringify({
      message: `delete backup: ${file.name}`,
      sha: file.sha,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `削除失敗 (${res.status})`);
  }
}

/** トークンの有効性を確認 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: getHeaders(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** localStorage からトークンを読み書き */
const TOKEN_KEY = 'github_backup_token';

export function getSavedToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
