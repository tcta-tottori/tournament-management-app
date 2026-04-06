import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Users, Settings } from 'lucide-react';
import { useTeamStore } from './teamStore';
import { parseTeamExcel } from './teamExcelParser';

export default function TeamImportView() {
  const {
    importData, setImportFileName, importFileName, isImported,
    leagues, tournamentInfo, updateTournamentInfo, updateGameRule,
    updateBracketGameRule, resetAll,
  } = useTeamStore();
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
      const result = parseTeamExcel(buffer);

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

  const handleReset = useCallback(() => {
    if (window.confirm('全てのデータをリセットしますか？')) {
      resetAll();
      setError(null);
      setPreview(null);
    }
  }, [resetAll]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* タイトルカード */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 mb-6 border border-blue-100">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Users size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">団体戦</h2>
            <p className="text-gray-500">Excelファイルを読み込んで大会運営を開始します</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-100">
            <div className="text-3xl font-bold text-blue-700">5</div>
            <div className="text-sm text-gray-500">リーグ (A~E)</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-100">
            <div className="text-3xl font-bold text-indigo-700">22</div>
            <div className="text-sm text-gray-500">チーム参加</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-100">
            <div className="text-3xl font-bold text-violet-700">4</div>
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
            ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
            : isImported
              ? 'border-blue-300 bg-blue-50/50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
          }
        `}
        onClick={() => document.getElementById('team-file-input')?.click()}
      >
        <input
          id="team-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileInput}
          className="hidden"
        />

        {isImported ? (
          <div className="space-y-3">
            <CheckCircle2 size={48} className="mx-auto text-blue-500" />
            <div className="text-lg font-semibold text-blue-700">読み込み完了</div>
            <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
              <FileSpreadsheet size={16} />
              {importFileName}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-2xl font-bold text-blue-600">{leagues.length}</span>
                <span className="text-sm text-gray-500 ml-1">リーグ</span>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                <span className="text-2xl font-bold text-indigo-600">{leagues.reduce((s, l) => s + l.teams.length, 0)}</span>
                <span className="text-sm text-gray-500 ml-1">チーム</span>
              </div>
            </div>
            {/* リーグ別サマリー */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {leagues.map(l => (
                <div key={l.leagueId} className="bg-white border border-blue-100 rounded-lg px-3 py-2 text-center">
                  <div className="text-xs font-bold text-blue-600">{l.leagueId}リーグ</div>
                  <div className="text-sm text-gray-600">{l.teams.length}チーム</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">別のファイルをドロップして再読込可能</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
              <Upload size={48} className={`mx-auto ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
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

      {/* 大会設定（読み込み後に表示） */}
      {isImported && tournamentInfo && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Settings size={16} className="text-gray-500" />
            大会設定
          </h3>

          <div className="space-y-3">
            {/* 大会名 */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">大会名</label>
              <input
                type="text"
                value={tournamentInfo.name}
                onChange={e => updateTournamentInfo('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 日付 */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">日付</label>
              <input
                type="text"
                value={tournamentInfo.date}
                onChange={e => updateTournamentInfo('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* ゲームルール */}
            <div className="pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block mb-2">ゲームルール</label>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-medium text-gray-400 block mb-0.5">予選リーグ（4チーム）</label>
                  <input
                    type="text"
                    value={tournamentInfo.gameRules?.[4] || ''}
                    onChange={e => updateGameRule(4, e.target.value)}
                    placeholder="例: 6ゲームマッチ（6-6タイブレーク・ノーアド）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-400 block mb-0.5">予選リーグ（5チーム）</label>
                  <input
                    type="text"
                    value={tournamentInfo.gameRules?.[5] || ''}
                    onChange={e => updateGameRule(5, e.target.value)}
                    placeholder="例: 6ゲーム先取（ノーアド）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-400 block mb-0.5">決勝トーナメント</label>
                  <input
                    type="text"
                    value={tournamentInfo.bracketGameRule || ''}
                    onChange={e => updateBracketGameRule(e.target.value)}
                    placeholder="例: 6ゲームマッチ（6-6タイブレーク・ノーアド）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* リセットボタン */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              全データをリセット
            </button>
          </div>
        </div>
      )}

      {/* 大会フロー説明 */}
      {!isImported && (
        <div className="mt-8 grid grid-cols-5 gap-2">
          {[
            { step: 1, label: 'Excel読込' },
            { step: 2, label: '予選リーグ' },
            { step: 3, label: '順位確定' },
            { step: 4, label: '決勝T' },
            { step: 5, label: '結果出力' },
          ].map(({ step, label }, i) => (
            <div key={step} className="flex items-center">
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm border-2 border-blue-200">
                  {step}
                </div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
              {i < 4 && <div className="w-full h-0.5 bg-gradient-to-r from-blue-200 to-indigo-200 mx-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
