import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';

interface ScheduleRow {
  matchOrder: number;
  courtName: string;
  scheduledTime: string;
  eventName?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  details: string[];
}

/** 時刻文字列を正規化 (例: "9:00" → "09:00") */
function normalizeTime(raw: string): string {
  const trimmed = raw.trim();
  // Excel のシリアル値 (0-1) の場合
  const num = Number(trimmed);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // "9:00" or "09:00" 形式
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return trimmed;
}

/** 列名からどのフィールドかを判定 */
function detectColumn(header: string): 'matchOrder' | 'court' | 'time' | 'event' | null {
  const h = header.trim();
  if (/^(試合番号|No\.?|番号|#|matchOrder)$/i.test(h)) return 'matchOrder';
  if (/^(コート|court|コート名)$/i.test(h)) return 'court';
  if (/^(開始時刻|時間|時刻|time|scheduledTime|開始)$/i.test(h)) return 'time';
  if (/^(種目|event|イベント|種目名|カテゴリ)$/i.test(h)) return 'event';
  return null;
}

export default function ScheduleImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ScheduleRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsedRows([]);
    setParseError('');
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (jsonData.length === 0) {
        setParseError('データが見つかりません。ファイルの内容を確認してください。');
        return;
      }

      // ヘッダーから列マッピングを検出
      const headers = Object.keys(jsonData[0]);
      const columnMap: Record<string, 'matchOrder' | 'court' | 'time' | 'event'> = {};
      for (const h of headers) {
        const detected = detectColumn(h);
        if (detected) columnMap[h] = detected;
      }

      if (!columnMap || !Object.values(columnMap).includes('matchOrder')) {
        setParseError('試合番号(No.)の列が見つかりません。列名を「試合番号」または「No.」にしてください。');
        return;
      }
      if (!Object.values(columnMap).includes('court')) {
        setParseError('コートの列が見つかりません。列名を「コート」にしてください。');
        return;
      }
      if (!Object.values(columnMap).includes('time')) {
        setParseError('開始時刻の列が見つかりません。列名を「開始時刻」または「時間」にしてください。');
        return;
      }

      const getColumnKey = (type: string) => {
        return Object.entries(columnMap).find(([, v]) => v === type)?.[0] || '';
      };
      const matchOrderKey = getColumnKey('matchOrder');
      const courtKey = getColumnKey('court');
      const timeKey = getColumnKey('time');
      const eventKey = getColumnKey('event');

      const rows: ScheduleRow[] = [];
      for (const row of jsonData) {
        const orderRaw = String(row[matchOrderKey] ?? '').trim();
        const order = parseInt(orderRaw, 10);
        if (isNaN(order) || order <= 0) continue;

        const courtName = String(row[courtKey] ?? '').trim();
        const timeRaw = String(row[timeKey] ?? '').trim();
        if (!courtName || !timeRaw) continue;

        rows.push({
          matchOrder: order,
          courtName,
          scheduledTime: normalizeTime(timeRaw),
          eventName: eventKey ? String(row[eventKey] ?? '').trim() || undefined : undefined,
        });
      }

      if (rows.length === 0) {
        setParseError('有効な行が見つかりません。データの形式を確認してください。');
        return;
      }

      setParsedRows(rows);
    } catch (err) {
      setParseError(`ファイルの読み込みに失敗しました: ${(err as Error).message}`);
    }

    // ファイル入力をリセットして同じファイルの再選択を許可
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleImport = useCallback(async () => {
    if (parsedRows.length === 0 || !currentTournamentId) return;

    setIsImporting(true);
    setImportResult(null);
    const details: string[] = [];

    try {
      // 現在の大会のイベント一覧を取得
      const events = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      // 既存のコート一覧を取得
      const existingCourts = await db.courts.where('tournamentId').equals(currentTournamentId).toArray();
      const courtNameToId = new Map<string, string>();
      for (const c of existingCourts) {
        courtNameToId.set(c.name, c.courtId);
      }

      // 全イベントの試合を取得
      const eventIds = events.map((e) => e.eventId);
      const allMatches = await db.matches.where('eventId').anyOf(eventIds).toArray();

      let matchedCount = 0;
      let notFoundCount = 0;
      let courtCreatedCount = 0;
      const notFoundOrders: number[] = [];

      for (const row of parsedRows) {
        // コートを確保（なければ作成）
        let courtId = courtNameToId.get(row.courtName);
        if (!courtId) {
          // 自動生成
          const newCourtId = `C-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const maxOrder = existingCourts.length > 0
            ? Math.max(...existingCourts.map((c) => c.order))
            : 0;
          await db.courts.add({
            tournamentId: currentTournamentId,
            courtId: newCourtId,
            name: row.courtName,
            surface: 'オムニ',
            isAvailable: true,
            currentMatchId: null,
            order: maxOrder + 1 + courtCreatedCount,
          });
          courtNameToId.set(row.courtName, newCourtId);
          courtId = newCourtId;
          courtCreatedCount++;
        }

        // 試合を検索: matchOrder で一致する試合を探す
        // 種目名が指定されていれば、種目でフィルタリング
        let candidates = allMatches.filter((m) => m.matchOrder === row.matchOrder);
        if (row.eventName && candidates.length > 1) {
          const matchingEvent = events.find((e) => e.name === row.eventName);
          if (matchingEvent) {
            const filtered = candidates.filter((m) => m.eventId === matchingEvent.eventId);
            if (filtered.length > 0) candidates = filtered;
          }
        }

        if (candidates.length > 0) {
          // 最初にマッチしたものを更新
          const match = candidates[0];
          await db.matches.where('matchId').equals(match.matchId).modify({
            courtId,
            scheduledTime: row.scheduledTime,
            updatedAt: Date.now(),
          });
          matchedCount++;
        } else {
          notFoundCount++;
          notFoundOrders.push(row.matchOrder);
        }
      }

      details.push(`${matchedCount}件の試合にコート・時間を割り当てました`);
      if (courtCreatedCount > 0) {
        details.push(`${courtCreatedCount}件のコートを新規作成しました`);
      }
      if (notFoundCount > 0) {
        const showOrders = notFoundOrders.slice(0, 10).join(', ');
        const suffix = notFoundOrders.length > 10 ? ' ...' : '';
        details.push(`${notFoundCount}件の試合番号が見つかりませんでした (No. ${showOrders}${suffix})`);
      }

      setImportResult({
        success: notFoundCount === 0,
        message: notFoundCount === 0
          ? 'インポートが完了しました'
          : 'インポートが完了しました（一部未マッチあり）',
        details,
      });
      // インポート後にプレビューをクリア
      setParsedRows([]);
      setFileName('');
    } catch (err) {
      setImportResult({
        success: false,
        message: `インポートに失敗しました: ${(err as Error).message}`,
        details: [],
      });
    } finally {
      setIsImporting(false);
    }
  }, [parsedRows, currentTournamentId]);

  if (!currentTournamentId) {
    return (
      <div className="text-sm text-gray-500">
        大会が選択されていません。先にデータ読込で大会を作成してください。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Excel/CSV ファイルから試合のコート・開始時刻を一括インポートします。
        インポート後に個別調整が可能です。
      </p>

      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="font-medium text-gray-700 mb-1">必要な列:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><span className="font-medium">試合番号</span> または <span className="font-medium">No.</span> - 試合の通し番号</li>
          <li><span className="font-medium">コート</span> - コート名 (例: A-1コート)</li>
          <li><span className="font-medium">開始時刻</span> または <span className="font-medium">時間</span> - 開始時刻 (例: 9:00)</li>
          <li><span className="font-medium">種目</span> (任意) - 種目名で試合を特定</li>
        </ul>
      </div>

      {/* ファイル選択 */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#1976d2] rounded-lg hover:bg-[#1565c0] transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span>ファイルを選択</span>
        </button>
        {fileName && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-[#374151]">
            <FileSpreadsheet className="w-4 h-4 text-primary-500" />
            <span>{fileName}</span>
          </div>
        )}
      </div>

      {/* パースエラー */}
      {parseError && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{parseError}</span>
          </div>
        </div>
      )}

      {/* プレビューテーブル */}
      {parsedRows.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            プレビュー ({parsedRows.length}件)
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">No.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">コート</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">開始時刻</th>
                  {parsedRows.some((r) => r.eventName) && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">種目</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-900">{row.matchOrder}</td>
                    <td className="px-3 py-1.5 text-gray-900">{row.courtName}</td>
                    <td className="px-3 py-1.5 text-gray-900">{row.scheduledTime}</td>
                    {parsedRows.some((r) => r.eventName) && (
                      <td className="px-3 py-1.5 text-gray-600">{row.eventName || '-'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting}
            className="mt-3 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-[#1b5e20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isImporting ? 'インポート中...' : 'インポート実行'}</span>
          </button>
        </div>
      )}

      {/* インポート結果 */}
      {importResult && (
        <div className={`p-3 rounded-lg text-sm ${
          importResult.success
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          <div className="flex items-start gap-2">
            {importResult.success
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            }
            <div>
              <p className="font-medium">{importResult.message}</p>
              {importResult.details.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                  {importResult.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
