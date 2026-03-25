import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Match } from '../../db/database';
import { useAppStore, type ImportedScheduleItem } from '../../stores/appStore';
import { CalendarClock, Download, FileSpreadsheet, FolderOpen, X, Loader2, Edit3, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getSavedToken as gdriveGetSavedToken,
  downloadScheduleExcel,
  type GoogleDriveFile,
} from '../backup/googleDriveApi';

const EVENT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
  { bg: 'bg-green-100', text: 'text-green-800' },
  { bg: 'bg-pink-100', text: 'text-pink-800' },
  { bg: 'bg-purple-100', text: 'text-purple-800' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-stone-100', text: 'text-stone-800' },
];

/** 種目名から時間割Excelの色分けに対応する背景色・文字色を返す */
function getScheduleEventColor(eventName: string): { bg: string; text: string } | null {
  const n = eventName.replace(/シングルス|ダブルス|一般|級/g, '').trim();
  if (/女子\s*45/i.test(n)) return { bg: 'bg-[#1E4E79]/20', text: 'text-[#1E4E79]' };
  if (/女子\s*B/i.test(n)) return { bg: 'bg-[#7DBEFF]/30', text: 'text-[#1a4f8b]' };
  if (/女子\s*A/i.test(n)) return { bg: 'bg-[#9BFFFF]/30', text: 'text-[#0a6b6b]' };
  if (/男子\s*65/i.test(n)) return { bg: 'bg-[#94F592]/30', text: 'text-[#1a6b19]' };
  if (/男子\s*55/i.test(n)) return { bg: 'bg-[#C5E0B3]/40', text: 'text-[#3d6b2e]' };
  if (/男子\s*45/i.test(n)) return { bg: 'bg-[#FFFF99]/40', text: 'text-[#7a7a00]' };
  if (/男子\s*C/i.test(n)) return { bg: 'bg-[#FFCC99]/40', text: 'text-[#8b5e2b]' };
  if (/男子\s*B/i.test(n)) return { bg: 'bg-[#FFCCFF]/40', text: 'text-[#8b3a8b]' };
  if (/男子\s*A/i.test(n)) return { bg: 'bg-[#EE8184]/25', text: 'text-[#a83235]' };
  return null;
}

function abbreviateEventName(name: string): string {
  return name
    .replace(/一般/g, '')
    .replace(/シングルス/g, '')
    .replace(/ダブルス/g, '')
    .trim();
}

function roundLabelToJapanese(label: string): string {
  if (label === 'F') return '決勝';
  if (label === 'SF') return '準決勝';
  if (label === 'QF') return '準々決勝';
  const m = label.match(/^(\d+)R$/i);
  if (m) return `${m[1]}回戦`;
  return label;
}

/** 種目名を DB event に照合（あいまいマッチング） */
function findMatchingEvent(
  cellEventName: string,
  events: { eventId: string; name: string }[],
): { eventId: string; name: string } | undefined {
  const exact = events.find(e => e.name === cellEventName);
  if (exact) return exact;
  const abbrMatch = events.find(e => abbreviateEventName(e.name) === abbreviateEventName(cellEventName));
  if (abbrMatch) return abbrMatch;
  const norm = cellEventName.replace(/[級組]/g, '').trim();
  const includesMatches = events
    .filter(e => e.name.includes(cellEventName))
    .sort((a, b) => a.name.length - b.name.length);
  if (includesMatches.length > 0) return includesMatches[0];
  const reverseMatches = events
    .filter(e => cellEventName.includes(e.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (reverseMatches.length > 0) return reverseMatches[0];
  const normMatches = events
    .filter(e => {
      const n = e.name.replace(/[級組]/g, '').trim();
      return n.includes(norm) || norm.includes(n);
    })
    .sort((a, b) => {
      const nb = b.name.replace(/[級組]/g, '').trim();
      const na = a.name.replace(/[級組]/g, '').trim();
      return nb.length - na.length;
    });
  if (normMatches.length > 0) return normMatches[0];
  return undefined;
}

/** ラウンドラベルからラウンド番号を算出 */
function parseRoundFromLabel(label: string, totalRounds: number | null): number | null {
  const upper = label.toUpperCase().trim();
  const rMatch = upper.match(/^(\d+)R$/);
  if (rMatch) return parseInt(rMatch[1]);
  // 日本語ラウンドラベル "1回戦" 等にも対応
  const jpRound = label.match(/^(\d+)回戦$/);
  if (jpRound) return parseInt(jpRound[1]);
  if (totalRounds === null) return null;
  if (upper === 'F' || label === '決勝') return totalRounds;
  if (upper === 'SF' || label === '準決勝') return totalRounds - 1;
  if (upper === 'QF' || label === '準々決勝') return totalRounds - 2;
  return null;
}

/** Google Drive brand icon */
function GoogleDriveIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L3.45 44.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
      <path d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.85 53z" fill="#2684FC"/>
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00"/>
    </svg>
  );
}

