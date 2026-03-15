import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Search, Plus, Trash2, Users, AlertCircle, UserPlus, FileSpreadsheet } from 'lucide-react';

export default function EntryRegistration() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  // 種目リストの取得
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // 選択中の種目情報
  const currentEvent = useMemo(() => events.find(e => e.eventId === selectedEventId), [events, selectedEventId]);

  // 全選手データの取得
  const players = useLiveQuery(() => db.players.toArray()) || [];
  const playerMap = useMemo(() => new Map(players.map(p => [p.playerId, p])), [players]);

  // エントリー済みデータの取得
  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  // エントリー済みプレイヤーIDのセット（左側リストで非表示/グレーアウトするため）
  const registeredPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach(e => {
      if (e.playerId) ids.add(e.playerId);
      if (e.partnerId) ids.add(e.partnerId);
    });
    return ids;
  }, [entries]);

  // 左ペイン用: 検索フィルタリング
  const filteredPlayers = useMemo(() => {
    if (!searchQuery) return players;
    const lowerQuery = searchQuery.toLowerCase();
    return players.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      (p.furigana && p.furigana.toLowerCase().includes(lowerQuery)) ||
      (p.affiliation && p.affiliation.toLowerCase().includes(lowerQuery))
    );
  }, [players, searchQuery]);

  // ペア選択モード用の状態 (ダブルス時)
  const [selectedPartner1, setSelectedPartner1] = useState<string | null>(null);

  const handleAddEntry = async (playerId: string) => {
    if (!selectedEventId || !currentEvent) return;

    if (currentEvent.type === 'Doubles') {
      if (!selectedPartner1) {
        // パートナー1人目を選択
        setSelectedPartner1(playerId);
      } else {
        // 2人目を選択してエントリー追加
        if (selectedPartner1 === playerId) {
            setSelectedPartner1(null); // キャンセル
            return;
        }

        const p1 = playerMap.get(selectedPartner1);
        const p2 = playerMap.get(playerId);
        
        // ポイント計算 (とりあえず合算にするなどのロジック。今回は0にしておくか個別のポイントを持つか。暫定で合算)
        // 本来は rankings オブジェクト内の指定キーを参照する
        const points1 = p1?.rankings?.[currentEvent.name] || 0;
        const points2 = p2?.rankings?.[currentEvent.name] || 0;

        await db.entries.add({
          eventId: selectedEventId,
          entryId: `EN-${Date.now()}`,
          playerId: selectedPartner1,
          partnerId: playerId,
          rankPoint: points1 + points2,
          status: 'active'
        });
        setSelectedPartner1(null);
      }
    } else {
      // シングルスエントリー
      const player = playerMap.get(playerId);
      const points = player?.rankings?.[currentEvent.name] || 0;

      await db.entries.add({
        eventId: selectedEventId,
        entryId: `EN-${Date.now()}`,
        playerId: playerId,
        rankPoint: points,
        status: 'active'
      });
    }
  };

  const handleDeleteEntry = async (id: number) => {
    await db.entries.delete(id);
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
    <div className="max-w-6xl mx-auto space-y-4 pb-20 md:pb-6 h-[calc(100vh-120px)] flex flex-col">
      <header className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            エントリー登録 (S-02)
          </h1>
        </div>
        
        <div className="w-full sm:w-auto flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">対象種目:</label>
          <select 
            value={selectedEventId} 
            onChange={e => {
                setSelectedEventId(e.target.value);
                setSelectedPartner1(null);
            }}
            className="w-full sm:w-64 border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-3 py-2 bg-gray-50 border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
            ))}
          </select>
        </div>
      </header>

      {/* メインコンテンツ */}
      {selectedEventId ? (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
          
          {/* 左ペイン: 選手リスト（登録元） */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-0">
            <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center shrink-0">
              <h2 className="font-bold text-indigo-900 flex items-center gap-2">
                <Users className="w-4 h-4" /> 選手リスト
              </h2>
              <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                全 {players.length} 名
              </span>
            </div>
            
            <div className="p-3 border-b shrink-0 bg-gray-50">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="選手名、ふりがな、所属で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">該当する選手が見つかりません</div>
              ) : (
                filteredPlayers.map(player => {
                  const isRegistered = registeredPlayerIds.has(player.playerId);
                  const isSelectedForPartner = selectedPartner1 === player.playerId;
                  
                  return (
                    <div 
                      key={player.playerId} 
                      onClick={() => !isRegistered && handleAddEntry(player.playerId)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                        isRegistered 
                          ? 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed' 
                          : isSelectedForPartner
                            ? 'bg-indigo-600 border-indigo-700 text-white cursor-pointer shadow-md'
                            : 'bg-white border-gray-200 hover:border-indigo-400 hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold truncate ${isSelectedForPartner ? 'text-white' : 'text-gray-900'}`}>{player.name}</span>
                          {isRegistered && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded uppercase">登録済</span>}
                        </div>
                        <div className={`text-xs truncate ${isSelectedForPartner ? 'text-indigo-200' : 'text-gray-500'}`}>
                          {player.furigana} / {player.affiliation || '-'}
                        </div>
                      </div>
                      
                      {!isRegistered && (
                        <div className="shrink-0 flex items-center">
                          {isSelectedForPartner ? (
                            <span className="text-xs font-bold bg-white text-indigo-700 px-2 py-1 rounded shadow-sm">
                              ペアを選択中...
                            </span>
                          ) : (
                            <button className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-full transition-colors">
                              <Plus className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            {currentEvent?.type === 'Doubles' && (
              <div className="bg-amber-50 p-2 border-t text-xs text-amber-800 text-center font-semibold shrink-0">
                ダブルス: {selectedPartner1 ? '2人目のペアを選択してください' : '1人目の選手を選択してください'}
              </div>
            )}
          </div>

          {/* 右ペイン: 登録済みエントリーリスト */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-0">
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex justify-between items-center shrink-0">
              <h2 className="font-bold text-emerald-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> 
                {currentEvent?.name} のエントリー
              </h2>
              <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                {entries.length} 組
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
              {entries.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400">
                   <Users className="w-12 h-12 mb-3 opacity-20" />
                   <p className="text-sm">まだエントリーがありません</p>
                   <p className="text-xs mt-1">左のリストから選手を追加してください</p>
                 </div>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry, idx) => {
                    const p1 = playerMap.get(entry.playerId);
                    const p2 = entry.partnerId ? playerMap.get(entry.partnerId) : undefined;

                    return (
                      <div key={entry.id} className="bg-white border rounded-lg p-3 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 font-bold text-sm w-6 text-center">#{idx + 1}</span>
                          <div>
                            <div className="font-bold text-gray-800 text-sm">{p1?.name || '不明'}</div>
                            <div className="text-xs text-gray-500">{p1?.affiliation || '-'}</div>
                          </div>
                          {p2 && (
                            <>
                              <span className="text-gray-300">/</span>
                              <div>
                                <div className="font-bold text-gray-800 text-sm">{p2.name}</div>
                                <div className="text-xs text-gray-500">{p2.affiliation || '-'}</div>
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteEntry(entry.id!)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="エントリーを取り消し"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200 text-gray-500 min-h-[400px]">
           <AlertCircle className="w-16 h-16 mb-4 text-gray-200" />
           <p className="font-semibold">上部のドロップダウンから対象種目を選択してください</p>
        </div>
      )}
    </div>
  );
}
