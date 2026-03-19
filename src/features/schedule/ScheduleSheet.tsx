import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CalendarClock, Zap, Printer, Trash2, Upload, Download, FileSpreadsheet, Clock, Activity, CheckCircle2, PlayCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  extractMatchesFromDraw,
  autoSchedule,
  calcTimeString,
  type ScheduleConfig,
  type EventInfo,
  type Entry as ScheduleEntry,
  type Player as SchedulePlayer,
  type Draw as ScheduleDraw,
  type ScheduleMatch,
  type ScheduleSlot,
} from './scheduleEngine';

const EVENT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', print: '#DBEAFE' },
  { bg: 'bg-orange-100', text: 'text-orange-800', print: '#FFEDD5' },
  { bg: 'bg-green-100', text: 'text-green-800', print: '#DCFCE7' },
  { bg: 'bg-pink-100', text: 'text-pink-800', print: '#FCE7F3' },
  { bg: 'bg-purple-100', text: 'text-purple-800', print: '#F3E8FF' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', print: '#CFFAFE' },
  { bg: 'bg-amber-100', text: 'text-amber-800', print: '#FEF3C7' },
  { bg: 'bg-stone-100', text: 'text-stone-800', print: '#F5F5F4' },
];

function abbreviateEventName(name: string): string {
  return name
    .replace(/一般/g, '')
    .replace(/男子/g, 'M')
    .replace(/女子/g, 'W')
    .replace(/シングルス/g, 'S')
    .replace(/ダブルス/g, 'D')
    .replace(/ミックス/g, 'MX')
    .trim()
    .slice(0, 6);
}

/** インポートされたセルテキスト（例: "男子B 1R"）から種目名部分を抽出 */
function extractImportedEventName(cellText: string): string {
  // 末尾のラウンド表記を除去: 1R, 2R, QF, SF, F, １R 等
  // 全角→半角変換してからパース
  const normalized = cellText
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u3000]+/g, ' ')
    .trim();
  // "男子B 1R" → "男子B", "男子AQF" → "男子A", "女子45" → "女子45"
  const match = normalized.match(/^(.+?)\s*(\d+R|QF|SF|F)$/i);
  return match ? match[1].trim() : normalized;
}

/** scheduleEngine matchId → DB matchId のマッピングを構築 (eventId+round+position) */
function buildMatchMapping(
  scheduleMatches: ScheduleMatch[],
  dbMatches: Match[],
): Map<string, string> {
  const mapping = new Map<string, string>();
  const dbByKey = new Map<string, Match>();
  for (const m of dbMatches) {
    dbByKey.set(`${m.eventId}|${m.round}|${m.position}`, m);
  }
  for (const sm of scheduleMatches) {
    const key = `${sm.eventCode}|${sm.round}|${sm.matchNumInRound}`;
    const dbMatch = dbByKey.get(key);
    if (dbMatch) {
      mapping.set(sm.matchId, dbMatch.matchId);
    }
  }
  return mapping;
}

/** ScheduleSlots の matchId を DB matchId に変換 */
function applyMatchMapping(slots: ScheduleSlot[], mapping: Map<string, string>): ScheduleSlot[] {
  return slots.map(s => ({
    ...s,
    matchId: mapping.get(s.matchId) || s.matchId,
  }));
}

/** セルテキストから種目名とラウンド番号をパース */
function parseCellEventRound(cellText: string): { eventName: string; roundLabel: string } | null {
  const normalized = cellText
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u3000]+/g, ' ')
    .trim();
  const match = normalized.match(/^(.+?)\s*(\d+R|QF|SF|F)$/i);
  if (!match) return null;
  return { eventName: match[1].trim(), roundLabel: match[2].toUpperCase() };
}

/** ラウンドラベルからラウンド番号を算出 */
function parseRoundFromLabel(label: string, totalRounds: number | null): number | null {
  const upper = label.toUpperCase().trim();
  const rMatch = upper.match(/^(\d+)R$/);
  if (rMatch) return parseInt(rMatch[1]);
  if (totalRounds === null) return null;
  if (upper === 'F') return totalRounds;
  if (upper === 'SF') return totalRounds - 1;
  if (upper === 'QF') return totalRounds - 2;
  return null;
}

/** 種目名を DB event に照合（あいまいマッチング） */
function findMatchingEvent(
  cellEventName: string,
  events: { eventId: string; name: string }[],
): { eventId: string; name: string } | undefined {
  const norm = cellEventName.replace(/[級組]/g, '').trim();
  return (
    events.find(e => e.name === cellEventName) ||
    events.find(e => e.name.includes(cellEventName)) ||
    events.find(e => cellEventName.includes(e.name)) ||
    events.find(e => abbreviateEventName(e.name) === abbreviateEventName(cellEventName)) ||
    events.find(e => {
      const n = e.name.replace(/[級組]/g, '').trim();
      return n.includes(norm) || norm.includes(n);
    })
  );
}

/** DB Match のステータスに応じたバッジカラー */
function matchStatusColor(status: Match['status']): string {
  switch (status) {
    case 'playing': return 'bg-green-500';
    case 'finished': return 'bg-gray-600';
    case 'ready': return 'bg-blue-400';
    case 'walkover': return 'bg-gray-300';
    default: return '';
  }
}

