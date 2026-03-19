import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CalendarClock, Zap, Printer, Trash2, Upload, Download } from 'lucide-react';
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

  // Config
  const [courtBlocks, setCourtBlocks] = useState<Record<string, boolean>>({
    A: true, B: true, C: false, D: false,
  });
  const [matchDuration, setMatchDuration] = useState(40);
  const [startTime, setStartTime] = useState('09:00');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Schedule data (local state, not DB)
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [allScheduleMatches, setAllScheduleMatches] = useState<ScheduleMatch[]>([]);

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Swap interaction
  const [selectedCell, setSelectedCell] = useState<{
    matchId: string;
    courtIdx: number;
    slotIdx: number;
  } | null>(null);

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

  // DBから既存のスケジュールデータを復元
  useEffect(() => {
    if (!currentTournamentId || events.length === 0) return;

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
                // timeSlotIndexを逆算
                const parts = startTime.split(':');
                const startMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                const timeParts = m.scheduledTime.split(':');
                const matchMin = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
                const slotIdx = Math.round((matchMin - startMin) / matchDuration);

                restoredSlots.push({
                  matchId: m.matchId,
                  courtIndex: courtNames.indexOf(courtName),
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
          setScheduleSlots(restoredSlots);
          setAllScheduleMatches(restoredMatches);
        }
      } catch (err) {
        console.error('スケジュール復元エラー:', err);
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
        setScheduleSlots(prev => {
          const relinked = applyMatchMapping(prev, mapping);
          if (relinked.every((s, i) => s.matchId === prev[i].matchId)) return prev;
          return relinked;
        });
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
      setScheduleSlots(prev => {
        const newSlots = [...prev];
        const idx1 = newSlots.findIndex(s => s.matchId === selectedCell.matchId);
        const idx2 = newSlots.findIndex(s => s.matchId === matchId);
        if (idx1 === -1 || idx2 === -1) return prev;

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
        return newSlots;
      });

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
            <Upload className="w-4 h-4" />
            Excel読込
          </button>
          <button
            onClick={handleExcelExport}
            disabled={scheduleSlots.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
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

      {/* Timetable Grid */}
      {gridData && scheduleSlots.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden flex-1 flex flex-col">
          <div className="bg-primary-50 px-4 py-2.5 border-b border-border-main flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">タイムテーブル</h2>
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
                  {gridData.timeHeaders.map((time, idx) => (
                    <th
                      key={idx}
                      className="bg-gray-800 text-white text-xs px-2 py-2 border border-gray-600 whitespace-nowrap"
                    >
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courtNames.map((cn, courtIdx) => (
                  <tr key={cn}>
                    <td className="sticky left-0 z-10 bg-gray-100 font-bold text-sm px-3 py-2 border border-gray-300 text-center whitespace-nowrap">
                      {cn}
                    </td>
                    {Array.from(
                      { length: gridData.maxSlotIdx + 1 },
                      (_, slotIdx) => {
                        const slot = scheduleSlots.find(
                          s => s.courtName === cn && s.timeSlotIndex === slotIdx,
                        );
                        if (!slot) {
                          return (
                            <td
                              key={slotIdx}
                              className="border border-gray-200 min-w-[60px] h-10"
                            />
                          );
                        }
                        // DB match 紐付け情報
                        const dbMatch = dbMatchMap.get(slot.matchId);
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

                        const statusDot = dbMatch ? matchStatusColor(dbMatch.status) : '';
                        const isSelected = selectedCell?.matchId === slot.matchId;

                        // ツールチップ
                        const tooltipParts = [evAbbr, slot.roundLabel];
                        if (dbMatch?.player1Name) tooltipParts.push(`${dbMatch.player1Name} vs ${dbMatch.player2Name}`);
                        if (dbMatch?.score) tooltipParts.push(dbMatch.score);

                        return (
                          <td
                            key={slotIdx}
                            onClick={() =>
                              handleCellClick(slot.matchId, courtIdx, slotIdx)
                            }
                            title={tooltipParts.join(' | ')}
                            className={`border border-gray-300 min-w-[80px] h-10 cursor-pointer text-center transition-all px-0.5 ${color?.bg || 'bg-gray-50'} ${color?.text || 'text-gray-800'} ${isSelected ? 'ring-2 ring-primary-500 ring-inset shadow-md' : 'hover:brightness-95'}`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              {statusDot && <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot} ${dbMatch?.status === 'playing' ? 'animate-pulse' : ''}`} />}
                              <span className="text-[10px] font-medium leading-tight truncate">{evAbbr}</span>
                              <span className="text-[9px] leading-tight opacity-70">{slot.roundLabel}</span>
                            </div>
                            {playerLabel && (
                              <div className="text-[8px] leading-tight truncate opacity-80">{playerLabel}</div>
                            )}
                            {dbMatch?.score && (
                              <div className="text-[7px] leading-tight text-gray-500 truncate">{dbMatch.score}</div>
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

                            const statusBg = dbMatch?.status === 'playing'
                              ? 'bg-green-50'
                              : dbMatch?.status === 'finished'
                                ? 'bg-gray-50'
                                : idx % 2 === 1 ? 'bg-gray-50' : '';

                            return (
                              <tr
                                key={s.matchId}
                                className={statusBg}
                              >
                                <td className="py-1 px-2 border-b border-border-main font-mono text-xs">
                                  {s.startTime}
                                </td>
                                <td className="py-1 px-2 border-b border-border-main text-center">
                                  {s.courtName}
                                </td>
                                <td className="py-1 px-2 border-b border-border-main">
                                  {s.roundLabel}
                                  {dbMatch?.status === 'playing' && <span className="ml-1 text-[9px] text-green-600 font-bold">●</span>}
                                  {dbMatch?.status === 'finished' && <span className="ml-1 text-[9px] text-gray-400">✓</span>}
                                </td>
                                <td className="py-1 px-2 border-b border-border-main">
                                  <span>{players || '(未定)'}</span>
                                  {dbMatch?.score && (
                                    <span className="ml-2 text-xs text-gray-500 font-mono">{dbMatch.score}</span>
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
