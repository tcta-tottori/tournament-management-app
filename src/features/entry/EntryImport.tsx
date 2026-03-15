import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Upload, FileSpreadsheet, X, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Player, Event } from '../../db/database';

interface ImportRow {
  rawName: string;
  rawAffiliation: string;
  rawEventName: string;
  matchedPlayerId: string | null;
  matchedEventId: string | null;
  status: 'match' | 'no_match' | 'skip';
  selected: boolean;
  points: number;
}

interface EntryImportProps {
  onClose: () => void;
}

export default function EntryImport({ onClose }: EntryImportProps) {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; matched: number } | null>(null);

  // マスタデータの取得
  const players = useLiveQuery(() => db.players.toArray()) || [];
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];
  
  // 比較用マップ作成
  const playerMapByName = new Map<string, Player>(players.map(p => [p.name.trim().toLowerCase(), p]));
  const eventMapByName = new Map<string, Event>(events.map(e => [e.name.trim().toLowerCase(), e]));

  const processExcelData = (buffer: ArrayBuffer) => {
    try {
      setIsProcessing(true);
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      let startIndex = 0;
      if (rows.length > 0 && Array.isArray(rows[0])) {
        const firstCell = String(rows[0][0] || '').toLowerCase();
        if (firstCell.includes('氏名') || firstCell.includes('名前') || firstCell === 'name') {
          startIndex = 1; // ヘッダースキップ
        }
      }

      const parsedRows: ImportRow[] = [];
      let matchCount = 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        
        const rawName = String(row[0]).trim();
        const rawAffiliation = row[1] ? String(row[1]).trim() : '';
        const rawEventName = row[2] ? String(row[2]).trim() : '';
        
        if (!rawName) continue;

        // 簡単な完全一致（またはふりがな一致）での照合（本当はFuzzyMatchなど導入するが今回は簡易版）
        const normalizedName = rawName.toLowerCase().replace(/[\u3000\s]/g, '');
        let matchedPlayerId: string | null = null;
        let points = 0;
        let status: 'match' | 'no_match' = 'no_match';

        // 1. 名前での完全一致検索
        const matchedByName = Array.from(playerMapByName.entries()).find(([name]) => name.replace(/[\u3000\s]/g, '') === normalizedName);
        if (matchedByName) {
             matchedPlayerId = matchedByName[1].playerId;
             points = matchedByName[1].rankings[rawEventName] || 0;
             status = 'match';
             matchCount++;
        } else {
             // 2. 所属を含めた検索などの拡張余地
             // 今回は簡略化
        }

        // 種目の照合
        const matchedEventId = eventMapByName.get(rawEventName.toLowerCase())?.eventId || null;

        parsedRows.push({
          rawName,
          rawAffiliation,
          rawEventName,
          matchedPlayerId,
          matchedEventId,
          status,
          selected: true,
          points
        });
      }

      setImportRows(parsedRows);
      setSummary({ total: parsedRows.length, matched: matchCount });
    } catch (e) {
      console.error(e);
      alert('ファイルの解析に失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
         processExcelData(ev.target.result as ArrayBuffer);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // リセット
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) processExcelData(ev.target.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleRegister = async () => {
    if (!currentTournamentId) return;
    setIsProcessing(true);
    
    try {
      const toInsert = importRows.filter(r => r.selected);
      let successCount = 0;
      let errorCount = 0;

      for (const row of toInsert) {
        // マッチしていない場合はとりあえずスキップ（後で新規登録仕様を追加する事も可）
        if (!row.matchedPlayerId || !row.matchedEventId) {
             errorCount++;
             continue;
        }
        
        // 重複チェック
        const existing = await db.entries.where({
            eventId: row.matchedEventId,
            playerId: row.matchedPlayerId
        }).first();

        if (existing) {
             errorCount++;
             continue;
        }

        await db.entries.add({
             eventId: row.matchedEventId,
             entryId: `EN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
             playerId: row.matchedPlayerId,
             rankPoint: row.points,
             status: 'active'
        });
        successCount++;
      }
      
      alert(`${successCount}件のエントリーを登録しました。（失敗/スキップ: ${errorCount}件）`);
      onClose(); // モーダルを閉じる
    } catch (e) {
      console.error(e);
      alert('登録中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            エントリーデータの一括インポート
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {!summary ? (
             <div 
               className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                 isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'
               }`}
               onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
               onDragLeave={() => setIsDragOver(false)}
               onDrop={handleDrop}
             >
               <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
               <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-indigo-500' : 'text-gray-400'}`} />
               <h3 className="text-lg font-bold text-gray-700 mb-2">Excel/CSVファイルをアップロード</h3>
               <p className="text-sm text-gray-500 mb-6">ここへファイルをドラッグ＆ドロップ、または下のボタンから選択</p>
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
               >
                 ファイルを選択
               </button>
               <div className="mt-8 text-xs text-gray-400 text-left max-w-md mx-auto bg-gray-50 p-4 rounded-lg">
                 <p className="font-semibold mb-1 text-gray-500">【推奨フォーマット】</p>
                 <ul className="list-disc list-inside space-y-1">
                   <li>1列目: 選手名 (必須)</li>
                   <li>2列目: 所属 (任意)</li>
                   <li>3列目: 種目名 (部分一致可, 例: "一般男子S")</li>
                 </ul>
               </div>
             </div>
          ) : (
            <div className="flex flex-col h-full gap-4">
               {/* Summary Alert */}
               <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-start gap-3">
                 <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                 <div>
                   <h4 className="font-bold text-indigo-900">ファイルの読み込みが完了しました</h4>
                   <p className="text-sm text-indigo-700 mt-1">
                     全 {summary.total} 件中、<strong className="font-bold">{summary.matched} 件</strong> が選手マスタ（および種目）と自動照合されました。
                   </p>
                 </div>
               </div>

               {/* Table */}
               <div className="border border-gray-200 rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                 <div className="overflow-y-auto flex-1">
                   <table className="min-w-full text-sm">
                     <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                       <tr>
                         <th className="px-4 py-2.5 text-left border-b w-10">
                           <input type="checkbox" className="rounded text-indigo-600" 
                             checked={importRows.every(r => r.selected)}
                             onChange={e => setImportRows(importRows.map(r => ({ ...r, selected: e.target.checked })))}
                           />
                         </th>
                         <th className="px-4 py-2.5 text-left font-semibold text-gray-600 border-b">読込氏名</th>
                         <th className="px-4 py-2.5 text-left font-semibold text-gray-600 border-b">種目（Excel）</th>
                         <th className="px-4 py-2.5 text-left font-semibold text-gray-600 border-b">照合ステータス</th>
                         <th className="px-4 py-2.5 text-left font-semibold text-gray-600 border-b">マスタ氏名・種目ID</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 bg-white">
                       {importRows.map((row, idx) => (
                         <tr key={idx} className={row.selected ? '' : 'bg-gray-50 opacity-50'}>
                           <td className="px-4 py-2">
                             <input type="checkbox" className="rounded text-indigo-600"
                               checked={row.selected}
                               onChange={e => {
                                 const copy = [...importRows];
                                 copy[idx].selected = e.target.checked;
                                 setImportRows(copy);
                               }}
                             />
                           </td>
                           <td className="px-4 py-2">
                             <div className="font-medium text-gray-800">{row.rawName}</div>
                             <div className="text-xs text-gray-500">{row.rawAffiliation}</div>
                           </td>
                           <td className="px-4 py-2 text-gray-600">{row.rawEventName || '-'}</td>
                           <td className="px-4 py-2">
                             {row.status === 'match' && row.matchedEventId ? (
                               <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                 一致
                               </span>
                             ) : row.status === 'match' && !row.matchedEventId ? (
                               <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                  種目不一致
                               </span>
                             ) : (
                               <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                 未登録選手
                               </span>
                             )}
                           </td>
                           <td className="px-4 py-2 text-xs">
                             <div className="text-gray-900">{row.matchedPlayerId || '-'}</div>
                             <div className="text-gray-500 font-mono mt-0.5">{row.matchedEventId || '-'}</div>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-5 py-2 font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button 
            onClick={handleRegister}
            disabled={!summary || importRows.filter(r => r.selected).length === 0 || isProcessing}
            className="px-5 py-2 font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
               <><RefreshCw className="w-4 h-4 animate-spin" /> 処理中...</>
            ) : (
               <>選択したエントリーを登録</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
