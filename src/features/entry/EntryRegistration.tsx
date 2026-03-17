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

// Bracket layout constants (same as DrawRenderer)
const SLOT_HEIGHT = 44;
const Y_SPACING = 56;
const OFFSET_X = 40;
const OFFSET_Y = 40;

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

  // Filter slots by search (highlight matching, but return all for bracket view)
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

  // Check-in / BYE handlers
  const handleCheckIn = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id) return;

    // If currently withdrawn, restore to active
    if (slot.entry.status === 'withdrawn') {
      await handleRestore(slot);
      return;
    }

    // Toggle: if already confirmed, reset to unconfirmed
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(slot.entryId!)) {
        next.delete(slot.entryId!);
      } else {
        next.add(slot.entryId!);
      }
      return next;
    });
  }, []);

  // 全員受付済みにする（全種目）
  const handleCheckInAll = useCallback(() => {
    const allActiveEntryIds = allEntries
      .filter(e => e.status === 'active')
      .map(e => e.entryId);
    setConfirmedIds(new Set(allActiveEntryIds));
  }, [allEntries]);

  // 全員受付リセット（全種目）
  const handleResetAll = useCallback(() => {
    setConfirmedIds(new Set());
  }, []);

  // 種目ごとに全員受付済みにする
  const handleCheckInEvent = useCallback((eventId: string) => {
    const eventEntryIds = allEntries
      .filter(e => e.eventId === eventId && e.status === 'active')
      .map(e => e.entryId);
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) {
        next.add(id);
      }
      return next;
    });
  }, [allEntries]);

  // 種目ごとに受付リセット
  const handleResetEvent = useCallback((eventId: string) => {
    const eventEntryIds = new Set(
      allEntries.filter(e => e.eventId === eventId).map(e => e.entryId)
    );
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) {
        next.delete(id);
      }
      return next;
    });
  }, [allEntries]);

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

  // ===== Bracket Renderer =====

  const renderBracket = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const event = events.find(e => e.eventId === eventId);
    const isDoubles = event?.type === 'Doubles';
    const SLOT_WIDTH = isDoubles ? 300 : 220;
    const X_SPACING = isDoubles ? 360 : 280;

    // If no draw, fall back to a simple list within a bracket-like container
    if (!draw || draw.drawSize === 0) {
      return renderFallbackList(slots, eventId);
    }

    const drawSize = draw.drawSize;
    const roundsCount = Math.log2(drawSize) + 1;
    const containerWidth = OFFSET_X * 2 + (roundsCount - 1) * X_SPACING + SLOT_WIDTH;
    const containerHeight = OFFSET_Y * 2 + (drawSize - 1) * Y_SPACING + SLOT_HEIGHT;

    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;

    const getY = (r: number, i: number): number => {
      if (r === 0) return OFFSET_Y + i * Y_SPACING;
      return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
    };
    const getX = (r: number): number => OFFSET_X + r * X_SPACING;

    // SVG bracket lines
    const paths: React.ReactNode[] = [];
    for (let r = 0; r < roundsCount - 1; r++) {
      const numMatches = drawSize / Math.pow(2, r + 1);
      for (let m = 0; m < numMatches; m++) {
        const x = getX(r) + SLOT_WIDTH;
        const xNext = getX(r + 1);
        const xMid = (x + xNext) / 2;
        const yTop = getY(r, m * 2) + SLOT_HEIGHT / 2;
        const yBottom = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
        const yMid = getY(r + 1, m) + SLOT_HEIGHT / 2;

        paths.push(
          <path key={`r${r}-m${m}-top`} d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`} fill="none" stroke="#cbd5e1" strokeWidth="2" />,
          <path key={`r${r}-m${m}-bottom`} d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`} fill="none" stroke="#cbd5e1" strokeWidth="2" />,
          <path key={`r${r}-m${m}-conn`} d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`} fill="none" stroke="#cbd5e1" strokeWidth="2" />
        );
      }
    }

    return (
      <div className="relative overflow-auto bg-gray-50/50" style={{ width: '100%', minHeight: 300 }}>
        <div className="relative" style={{ width: containerWidth, height: containerHeight }}>
          <svg className="absolute inset-0 pointer-events-none" width={containerWidth} height={containerHeight}>
            {paths}
          </svg>

          {/* First round slots with check-in controls */}
          {slots.map((slot, index) => {
            const x = getX(0);
            const y = getY(0, index);

            const isOriginalBye = slot.isBye && !slot.entry;
            const isWithdrawn = slot.entry?.status === 'withdrawn';
            const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
            const isDimmed = hasSearch && !isOriginalBye && slot.entry && !searchMatches.has(slot.drawPosition);

            // Status-based styling
            let borderClass = 'border-gray-300';
            let bgClass = 'bg-white';
            if (isOriginalBye) {
              borderClass = 'border-dashed border-gray-300';
              bgClass = 'bg-gray-50';
            } else if (isWithdrawn) {
              borderClass = 'border-red-400';
              bgClass = 'bg-red-50';
            } else if (isConfirmed) {
              borderClass = 'border-green-500';
              bgClass = 'bg-green-50';
            }

            return (
              <div
                key={`slot-${slot.drawPosition}`}
                className={`absolute flex items-center border rounded-md select-none transition-all
                  ${borderClass} ${bgClass}
                  ${isDimmed ? 'opacity-30' : ''}
                `}
                style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
              >
                {isOriginalBye ? (
                  // Original BYE slot
                  <div className="flex items-center w-full px-2 gap-1.5">
                    <div className="w-5 text-[10px] font-mono text-gray-400 text-center shrink-0">{slot.drawPosition}</div>
                    <div className="text-sm text-gray-400 italic whitespace-nowrap">BYE</div>
                  </div>
                ) : slot.entry ? (
                  // Player slot with check-in
                  <div className="flex items-center w-full h-full">
                    {/* Clickable main area for check-in toggle */}
                    <button
                      onClick={() => handleCheckIn(slot)}
                      className="flex items-center flex-1 min-w-0 h-full px-2 gap-1.5 hover:bg-black/5 active:bg-black/10 transition-colors rounded-l-md"
                      title={isWithdrawn ? '復元する (クリック)' : isConfirmed ? '受付済 → 未確認に戻す' : '受付する'}
                    >
                      {/* Status dot */}
                      <div className="shrink-0">
                        {isWithdrawn ? (
                          <span className="block w-3 h-3 rounded-full bg-red-500" />
                        ) : isConfirmed ? (
                          <span className="block w-3 h-3 rounded-full bg-green-500" />
                        ) : (
                          <span className="block w-3 h-3 rounded-full bg-gray-300" />
                        )}
                      </div>
                      {/* Position number */}
                      <div className="w-5 text-[10px] font-mono text-gray-400 text-center shrink-0">{slot.drawPosition}</div>
                      {/* Seed */}
                      {slot.seed > 0 && (
                        <div className="w-5 h-5 shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                          {slot.seed}
                        </div>
                      )}
                      {/* Player name */}
                      <div
                        className={`flex-1 text-sm font-medium truncate whitespace-nowrap text-left ${
                          isWithdrawn ? 'line-through text-red-400' : 'text-gray-800'
                        }`}
                        title={slot.partnerName ? `${slot.playerName} / ${slot.partnerName}` : slot.playerName}
                      >
                        {slot.playerName}
                        {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
                      </div>
                      {/* Affiliation */}
                      {!isWithdrawn && slot.affiliation && (
                        <div className={`text-[10px] text-gray-500 truncate shrink-0 ${isDoubles ? 'max-w-[80px]' : 'max-w-[50px]'}`} title={slot.affiliation}>
                          {slot.affiliation}
                        </div>
                      )}
                    </button>
                    {/* BYE / Restore button */}
                    <div className="shrink-0 flex items-center h-full border-l border-gray-200">
                      {isWithdrawn ? (
                        <button
                          onClick={() => handleRestore(slot)}
                          className="flex items-center justify-center w-8 h-full text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors rounded-r-md"
                          title="復元する"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkBye(slot)}
                          className="flex items-center justify-center w-8 h-full text-red-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100 transition-colors rounded-r-md"
                          title="BYEにする"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  // Empty slot
                  <div className="flex items-center w-full px-2 gap-1.5">
                    <div className="w-5 text-[10px] font-mono text-gray-400 text-center shrink-0">{slot.drawPosition}</div>
                    <div className="text-sm text-gray-300 whitespace-nowrap">-</div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Subsequent round slots (read-only, just placeholder boxes) */}
          {Array.from({ length: roundsCount - 1 }).map((_, rIdx) => {
            const r = rIdx + 1;
            const numNodes = drawSize / Math.pow(2, r);
            const isWinner = r === roundsCount - 1;

            return Array.from({ length: numNodes }).map((_, m) => {
              const x = getX(r);
              const y = getY(r, m);

              return (
                <div
                  key={`empty-r${r}-m${m}`}
                  className={`absolute flex items-center px-3 border shadow-sm rounded-md
                    ${isWinner
                      ? 'bg-white border-gray-200 border-b-2 border-b-indigo-500'
                      : 'bg-white/60 border-gray-200 border-b-2 border-b-gray-400'
                    }
                  `}
                  style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
                >
                  {isWinner ? (
                    <div className="flex items-center justify-center w-full">
                      <div className="text-indigo-600 font-bold text-sm tracking-widest">WINNER</div>
                    </div>
                  ) : (
                    <div className="text-gray-300 text-sm" />
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>
    );
  };

  // Fallback list when no draw exists
  const renderFallbackList = (slots: CheckInSlot[], _eventId: string) => {
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;

    if (slots.length === 0) {
      return (
        <div className="py-8 text-center text-gray-400 text-sm">
          ドローデータがありません
        </div>
      );
    }

    return (
      <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
        {slots.map(slot => {
          const isDimmed = hasSearch && slot.entry && !searchMatches.has(slot.drawPosition);
          const isWithdrawn = slot.entry?.status === 'withdrawn';
          const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;

          if (!slot.entry && slot.isBye) {
            return (
              <div key={`bye-${slot.drawPosition}`} className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50 opacity-50">
                <div className="w-10 text-center text-xs font-mono text-gray-400">{slot.drawPosition}</div>
                <div className="flex-1 text-sm text-gray-400 italic">BYE</div>
              </div>
            );
          }
          if (!slot.entry) return null;

          let borderColor = 'border-l-transparent';
          let bgColor = '';
          if (isWithdrawn) { borderColor = 'border-l-red-400'; bgColor = 'bg-red-50/60'; }
          else if (isConfirmed) { borderColor = 'border-l-green-500'; bgColor = 'bg-green-50/40'; }

          return (
            <div
              key={slot.entryId}
              className={`flex items-center px-3 py-2.5 border-b border-gray-100 border-l-4 transition-colors ${borderColor} ${bgColor} ${isDimmed ? 'opacity-30' : ''}`}
            >
              <div className="w-10 text-center text-xs font-mono text-gray-500 shrink-0">{slot.drawPosition}</div>
              <div className="w-10 text-center shrink-0">
                {slot.seed > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{slot.seed}</span>}
              </div>
              <div className={`flex-1 min-w-0 ${isWithdrawn ? 'line-through opacity-60' : ''}`}>
                <div className="font-semibold text-sm text-gray-900 truncate">
                  {slot.playerName}
                  {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
                </div>
                <div className="text-xs text-gray-500 truncate">{slot.affiliation}</div>
              </div>
              <div className="shrink-0 mr-2">
                {isWithdrawn ? (
                  <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">BYE</span>
                ) : isConfirmed ? (
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">受付済</span>
                ) : (
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">未確認</span>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {isWithdrawn ? (
                  <button onClick={() => handleRestore(slot)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200 transition-colors text-sm font-medium touch-manipulation" title="復元する">
                    <RotateCcw className="w-4 h-4" /><span className="hidden sm:inline">復元</span>
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleCheckIn(slot)} className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors text-sm font-medium touch-manipulation ${isConfirmed ? 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200'}`} title="チェックイン">
                      <UserCheck className="w-4 h-4" /><span className="hidden sm:inline">{isConfirmed ? '済' : '受付'}</span>
                    </button>
                    <button onClick={() => handleMarkBye(slot)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 transition-colors text-sm font-medium touch-manipulation" title="不参加 / BYE">
                      <UserX className="w-4 h-4" /><span className="hidden sm:inline">BYE</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
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
        {/* Event header (collapsible in all-events view) */}
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
                title="この種目を全員受付済みにする"
              >
                <UserCheck className="w-3 h-3" />
                全員受付
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleResetEvent(eventId); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                title="この種目の受付をリセット"
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

        {!isCollapsed && renderBracket(eventId, slots)}
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

  // ===== Render =====

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
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${
                  !showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                個別表示
              </button>
              <button
                onClick={() => setShowAllEvents(true)}
                className={`px-3 py-1.5 flex items-center gap-1 font-medium transition-colors ${
                  showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
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
                className="border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium w-56"
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
              className="flex items-center gap-2 bg-white border border-border-main text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors whitespace-nowrap"
              title="Excel/CSVからエントリーデータを一括で読み込みます"
            >
              <Upload className="w-4 h-4 text-primary-500" />
              <span className="hidden md:inline">インポート</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="選手名・所属で検索 (ブラケット内でハイライト表示)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/15 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Summary stats + bulk actions */}
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
                <UserCheck className="w-3.5 h-3.5" />
                全員受付済み
              </button>
              <button
                onClick={showAllEvents ? handleResetAll : () => selectedEventId && handleResetEvent(selectedEventId)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                リセット
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        {(showAllEvents || selectedEventId) && (
          <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />クリックで受付済み</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />再クリックで未確認に戻す</span>
            <span className="flex items-center gap-1"><UserX className="w-3 h-3 text-red-400" />右端ボタンでBYE</span>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
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
