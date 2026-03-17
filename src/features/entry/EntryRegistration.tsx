import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Entry } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CheckSquare, UserCheck, UserX, Search, Eye, List, Upload, AlertCircle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import EntryImport from './EntryImport';

type CheckInSlot = {
  drawPosition: number;
  seed: number;
  entryId: string | null;
  isBye: boolean;
  entry: Entry | null;
  playerName: string;
  partnerName: string;
  affiliation: string;
};

export default function EntryRegistration() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());

  // Queries
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const allEntries = useLiveQuery(
    () => currentTournamentId
      ? db.entries.where('eventId').anyOf(events.map(e => e.eventId)).toArray()
      : [],
    [events]
  ) || [];

  const allDraws = useLiveQuery(
    () => currentTournamentId
      ? db.draws.where('eventId').anyOf(events.map(e => e.eventId)).toArray()
      : [],
    [events]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];
  const playerMap = useMemo(() => new Map(players.map(p => [p.playerId, p])), [players]);

  const entryMap = useMemo(() => new Map(allEntries.map(e => [e.entryId, e])), [allEntries]);
  const drawMap = useMemo(() => new Map(allDraws.map(d => [d.eventId, d])), [allDraws]);

  // Build check-in slots for an event
  const buildSlotsForEvent = useCallback((eventId: string): CheckInSlot[] => {
    const draw = drawMap.get(eventId);
    const eventEntries = allEntries.filter(e => e.eventId === eventId);

    if (draw && draw.slots.length > 0) {
      // Use draw order
      return draw.slots
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(slot => {
          const entry = slot.entryId ? entryMap.get(slot.entryId) || null : null;
          let playerName = '';
          let partnerName = '';
          let affiliation = '';

          if (entry) {
            const p1 = playerMap.get(entry.playerId);
            playerName = p1?.name || '(不明)';
            affiliation = p1?.affiliation || '';
            if (entry.partnerId) {
              const p2 = playerMap.get(entry.partnerId);
              partnerName = p2?.name || '';
              if (p2?.affiliation && p2.affiliation !== affiliation) {
                affiliation = `${affiliation} / ${p2.affiliation}`;
              }
            }
          }

          return {
            drawPosition: slot.position,
            seed: slot.seed,
            entryId: slot.entryId,
            isBye: slot.isBye,
            entry,
            playerName: slot.isBye && !entry ? 'BYE' : playerName,
            partnerName,
            affiliation,
          };
        });
    }

    // No draw - fallback to entries list
    return eventEntries.map((entry, idx) => {
      const p1 = playerMap.get(entry.playerId);
      const p2 = entry.partnerId ? playerMap.get(entry.partnerId) : null;
      return {
        drawPosition: idx + 1,
        seed: entry.seedNo || 0,
        entryId: entry.entryId,
        isBye: false,
        entry,
        playerName: p1?.name || '(不明)',
        partnerName: p2?.name || '',
        affiliation: p1?.affiliation || '',
      };
    });
  }, [drawMap, allEntries, entryMap, playerMap]);

  // Filter slots by search
  const filterSlots = useCallback((slots: CheckInSlot[]): CheckInSlot[] => {
    if (!searchQuery) return slots;
    const q = searchQuery.toLowerCase();
    return slots.filter(s =>
      s.playerName.toLowerCase().includes(q) ||
      s.partnerName.toLowerCase().includes(q) ||
      s.affiliation.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Check-in / BYE handlers
  const handleCheckIn = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id) return;

    // If currently withdrawn, restore to active
    if (slot.entry.status === 'withdrawn') {
      await handleRestore(slot);
      return;
    }

    // Mark as confirmed
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.add(slot.entryId!);
      return next;
    });
  }, []);

  const handleMarkBye = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;

    // Update entry status
    await db.entries.update(slot.entry.id, { status: 'withdrawn' });

    // Update draw slot isBye
    const draw = drawMap.get(slot.entry.eventId);
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s =>
        s.entryId === slot.entryId ? { ...s, isBye: true } : s
      );
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }

    // Update affected matches
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};

        if (isPlayer1) {
          updates.player1Name = 'BYE';
          updates.player1Affiliation = '';
        } else {
          updates.player2Name = 'BYE';
          updates.player2Affiliation = '';
        }

        // If opponent exists and match hasn't started, mark as walkover
        const opponentId = isPlayer1 ? match.player2EntryId : match.player1EntryId;
        if (opponentId && match.status !== 'finished' && match.status !== 'playing') {
          updates.status = 'walkover';
          updates.winnerEntryId = opponentId;
        }

        await db.matches.update(match.id!, updates);
      }
    }

    // Remove from confirmed
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.delete(slot.entryId!);
      return next;
    });
  }, [drawMap]);

  const handleRestore = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;

    // Restore entry status
    await db.entries.update(slot.entry.id, { status: 'active' });

    // Restore draw slot
    const draw = drawMap.get(slot.entry.eventId);
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s =>
        s.entryId === slot.entryId ? { ...s, isBye: false } : s
      );
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }

    // Restore affected matches
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    const p1 = playerMap.get(slot.entry.playerId);
    const p2 = slot.entry.partnerId ? playerMap.get(slot.entry.partnerId) : null;
    const restoredName = p2 ? `${p1?.name || ''} / ${p2.name}` : (p1?.name || '');
    const restoredAffiliation = p1?.affiliation || '';

    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};

        if (isPlayer1) {
          updates.player1Name = restoredName;
          updates.player1Affiliation = restoredAffiliation;
        } else {
          updates.player2Name = restoredName;
          updates.player2Affiliation = restoredAffiliation;
        }

        if (match.status === 'walkover') {
          updates.status = 'waiting';
          updates.winnerEntryId = null;
        }

        await db.matches.update(match.id!, updates);
      }
    }
  }, [drawMap, playerMap]);

  // Summary stats
  const computeStats = useCallback((slots: CheckInSlot[]) => {
    const playerSlots = slots.filter(s => s.entry && !(!s.entry && s.isBye));
    const total = playerSlots.length;
    const checkedIn = playerSlots.filter(s => s.entry && s.entry.status === 'active' && confirmedIds.has(s.entryId!)).length;
    const absent = playerSlots.filter(s => s.entry && s.entry.status === 'withdrawn').length;
    const remaining = total - checkedIn - absent;
    return { total, checkedIn, absent, remaining };
  }, [confirmedIds]);

  const toggleCollapse = (eventId: string) => {
    setCollapsedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  // ===== Render =====

  if (!currentTournamentId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#6b7280] h-full">
        <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
        <h2 className="text-xl font-bold mb-2">大会が選択されていません</h2>
        <p className="text-sm">データ管理画面で対象の大会を選択するか、新しく作成してください。</p>
      </div>
    );
  }

  const renderSlotRow = (slot: CheckInSlot) => {
    if (!slot.entry && slot.isBye) {
      // Original BYE slot (no entry) - just show as BYE
      return (
        <div
          key={`bye-${slot.drawPosition}`}
          className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50 opacity-50"
        >
          <div className="w-10 text-center text-xs font-mono text-gray-400">{slot.drawPosition}</div>
          <div className="w-10 text-center text-xs text-gray-300">{slot.seed > 0 ? `[${slot.seed}]` : ''}</div>
          <div className="flex-1 text-sm text-gray-400 italic">BYE</div>
        </div>
      );
    }

    if (!slot.entry) return null;

    const isWithdrawn = slot.entry.status === 'withdrawn';
    const isConfirmed = confirmedIds.has(slot.entryId!);

    let borderColor = 'border-l-transparent';
    let bgColor = '';
    if (isWithdrawn) {
      borderColor = 'border-l-red-400';
      bgColor = 'bg-red-50/60';
    } else if (isConfirmed) {
      borderColor = 'border-l-green-500';
      bgColor = 'bg-green-50/40';
    }

    return (
      <div
        key={slot.entryId}
        className={`flex items-center px-3 py-2.5 border-b border-gray-100 border-l-4 transition-colors ${borderColor} ${bgColor}`}
      >
        {/* Draw number */}
        <div className="w-10 text-center text-xs font-mono text-gray-500 shrink-0">{slot.drawPosition}</div>

        {/* Seed */}
        <div className="w-10 text-center shrink-0">
          {slot.seed > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{slot.seed}</span>
          )}
        </div>

        {/* Player info */}
        <div className={`flex-1 min-w-0 ${isWithdrawn ? 'line-through opacity-60' : ''}`}>
          <div className="font-semibold text-sm text-[#111827] truncate">
            {slot.playerName}
            {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
          </div>
          <div className="text-xs text-gray-500 truncate">{slot.affiliation}</div>
        </div>

        {/* Status badge */}
        <div className="shrink-0 mr-2">
          {isWithdrawn ? (
            <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">BYE</span>
          ) : isConfirmed ? (
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">受付済</span>
          ) : (
            <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">未確認</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-1.5">
          {isWithdrawn ? (
            <button
              onClick={() => handleRestore(slot)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200 transition-colors text-sm font-medium touch-manipulation"
              title="復元する"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">復元</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleCheckIn(slot)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors text-sm font-medium touch-manipulation ${
                  isConfirmed
                    ? 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200'
                }`}
                title="チェックイン"
              >
                <UserCheck className="w-4 h-4" />
                <span className="hidden sm:inline">{isConfirmed ? '済' : '受付'}</span>
              </button>
              <button
                onClick={() => handleMarkBye(slot)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 transition-colors text-sm font-medium touch-manipulation"
                title="不参加 / BYE"
              >
                <UserX className="w-4 h-4" />
                <span className="hidden sm:inline">BYE</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderEventSection = (eventId: string, eventName: string, forceShow = false) => {
    const slots = buildSlotsForEvent(eventId);
    const filtered = filterSlots(slots);
    const stats = computeStats(slots);
    const isCollapsed = collapsedEvents.has(eventId);

    if (!forceShow && searchQuery && filtered.length === 0) return null;

    return (
      <div key={eventId} className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden">
        {/* Event header (collapsible in all-events view) */}
        {showAllEvents && (
          <button
            onClick={() => toggleCollapse(eventId)}
            className="w-full bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex items-center justify-between hover:bg-[#dcedc8] transition-colors"
          >
            <div className="flex items-center gap-2">
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              <h3 className="font-bold text-[#1b5e20] text-sm">{eventName}</h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">{stats.checkedIn}</span>
              <span className="text-gray-500">/</span>
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">{stats.total}</span>
              {stats.absent > 0 && (
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{stats.absent} BYE</span>
              )}
            </div>
          </button>
        )}

        {!isCollapsed && (
          <>
            {/* Column header */}
            <div className="flex items-center px-3 py-1.5 bg-gray-50 border-b text-xs text-gray-500 font-medium">
              <div className="w-10 text-center">No.</div>
              <div className="w-10 text-center">Seed</div>
              <div className="flex-1">選手名 (所属)</div>
              <div className="w-14 text-center">状態</div>
              <div className="w-32 text-center">操作</div>
            </div>

            {/* Slot rows */}
            <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  {searchQuery ? '検索条件に一致する選手がいません' : 'ドローデータがありません'}
                </div>
              ) : (
                filtered.map(renderSlotRow)
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // Compute overall stats
  const allSlots = showAllEvents
    ? events.flatMap(e => buildSlotsForEvent(e.eventId))
    : selectedEventId
      ? buildSlotsForEvent(selectedEventId)
      : [];
  const overallStats = computeStats(allSlots);

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-6 h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <header className="bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef] shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#2e7d32]" />
            エントリー受付
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-lg border border-[#cbd5e1] overflow-hidden text-sm">
              <button
                onClick={() => setShowAllEvents(false)}
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${
                  !showAllEvents ? 'bg-[#2e7d32] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                個別表示
              </button>
              <button
                onClick={() => setShowAllEvents(true)}
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${
                  showAllEvents ? 'bg-[#2e7d32] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                すべて表示
              </button>
            </div>

            {/* Event selector (only in individual view) */}
            {!showAllEvents && (
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="border-[#cbd5e1] rounded-[6px] shadow-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 text-sm px-3 py-2 bg-white border outline-none font-medium w-56"
              >
                <option value="">-- 種目を選択 --</option>
                {events.map(e => (
                  <option key={e.eventId} value={e.eventId}>{e.name}</option>
                ))}
              </select>
            )}

            {/* Import button */}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-white border border-[#cbd5e1] text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors whitespace-nowrap"
              title="Excel/CSVからエントリーデータを一括で読み込みます"
            >
              <Upload className="w-4 h-4 text-[#2e7d32]" />
              <span className="hidden md:inline">インポート</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[#6b7280]" />
            </div>
            <input
              type="text"
              placeholder="選手名・所属で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-[#cbd5e1] rounded-[6px] text-sm focus:outline-none focus:ring-[3px] focus:ring-[#2e7d32]/15 focus:border-[#2e7d32]"
            />
          </div>
        </div>

        {/* Summary stats */}
        {(showAllEvents || selectedEventId) && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">合計:</span>
              <span className="font-bold text-gray-800">{overallStats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              <span className="text-gray-500">受付済:</span>
              <span className="font-bold text-green-700">{overallStats.checkedIn}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              <span className="text-gray-500">BYE:</span>
              <span className="font-bold text-red-600">{overallStats.absent}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
              <span className="text-gray-500">未確認:</span>
              <span className="font-bold text-gray-600">{overallStats.remaining}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {showAllEvents ? (
          // All events view
          events.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] text-[#6b7280] min-h-[400px]">
              <AlertCircle className="w-16 h-16 mb-4 text-gray-200" />
              <p className="font-semibold">種目が登録されていません</p>
            </div>
          ) : (
            events.map(e => renderEventSection(e.eventId, e.name))
          )
        ) : selectedEventId ? (
          // Individual event view
          renderEventSection(selectedEventId, events.find(e => e.eventId === selectedEventId)?.name || '', true)
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] text-[#6b7280] min-h-[400px]">
            <AlertCircle className="w-16 h-16 mb-4 text-gray-200" />
            <p className="font-semibold">上部のドロップダウンから対象種目を選択してください</p>
          </div>
        )}
      </div>

      {showImportModal && (
        <EntryImport onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}
