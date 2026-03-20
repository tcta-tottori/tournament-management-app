import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Entry, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CheckSquare, UserCheck, UserX, Search, Eye, List, AlertCircle, ChevronDown, ChevronRight, ChevronUp, RotateCcw, Lock } from 'lucide-react';

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

// === BYE再配置ユーティリティ ===
function generateSeedPositions(drawSize: number): number[] {
  const positions = [1, drawSize];
  let count = 2;
  let sectionSize = drawSize;
  while (count < drawSize) {
    sectionSize /= 2;
    if (sectionSize < 2) break;
    const newPositions: number[] = [];
    for (let i = 0; i < count; i++) {
      const pos = positions[i];
      const secIdx = Math.floor((pos - 1) / sectionSize);
      const secStart = secIdx * sectionSize + 1;
      const secEnd = secStart + sectionSize - 1;
      newPositions.push(secStart + secEnd - pos);
    }
    positions.push(...newPositions);
    count *= 2;
  }
  return positions;
}

function generateByePositions(drawSize: number, numByes: number): number[] {
  const seedPositions = generateSeedPositions(drawSize);
  const byePositions: number[] = [];
  for (let i = 0; i < numByes && i < seedPositions.length; i++) {
    const p = seedPositions[i];
    byePositions.push(p % 2 === 1 ? p + 1 : p - 1);
  }
  return byePositions;
}

function redistributeByes(slots: CheckInSlot[], drawSize: number): CheckInSlot[] {
  const entrySlots = slots.filter(s => !(s.isBye && !s.entry));
  const numByes = drawSize - entrySlots.length;
  if (numByes <= 0) return slots;

  const halfPos = drawSize / 2;
  const hasByeInFirstHalf = slots.some(s => s.isBye && !s.entry && s.drawPosition <= halfPos);
  if (hasByeInFirstHalf) {
    if (slots.length >= drawSize) return slots;
    const existingPos = new Set(slots.map(s => s.drawPosition));
    const result = [...slots];
    for (let p = 1; p <= drawSize; p++) {
      if (!existingPos.has(p)) {
        result.push({ drawPosition: p, seed: 0, entryId: null, isBye: true, entry: null, playerName: 'BYE', partnerName: '', affiliation: '' });
      }
    }
    return result.sort((a, b) => a.drawPosition - b.drawPosition);
  }

  const byePositions = generateByePositions(drawSize, numByes);
  const byePosSet = new Set(byePositions);
  const nonByePositions: number[] = [];
  for (let p = 1; p <= drawSize; p++) {
    if (!byePosSet.has(p)) nonByePositions.push(p);
  }

  const sorted = entrySlots.sort((a, b) => a.drawPosition - b.drawPosition);
  const result: CheckInSlot[] = [];
  for (let i = 0; i < nonByePositions.length && i < sorted.length; i++) {
    result.push({ ...sorted[i], drawPosition: nonByePositions[i] });
  }
  for (const bp of byePositions) {
    result.push({ drawPosition: bp, seed: 0, entryId: null, isBye: true, entry: null, playerName: 'BYE', partnerName: '', affiliation: '' });
  }
  return result.sort((a, b) => a.drawPosition - b.drawPosition);
}

