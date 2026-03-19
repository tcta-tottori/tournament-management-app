import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { Database, Download, Upload, Cpu, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

export default function FuriganaManager() {
  const furiganaDict = useLiveQuery(() => db.furiganaDict.toArray());
  const players = useLiveQuery(() => db.players.toArray()) || [];
  
  const [status, setStatus] = useState<{message: string, isError: boolean, progress?: number} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AI自動付与 (kuromoji) ロジック ---
  const handleAIAssign = async () => {
    setIsProcessing(true);
    setStatus({ message: '辞書データを読み込んでいます...', isError: false });

    try {
      const targetPlayers = players.filter(p => !p.furigana);
      if (targetPlayers.length === 0) {
        setStatus({ message: 'ふりがな未登録の選手はいません。', isError: false });
        setIsProcessing(false);
        return;
      }

      setStatus({ message: `未登録選手 ${targetPlayers.length}名のふりがなを生成中...`, isError: false, progress: 0 });

      // 1. Web Workerの初期化
      const worker = new Worker('/kuromoji_worker.js');
      
      // Workerとの通信用Promiseラッパー
      const runWorker = (type: string, payload?: any) => {
        return new Promise<any>((resolve, reject) => {
          const id = Date.now().toString() + Math.random().toString();
          const handler = (e: MessageEvent) => {
            if (e.data.id === id) {
              worker.removeEventListener('message', handler);
              if (e.data.type === `${type}_success`) {
                resolve(e.data.results);
              } else if (e.data.type === `${type}_error`) {
                reject(new Error(e.data.error));
              }
            }
          };
          worker.addEventListener('message', handler);
          worker.postMessage({ type, payload, id });
        });
      };

      // 辞書のロードを実行
      await runWorker('init');

      // 2. チャンク処理 (UIフリーズ防止)
      const chunkSize = 50; // 50件ずつ処理
      const newDictEntries: Record<string, string> = {};
      const updatedPlayers = [];
      let processedCount = 0;

      for (let i = 0; i < targetPlayers.length; i += chunkSize) {
        const chunk = targetPlayers.slice(i, i + chunkSize);
        const namesToTokenize = chunk.map(p => p.name.replace(/\s+/g, ''));
        
        // チャンク単位でWorkerに携帯素解析を依頼
        const tokenizedResults = await runWorker('tokenize', namesToTokenize);
        
        for (let j = 0; j < chunk.length; j++) {
          const player = chunk[j];
          const nameWithoutSpace = namesToTokenize[j];
          
          // 既に今回の処理内で生成した辞書にあるか確認
          let furigana = newDictEntries[nameWithoutSpace];
          
          if (!furigana) {
            // 既存DBにあるか再確認
            const existingDict = await db.furiganaDict.where('name').equals(nameWithoutSpace).first();
            if (existingDict) {
              furigana = existingDict.furigana;
            } else {
              // Workerから返ってきた結果を適用
              furigana = tokenizedResults[j];
              newDictEntries[nameWithoutSpace] = furigana;
            }
          }

          if (furigana !== player.furigana) {
             updatedPlayers.push({ ...player, furigana });
          }
        }

        processedCount += chunk.length;
        setStatus({ 
          message: `未登録選手 ${targetPlayers.length}名のふりがなを生成中...`, 
          isError: false, 
          progress: Math.round((processedCount / targetPlayers.length) * 100) 
        });
      }

      // Workerを終了
      worker.terminate();

      // 3. DBを一括更新
      setStatus({ message: 'データベースを更新中...', isError: false });
      
      // 辞書への追加
      const dictToAdd = Object.entries(newDictEntries).map(([name, furigana]) => ({
        name,
        furigana,
        type: 'auto' as const,
        updatedAt: Date.now()
      }));
      if (dictToAdd.length > 0) {
        await db.furiganaDict.bulkPut(dictToAdd);
      }
      
      // 選手の更新
      if (updatedPlayers.length > 0) {
        await db.players.bulkPut(updatedPlayers);
      }

      setStatus({ message: `${updatedPlayers.length}名のふりがなを自動付与しました！`, isError: false });
    } catch (error: any) {
      console.error(error);
      setStatus({ message: `エラーが発生しました: ${error.message}`, isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Excel インポート ---
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatus({ message: 'Excelを読み込んでいます...', isError: false });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // 1行目はヘッダーと仮定
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
      
      const newEntries = [];
      let updatedCount = 0;

      for (const row of jsonData) {
        // Excelのカラム名が "漢字"(kanji) と "ふりがな"(furigana) であることを期待
        const kanji = row['漢字'] || row['kanji'];
        const furigana = row['ふりがな'] || row['furigana'];

        if (kanji && furigana) {
          const kanjiStr = String(kanji).replace(/\s+/g, '');
          const furiganaStr = String(furigana).replace(/\s+/g, '');
          
          newEntries.push({
            name: kanjiStr,
            furigana: furiganaStr,
            type: 'manual' as const,
            updatedAt: Date.now()
          });
          
          // Playerデータの更新 (インポートされたデータ優先)
          const matchedPlayers = await db.players.where('playerId').equals(kanjiStr).toArray();
          for (const p of matchedPlayers) {
            if (p.furigana !== furiganaStr) {
               await db.players.update(p.id!, { furigana: furiganaStr });
            }
          }
          // playerId以外にname(スペース除去)でもマッチを試みる
          if (matchedPlayers.length === 0) {
            const allP = await db.players.filter(p => p.name.replace(/\s+/g, '') === kanjiStr).toArray();
            for (const p of allP) {
              if (p.furigana !== furiganaStr) {
                await db.players.update(p.id!, { furigana: furiganaStr });
              }
            }
          }
          updatedCount++;
        }
      }

      if (newEntries.length > 0) {
         // bulkPutで既存のnameがあれば上書き、無ければ新規
         await db.furiganaDict.bulkPut(newEntries);
      }

      setStatus({ message: `${updatedCount}件の辞書データをインポート・更新しました。`, isError: false });
    } catch (error: any) {
      console.error(error);
      setStatus({ message: `インポート失敗: ${error.message}`, isError: true });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Excel エクスポート (未登録のみ) ---
  const handleExportMissing = async () => {
    setIsProcessing(true);
    try {
      // playersからふりがな未設定のものを抽出
      const missingFuriganaPlayers = players.filter(p => !p.furigana);
      
      if (missingFuriganaPlayers.length === 0) {
        setStatus({ message: 'ふりがな未登録の選手はいません。', isError: false });
        setIsProcessing(false);
        return;
      }

      // 出力データの整形 (漢字, ふりがな列を作成)
      const exportData = missingFuriganaPlayers.map(p => ({
        '漢字': p.name.replace(/\s+/g, ''),
        'ふりがな': '' // ユーザーがExcelで埋める用
      }));

      // 重複排除 (同じ名前が複数ある場合)
      const uniqueExportData = Array.from(new Map(exportData.map(item => [item['漢字'], item])).values());

      const worksheet = XLSX.utils.json_to_sheet(uniqueExportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "未登録ふりがな");
      
      XLSX.writeFile(workbook, `missing_furigana_${new Date().toISOString().slice(0,10)}.xlsx`);
      
      setStatus({ message: `${uniqueExportData.length}件の未登録リストをエクスポートしました。`, isError: false });
    } catch (error: any) {
      console.error(error);
      setStatus({ message: `エクスポート失敗: ${error.message}`, isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-800 flex items-center gap-1">
          <Database className="w-4 h-4 text-emerald-600" />
          ふりがなDB管理
        </h3>
        <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
          登録数: {furiganaDict?.length || 0}件
        </span>
      </div>

      {status && (
        <div className={`mb-4 p-3 rounded-md text-sm flex items-start gap-2 ${
          status.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {status.isError ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <span className="font-medium">{status.message}</span>
            {status.progress !== undefined && (
               <div className="w-full bg-emerald-200 rounded-full h-1.5 mt-2">
                 <div className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
               </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <button
          onClick={handleAIAssign}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center p-3 gap-2 bg-gradient-to-br from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <Cpu className="w-6 h-6 text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-900">AI自動付与</span>
          <span className="text-xs text-indigo-600 text-center">未登録の選手にkuromojiでふりがなを生成</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center p-3 gap-2 bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-100 rounded-lg transition-colors disabled:opacity-50 relative"
        >
          <div className="flex items-center gap-1">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            <Upload className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold text-emerald-900">Excelインポート</span>
          <span className="text-xs text-emerald-600 text-center">修正したExcelを読み込み優先更新</span>
          <input 
            type="file" 
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
          />
        </button>

        <button
          onClick={handleExportMissing}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center p-3 gap-2 bg-gradient-to-br from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 border border-orange-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-1">
            <FileSpreadsheet className="w-6 h-6 text-orange-600" />
            <Download className="w-4 h-4 text-orange-600" />
          </div>
          <span className="text-sm font-semibold text-orange-900">未登録エクスポート</span>
          <span className="text-xs text-orange-600 text-center">ふりがなが無い選手Excelに出力</span>
        </button>
      </div>

      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between text-xs font-medium text-gray-500">
          <div className="w-1/2">漢字 (PlayerID)</div>
          <div className="w-1/2">ふりがな</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          {furiganaDict && furiganaDict.length > 0 ? (
            <div className="divide-y">
              {/* 最新50件のみ表示 (パフォーマンス考慮) */}
              {furiganaDict.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50).map((dict, i) => (
                <div key={i} className="px-4 py-2 flex items-center text-sm hover:bg-gray-50">
                  <div className="w-1/2 font-medium text-gray-800 flex items-center gap-2">
                    {dict.name}
                    {dict.type === 'auto' ? (
                      <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">AI</span>
                    ) : (
                      <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded">Excel</span>
                    )}
                  </div>
                  <div className="w-1/2 text-gray-600">{dict.furigana}</div>
                </div>
              ))}
              {furiganaDict.length > 50 && (
                <div className="px-4 py-3 text-center text-xs text-gray-500 bg-gray-50">
                  ... 他 {furiganaDict.length - 50} 件 (最新50件を表示中)
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              辞書データがありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
