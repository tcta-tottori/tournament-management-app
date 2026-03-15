import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Users, Settings, Trash2, Plus, AlertCircle, Search } from 'lucide-react';

export default function EntryList() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  const tournament = useLiveQuery(
    () => currentTournamentId ? db.tournaments.where('tournamentId').equals(currentTournamentId).first() : undefined,
    [currentTournamentId]
  );

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  );

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState<'Singles' | 'Doubles' | 'Team'>('Singles');

  // エントリーデータの取得
  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  );

  // プレイヤーデータの取得 (Map化で高速化)
  const players = useLiveQuery(() => db.players.toArray());
  const playerMap = new Map(players?.map(p => [p.playerId, p]) || []);

  const handleAddEvent = async () => {
    if (!currentTournamentId || !newEventName) return;
    
    const eventId = `E-${Date.now()}`;
    await db.events.add({
      tournamentId: currentTournamentId,
      eventId,
      name: newEventName,
      type: newEventType,
      gameRules: {
        sets: 1,
        games: 6,
        deuce: true,
        tiebreakPoint: 7
      }
    });

    setNewEventName('');
    setIsAddingEvent(false);
    setSelectedEventId(eventId);
  };

  const handleDeleteEvent = async (id: number, eId: string) => {
    if (confirm('この種目と関連するエントリーをすべて削除しますか？')) {
      await db.events.delete(id);
      
      // 関連するエントリーも削除
      const relatedEntries = await db.entries.where('eventId').equals(eId).toArray();
      const entryIds = relatedEntries.map(e => e.id).filter(id => id !== undefined) as number[];
      if (entryIds.length > 0) {
        await db.entries.bulkDelete(entryIds);
      }
      
      if (selectedEventId === eId) {
        setSelectedEventId('');
      }
    }
  };

  const handleToggleEntryStatus = async (entry: any) => {
    await db.entries.update(entry.id, {
      status: entry.status === 'active' ? 'withdrawn' : 'active'
    });
  };

  const handleDeleteEntry = async (id: number) => {
    if (confirm('このエントリーを削除しますか？')) {
      await db.entries.delete(id);
    }
  };

  if (!currentTournamentId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-500 h-full">
        <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
        <h2 className="text-xl font-bold mb-2">大会が選択されていません</h2>
        <p className="text-sm">データ管理画面で対象の大会を選択するか、新しく作成してください。</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 md:pb-6">
      <header className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-600" />
              エントリーリスト管理 (S-03)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              大会: {tournament?.name || currentTournamentId} の種目登録とエントリー一覧
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* 左ペイン: 種目管理 */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center">
              <h2 className="font-bold text-indigo-900">種目 (Events)</h2>
              <button 
                onClick={() => setIsAddingEvent(!isAddingEvent)}
                className="text-indigo-600 hover:bg-indigo-100 p-1 rounded transition-colors"
                title="新しい種目を追加"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-3">
              {isAddingEvent && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm space-y-3">
                  <input
                    type="text"
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    placeholder="種目名 (例: 一般男子S)"
                    className="w-full px-3 py-2 border rounded focus:ring focus:ring-indigo-100 outline-none"
                  />
                  <select
                    value={newEventType}
                    onChange={e => setNewEventType(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded focus:ring outline-none"
                  >
                    <option value="Singles">シングルス</option>
                    <option value="Doubles">ダブルス</option>
                    <option value="Team">団体戦</option>
                  </select>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setIsAddingEvent(false)} className="px-3 py-1 text-gray-500 hover:bg-gray-200 rounded">キャンセル</button>
                    <button onClick={handleAddEvent} disabled={!newEventName} className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">追加</button>
                  </div>
                </div>
              )}

              {events?.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-500">
                  <p>種目が登録されていません</p>
                  <p className="text-xs mt-1">右上の＋ボタンから追加してください</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {events?.map(event => (
                    <li key={event.id}>
                      <button
                        onClick={() => setSelectedEventId(event.eventId)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center group transition-colors ${
                          selectedEventId === event.eventId 
                            ? 'bg-indigo-100 text-indigo-900 font-semibold' 
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <span className="truncate pr-2">{event.name}</span>
                        {selectedEventId === event.eventId && (
                          <span className="shrink-0 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-100 p-1 rounded"
                                onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id!, event.eventId); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 右ペイン: エントリー一覧 */}
        <div className="col-span-1 md:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[600px] flex flex-col">
            <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
              <h2 className="font-bold text-gray-800">
                {selectedEventId ? `エントリー一覧 - ${(events?.find(e => e.eventId === selectedEventId))?.name}` : '種目を選択してください'}
              </h2>
              {selectedEventId && (
                <div className="bg-white px-3 py-1 rounded-full border text-sm font-semibold text-gray-600 shadow-sm">
                  {entries?.length || 0} 件
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto bg-gray-50/50 p-4">
              {!selectedEventId ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Settings className="w-12 h-12 mb-3 opacity-20" />
                  <p>左側のメニューから種目を選択してください</p>
                </div>
              ) : entries?.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p>この種目にはまだエントリーがありません</p>
                  <p className="text-sm mt-2">（※エントリー画面 S-02 から選手を追加できます）</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries?.map((entry, index) => {
                    const activePlayer = playerMap.get(entry.playerId);
                    const partnerPlayer = entry.partnerId ? playerMap.get(entry.partnerId) : undefined;
                    
                    return (
                      <div key={entry.id} className={`bg-white border rounded-lg p-3 flex items-center justify-between shadow-sm hover:shadow transition-shadow ${entry.status === 'withdrawn' ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-8 text-center font-bold text-gray-400 text-sm">
                            #{index + 1}
                          </div>
                          
                          <div>
                            <div className="font-bold text-gray-800 flex items-center gap-2">
                              {activePlayer?.name || '不明な選手'}
                              {entry.status === 'withdrawn' && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase font-semibold">WD</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {activePlayer?.affiliation || '-'}
                            </div>
                          </div>
                          
                          {partnerPlayer && (
                            <>
                              <div className="text-gray-300">/</div>
                              <div>
                                <div className="font-bold text-gray-800 flex items-center gap-2">
                                  {partnerPlayer.name}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {partnerPlayer.affiliation || '-'}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="text-xs text-gray-500">ポイント</div>
                            <div className="font-semibold text-indigo-600">{entry.rankPoint} pt</div>
                          </div>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleToggleEntryStatus(entry)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                                entry.status === 'active' 
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {entry.status === 'active' ? 'WD設定' : 'WD取消'}
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id!)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="エントリー削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
