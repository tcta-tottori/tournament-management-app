import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import { parseMixedExcel } from './mixedExcelParser';

export default function MixedImportView() {
  const { importData, setImportFileName, importFileName, isImported, leagues } = useMixedStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setPreview] = useState<{ leagueCount: number; teamCount: number; matchCount: number } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPreview(null);

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Excelファイル (.xlsx) を選択してください');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const result = parseMixedExcel(buffer);

      setPreview({
        leagueCount: result.leagues.length,
        teamCount: result.leagues.reduce((sum, l) => sum + l.teams.length, 0),
        matchCount: result.matches.length,
      });

      setImportFileName(file.name);
      importData(result.info, result.leagues, result.matches);
    } catch (e) {
      setError(`パースエラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [importData, setImportFileName]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* タイトルカード */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 mb-6 border border-emerald-100">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
            <Users size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">ミックスダブルス大会</h2>
            <p className="text-gray-500">Excelファイルを読み込んで大会運営を開始します</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-100">
            <div className="text-3xl font-bold text-emerald-700">13</div>
            <div className="text-sm text-gray-500">リーグ (A〜M)</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-100">
            <div className="text-3xl font-bold text-teal-700">54</div>
            <div className="text-sm text-gray-500">ペア参加</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-100">
            <div className="text-3xl font-bold text-cyan-700">4</div>
            <div className="text-sm text-gray-500">順位別トーナメント</div>
          </div>
        </div>
      </div>

      {/* ドロップゾーン */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
          ${isDragging
            ? 'border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg'
            : isImported
              ? 'border-emerald-300 bg-emerald-50/50'
              : 'border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30'
          }
        `}
        onClick={() => document.getElementById('mixed-file-input')?.click()}
      >
        <input
          id="mixed-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileInput}
          className="hidden"
        />

        {isImported ? (
          <div className="space-y-3">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
            <div className="text-lg font-semibold text-emerald-700">読み込み完了</div>
            <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
              <FileSpreadsheet size={16} />
              {importFileName}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-2xl font-bold text-emerald-600">{leagues.length}</span>
                <span className="text-sm text-gray-500 ml-1">リーグ</span>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-2xl font-bold text-teal-600">{leagues.reduce((s, l) => s + l.teams.length, 0)}</span>
                <span className="text-sm text-gray-500 ml-1">ペア</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">別のファイルをドロップして再読込可能</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
              <Upload size={48} className={`mx-auto ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`} />
            </div>
            <div className="text-lg font-medium text-gray-600">
              Excelファイルをドラッグ＆ドロップ
            </div>
            <div className="text-sm text-gray-400">
              またはクリックしてファイルを選択
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
              <FileSpreadsheet size={12} />
              .xlsx形式
            </div>
          </div>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 大会フロー説明 */}
      {!isImported && (
        <div className="mt-8 grid grid-cols-5 gap-2">
          {[
            { step: 1, label: 'Excel読込', color: 'emerald' },
            { step: 2, label: '予選リーグ', color: 'teal' },
            { step: 3, label: '順位確定', color: 'cyan' },
            { step: 4, label: '決勝T', color: 'blue' },
            { step: 5, label: '結果出力', color: 'indigo' },
          ].map(({ step, label }, i) => (
            <div key={step} className="flex items-center">
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm border-2 border-emerald-200">
                  {step}
                </div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
              {i < 4 && <div className="w-full h-0.5 bg-gradient-to-r from-emerald-200 to-teal-200 mx-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
