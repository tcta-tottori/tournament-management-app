import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Entry, type Match, type Draw } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CheckSquare, UserCheck, UserPlus, Search, Eye, List, AlertCircle, ChevronDown, ChevronRight, ChevronUp, RotateCcw, Lock, Ban, Unlock } from 'lucide-react';
import ProcessingModal, { type ProcessingStep } from '../../components/ui/ProcessingModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

// 略称→正式名マッピング（時間割の略称がストアに残っている場合のフォールバック用）
const SCHEDULE_CODE_TO_NAME: Record<string, string> = {
  ms: '一般男子シングルス', ls: '一般女子シングルス',
  m35s: '男子35歳以上シングルス', m45s: '男子45歳以上シングルス',
  m55s: '男子55歳以上シングルス', m65s: '男子65歳以上シングルス',
  l45s: '女子45歳以上シングルス', mbs: '男子B級シングルス', lbs: '女子B級シングルス',
  md: '一般男子ダブルス', ld: '一般女子ダブルス',
  m45d: '男子45歳以上ダブルス', m55d: '男子55歳以上ダブルス',
  m65d: '男子65歳以上ダブルス', l45d: '女子45歳以上ダブルス',
  l55d: '女子55歳以上ダブルス', mbd: '男子B級ダブルス', lbd: '女子B級ダブルス',
};

// 日本語略称 ↔ 正式名の双方向マッピング（Excel時間割の略称とDB種目名）
// DB種目名は「男子シングルスA級」「男子B級シングルス」等、語順が異なる場合がある
const JP_ABBREV_PAIRS: [string, string][] = [
  // シングルス（両方の語順パターンを登録）
  ['男子A', '一般男子シングルス'], ['男子A', '男子シングルスA級'],
  ['男子B', '男子B級シングルス'], ['男子B', '男子シングルスB級'],
  ['男子C', '男子C級シングルス'], ['男子C', '男子シングルスC級'],
  ['男子35', '男子35歳以上シングルス'],
  ['男子45', '男子45歳以上シングルス'],
  ['男子55', '男子55歳以上シングルス'],
  ['男子65', '男子65歳以上シングルス'],
  ['女子A', '一般女子シングルス'], ['女子A', '女子シングルスA級'],
  ['女子B', '女子B級シングルス'], ['女子B', '女子シングルスB級'],
  ['女子C', '女子C級シングルス'], ['女子C', '女子シングルスC級'],
  ['女子45', '女子45歳以上シングルス'],
  ['女子55', '女子55歳以上シングルス'],
  ['女子65', '女子65歳以上シングルス'],
  // ダブルス
  ['男子AD', '一般男子ダブルス'], ['男子AD', '男子ダブルスA級'],
  ['男子BD', '男子B級ダブルス'], ['男子BD', '男子ダブルスB級'],
  ['男子CD', '男子C級ダブルス'], ['男子CD', '男子ダブルスC級'],
  ['男子35D', '男子35歳以上ダブルス'],
  ['男子45D', '男子45歳以上ダブルス'],
  ['男子55D', '男子55歳以上ダブルス'],
  ['男子65D', '男子65歳以上ダブルス'],
  ['女子AD', '一般女子ダブルス'], ['女子AD', '女子ダブルスA級'],
  ['女子BD', '女子B級ダブルス'], ['女子BD', '女子ダブルスB級'],
  ['女子45D', '女子45歳以上ダブルス'],
  ['女子55D', '女子55歳以上ダブルス'],
  ['女子65D', '女子65歳以上ダブルス'],
];

