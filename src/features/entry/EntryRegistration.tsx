import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Entry } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CheckSquare, UserCheck, UserX, Search, Eye, List, Upload, AlertCircle, ChevronDown, ChevronRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
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

// === BYE再配置ユーティリティ ===
// 標準的なトーナメントのシード配置位置を生成
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

// BYEが配置されるべきポジションを生成（シードの対戦相手位置）
function generateByePositions(drawSize: number, numByes: number): number[] {
  const seedPositions = generateSeedPositions(drawSize);
  const byePositions: number[] = [];
  for (let i = 0; i < numByes && i < seedPositions.length; i++) {
    const p = seedPositions[i];
    byePositions.push(p % 2 === 1 ? p + 1 : p - 1);
  }
  return byePositions;
}

// BYEが末尾に集中している場合、標準配置に再分配
function redistributeByes(slots: CheckInSlot[], drawSize: number): CheckInSlot[] {
  const entrySlots = slots.filter(s => !(s.isBye && !s.entry));
  const numByes = drawSize - entrySlots.length;
  if (numByes <= 0) return slots;

  // BYEが既に分散しているかチェック（前半にBYEがあれば分散済み）
  const halfPos = drawSize / 2;
  const hasByeInFirstHalf = slots.some(s => s.isBye && !s.entry && s.drawPosition <= halfPos);
  if (hasByeInFirstHalf) {
    // 既に正しく配置されている → 不足分だけ補完
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

  // BYEを標準位置に再配置
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

  // ===== League / Round-robin table =====
  const renderLeagueTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;
    const playerSlots = slots.filter(s => s.entry && !(s.isBye && !s.entry));

    if (playerSlots.length === 0) {
      return (
        <div className="py-8 text-center text-gray-400 text-sm">
          リーグデータがありません
        </div>
      );
    }

    // 短縮名（列ヘッダー用）
    const shortName = (name: string) => {
      const parts = name.split(/[\s　]+/);
      if (parts.length >= 2) return parts[0]; // 姓のみ
      return name.slice(0, 3);
    };

    return (
      <div>
        {/* Info bar - トーナメントと同じスタイル */}
        {draw && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-primary-50/30 border-b border-gray-200 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              リーグ <strong className="text-gray-800">{playerSlots.length}人</strong>
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              対戦数 <strong className="text-gray-800">{playerSlots.length * (playerSlots.length - 1) / 2}</strong>
            </span>
          </div>
        )}

        <div className="p-4 overflow-x-auto">
          <table className="text-sm rounded-xl overflow-hidden shadow-sm border border-gray-200" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="py-2.5 px-2 text-[10px] font-bold text-white bg-gray-700 sticky left-0 z-20 w-8 text-center rounded-tl-xl">
                  No
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-white bg-gray-700 sticky left-[33px] z-20 min-w-[200px] text-left">
                  選手名
                </th>
                <th className="py-2.5 px-2 text-[10px] font-bold text-white bg-gray-700 w-[70px] text-center">
                  受付
                </th>
                {playerSlots.map((ps, colIdx) => (
                  <th
                    key={`col-h-${colIdx}`}
                    className="py-1.5 px-1 text-center bg-gray-700 w-[56px]"
                  >
                    <div className="text-[10px] font-bold text-white">{colIdx + 1}</div>
                    <div className="text-[9px] text-gray-300 truncate leading-tight">{shortName(ps.playerName)}</div>
                  </th>
                ))}
                <th className="py-2.5 px-2 text-[10px] font-bold text-white bg-gray-700 w-10 text-center">
                  勝
                </th>
                <th className="py-2.5 px-2 text-[10px] font-bold text-white bg-gray-700 w-10 text-center">
                  敗
                </th>
                <th className="py-2.5 px-2 text-[10px] font-bold text-white bg-gray-700 w-10 text-center rounded-tr-xl">
                  順位
                </th>
              </tr>
            </thead>
            <tbody>
              {playerSlots.map((slot, rowIdx) => {
                const isWithdrawn = slot.entry?.status === 'withdrawn';
                const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
                const isDimmed = hasSearch && slot.entry && !searchMatches.has(slot.drawPosition);
                const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);

                // Status dot & border (トーナメントスロットと同じスタイル)
                let statusDotColor = '#d1d5db';
                let rowBg = '';
                let rowBorder = 'border-gray-200';
                if (isWithdrawn) {
                  statusDotColor = '#ef4444';
                  rowBg = 'bg-red-50/40';
                  rowBorder = 'border-red-200';
                } else if (isConfirmed) {
                  statusDotColor = '#22c55e';
                  rowBg = 'bg-emerald-50/40';
                  rowBorder = 'border-emerald-200';
                }

                return (
                  <tr
                    key={`league-row-${slot.drawPosition}`}
                    className={`transition-all
                      ${isDimmed ? 'opacity-20' : ''}
                      ${isHighlighted ? 'ring-2 ring-blue-400 ring-inset' : ''}
                    `}
                  >
                    {/* No */}
                    <td className={`py-0 px-0 text-center border-b ${rowBorder} bg-white sticky left-0 z-10 ${rowIdx === playerSlots.length - 1 ? 'rounded-bl-xl' : ''}`}>
                      <div className="w-full h-[48px] flex items-center justify-center text-[10px] font-mono text-gray-400 border-r border-gray-100">
                        {rowIdx + 1}
                      </div>
                    </td>

                    {/* 選手名 - トーナメントスロットカードと同じスタイル */}
                    <td className={`py-0 px-0 border-b ${rowBorder} sticky left-[33px] z-10 ${rowBg || 'bg-white'}`}>
                      <div className="flex items-center h-[48px] px-2 gap-1.5">
                        {slot.seed > 0 && (
                          <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full shadow-sm">
                            {slot.seed}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {slot.entry ? (
                            <button
                              onClick={() => handleCheckIn(slot)}
                              className="text-left w-full group block"
                              title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}
                            >
                              <div className={`text-xs font-medium leading-tight truncate ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                                {slot.playerName}
                                {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
                              </div>
                              {slot.affiliation && !isWithdrawn && (
                                <div className="text-[9px] text-gray-400 truncate leading-tight mt-0.5">{slot.affiliation}</div>
                              )}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-300">---</span>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusDotColor }} />
                        </div>
                        {slot.entry && !isWithdrawn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }}
                            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="BYEにする"
                          >
                            <UserX className="w-3 h-3" />
                          </button>
                        )}
                        {slot.entry && isWithdrawn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRestore(slot); }}
                            className="flex-shrink-0 p-0.5 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                            title="復元する"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 受付状態 */}
                    <td className={`py-0 px-2 text-center border-b ${rowBorder} ${rowBg || 'bg-white'}`}>
                      {isWithdrawn ? (
                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">BYE</span>
                      ) : isConfirmed ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">受付済</span>
                      ) : slot.entry ? (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">未確認</span>
                      ) : null}
                    </td>

                    {/* 対戦セル */}
                    {playerSlots.map((_, colIdx) => {
                      const isDiagonal = rowIdx === colIdx;
                      return (
                        <td
                          key={`cell-${rowIdx}-${colIdx}`}
                          className={`h-[48px] text-center text-xs border-b border-r border-gray-200 ${isDiagonal ? '' : 'bg-white hover:bg-primary-50/30 transition-colors'}`}
                          style={isDiagonal ? {
                            background: 'linear-gradient(135deg, #f3f4f6 25%, #e5e7eb 25%, #e5e7eb 50%, #f3f4f6 50%, #f3f4f6 75%, #e5e7eb 75%)',
                            backgroundSize: '6px 6px',
                          } : undefined}
                        />
                      );
                    })}

                    {/* 勝・敗・順位（空欄） */}
                    <td className="h-[48px] text-center text-xs border-b border-r border-gray-200 bg-white" />
                    <td className="h-[48px] text-center text-xs border-b border-r border-gray-200 bg-white" />
                    <td className={`h-[48px] text-center text-xs border-b border-gray-200 bg-white ${rowIdx === playerSlots.length - 1 ? 'rounded-br-xl' : ''}`} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ===== SVG Bracket-based draw view =====
  const renderDrawTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const hasSearch = searchQuery.length > 0;

    // Check if this is a league/round-robin event
    const event = events.find(e => e.eventId === eventId);
    const eventType = event?.type as string | undefined;
    // drawSizeが2の累乗でない場合もリーグ戦と判定（3人、5人、6人など）
    const ds = draw?.drawSize || 0;
    const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
    const isLeague =
      eventType === 'league' ||
      eventType === 'round-robin' ||
      draw?.drawType === 'roundRobin' ||
      (ds > 0 && !isPowerOf2) ||
      /リーグ/i.test(event?.name || '');
    if (isLeague) {
      return renderLeagueTable(eventId, slots);
    }

    if (slots.length === 0) {
      return (
        <div className="py-8 text-center text-gray-400 text-sm">
          ドローデータがありません
        </div>
      );
    }

    // Bracket constants
    const SLOT_HEIGHT = 40;
    const SLOT_WIDTH = 240;
    const Y_SPACING = 50;
    const X_SPACING = 280;
    const OFFSET_X = 16;
    const OFFSET_Y = 40;

    const drawSize = draw?.drawSize || (slots.length <= 1 ? 2 : Math.pow(2, Math.ceil(Math.log2(slots.length))));

    // BYEが末尾に集中している場合、標準位置に再配置
    const displaySlots = redistributeByes(slots, drawSize);
    const roundsCount = Math.log2(drawSize);
    const totalRoundsToShow = roundsCount + 1; // includes winner node

    // Round labels
    // drawSize=4:  1回戦, 決勝, 優勝
    // drawSize=8:  1回戦, 準決勝, 決勝, 優勝
    // drawSize=16: 1回戦, 2回戦, 準決勝, 決勝, 優勝
    // drawSize=32: 1回戦, 2回戦, 準々決勝, 準決勝, 決勝, 優勝
    const roundLabels: string[] = [];
    const playRounds = totalRoundsToShow - 1; // 優勝ノードを除いた試合ラウンド数
    for (let r = 0; r < totalRoundsToShow; r++) {
      if (r === totalRoundsToShow - 1) {
        roundLabels.push('優勝');
      } else {
        const fromFinal = playRounds - 1 - r; // 決勝=0, 準決勝=1, 準々決勝=2, ...
        if (fromFinal === 0) roundLabels.push('決勝');
        else if (fromFinal === 1 && playRounds >= 3) roundLabels.push('準決勝');
        else if (fromFinal === 2 && playRounds >= 5) roundLabels.push('準々決勝');
        else roundLabels.push(`${r + 1}回戦`);
      }
    }

    // Positioning functions (same as DrawRenderer)
    const getY = (r: number, i: number): number => {
      if (r === 0) return OFFSET_Y + i * Y_SPACING;
      return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
    };
    const getX = (r: number): number => OFFSET_X + r * X_SPACING;

    // Container dimensions
    const containerWidth = OFFSET_X * 2 + (totalRoundsToShow - 1) * X_SPACING + SLOT_WIDTH;
    const containerHeight = OFFSET_Y + (drawSize - 1) * Y_SPACING + SLOT_HEIGHT + 16;

    // Build SVG bracket lines
    const svgPaths: React.ReactNode[] = [];
    for (let r = 0; r < totalRoundsToShow - 1; r++) {
      const numMatches = drawSize / Math.pow(2, r + 1);
      for (let m = 0; m < numMatches; m++) {
        const x = getX(r) + SLOT_WIDTH;
        const xNext = getX(r + 1);
        const xMid = (x + xNext) / 2;

        const yTop = getY(r, m * 2) + SLOT_HEIGHT / 2;
        const yBottom = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
        const yMid = getY(r + 1, m) + SLOT_HEIGHT / 2;

        // Top path
        svgPaths.push(
          <path
            key={`r${r}-m${m}-top`}
            d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`}
            fill="none"
            stroke="#1b4d3e"
            strokeWidth="1.5"
          />
        );
        // Bottom path
        svgPaths.push(
          <path
            key={`r${r}-m${m}-bottom`}
            d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`}
            fill="none"
            stroke="#1b4d3e"
            strokeWidth="1.5"
          />
        );
        // Connection to next round
        svgPaths.push(
          <path
            key={`r${r}-m${m}-conn`}
            d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
            fill="none"
            stroke="#1b4d3e"
            strokeWidth="1.5"
          />
        );
      }
    }

    // Build round 0 (first round) slot elements with full player info
    const slotElements: React.ReactNode[] = [];
    for (let i = 0; i < drawSize; i++) {
      const slot = i < displaySlots.length ? displaySlots[i] : null;
      const x = getX(0);
      const y = getY(0, i);

      if (!slot) {
        // Empty slot (no data)
        slotElements.push(
          <div
            key={`slot-empty-${i}`}
            className="absolute flex items-center px-2 border border-dashed border-gray-200 rounded bg-gray-50/50"
            style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
          >
            <span className="text-xs font-mono text-gray-300 w-6 text-center">{i + 1}</span>
            <span className="text-sm text-gray-300 ml-2">---</span>
          </div>
        );
        continue;
      }

      const isOriginalBye = slot.isBye && !slot.entry;
      const isWithdrawn = slot.entry?.status === 'withdrawn';
      const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
      const isDimmed = hasSearch && !isOriginalBye && slot.entry && !searchMatches.has(slot.drawPosition);
      const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);

      // Status dot color
      let statusDotColor = '#d1d5db'; // gray - unchecked
      if (isWithdrawn) statusDotColor = '#ef4444'; // red
      else if (isConfirmed) statusDotColor = '#22c55e'; // green
      else if (isOriginalBye) statusDotColor = '#ef4444'; // red for BYE

      // Border/background styles
      let borderClass = 'border-gray-300';
      let bgClass = 'bg-white';
      if (isOriginalBye) {
        borderClass = 'border-dashed border-gray-300';
        bgClass = 'bg-gray-50/80';
      } else if (isWithdrawn) {
        bgClass = 'bg-red-50/60';
        borderClass = 'border-red-200';
      } else if (isConfirmed) {
        bgClass = 'bg-emerald-50/60';
        borderClass = 'border-emerald-300';
      }

      slotElements.push(
        <div
          key={`slot-${slot.drawPosition}`}
          className={`absolute flex items-center border rounded shadow-sm transition-all
            ${borderClass} ${bgClass}
            ${isDimmed ? 'opacity-20' : ''}
            ${isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
          `}
          style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
        >
          {/* Position number */}
          <div className="w-6 text-[10px] font-mono text-gray-400 text-center flex-shrink-0 border-r border-gray-100 self-stretch flex items-center justify-center">
            {slot.drawPosition}
          </div>

          {/* Seed badge */}
          {slot.seed > 0 && (
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full ml-1">
              {slot.seed}
            </div>
          )}

          {/* Player info */}
          <div className="flex-1 min-w-0 mx-1.5 overflow-hidden">
            {isOriginalBye ? (
              <span className="text-sm text-gray-400 italic">BYE</span>
            ) : slot.entry ? (
              <button
                onClick={() => handleCheckIn(slot)}
                className="text-left w-full group block"
                title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}
              >
                <div className={`text-xs font-medium leading-tight truncate ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                  {slot.playerName}
                  {slot.partnerName && <span className="text-gray-400"> / {slot.partnerName}</span>}
                </div>
                {slot.affiliation && !isWithdrawn && (
                  <div className="text-[9px] text-gray-400 truncate leading-tight mt-0.5">{slot.affiliation}</div>
                )}
              </button>
            ) : (
              <span className="text-sm text-gray-300">---</span>
            )}
          </div>

          {/* Status dot */}
          <div className="flex-shrink-0 mr-1">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: statusDotColor }}
            />
          </div>

          {/* Action button (BYE/Restore) */}
          {slot.entry && !isOriginalBye && (
            <div className="flex-shrink-0 mr-1">
              {isWithdrawn ? (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRestore(slot); }}
                  className="p-0.5 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                  title="復元する"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }}
                  className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  title="BYEにする"
                >
                  <UserX className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    // Build subsequent round empty slot boxes (rounds 1+)
    const laterRoundElements: React.ReactNode[] = [];
    for (let r = 1; r < totalRoundsToShow; r++) {
      const numNodes = drawSize / Math.pow(2, r);
      const isWinnerNode = r === totalRoundsToShow - 1;

      for (let m = 0; m < numNodes; m++) {
        const x = getX(r);
        const y = getY(r, m);

        laterRoundElements.push(
          <div
            key={`later-r${r}-m${m}`}
            className={`absolute flex items-center justify-center border rounded shadow-sm
              ${isWinnerNode
                ? 'border-primary-300 bg-primary-50/50 border-b-2 border-b-primary-500'
                : 'border-gray-200 bg-white/60'
              }
            `}
            style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
          >
            {isWinnerNode ? (
              <span className="text-xs font-bold text-primary-500 tracking-widest">WINNER</span>
            ) : (
              <span className="text-xs text-gray-300"></span>
            )}
          </div>
        );
      }
    }

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

        {/* Bracket container */}
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
          <div className="relative" style={{ width: containerWidth, height: containerHeight, minWidth: containerWidth }}>
            {/* Round labels at top */}
            {roundLabels.map((label, r) => (
              <div
                key={`round-label-${r}`}
                className="absolute text-[11px] font-bold text-gray-500 text-center"
                style={{
                  left: getX(r),
                  top: 4,
                  width: SLOT_WIDTH,
                }}
              >
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{label}</span>
              </div>
            ))}

            {/* SVG bracket lines */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={containerWidth}
              height={containerHeight}
            >
              {svgPaths}
            </svg>

            {/* Round 0 slots (with full player details) */}
            {slotElements}

            {/* Later round empty boxes */}
            {laterRoundElements}
          </div>
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

  // モバイルでスクロール時にヘッダーを自動非表示
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let lastScrollY = 0;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > 200 && y > lastScrollY) {
        setMobileHeaderVisible(false);
      } else if (y < lastScrollY - 30 || y < 100) {
        setMobileHeaderVisible(true);
      }
      lastScrollY = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

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
    <div className="max-w-full mx-auto h-[calc(100vh-120px)] flex flex-col lg:flex-row lg:gap-4 p-4">
      {/* RIGHT: Sidebar controls - on mobile auto-hide on scroll */}
      <div className={`lg:w-[320px] shrink-0 order-1 lg:order-2 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto space-y-3 mb-3 lg:mb-0 transition-all duration-300 lg:!max-h-none lg:!opacity-100 lg:!overflow-visible ${mobileHeaderVisible ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden mb-0 lg:max-h-none'}`}>
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div className="flex flex-col gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary-500" />
            エントリー受付
          </h1>

          <div className="flex flex-col gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-border-main overflow-hidden text-sm w-full">
              <button
                onClick={() => setShowAllEvents(false)}
                className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${!showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Eye className="w-3.5 h-3.5" />個別表示
              </button>
              <button
                onClick={() => setShowAllEvents(true)}
                className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-3.5 h-3.5" />すべて表示
              </button>
            </div>

            {!showAllEvents && (
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="w-full border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
              >
                <option value="">-- 種目を選択 --</option>
                {events.map(e => (
                  <option key={e.eventId} value={e.eventId}>{e.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center justify-center gap-2 bg-white border border-border-main text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors w-full"
            >
              <Upload className="w-4 h-4 text-primary-500" />
              インポート
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3">
          <div className="relative">
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
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-xs">合計:</span>
                <span className="font-bold text-gray-800">{overallStats.total}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="font-bold text-green-700">{overallStats.checkedIn}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                <span className="font-bold text-red-600">{overallStats.absent}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
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
      </header>
      </div>

      {/* LEFT: Main content area (draw tables) - on PC comes first visually */}
      <div ref={contentRef} className="flex-1 min-w-0 order-2 lg:order-1 overflow-y-auto space-y-4 min-h-0">

      {/* Mobile FAB to show header */}
      {!mobileHeaderVisible && (
        <button
          onClick={() => { setMobileHeaderVisible(true); contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="lg:hidden fixed bottom-6 right-6 z-50 w-12 h-12 bg-primary-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 active:scale-95 transition-all"
          title="メニューを表示"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      )}
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
