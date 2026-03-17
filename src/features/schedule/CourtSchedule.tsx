import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CalendarDays, Plus, Trash2, MapPin, Zap, Settings } from 'lucide-react';
import {
  extractMatchesFromDraw,
  autoSchedule,
  type ScheduleConfig,
  type EventInfo,
  type Entry as ScheduleEntry,
  type Player as SchedulePlayer,
  type Draw as ScheduleDraw,
} from './scheduleEngine';

export default function CourtSchedule() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [newCourtName, setNewCourtName] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showAutoGen, setShowAutoGen] = useState(false);
  const [autoGenConfig, setAutoGenConfig] = useState({
    matchDuration: 40,
    startTime: '09:00',
  });
  const [autoGenResult, setAutoGenResult] = useState<string | null>(null);

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

  // ===== 自動生成 =====
  const handleAutoGenerate = useCallback(async () => {
    if (!currentTournamentId || sortedCourts.length === 0) return;

    const availableCourts = sortedCourts.filter(c => c.isAvailable);
    if (availableCourts.length === 0) {
      setAutoGenResult('利用可能なコートがありません。');
      return;
    }

    try {
      // 全種目のドロー・エントリー・選手データを取得
      const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const allPlayers = await db.players.toArray();

      const playersList: SchedulePlayer[] = allPlayers.map(p => ({
        playerId: p.playerId,
        name: p.name,
      }));

      let allScheduleMatches: import('./scheduleEngine').ScheduleMatch[] = [];

      for (let idx = 0; idx < allEvents.length; idx++) {
        const evt = allEvents[idx];
        const draw = await db.draws.where('eventId').equals(evt.eventId).first();
        if (!draw) continue;

        const entries = await db.entries.where('eventId').equals(evt.eventId).toArray();

        const eventInfo: EventInfo = {
          eventCode: evt.eventId,
          eventName: evt.name,
          eventOrder: idx,
        };

        const drawData: ScheduleDraw = {
          eventId: evt.eventId,
          drawSize: draw.drawSize,
          slots: draw.slots,
        };

        const entryList: ScheduleEntry[] = entries.map(e => ({
          entryId: e.entryId,
          playerId: e.playerId,
          partnerId: e.partnerId,
        }));

        const extracted = extractMatchesFromDraw(drawData, entryList, playersList, eventInfo);
        allScheduleMatches = allScheduleMatches.concat(extracted);
      }

      if (allScheduleMatches.length === 0) {
        setAutoGenResult('スケジュール対象の試合がありません。ドローデータを先に読み込んでください。');
        return;
      }

      const config: ScheduleConfig = {
        courtCount: availableCourts.length,
        courtNames: availableCourts.map(c => c.name),
        matchDuration: autoGenConfig.matchDuration,
        startTime: autoGenConfig.startTime,
      };

      const slots = autoSchedule(allScheduleMatches, config);

      // DB上の既存matchesにcourtIdとscheduledTimeを更新
      // matchId → ScheduleSlot のマップ
      const slotMap = new Map(slots.map(s => [s.matchId, s]));

      // 全種目の全matchesを更新
      for (const evt of allEvents) {
        const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
        for (const m of dbMatches) {
          const scheduled = slotMap.get(m.matchId);
          if (scheduled && m.id) {
            // courtName → courtId のマッピング
            const court = availableCourts.find(c => c.name === scheduled.courtName);
            await db.matches.update(m.id, {
              courtId: court?.courtId || null,
              scheduledTime: scheduled.startTime,
              updatedAt: Date.now(),
            });
          }
        }
      }

      // matchesがDBにまだない場合、新規作成
      // (draws からmatchesを作成するロジックが別途必要な場合)
      let createdCount = 0;
      for (const slot of slots) {
        const schedMatch = allScheduleMatches.find(m => m.matchId === slot.matchId);
        if (!schedMatch) continue;

        // DBにmatch が存在するかチェック
        const existing = await db.matches.where('matchId').equals(slot.matchId).first();
        if (!existing) {
          const court = availableCourts.find(c => c.name === slot.courtName);
          await db.matches.add({
            eventId: schedMatch.eventCode,
            matchId: slot.matchId,
            round: schedMatch.round,
            matchOrder: schedMatch.matchNumInRound,
            position: schedMatch.matchNumInRound,
            player1EntryId: null,
            player2EntryId: null,
            player1Name: schedMatch.players[0] || '',
            player2Name: schedMatch.players[1] || '',
            player1Affiliation: '',
            player2Affiliation: '',
            score: '',
            winnerEntryId: null,
            courtId: court?.courtId || null,
            scheduledTime: slot.startTime,
            status: 'waiting',
            refereeId: null,
            refereeName: '',
            updatedAt: Date.now(),
          });
          createdCount++;
        }
      }

      setAutoGenResult(`自動生成完了: ${slots.length}試合をスケジュールしました${createdCount > 0 ? ` (${createdCount}試合を新規作成)` : ''}。`);
      setShowAutoGen(false);
    } catch (err) {
      console.error('自動生成エラー:', err);
      setAutoGenResult(`自動生成に失敗しました: ${(err as Error).message}`);
    }
  }, [currentTournamentId, sortedCourts, autoGenConfig]);

  const statusColor: Record<string, string> = {
    waiting: 'bg-gray-100 text-[#6b7280]',
    ready: 'bg-[#e8f5e9] text-[#2e7d32]',
    playing: 'bg-green-100 text-[#16a34a]',
    finished: 'bg-[#e8f5e9] text-[#1b5e20]',
    walkover: 'bg-amber-100 text-[#d97706]',
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-[#2e7d32]" />
            コート・時間割
          </h1>
          <p className="text-sm text-[#6b7280] mt-1">
            コートの登録と試合のコート割り当て・時間管理を行います。
            {hasImportedSchedule && (
              <span className="ml-2 text-xs text-[#2e7d32] font-medium">（インポート済みスケジュールあり）</span>
            )}
          </p>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full sm:w-64 border-[#cbd5e1] rounded-[6px] shadow-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAutoGen(!showAutoGen)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#1565c0] rounded-md hover:bg-[#0d47a1] transition-colors shrink-0"
            title="自動生成"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">自動生成</span>
          </button>
        </div>
      </header>

      {/* 自動生成パネル */}
      {showAutoGen && (
        <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-[#1565c0]" />
            <h2 className="font-bold text-[#111827] text-sm">スケジュール自動生成</h2>
          </div>
          <p className="text-xs text-[#6b7280] mb-4">
            ドローデータから全種目の試合スケジュールを自動生成します。登録済みのコートに試合を配置します。
            {hasImportedSchedule && (
              <span className="text-[#d97706] font-medium ml-1">※既にインポート済みスケジュールがあります。自動生成すると上書きされます。</span>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-[#6b7280] mb-1">開始時刻</label>
              <input
                type="time"
                value={autoGenConfig.startTime}
                onChange={e => setAutoGenConfig(prev => ({ ...prev, startTime: e.target.value }))}
                className="border border-[#cbd5e1] rounded-[6px] px-2 py-1.5 text-sm w-28 focus:border-[#1565c0] focus:ring-[3px] focus:ring-[#1565c0]/15 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b7280] mb-1">1試合の所要時間（分）</label>
              <input
                type="number"
                min={20}
                max={120}
                value={autoGenConfig.matchDuration}
                onChange={e => setAutoGenConfig(prev => ({ ...prev, matchDuration: parseInt(e.target.value) || 40 }))}
                className="border border-[#cbd5e1] rounded-[6px] px-2 py-1.5 text-sm w-20 focus:border-[#1565c0] focus:ring-[3px] focus:ring-[#1565c0]/15 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b7280] mb-1">使用コート</label>
              <p className="text-sm font-medium text-[#111827]">
                {sortedCourts.filter(c => c.isAvailable).map(c => c.name).join(', ') || '（未登録）'}
              </p>
            </div>
            <button
              onClick={handleAutoGenerate}
              disabled={sortedCourts.filter(c => c.isAvailable).length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#1565c0] rounded-md hover:bg-[#0d47a1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Zap className="w-4 h-4" />
              自動生成を実行
            </button>
          </div>
          {autoGenResult && (
            <div className={`p-2 rounded-md text-sm ${autoGenResult.includes('失敗') || autoGenResult.includes('ありません') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {autoGenResult}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* 左: コート管理 */}
        <div className="lg:w-80 flex flex-col gap-4 shrink-0">
          <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4">
            <h2 className="font-bold text-[#111827] mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#2e7d32]" />
              コート管理
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="コート名 (例: A-1)"
                value={newCourtName}
                onChange={e => setNewCourtName(e.target.value)}
                className="flex-1 border border-[#cbd5e1] rounded-[6px] px-2 py-1.5 text-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 outline-none"
                onKeyDown={e => e.key === 'Enter' && handleAddCourt()}
              />
              <button
                onClick={handleAddCourt}
                disabled={!newCourtName.trim() || !currentTournamentId}
                className="bg-[#2e7d32] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#256b28] disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {sortedCourts.length > 0 ? (
              <ul className="space-y-2">
                {sortedCourts.map(c => (
                  <li key={c.courtId} className="flex items-center justify-between bg-[#f1f8e9] rounded-md px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => c.id && handleToggleAvailable(c.id, c.isAvailable)}
                        className={`w-6 h-6 rounded-full ${c.isAvailable ? 'bg-[#16a34a]' : 'bg-[#dc2626]'}`}
                        title={c.isAvailable ? '利用可能' : '使用不可'}
                      />
                      <span className="font-medium text-sm">{c.name}</span>
                    </div>
                    <button
                      onClick={() => c.id && handleDeleteCourt(c.id)}
                      className="text-[#6b7280] hover:text-[#dc2626]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6b7280] text-center py-4">コートが未登録です</p>
            )}
          </div>

          {/* 未割当試合 */}
          {selectedEventId && unassignedMatches.length > 0 && (
            <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4">
              <h3 className="font-bold text-[#111827] text-sm mb-2">未割当の試合 ({unassignedMatches.length})</h3>
              <ul className="space-y-2 max-h-60 overflow-auto">
                {unassignedMatches.map(m => (
                  <li key={m.matchId} className="text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-[#6b7280]">#{m.matchOrder}</span>
                      <select
                        value={m.courtId || ''}
                        onChange={e => handleAssignMatch(m.matchId, e.target.value)}
                        className="border border-[#cbd5e1] rounded-[6px] px-1 py-0.5 text-xs bg-white"
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
                  <div key={c.courtId} className={`bg-white rounded-[10px] shadow-sm border-2 ${c.isAvailable ? 'border-[#e0e7ef]' : 'border-red-200 opacity-60'} flex flex-col`}>
                    <div className="px-4 py-3 border-b border-[#e0e7ef] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.isAvailable ? 'bg-[#16a34a]' : 'bg-[#dc2626]'}`} />
                        <h3 className="font-bold text-[#111827]">{c.name}</h3>
                      </div>
                      <span className="text-xs text-[#6b7280]">{courtMatches.length}試合</span>
                    </div>
                    <div className="p-3 space-y-2 flex-1">
                      {courtMatches.length > 0 ? courtMatches.map(m => (
                        <div key={m.matchId} className="bg-[#f1f8e9] rounded-md px-3 py-2 text-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono text-xs text-[#6b7280]">#{m.matchOrder}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={m.scheduledTime || ''}
                                onChange={e => handleSetTime(m.matchId, e.target.value)}
                                className="border border-[#cbd5e1] rounded-[6px] px-1 py-0.5 text-xs w-20"
                              />
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColor[m.status] || ''}`}>
                                {m.status === 'playing' ? '試合中' : m.status === 'finished' ? '終了' : m.status === 'ready' ? '準備完了' : '待機'}
                              </span>
                            </div>
                          </div>
                          <p className="truncate"><span className="font-medium">{m.player1Name}</span> <span className="text-[#6b7280]">vs</span> <span className="font-medium">{m.player2Name}</span></p>
                          {m.score && <p className="text-xs text-[#2e7d32] font-mono mt-0.5">{m.score}</p>}
                        </div>
                      )) : (
                        <p className="text-xs text-[#6b7280] text-center py-4">割り当てなし</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-[10px] border border-dashed border-[#e0e7ef]">
              <CalendarDays className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-[#6b7280]">
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