export default function ScheduleSheet() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const importedSchedule = useAppStore(state => state.importedSchedule);
  const setImportedSchedule = useAppStore(state => state.setImportedSchedule);

  const [statusMessage, setStatusMessage] = useState('');

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive file picker
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles] = useState<GoogleDriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState('');

  // Edit modal
  const [editingCell, setEditingCell] = useState<{
    scheduleIndex: number;
    courtName: string;
    startTime: string;
  } | null>(null);

  // --------------- Current time tracking ---------------
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // --------------- Reactive queries ---------------

  const tid = currentTournamentId;

  const events = useLiveQuery(
    () => tid ? db.events.where('tournamentId').equals(tid).toArray() : [],
    [tid],
  ) || [];

  const allMatches = useLiveQuery(async () => {
    if (!tid) return [];
    const evts = await db.events.where('tournamentId').equals(tid).toArray();
    const eventIds = evts.map(e => e.eventId);
    if (eventIds.length === 0) return [];
    return db.matches.where('eventId').anyOf(eventIds).toArray();
  }, [tid]) || [];

  const allCourts = useLiveQuery(
    () => tid ? db.courts.where('tournamentId').equals(tid).toArray() : [],
    [tid],
  ) || [];

  const draws = useLiveQuery(async () => {
    if (!tid) return [];
    const evts = await db.events.where('tournamentId').equals(tid).toArray();
    const eventIds = evts.map(e => e.eventId);
    if (eventIds.length === 0) return [];
    return db.draws.where('eventId').anyOf(eventIds).toArray();
  }, [tid]) || [];

  // --------------- Derived: grid structure from importedSchedule ---------------

  const timeSlots = useMemo(() => {
    const times = [...new Set(importedSchedule.map(s => s.startTime))];
    return times.sort((a, b) => {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });
  }, [importedSchedule]);

  const courtNames = useMemo(() => {
    const names = [...new Set(importedSchedule.map(s => s.courtName))];
    return names.sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [importedSchedule]);

  // Current time slot index (for the red line)
  const currentSlotIndex = useMemo(() => {
    if (timeSlots.length === 0) return -1;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (let i = timeSlots.length - 1; i >= 0; i--) {
      const [h, m] = timeSlots[i].split(':').map(Number);
      if (nowMin >= h * 60 + m) return i;
    }
    return -1;
  }, [now, timeSlots]);

  // Event color map
  const eventColorMap = useMemo(() => {
    const map = new Map<string, (typeof EVENT_COLORS)[0]>();
    const seenNames: string[] = [];
    for (const item of importedSchedule) {
      if (!seenNames.includes(item.eventName)) {
        seenNames.push(item.eventName);
      }
    }
    seenNames.forEach((name, idx) => {
      // まず時間割Excelの色分けルールで色を決定
      const excelColor = getScheduleEventColor(name);
      if (excelColor) {
        map.set(name, excelColor);
      } else {
        map.set(name, EVENT_COLORS[idx % EVENT_COLORS.length]);
      }
    });
    return map;
  }, [importedSchedule]);

  // Grid: courtName -> startTime -> ImportedScheduleItem (with index)
  const gridData = useMemo(() => {
    if (importedSchedule.length === 0) return null;
    const grid = new Map<string, Map<string, { item: ImportedScheduleItem; index: number }>>();
    for (const cn of courtNames) {
      grid.set(cn, new Map());
    }
    importedSchedule.forEach((item, index) => {
      const courtMap = grid.get(item.courtName);
      if (courtMap) courtMap.set(item.startTime, { item, index });
    });
    return grid;
  }, [importedSchedule, courtNames]);

  // --------------- Match lookup: match imported schedule items to DB matches ---------------

  const matchLookup = useMemo(() => {
    const lookup = new Map<number, Match>(); // index in importedSchedule -> Match

    if (allMatches.length === 0 || events.length === 0) return lookup;

    // Build courtName -> courtId mapping
    const courtNameToId = new Map<string, string>();
    for (const c of allCourts) {
      courtNameToId.set(c.name, c.courtId);
    }

    // Strategy 1: Match by courtId + scheduledTime (most reliable when schedule import has been done)
    const matchByCourtTime = new Map<string, Match>();
    for (const m of allMatches) {
      if (m.courtId && m.scheduledTime) {
        matchByCourtTime.set(`${m.courtId}|${m.scheduledTime}`, m);
      }
    }

    const unmatchedIndices: number[] = [];
    importedSchedule.forEach((item, idx) => {
      const courtId = courtNameToId.get(item.courtName);
      if (courtId) {
        const key = `${courtId}|${item.startTime}`;
        const match = matchByCourtTime.get(key);
        if (match) {
          lookup.set(idx, match);
          return;
        }
      }
      unmatchedIndices.push(idx);
    });

    // Strategy 2: For unmatched items, fall back to event+round position pairing
    if (unmatchedIndices.length > 0) {
      const drawSizeMap = new Map<string, number>();
      for (const d of draws) {
        drawSizeMap.set(d.eventId, d.drawSize);
      }

      const alreadyLinkedMatchIds = new Set<string>();
      for (const m of lookup.values()) alreadyLinkedMatchIds.add(m.matchId);

      const groups = new Map<string, number[]>();
      for (const idx of unmatchedIndices) {
        const item = importedSchedule[idx];
        const key = `${item.eventName}|${item.roundLabel}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(idx);
      }

      for (const [key, indices] of groups) {
        const [eventName, roundLabel] = key.split('|');
        const matchedEvent = findMatchingEvent(eventName, events);
        if (!matchedEvent) continue;

        const totalRounds = drawSizeMap.has(matchedEvent.eventId)
          ? Math.log2(drawSizeMap.get(matchedEvent.eventId)!)
          : null;
        const roundNum = parseRoundFromLabel(roundLabel, totalRounds);
        if (roundNum === null) continue;

        const dbMatchesForRound = allMatches
          .filter(m => m.eventId === matchedEvent.eventId && m.round === roundNum && !alreadyLinkedMatchIds.has(m.matchId))
          .sort((a, b) => (a.matchOrder || 9999) - (b.matchOrder || 9999));

        const sortedIndices = [...indices].sort((a, b) => {
          const sa = importedSchedule[a], sb = importedSchedule[b];
          if (sa.startTime !== sb.startTime) return sa.startTime.localeCompare(sb.startTime);
          return (parseInt(sa.courtName, 10) || 0) - (parseInt(sb.courtName, 10) || 0);
        });

        for (let j = 0; j < sortedIndices.length && j < dbMatchesForRound.length; j++) {
          lookup.set(sortedIndices[j], dbMatchesForRound[j]);
          alreadyLinkedMatchIds.add(dbMatchesForRound[j].matchId);
        }
      }
    }

    return lookup;
  }, [importedSchedule, allMatches, events, draws, allCourts]);

  // --------------- LIVE判定（試合中があるか） ---------------
  const hasPlayingMatch = useMemo(() => {
    for (let i = 0; i < importedSchedule.length; i++) {
      const dbMatch = matchLookup.get(i);
      if (dbMatch?.status === 'playing') return true;
    }
    return false;
  }, [importedSchedule, matchLookup]);

  // --------------- Handlers ---------------

  const handleCellClick = useCallback(
    (scheduleIndex: number) => {
      const item = importedSchedule[scheduleIndex];
      if (!item) return;
      setEditingCell({
        scheduleIndex,
        courtName: item.courtName,
        startTime: item.startTime,
      });
    },
    [importedSchedule],
  );

  const handleEditSave = useCallback(async () => {
    if (!editingCell || !tid) return;
    const { scheduleIndex, courtName, startTime } = editingCell;

    // Update importedSchedule store
    const newSchedule = [...importedSchedule];
    newSchedule[scheduleIndex] = {
      ...newSchedule[scheduleIndex],
      courtName,
      startTime,
    };
    setImportedSchedule(newSchedule);

    // Update DB match if linked
    const dbMatch = matchLookup.get(scheduleIndex);
    if (dbMatch?.id) {
      const courtNameToId = new Map(allCourts.map(c => [c.name, c.courtId]));
      const courtId = courtNameToId.get(courtName) || null;
      await db.matches.update(dbMatch.id, {
        courtId,
        scheduledTime: startTime,
        updatedAt: Date.now(),
      });
    }

    setEditingCell(null);
  }, [editingCell, importedSchedule, matchLookup, allCourts, tid, setImportedSchedule]);

  // --------------- Excel Import ---------------

  /** Excelシリアル値(0-1)または文字列からHH:MM形式に変換 */
  const excelTimeToString = (val: unknown): string | null => {
    if (val == null) return null;
    const num = Number(val);
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

  /** 「コートNO.」行を自動検出（複数パターンがある場合は最後を使用） */
  const findScheduleGrid = (rows: (string | number | null)[][]): {
    headerRowIdx: number;
    dataStartIdx: number;
    timeColumns: { colIdx: number; time: string }[];
  } | null => {
    let lastMatch: { headerRowIdx: number; dataStartIdx: number; timeColumns: { colIdx: number; time: string }[] } | null = null;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      const firstCell = String(row[0] ?? '').replace(/[\s\u3000]+/g, '').trim();
      if (!/^コート(NO\.?|No\.?)?$/i.test(firstCell)) continue;
      const timeColumns: { colIdx: number; time: string }[] = [];
      for (let c = 1; c < row.length; c++) {
        const time = excelTimeToString(row[c]);
        if (time) timeColumns.push({ colIdx: c, time });
      }
      if (timeColumns.length > 0) {
        lastMatch = { headerRowIdx: r, dataStartIdx: r + 1, timeColumns };
      }
    }
    return lastMatch;
  };

  /** セルテキストから種目名とラウンドラベルをパース */
  const parseCellEventRound = (cellText: string): { eventName: string; roundLabel: string } | null => {
    const normalized = cellText
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[\u3000]+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const engMatch = normalized.match(/^(.+?)\s*(\d+R|QF|SF|F)$/i);
    if (engMatch) return { eventName: engMatch[1].trim(), roundLabel: engMatch[2].toUpperCase() };
    const jpMatch = normalized.match(/^(.+?)\s*((\d+)回戦|準々決勝|準決勝|決勝)$/);
    if (jpMatch) {
      const roundText = jpMatch[2];
      let roundLabel: string;
      if (roundText === '決勝') roundLabel = 'F';
      else if (roundText === '準決勝') roundLabel = 'SF';
      else if (roundText === '準々決勝') roundLabel = 'QF';
      else roundLabel = `${jpMatch[3]}R`;
      return { eventName: jpMatch[1].trim(), roundLabel };
    }
    return null;
  };

  const handleExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tid) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) {
        setStatusMessage('Excelのデータが不足しています。');
        return;
      }

      const grid = findScheduleGrid(rows);
      let timeColumns: { colIdx: number; time: string }[] = [];
      let dataStartIdx = 1;

      if (grid) {
        timeColumns = grid.timeColumns;
        dataStartIdx = grid.dataStartIdx;
      } else {
        const headerRow = rows[0].map(v => String(v ?? '').trim());
        for (let c = 1; c < headerRow.length; c++) {
          const val = headerRow[c];
          if (/^\d{1,2}:\d{2}$/.test(val)) {
            timeColumns.push({ colIdx: c, time: val.padStart(5, '0') });
          }
        }
      }

      if (timeColumns.length === 0) {
        setStatusMessage('Excelに時刻データが見つかりません。');
        return;
      }

      // Ensure courts exist in DB
      const existingCourts = await db.courts.where('tournamentId').equals(tid).toArray();
      const existingCourtNames = new Set(existingCourts.map(c => c.name));

      const items: ImportedScheduleItem[] = [];
      const importedCourtNames: string[] = [];
      let globalOrder = 0;

      // グリッド部分（コート番号がある行）を読み取り
      let continueFromRow = rows.length;
      const eventNameColIdx = timeColumns.length > 0 ? timeColumns[0].colIdx : 1;

      let lastCourtRow = -1;
      for (let r = dataStartIdx; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const rawCourtName = String(row[0] ?? '').trim();
        if (!rawCourtName) {
          // 列Aが空 → グリッド行の後なら続きの行に移行
          if (lastCourtRow >= 0) { continueFromRow = r; break; }
          continue;
        }
        const courtNum = parseInt(rawCourtName, 10);
        if (isNaN(courtNum)) {
          if (items.length > 0) { continueFromRow = r; break; }
          continue;
        }
        lastCourtRow = r;
        const courtName = String(courtNum);
        if (!importedCourtNames.includes(courtName)) importedCourtNames.push(courtName);

        if (!existingCourtNames.has(courtName)) {
          await db.courts.add({
            tournamentId: tid,
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
          const parsed = parseCellEventRound(cellValue);
          globalOrder++;
          items.push({
            eventName: parsed?.eventName || cellValue,
            roundLabel: parsed?.roundLabel || '',
            matchOrder: globalOrder,
            courtName,
            startTime: tc.time,
          });
        }
      }

      // グリッド後の続きの行（コート番号なし、B列のみ）を読み取り
      // Excel「パターン2」のB列全体を対戦順として取得する
      for (let r = continueFromRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const cellValue = String(row[eventNameColIdx] ?? '').replace(/[\u3000]+/g, ' ').trim();
        if (!cellValue) continue;
        // 「パターン」等のセクションヘッダーが出たら終了
        const colA = String(row[0] ?? '').trim();
        if (colA && /パターン|コートNO/i.test(colA.replace(/[\s\u3000]+/g, ''))) break;
        // 種目+ラウンドをパース。ラウンドなし（リーグ等の小種目）も受け入れる
        const parsed = parseCellEventRound(cellValue);
        globalOrder++;
        items.push({
          eventName: parsed?.eventName || cellValue,
          roundLabel: parsed?.roundLabel || '',
          matchOrder: globalOrder,
          courtName: '',
          startTime: '',
        });
      }

      if (items.length === 0) {
        setStatusMessage('Excelからスケジュールデータを読み取れませんでした。');
        return;
      }

      setImportedSchedule(items);
      setStatusMessage(`Excelから ${items.length} 件のスケジュールを読み込みました。`);
    } catch (err) {
      console.error(err);
      setStatusMessage(`Excel読み込みに失敗しました: ${(err as Error).message}`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [tid, setImportedSchedule]);

  // --------------- Google Drive Import ---------------

  const handleDriveFileSelect = useCallback(async (file: GoogleDriveFile) => {
    if (!tid) return;
    const token = gdriveGetSavedToken();
    if (!token) return;

    setDriveLoading(true);
    setDriveError('');
    try {
      const buffer = await downloadScheduleExcel(token, file.id);
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      setShowDrivePicker(false);

      if (rows.length < 2) {
        setStatusMessage('Excelのデータが不足しています。');
        return;
      }

      const grid = findScheduleGrid(rows);
      let timeColumns: { colIdx: number; time: string }[] = [];
      let dataStartIdx = 1;

      if (grid) {
        timeColumns = grid.timeColumns;
        dataStartIdx = grid.dataStartIdx;
      } else {
        const headerRow = rows[0].map(v => String(v ?? '').trim());
        for (let c = 1; c < headerRow.length; c++) {
          const val = headerRow[c];
          if (/^\d{1,2}:\d{2}$/.test(val)) {
            timeColumns.push({ colIdx: c, time: val.padStart(5, '0') });
          }
        }
      }

      if (timeColumns.length === 0) {
        setStatusMessage('Excelに時刻データが見つかりません。');
        return;
      }

      const existingCourts = await db.courts.where('tournamentId').equals(tid).toArray();
      const existingCourtNames = new Set(existingCourts.map(c => c.name));
      const items: ImportedScheduleItem[] = [];
      const importedCourtNames: string[] = [];
      let globalOrder = 0;

      let continueFromRow2 = rows.length;
      const eventNameColIdx2 = timeColumns.length > 0 ? timeColumns[0].colIdx : 1;
      let lastCourtRow2 = -1;

      for (let r = dataStartIdx; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const rawCourtName = String(row[0] ?? '').trim();
        if (!rawCourtName) {
          if (lastCourtRow2 >= 0) { continueFromRow2 = r; break; }
          continue;
        }
        const courtNum = parseInt(rawCourtName, 10);
        if (isNaN(courtNum)) {
          if (items.length > 0) { continueFromRow2 = r; break; }
          continue;
        }
        lastCourtRow2 = r;
        const courtName = String(courtNum);
        if (!importedCourtNames.includes(courtName)) importedCourtNames.push(courtName);

        if (!existingCourtNames.has(courtName)) {
          await db.courts.add({
            tournamentId: tid,
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
          const parsed = parseCellEventRound(cellValue);
          globalOrder++;
          items.push({
            eventName: parsed?.eventName || cellValue,
            roundLabel: parsed?.roundLabel || '',
            matchOrder: globalOrder,
            courtName,
            startTime: tc.time,
          });
        }
      }

      // グリッド後の続きの行を読み取り
      for (let r = continueFromRow2; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const cellValue = String(row[eventNameColIdx2] ?? '').replace(/[\u3000]+/g, ' ').trim();
        if (!cellValue) continue;
        const colA = String(row[0] ?? '').trim();
        if (colA && /パターン|コートNO/i.test(colA.replace(/[\s\u3000]+/g, ''))) break;
        const parsed = parseCellEventRound(cellValue);
        globalOrder++;
        items.push({
          eventName: parsed?.eventName || cellValue,
          roundLabel: parsed?.roundLabel || '',
          matchOrder: globalOrder,
          courtName: '',
          startTime: '',
        });
      }

      if (items.length === 0) {
        setStatusMessage('Excelからスケジュールデータを読み取れませんでした。');
        return;
      }

      setImportedSchedule(items);
      setStatusMessage(`Google Drive「${file.name}」から ${items.length} 件のスケジュールを読み込みました。`);
    } catch (err) {
      setDriveError(`読み込みに失敗しました: ${(err as Error).message}`);
    } finally {
      setDriveLoading(false);
    }
  }, [tid, setImportedSchedule]);

  // --------------- Render ---------------

  const hasData = importedSchedule.length > 0 && gridData;

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-6 h-6 text-primary-500" />
              タイムテーブル
              {hasPlayingMatch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold border border-red-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-1 hidden sm:block">
              リアルタイム試合進行状況
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelImport}
            className="hidden"
          />
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mt-3 p-3 rounded-md text-sm ${
              statusMessage.includes('失敗') || statusMessage.includes('ありません')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {statusMessage}
          </div>
        )}
      </header>

      {/* Timetable Grid */}
      {hasData ? (
        <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden flex-1 flex flex-col">
          <style>{`
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
            @keyframes glow-pulse {
              0%, 100% { box-shadow: inset 0 0 0 2px rgba(34,197,94,0.5); }
              50% { box-shadow: inset 0 0 12px 2px rgba(34,197,94,0.35), inset 0 0 0 2px rgba(34,197,94,0.6); }
            }
            .cell-playing {
              animation: glow-pulse 2s ease-in-out infinite, shimmer 2.5s linear infinite;
              background-image: linear-gradient(90deg, transparent 20%, rgba(34,197,94,0.12) 50%, transparent 80%) !important;
              background-size: 200% 100%;
              background-color: #dcfce7 !important;
              position: relative;
            }
            .cell-playing::before {
              content: '';
              position: absolute;
              top: 1px; left: 1px;
              width: 6px; height: 6px;
              background: #22c55e;
              border-radius: 50%;
              animation: playing-dot-ping 1.5s ease-in-out infinite;
              z-index: 2;
            }
            @keyframes playing-dot-ping {
              0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
              50% { opacity: 0.8; transform: scale(1.3); box-shadow: 0 0 0 4px rgba(34,197,94,0); }
            }
            .cell-waiting {
              position: relative;
            }
            .cell-finished {
              position: relative;
              opacity: 1;
            }
            .cell-finished::before {
              content: '';
              position: absolute;
              inset: 0;
              background: repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 4px,
                rgba(56,189,248,0.06) 4px,
                rgba(56,189,248,0.06) 8px
              );
              pointer-events: none;
              z-index: 1;
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
              content: '\\25BC';
              position: absolute;
              bottom: -2px;
              right: -4px;
              font-size: 8px;
              color: #ef4444;
              z-index: 5;
            }
          `}</style>
          <div className="overflow-auto flex-1 relative">
            <table className="border-collapse min-w-full">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-800 text-white text-xs px-3 py-2 border border-gray-600 whitespace-nowrap">
                    コート
                  </th>
                  {timeSlots.map((time, idx) => {
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
                {courtNames.map((cn) => (
                  <tr key={cn} className="group">
                    <td className="sticky left-0 z-10 bg-gray-100 font-bold text-sm px-3 py-2 border border-gray-300 text-center whitespace-nowrap group-hover:bg-gray-200 transition-colors">
                      {cn}
                    </td>
                    {timeSlots.map((time, slotIdx) => {
                      const isNowSlot = slotIdx === currentSlotIndex;
                      const isPastSlot = currentSlotIndex >= 0 && slotIdx < currentSlotIndex;
                      const entry = gridData.get(cn)?.get(time);

                      if (!entry) {
                        return (
                          <td
                            key={slotIdx}
                            className={`border border-gray-200 min-w-[80px] h-12 transition-colors ${
                              isNowSlot ? 'bg-red-50/50 time-now-line' : isPastSlot ? 'bg-gray-50/80' : ''
                            }`}
                          />
                        );
                      }

                      const { item, index } = entry;
                      const dbMatch = matchLookup.get(index);
                      const isFinished = dbMatch?.status === 'finished' || dbMatch?.status === 'walkover';
                      const isWalkover = dbMatch?.status === 'walkover';
                      const isPlaying = dbMatch?.status === 'playing';

                      const color = eventColorMap.get(item.eventName);
                      const evAbbr = abbreviateEventName(item.eventName);

                      // Player names (苗字のみ表示)
                      let playerLabel = '';
                      if (dbMatch) {
                        const getSurname = (name: string | undefined) => {
                          if (!name) return '';
                          const base = name.split(/[/／]/)[0] || '';
                          const surname = base.split(/[\s　]+/)[0] || '';
                          return surname.slice(0, 4);
                        };
                        const p1 = getSurname(dbMatch.player1Name);
                        const p2 = getSurname(dbMatch.player2Name);
                        if (p1 && p2 && p1 !== 'BYE' && p2 !== 'BYE') {
                          playerLabel = `${p1}v${p2}`;
                        } else if (p1 && p1 !== 'BYE') {
                          playerLabel = p1;
                        }
                      }

                      // Status-based background
                      let statusBg = '';
                      let cellStatusClass = '';
                      if (isPlaying) {
                        statusBg = 'bg-green-100';
                        cellStatusClass = 'cell-playing';
                      } else if (isFinished) {
                        statusBg = 'bg-sky-50/60';
                        cellStatusClass = 'cell-finished';
                      } else {
                        statusBg = color?.bg || 'bg-gray-50';
                        cellStatusClass = 'cell-waiting';
                      }

                      const tooltipParts = [evAbbr, roundLabelToJapanese(item.roundLabel)];
                      if (dbMatch?.player1Name) tooltipParts.push(`${dbMatch.player1Name} vs ${dbMatch.player2Name}`);
                      if (dbMatch?.score) tooltipParts.push(dbMatch.score);

                      return (
                        <td
                          key={slotIdx}
                          onClick={() => handleCellClick(index)}
                          title={tooltipParts.join(' | ')}
                          className={`border border-gray-300 min-w-[80px] h-12 cursor-pointer text-center transition-all duration-300 px-0.5 ${statusBg} ${color?.text || 'text-gray-800'} hover:brightness-90 hover:scale-[1.02] ${cellStatusClass} ${isNowSlot && !isFinished && !isPlaying ? 'time-now-line' : ''}`}
                        >
                          <div className="flex items-center justify-center gap-0.5 relative z-[2]">
                            <span className="text-[10px] font-medium leading-tight truncate">{evAbbr}</span>
                            <span className={`text-[9px] leading-tight ${isFinished ? 'text-sky-500' : isPlaying ? 'text-green-700' : 'opacity-70'}`}>{roundLabelToJapanese(item.roundLabel)}</span>
                          </div>
                          {playerLabel && (
                            <div className={`text-[8px] leading-tight truncate relative z-[2] ${isWalkover ? 'line-through text-gray-400' : isFinished ? 'text-sky-600/70' : isPlaying ? 'text-green-800' : 'opacity-80'}`}>
                              {playerLabel}
                            </div>
                          )}
                          {dbMatch?.score && isFinished && (
                            <div className="text-[7px] leading-tight truncate font-mono text-sky-500 font-bold relative z-[2]">
                              {dbMatch.score}
                            </div>
                          )}
                          {isPlaying && !dbMatch?.score && (
                            <div className="text-[7px] leading-tight font-bold text-green-600 relative z-[2]">
                              試合中
                            </div>
                          )}
                        </td>
                      );
                    })}
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
            タイムテーブルデータがありません
          </h3>
          <p className="text-gray-500 max-w-md">
            Excel読込ボタンまたはGoogle Drive時間割フォルダからスケジュールデータをインポートしてください。
          </p>
        </div>
      )}

      {/* Edit Cell Modal */}
      {editingCell && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setEditingCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-primary-500" />
                セル編集
              </h3>
              <button onClick={() => setEditingCell(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {(() => {
              const item = importedSchedule[editingCell.scheduleIndex];
              if (!item) return null;
              return (
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 rounded-lg text-sm">
                    <span className="font-medium">{item.eventName}</span>
                    <span className="ml-2 text-gray-500">{item.roundLabel}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">コート</label>
                    <select
                      value={editingCell.courtName}
                      onChange={e => setEditingCell({ ...editingCell, courtName: e.target.value })}
                      className="w-full border border-border-main rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
                    >
                      {courtNames.map(cn => (
                        <option key={cn} value={cn}>{cn}番コート</option>
                      ))}
                      {/* Also allow typing a new court */}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">開始時間</label>
                    <input
                      type="time"
                      value={editingCell.startTime}
                      onChange={e => setEditingCell({ ...editingCell, startTime: e.target.value })}
                      className="w-full border border-border-main rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
                    />
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingCell(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleEditSave}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Google Drive File Picker Modal */}
      {showDrivePicker && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowDrivePicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <GoogleDriveIcon className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">時間割フォルダ</h3>
              </div>
              <button onClick={() => setShowDrivePicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {driveLoading && driveFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary-500" />
                  <p className="text-sm">ファイル一覧を読み込み中...</p>
                </div>
              )}
              {driveError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                  {driveError}
                </div>
              )}
              {!driveLoading && driveFiles.length === 0 && !driveError && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FolderOpen className="w-12 h-12 mb-3" />
                  <p className="text-sm">ファイルがありません</p>
                </div>
              )}
              {driveFiles.length > 0 && (
                <div className="space-y-1">
                  {driveFiles.map(file => {
                    const modDate = new Date(file.modifiedTime);
                    const dateStr = `${modDate.getFullYear()}/${String(modDate.getMonth() + 1).padStart(2, '0')}/${String(modDate.getDate()).padStart(2, '0')} ${String(modDate.getHours()).padStart(2, '0')}:${String(modDate.getMinutes()).padStart(2, '0')}`;
                    const sizeKB = Math.round(parseInt(file.size || '0') / 1024);
                    return (
                      <button
                        key={file.id}
                        onClick={() => handleDriveFileSelect(file)}
                        disabled={driveLoading}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-primary-50 border border-transparent hover:border-primary-200 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{dateStr} · {sizeKB > 0 ? `${sizeKB} KB` : '--'}</div>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 group-hover:text-primary-500 flex-shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
              {driveLoading && driveFiles.length > 0 && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                  <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-400 text-center">
                鳥取テニス協会バックアップ &gt; 大会運営システム &gt; 時間割
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
