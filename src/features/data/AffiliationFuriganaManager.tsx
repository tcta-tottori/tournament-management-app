import { useState, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import type { AffiliationFurigana } from '../../db/database';
import { MapPin, Download, Upload, Search, Plus, Pencil, Trash2, CheckCircle2, AlertCircle, FolderSearch, FileSpreadsheet } from 'lucide-react';

export default function AffiliationFuriganaManager() {
  const affiliationFurigana = useLiveQuery(() => db.affiliationFurigana.toArray()) || [];
  const players = useLiveQuery(() => db.players.toArray()) || [];

  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editFurigana, setEditFurigana] = useState('');
  const [newName, setNewName] = useState('');
  const [newFurigana, setNewFurigana] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ユニークな所属名を全選手から収集
  const uniqueAffiliations = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.affiliation && p.affiliation.trim()) {
        set.add(p.affiliation.trim());
      }
    }
    return Array.from(set).sort();
  }, [players]);

  // 登録済み所属名のセット
  const registeredNames = useMemo(() => {
    return new Set(affiliationFurigana.map(a => a.name));
  }, [affiliationFurigana]);

  // 未登録の所属数
  const unregisteredCount = useMemo(() => {
    return uniqueAffiliations.filter(a => !registeredNames.has(a)).length;
  }, [uniqueAffiliations, registeredNames]);

  // フィルタリングされたリスト
  const filteredList = useMemo(() => {
    const sorted = affiliationFurigana.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.trim().toLowerCase();
    return sorted.filter(
      item => item.name.toLowerCase().includes(q) || item.furigana.toLowerCase().includes(q)
    );
  }, [affiliationFurigana, searchQuery]);

  // --- 新規追加 ---
  const handleAdd = async () => {
    const name = newName.trim();
    const furigana = newFurigana.trim();
    if (!name || !furigana) {
      setStatus({ message: '所属名とふりがなを両方入力してください。', isError: true });
      return;
    }

    try {
      const existing = await db.affiliationFurigana.where('name').equals(name).first();
      if (existing) {
        await db.affiliationFurigana.update(existing.id!, { furigana, updatedAt: Date.now() });
        setStatus({ message: `「${name}」のふりがなを更新しました。`, isError: false });
      } else {
        await db.affiliationFurigana.add({ name, furigana, updatedAt: Date.now() });
        setStatus({ message: `「${name}」を追加しました。`, isError: false });
      }
      setNewName('');
      setNewFurigana('');
    } catch (error: any) {
      setStatus({ message: `追加失敗: ${error.message}`, isError: true });
    }
  };

  // --- 編集開始 ---
  const handleEditStart = (item: AffiliationFurigana) => {
    setEditingId(item.id!);
    setEditName(item.name);
    setEditFurigana(item.furigana);
  };

  // --- 編集保存 ---
  const handleEditSave = async () => {
    if (editingId === null) return;
    const name = editName.trim();
    const furigana = editFurigana.trim();
    if (!name || !furigana) {
      setStatus({ message: '所属名とふりがなを両方入力してください。', isError: true });
      return;
    }

    try {
      await db.affiliationFurigana.update(editingId, { name, furigana, updatedAt: Date.now() });
      setEditingId(null);
      setStatus({ message: `「${name}」を更新しました。`, isError: false });
    } catch (error: any) {
      setStatus({ message: `更新失敗: ${error.message}`, isError: true });
    }
  };

  // --- 編集キャンセル ---
  const handleEditCancel = () => {
    setEditingId(null);
  };

  // --- 削除 ---
  const handleDelete = async (item: AffiliationFurigana) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      await db.affiliationFurigana.delete(item.id!);
      setStatus({ message: `「${item.name}」を削除しました。`, isError: false });
    } catch (error: any) {
      setStatus({ message: `削除失敗: ${error.message}`, isError: true });
    }
  };

  // --- 一括収集 ---
  const handleAutoCollect = async () => {
    setIsProcessing(true);
    setStatus({ message: '選手データから所属名を収集中...', isError: false });

    try {
      const newEntries: AffiliationFurigana[] = [];
      for (const affiliation of uniqueAffiliations) {
        if (!registeredNames.has(affiliation)) {
          newEntries.push({
            name: affiliation,
            furigana: '',
            updatedAt: Date.now(),
          });
        }
      }

      if (newEntries.length === 0) {
        setStatus({ message: '新しい所属名はありません。すべて登録済みです。', isError: false });
      } else {
        await db.affiliationFurigana.bulkAdd(newEntries);
        setStatus({ message: `${newEntries.length}件の所属名を収集しました。ふりがなを入力してください。`, isError: false });
      }
    } catch (error: any) {
      setStatus({ message: `収集失敗: ${error.message}`, isError: true });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Excelインポート ---
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatus({ message: 'Excelを読み込んでいます...', isError: false });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

      const entries: AffiliationFurigana[] = [];
      for (const row of jsonData) {
        const name = row['所属名'] || row['name'];
        const furigana = row['ふりがな'] || row['furigana'];

        if (name && furigana) {
          entries.push({
            name: String(name).trim(),
            furigana: String(furigana).trim(),
            updatedAt: Date.now(),
          });
        }
      }

      if (entries.length > 0) {
        for (const entry of entries) {
          const existing = await db.affiliationFurigana.where('name').equals(entry.name).first();
          if (existing) {
            await db.affiliationFurigana.update(existing.id!, { furigana: entry.furigana, updatedAt: entry.updatedAt });
          } else {
            await db.affiliationFurigana.add(entry);
          }
        }
      }

      setStatus({ message: `${entries.length}件の所属ふりがなをインポートしました。`, isError: false });
    } catch (error: any) {
      setStatus({ message: `インポート失敗: ${error.message}`, isError: true });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Excelエクスポート ---
  const handleExport = () => {
    try {
      const exportData = affiliationFurigana
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
        .map(item => ({
          '所属名': item.name,
          'ふりがな': item.furigana,
        }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '所属ふりがな');
      XLSX.writeFile(workbook, `affiliation_furigana_${new Date().toISOString().slice(0, 10)}.xlsx`);

      setStatus({ message: `${exportData.length}件の所属ふりがなをエクスポートしました。`, isError: false });
    } catch (error: any) {
      setStatus({ message: `エクスポート失敗: ${error.message}`, isError: true });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-800 flex items-center gap-1">
          <MapPin className="w-4 h-4 text-primary-600" />
          所属ふりがな管理
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-primary-100 text-primary-800 px-2 py-1 rounded-full">
            登録: {affiliationFurigana.filter(a => a.furigana).length} / {uniqueAffiliations.length}件
          </span>
          {unregisteredCount > 0 && (
            <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
              未登録: {unregisteredCount}件
            </span>
          )}
        </div>
      </div>

      {status && (
        <div
          className={`mb-4 p-3 rounded-md text-sm flex items-start gap-2 ${
            status.isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {status.isError ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="font-medium">{status.message}</span>
        </div>
      )}

      {/* 操作ボタン */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <button
          onClick={handleAutoCollect}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center p-3 gap-2 bg-gradient-to-br from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <FolderSearch className="w-6 h-6 text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-900">一括収集</span>
          <span className="text-xs text-indigo-600 text-center">選手データから所属名を自動収集</span>
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
          <span className="text-xs text-emerald-600 text-center">所属名・ふりがなをExcelから読込</span>
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
          />
        </button>

        <button
          onClick={handleExport}
          disabled={isProcessing}
          className="flex flex-col items-center justify-center p-3 gap-2 bg-gradient-to-br from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 border border-orange-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-1">
            <FileSpreadsheet className="w-6 h-6 text-orange-600" />
            <Download className="w-4 h-4 text-orange-600" />
          </div>
          <span className="text-sm font-semibold text-orange-900">エクスポート</span>
          <span className="text-xs text-orange-600 text-center">所属ふりがなをExcelに出力</span>
        </button>
      </div>

      {/* 新規追加フォーム */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Plus className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">新規追加</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="所属名（例: 鳥取グリーンTC）"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
          />
          <input
            type="text"
            value={newFurigana}
            onChange={e => setNewFurigana(e.target.value)}
            placeholder="ふりがな（例: とっとりグリーンティーシー）"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary-500 text-white rounded-md text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            追加
          </button>
        </div>
      </div>

      {/* 検索フィルター */}
      <div className="mb-3 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="所属名・ふりがなで検索..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        />
      </div>

      {/* テーブル */}
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center text-xs font-medium text-gray-500">
          <div className="w-5/12">所属名</div>
          <div className="w-5/12">ふりがな</div>
          <div className="w-2/12 text-center">操作</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white max-h-[400px]">
          {filteredList.length > 0 ? (
            <div className="divide-y">
              {filteredList.map(item => (
                <div key={item.id} className="px-4 py-2 flex items-center text-sm hover:bg-gray-50">
                  {editingId === item.id ? (
                    <>
                      <div className="w-5/12 pr-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                        />
                      </div>
                      <div className="w-5/12 pr-2">
                        <input
                          type="text"
                          value={editFurigana}
                          onChange={e => setEditFurigana(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                          onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); }}
                        />
                      </div>
                      <div className="w-2/12 flex justify-center gap-1">
                        <button
                          onClick={handleEditSave}
                          className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600 transition-colors"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-5/12 font-medium text-gray-800">{item.name}</div>
                      <div className="w-5/12 text-gray-600">
                        {item.furigana || (
                          <span className="text-amber-500 text-xs italic">未入力</span>
                        )}
                      </div>
                      <div className="w-2/12 flex justify-center gap-1">
                        <button
                          onClick={() => handleEditStart(item)}
                          className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                          title="編集"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[100px] text-sm text-gray-400">
              {searchQuery ? '検索結果がありません' : '所属ふりがなデータがありません'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