/** 種目名の柔軟マッチング: 略称・正式名・部分一致など複数の戦略で比較 */
function matchEventName(schedName: string, dbName: string): boolean {
  // 1. 完全一致
  if (schedName === dbName) return true;

  // 2. 空白・全角半角を正規化して比較
  const normA = schedName.replace(/[　\s]+/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toLowerCase();
  const normB = dbName.replace(/[　\s]+/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toLowerCase();
  if (normA === normB) return true;

  // 3. 部分一致（双方向）
  if (normA.length >= 2 && normB.length >= 2) {
    if (normB.includes(normA) || normA.includes(normB)) return true;
  }

  // 4. 日本語略称パターンマッチング
  for (const [abbrev, formal] of JP_ABBREV_PAIRS) {
    const normAbbrev = abbrev.toLowerCase();
    const normFormal = formal.replace(/[　\s]+/g, '').toLowerCase();
    // schedName が略称で dbName が正式名
    if (normA === normAbbrev && normB === normFormal) return true;
    // schedName が正式名で dbName が略称
    if (normA === normFormal && normB === normAbbrev) return true;
  }

  // 5. コア部分を抽出して比較（シングルス/ダブルス/級/歳以上 を除去）
  const stripSuffix = (s: string) => s
    .replace(/シングルス|ダブルス/g, '')
    .replace(/級/g, '')
    .replace(/歳以上/g, '')
    .replace(/一般/g, '')
    .trim();
  const coreA = stripSuffix(normA);
  const coreB = stripSuffix(normB);
  if (coreA.length >= 2 && coreB.length >= 2 && coreA === coreB) return true;

  return false;
}

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
  // DEF選手（isBye=true, entryId有）は通常のBYE（isBye=true, entryId無）と区別し、
  // 元のドロー位置を維持する
  const isRealBye = (s: CheckInSlot) => s.isBye && !s.entryId;
  const entrySlots = slots.filter(s => !isRealBye(s));
  const numByes = drawSize - entrySlots.length;
  if (numByes <= 0) return slots;

  const halfPos = drawSize / 2;
  const hasByeInFirstHalf = slots.some(s => isRealBye(s) && s.drawPosition <= halfPos);
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

  // 処理中モーダル
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [procModalTitle, setProcModalTitle] = useState('');
  const [procModalSteps, setProcModalSteps] = useState<ProcessingStep[]>([]);
  const [procModalProgress, setProcModalProgress] = useState(0);
  const [procModalResult, setProcModalResult] = useState<{ success: boolean; message: string } | null>(null);

  // 確認ダイアログ
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; danger?: boolean; confirmLabel?: string;
  }>({ open: false, title: '', message: '' });
  const confirmResolverRef = useRef<((v: boolean) => void) | null>(null);
  const requestConfirm = useCallback((opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) => {
    return new Promise<boolean>(resolve => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({ ...opts, open: true });
    });
  }, []);
  const handleConfirmOk = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    confirmResolverRef.current?.(true);
    confirmResolverRef.current = null;
  }, []);
  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    confirmResolverRef.current?.(false);
    confirmResolverRef.current = null;
  }, []);

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

  // === リーグ戦の対戦順を生成（サークル法） ===
  // 3人: 1-2, 2-3, 1-3 / 4人: 1-4, 2-3, 1-3, 2-4, 1-2, 3-4 ...
  const generateLeagueMatchOrder = (n: number): [number, number][] => {
    if (n < 2) return [];
    if (n === 2) return [[0, 1]];
    // 3人リーグ: 1-2, 2-3, 1-3
    if (n === 3) return [[0, 1], [1, 2], [0, 2]];
    // 4人以上: サークル法（ラウンドロビンスケジューリング）
    const pairs: [number, number][] = [];
    const isOdd = n % 2 !== 0;
    const total = isOdd ? n + 1 : n; // 奇数の場合ダミー追加
    const fixed = 0;
    const rotating = Array.from({ length: total - 1 }, (_, i) => i + 1);
    for (let round = 0; round < total - 1; round++) {
      // 固定位置 vs 最初のローテーション
      if (!isOdd || rotating[0] < n) {
        const a = fixed;
        const b = rotating[0];
        if (a < n && b < n) pairs.push([Math.min(a, b), Math.max(a, b)]);
      }
      // 残りをペア
      for (let i = 1; i <= (total - 2) / 2; i++) {
        const a = rotating[i];
        const b = rotating[total - 2 - i];
        if (a < n && b < n) pairs.push([Math.min(a, b), Math.max(a, b)]);
      }
      // ローテーション
      rotating.push(rotating.shift()!);
    }
    return pairs;
  };

  // === イベントがリーグかどうか判定 ===
  const isLeagueEvent = useCallback(async (eventId: string, draw: Draw) => {
    const event = await db.events.where('eventId').equals(eventId).first();
    const eventType = event?.type as string | undefined;
    const ds = draw.drawSize;
    const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
    return (
      eventType === 'league' || eventType === 'round-robin' ||
      draw.drawType === 'roundRobin' ||
      (ds > 0 && !isPowerOf2) ||
      /リーグ/i.test(event?.name || '')
    );
  }, []);

  // 種目名の正規化（マッチング用）
  const normalizeEventName = (name: string): string => {
    return name
      .replace(/[　\s]+/g, '')  // Remove all whitespace
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
      .replace(/級$/, '')
      .toLowerCase();
  };

  // ラウンド番号 → 時間割ラベル変換
  const roundNumberToLabel = (round: number, totalRounds: number): string => {
    if (round === totalRounds) return 'F';
    if (round === totalRounds - 1) return 'SF';
    if (round === totalRounds - 2) return 'QF';
    return `${round}R`;
  };

  // 全種目の対戦順を時間割ベースで再計算
  const recalculateGlobalMatchOrder = useCallback(async () => {
    const { importedSchedule, currentTournamentId: tid } = useAppStore.getState();
    if (importedSchedule.length === 0 || !tid) return;

    // 全種目・全試合を取得
    const allEvents = await db.events.where('tournamentId').equals(tid).toArray();
    const allEventIds = allEvents.map(e => e.eventId);
    if (allEventIds.length === 0) return;
    const allMatches = await db.matches.where('eventId').anyOf(allEventIds).toArray();
    if (allMatches.length === 0) return;
    const allDraws = await db.draws.where('eventId').anyOf(allEventIds).toArray();
    const drawMap = new Map(allDraws.map(d => [d.eventId, d]));

    // コートを準備
    const existingCourts = await db.courts.where('tournamentId').equals(tid).toArray();
    const courtNameToId = new Map(existingCourts.map(c => [c.name, c.courtId]));
    for (const item of importedSchedule) {
      if (!courtNameToId.has(item.courtName)) {
        const courtId = `C-${Date.now()}-${item.courtName}`;
        await db.courts.add({
          tournamentId: tid, courtId, name: item.courtName,
          surface: '', isAvailable: true, currentMatchId: null,
          order: existingCourts.length + 1,
        });
        courtNameToId.set(item.courtName, courtId);
      }
    }

    // 種目名 → eventId マッピング
    const eventNameMap = new Map<string, string>(); // normalizedName → eventId
    for (const evt of allEvents) {
      eventNameMap.set(normalizeEventName(evt.name), evt.eventId);
    }

    // 時間割アイテムを種目+ラウンドでグループ化
    // key: eventId|roundLabel
    const scheduleGrouped = new Map<string, typeof importedSchedule>();
    const unmatchedScheduleItems: string[] = [];
    for (const item of importedSchedule) {
      // 種目名マッチング（略称→正式名変換 + 柔軟マッチング）
      let matchedEventId: string | null = null;
      const resolvedName = SCHEDULE_CODE_TO_NAME[item.eventName.toLowerCase()] || item.eventName;
      for (const evt of allEvents) {
        if (matchEventName(resolvedName, evt.name)) {
          matchedEventId = evt.eventId;
          break;
        }
      }
      if (!matchedEventId) {
        unmatchedScheduleItems.push(`${item.eventName}(${item.roundLabel}@${item.startTime})`);
        continue;
      }

      const key = `${matchedEventId}|${item.roundLabel}`;
      if (!scheduleGrouped.has(key)) scheduleGrouped.set(key, []);
      scheduleGrouped.get(key)!.push(item);
    }

    // 各グループ内を startTime → courtName(数値) でソート
    for (const [, items] of scheduleGrouped) {
      items.sort((a, b) => {
        const timeCmp = a.startTime.localeCompare(b.startTime);
        if (timeCmp !== 0) return timeCmp;
        return (parseInt(a.courtName) || 0) - (parseInt(b.courtName) || 0);
      });
    }

    // デバッグ: マッチング状況をログ出力
    if (unmatchedScheduleItems.length > 0) {
      console.warn('[スケジュール紐付け] マッチしなかった時間割:', unmatchedScheduleItems.slice(0, 20));
    }
    console.log('[スケジュール紐付け] 時間割グループ数:', scheduleGrouped.size,
      '/ DB種目:', allEvents.map(e => e.name),
      '/ 時間割種目:', [...new Set(importedSchedule.map(i => i.eventName))]);

    // 試合を種目+ラウンドでグループ化して時間割とマッチング
    type MatchWithSchedule = { match: Match; startTime: string; courtName: string };
    const scheduled: MatchWithSchedule[] = [];
    const unscheduled: Match[] = [];

    // 種目+ラウンドごとの試合グループ
    const matchGrouped = new Map<string, Match[]>();
    for (const m of allMatches) {
      const draw = drawMap.get(m.eventId);
      if (!draw) { unscheduled.push(m); continue; }
      const totalRounds = Math.log2(draw.drawSize);
      const rLabel = roundNumberToLabel(m.round, totalRounds);
      // "1回戦" → "1R" 形式も試す
      const key = `${m.eventId}|${rLabel}`;
      if (!matchGrouped.has(key)) matchGrouped.set(key, []);
      matchGrouped.get(key)!.push(m);
    }

    // デバッグ: matchGroupedの各キーの試合数と状態
    for (const [key, matches] of matchGrouped) {
      const walkoverCount = matches.filter(m => m.status === 'walkover').length;
      const hasSchedule = scheduleGrouped.has(key);
      if (!hasSchedule || walkoverCount > 0) {
        console.log(`[紐付け] ${key}: 全${matches.length}試合(WO=${walkoverCount}), スケジュール=${hasSchedule ? scheduleGrouped.get(key)!.length + '枠' : 'なし'}`);
      }
    }

    // 各グループで試合をposition順にソートし、時間割スロットとzip
    for (const [key, matches] of matchGrouped) {
      const schedItems = scheduleGrouped.get(key);
      if (!schedItems || schedItems.length === 0) {
        // 時間割ラベルの別形式も試す (1R ↔ 1回戦)
        const [evtId, rLabel] = key.split('|');
        let altKey: string | null = null;
        if (/^\d+R$/.test(rLabel)) altKey = `${evtId}|${rLabel.replace('R', '回戦')}`;
        else if (/^\d+回戦$/.test(rLabel)) altKey = `${evtId}|${rLabel.replace('回戦', 'R')}`;
        else if (rLabel === 'F') altKey = `${evtId}|決勝`;
        else if (rLabel === '決勝') altKey = `${evtId}|F`;
        else if (rLabel === 'SF') altKey = `${evtId}|準決勝`;
        else if (rLabel === 'QF') altKey = `${evtId}|準々決勝`;

        const altItems = altKey ? scheduleGrouped.get(altKey) : null;
        if (!altItems || altItems.length === 0) {
          unscheduled.push(...matches);
          continue;
        }
        // Use alternative key items
        const playable2 = matches.filter(m => m.status !== 'walkover').sort((a, b) => a.position - b.position);
        let idx2 = 0;
        for (const si of altItems) {
          if (idx2 >= playable2.length) break;
          scheduled.push({ match: playable2[idx2], startTime: si.startTime, courtName: si.courtName });
          idx2++;
        }
        for (; idx2 < playable2.length; idx2++) unscheduled.push(playable2[idx2]);
        for (const m of matches.filter(m => m.status === 'walkover')) unscheduled.push(m);
        continue;
      }

      // 通常フロー: playable試合（walkover除外）をposition順にソートし、時間割スロットとzip
      const playable = matches.filter(m => m.status !== 'walkover').sort((a, b) => a.position - b.position);
      let idx = 0;
      for (const si of schedItems) {
        if (idx >= playable.length) break;
        scheduled.push({ match: playable[idx], startTime: si.startTime, courtName: si.courtName });
        idx++;
      }
      for (; idx < playable.length; idx++) unscheduled.push(playable[idx]);
      for (const m of matches.filter(m => m.status === 'walkover')) unscheduled.push(m);
    }

    // グローバルソート: startTime → courtName(数値)
    scheduled.sort((a, b) => {
      const timeCmp = a.startTime.localeCompare(b.startTime);
      if (timeCmp !== 0) return timeCmp;
      return (parseInt(a.courtName) || 0) - (parseInt(b.courtName) || 0);
    });

    // matchOrder を割り当てて DB 更新
    let order = 1;
    const updates: { id: number; matchOrder: number; courtId: string | null; scheduledTime: string | null }[] = [];

    for (const { match, startTime, courtName } of scheduled) {
      if (!match.id) continue;
      updates.push({
        id: match.id,
        matchOrder: order++,
        courtId: courtNameToId.get(courtName) || null,
        scheduledTime: startTime,
      });
    }

    // unscheduled は既存順序を維持
    const unscheduledSorted = unscheduled.sort((a, b) => {
      if (a.eventId !== b.eventId) return a.eventId.localeCompare(b.eventId);
      if (a.round !== b.round) return a.round - b.round;
      return a.position - b.position;
    });
    for (const m of unscheduledSorted) {
      if (!m.id) continue;
      updates.push({
        id: m.id,
        matchOrder: order++,
        courtId: m.courtId,
        scheduledTime: m.scheduledTime,
      });
    }

    // 一括更新
    await db.transaction('rw', db.matches, async () => {
      for (const u of updates) {
        await db.matches.update(u.id, {
          matchOrder: u.matchOrder,
          courtId: u.courtId,
          scheduledTime: u.scheduledTime,
          updatedAt: Date.now(),
        });
      }
    });
  }, []);

  // === エントリー確定（対戦表生成）===
  const handleConfirmEvent = useCallback(async (eventId: string, skipConfirm = false, skipReorder = false) => {
    // DBから最新データを直接取得（クロージャの古いデータに依存しない）
    const draw = await db.draws.where('eventId').equals(eventId).first();
    if (!draw) return;
    if (!skipConfirm) {
      const ok = await requestConfirm({ title: 'エントリー確定', message: 'エントリーを確定し対戦表を生成しますか？', confirmLabel: '確定する' });
      if (!ok) return;
    }

    // 処理中モーダル表示（skipConfirm=true の場合は呼び出し元が管理）
    const showModal = !skipConfirm;
    const evtName = events.find(e => e.eventId === eventId)?.name || eventId;
    if (showModal) {
      setProcModalTitle(`${evtName} 確定処理`);
      setProcModalSteps([
        { label: '対戦表を生成中...', status: 'loading' },
        { label: '時間割と紐付け', status: 'waiting' },
      ]);
      setProcModalProgress(0);
      setProcModalResult(null);
      setProcModalOpen(true);
    }

    try {
    // DBから最新のエントリーと選手データを取得
    const eventEntries = await db.entries.where('eventId').equals(eventId).toArray();
    const allPlayers = await db.players.toArray();
    const pMap = new Map(allPlayers.map(p => [p.playerId, p]));

    const resolvePlayerFromSlot = (slot: { entryId: string | null; isBye: boolean }) => {
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

    const isLeague = await isLeagueEvent(eventId, draw);
    const newMatches: Omit<Match, 'id'>[] = [];

    if (isLeague) {
      // === リーグ戦: ラウンドロビン対戦表生成 ===
      const playerSlots = draw.slots.filter(s => s.entryId && !s.isBye);
      const n = playerSlots.length;
      const matchPairs = generateLeagueMatchOrder(n);
      let matchOrder = 1;

      for (const [i, j] of matchPairs) {
        const p1Info = resolvePlayerFromSlot(playerSlots[i]);
        const p2Info = resolvePlayerFromSlot(playerSlots[j]);
        newMatches.push({
          eventId,
          matchId: `M-L-${matchOrder}`,
          round: 1,
          matchOrder,
          position: matchOrder,
          player1EntryId: p1Info.entryId,
          player2EntryId: p2Info.entryId,
          player1Name: p1Info.name,
          player2Name: p2Info.name,
          player1Affiliation: p1Info.affiliation,
          player2Affiliation: p2Info.affiliation,
          score: '',
          winnerEntryId: null,
          courtId: null,
          scheduledTime: null,
          status: 'waiting',
          refereeId: null,
          refereeName: '',
          updatedAt: Date.now()
        });
        matchOrder++;
      }
    } else {
      // === トーナメント戦: ブラケット対戦表生成 ===
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

      let matchOrder = 1;

      // 1回戦
      for (let i = 0; i < drawSlots.length; i += 2) {
        const s1 = drawSlots[i];
        const s2 = drawSlots[i + 1];
        if (!s1 || !s2) continue;
        if (s1.isBye && s2.isBye) continue;
        const isWalkover = s1.isBye || s2.isBye;
        const p1Info = resolvePlayerFromSlot(s1);
        const p2Info = resolvePlayerFromSlot(s2);

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
    }

    // 既存の試合を削除して新しく生成
    const existingMatches = await db.matches.where('eventId').equals(eventId).toArray();
    const existingIds = existingMatches.map(m => m.id).filter((id): id is number => id !== undefined);

    await db.transaction('rw', db.matches, async () => {
      if (existingIds.length > 0) await db.matches.bulkDelete(existingIds);
      await db.matches.bulkAdd(newMatches);
    });

    // トーナメント戦のみ: BYE勝ちの選手を次ラウンドに反映
    if (!isLeague) {
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
    }

    if (showModal) {
      setProcModalProgress(60);
      setProcModalSteps([
        { label: '対戦表を生成完了', status: 'done' },
        { label: '時間割と紐付け中...', status: 'loading' },
      ]);
    }

    // === 時間割に基づくグローバル対戦順再計算 ===
    if (!skipReorder) {
      await recalculateGlobalMatchOrder();
    }

    if (showModal) {
      setProcModalProgress(100);
      setProcModalSteps([
        { label: '対戦表を生成完了', status: 'done' },
        { label: '時間割と紐付け完了', status: 'done' },
      ]);
      setProcModalResult({ success: true, message: `${evtName} の対戦表を確定しました` });
    }
    } catch (err) {
      if (showModal) {
        setProcModalProgress(100);
        setProcModalSteps(prev => prev.map(s => s.status === 'loading' ? { ...s, status: 'error' as const, label: `エラー: ${(err as Error).message}` } : s));
        setProcModalResult({ success: false, message: `確定処理に失敗: ${(err as Error).message}` });
      }
    }
  }, [events, isLeagueEvent, recalculateGlobalMatchOrder]);

  const handleConfirmAll = useCallback(async () => {
    const currentDraws = eventIds.length > 0
      ? await db.draws.where('eventId').anyOf(eventIds).toArray()
      : [];
    const drawEventIds = new Set(currentDraws.map(d => d.eventId));
    const targets = events.filter(evt => drawEventIds.has(evt.eventId));
    if (targets.length === 0) return;
    const ok = await requestConfirm({ title: '全種目一括確定', message: `全${targets.length}種目のエントリーを確定し対戦表を生成しますか？`, confirmLabel: '確定する' });
    if (!ok) return;

    setProcModalTitle('全種目 一括確定');
    const initialSteps: ProcessingStep[] = targets.map(t => ({ label: t.name, status: 'waiting' as const }));
    initialSteps.push({ label: '時間割と紐付け', status: 'waiting' });
    setProcModalSteps(initialSteps);
    setProcModalProgress(0);
    setProcModalResult(null);
    setProcModalOpen(true);

    try {
      for (let i = 0; i < targets.length; i++) {
        setProcModalSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'loading', label: `${targets[i].name} を処理中...` } : s));
        setProcModalProgress(Math.round(((i) / (targets.length + 1)) * 100));
        await handleConfirmEvent(targets[i].eventId, true, true);
        setProcModalSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'done', label: targets[i].name } : s));
      }
      // 時間割紐付け
      setProcModalSteps(prev => prev.map((s, j) => j === targets.length ? { ...s, status: 'loading', label: '時間割と紐付け中...' } : s));
      setProcModalProgress(Math.round((targets.length / (targets.length + 1)) * 100));
      await recalculateGlobalMatchOrder();
      setProcModalSteps(prev => prev.map((s, j) => j === targets.length ? { ...s, status: 'done', label: '時間割と紐付け完了' } : s));
      setProcModalProgress(100);
      setProcModalResult({ success: true, message: `全${targets.length}種目の対戦表を確定しました` });
    } catch (err) {
      setProcModalResult({ success: false, message: `確定処理に失敗: ${(err as Error).message}` });
    }
  }, [events, eventIds, handleConfirmEvent, recalculateGlobalMatchOrder]);

  // === 確定リセット（対戦表削除）===
  const handleRevertConfirm = useCallback(async (eventId: string) => {
    const evtName = events.find(e => e.eventId === eventId)?.name || eventId;
    const ok = await requestConfirm({ title: '確定解除', message: `「${evtName}」の確定を解除し、対戦表を削除しますか？\nこの操作は取り消せません。`, danger: true, confirmLabel: '解除する' });
    if (!ok) return;
    const matches = await db.matches.where('eventId').equals(eventId).toArray();
    const ids = matches.map(m => m.id).filter((id): id is number => id !== undefined);
    if (ids.length > 0) {
      await db.matches.bulkDelete(ids);
    }
    // 時間割紐付けを再計算
    await recalculateGlobalMatchOrder();
  }, [events, recalculateGlobalMatchOrder]);

  // Summary stats
  const computeStats = useCallback((slots: CheckInSlot[]) => {
    const playerSlots = slots.filter(s => s.entry && !(!s.entry && s.isBye));
    const total = playerSlots.length;
    const checkedIn = playerSlots.filter(s => s.entry && s.entry.status === 'active' && confirmedIds.has(s.entryId!)).length;
    const absent = playerSlots.filter(s => s.entry && s.entry.status === 'withdrawn').length;
    const remaining = total - checkedIn - absent;
    return { total, checkedIn, absent, remaining };
  }, [confirmedIds]);

  // 確定済み種目を自動折りたたみ
  useEffect(() => {
    if (confirmedEventsSet.size > 0) {
      setCollapsedEvents(prev => {
        const next = new Set(prev);
        for (const id of confirmedEventsSet) next.add(id);
        return next;
      });
    }
  }, [confirmedEventsSet]);

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

            let borderClass = 'border-gray-300';
            let bgClass = 'bg-white';
            if (isWithdrawn) { bgClass = 'bg-orange-50/60'; borderClass = 'border-orange-200'; }
            else if (isConfirmed) { bgClass = 'bg-emerald-50/60'; borderClass = 'border-emerald-300'; }

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
                {slot.entry && (
                  <div className="flex items-center gap-0.5 flex-shrink-0 mr-1">
                    {isWithdrawn ? (
                      <>
                        <span className="text-[9px] font-bold text-orange-500 mr-0.5">DEF</span>
                        <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors" title="復元する"><RotateCcw className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleCheckIn(slot); }} className={`p-1 rounded transition-colors ${isConfirmed ? 'text-green-600 bg-green-100 hover:bg-green-200' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}><UserPlus className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" title="DEFにする"><Ban className="w-3.5 h-3.5" /></button>
                      </>
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

      // ラウンドr、位置iのサブツリーが全てBYEかを再帰的にチェック
      const isEmptySubtree = (r: number, i: number): boolean => {
        if (r === 0) return isBye(i);
        return isEmptySubtree(r - 1, i * 2) && isEmptySubtree(r - 1, i * 2 + 1);
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
          const topEmpty = isEmptySubtree(r, m * 2);
          const botEmpty = isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? getX(r) + getSlotW(r) : getX(r);
          const xN = getX(r + 1);
          const xM = (xS + xN) / 2;
          const yT = getY(r, m * 2) + SLOT_HEIGHT / 2;
          const yB = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
          const yM = getY(r + 1, m) + SLOT_HEIGHT / 2;

          if (topEmpty || botEmpty) {
            // 片方が全BYEサブツリー → ストレートライン
            const pY = topEmpty ? yB : yT;
            paths.push(<path key={`${keyPrefix}-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
            continue;
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
        let borderCls = 'border-gray-300', bgCls = 'bg-white';
        if (isWithdrawn) { bgCls = 'bg-orange-50/60'; borderCls = 'border-orange-200'; }
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
            {slot.entry && (
              <div className="flex items-center gap-0.5 flex-shrink-0 mr-1">
                {isWithdrawn ? (
                  <>
                    <span className="text-[9px] font-bold text-orange-500 mr-0.5">DEF</span>
                    <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors" title="復元する"><RotateCcw className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); handleCheckIn(slot); }} className={`p-1 rounded transition-colors ${isConfirmed ? 'text-green-600 bg-green-100 hover:bg-green-200' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}><UserPlus className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" title="DEFにする"><Ban className="w-3.5 h-3.5" /></button>
                  </>
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

    // === PC統一ブラケット（左山→中央←右山・レスポンシブ幅） ===
    const renderUnifiedBracket = () => {
      const leftSlotsU = displaySlots.slice(0, halfSize);
      const rightSlotsU = displaySlots.slice(halfSize);
      const halfRounds = Math.log2(halfSize);

      // レスポンシブ: 表示領域幅に合わせてブラケット線の間隔を自動計算
      const containerW = bracketWidth || 900;
      const PC_SLOT_W = 240; // PC用：少し広めのスロット幅
      const PC_SLOT_H = 40;  // PC用：少し高めのスロット高さ
      const PC_OFFSET_X = 16;
      // 固定幅 = 両端のスロット + パディング
      const fixedW = 2 * (PC_OFFSET_X + PC_SLOT_W);
      // 可変幅 = 中央ギャップ + 各半分のラウンド間隔
      const flexW = Math.max(containerW - fixedW, halfRounds * 2 * 30 + 40);
      // 1ラウンド分の間隔（各半分 halfRounds 個 + 中央ギャップ1個）
      const totalSegments = halfRounds * 2 + 1;
      const segW = flexW / totalSegments;
      const dynLineW = segW;   // 各ラウンド間の線幅
      const dynCenterGap = segW; // 中央ギャップ

      // 動的X位置計算（左半分用）
      const gxL = (r: number): number => {
        if (r === 0) return PC_OFFSET_X;
        return PC_OFFSET_X + PC_SLOT_W + (r - 1) * dynLineW + dynLineW;
      };
      // 左半分の最終X（準決勝出力位置）
      const leftEndX = gxL(halfRounds);
      const totalW = leftEndX + dynCenterGap + leftEndX; // 対称

      // mirrorX
      const mx = (x: number) => totalW - x;

      // Y位置計算ヘルパー
      const calcHalfY = (sectionSlots: CheckInSlot[], sectionSize: number) => {
        const isByeFn = (i: number): boolean => {
          const s = i < sectionSlots.length ? sectionSlots[i] : null;
          return !s || (s.isBye && !s.entry);
        };
        const r0Y: number[] = new Array(sectionSize).fill(0);
        let nextY = OFFSET_Y;
        for (let mi = 0; mi < sectionSize / 2; mi++) {
          const t = mi * 2, b = mi * 2 + 1;
          const tBye = isByeFn(t), bBye = isByeFn(b);
          if (tBye && bBye) { r0Y[t] = nextY; r0Y[b] = nextY; }
          else if (tBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
          else if (bBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
          else { r0Y[t] = nextY; r0Y[b] = nextY + Y_SPACING; nextY += Y_SPACING * 2; }
        }
        const getYFn = (r: number, i: number): number => {
          if (r === 0) return r0Y[i];
          return (getYFn(r - 1, i * 2) + getYFn(r - 1, i * 2 + 1)) / 2;
        };
        const isEmptySubtreeFn = (r: number, i: number): boolean => {
          if (r === 0) return isByeFn(i);
          return isEmptySubtreeFn(r - 1, i * 2) && isEmptySubtreeFn(r - 1, i * 2 + 1);
        };
        return { r0Y, getY: getYFn, height: nextY + PC_SLOT_H, isBye: isByeFn, isEmptySubtree: isEmptySubtreeFn };
      };

      const leftCalc = calcHalfY(leftSlotsU, halfSize);
      const rightCalc = calcHalfY(rightSlotsU, halfSize);
      const maxHeight = Math.max(leftCalc.height, rightCalc.height);
      const leftYOff = (maxHeight - leftCalc.height) / 2;
      const rightYOff = (maxHeight - rightCalc.height) / 2;

      const paths: React.ReactNode[] = [];

      // --- 左半分のブラケット線 ---
      for (let r = 0; r < halfRounds; r++) {
        const nm = halfSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const topEmpty = leftCalc.isEmptySubtree(r, m * 2);
          const botEmpty = leftCalc.isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? gxL(0) + PC_SLOT_W : gxL(r);
          const xN = gxL(r + 1);
          const xM = (xS + xN) / 2;
          const yT = leftCalc.getY(r, m * 2) + PC_SLOT_H / 2 + leftYOff;
          const yB = leftCalc.getY(r, m * 2 + 1) + PC_SLOT_H / 2 + leftYOff;
          const yM = leftCalc.getY(r + 1, m) + PC_SLOT_H / 2 + leftYOff;

          if (topEmpty || botEmpty) {
            const pY = topEmpty ? yB : yT;
            paths.push(<path key={`L-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
            continue;
          }

          paths.push(<path key={`L-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`L-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`L-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
        }
      }

      // --- 右半分のブラケット線（X座標ミラー） ---
      for (let r = 0; r < halfRounds; r++) {
        const nm = halfSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const topEmpty = rightCalc.isEmptySubtree(r, m * 2);
          const botEmpty = rightCalc.isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? mx(gxL(0) + PC_SLOT_W) : mx(gxL(r));
          const xN = mx(gxL(r + 1));
          const xM = (xS + xN) / 2;
          const yT = rightCalc.getY(r, m * 2) + PC_SLOT_H / 2 + rightYOff;
          const yB = rightCalc.getY(r, m * 2 + 1) + PC_SLOT_H / 2 + rightYOff;
          const yM = rightCalc.getY(r + 1, m) + PC_SLOT_H / 2 + rightYOff;

          if (topEmpty || botEmpty) {
            const pY = topEmpty ? yB : yT;
            paths.push(<path key={`R-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
            continue;
          }

          paths.push(<path key={`R-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`R-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
          paths.push(<path key={`R-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
        }
      }

      // --- 決勝接続線（左SF→中央←右SF） ---
      const leftFinalY = leftCalc.getY(halfRounds, 0) + PC_SLOT_H / 2 + leftYOff;
      const rightFinalX = mx(leftEndX);
      const rightFinalY = rightCalc.getY(halfRounds, 0) + PC_SLOT_H / 2 + rightYOff;
      const centerX = totalW / 2;
      const centerY = (leftFinalY + rightFinalY) / 2;
      paths.push(<path key="final-L" d={`M ${leftEndX} ${leftFinalY} L ${centerX} ${leftFinalY} L ${centerX} ${centerY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
      paths.push(<path key="final-R" d={`M ${rightFinalX} ${rightFinalY} L ${centerX} ${rightFinalY} L ${centerX} ${centerY}`} fill="none" stroke="#1b4d3e" strokeWidth="1.5" />);
      paths.push(<line key="final-tick" x1={centerX - 8} y1={centerY} x2={centerX + 8} y2={centerY} stroke="#1b4d3e" strokeWidth="2" />);

      // --- スロット描画ヘルパー ---
      const renderSlot = (slot: CheckInSlot, x: number, y: number, viNum: number, keyPrefix: string) => {
        const isWithdrawn = slot.entry?.status === 'withdrawn';
        const isConfirmed = slot.entryId ? confirmedIds.has(slot.entryId) : false;
        const isDimmed = hasSearch && slot.entry && !searchMatches.has(slot.drawPosition);
        const isHighlighted = hasSearch && searchMatches.has(slot.drawPosition);
        let borderCls = 'border-gray-300', bgCls = 'bg-white';
        if (isWithdrawn) { bgCls = 'bg-orange-50/60'; borderCls = 'border-orange-200'; }
        else if (isConfirmed) { bgCls = 'bg-emerald-50/60'; borderCls = 'border-emerald-300'; }
        return (
          <div key={`${keyPrefix}-slot-${slot.drawPosition}`}
            className={`absolute flex items-center border rounded shadow-sm transition-all ${borderCls} ${bgCls} ${isDimmed ? 'opacity-20' : ''} ${isHighlighted ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
            style={{ left: x, top: y, width: PC_SLOT_W, height: PC_SLOT_H }}>
            <div className="w-7 text-[11px] font-mono text-gray-400 text-center flex-shrink-0 border-r border-gray-100 self-stretch flex items-center justify-center">{viNum}</div>
            {slot.seed > 0 && <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full ml-1">{slot.seed}</div>}
            <div className="flex-1 min-w-0 mx-1.5 overflow-hidden">
              {slot.entry ? (
                <button onClick={() => handleCheckIn(slot)} className="text-left w-full group block" title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
                  <div className={`text-sm font-bold leading-tight truncate ${isWithdrawn ? 'line-through text-red-400' : 'text-gray-900 group-hover:text-primary-600'}`}>
                    {slot.playerName}{slot.partnerName && <span className="text-gray-500 font-bold"> / {slot.partnerName}</span>}
                  </div>
                  {slot.affiliation && !isWithdrawn && <div className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">{slot.affiliation}</div>}
                </button>
              ) : <span className="text-sm text-gray-300">---</span>}
            </div>
            {slot.entry && (
              <div className="flex items-center gap-0.5 flex-shrink-0 mr-1">
                {isWithdrawn ? (
                  <>
                    <span className="text-[10px] font-bold text-orange-500 mr-0.5">DEF</span>
                    <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors" title="復元する"><RotateCcw className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); handleCheckIn(slot); }} className={`p-1 rounded transition-colors ${isConfirmed ? 'text-green-600 bg-green-100 hover:bg-green-200' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}><UserPlus className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" title="DEFにする"><Ban className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      };

      // --- 左半分の選手スロット ---
      const elems: React.ReactNode[] = [];
      let vi = 0;
      for (let i = 0; i < halfSize; i++) {
        const slot = i < leftSlotsU.length ? leftSlotsU[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        elems.push(renderSlot(slot, gxL(0), leftCalc.r0Y[i] + leftYOff, vi, 'UL'));
      }

      // --- 右半分の選手スロット ---
      for (let i = 0; i < halfSize; i++) {
        const slot = i < rightSlotsU.length ? rightSlotsU[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        const x = mx(gxL(0)) - PC_SLOT_W;
        elems.push(renderSlot(slot, x, rightCalc.r0Y[i] + rightYOff, vi, 'UR'));
      }

      return (
        <div className="relative" style={{ width: totalW, height: maxHeight, minWidth: totalW }}>
          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={maxHeight}>{paths}</svg>
          {elems}
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
          DEF <strong className="text-gray-800">{slots.filter(s => s.entry?.status === 'withdrawn').length}</strong>
        </span>
      </div>
    ) : null;

    // ドローサイズ < 8 は単一表示、8以上はPC統一/スマホ分割
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
        {/* PC: 左山→中央←右山の統一ブラケット（レスポンシブ幅） */}
        <div className="hidden lg:block overflow-x-auto" ref={bracketRef}>
          {renderUnifiedBracket()}
        </div>
        {/* スマホ: 左山・右山を分割表示 */}
        <div className="lg:hidden">
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
      <div key={eventId} className={`rounded-xl shadow-sm border overflow-x-auto transition-all ${isConfirmedEvent ? 'bg-gray-100 border-gray-300' : 'bg-white border-border-main'}`}
        data-event-id={eventId} data-event-name={eventName}>
        {/* Event header */}
        <div className={`px-3 sm:px-4 py-2.5 sm:py-3 border-b flex items-center justify-between sticky top-0 z-10 ${isConfirmedEvent ? 'bg-gray-200 border-gray-300' : 'bg-primary-50 border-border-main'}`}>
          <button onClick={() => toggleCollapse(eventId)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            <h3 className={`font-bold text-sm ${isConfirmedEvent ? 'text-gray-400' : 'text-primary-600'}`}>{eventName}</h3>
            {isConfirmedEvent && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-300 text-gray-600 rounded text-[10px] font-bold">
                <Lock className="w-2.5 h-2.5" />確定済
              </span>
            )}
          </button>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
            {!isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleCheckInEvent(eventId); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-all min-h-[32px]">
                <UserCheck className="w-3.5 h-3.5" />全員受付
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleConfirmEvent(eventId); }}
              className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all min-h-[32px] ${isConfirmedEvent ? 'text-gray-500 bg-gray-50 border border-gray-200 hover:bg-gray-100' : 'text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm hover:from-orange-600 hover:to-amber-600'}`}>
              <Lock className="w-3.5 h-3.5" />{isConfirmedEvent ? '再確定' : '確定'}
            </button>
            {isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleRevertConfirm(eventId); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-red-500 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-all min-h-[32px]">
                <Unlock className="w-3.5 h-3.5" />解除
              </button>
            )}
            {!isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleResetEvent(eventId); }}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-400 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all min-h-[32px]">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">{stats.checkedIn}</span>
            <span className="text-gray-500">/</span>
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">{stats.total}</span>
            {stats.absent > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">{stats.absent} DEF</span>}
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

  // スクロール時のスティッキー種目名表示 + コントロール自動折りたたみ
  const contentRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const [bracketWidth, setBracketWidth] = useState(0);

  useEffect(() => {
    const el = bracketRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setBracketWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const desktopEl = contentRef.current;
    // モバイル: contentRefにはoverflow-y-autoがないため、<main>がスクロールコンテナ
    const mobileEl = desktopEl?.closest('main') as HTMLElement | null;
    if (!desktopEl) return;

    let lastScrollY = 0;
    const onScroll = (e: Event) => {
      const target = e.currentTarget as HTMLElement;
      const y = target.scrollTop;

      // モバイルのみ: 下スクロールでコントロールを折りたたむ（再表示はボタンクリックのみ）
      const isMobile = window.innerWidth < 1024;
      if (isMobile && y > 20 && y > lastScrollY) setControlsOpen(false);
      lastScrollY = y;

      // スクロール中の種目名検出（モバイル: 全モードで表示）
      const container = contentRef.current;
      if (container) {
        const sections = container.querySelectorAll('[data-event-name]');
        let currentName = '';
        for (const sec of sections) {
          const rect = (sec as HTMLElement).getBoundingClientRect();
          if (rect.top <= 100) {
            currentName = (sec as HTMLElement).dataset.eventName || '';
          }
        }
        setStickyEventName(y > 10 ? currentName : '');
      }
    };

    // Desktop (lg) と Mobile 両方のスクロールコンテナにリスナー登録
    desktopEl.addEventListener('scroll', onScroll, { passive: true });
    if (mobileEl && mobileEl !== desktopEl) {
      mobileEl.addEventListener('scroll', onScroll, { passive: true });
    }
    return () => {
      desktopEl.removeEventListener('scroll', onScroll);
      if (mobileEl && mobileEl !== desktopEl) {
        mobileEl.removeEventListener('scroll', onScroll);
      }
    };
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
    <div className="max-w-full mx-auto lg:h-full flex flex-col lg:flex-row lg:gap-4 p-4">
      {/* LEFT: コントロールパネル — モバイルでもスティッキー、スクロールで自動折りたたみ */}
      <div className="lg:w-[280px] shrink-0 order-1 lg:order-1 mb-3 lg:mb-0 sticky top-0 z-20 lg:self-start bg-bg-main pb-1">
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
                <button onClick={() => setShowAllEvents(true)}
                  className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  <List className="w-3.5 h-3.5" />すべて表示
                </button>
                <button onClick={() => setShowAllEvents(false)}
                  className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${!showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  <Eye className="w-3.5 h-3.5" />個別表示
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
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-all">
                    <UserCheck className="w-3.5 h-3.5" />全員受付済み
                  </button>
                  <button onClick={showAllEvents ? handleResetAll : () => selectedEventId && handleResetEvent(selectedEventId)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                    <RotateCcw className="w-3.5 h-3.5" />リセット
                  </button>
                  <button onClick={handleConfirmAll}
                    className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg shadow-sm hover:from-orange-600 hover:to-amber-600 transition-all">
                    <Lock className="w-3.5 h-3.5" />全種目確定
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* スティッキー種目名バー — モバイルのみ、コントロール直下に表示 */}
        {stickyEventName && (
          <div className="lg:hidden bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-md mt-1">
            {stickyEventName}
          </div>
        )}
      </div>

      {/* RIGHT: Main content area */}
      <div className="flex-1 min-w-0 order-2 lg:order-2 flex flex-col min-h-0">
        <div ref={contentRef} className="flex-1 lg:overflow-y-auto space-y-4 min-h-0">
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

      {/* 処理中モーダル */}
      <ProcessingModal
        open={procModalOpen}
        title={procModalTitle}
        steps={procModalSteps}
        progress={procModalProgress}
        result={procModalResult}
        onClose={() => setProcModalOpen(false)}
      />

      {/* 確認ダイアログ */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        danger={confirmDialog.danger}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={handleConfirmOk}
        onCancel={handleConfirmCancel}
      />
    </div>
  );
}
