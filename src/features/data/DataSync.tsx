import { useState, useCallback, useEffect } from 'react';
import { db } from '../../db/database';
import { RefreshCw, ArrowLeft, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

// ドロー会議システムの localStorage キー
const LS_KEY_RANKING_BACKUP = 'drawSystem_rankingBackup';
const LS_KEY_FURIGANA = 'drawSystem_furigana';
const LS_KEY_LAST_SYNC = 'dataSyncLastTimestamp';

// ドロー会議システムの rankingBackup 構造
interface DrawSystemRankingBackup {
  rankings: Record<string, { rank: number; name: string; affiliation: string; points: number; eventCode: string; furigana?: string }[]>;
  allPlayers: { rank: number; name: string; affiliation: string; points: number; eventCode: string; furigana?: string }[];
  furiganaMap: Record<string, string>;
  listMembers: { name: string; furigana: string }[];
  savedAt: string;
}

// ドロー会議システムの furigana エントリ構造
interface DrawSystemFuriganaEntry {
  id: number;
  name: string;
  furigana: string;
  source?: string;
  affiliation?: string;
  eventCodes?: string[];
  rankingPoints?: number;
  rankingPosition?: number;
  lastUpdated?: string;
  furiganaEdited?: boolean;
}

interface SyncResult {
  success: boolean;
  message: string;
  details?: string[];
}

/** スペースを全角半角問わず除去 */
function removeSpaces(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

export default function DataSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // 最終同期時刻を読み込み
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY_LAST_SYNC);
      if (saved) setLastSyncTime(saved);
    } catch { /* ignore */ }
  }, []);

  const updateLastSync = useCallback(() => {
    const now = new Date().toISOString();
    setLastSyncTime(now);
    try {
      localStorage.setItem(LS_KEY_LAST_SYNC, now);
    } catch { /* ignore */ }
  }, []);

  // =========================================
  // ドロー会議システムから同期 (FROM)
  // =========================================
  const syncFromDrawSystem = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    const details: string[] = [];

    try {
      // --- rankingBackup の読み込み ---
      const rankingRaw = localStorage.getItem(LS_KEY_RANKING_BACKUP);
      const furiganaRaw = localStorage.getItem(LS_KEY_FURIGANA);

      if (!rankingRaw && !furiganaRaw) {
        setSyncResult({
          success: false,
          message: 'ドロー会議システムのデータが見つかりません。先にドロー会議システムでデータを読み込んでください。',
        });
        return;
      }

      let playerImportCount = 0;
      let playerSkipCount = 0;
      let furiganaImportCount = 0;
      let furiganaSkipCount = 0;

      // --- ランキング & 選手データの取り込み ---
      if (rankingRaw) {
        try {
          const backup: DrawSystemRankingBackup = JSON.parse(rankingRaw);

          // allPlayers + rankings から選手情報を構築
          const playerMap = new Map<string, {
            name: string;
            furigana: string;
            affiliation: string;
            rankings: Record<string, number>;
          }>();

          // rankings の各種目からデータを取得
          if (backup.rankings) {
            for (const [eventCode, players] of Object.entries(backup.rankings)) {
              if (!Array.isArray(players)) continue;
              for (const p of players) {
                const key = removeSpaces(p.name);
                if (!key) continue;
                const existing = playerMap.get(key);
                if (existing) {
                  existing.rankings[eventCode] = p.points || 0;
                  if (!existing.furigana && p.furigana) existing.furigana = p.furigana;
                  if (!existing.affiliation && p.affiliation) existing.affiliation = p.affiliation;
                } else {
                  playerMap.set(key, {
                    name: p.name,
                    furigana: p.furigana || '',
                    affiliation: p.affiliation || '',
                    rankings: { [eventCode]: p.points || 0 },
                  });
                }
              }
            }
          }

          // furiganaMap からふりがなを補完
          if (backup.furiganaMap) {
            for (const [name, furigana] of Object.entries(backup.furiganaMap)) {
              const key = removeSpaces(name);
              const existing = playerMap.get(key);
              if (existing && !existing.furigana && furigana) {
                existing.furigana = furigana;
              }
            }
          }

          // listMembers（ランキング外の登録者）も取得
          if (backup.listMembers && Array.isArray(backup.listMembers)) {
            for (const m of backup.listMembers) {
              if (!m.name) continue;
              const key = removeSpaces(m.name);
              if (!playerMap.has(key)) {
                playerMap.set(key, {
                  name: m.name,
                  furigana: m.furigana || '',
                  affiliation: '',
                  rankings: {},
                });
              } else {
                const existing = playerMap.get(key)!;
                if (!existing.furigana && m.furigana) {
                  existing.furigana = m.furigana;
                }
              }
            }
          }

          // Dexie players テーブルにマージ
          const now = Date.now();
          for (const [playerId, data] of playerMap) {
            const existingPlayer = await db.players.where('playerId').equals(playerId).first();

            if (existingPlayer) {
              // 手動編集された選手は上書きしない
              if (existingPlayer.isManual) {
                playerSkipCount++;
                continue;
              }
              // 既存データのランキングをマージ
              const mergedRankings = { ...existingPlayer.rankings, ...data.rankings };
              await db.players.where('playerId').equals(playerId).modify({
                affiliation: data.affiliation || existingPlayer.affiliation,
                furigana: data.furigana || existingPlayer.furigana,
                rankings: mergedRankings,
              });
              playerImportCount++;
            } else {
              // 新規追加
              await db.players.add({
                playerId,
                name: data.name,
                furigana: data.furigana,
                affiliation: data.affiliation,
                rankings: data.rankings,
                isManual: false,
              });
              playerImportCount++;
            }

            // ふりがな辞書にも追加
            if (data.furigana) {
              const furiganaKey = removeSpaces(data.name);
              const existingFurigana = await db.furiganaDict.get(furiganaKey);
              if (!existingFurigana || existingFurigana.type !== 'manual') {
                await db.furiganaDict.put({
                  name: furiganaKey,
                  furigana: removeSpaces(data.furigana),
                  type: 'auto',
                  updatedAt: now,
                });
              }
            }
          }

          details.push(`選手データ: ${playerImportCount}件 取込${playerSkipCount > 0 ? ` (${playerSkipCount}件 手動編集済みのためスキップ)` : ''}`);
        } catch (e) {
          details.push(`ランキングデータの解析エラー: ${(e as Error).message}`);
        }
      }

      // --- ふりがなデータの取り込み ---
      if (furiganaRaw) {
        try {
          const furiganaData: DrawSystemFuriganaEntry[] = JSON.parse(furiganaRaw);
          if (Array.isArray(furiganaData)) {
            const now = Date.now();
            for (const entry of furiganaData) {
              if (!entry.name || !entry.furigana) continue;
              const key = removeSpaces(entry.name);
              const existing = await db.furiganaDict.get(key);

              // 手動編集されたものは上書きしない
              if (existing && existing.type === 'manual') {
                furiganaSkipCount++;
                continue;
              }

              const newType = entry.furiganaEdited ? 'manual' : 'auto';

              // 新規または自動データの更新
              if (!existing || existing.type === 'auto') {
                await db.furiganaDict.put({
                  name: key,
                  furigana: removeSpaces(entry.furigana),
                  type: newType as 'auto' | 'manual',
                  updatedAt: now,
                });
                furiganaImportCount++;
              }
            }
            details.push(`ふりがな: ${furiganaImportCount}件 取込${furiganaSkipCount > 0 ? ` (${furiganaSkipCount}件 手動編集済みのためスキップ)` : ''}`);
          }
        } catch (e) {
          details.push(`ふりがなデータの解析エラー: ${(e as Error).message}`);
        }
      }

      updateLastSync();
      setSyncResult({
        success: true,
        message: '同期が完了しました',
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
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md transition-all">
      <div className="bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-[#2e7d32]" />
          <h2 className="font-semibold text-[#1b5e20]">データ同期</h2>
          <span className="text-xs text-[#6b7280] ml-1">ドロー会議システム連携</span>
        </div>
        {formattedLastSync && (
          <div className="flex items-center gap-1 text-xs text-[#6b7280]">
            <Clock className="w-3.5 h-3.5" />
            <span>最終同期: {formattedLastSync}</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-xs text-[#6b7280] mb-4">
          ドロー会議システムとランキング・ふりがなデータを共有します。両システムが同じブラウザで動作している場合に利用できます。
        </p>

        <div>
          <button
            onClick={syncFromDrawSystem}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-[#2e7d32] rounded-lg hover:bg-[#1b5e20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ドロー会議システムから同期</span>
            {isSyncing && <RefreshCw className="w-4 h-4 animate-spin" />}
          </button>
        </div>

        {/* 結果メッセージ */}
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
