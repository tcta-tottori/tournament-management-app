import { useState, useRef } from 'react';
import { db } from '../../db/database';
import { Save, Download, Upload, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

export default function BackupRestore() {
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const data = {
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

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tennis-tournament-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const counts = Object.entries(data.tables).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      setStatus({ type: 'success', message: `エクスポート完了 (${counts})` });
    } catch (err) {
      console.error(err);
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

      if (!data.tables || !data.version) {
        throw new Error('無効なバックアップファイルです');
      }

      const expectedTables = ['tournaments', 'players', 'events', 'entries', 'draws', 'matches', 'courts'];
      for (const tableName of expectedTables) {
        if (data.tables[tableName] && !Array.isArray(data.tables[tableName])) {
          throw new Error(`テーブル "${tableName}" のデータ形式が不正です（配列である必要があります）`);
        }
      }

      if (!confirm('現在のデータを上書きしてインポートしますか？\n既存データは全て置き換えられます。')) {
        setIsImporting(false);
        return;
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

      setStatus({ type: 'success', message: `インポート完了 (バージョン: ${data.version}, 日時: ${data.exportedAt})` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `インポート失敗: ${err}` });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      console.error(err);
      setStatus({ type: 'error', message: `削除失敗: ${err}` });
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Save className="w-6 h-6 text-primary-500" />
          バックアップ・復元
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          大会データのエクスポート・インポートとデータ管理を行います。
        </p>
      </header>

      {/* ステータスメッセージ */}
      {status && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          status.type === 'success' ? 'bg-green-50 border-green-200 text-green-600' :
          status.type === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
          'bg-primary-50 border-primary-500/30 text-primary-500'
        }`}>
          {status.type === 'success' ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" /> :
           <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />}
          <p className="text-sm">{status.message}</p>
        </div>
      )}

      {/* エクスポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Download className="w-5 h-5 text-primary-500" />
          データエクスポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          全ての大会データをJSON形式でダウンロードします。大会前や重要な操作前にバックアップを取ることを推奨します。
        </p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'エクスポート中...' : 'JSONファイルをダウンロード'}
        </button>
      </div>

      {/* インポート */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary-500" />
          データインポート
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          バックアップファイルからデータを復元します。現在のデータは全て上書きされます。
        </p>
        <label className={`flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 shadow-sm transition-colors cursor-pointer inline-flex ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          {isImporting ? 'インポート中...' : 'JSONファイルを選択'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </label>
      </div>

      {/* データクリア */}
      <div className="bg-white rounded-xl shadow-sm border border-[#dc2626]/30 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <h2 className="font-bold text-red-600 mb-2 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          全データ削除
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          データベース内の全てのデータを削除します。この操作は取り消せません。
        </p>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-2 bg-danger text-white px-5 py-2.5 rounded-md font-medium hover:bg-red-800 shadow-sm transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          全データを削除
        </button>
      </div>
    </div>
  );
}
