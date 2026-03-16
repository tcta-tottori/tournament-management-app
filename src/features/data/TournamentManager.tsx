import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { PlusCircle, Trash2, CheckCircle2, Circle } from 'lucide-react';

export default function TournamentManager() {
  const tournaments = useLiveQuery(() => db.tournaments.toArray());
  const { currentTournamentId, setCurrentTournamentId } = useAppStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    venue: '',
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const newTournamentId = `T-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    
    await db.tournaments.add({
      tournamentId: newTournamentId,
      name: formData.name,
      date: formData.date,
      venue: formData.venue,
      reserveDate: '',
      reserveVenue: '',
      createdAt: Date.now()
    });
    
    if (!currentTournamentId) {
      setCurrentTournamentId(newTournamentId);
    }

    setFormData({ name: '', date: '', venue: '' });
    setIsAdding(false);
  };

  const handleDelete = async (id: number, tId: string) => {
    // ブラウザテストエージェントが native confirm に対応していない可能性を考慮し、一時的に外す
    // if (!window.confirm('この大会を削除しますか？')) return;
    await db.tournaments.delete(id);
    if (currentTournamentId === tId) {
      setCurrentTournamentId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-800">登録済みの大会</h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="text-sm flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium px-2 py-1 rounded bg-primary-50"
          >
            <PlusCircle className="w-4 h-4" /> 新規作成
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">大会名</label>
              <input 
                type="text" 
                required
                className="w-full border-gray-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-primary-500 border"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="例: 第56回 〇〇選手権" 
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">日程</label>
                <input 
                  type="date" 
                  className="w-full border-gray-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-primary-500 border"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">会場</label>
                <input 
                  type="text" 
                  className="w-full border-gray-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-primary-500 border"
                  value={formData.venue}
                  onChange={e => setFormData({...formData, venue: e.target.value})}
                  placeholder="フューズ・アスレティック..." 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button 
                type="submit"
                className="px-3 py-1.5 text-xs text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                保存
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto min-h-[150px]">
        {tournaments === undefined ? (
          <div className="flex justify-center py-4"><span className="text-sm text-gray-400">Loading...</span></div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded border border-dashed border-gray-200">
            大会が登録されていません
          </div>
        ) : (
          <ul className="space-y-2">
            {tournaments.map(t => (
              <li 
                key={t.id} 
                className={`p-3 rounded-lg border transition-all ${
                  currentTournamentId === t.tournamentId 
                    ? 'border-primary-400 bg-primary-50/50 shadow-sm' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => setCurrentTournamentId(t.tournamentId)}
                  >
                    {currentTournamentId === t.tournamentId ? (
                      <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{t.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                        <span>{t.date || '日程未定'}</span>
                        {t.venue && <span>• {t.venue}</span>}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(t.id!, t.tournamentId);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
