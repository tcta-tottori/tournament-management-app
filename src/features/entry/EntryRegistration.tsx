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
  const getSearchMatchSet = useCallback((slots: CheckInSlot[]): Set<number> => {
    if (!searchQuery) return new Set();
    const q = searchQuery.toLowerCase();
    return new Set(
      slots
        .filter(s =>
          s.playerName.toLowerCase().includes(q) ||
          s.partnerName.toLowerCase().includes(q) ||
          s.affiliation.toLowerCase().includes(q)
        )
        .map(s => s.drawPosition)
    );
  }, [searchQuery]);

  // Check-in handlers
  const handleCheckIn = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id) return;
    if (slot.entry.status === 'withdrawn') {
      await handleRestore(slot);
      return;
    }
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(slot.entryId!)) next.delete(slot.entryId!);
      else next.add(slot.entryId!);
      return next;
    });
  }, []);

  const handleCheckInAll = useCallback(() => {
    const allActiveEntryIds = allEntries.filter(e => e.status === 'active').map(e => e.entryId);
    setConfirmedIds(new Set(allActiveEntryIds));
  }, [allEntries]);

  const handleResetAll = useCallback(() => { setConfirmedIds(new Set()); }, []);

  const handleCheckInEvent = useCallback((eventId: string) => {
    const eventEntryIds = allEntries.filter(e => e.eventId === eventId && e.status === 'active').map(e => e.entryId);
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) next.add(id);
      return next;
    });
  }, [allEntries]);

  const handleResetEvent = useCallback((eventId: string) => {
    const eventEntryIds = new Set(allEntries.filter(e => e.eventId === eventId).map(e => e.entryId));
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) next.delete(id);
      return next;
    });
  }, [allEntries]);

  const handleMarkBye = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;
    await db.entries.update(slot.entry.id, { status: 'withdrawn' });
    const draw = drawMap.get(slot.entry.eventId);
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s => s.entryId === slot.entryId ? { ...s, isBye: true } : s);
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};
        if (isPlayer1) { updates.player1Name = 'BYE'; updates.player1Affiliation = ''; }
        else { updates.player2Name = 'BYE'; updates.player2Affiliation = ''; }
        const opponentId = isPlayer1 ? match.player2EntryId : match.player1EntryId;
        if (opponentId && match.status !== 'finished' && match.status !== 'playing') {
          updates.status = 'walkover'; updates.winnerEntryId = opponentId;
        }
        await db.matches.update(match.id!, updates);
      }
    }
    setConfirmedIds(prev => { const next = new Set(prev); next.delete(slot.entryId!); return next; });
  }, [drawMap]);

  const handleRestore = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;
    await db.entries.update(slot.entry.id, { status: 'active' });
    const draw = drawMap.get(slot.entry.eventId);
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s => s.entryId === slot.entryId ? { ...s, isBye: false } : s);
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    const p1 = playerMap.get(slot.entry.playerId);
    const p2 = slot.entry.partnerId ? playerMap.get(slot.entry.partnerId) : null;
    const restoredName = p2 ? `${p1?.name || ''} / ${p2.name}` : (p1?.name || '');
    const restoredAffiliation = p1?.affiliation || '';
    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};
        if (isPlayer1) { updates.player1Name = restoredName; updates.player1Affiliation = restoredAffiliation; }
        else { updates.player2Name = restoredName; updates.player2Affiliation = restoredAffiliation; }
        if (match.status === 'walkover') { updates.status = 'waiting'; updates.winnerEntryId = null; }
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

  // ===== Table-based draw view with bracket lines =====
  const renderDrawTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;

    if (slots.length === 0) {
      return (
        <div className="py-8 text-center text-gray-400 text-sm">
          ドローデータがありません
        </div>
      );
    }

    // Split into upper and lower halves
    const halfSize = Math.ceil(slots.length / 2);
    const topHalf = slots.slice(0, halfSize);
    const bottomHalf = slots.slice(halfSize);

    // halfSlots内の相対index(0始まり)でペア判定
    const renderSlotRow = (slot: CheckInSlot, idxInHalf: number) => {
      const isOriginalBye = slot.isBye && !slot.entry;
      const isWithdrawn = slot.entry?.status === 'withdrawn';
      const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
      const isDimmed = hasSearch && !isOriginalBye && slot.entry && !searchMatches.has(slot.drawPosition);
      const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);
      const isTopOfPair = idxInHalf % 2 === 0;
      const isBottomOfPair = idxInHalf % 2 === 1;
      const matchNum = Math.floor(idxInHalf / 2) + 1;

      let rowBg = '';
      let statusBadge: React.ReactNode = null;

      if (isWithdrawn) {
        rowBg = 'bg-red-50/60';
        statusBadge = <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">BYE</span>;
      } else if (isConfirmed) {
        rowBg = 'bg-emerald-50/60';
        statusBadge = <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">受付済</span>;
      } else if (slot.entry) {
        statusBadge = <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">未確認</span>;
      }

      return (
        <tr
          key={`slot-${slot.drawPosition}`}
          className={`transition-colors hover:bg-primary-50/30
            ${rowBg}
            ${isDimmed ? 'opacity-25' : ''}
            ${isHighlighted ? 'ring-1 ring-inset ring-blue-400 bg-blue-50/50' : ''}
            ${isBottomOfPair ? 'border-b-2 border-b-gray-200' : 'border-b border-b-gray-100'}
          `}
        >
          {/* No */}
          <td className="py-2 px-2 text-center text-xs font-mono text-gray-400 w-10">{slot.drawPosition}</td>
          {/* Seed */}
          <td className="py-2 px-1 text-center w-8">
            {slot.seed > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full shadow-sm">{slot.seed}</span>
            )}
          </td>
          {/* Name */}
          <td className="py-2 px-3">
            {isOriginalBye ? (
              <span className="text-sm text-gray-400 italic">BYE</span>
            ) : slot.entry ? (
              <button
                onClick={() => handleCheckIn(slot)}
                className="text-left w-full group"
                title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}
              >
                <span className={`text-sm font-medium ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                  {slot.playerName}
                  {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
                </span>
              </button>
            ) : (
              <span className="text-sm text-gray-300">---</span>
            )}
          </td>
          {/* Affiliation */}
          <td className="py-2 px-2 text-xs text-gray-500 max-w-[120px] truncate hidden sm:table-cell">
            {!isOriginalBye && !isWithdrawn && slot.affiliation}
          </td>
          {/* Status */}
          <td className="py-2 px-2 text-center w-16">
            {statusBadge}
          </td>
          {/* Actions */}
          <td className="py-2 px-1 text-center w-10">
            {slot.entry && !isOriginalBye && (
              isWithdrawn ? (
                <button
                  onClick={() => handleRestore(slot)}
                  className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                  title="復元する"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => handleMarkBye(slot)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="BYEにする"
                >
                  <UserX className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </td>
          {/* Bracket line */}
          <td
            className="w-8 p-0 relative"
            style={{
              borderRight: '2px solid #1b4d3e',
              ...(isTopOfPair ? { borderBottom: '2px solid #1b4d3e' } : {}),
              ...(isBottomOfPair ? { borderTop: '2px solid #1b4d3e' } : {}),
            }}
          >
            {/* Match number label between pairs */}
            {isTopOfPair && (
              <span
                className="absolute text-[9px] font-bold text-primary-600 whitespace-nowrap"
                style={{ right: -18, top: '100%', transform: 'translateY(-50%)' }}
              >
                {matchNum}
              </span>
            )}
          </td>
        </tr>
      );
    };

    const renderHalfTable = (title: string, halfSlots: CheckInSlot[], isUpper: boolean) => (
      <div className="flex-1 min-w-0">
        <div
          className="px-4 py-2.5 border-b-2 flex items-center justify-between"
          style={{
            background: isUpper
              ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)'
              : 'linear-gradient(135deg, #eff6ff, #eef2ff)',
            borderBottomColor: isUpper ? '#86efac' : '#93c5fd',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white shadow-sm"
              style={{ background: isUpper ? '#16a34a' : '#2563eb' }}
            >
              {isUpper ? '上' : '下'}
            </span>
            <h4 className="text-sm font-bold" style={{ color: isUpper ? '#15803d' : '#1d4ed8' }}>
              {title}
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-medium">
              {halfSlots.filter(s => s.entry && s.entry.status !== 'withdrawn').length}名
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="bg-gray-50/80">
                <th className="py-2 px-2 text-[10px] font-semibold text-gray-500 w-10 text-center border-b-2 border-gray-200">No</th>
                <th className="py-2 px-1 text-[10px] font-semibold text-gray-500 w-8 text-center border-b-2 border-gray-200">S</th>
                <th className="py-2 px-3 text-[10px] font-semibold text-gray-500 border-b-2 border-gray-200">氏名</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-gray-500 hidden sm:table-cell border-b-2 border-gray-200">所属</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-gray-500 w-16 text-center border-b-2 border-gray-200">状態</th>
                <th className="py-2 px-1 text-[10px] font-semibold text-gray-500 w-10 text-center border-b-2 border-gray-200">操作</th>
                <th className="py-2 w-8 border-b-2 border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {halfSlots.map((slot, idx) => renderSlotRow(slot, idx))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div>
        {/* Draw size info bar */}
        {draw && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-primary-50/30 border-b border-gray-200 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              ドロー <strong className="text-gray-800">{draw.drawSize}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              エントリー <strong className="text-gray-800">{slots.filter(s => s.entry && !s.isBye).length}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              BYE <strong className="text-gray-800">{slots.filter(s => s.isBye || (s.entry?.status === 'withdrawn')).length}</strong>
            </span>
          </div>
        )}

        {/* Two-column table layout (top half / bottom half) */}
        <div className="flex flex-col lg:flex-row">
          {renderHalfTable('上の山', topHalf, true)}
          <div className="hidden lg:block w-px bg-gray-200" />
          <div className="lg:hidden h-px bg-gray-200" />
          {renderHalfTable('下の山', bottomHalf, false)}
        </div>
      </div>
    );
  };

  // ===== Event Section =====
  const renderEventSection = (eventId: string, eventName: string, forceShow = false) => {
    const slots = buildSlotsForEvent(eventId);
    const stats = computeStats(slots);
    const isCollapsed = collapsedEvents.has(eventId);

    if (!forceShow && searchQuery) {
      const searchMatches = getSearchMatchSet(slots);
      if (searchMatches.size === 0 && searchQuery.length > 0) return null;
    }

    return (
      <div key={eventId} className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
        {/* Event header */}
        {showAllEvents && (
          <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
            <button
              onClick={() => toggleCollapse(eventId)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              <h3 className="font-bold text-primary-600 text-sm">{eventName}</h3>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={(e) => { e.stopPropagation(); handleCheckInEvent(eventId); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 transition-colors"
              >
                <UserCheck className="w-3 h-3" />全員受付
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleResetEvent(eventId); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <span className="bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">{stats.checkedIn}</span>
              <span className="text-gray-500">/</span>
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">{stats.total}</span>
              {stats.absent > 0 && (
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{stats.absent} BYE</span>
              )}
            </div>
          </div>
        )}

        {!isCollapsed && renderDrawTable(eventId, slots)}
      </div>
    );
  };

  // Overall stats
  const allSlots = showAllEvents
    ? events.flatMap(e => buildSlotsForEvent(e.eventId))
    : selectedEventId
      ? buildSlotsForEvent(selectedEventId)
      : [];
  const overallStats = computeStats(allSlots);

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
    <div className="max-w-full mx-auto space-y-4 pb-6 h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary-500" />
            エントリー受付
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex rounded-lg border border-border-main overflow-hidden text-sm">
              <button
                onClick={() => setShowAllEvents(false)}
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${!showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Eye className="w-3.5 h-3.5" />個別表示
              </button>
              <button
                onClick={() => setShowAllEvents(true)}
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-3.5 h-3.5" />すべて表示
              </button>
            </div>

            {!showAllEvents && (
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium w-56"
              >
                <option value="">-- 種目を選択 --</option>
                {events.map(e => (
                  <option key={e.eventId} value={e.eventId}>{e.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-white border border-border-main text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4 text-primary-500" />
              <span className="hidden md:inline">インポート</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="選手名・所属で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/15 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Stats + bulk actions */}
        {(showAllEvents || selectedEventId) && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-4 text-sm">
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
            <div className="flex items-center gap-2">
              <button
                onClick={showAllEvents ? handleCheckInAll : () => selectedEventId && handleCheckInEvent(selectedEventId)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" />全員受付済み
              </button>
              <button
                onClick={showAllEvents ? handleResetAll : () => selectedEventId && handleResetEvent(selectedEventId)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />リセット
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        {(showAllEvents || selectedEventId) && (
          <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />名前クリックで受付</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />再クリックで取消</span>
            <span className="flex items-center gap-1"><UserX className="w-3 h-3 text-red-400" />操作列でBYE</span>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0 px-1">
        {showAllEvents ? (
          events.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-border-main text-gray-500 min-h-[400px]">
              <AlertCircle className="w-16 h-16 mb-4 text-gray-200" />
              <p className="font-semibold">種目が登録されていません</p>
            </div>
          ) : (
            events.map(e => renderEventSection(e.eventId, e.name))
          )
        ) : selectedEventId ? (
          renderEventSection(selectedEventId, events.find(e => e.eventId === selectedEventId)?.name || '', true)
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-border-main text-gray-500 min-h-[400px]">
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