export default function EntryRegistration() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());
  const [stickyEventName, setStickyEventName] = useState('');

  // Queries
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const eventIds = useMemo(() => events.map(e => e.eventId), [events]);

  const allEntries = useLiveQuery(
    () => eventIds.length > 0
      ? db.entries.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const allDraws = useLiveQuery(
    () => eventIds.length > 0
      ? db.draws.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const allMatches = useLiveQuery(
    () => eventIds.length > 0
      ? db.matches.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];
  const playerMap = useMemo(() => new Map(players.map(p => [p.playerId, p])), [players]);

  const entryMap = useMemo(() => new Map(allEntries.map(e => [e.entryId, e])), [allEntries]);
  const drawMap = useMemo(() => new Map(allDraws.map(d => [d.eventId, d])), [allDraws]);

  // Check if an event has confirmed matches
  const confirmedEventsSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatches) {
      set.add(m.eventId);
    }
    return set;
  }, [allMatches]);

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
    // DBから最新のドローを直接取得
    const draw = await db.draws.where('eventId').equals(slot.entry.eventId).first();
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
  }, []);

  const handleRestore = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;
    await db.entries.update(slot.entry.id, { status: 'active' });
    // DBから最新のドローと選手データを直接取得
    const draw = await db.draws.where('eventId').equals(slot.entry.eventId).first();
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s => s.entryId === slot.entryId ? { ...s, isBye: false } : s);
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    const allPlayers = await db.players.toArray();
    const pMap = new Map(allPlayers.map(p => [p.playerId, p]));
    const p1 = pMap.get(slot.entry.playerId);
    const p2 = slot.entry.partnerId ? pMap.get(slot.entry.partnerId) : null;
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
  }, []);

  // === エントリー確定（対戦表生成）===
  const handleConfirmEvent = useCallback(async (eventId: string, skipConfirm = false) => {
    // DBから最新データを直接取得（クロージャの古いデータに依存しない）
    const draw = await db.draws.where('eventId').equals(eventId).first();
    if (!draw) return;
    if (!skipConfirm && !confirm('エントリーを確定し対戦表を生成しますか？')) return;

    const slots = redistributeByes(
      draw.slots.map(s => ({
        ...s, drawPosition: s.position, seed: s.seed,
        entryId: s.entryId, isBye: s.isBye,
        entry: null, playerName: '', partnerName: '', affiliation: '',
      })),
      draw.drawSize
    );
    const drawSlots = slots.map(s => ({ position: s.drawPosition, entryId: s.entryId, seed: s.seed, isBye: s.isBye }));

    // redistributeByes後のスロット位置をDBに保存（全ページで同じ配置を使うため）
    await db.draws.update(draw.id!, { slots: drawSlots, updatedAt: Date.now() });

    // DBから最新のエントリーと選手データを取得
    const eventEntries = await db.entries.where('eventId').equals(eventId).toArray();
    const allPlayers = await db.players.toArray();
    const pMap = new Map(allPlayers.map(p => [p.playerId, p]));

    const newMatches: Omit<Match, 'id'>[] = [];
    let matchOrder = 1;

    const resolvePlayer = (slot: typeof drawSlots[0]) => {
      if (slot.isBye || !slot.entryId) return { name: 'BYE', affiliation: '', entryId: null };
      const entry = eventEntries.find(e => e.entryId === slot.entryId);
      if (!entry) return { name: '(不明)', affiliation: '', entryId: slot.entryId };
      const p1 = pMap.get(entry.playerId);
      const p2 = entry.partnerId ? pMap.get(entry.partnerId) : null;
      const name = p2 && p1 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
      let aff = p1?.affiliation || '';
      if (p2 && p2.affiliation !== p1?.affiliation) aff = `${p1?.affiliation} / ${p2.affiliation}`;
      return { name, affiliation: aff, entryId: slot.entryId };
    };

    // 1回戦
    for (let i = 0; i < drawSlots.length; i += 2) {
      const s1 = drawSlots[i];
      const s2 = drawSlots[i + 1];
      if (!s1 || !s2) continue;
      if (s1.isBye && s2.isBye) continue;
      const isWalkover = s1.isBye || s2.isBye;
      const p1Info = resolvePlayer(s1);
      const p2Info = resolvePlayer(s2);

      newMatches.push({
        eventId, matchId: `M-R1-${matchOrder}`, round: 1, matchOrder,
        position: Math.floor(i / 2) + 1,
        player1EntryId: p1Info.entryId, player2EntryId: p2Info.entryId,
        player1Name: p1Info.name, player2Name: p2Info.name,
        player1Affiliation: p1Info.affiliation, player2Affiliation: p2Info.affiliation,
        score: '', winnerEntryId: isWalkover ? (s1.isBye ? p2Info.entryId : p1Info.entryId) : null,
        courtId: null, scheduledTime: null,
        status: isWalkover ? 'walkover' : 'waiting',
        refereeId: null, refereeName: '', updatedAt: Date.now()
      });
      matchOrder++;
    }

    // 2回戦以降
    const totalRounds = Math.log2(draw.drawSize);
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = draw.drawSize / Math.pow(2, round);
      for (let m = 0; m < matchesInRound; m++) {
        newMatches.push({
          eventId, matchId: `M-R${round}-${m + 1}`, round, matchOrder: matchOrder++,
          position: m + 1,
          player1EntryId: null, player2EntryId: null,
          player1Name: '', player2Name: '',
          player1Affiliation: '', player2Affiliation: '',
          score: '', winnerEntryId: null,
          courtId: null, scheduledTime: null, status: 'waiting',
          refereeId: null, refereeName: '', updatedAt: Date.now()
        });
      }
    }

    // 既存の試合を削除して新しく生成
    const existingMatches = await db.matches.where('eventId').equals(eventId).toArray();
    const existingIds = existingMatches.map(m => m.id).filter((id): id is number => id !== undefined);

    await db.transaction('rw', db.matches, async () => {
      if (existingIds.length > 0) await db.matches.bulkDelete(existingIds);
      await db.matches.bulkAdd(newMatches);
    });

    // BYE勝ちの選手を次ラウンドに反映
    const walkoverMatches = newMatches.filter(m => m.status === 'walkover');
    for (const wm of walkoverMatches) {
      const nextRound = wm.round + 1;
      const nextPosition = Math.ceil(wm.position / 2);
      const nextMatch = await db.matches
        .where('eventId').equals(eventId)
        .filter(m => m.round === nextRound && m.position === nextPosition)
        .first();
      if (nextMatch?.id && wm.winnerEntryId) {
        const isWinnerP1 = wm.winnerEntryId === wm.player1EntryId;
        const winnerName = isWinnerP1 ? wm.player1Name : wm.player2Name;
        const winnerAff = isWinnerP1 ? wm.player1Affiliation : wm.player2Affiliation;
        const isUpper = wm.position % 2 === 1;
        await db.matches.update(nextMatch.id, {
          ...(isUpper
            ? { player1EntryId: wm.winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
            : { player2EntryId: wm.winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
          ),
          updatedAt: Date.now()
        });
      }
    }
  }, []);

  const handleConfirmAll = useCallback(async () => {
    // DBから最新のドロー一覧を取得して確定対象を判定
    const currentDraws = eventIds.length > 0
      ? await db.draws.where('eventId').anyOf(eventIds).toArray()
      : [];
    const drawEventIds = new Set(currentDraws.map(d => d.eventId));
    const targets = events.filter(evt => drawEventIds.has(evt.eventId));
    if (targets.length === 0) return;
    if (!confirm(`全${targets.length}種目のエントリーを確定し対戦表を生成しますか？`)) return;
    for (const evt of targets) {
      await handleConfirmEvent(evt.eventId, true);
    }
    alert(`全${targets.length}種目の対戦表を確定しました。`);
  }, [events, eventIds, handleConfirmEvent]);

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

  // ===== League / Round-robin table =====
  const renderLeagueTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;
    const playerSlots = slots.filter(s => s.entry && !(s.isBye && !s.entry));

    if (playerSlots.length === 0) {
      return <div className="py-8 text-center text-gray-400 text-sm">リーグデータがありません</div>;
    }

    return (
      <div>
        {draw && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-primary-50/30 border-b border-gray-200 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              リーグ <strong className="text-gray-800">{playerSlots.length}人</strong>
            </span>
          </div>
        )}
        <div className="p-4 space-y-1.5">
          {playerSlots.map((slot, idx) => {
            const isWithdrawn = slot.entry?.status === 'withdrawn';
            const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
            const isDimmed = hasSearch && slot.entry && !searchMatches.has(slot.drawPosition);
            const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);

            let statusDotColor = '#d1d5db';
            let borderClass = 'border-gray-300';
            let bgClass = 'bg-white';
            if (isWithdrawn) { statusDotColor = '#ef4444'; bgClass = 'bg-red-50/60'; borderClass = 'border-red-200'; }
            else if (isConfirmed) { statusDotColor = '#22c55e'; bgClass = 'bg-emerald-50/60'; borderClass = 'border-emerald-300'; }

            return (
              <div key={`league-card-${slot.drawPosition}`}
                className={`flex items-center border rounded-lg shadow-sm transition-all h-[36px] ${borderClass} ${bgClass} ${isDimmed ? 'opacity-20' : ''} ${isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                style={{ width: 220 }}>
                <div className="w-6 text-[10px] font-mono text-gray-400 text-center flex-shrink-0 border-r border-gray-100 self-stretch flex items-center justify-center">{idx + 1}</div>
                {slot.seed > 0 && <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full ml-1">{slot.seed}</div>}
                <div className="flex-1 min-w-0 mx-1.5 overflow-hidden">
                  {slot.entry ? (
                    <button onClick={() => handleCheckIn(slot)} className="text-left w-full group block" title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
                      <div className={`text-xs font-bold leading-tight truncate ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                        {slot.playerName}{slot.partnerName && <span className="text-gray-500 font-bold"> / {slot.partnerName}</span>}
                      </div>
                      {slot.affiliation && !isWithdrawn && <div className="text-[9px] text-gray-600 truncate leading-tight mt-0.5">{slot.affiliation}</div>}
                    </button>
                  ) : <span className="text-sm text-gray-300">---</span>}
                </div>
                <div className="flex-shrink-0 mr-1"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusDotColor }} /></div>
                {slot.entry && (
                  <div className="flex-shrink-0 mr-1">
                    {isWithdrawn ? (
                      <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="p-0.5 text-blue-500 hover:bg-blue-100 rounded transition-colors" title="復元する"><RotateCcw className="w-3 h-3" /></button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="BYEにする"><UserX className="w-3 h-3" /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ===== SVG Bracket-based draw view =====
  const renderDrawTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;

    const event = events.find(e => e.eventId === eventId);
    const eventType = event?.type as string | undefined;
    const ds = draw?.drawSize || 0;
    const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
    const isLeague =
      eventType === 'league' || eventType === 'round-robin' ||
      draw?.drawType === 'roundRobin' ||
      (ds > 0 && !isPowerOf2) ||
      /リーグ/i.test(event?.name || '');
    if (isLeague) return renderLeagueTable(eventId, slots);

    if (slots.length === 0) {
      return <div className="py-8 text-center text-gray-400 text-sm">ドローデータがありません</div>;
    }

    // Bracket constants - コンパクトに収める
    const SLOT_HEIGHT = 36;
    const SLOT_WIDTH = 220;
    const Y_SPACING = 44;
    const X_SPACING = 50; // スロット間のギャップ（線のみ）
    const OFFSET_X = 28;
    const OFFSET_Y = 24;

    const drawSize = draw?.drawSize || (slots.length <= 1 ? 2 : Math.pow(2, Math.ceil(Math.log2(slots.length))));
    const displaySlots = redistributeByes(slots, drawSize);
    const halfSize = drawSize / 2;

    const LINE_ONLY_W = 40;
    const getX = (r: number): number => {
      if (r === 0) return OFFSET_X;
      return OFFSET_X + SLOT_WIDTH + X_SPACING + (r - 1) * LINE_ONLY_W;
    };
    const getSlotW = (r: number): number => r === 0 ? SLOT_WIDTH : LINE_ONLY_W;

    // === ブラケットセクション描画ヘルパー（左山/右山それぞれ独立描画） ===
    const renderBracketSection = (
      sectionSlots: CheckInSlot[],
      sectionDrawSize: number,
      globalVisibleOffset: number,
      keyPrefix: string,
      label?: { text: string; colorClass: string; borderClass: string; bgClass: string }
    ) => {
      const sectionRoundsCount = Math.log2(sectionDrawSize);
      const isBye = (i: number): boolean => {
        const s = i < sectionSlots.length ? sectionSlots[i] : null;
        return !s || (s.isBye && !s.entry);
      };

      // Y位置計算（セクション内で独立）
      const r0Y: number[] = new Array(sectionDrawSize).fill(0);
      let nextY = OFFSET_Y;
      for (let mi = 0; mi < sectionDrawSize / 2; mi++) {
        const t = mi * 2, b = mi * 2 + 1;
        const tBye = isBye(t), bBye = isBye(b);
        if (tBye && bBye) { r0Y[t] = nextY; r0Y[b] = nextY; }
        else if (tBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
        else if (bBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
        else { r0Y[t] = nextY; r0Y[b] = nextY + Y_SPACING; nextY += Y_SPACING * 2; }
      }

      const getY = (r: number, i: number): number => {
        if (r === 0) return r0Y[i];
        return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
      };

      const secWidth = getX(sectionRoundsCount) + OFFSET_X;
      const secHeight = nextY + SLOT_HEIGHT;

      // SVG ブラケット線
      const paths: React.ReactNode[] = [];
      for (let r = 0; r < sectionRoundsCount; r++) {
        const nm = sectionDrawSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const xS = r === 0 ? getX(r) + getSlotW(r) : getX(r);
          const xN = getX(r + 1);
          const xM = (xS + xN) / 2;
          const yT = getY(r, m * 2) + SLOT_HEIGHT / 2;
          const yB = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
          const yM = getY(r + 1, m) + SLOT_HEIGHT / 2;
          if (r === 0) {
            if (isBye(m * 2) && isBye(m * 2 + 1)) continue;
            if (isBye(m * 2) || isBye(m * 2 + 1)) {
              const pY = isBye(m * 2) ? yB : yT;
              paths.push(<path key={`${keyPrefix}-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
              continue;
            }
          }
          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
        }
      }

      // 選手スロット描画
      const elems: React.ReactNode[] = [];
      let vi = globalVisibleOffset;
      for (let i = 0; i < sectionDrawSize; i++) {
        const slot = i < sectionSlots.length ? sectionSlots[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        const x = getX(0), y = r0Y[i];
        const isWithdrawn = slot.entry?.status === 'withdrawn';
        const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
        const isDimmed = hasSearch && slot.entry && !searchMatches.has(slot.drawPosition);
        const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);
        let dotColor = '#d1d5db';
        if (isWithdrawn) dotColor = '#ef4444';
        else if (isConfirmed) dotColor = '#22c55e';
        let borderCls = 'border-gray-300', bgCls = 'bg-white';
        if (isWithdrawn) { bgCls = 'bg-red-50/60'; borderCls = 'border-red-200'; }
        else if (isConfirmed) { bgCls = 'bg-emerald-50/60'; borderCls = 'border-emerald-300'; }
        elems.push(
          <div key={`${keyPrefix}-slot-${slot.drawPosition}`}
            className={`absolute flex items-center border rounded shadow-sm transition-all ${borderCls} ${bgCls} ${isDimmed ? 'opacity-20' : ''} ${isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
            style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}>
            <div className="w-6 text-[10px] font-mono text-gray-400 text-center flex-shrink-0 border-r border-gray-100 self-stretch flex items-center justify-center">{vi}</div>
            {slot.seed > 0 && <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full ml-1">{slot.seed}</div>}
            <div className="flex-1 min-w-0 mx-1.5 overflow-hidden">
              {slot.entry ? (
                <button onClick={() => handleCheckIn(slot)} className="text-left w-full group block" title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
                  <div className={`text-xs font-bold leading-tight truncate ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                    {slot.playerName}{slot.partnerName && <span className="text-gray-500 font-bold"> / {slot.partnerName}</span>}
                  </div>
                  {slot.affiliation && !isWithdrawn && <div className="text-[9px] text-gray-600 truncate leading-tight mt-0.5">{slot.affiliation}</div>}
                </button>
              ) : <span className="text-sm text-gray-300">---</span>}
            </div>
            <div className="flex-shrink-0 mr-1"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} /></div>
            {slot.entry && (
              <div className="flex-shrink-0 mr-1">
                {isWithdrawn ? (
                  <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="p-0.5 text-blue-500 hover:bg-blue-100 rounded transition-colors" title="復元する"><RotateCcw className="w-3 h-3" /></button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="BYEにする"><UserX className="w-3 h-3" /></button>
                )}
              </div>
            )}
          </div>
        );
      }

      // Left/Right ラベル
      const labelEl = label ? (
        <div className="absolute flex items-center justify-center"
          style={{ left: 0, top: OFFSET_Y, width: 22, height: Math.max(nextY - OFFSET_Y, 40) }}>
          <div className={`${label.bgClass} border-l-2 ${label.borderClass} rounded-r px-0.5 py-1 h-full flex items-center justify-center`}>
            <span className={`text-[9px] font-bold ${label.colorClass} tracking-wider`} style={{ writingMode: 'vertical-rl' }}>{label.text}</span>
          </div>
        </div>
      ) : null;

      return (
        <div className="overflow-auto">
          <div className="relative" style={{ width: secWidth, height: secHeight, minWidth: secWidth }}>
            {labelEl}
            <svg className="absolute inset-0 pointer-events-none" width={secWidth} height={secHeight}>{paths}</svg>
            {elems}
          </div>
        </div>
      );
    };

    // 統計ヘッダー
    const statsHeader = draw ? (
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
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          欠場 <strong className="text-gray-800">{slots.filter(s => s.entry?.status === 'withdrawn').length}</strong>
        </span>
      </div>
    ) : null;

    // ドローサイズ < 8 は単一表示、8以上はPC2列/スマホ1列
    if (drawSize < 8) {
      return (
        <div>
          {statsHeader}
          {renderBracketSection(displaySlots, drawSize, 0, 'full')}
        </div>
      );
    }

    // 左山・右山に分割
    const leftSlots = displaySlots.slice(0, halfSize);
    const rightSlots = displaySlots.slice(halfSize);
    let leftVisCount = 0;
    for (const s of leftSlots) {
      if (s && !(s.isBye && !s.entry)) leftVisCount++;
    }

    return (
      <div>
        {statsHeader}
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {renderBracketSection(leftSlots, halfSize, 0, 'left',
            { text: 'Left side', colorClass: 'text-primary-600', borderClass: 'border-primary-500', bgClass: 'bg-primary-500/10' })}
          {renderBracketSection(rightSlots, halfSize, leftVisCount, 'right',
            { text: 'Right side', colorClass: 'text-orange-600', borderClass: 'border-orange-500', bgClass: 'bg-orange-500/10' })}
        </div>
      </div>
    );
  };

  // ===== Event Section =====
  const renderEventSection = (eventId: string, eventName: string, forceShow = false) => {
    const slots = buildSlotsForEvent(eventId);
    const stats = computeStats(slots);
    const isCollapsed = collapsedEvents.has(eventId);
    const isConfirmedEvent = confirmedEventsSet.has(eventId);

    if (!forceShow && searchQuery) {
      const searchMatches = getSearchMatchSet(slots);
      if (searchMatches.size === 0 && searchQuery.length > 0) return null;
    }

    return (
      <div key={eventId} className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden"
        data-event-id={eventId} data-event-name={eventName}>
        {/* Event header - sticky */}
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between sticky top-0 z-10">
          <button onClick={() => toggleCollapse(eventId)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            <h3 className="font-bold text-primary-600 text-sm">{eventName}</h3>
            {isConfirmedEvent && <Lock className="w-3 h-3 text-green-600" />}
          </button>
          <div className="flex items-center gap-2 text-xs">
            <button onClick={(e) => { e.stopPropagation(); handleCheckInEvent(eventId); }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 transition-colors">
              <UserCheck className="w-3 h-3" />全員受付
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleConfirmEvent(eventId); }}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${isConfirmedEvent ? 'text-gray-500 bg-gray-100 hover:bg-gray-200' : 'text-white bg-orange-500 hover:bg-orange-600'}`}>
              <Lock className="w-3 h-3" />{isConfirmedEvent ? '再確定' : '確定'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleResetEvent(eventId); }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
              <RotateCcw className="w-3 h-3" />
            </button>
            <span className="bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">{stats.checkedIn}</span>
            <span className="text-gray-500">/</span>
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">{stats.total}</span>
            {stats.absent > 0 && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{stats.absent} 欠場</span>}
          </div>
        </div>

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

  // スクロール時のスティッキー種目名表示
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let lastScrollY = 0;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > 20 && y > lastScrollY) setControlsOpen(false);
      lastScrollY = y;

      // スクロール中の種目名検出
      if (showAllEvents) {
        const sections = el.querySelectorAll('[data-event-name]');
        let currentName = '';
        for (const sec of sections) {
          const rect = (sec as HTMLElement).getBoundingClientRect();
          const containerRect = el.getBoundingClientRect();
          if (rect.top <= containerRect.top + 60) {
            currentName = (sec as HTMLElement).dataset.eventName || '';
          }
        }
        setStickyEventName(y > 10 ? currentName : '');
      } else {
        setStickyEventName('');
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [showAllEvents]);

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
    <div className="max-w-full mx-auto h-full flex flex-col lg:flex-row lg:gap-4 p-4">
      {/* LEFT: コントロールパネル */}
      <div className="lg:w-[280px] shrink-0 order-1 lg:order-1 mb-3 lg:mb-0 sticky top-0 z-10 lg:self-start">
        <button onClick={() => setControlsOpen(prev => !prev)}
          className="w-full flex items-center justify-between bg-white px-4 py-2.5 rounded-xl shadow-sm border border-border-main hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary-500" />
            <span className="font-bold text-gray-900 text-sm">エントリー受付</span>
            {(showAllEvents || selectedEventId) && <span className="text-xs text-gray-500">{overallStats.checkedIn}/{overallStats.total}</span>}
          </div>
          {controlsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        <div className={`transition-all duration-300 overflow-hidden ${controlsOpen ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-border-main space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex rounded-lg border border-border-main overflow-hidden text-sm w-full">
                <button onClick={() => setShowAllEvents(false)}
                  className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${!showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  <Eye className="w-3.5 h-3.5" />個別表示
                </button>
                <button onClick={() => setShowAllEvents(true)}
                  className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  <List className="w-3.5 h-3.5" />すべて表示
                </button>
              </div>

              {!showAllEvents && (
                <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}
                  className="w-full border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium">
                  <option value="">-- 種目を選択 --</option>
                  {events.map(e => <option key={e.eventId} value={e.eventId}>{e.name}</option>)}
                </select>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-500" />
              </div>
              <input type="text" placeholder="選手名・所属で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/15 focus:border-primary-500" />
            </div>

            {(showAllEvents || selectedEventId) && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <div className="flex items-center gap-1"><span className="text-gray-500 text-xs">合計:</span><span className="font-bold text-gray-800">{overallStats.total}</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><span className="font-bold text-green-700">{overallStats.checkedIn}</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /><span className="font-bold text-red-600">{overallStats.absent}</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /><span className="font-bold text-gray-600">{overallStats.remaining}</span></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={showAllEvents ? handleCheckInAll : () => selectedEventId && handleCheckInEvent(selectedEventId)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors">
                    <UserCheck className="w-3.5 h-3.5" />全員受付済み
                  </button>
                  <button onClick={showAllEvents ? handleResetAll : () => selectedEventId && handleResetEvent(selectedEventId)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />リセット
                  </button>
                  <button onClick={handleConfirmAll}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 transition-colors">
                    <Lock className="w-3.5 h-3.5" />全種目確定
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Main content area */}
      <div className="flex-1 min-w-0 order-2 lg:order-2 flex flex-col min-h-0">
        {/* スティッキー種目名バー */}
        {stickyEventName && (
          <div className="bg-primary-600 text-white px-4 py-1.5 rounded-t-lg text-sm font-bold shadow-sm shrink-0">
            {stickyEventName}
          </div>
        )}

        <div ref={contentRef} className="flex-1 overflow-y-auto space-y-4 min-h-0">
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
      </div>
    </div>
  );
}
