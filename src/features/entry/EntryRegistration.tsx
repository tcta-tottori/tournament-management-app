import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Search, Plus, Trash2, Users, AlertCircle, UserPlus, FileSpreadsheet, Upload } from 'lucide-react';
import EntryImport from './EntryImport';

export default function EntryRegistration() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  // 種目リストの取得
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

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

  // エントリー済みプレイヤーIDのセット
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
        setSelectedPartner1(playerId);
      } else {
        if (selectedPartner1 === playerId) {
            setSelectedPartner1(null);
            return;
        }

        // 重複チェック: 選手1がすでにエントリー済み（playerIdまたはpartnerIdとして）か確認
        const partner1AlreadyRegistered = entries.some(
          e => e.playerId === selectedPartner1 || e.partnerId === selectedPartner1
        );
        if (partner1AlreadyRegistered) {
          alert(`${playerMap.get(selectedPartner1)?.name || '選手1'} は既にこの種目にエントリー済みです。`);
          setSelectedPartner1(null);
          return;
        }

        // 重複チェック: 選手2がすでにエントリー済み（playerIdまたはpartnerIdとして）か確認
        const player2AlreadyRegistered = entries.some(
          e => e.playerId === playerId || e.partnerId === playerId
        );
        if (player2AlreadyRegistered) {
          alert(`${playerMap.get(playerId)?.name || '選手2'} は既にこの種目にエントリー済みです。`);
          setSelectedPartner1(null);
          return;
        }

        const p1 = playerMap.get(selectedPartner1);
        const p2 = playerMap.get(playerId);

        const points1 = p1?.rankings?.[currentEvent.name] || 0;
        const points2 = p2?.rankings?.[currentEvent.name] || 0;

        await db.entries.add({
          eventId: selectedEventId,
          entryId: `EN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          playerId: selectedPartner1,
          partnerId: playerId,
          rankPoint: points1 + points2,
          status: 'active'
        });
        setSelectedPartner1(null);
      }
    } else {
      const player = playerMap.get(playerId);
      const points = player?.rankings?.[currentEvent.name] || 0;

      await db.entries.add({
        eventId: selectedEventId,
        entryId: `EN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
      <div className="flex flex-col items-center justify-center p-12 text-[#6b7280] h-full">
        <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
        <h2 className="text-xl font-bold mb-2">大会が選択されていません</h2>
        <p className="text-sm">データ管理画面で対象の大会を選択するか、新しく作成してください。</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-6 h-[calc(100vh-120px)] flex flex-col">
      <header className="bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef] shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#2e7d32]" />
            エントリー登録
          </h1>
        </div>

        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-[#111827] whitespace-nowrap">対象種目:</label>
            <select
              value={selectedEventId}
              onChange={e => {
                  setSelectedEventId(e.target.value);
                  setSelectedPartner1(null);
              }}
              className="w-full sm:w-64 border-[#cbd5e1] rounded-[6px] shadow-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
            >
              <option value="">-- 種目を選択 --</option>
              {events.map(e => (
                <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-white border border-[#cbd5e1] text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors whitespace-nowrap"
            title="Excel/CSVからエントリーデータを一括で読み込みます"
          >
            <Upload className="w-4 h-4 text-[#2e7d32]" />
            <span className="hidden md:inline">一括インポート</span>
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      {selectedEventId ? (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">

          {/* 左ペイン: 選手リスト */}
          <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] flex flex-col min-h-0">
            <div className="bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex justify-between items-center shrink-0">
              <h2 className="font-bold text-[#1b5e20] flex items-center gap-2">
                <Users className="w-4 h-4" /> 選手リスト
              </h2>
              <span className="text-xs bg-[#2e7d32] text-white px-2 py-0.5 rounded-full font-semibold">
                全 {players.length} 名
              </span>
            </div>

            <div className="p-3 border-b shrink-0 bg-[#f1f8e9]">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-[#6b7280]" />
                </div>
                <input
                  type="text"
                  placeholder="選手名、ふりがな、所属で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-[#cbd5e1] rounded-[6px] text-sm focus:outline-none focus:ring-[3px] focus:ring-[#2e7d32]/15 focus:border-[#2e7d32]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-8 text-[#6b7280] text-sm">該当する選手が見つかりません</div>
              ) : (
                filteredPlayers.map(player => {
                  const isRegistered = registeredPlayerIds.has(player.playerId);
                  const isSelectedForPartner = selectedPartner1 === player.playerId;

                  return (
                    <div
                      key={player.playerId}
                      onClick={() => !isRegistered && handleAddEntry(player.playerId)}
                      className={`flex items-center justify-between p-2.5 rounded-md border transition-all ${
                        isRegistered
                          ? 'bg-[#f6f9fc] border-[#e0e7ef] opacity-60 cursor-not-allowed'
                          : isSelectedForPartner
                            ? 'bg-[#2e7d32] border-[#256b28] text-white cursor-pointer shadow-md'
                            : 'bg-white border-[#e0e7ef] hover:border-[#2e7d32] hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold truncate whitespace-nowrap ${isSelectedForPartner ? 'text-white' : 'text-[#111827]'}`}>{player.name}</span>
                          {isRegistered && <span className="text-[10px] bg-gray-200 text-[#6b7280] px-1.5 py-0.5 rounded uppercase">登録済</span>}
                        </div>
                        <div className={`text-xs truncate ${isSelectedForPartner ? 'text-blue-200' : 'text-[#6b7280]'}`}>
                          {player.furigana} / {player.affiliation || '-'}
                        </div>
                      </div>

                      {!isRegistered && (
                        <div className="shrink-0 flex items-center">
                          {isSelectedForPartner ? (
                            <span className="text-xs font-bold bg-white text-[#2e7d32] px-2 py-1 rounded shadow-sm">
                              ペアを選択中...
                            </span>
                          ) : (
                            <button className="text-[#2e7d32] hover:bg-[#e8f5e9] p-1.5 rounded-full transition-colors">
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
          <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] flex flex-col min-h-0">
            <div className="bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex justify-between items-center shrink-0">
              <h2 className="font-bold text-[#1b5e20] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                {currentEvent?.name} のエントリー
              </h2>
              <span className="text-xs bg-[#16a34a] text-white px-2 py-0.5 rounded-full font-semibold">
                {entries.length} 組
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 bg-[#f6f9fc]/50">
              {entries.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-[#6b7280]">
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
                      <div key={entry.id} className="bg-white border border-[#e0e7ef] rounded-md p-3 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-[#6b7280] font-bold text-sm w-6 text-center">#{idx + 1}</span>
                          <div>
                            <div className="font-bold text-[#111827] text-sm whitespace-nowrap">{p1?.name || '不明'}</div>
                            <div className="text-xs text-[#6b7280]">{p1?.affiliation || '-'}</div>
                          </div>
                          {p2 && (
                            <>
                              <span className="text-gray-300">/</span>
                              <div>
                                <div className="font-bold text-[#111827] text-sm whitespace-nowrap">{p2.name}</div>
                                <div className="text-xs text-[#6b7280]">{p2.affiliation || '-'}</div>
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteEntry(entry.id!)}
                          className="p-1.5 text-[#dc2626] hover:bg-red-50 rounded transition-colors"
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
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] text-[#6b7280] min-h-[400px]">
           <AlertCircle className="w-16 h-16 mb-4 text-gray-200" />
           <p className="font-semibold">上部のドロップダウンから対象種目を選択してください</p>
        </div>
      )}

      {showImportModal && (
        <EntryImport onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}
