import { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import {
  Search, Download, Upload, Pencil, Check, X,
  CheckCircle2, AlertCircle, Users, Building2,
} from 'lucide-react';

type TabId = 'affiliation' | 'furigana';

export default function PlayerDataList() {
  const players = useLiveQuery(() => db.players.toArray()) || [];

  const [tab, setTab] = useState<TabId>('affiliation');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 所属一覧 ---
  const [editingAff, setEditingAff] = useState<string | null>(null);
  const [editAffValue, setEditAffValue] = useState('');

  // --- ふりがな ---
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editFuriganaValue, setEditFuriganaValue] = useState('');

  // === 所属一覧データ ===
  const affiliationList = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) {
      const aff = (p.affiliation || '').trim();
      if (!aff) continue;
      map.set(aff, (map.get(aff) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [players]);

  const filteredAffiliations = useMemo(() => {
    if (!searchQuery.trim()) return affiliationList;
    const q = searchQuery.trim().toLowerCase();
    return affiliationList.filter(a => a.name.toLowerCase().includes(q));
  }, [affiliationList, searchQuery]);

  // === ふりがな一覧データ ===
  const furiganaList = useMemo(() => {
    return players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [players]);

  const filteredFurigana = useMemo(() => {
    if (!searchQuery.trim()) return furiganaList;
    const q = searchQuery.trim().toLowerCase();
    return furiganaList.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.furigana || '').toLowerCase().includes(q) ||
        (p.affiliation || '').toLowerCase().includes(q)
    );
  }, [furiganaList, searchQuery]);

  // === 所属名の一括変更 ===
  const handleAffRename = async (oldName: string) => {
    const newName = editAffValue.trim();
    if (!newName || newName === oldName) {
      setEditingAff(null);
      return;
    }
    try {
      const targets = players.filter(p => (p.affiliation || '').trim() === oldName);
      for (const p of targets) {
        await db.players.update(p.id!, { affiliation: newName });
      }
      setStatus({ message: `「${oldName}」→「${newName}」に${targets.length}件更新しました。`, isError: false });
      setEditingAff(null);
    } catch (error: any) {
      setStatus({ message: `更新失敗: ${error.message}`, isError: true });
    }
  };

  // === ふりがなの更新 ===
  const handleFuriganaSave = async (playerId: string) => {
    const furigana = editFuriganaValue.trim();
    try {
      const player = players.find(p => p.playerId === playerId);
      if (!player) return;
      await db.players.update(player.id!, { furigana });
      // ふりがな辞書にも反映
      const dictKey = player.name.replace(/\s+/g, '');
      if (furigana) {
        await db.furiganaDict.put({
          name: dictKey,
          furigana: furigana.replace(/\s+/g, ''),
          type: 'manual',
          updatedAt: Date.now(),
        });
      }
      setStatus({ message: `「${player.name}」のふりがなを更新しました。`, isError: false });
      setEditingPlayerId(null);
    } catch (error: any) {
      setStatus({ message: `更新失敗: ${error.message}`, isError: true });
    }
  };

  // === Excelエクスポート ===
  const handleExport = () => {
    try {
      if (tab === 'affiliation') {
        const data = affiliationList.map(a => ({
          '所属名': a.name,
          '人数': a.count,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '所属一覧');
        XLSX.writeFile(wb, `affiliations_${new Date().toISOString().slice(0, 10)}.xlsx`);
        setStatus({ message: `${data.length}件の所属をエクスポートしました。`, isError: false });
      } else {
        const data = furiganaList.map(p => ({
          '選手名': p.name,
          'ふりがな': p.furigana || '',
          '所属': p.affiliation || '',
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ふりがな一覧');
        XLSX.writeFile(wb, `furigana_list_${new Date().toISOString().slice(0, 10)}.xlsx`);
        setStatus({ message: `${data.length}件のふりがなをエクスポートしました。`, isError: false });
      }
    } catch (error: any) {
      setStatus({ message: `エクスポート失敗: ${error.message}`, isError: true });
    }
  };

  // === Excelインポート ===
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      if (tab === 'affiliation') {
        // 所属名の一括変更: 「所属名」「新所属名」列
        let count = 0;
        for (const row of rows) {
          const oldName = String(row['所属名'] || '').trim();
          const newName = String(row['新所属名'] || '').trim();
          if (!oldName || !newName || oldName === newName) continue;
          const targets = await db.players.where('affiliation').equals(oldName).toArray();
          for (const p of targets) {
            await db.players.update(p.id!, { affiliation: newName });
          }
          count += targets.length;
        }
        setStatus({ message: `${count}件の所属名を更新しました。`, isError: false });
      } else {
        // ふりがなの一括更新: 「選手名」「ふりがな」列
        let count = 0;
        for (const row of rows) {
          const name = String(row['選手名'] || row['漢字'] || '').trim();
          const furigana = String(row['ふりがな'] || row['furigana'] || '').trim();
          if (!name || !furigana) continue;
          const nameKey = name.replace(/\s+/g, '');
          const matched = players.filter(p => p.playerId === nameKey || p.name.replace(/\s+/g, '') === nameKey);
          for (const p of matched) {
            await db.players.update(p.id!, { furigana });
            count++;
          }
          // ふりがな辞書にも反映
          await db.furiganaDict.put({
            name: nameKey,
            furigana: furigana.replace(/\s+/g, ''),
            type: 'manual',
            updatedAt: Date.now(),
          });
        }
        setStatus({ message: `${count}件のふりがなを更新しました。`, isError: false });
      }
    } catch (error: any) {
      setStatus({ message: `インポート失敗: ${error.message}`, isError: true });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col">
      {/* タブ切替 */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => { setTab('affiliation'); setSearchQuery(''); setEditingAff(null); setEditingPlayerId(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
            tab === 'affiliation' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          所属一覧
          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">{affiliationList.length}</span>
        </button>
        <button
          onClick={() => { setTab('furigana'); setSearchQuery(''); setEditingAff(null); setEditingPlayerId(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
            tab === 'furigana' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          ふりがな一覧
          <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">{furiganaList.length}</span>
        </button>
      </div>

      {/* ステータス */}
      {status && (
        <div className={`mb-3 p-2.5 rounded-md text-sm flex items-center gap-2 ${
          status.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {status.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}

      {/* 検索 + 操作ボタン */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={tab === 'affiliation' ? '所属名で検索...' : '選手名・ふりがな・所属で検索...'}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          title="Excelインポート"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">インポート</span>
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
          title="Excelエクスポート"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">エクスポート</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {/* === 所属一覧テーブル === */}
      {tab === 'affiliation' && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2 flex items-center text-xs font-medium text-gray-500">
            <div className="w-7/12">所属名</div>
            <div className="w-2/12 text-center">人数</div>
            <div className="w-3/12 text-center">操作</div>
          </div>
          <div className="overflow-y-auto bg-white max-h-[400px]">
            {filteredAffiliations.length > 0 ? (
              <div className="divide-y">
                {filteredAffiliations.map(aff => (
                  <div key={aff.name} className="px-4 py-2 flex items-center text-sm hover:bg-gray-50">
                    {editingAff === aff.name ? (
                      <>
                        <div className="w-7/12 pr-2">
                          <input
                            type="text"
                            value={editAffValue}
                            onChange={e => setEditAffValue(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                            onKeyDown={e => { if (e.key === 'Enter') handleAffRename(aff.name); if (e.key === 'Escape') setEditingAff(null); }}
                            autoFocus
                          />
                        </div>
                        <div className="w-2/12 text-center text-gray-500">{aff.count}</div>
                        <div className="w-3/12 flex justify-center gap-1">
                          <button
                            onClick={() => handleAffRename(aff.name)}
                            className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition-colors"
                            title="保存"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingAff(null)}
                            className="p-1 text-gray-400 hover:bg-gray-200 rounded transition-colors"
                            title="キャンセル"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-7/12 font-medium text-gray-800">{aff.name}</div>
                        <div className="w-2/12 text-center">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{aff.count}名</span>
                        </div>
                        <div className="w-3/12 flex justify-center">
                          <button
                            onClick={() => { setEditingAff(aff.name); setEditAffValue(aff.name); }}
                            className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                            title="所属名を変更"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[120px] text-sm text-gray-400">
                {searchQuery ? '検索結果がありません' : '所属データがありません'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === ふりがな一覧テーブル === */}
      {tab === 'furigana' && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2 flex items-center text-xs font-medium text-gray-500">
            <div className="w-4/12">選手名</div>
            <div className="w-4/12">ふりがな</div>
            <div className="w-3/12">所属</div>
            <div className="w-1/12 text-center">操作</div>
          </div>
          <div className="overflow-y-auto bg-white max-h-[400px]">
            {filteredFurigana.length > 0 ? (
              <div className="divide-y">
                {filteredFurigana.map(p => (
                  <div key={p.playerId} className="px-4 py-2 flex items-center text-sm hover:bg-gray-50">
                    <div className="w-4/12 font-medium text-gray-800 truncate">{p.name}</div>
                    {editingPlayerId === p.playerId ? (
                      <>
                        <div className="w-4/12 pr-2">
                          <input
                            type="text"
                            value={editFuriganaValue}
                            onChange={e => setEditFuriganaValue(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                            onKeyDown={e => { if (e.key === 'Enter') handleFuriganaSave(p.playerId); if (e.key === 'Escape') setEditingPlayerId(null); }}
                            autoFocus
                          />
                        </div>
                        <div className="w-3/12 text-xs text-gray-400 truncate">{p.affiliation}</div>
                        <div className="w-1/12 flex justify-center gap-1">
                          <button
                            onClick={() => handleFuriganaSave(p.playerId)}
                            className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingPlayerId(null)}
                            className="p-1 text-gray-400 hover:bg-gray-200 rounded transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-4/12 text-gray-600 truncate">
                          {p.furigana || <span className="text-amber-500 text-xs italic">未登録</span>}
                        </div>
                        <div className="w-3/12 text-xs text-gray-400 truncate">{p.affiliation}</div>
                        <div className="w-1/12 flex justify-center">
                          <button
                            onClick={() => { setEditingPlayerId(p.playerId); setEditFuriganaValue(p.furigana || ''); }}
                            className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                            title="ふりがなを編集"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[120px] text-sm text-gray-400">
                {searchQuery ? '検索結果がありません' : '選手データがありません'}
              </div>
            )}
          </div>
          {/* ふりがな未登録の統計 */}
          {furiganaList.length > 0 && (
            <div className="bg-gray-50 border-t px-4 py-2 flex items-center gap-4 text-xs text-gray-500">
              <span>全{furiganaList.length}名</span>
              <span className="text-emerald-600">登録済: {furiganaList.filter(p => p.furigana).length}</span>
              <span className="text-amber-600">未登録: {furiganaList.filter(p => !p.furigana).length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
