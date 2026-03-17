import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CalendarDays, Plus, Trash2, MapPin } from 'lucide-react';

export default function CourtSchedule() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [newCourtName, setNewCourtName] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const matches = useLiveQuery(
    () => selectedEventId ? db.matches.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const sortedCourts = useMemo(() => [...courts].sort((a, b) => a.order - b.order), [courts]);

  const courtMatchMap = useMemo(() => {
    const map: Record<string, typeof matches> = {};
    for (const c of courts) {
      map[c.courtId] = matches
        .filter(m => m.courtId === c.courtId)
        .sort((a, b) => {
          if (a.scheduledTime && b.scheduledTime) {
            const cmp = a.scheduledTime.localeCompare(b.scheduledTime);
            if (cmp !== 0) return cmp;
          }
          return a.matchOrder - b.matchOrder;
        });
    }
    return map;
  }, [courts, matches]);

  const unassignedMatches = useMemo(
    () => matches.filter(m => !m.courtId && m.player1Name && m.player2Name && m.status !== 'walkover')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  // 時間割インポート済みかどうか
  const hasImportedSchedule = useMemo(
    () => matches.some(m => m.scheduledTime && m.courtId),
    [matches]
  );

  const handleAddCourt = async () => {
    if (!newCourtName.trim() || !currentTournamentId) return;
    const courtId = `C-${Date.now()}`;
    await db.courts.add({
      tournamentId: currentTournamentId,
      courtId,
      name: newCourtName.trim(),
      surface: '',
      isAvailable: true,
      currentMatchId: null,
      order: courts.length + 1
    });
    setNewCourtName('');
  };

  const handleDeleteCourt = async (id: number) => {
    if (!confirm('このコートを削除しますか？')) return;
    await db.courts.delete(id);
  };

  const handleToggleAvailable = async (id: number, current: boolean) => {
    await db.courts.update(id, { isAvailable: !current });
  };

  const handleAssignMatch = async (matchId: string, courtId: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { courtId: courtId || null, updatedAt: Date.now() });
  };

  const handleSetTime = async (matchId: string, time: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { scheduledTime: time || null, updatedAt: Date.now() });
  };

  const statusColor: Record<string, string> = {
    waiting: 'bg-gray-100 text-gray-500',
    ready: 'bg-primary-50 text-primary-500',
    playing: 'bg-green-100 text-[#16a34a]',
    finished: 'bg-primary-50 text-primary-600',
    walkover: 'bg-amber-100 text-warning',
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary-500" />
            コート・時間割
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            コートの登録と試合のコート割り当て・時間管理を行います。
            {hasImportedSchedule && (
              <span className="ml-2 text-xs text-primary-500 font-medium">（インポート済みスケジュールあり）</span>
            )}
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full sm:w-64 border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* 左: コート管理 */}
        <div className="lg:w-80 flex flex-col gap-4 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              コート管理
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="コート名 (例: A-1)"
                value={newCourtName}
                onChange={e => setNewCourtName(e.target.value)}
                className="flex-1 border border-border-main rounded-lg px-2 py-1.5 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
                onKeyDown={e => e.key === 'Enter' && handleAddCourt()}
              />
              <button
                onClick={handleAddCourt}
                disabled={!newCourtName.trim() || !currentTournamentId}
                className="bg-primary-500 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {sortedCourts.length > 0 ? (
              <ul className="space-y-2">
                {sortedCourts.map(c => (
                  <li key={c.courtId} className="flex items-center justify-between bg-primary-50 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => c.id && handleToggleAvailable(c.id, c.isAvailable)}
                        className={`w-6 h-6 rounded-full ${c.isAvailable ? 'bg-[#16a34a]' : 'bg-danger'}`}
                        title={c.isAvailable ? '利用可能' : '使用不可'}
                      />
                      <span className="font-medium text-sm">{c.name}</span>
                    </div>
                    <button
                      onClick={() => c.id && handleDeleteCourt(c.id)}
                      className="text-gray-500 hover:text-[#dc2626]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">コートが未登録です</p>
            )}
          </div>

          {/* 未割当試合 */}
          {selectedEventId && unassignedMatches.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
              <h3 className="font-bold text-gray-900 text-sm mb-2">未割当の試合 ({unassignedMatches.length})</h3>
              <ul className="space-y-2 max-h-60 overflow-auto">
                {unassignedMatches.map(m => (
                  <li key={m.matchId} className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-gray-500">#{m.matchOrder}</span>
                      <select
                        value={m.courtId || ''}
                        onChange={e => handleAssignMatch(m.matchId, e.target.value)}
                        className="border border-border-main rounded-lg px-1 py-0.5 text-xs bg-white"
                      >
                        <option value="">割当</option>
                        {sortedCourts.filter(c => c.isAvailable).map(c => (
                          <option key={c.courtId} value={c.courtId}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 truncate">{m.player1Name} vs {m.player2Name}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 右: コート別スケジュール */}
        <div className="flex-1 overflow-auto">
          {sortedCourts.length > 0 && selectedEventId ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedCourts.map(c => {
                const courtMatches = courtMatchMap[c.courtId] || [];
                return (
                  <div key={c.courtId} className={`bg-white rounded-xl shadow-sm border-2 ${c.isAvailable ? 'border-border-main' : 'border-red-200 opacity-60'} flex flex-col`}>
                    <div className="px-4 py-3 border-b border-border-main flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.isAvailable ? 'bg-[#16a34a]' : 'bg-danger'}`} />
                        <h3 className="font-bold text-gray-900">{c.name}</h3>
                      </div>
                      <span className="text-xs text-gray-500">{courtMatches.length}試合</span>
                    </div>
                    <div className="p-3 space-y-2 flex-1">
                      {courtMatches.length > 0 ? courtMatches.map(m => (
                        <div key={m.matchId} className="bg-primary-50 rounded-md px-3 py-2 text-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono text-xs text-gray-500">#{m.matchOrder}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={m.scheduledTime || ''}
                                onChange={e => handleSetTime(m.matchId, e.target.value)}
                                className="border border-border-main rounded-lg px-1 py-0.5 text-xs w-20"
                              />
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor[m.status] || ''}`}>
                                {m.status === 'playing' ? '試合中' : m.status === 'finished' ? '終了' : m.status === 'ready' ? '準備完了' : '待機'}
                              </span>
                            </div>
                          </div>
                          <p className="truncate"><span className="font-medium">{m.player1Name}</span> <span className="text-gray-500">vs</span> <span className="font-medium">{m.player2Name}</span></p>
                          {m.score && <p className="text-xs text-primary-500 font-mono mt-0.5">{m.score}</p>}
                        </div>
                      )) : (
                        <p className="text-xs text-gray-500 text-center py-4">割り当てなし</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-xl border border-dashed border-border-main">
              <CalendarDays className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500">
                {sortedCourts.length === 0
                  ? '左パネルからコートを登録してください'
                  : '種目を選択すると試合のスケジュール管理ができます'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