export default function ScheduleSheet() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const scheduleConfig = useAppStore(state => state.scheduleConfig);
  const setScheduleConfig = useAppStore(state => state.setScheduleConfig);

  // Config (persisted in Zustand store)
  const courtBlocks = scheduleConfig.courtBlocks;
  const matchDuration = scheduleConfig.matchDuration;
  const startTime = scheduleConfig.startTime;

  const setCourtBlocks = useCallback((updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => {
    if (typeof updater === 'function') {
      setScheduleConfig({ courtBlocks: updater(courtBlocks) });
    } else {
      setScheduleConfig({ courtBlocks: updater });
    }
  }, [courtBlocks, setScheduleConfig]);

  const setMatchDuration = useCallback((val: number) => {
    setScheduleConfig({ matchDuration: val });
  }, [setScheduleConfig]);

  const setStartTime = useCallback((val: string) => {
    setScheduleConfig({ startTime: val });
  }, [setScheduleConfig]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Schedule data (persisted in store across navigation)
  const scheduleSlots = useAppStore((s) => s.scheduleSlots);
  const setScheduleSlots = useAppStore((s) => s.setScheduleSlots);
  const allScheduleMatches = useAppStore((s) => s.allScheduleMatches);
  const setAllScheduleMatches = useAppStore((s) => s.setAllScheduleMatches);

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Swap interaction
  const [selectedCell, setSelectedCell] = useState<{
    matchId: string;
    courtIdx: number;
    slotIdx: number;
  } | null>(null);

  // --------------- Current time tracking ---------------
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000); // 30秒更新
    return () => clearInterval(timer);
  }, []);

  const currentTimeStr = useMemo(() => {
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, [now]);

  // 現在時刻がどのスロットに対応するか
  const currentSlotIndex = useMemo(() => {
    if (!startTime) return -1;
    const [sh, sm] = startTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < startMin) return -1;
    return Math.floor((nowMin - startMin) / matchDuration);
  }, [now, startTime, matchDuration]);

  // --------------- Reactive queries ---------------

  const events = useLiveQuery(
    () =>
      currentTournamentId
        ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
        : [],
    [currentTournamentId],
  ) || [];

  const tournament = useLiveQuery(
    () =>
      currentTournamentId
        ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
        : undefined,
    [currentTournamentId],
  );

  // DB matches (リアクティブ: スコア変更・対戦決定時に自動更新)
  const allDbMatches = useLiveQuery(
    async () => {
      if (!currentTournamentId) return [];
      const allEvts = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const matches: Match[] = [];
      for (const evt of allEvts) {
        const m = await db.matches.where('eventId').equals(evt.eventId).toArray();
        matches.push(...m);
      }
      return matches;
    },
    [currentTournamentId, events.length],
  ) || [];

  const dbMatchMap = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of allDbMatches) map.set(m.matchId, m);
    return map;
  }, [allDbMatches]);

  // --------------- Progress stats ---------------
  const progressStats = useMemo(() => {
    if (scheduleSlots.length === 0) return null;
    let total = 0, finished = 0, playing = 0, waiting = 0;
    for (const slot of scheduleSlots) {
      total++;
      const dbMatch = dbMatchMap.get(slot.matchId);
      if (dbMatch?.status === 'finished' || dbMatch?.status === 'walkover') finished++;
      else if (dbMatch?.status === 'playing') playing++;
      else waiting++;
    }
    const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, finished, playing, waiting, pct };
  }, [scheduleSlots, dbMatchMap]);

  // --------------- Derived data ---------------

  const courtNames = useMemo(() => {
    const names: string[] = [];
    if (courtBlocks.A) names.push('1', '2', '3', '4');
    if (courtBlocks.B) names.push('5', '6', '7', '8');
    if (courtBlocks.C) names.push('9', '10', '11', '12');
    if (courtBlocks.D) names.push('13', '14', '15', '16');
    return names;
  }, [courtBlocks]);

  const eventColorMap = useMemo(() => {
    const map = new Map<string, (typeof EVENT_COLORS)[0]>();
    events.forEach((e, idx) => {
      map.set(e.eventId, EVENT_COLORS[idx % EVENT_COLORS.length]);
    });
    return map;
  }, [events]);

  // インポートされたセルから種目名→色のマップ（DB種目がない場合用）
  const importedEventColorMap = useMemo(() => {
    const map = new Map<string, (typeof EVENT_COLORS)[0]>();
    if (scheduleSlots.some(s => s.eventCode === 'imported')) {
      const seenNames = new Set<string>();
      let colorIdx = 0;
      for (const slot of scheduleSlots) {
        if (slot.eventCode !== 'imported') continue;
        const evName = extractImportedEventName(slot.roundLabel);
        if (!seenNames.has(evName)) {
          seenNames.add(evName);
          map.set(evName, EVENT_COLORS[colorIdx % EVENT_COLORS.length]);
          colorIdx++;
        }
      }
    }
    return map;
  }, [scheduleSlots]);

  // DBから既存のスケジュールデータを復元（初回のみ）
  const scheduleRestoredRef = useRef(false);
  const prevTournamentIdRef = useRef(currentTournamentId);
  // 大会が変わったらリセット
  if (prevTournamentIdRef.current !== currentTournamentId) {
    prevTournamentIdRef.current = currentTournamentId;
    scheduleRestoredRef.current = false;
  }
  useEffect(() => {
    if (!currentTournamentId || events.length === 0) return;
    // 既にスロットが存在する場合や復元済みの場合はスキップ
    if (scheduleRestoredRef.current) return;

    const loadExistingSchedule = async () => {
      try {
        const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
        const allPlayers = await db.players.toArray();
        const playersList: SchedulePlayer[] = allPlayers.map(p => ({ playerId: p.playerId, name: p.name }));
        const allCourts = await db.courts.where('tournamentId').equals(currentTournamentId).toArray();
        const courtIdToName = new Map(allCourts.map(c => [c.courtId, c.name]));

        let restoredMatches: ScheduleMatch[] = [];
        const restoredSlots: ScheduleSlot[] = [];
        let hasSchedule = false;

        // まず全DB matchesからスケジュール済みの時刻を収集して startTime / matchDuration を推定
        const allScheduledTimes: number[] = [];
        for (const evt of allEvents) {
          const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
          for (const m of dbMatches) {
            if (m.scheduledTime) {
              const parts = m.scheduledTime.split(':');
              allScheduledTimes.push(parseInt(parts[0]) * 60 + parseInt(parts[1]));
            }
          }
        }

        if (allScheduledTimes.length === 0) {
          // スケジュールデータなし → 復元不要
          scheduleRestoredRef.current = true;
          return;
        }

        // startTime を推定（最も早い時刻）
        allScheduledTimes.sort((a, b) => a - b);
        const detectedStartMin = allScheduledTimes[0];
        const detectedStartTime = `${String(Math.floor(detectedStartMin / 60)).padStart(2, '0')}:${String(detectedStartMin % 60).padStart(2, '0')}`;

        // matchDuration を推定（連続した時刻の差分の最頻値）
        const uniqueTimes = [...new Set(allScheduledTimes)].sort((a, b) => a - b);
        let detectedDuration = matchDuration; // フォールバック
        if (uniqueTimes.length >= 2) {
          const diffs: number[] = [];
          for (let i = 1; i < uniqueTimes.length; i++) {
            const diff = uniqueTimes[i] - uniqueTimes[i - 1];
            if (diff > 0 && diff <= 120) diffs.push(diff);
          }
          if (diffs.length > 0) {
            // 最頻値を使用
            const freq = new Map<number, number>();
            for (const d of diffs) freq.set(d, (freq.get(d) || 0) + 1);
            let maxFreq = 0;
            for (const [d, count] of freq) {
              if (count > maxFreq) {
                maxFreq = count;
                detectedDuration = d;
              }
            }
          }
        }

        // 使用コートブロックを推定
        const usedCourtNames = new Set<string>();

        for (let idx = 0; idx < allEvents.length; idx++) {
          const evt = allEvents[idx];
          const draw = await db.draws.where('eventId').equals(evt.eventId).first();
          if (!draw || draw.drawType === 'roundRobin') continue;

          const entries = await db.entries.where('eventId').equals(evt.eventId).toArray();
          const eventInfo: EventInfo = { eventCode: evt.eventId, eventName: evt.name, eventOrder: idx };
          const drawData: ScheduleDraw = { eventId: evt.eventId, drawSize: draw.drawSize, slots: draw.slots };
          const entryList: ScheduleEntry[] = entries.map(e => ({ entryId: e.entryId, playerId: e.playerId, partnerId: e.partnerId }));
          const extracted = extractMatchesFromDraw(drawData, entryList, playersList, eventInfo);
          restoredMatches = restoredMatches.concat(extracted);

          // DBのmatchデータからスケジュールスロットを復元
          const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
          for (const m of dbMatches) {
            if (m.scheduledTime && m.courtId) {
              hasSchedule = true;
              const courtName = courtIdToName.get(m.courtId) || '';
              const schedMatch = extracted.find(sm =>
                sm.eventCode === evt.eventId && sm.round === m.round && sm.matchNumInRound === m.position
              );
              if (courtName) {
                usedCourtNames.add(courtName);
                // timeSlotIndexを逆算（推定した startTime / matchDuration を使用）
                const timeParts = m.scheduledTime.split(':');
                const matchMin = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
                const slotIdx = Math.round((matchMin - detectedStartMin) / detectedDuration);

                // courtIndex は全コート名リストから探す（現在の courtNames 設定に依存しない）
                const allCourtNamesList = allCourts.map(c => c.name);

                restoredSlots.push({
                  matchId: m.matchId,
                  courtIndex: allCourtNamesList.indexOf(courtName),
                  courtName,
                  timeSlotIndex: slotIdx >= 0 ? slotIdx : 0,
                  startTime: m.scheduledTime,
                  eventCode: evt.eventId,
                  roundLabel: schedMatch?.roundLabel || `${m.round}R`,
                });
              }
            }
          }
        }

        if (hasSchedule && restoredSlots.length > 0) {
          scheduleRestoredRef.current = true;
          setScheduleSlots(restoredSlots);
          setAllScheduleMatches(restoredMatches);

          // 推定した設定を反映（Zustand store に保存）
          setScheduleConfig({
            startTime: detectedStartTime,
            matchDuration: detectedDuration,
          });

          // 使用コートブロックを推定して反映
          const courtNums = [...usedCourtNames].map(n => parseInt(n, 10)).filter(n => !isNaN(n));
          if (courtNums.length > 0) {
            setScheduleConfig({
              courtBlocks: {
                A: courtNums.some(n => n >= 1 && n <= 4),
                B: courtNums.some(n => n >= 5 && n <= 8),
                C: courtNums.some(n => n >= 9 && n <= 12),
                D: courtNums.some(n => n >= 13 && n <= 16),
              },
            });
          }
        } else {
          scheduleRestoredRef.current = true;
        }
      } catch (err) {
        console.error('スケジュール復元エラー:', err);
        scheduleRestoredRef.current = true;
      }
    };

    loadExistingSchedule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTournamentId, events.length]);

  // --- 自動紐付け: DB matches が変わったら未紐付けスロットを再リンク ---
  const prevDbMatchIdsRef = useRef('');
  useEffect(() => {
    if (scheduleSlots.length === 0 || allDbMatches.length === 0) return;

    // DB matchIds が変わった場合のみ処理
    const currentKey = allDbMatches.map(m => m.matchId).sort().join(',');
    if (currentKey === prevDbMatchIdsRef.current) return;
    prevDbMatchIdsRef.current = currentKey;

    // 未紐付けスロットがあるかチェック
    const hasStale = scheduleSlots.some(s =>
      s.eventCode !== 'imported' && !dbMatchMap.has(s.matchId)
    );
    if (!hasStale) return;

    // allScheduleMatches 経由で再マッピング
    if (allScheduleMatches.length > 0) {
      const mapping = buildMatchMapping(allScheduleMatches, allDbMatches);
      if (mapping.size > 0) {
        const relinked = applyMatchMapping(scheduleSlots, mapping);
        if (!relinked.every((s, i) => s.matchId === scheduleSlots[i].matchId)) {
          setScheduleSlots(relinked);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDbMatches]);

  const gridData = useMemo(() => {
    if (scheduleSlots.length === 0) return null;

    const maxSlotIdx = Math.max(...scheduleSlots.map(s => s.timeSlotIndex), 0);
    const timeHeaders: string[] = [];
    for (let i = 0; i <= maxSlotIdx; i++) {
      timeHeaders.push(calcTimeString(startTime, i, matchDuration));
    }

    // Build grid: courtName -> slotIdx -> ScheduleSlot
    const grid = new Map<string, Map<number, ScheduleSlot>>();
    for (const cn of courtNames) {
      grid.set(cn, new Map());
    }
    for (const slot of scheduleSlots) {
      const courtMap = grid.get(slot.courtName);
      if (courtMap) courtMap.set(slot.timeSlotIndex, slot);
    }

    return { timeHeaders, grid, maxSlotIdx };
  }, [scheduleSlots, courtNames, startTime, matchDuration]);

  // --------------- Handlers ---------------

  const handleGenerate = useCallback(async () => {
    if (!currentTournamentId || courtNames.length === 0) return;
    setIsGenerating(true);
    setStatusMessage('');
    setSelectedCell(null);

    try {
      // Ensure courts exist in DB
      const existingCourts = await db.courts
        .where('tournamentId')
        .equals(currentTournamentId)
        .toArray();
      const existingCourtNames = new Set(existingCourts.map(c => c.name));
      for (let i = 0; i < courtNames.length; i++) {
        if (!existingCourtNames.has(courtNames[i])) {
          await db.courts.add({
            tournamentId: currentTournamentId,
            courtId: `C-${Date.now()}-${i}`,
            name: courtNames[i],
            surface: '',
            isAvailable: true,
            currentMatchId: null,
            order: existingCourts.length + i + 1,
          });
        }
      }

      const allCourts = await db.courts
        .where('tournamentId')
        .equals(currentTournamentId)
        .toArray();
      const courtNameToId = new Map(allCourts.map(c => [c.name, c.courtId]));

      // Load all data
      const allEvents = await db.events
        .where('tournamentId')
        .equals(currentTournamentId)
        .toArray();
      const allPlayers = await db.players.toArray();
      const playersList: SchedulePlayer[] = allPlayers.map(p => ({
        playerId: p.playerId,
        name: p.name,
      }));

      let allMatches: ScheduleMatch[] = [];
      for (let idx = 0; idx < allEvents.length; idx++) {
        const evt = allEvents[idx];
        const draw = await db.draws.where('eventId').equals(evt.eventId).first();
        if (!draw || draw.drawType === 'roundRobin') continue;

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

        allMatches = allMatches.concat(
          extractMatchesFromDraw(drawData, entryList, playersList, eventInfo),
        );
      }

      if (allMatches.length === 0) {
        setStatusMessage(
          'スケジュール対象の試合がありません。ドローデータを先に読み込んでください。',
        );
        setIsGenerating(false);
        return;
      }

      const config: ScheduleConfig = {
        courtCount: courtNames.length,
        courtNames,
        matchDuration,
        startTime,
      };
      const rawSlots = autoSchedule(allMatches, config);

      // scheduleEngine matchId → DB matchId マッピングを構築して紐付け
      const allDbMatchesForLink: Match[] = [];
      for (const evt of allEvents) {
        const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
        allDbMatchesForLink.push(...dbMatches);
      }
      const mapping = buildMatchMapping(allMatches, allDbMatchesForLink);
      const linkedSlots = applyMatchMapping(rawSlots, mapping);

      // DB matches に courtId, scheduledTime を反映
      for (const slot of linkedSlots) {
        const dbMatch = allDbMatchesForLink.find(m => m.matchId === slot.matchId);
        if (dbMatch?.id) {
          const courtId = courtNameToId.get(slot.courtName) || null;
          await db.matches.update(dbMatch.id, {
            courtId,
            scheduledTime: slot.startTime,
            updatedAt: Date.now(),
          });
        }
      }

      setScheduleSlots(linkedSlots);
      setAllScheduleMatches(allMatches);

      const uniqueCourts = new Set(linkedSlots.map(s => s.courtName));
      setStatusMessage(
        `${linkedSlots.length}試合を${uniqueCourts.size}コートに配置しました。`,
      );
    } catch (err) {
      console.error(err);
      setStatusMessage(`生成に失敗しました: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [currentTournamentId, courtNames, matchDuration, startTime]);

  const handleCellClick = useCallback(
    (matchId: string, courtIdx: number, slotIdx: number) => {
      if (!selectedCell) {
        setSelectedCell({ matchId, courtIdx, slotIdx });
        return;
      }

      if (selectedCell.matchId === matchId) {
        setSelectedCell(null);
        return;
      }

      // Swap the two slots
      const newSlots = [...scheduleSlots];
      const idx1 = newSlots.findIndex(s => s.matchId === selectedCell.matchId);
      const idx2 = newSlots.findIndex(s => s.matchId === matchId);
      if (idx1 !== -1 && idx2 !== -1) {
        const temp = {
          courtIndex: newSlots[idx1].courtIndex,
          courtName: newSlots[idx1].courtName,
          timeSlotIndex: newSlots[idx1].timeSlotIndex,
          startTime: newSlots[idx1].startTime,
        };
        newSlots[idx1] = {
          ...newSlots[idx1],
          courtIndex: newSlots[idx2].courtIndex,
          courtName: newSlots[idx2].courtName,
          timeSlotIndex: newSlots[idx2].timeSlotIndex,
          startTime: newSlots[idx2].startTime,
        };
        newSlots[idx2] = { ...newSlots[idx2], ...temp };
        setScheduleSlots(newSlots);
      }

      setSelectedCell(null);
    },
    [selectedCell],
  );

  const handleClear = useCallback(async () => {
    if (!currentTournamentId) return;
    if (!confirm('時間割データをクリアしますか？')) return;

    const allEvents = await db.events
      .where('tournamentId')
      .equals(currentTournamentId)
      .toArray();
    for (const evt of allEvents) {
      const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
      for (const m of dbMatches) {
        if (m.id && (m.courtId || m.scheduledTime)) {
          await db.matches.update(m.id, {
            courtId: null,
            scheduledTime: null,
            updatedAt: Date.now(),
          });
        }
      }
    }

    setScheduleSlots([]);
    setAllScheduleMatches([]);
    setSelectedCell(null);
    setStatusMessage('時間割をクリアしました。');
  }, [currentTournamentId]);

  const handlePrint = useCallback(() => {
    if (!gridData || scheduleSlots.length === 0) return;

    const tournamentName = tournament?.name || '';
    const tournamentDate = tournament?.date || '';

    // Build event color map for print
    const printColorMap = new Map<string, string>();
    events.forEach((e, idx) => {
      printColorMap.set(e.eventId, EVENT_COLORS[idx % EVENT_COLORS.length].print);
    });

    // Build event name map
    const eventNameMap = new Map<string, string>();
    events.forEach(e => eventNameMap.set(e.eventId, e.name));

    // Build match info map from allScheduleMatches
    const matchInfoMap = new Map<string, ScheduleMatch>();
    allScheduleMatches.forEach(m => matchInfoMap.set(m.matchId, m));

    const { timeHeaders, maxSlotIdx } = gridData;

    // Grid rows HTML
    let gridRows = '';
    for (const cn of courtNames) {
      let cells = `<td style="padding:4px 8px;font-weight:bold;border:1px solid #ccc;background:#f5f5f5;text-align:center;white-space:nowrap;">${cn}</td>`;
      for (let si = 0; si <= maxSlotIdx; si++) {
        const slot = scheduleSlots.find(
          s => s.courtName === cn && s.timeSlotIndex === si,
        );
        if (slot) {
          const match = matchInfoMap.get(slot.matchId);
          const evName = match ? abbreviateEventName(match.eventName) : '';
          const bg = printColorMap.get(slot.eventCode) || '#fff';
          cells += `<td style="padding:2px 4px;border:1px solid #ccc;background:${bg};text-align:center;font-size:10px;white-space:nowrap;">${evName}<br/>${slot.roundLabel}</td>`;
        } else {
          cells += `<td style="border:1px solid #eee;"></td>`;
        }
      }
      gridRows += `<tr>${cells}</tr>`;
    }

    // Time header row
    let headerCells =
      '<th style="padding:4px 8px;border:1px solid #ccc;background:#1a365d;color:white;font-size:11px;">コート</th>';
    for (let si = 0; si <= maxSlotIdx; si++) {
      headerCells += `<th style="padding:2px 4px;border:1px solid #ccc;background:#1a365d;color:white;font-size:10px;white-space:nowrap;">${timeHeaders[si]}</th>`;
    }

    // Event schedule lists
    let eventListHtml = '';
    const slotsByEvent = new Map<string, ScheduleSlot[]>();
    for (const slot of scheduleSlots) {
      if (!slotsByEvent.has(slot.eventCode)) slotsByEvent.set(slot.eventCode, []);
      slotsByEvent.get(slot.eventCode)!.push(slot);
    }

    for (const [eventCode, eventSlots] of slotsByEvent) {
      const evName = eventNameMap.get(eventCode) || eventCode;
      const sorted = [...eventSlots].sort((a, b) => a.timeSlotIndex - b.timeSlotIndex);
      let rows = '';
      for (const s of sorted) {
        const match = matchInfoMap.get(s.matchId);
        const players = match ? match.players.join(' vs ') : '';
        rows += `<tr><td style="padding:2px 6px;border:1px solid #ddd;font-size:11px;">${s.startTime}</td><td style="padding:2px 6px;border:1px solid #ddd;font-size:11px;text-align:center;">${s.courtName}</td><td style="padding:2px 6px;border:1px solid #ddd;font-size:11px;">${s.roundLabel}</td><td style="padding:2px 6px;border:1px solid #ddd;font-size:11px;">${players}</td></tr>`;
      }
      eventListHtml += `<div style="margin-top:12px;"><h3 style="font-size:13px;font-weight:bold;margin-bottom:4px;">${evName}</h3><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="padding:2px 6px;border:1px solid #ccc;background:#f0f0f0;font-size:10px;">時間</th><th style="padding:2px 6px;border:1px solid #ccc;background:#f0f0f0;font-size:10px;">コート</th><th style="padding:2px 6px;border:1px solid #ccc;background:#f0f0f0;font-size:10px;">ラウンド</th><th style="padding:2px 6px;border:1px solid #ccc;background:#f0f0f0;font-size:10px;">対戦</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>時間割 - ${tournamentName}</title>
<style>
  @page { size: A4 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<div style="padding:10px;">
  <h1 style="font-size:18px;text-align:center;margin-bottom:2px;">時間割表</h1>
  <p style="font-size:12px;text-align:center;margin-bottom:10px;">${tournamentName}　${tournamentDate}</p>
  <div style="overflow-x:auto;">
    <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${gridRows}</tbody>
    </table>
  </div>
  <div style="margin-top:20px;page-break-before:auto;">
    <h2 style="font-size:14px;margin-bottom:8px;">種目別スケジュール</h2>
    ${eventListHtml}
  </div>
</div>
</body></html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 500);
    }
  }, [gridData, scheduleSlots, allScheduleMatches, courtNames, tournament, events]);

  // --------------- Excel Export ---------------

  const handleExcelExport = useCallback(() => {
    if (!gridData || scheduleSlots.length === 0) return;

    const matchInfoMap = new Map<string, ScheduleMatch>();
    allScheduleMatches.forEach(m => matchInfoMap.set(m.matchId, m));

    // Build rows: header + court rows
    const headerRow = ['コート', ...gridData.timeHeaders];
    const rows: (string | null)[][] = [headerRow];

    for (const cn of courtNames) {
      const row: (string | null)[] = [cn];
      for (let si = 0; si <= gridData.maxSlotIdx; si++) {
        const slot = scheduleSlots.find(s => s.courtName === cn && s.timeSlotIndex === si);
        if (slot) {
          const match = matchInfoMap.get(slot.matchId);
          const evName = match ? abbreviateEventName(match.eventName) : '';
          row.push(`${evName} ${slot.roundLabel}`);
        } else {
          row.push(null);
        }
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '時間割');
    const fileName = tournament?.name ? `時間割_${tournament.name}.xlsx` : '時間割.xlsx';
    XLSX.writeFile(wb, fileName);
  }, [gridData, scheduleSlots, allScheduleMatches, courtNames, tournament]);

  // --------------- Excel Import ---------------

  /** Excelシリアル値(0-1)または文字列からHH:MM形式に変換 */
  const excelTimeToString = (val: unknown): string | null => {
    if (val == null) return null;
    const num = Number(val);
    // Excelシリアル値 (0.375 = 9:00, 0.416667 = 10:00, etc.)
    if (!isNaN(num) && num > 0 && num < 1) {
      const totalMinutes = Math.round(num * 24 * 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const str = String(val).trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) return str.padStart(5, '0');
    return null;
  };

  /** 「コートNO.」「コート」行を自動検出してスケジュールグリッドの開始行を見つける */
  const findScheduleGrid = (rows: (string | number | null)[][]): {
    headerRowIdx: number;
    dataStartIdx: number;
    timeColumns: { colIdx: number; time: string }[];
  } | null => {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      const firstCell = String(row[0] ?? '').replace(/[\s\u3000]+/g, '').trim();
      // 「コートNO.」「コートNo.」「コート」をヘッダー行と判定
      if (!/^コート(NO\.?|No\.?)?$/i.test(firstCell)) continue;

      // この行から時刻カラムを抽出
      const timeColumns: { colIdx: number; time: string }[] = [];
      for (let c = 1; c < row.length; c++) {
        const time = excelTimeToString(row[c]);
        if (time) timeColumns.push({ colIdx: c, time });
      }
      if (timeColumns.length > 0) {
        return { headerRowIdx: r, dataStartIdx: r + 1, timeColumns };
      }
    }
    return null;
  };

  const handleExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTournamentId) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) {
        setStatusMessage('Excelのデータが不足しています（ヘッダー行＋データ行が必要です）。');
        return;
      }

      // スケジュールグリッドを自動検出
      const grid = findScheduleGrid(rows);

      // フォールバック: 従来形式（1行目がヘッダー）
      let timeColumns: { colIdx: number; time: string }[] = [];
      let dataStartIdx = 1;

      if (grid) {
        timeColumns = grid.timeColumns;
        dataStartIdx = grid.dataStartIdx;
      } else {
        // 従来形式: 1行目ヘッダーからHH:MM列を探す
        const headerRow = rows[0].map(v => String(v ?? '').trim());
        for (let c = 1; c < headerRow.length; c++) {
          const val = headerRow[c];
          if (/^\d{1,2}:\d{2}$/.test(val)) {
            timeColumns.push({ colIdx: c, time: val.padStart(5, '0') });
          }
        }
      }

      if (timeColumns.length === 0) {
        setStatusMessage('Excelに時刻データが見つかりません。「コートNO.」行に時刻がある形式、またはヘッダー行にHH:MM形式の時刻列が必要です。');
        return;
      }

      // Detect startTime and matchDuration from time columns
      const importedStartTime = timeColumns[0].time;
      let importedDuration = matchDuration;
      if (timeColumns.length >= 2) {
        const t1Parts = timeColumns[0].time.split(':');
        const t2Parts = timeColumns[1].time.split(':');
        const min1 = parseInt(t1Parts[0]) * 60 + parseInt(t1Parts[1]);
        const min2 = parseInt(t2Parts[0]) * 60 + parseInt(t2Parts[1]);
        if (min2 > min1) importedDuration = min2 - min1;
      }

      // Ensure courts exist in DB
      const existingCourts = await db.courts.where('tournamentId').equals(currentTournamentId).toArray();
      const existingCourtNames = new Set(existingCourts.map(c => c.name));

      // Parse data rows (コート番号が数値の行のみ、パターン区切り等を無視)
      const importedSlots: ScheduleSlot[] = [];
      const importedCourtNames: string[] = [];

      for (let r = dataStartIdx; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const rawCourtName = String(row[0] ?? '').trim();
        if (!rawCourtName) continue;

        // コート番号が数値かどうかで判定（「パターン2」等の行をスキップ）
        const courtNum = parseInt(rawCourtName, 10);
        if (isNaN(courtNum)) {
          // 数字以外が来たら次のパターンかメモ行 → 現パターンの終端
          if (importedSlots.length > 0) break;
          continue;
        }

        const courtName = String(courtNum);
        if (!importedCourtNames.includes(courtName)) {
          importedCourtNames.push(courtName);
        }

        // Ensure court exists in DB
        if (!existingCourtNames.has(courtName)) {
          await db.courts.add({
            tournamentId: currentTournamentId,
            courtId: `C-${Date.now()}-${r}`,
            name: courtName,
            surface: '',
            isAvailable: true,
            currentMatchId: null,
            order: existingCourts.length + importedCourtNames.length,
          });
          existingCourtNames.add(courtName);
        }

        for (const tc of timeColumns) {
          const cellValue = String(row[tc.colIdx] ?? '').replace(/[\u3000]+/g, ' ').trim();
          if (!cellValue) continue;

          const slotIdx = timeColumns.indexOf(tc);
          const matchId = `import-${courtName}-${slotIdx}-${Date.now()}`;

          importedSlots.push({
            matchId,
            courtIndex: importedCourtNames.indexOf(courtName),
            courtName,
            timeSlotIndex: slotIdx,
            startTime: tc.time,
            eventCode: 'imported',
            roundLabel: cellValue,
          });
        }
      }

      if (importedSlots.length === 0) {
        setStatusMessage('Excelからスケジュールデータを読み取れませんでした。');
        return;
      }

      // --- DB matches との紐付け ---
      let linkedCount = 0;
      try {
        const allEventsForLink = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
        const allMatchesForLink: Match[] = [];
        const drawsForLink = new Map<string, number>(); // eventId → drawSize
        for (const evt of allEventsForLink) {
          const matches = await db.matches.where('eventId').equals(evt.eventId).toArray();
          allMatchesForLink.push(...matches);
          const draw = await db.draws.where('eventId').equals(evt.eventId).first();
          if (draw) drawsForLink.set(evt.eventId, draw.drawSize);
        }

        if (allMatchesForLink.length > 0 && allEventsForLink.length > 0) {
          // セルテキストから種目+ラウンドを解析してグルーピング
          const groups = new Map<string, number[]>(); // "eventName|roundLabel" → slot indices
          for (let i = 0; i < importedSlots.length; i++) {
            const parsed = parseCellEventRound(importedSlots[i].roundLabel);
            if (!parsed) continue;
            const key = `${parsed.eventName}|${parsed.roundLabel}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(i);
          }

          for (const [key, slotIndices] of groups) {
            const [eventName, roundLabel] = key.split('|');
            const matchedEvent = findMatchingEvent(eventName, allEventsForLink);
            if (!matchedEvent) continue;

            const totalRounds = drawsForLink.has(matchedEvent.eventId)
              ? Math.log2(drawsForLink.get(matchedEvent.eventId)!)
              : null;
            const roundNum = parseRoundFromLabel(roundLabel, totalRounds);
            if (roundNum === null) continue;

            // この種目+ラウンドの DB matches を position 順で取得
            const dbMatchesForRound = allMatchesForLink
              .filter(m => m.eventId === matchedEvent.eventId && m.round === roundNum)
              .sort((a, b) => a.position - b.position);

            // インポートスロットを時刻→コート順にソートして position に対応
            const sortedIndices = [...slotIndices].sort((a, b) => {
              const sa = importedSlots[a], sb = importedSlots[b];
              return sa.timeSlotIndex - sb.timeSlotIndex || sa.courtName.localeCompare(sb.courtName);
            });

            for (let j = 0; j < sortedIndices.length && j < dbMatchesForRound.length; j++) {
              const idx = sortedIndices[j];
              importedSlots[idx] = {
                ...importedSlots[idx],
                matchId: dbMatchesForRound[j].matchId,
                eventCode: matchedEvent.eventId,
              };
              linkedCount++;
            }
          }
        }
      } catch (linkErr) {
        console.warn('Excel紐付けエラー:', linkErr);
      }

      // Update state
      setStartTime(importedStartTime);
      setMatchDuration(importedDuration);
      setScheduleSlots(importedSlots);
      setAllScheduleMatches([]);
      setSelectedCell(null);

      // Enable matching court blocks
      const importedCourtNums = importedCourtNames.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
      setCourtBlocks({
        A: importedCourtNums.some(n => n >= 1 && n <= 4),
        B: importedCourtNums.some(n => n >= 5 && n <= 8),
        C: importedCourtNums.some(n => n >= 9 && n <= 12),
        D: importedCourtNums.some(n => n >= 13 && n <= 16),
      });

      const linkMsg = linkedCount > 0 ? `（${linkedCount}件をDB試合に紐付け済）` : '';
      setStatusMessage(`Excelから ${importedSlots.length} 件のスケジュールを読み込みました（${importedCourtNames.length}コート × ${timeColumns.length}時間枠）。${linkMsg}`);
    } catch (err) {
      console.error(err);
      setStatusMessage(`Excel読み込みに失敗しました: ${(err as Error).message}`);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [currentTournamentId, matchDuration]);

  // --------------- Render ---------------

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary-500" />
          時間割シート
        </h1>
        <p className="text-sm text-gray-500 mt-1 hidden sm:block">
          全種目の試合を時間枠×コートに自動配置します。
        </p>
      </header>

      {/* Config Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-4 space-y-4">
        <h2 className="text-sm font-bold text-gray-900">スケジュール設定</h2>

        {/* Court Blocks */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            使用コートブロック
          </label>
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'A', label: 'A (1-4面)' },
              { key: 'B', label: 'B (5-8面)' },
              { key: 'C', label: 'C (9-12面)' },
              { key: 'D', label: 'D (13-16面)' },
            ].map(block => (
              <label
                key={block.key}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={courtBlocks[block.key] || false}
                  onChange={e =>
                    setCourtBlocks(prev => ({
                      ...prev,
                      [block.key]: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                {block.label}
              </label>
            ))}
          </div>
        </div>

        {/* Duration & Start Time */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              1試合の所要時間（分）
            </label>
            <input
              type="number"
              min={20}
              max={120}
              value={matchDuration}
              onChange={e => setMatchDuration(parseInt(e.target.value) || 40)}
              className="w-full border border-border-main rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              開始時刻
            </label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full border border-border-main rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || courtNames.length === 0}
            className="flex items-center gap-1.5 bg-primary-500 text-white px-4 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
          >
            <Zap className={`w-4 h-4 ${isGenerating ? 'animate-pulse' : ''}`} />
            {isGenerating ? '生成中...' : '自動生成'}
          </button>
          <button
            onClick={handleClear}
            disabled={scheduleSlots.length === 0}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-md font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            クリア
          </button>
          <button
            onClick={handlePrint}
            disabled={scheduleSlots.length === 0}
            className="flex items-center gap-1.5 bg-primary-500 text-white px-4 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
          >
            <Printer className="w-4 h-4" />
            印刷
          </button>

          {/* Excel buttons */}
          <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 shadow-sm transition-colors text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <Upload className="w-3.5 h-3.5" />
            Excel読込
          </button>
          <button
            onClick={handleExcelExport}
            disabled={scheduleSlots.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <Download className="w-3.5 h-3.5" />
            Excel出力
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-md text-sm ${
              statusMessage.includes('失敗') || statusMessage.includes('ありません')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : statusMessage.includes('クリア')
                  ? 'bg-gray-50 text-gray-700 border border-gray-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {progressStats && scheduleSlots.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-bold text-gray-900">{currentTimeStr}</span>
              <div className="h-4 w-px bg-gray-200" />
              <span className="text-xs text-gray-500">進行状況</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700">
                  <CheckCircle2 className="w-3 h-3" />
                </span>
                <span className="text-gray-600">完了 <strong className="text-gray-900">{progressStats.finished}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700">
                  <PlayCircle className="w-3 h-3" />
                  {progressStats.playing > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                  )}
                </span>
                <span className="text-gray-600">試合中 <strong className="text-gray-900">{progressStats.playing}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500">
                  <Activity className="w-3 h-3" />
                </span>
                <span className="text-gray-600">待機 <strong className="text-gray-900">{progressStats.waiting}</strong></span>
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out"
              style={{ width: `${progressStats.pct}%` }}
            />
            {progressStats.playing > 0 && (
              <div
                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-1000 ease-out"
                style={{
                  left: `${progressStats.pct}%`,
                  width: `${Math.round((progressStats.playing / progressStats.total) * 100)}%`,
                }}
              >
                <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
              </div>
            )}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-gray-400">{progressStats.finished}/{progressStats.total} 試合完了</span>
            <span className="text-[10px] font-bold text-emerald-600">{progressStats.pct}%</span>
          </div>
        </div>
      )}

      {/* Timetable Grid */}
      {gridData && scheduleSlots.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden flex-1 flex flex-col">
          <style>{`
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
            @keyframes glow-pulse {
              0%, 100% { box-shadow: inset 0 0 0 2px rgba(59,130,246,0.4); }
              50% { box-shadow: inset 0 0 8px 1px rgba(59,130,246,0.3); }
            }
            .cell-playing {
              animation: glow-pulse 2s ease-in-out infinite;
              background: linear-gradient(90deg, transparent 25%, rgba(59,130,246,0.08) 50%, transparent 75%);
              background-size: 200% 100%;
              animation: glow-pulse 2s ease-in-out infinite, shimmer 3s linear infinite;
            }
            .cell-finished {
              opacity: 0.45;
              filter: grayscale(0.7);
            }
            .time-now-line {
              position: relative;
            }
            .time-now-line::after {
              content: '';
              position: absolute;
              top: 0;
              bottom: 0;
              right: -1px;
              width: 3px;
              background: linear-gradient(180deg, #ef4444, #f97316);
              z-index: 5;
              border-radius: 2px;
              box-shadow: 0 0 8px rgba(239,68,68,0.5);
              animation: pulse-line 2s ease-in-out infinite;
            }
            @keyframes pulse-line {
              0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
              50% { opacity: 0.7; box-shadow: 0 0 4px rgba(239,68,68,0.3); }
            }
            .time-now-header {
              position: relative;
            }
            .time-now-header::after {
              content: '▼';
              position: absolute;
              bottom: -2px;
              right: -4px;
              font-size: 8px;
              color: #ef4444;
              z-index: 5;
            }
          `}</style>
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 px-4 py-2.5 border-b border-border-main flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              タイムテーブル
              {progressStats && progressStats.playing > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                  LIVE
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-500">
              {selectedCell
                ? '移動先のセルをタップしてください'
                : 'セルをタップして選択→移動先をタップで入れ替え'}
            </span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-800 text-white text-xs px-3 py-2 border border-gray-600 whitespace-nowrap">
                    コート
                  </th>
                  {gridData.timeHeaders.map((time, idx) => {
                    const isNowSlot = idx === currentSlotIndex;
                    const isPast = currentSlotIndex >= 0 && idx < currentSlotIndex;
                    return (
                      <th
                        key={idx}
                        className={`text-xs px-2 py-2 border border-gray-600 whitespace-nowrap transition-colors ${
                          isNowSlot
                            ? 'bg-red-600 text-white font-bold time-now-header'
                            : isPast
                              ? 'bg-gray-600 text-gray-300'
                              : 'bg-gray-800 text-white'
                        }`}
                      >
                        {time}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {courtNames.map((cn, courtIdx) => (
                  <tr key={cn} className="group">
                    <td className="sticky left-0 z-10 bg-gray-100 font-bold text-sm px-3 py-2 border border-gray-300 text-center whitespace-nowrap group-hover:bg-gray-200 transition-colors">
                      {cn}
                    </td>
                    {Array.from(
                      { length: gridData.maxSlotIdx + 1 },
                      (_, slotIdx) => {
                        const isNowSlot = slotIdx === currentSlotIndex;
                        const isPastSlot = currentSlotIndex >= 0 && slotIdx < currentSlotIndex;
                        const slot = scheduleSlots.find(
                          s => s.courtName === cn && s.timeSlotIndex === slotIdx,
                        );
                        if (!slot) {
                          return (
                            <td
                              key={slotIdx}
                              className={`border border-gray-200 min-w-[60px] h-10 transition-colors ${
                                isNowSlot ? 'bg-red-50/50 time-now-line' : isPastSlot ? 'bg-gray-50/80' : ''
                              }`}
                            />
                          );
                        }
                        // DB match 紐付け情報
                        const dbMatch = dbMatchMap.get(slot.matchId);
                        const isFinished = dbMatch?.status === 'finished' || dbMatch?.status === 'walkover';
                        const isPlaying = dbMatch?.status === 'playing';
                        // DB種目の色、またはインポートされたセルから種目名を抽出して色を取得
                        const isImported = slot.eventCode === 'imported' && !dbMatch;
                        const importedEvName = isImported ? extractImportedEventName(slot.roundLabel) : '';
                        const color = isImported
                          ? importedEventColorMap.get(importedEvName)
                          : eventColorMap.get(dbMatch ? slot.eventCode : slot.eventCode);
                        const schedMatch = allScheduleMatches.find(
                          m => m.matchId === slot.matchId,
                        );
                        // 種目名: DB紐付け済ならeventCodeから、scheduleMatchがあればそこから
                        const evName = dbMatch
                          ? events.find(e => e.eventId === slot.eventCode)?.name
                          : schedMatch?.eventName;
                        const evAbbr = evName ? abbreviateEventName(evName) : '';

                        // 選手名表示 (DB match から取得)
                        let playerLabel = '';
                        if (dbMatch) {
                          const p1 = dbMatch.player1Name?.split(/[/／]/)[0]?.slice(0, 4) || '';
                          const p2 = dbMatch.player2Name?.split(/[/／]/)[0]?.slice(0, 4) || '';
                          if (p1 && p2 && p1 !== 'BYE' && p2 !== 'BYE') {
                            playerLabel = `${p1}v${p2}`;
                          } else if (p1 && p1 !== 'BYE') {
                            playerLabel = p1;
                          }
                        }

                        const isSelected = selectedCell?.matchId === slot.matchId;

                        // ツールチップ
                        const tooltipParts = [evAbbr, slot.roundLabel];
                        if (dbMatch?.player1Name) tooltipParts.push(`${dbMatch.player1Name} vs ${dbMatch.player2Name}`);
                        if (dbMatch?.score) tooltipParts.push(dbMatch.score);

                        // 状態に応じたセルクラス
                        const cellStatusClass = isFinished
                          ? 'cell-finished'
                          : isPlaying
                            ? 'cell-playing'
                            : '';

                        return (
                          <td
                            key={slotIdx}
                            onClick={() =>
                              handleCellClick(slot.matchId, courtIdx, slotIdx)
                            }
                            title={tooltipParts.join(' | ')}
                            className={`border border-gray-300 min-w-[80px] h-10 cursor-pointer text-center transition-all duration-300 px-0.5 ${color?.bg || 'bg-gray-50'} ${color?.text || 'text-gray-800'} ${isSelected ? 'ring-2 ring-primary-500 ring-inset shadow-md scale-105 z-[2]' : 'hover:brightness-90 hover:scale-[1.02]'} ${cellStatusClass} ${isNowSlot && !isFinished && !isPlaying ? 'time-now-line' : ''}`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              {isPlaying && (
                                <span className="relative flex h-2 w-2 flex-shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                </span>
                              )}
                              {isFinished && (
                                <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0 text-gray-400" />
                              )}
                              <span className="text-[10px] font-medium leading-tight truncate">{evAbbr}</span>
                              <span className="text-[9px] leading-tight opacity-70">{slot.roundLabel}</span>
                            </div>
                            {playerLabel && (
                              <div className={`text-[8px] leading-tight truncate ${isFinished ? 'line-through opacity-60' : 'opacity-80'}`}>{playerLabel}</div>
                            )}
                            {dbMatch?.score && (
                              <div className={`text-[7px] leading-tight truncate font-mono ${isFinished ? 'text-gray-400 font-bold' : 'text-gray-500'}`}>{dbMatch.score}</div>
                            )}
                          </td>
                        );
                      },
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-border-main shadow-sm">
          <CalendarClock className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            時間割データがありません
          </h3>
          <p className="text-gray-500 max-w-md">
            コートブロック・時間設定を行い、「自動生成」ボタンを押すと全種目のタイムテーブルが自動生成されます。
          </p>
        </div>
      )}

      {/* Event Schedule Lists (below grid) */}
      {scheduleSlots.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
          <div className="bg-primary-50 px-4 py-2.5 border-b border-border-main">
            <h2 className="text-sm font-bold text-gray-900">種目別スケジュール</h2>
          </div>
          <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {(() => {
              const byEvent = new Map<string, ScheduleSlot[]>();
              for (const slot of scheduleSlots) {
                if (!byEvent.has(slot.eventCode))
                  byEvent.set(slot.eventCode, []);
                byEvent.get(slot.eventCode)!.push(slot);
              }

              return Array.from(byEvent.entries()).map(
                ([eventCode, eventSlots]) => {
                  const evName =
                    events.find(e => e.eventId === eventCode)?.name ||
                    eventCode;
                  const color = eventColorMap.get(eventCode);
                  const sorted = [...eventSlots].sort(
                    (a, b) => a.timeSlotIndex - b.timeSlotIndex,
                  );

                  return (
                    <div key={eventCode}>
                      <h3
                        className={`text-sm font-bold mb-1 ${color?.text || 'text-gray-900'}`}
                      >
                        {evName}
                      </h3>
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="py-1 px-2 border-b border-border-main w-16">
                              時間
                            </th>
                            <th className="py-1 px-2 border-b border-border-main w-16">
                              コート
                            </th>
                            <th className="py-1 px-2 border-b border-border-main w-16">
                              ラウンド
                            </th>
                            <th className="py-1 px-2 border-b border-border-main">
                              対戦
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((s, idx) => {
                            // DB match から最新の選手名を取得（スコア反映後も自動更新）
                            const dbMatch = dbMatchMap.get(s.matchId);
                            const isFinished = dbMatch?.status === 'finished' || dbMatch?.status === 'walkover';
                            const isPlaying = dbMatch?.status === 'playing';
                            let players = '';
                            if (dbMatch) {
                              const p1 = dbMatch.player1Name || '';
                              const p2 = dbMatch.player2Name || '';
                              if (p1 && p2 && p1 !== 'BYE' && p2 !== 'BYE') {
                                players = `${p1} vs ${p2}`;
                              } else if (p1 && p1 !== 'BYE') {
                                players = p1;
                              } else if (p2 && p2 !== 'BYE') {
                                players = p2;
                              }
                            }
                            if (!players) {
                              // フォールバック: scheduleMatch から
                              const schedMatch = allScheduleMatches.find(m => m.matchId === s.matchId);
                              if (schedMatch) players = schedMatch.players.join(' vs ');
                            }

                            return (
                              <tr
                                key={s.matchId}
                                className={`transition-all duration-300 ${
                                  isPlaying
                                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                                    : isFinished
                                      ? 'bg-gray-50 opacity-50'
                                      : idx % 2 === 1 ? 'bg-gray-50/50' : ''
                                }`}
                              >
                                <td className={`py-1 px-2 border-b border-border-main font-mono text-xs ${isFinished ? 'text-gray-400' : ''}`}>
                                  {s.startTime}
                                </td>
                                <td className={`py-1 px-2 border-b border-border-main text-center ${isFinished ? 'text-gray-400' : ''}`}>
                                  {s.courtName}
                                </td>
                                <td className={`py-1 px-2 border-b border-border-main ${isFinished ? 'text-gray-400' : ''}`}>
                                  {s.roundLabel}
                                  {isPlaying && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                                      </span>
                                      試合中
                                    </span>
                                  )}
                                  {isFinished && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] text-gray-400">
                                      <CheckCircle2 className="w-3 h-3" /> 完了
                                    </span>
                                  )}
                                </td>
                                <td className={`py-1 px-2 border-b border-border-main ${isFinished ? 'text-gray-400' : ''}`}>
                                  <span className={isFinished ? 'line-through' : ''}>{players || '(未定)'}</span>
                                  {dbMatch?.score && (
                                    <span className={`ml-2 text-xs font-mono ${isFinished ? 'text-gray-400 font-bold' : 'text-gray-500'}`}>{dbMatch.score}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                },
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
