/**
 * バックアップエンジン
 * データベースの全テーブルをエクスポート/インポートする純粋ロジックモジュール
 * （DOM依存なし）
 */

import { db } from '../../db/database';

// バックアップデータのバージョン
const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  createdAt: string;
  tables: {
    tournaments: any[];
    players: any[];
    events: any[];
    entries: any[];
    draws: any[];
    matches: any[];
    courts: any[];
    furiganaDict: any[];
    affiliationFurigana: any[];
  };
  stats: {
    totalRecords: number;
    tableCounts: Record<string, number>;
  };
}

/**
 * 全テーブルをエクスポートしてバックアップデータを生成する
 */
export async function exportFullBackup(): Promise<BackupData> {
  const tournaments = await db.tournaments.toArray();
  const players = await db.players.toArray();
  const events = await db.events.toArray();
  const entries = await db.entries.toArray();
  const draws = await db.draws.toArray();
  const matches = await db.matches.toArray();
  const courts = await db.courts.toArray();
  const furiganaDict = await db.furiganaDict.toArray();
  const affiliationFurigana = await db.affiliationFurigana.toArray();

  const tableCounts: Record<string, number> = {
    tournaments: tournaments.length,
    players: players.length,
    events: events.length,
    entries: entries.length,
    draws: draws.length,
    matches: matches.length,
    courts: courts.length,
    furiganaDict: furiganaDict.length,
    affiliationFurigana: affiliationFurigana.length,
  };

  const totalRecords = Object.values(tableCounts).reduce((sum, c) => sum + c, 0);

  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables: {
      tournaments,
      players,
      events,
      entries,
      draws,
      matches,
      courts,
      furiganaDict,
      affiliationFurigana,
    },
    stats: {
      totalRecords,
      tableCounts,
    },
  };
}

/**
 * バックアップデータをインポートする
 * @param data バックアップデータ
 * @param clearExisting trueの場合、既存データをすべて削除してからインポート
 * @returns インポート件数とエラー一覧
 */
export async function importFullBackup(
  data: BackupData,
  clearExisting: boolean,
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  const tableEntries: [string, any[]][] = [
    ['tournaments', data.tables.tournaments],
    ['players', data.tables.players],
    ['events', data.tables.events],
    ['entries', data.tables.entries],
    ['draws', data.tables.draws],
    ['matches', data.tables.matches],
    ['courts', data.tables.courts],
    ['furiganaDict', data.tables.furiganaDict],
    ['affiliationFurigana', data.tables.affiliationFurigana],
  ];

  const allTables = [
    db.tournaments,
    db.players,
    db.events,
    db.entries,
    db.draws,
    db.matches,
    db.courts,
    db.furiganaDict,
    db.affiliationFurigana,
  ];

  await db.transaction('rw', allTables, async () => {
      // 既存データを削除
      if (clearExisting) {
        await db.tournaments.clear();
        await db.players.clear();
        await db.events.clear();
        await db.entries.clear();
        await db.draws.clear();
        await db.matches.clear();
        await db.courts.clear();
        await db.furiganaDict.clear();
        await db.affiliationFurigana.clear();
      }

      // 各テーブルにデータをインポート
      for (const [tableName, records] of tableEntries) {
        if (!Array.isArray(records) || records.length === 0) continue;
        try {
          const table = (db as any)[tableName];
          await table.bulkPut(records);
          imported += records.length;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${tableName}: ${msg}`);
        }
      }
    },
  );

  return { imported, errors };
}

/**
 * バックアップデータの構造を検証する型ガード
 */
export function validateBackupData(data: unknown): data is BackupData {
  if (data === null || typeof data !== 'object') return false;

  const d = data as any;

  // version チェック
  if (typeof d.version !== 'number' || d.version < 1) return false;

  // createdAt チェック
  if (typeof d.createdAt !== 'string') return false;

  // tables チェック
  if (d.tables === null || typeof d.tables !== 'object') return false;

  const requiredTables = [
    'tournaments',
    'players',
    'events',
    'entries',
    'draws',
    'matches',
    'courts',
    'furiganaDict',
    'affiliationFurigana',
  ];

  for (const tableName of requiredTables) {
    if (!Array.isArray(d.tables[tableName])) return false;
  }

  // stats チェック
  if (d.stats === null || typeof d.stats !== 'object') return false;
  if (typeof d.stats.totalRecords !== 'number') return false;
  if (d.stats.tableCounts === null || typeof d.stats.tableCounts !== 'object') return false;

  return true;
}
