import { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { Upload, Database as DatabaseIcon, Download, AlertCircle, PlayCircle } from 'lucide-react';
import TournamentManager from './TournamentManager';
import FuriganaManager from './FuriganaManager';

export default function DataManagement() {
  const [loadStatus, setLoadStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // ファイルアップロードハンドラ
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setLoadStatus('ファイル読み込み中...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // header: 1 を指定し、2次元配列として取得
          const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
          
          // 最低3行(タイトル, ヘッダ, データ1行)ないと解析できない
          if (jsonData.length < 3) {
            throw new Error('データ行が見つかりません');
          }

          // 3行目以降を走査してPlayerオブジェクトを生成
          const playersToImport = [];
          for (let i = 2; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 行が空、または氏名(index 2)がない場合はスキップ
            if (!row || !row[2]) continue;

            const name = String(row[2]).trim();
            // スペースを除去したものをIDおよびふりがな検索のベースにする
            const normalizedName = name.replace(/\s+/g, '');
            
            const rank = parseInt(row[1], 10) || 0;
            const affiliation = row[3] ? String(row[3]).trim() : '';
            const totalPoint = parseInt(row[4], 10) || 0;

            // TODO: ふりがなの自動付与(kuromoji)は別途実装予定
            // 今回は "mens-singles" や "womens-singles" などの種目判定もExcelのタイトルから行うべきだが、
            // 固定で "mens-singles" に入れている（要件次第でドロップダウンで選択させる等に拡張可能）
            playersToImport.push({
              playerId: normalizedName,
              name: name,
              furigana: '', 
              affiliation: affiliation,
              rankings: {
                'mens-singles': totalPoint // 仮の種目キー
              },
              isManual: false
            });
          }

          // Dexie (IndexedDB) へ一括保存 (playerId で衝突をどう扱うかは bulkPut 等を利用)
          // 既存データの上書き、または新規追加
          await db.players.bulkPut(playersToImport);
          
          setLoadStatus(`読込成功: ${playersToImport.length}名の選手データをデータベースに保存しました`);
        } catch (error: any) {
          console.error(error);
          setLoadStatus(`解析エラー: ${error.message}`);
        } finally {
          setIsProcessing(false);
        }
      };
      
      reader.onerror = () => {
        setLoadStatus('ファイルの読み込みに失敗しました');
        setIsProcessing(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      console.error(error);
      setLoadStatus(`システムエラー: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // デバッグ用の一時関数は削除します

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <DatabaseIcon className="w-6 h-6 text-primary-600" />
            S-01 データ管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ランキングデータの読込み、ふりがなDBの管理、大会マスタの設定を行います。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ランキング読込パネル */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-primary-50 px-4 py-3 border-b border-primary-100 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-primary-900">ランキング・エントリー読込</h2>
          </div>
          
          <div className="p-5 flex flex-col items-center justify-center space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 w-full block text-center bg-gray-50 hover:bg-gray-100 transition-colors relative cursor-pointer">
              {isProcessing ? (
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-4 border-primary-600 border-t-transparent animate-spin mb-2"></div>
                  <span className="text-sm font-medium text-gray-600">処理中...</span>
                </div>
              ) : (
                <>
                  <Download className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <span className="text-sm font-medium text-gray-700">Excelファイルを選択 または ドラッグ＆ドロップ</span>
                  <p className="text-xs text-gray-400 mt-1">対応フォーマット: .xlsx, .xls</p>
                </>
              )}
              {/* Overlay Input */}
              <input 
                type="file" 
                accept=".xlsx, .xls"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
            </div>

            {loadStatus && (
              <div className={`w-full p-3 rounded-md text-sm flex items-start gap-2 ${
                loadStatus.includes('成功') ? 'bg-green-50 text-green-700 border border-green-200' :
                'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{loadStatus}</span>
              </div>
            )}
          </div>
        </section>

        {/* 大会マスタ管理パネル */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[500px]">
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
             <h2 className="font-semibold text-gray-800">大会マスタ管理</h2>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
             <TournamentManager />
          </div>
        </section>
      </div>

      {/* ふりがなDB管理パネル */}
      <section className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-emerald-900">ふりがなデータベース管理</h2>
        </div>
        <div className="p-5">
           <FuriganaManager />
        </div>
      </section>
    </div>
  );
}
