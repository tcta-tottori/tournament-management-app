import { useState, useCallback, useEffect } from 'react';
import { db } from '../../db/database';
import { Github, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { getSavedToken } from '../backup/githubApi';

const LS_KEY_LAST_SYNC = 'dataSyncLastTimestamp';

// ドロー会議システムのリポジトリ設定
const DRAW_REPO_OWNER = 'tcta-tottori';
const DRAW_REPO_NAME = 'tottori-tennis-draw';
const BACKUP_DIR = 'backups';

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

  // バックアップ一覧を取得
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

  // JSON ファイルのみ、新しい順にソート
  const jsonFiles = files
    .filter((f: any) => f.type === 'file' && f.name.endsWith('.json'))
    .sort((a: any, b: any) => b.name.localeCompare(a.name));

  if (jsonFiles.length === 0) {
    throw new Error('バックアップファイルがありません');
  }

  // 最新ファイルをダウンロード
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

export default function DataSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
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

  // GitHubバックアップからふりがなデータを同期
  const syncFuriganaFromGitHub = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    const details: string[] = [];

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
      details.push(`バックアップファイル: ${fileName}`);

      let playerFuriganaCount = 0;
      let furiganaDictCount = 0;
      const now = Date.now();

      // === ドロー会議システムのバックアップからふりがなデータを抽出 ===

      // 1. drawSystem_furigana キー（選手ふりがなデータ）
      const furiganaData = data['drawSystem_furigana'];
      if (furiganaData) {
        try {
          const entries = typeof furiganaData === 'string' ? JSON.parse(furiganaData) : furiganaData;
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (!entry.name || !entry.furigana) continue;
              const key = removeSpaces(entry.name);

              // ふりがな辞書に追加（手動編集は上書きしない）
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

              // players テーブルのふりがなも更新
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

      // 2. drawSystem_rankingBackup キーからふりがなマップを抽出
      const rankingBackup = data['drawSystem_rankingBackup'];
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

          // 所属ふりがなの抽出（選手の所属情報からunique所属を取得）
          if (backup.allPlayers && Array.isArray(backup.allPlayers)) {
            const affSet = new Map<string, string>();
            for (const p of backup.allPlayers) {
              if (p.affiliation && p.furigana) {
                // 所属名を収集（ふりがなは選手ふりがなとは別）
                if (!affSet.has(p.affiliation)) {
                  affSet.set(p.affiliation, '');
                }
              }
            }
          }
        } catch (e) {
          details.push(`ランキングデータの解析エラー: ${(e as Error).message}`);
        }
      }

      updateLastSync();
      setSyncResult({
        success: true,
        message: 'GitHubからふりがなデータを同期しました',
        details,
      });
    } catch (err) {
      setSyncResult({
        success: false,
        message: `同期に失敗しました: ${(err as Error).message}`,
      });
    } finally {
      setIsSyncing(false);
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
          <Github className="w-5 h-5 text-gray-900" />
          <h2 className="font-semibold text-primary-600">ふりがなデータ同期</h2>
          <span className="text-xs text-gray-500 ml-1">GitHub バックアップ連携</span>
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
          ドロー会議システムのGitHubバックアップからふりがなデータベースを取得・同期します。
        </p>

        <button
          onClick={syncFuriganaFromGitHub}
          disabled={isSyncing}
          className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Github className="w-4 h-4" />
          <span>GitHubからふりがなを同期</span>
          {isSyncing && <RefreshCw className="w-4 h-4 animate-spin" />}
        </button>

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
