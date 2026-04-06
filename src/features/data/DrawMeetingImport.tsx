import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Upload, CheckCircle2, AlertCircle, Users, Trophy, Dices, ChevronDown, ChevronRight, FileSpreadsheet, Sparkles, Calendar, MapPin, CalendarClock, RefreshCw, X, Maximize2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseDrawExcel } from './drawExcelParser';
import type { ParsedDrawFile } from './drawExcelParser';
import type { ImportedScheduleItem } from '../../stores/appStore';
import { parseMixedExcel, extractExcelSheets } from '../mixed/mixedExcelParser';
import type { TournamentInfo, MixedLeague, LeagueMatchScore } from '../mixed/types';
import { useMixedStore } from '../mixed/mixedStore';
import { parseTeamExcel } from '../team/teamExcelParser';
import type { TeamTournamentInfo, TeamLeague, TeamLeagueMatch } from '../team/types';
import { useTeamStore } from '../team/teamStore';
import { useNavigate } from 'react-router-dom';

// ドロー会議システムのイベントコード → 大会運営システムの種目定義
const EVENT_MAP: Record<string, { name: string; type: 'Singles' | 'Doubles' }> = {
  ms:   { name: '一般男子シングルス',       type: 'Singles' },
  ls:   { name: '一般女子シングルス',       type: 'Singles' },
  m35s: { name: '男子35歳以上シングルス',   type: 'Singles' },
  m45s: { name: '男子45歳以上シングルス',   type: 'Singles' },
  m55s: { name: '男子55歳以上シングルス',   type: 'Singles' },
  m65s: { name: '男子65歳以上シングルス',   type: 'Singles' },
  l45s: { name: '女子45歳以上シングルス',   type: 'Singles' },
  mbs:  { name: '男子B級シングルス',        type: 'Singles' },
  lbs:  { name: '女子B級シングルス',        type: 'Singles' },
  md:   { name: '一般男子ダブルス',         type: 'Doubles' },
  ld:   { name: '一般女子ダブルス',         type: 'Doubles' },
  m45d: { name: '男子45歳以上ダブルス',     type: 'Doubles' },
  m55d: { name: '男子55歳以上ダブルス',     type: 'Doubles' },
  m65d: { name: '男子65歳以上ダブルス',     type: 'Doubles' },
  l45d: { name: '女子45歳以上ダブルス',     type: 'Doubles' },
  l55d: { name: '女子55歳以上ダブルス',     type: 'Doubles' },
  mbd:  { name: '男子B級ダブルス',          type: 'Doubles' },
  lbd:  { name: '女子B級ダブルス',          type: 'Doubles' },
};

// ドロー会議システムのデータ型
interface DrawMeetingEntry {
  id: number;
  name: string;
  furigana: string;
  affiliation: string;
  eventCode: string;
  rank: number | null;
  points: number;
  partner: string;
  partnerAffiliation: string;
  partnerPoints: number;
  pairId: number;
  confirmed: boolean;
  paid: boolean;
}

interface DrawMeetingDrawSlot {
  position: number;
  name: string;
  furigana: string;
  affiliation: string;
  affiliation1?: string;
  affiliation2?: string;
  points: number;
  seed: number;
  isBye: boolean;
}

interface DrawMeetingDrawResult {
  draw: DrawMeetingDrawSlot[];
  drawSize: number;
  entries: any[];
  seeds: any[];
  eventName: string;
  eventCode: string;
  entryCount: number;
  confirmed: boolean;
}

interface DrawMeetingTournament {
  id: number;
  name: string;
  events: string;
  date: string;
  dayOfWeek: string;
  venue: string;
  reserveDate: string;
  reserveVenue: string;
  deadline: string;
}

// パース結果
interface ParsedData {
  format: 'complete-backup' | 'draw-share';
  tournamentName: string;
  tournaments: DrawMeetingTournament[];
  entries: DrawMeetingEntry[];
  drawResults: Record<string, DrawMeetingDrawResult>;
  confirmedEvents: Record<string, boolean>;
  rankings: Record<string, any[]>;
  furiganaMap: Record<string, string>;
  exportedAt: string;
}

// プレビュー用サマリー
interface ImportSummary {
  playerCount: number;
  eventCodes: string[];
  entryCounts: Record<string, number>;
  drawCounts: Record<string, { drawSize: number; entryCount: number }>;
  hasTournamentInfo: boolean;
  hasRankingData: boolean;
  tournamentDate: string;
  tournamentVenue: string;
}

function parseImportFile(json: any): ParsedData | null {
  // draw-share形式
  if (json.type === 'draw-share') {
    // draw-share形式にも大会情報が含まれる場合がある
    const shareTournaments: DrawMeetingTournament[] = [];
    if (json.tournament) {
      shareTournaments.push(json.tournament);
    } else if (json.tournamentDate || json.date) {
      shareTournaments.push({
        id: 0,
        name: json.tournamentName || '',
        events: '',
        date: json.tournamentDate || json.date || '',
        dayOfWeek: json.dayOfWeek || '',
        venue: json.venue || json.tournamentVenue || '',
        reserveDate: json.reserveDate || '',
        reserveVenue: json.reserveVenue || '',
        deadline: '',
      });
    }
    return {
      format: 'draw-share',
      tournamentName: json.tournamentName || '',
      tournaments: shareTournaments,
      entries: [],
      drawResults: json.drawResults || {},
      confirmedEvents: json.confirmedEvents || {},
      rankings: {},
      furiganaMap: {},
      exportedAt: json.exportedAt || '',
    };
  }

  // 完全バックアップ形式
  if (json.drawSystem_entries || json.drawSystem_drawResults || json.drawSystem_tournaments) {
    const entryData = json.drawSystem_entries;
    const drawData = json.drawSystem_drawResults;
    const tournamentData = json.drawSystem_tournaments;
    const rankingData = json.drawSystem_rankingBackup;

    return {
      format: 'complete-backup',
      tournamentName: '',
      tournaments: tournamentData?.tournaments || [],
      entries: entryData?.entries || [],
      drawResults: drawData?.drawResults || {},
      confirmedEvents: drawData?.confirmedEvents || {},
      rankings: rankingData?.rankings || {},
      furiganaMap: rankingData?.furiganaMap || {},
      exportedAt: json.exportedAt || '',
    };
  }

  // 個別エクスポート: 大会一覧バックアップ形式 { tournaments: [...], nextId }
  if (json.tournaments && Array.isArray(json.tournaments)) {
    return {
      format: 'complete-backup',
      tournamentName: json.tournaments[0]?.name || '',
      tournaments: json.tournaments,
      entries: [],
      drawResults: {},
      confirmedEvents: {},
      rankings: {},
      furiganaMap: {},
      exportedAt: json.savedAt || '',
    };
  }

  return null;
}

function buildSummary(data: ParsedData): ImportSummary {
  const playerNames = new Set<string>();
  const entryCounts: Record<string, number> = {};
  const drawCounts: Record<string, { drawSize: number; entryCount: number }> = {};

  // エントリーから選手を集計
  for (const entry of data.entries) {
    if (entry.name) playerNames.add(entry.name.replace(/\s+/g, ''));
    if (entry.partner) playerNames.add(entry.partner.replace(/\s+/g, ''));
    const code = entry.eventCode;
    entryCounts[code] = (entryCounts[code] || 0) + 1;
  }

  // ドロー結果から集計
  const eventCodes: string[] = [];
  for (const [code, result] of Object.entries(data.drawResults)) {
    eventCodes.push(code);
    drawCounts[code] = { drawSize: result.drawSize, entryCount: result.entryCount };
    // ドロー結果からも選手を収集
    for (const slot of result.draw) {
      if (!slot.isBye && slot.name) {
        // ダブルスの場合 "A / B" 形式
        const names = slot.name.split(' / ');
        for (const n of names) {
          playerNames.add(n.trim().replace(/\s+/g, ''));
        }
      }
    }
  }

  // エントリーのみの種目も追加
  for (const code of Object.keys(entryCounts)) {
    if (!eventCodes.includes(code)) eventCodes.push(code);
  }

  const firstTournament = data.tournaments[0];
  return {
    playerCount: playerNames.size,
    eventCodes,
    entryCounts,
    drawCounts,
    hasTournamentInfo: data.tournaments.length > 0,
    hasRankingData: Object.keys(data.rankings).length > 0,
    tournamentDate: firstTournament?.date || '',
    tournamentVenue: firstTournament?.venue || '',
  };
}

/** 大会名から不要な文字列を自動除去 */
function cleanTournamentName(name: string): string {
  return name
    // 「（確定）」「(リドロー)」「(最終版)」などカッコ付き注釈を先に除去
    .replace(/[（(]\s*(確定|最終版?|暫定|ドロー|リドロー|re[-\s]?draw|final)\s*[）)]/gi, '')
    // 「_ドロー結果」「_最終版」などアンダースコア区切りの接尾辞
    .replace(/[_\-]\s*(ドロー|リドロー|最終版?|確定版?|final|v\d+)\s*/gi, '')
    // 「ドロー」「リドロー」「re-draw」「redraw」などを除去
    .replace(/\s*リドロー\s*/gi, '')
    .replace(/\s*ドロー\s*/gi, '')
    .replace(/\s*re[-\s]?draw\s*/gi, '')
    .replace(/\s*draw\s*/gi, '')
    // 残った空のカッコを除去
    .replace(/[（(]\s*[）)]/g, '')
    // 先頭・末尾の空白・記号を整理
    .replace(/^[\s_\-]+|[\s_\-]+$/g, '')
    .trim();
}

/** Excelシリアル値(0-1)または文字列からHH:MM形式に変換 */
function excelTimeToString(val: unknown): string | null {
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
}

/** 「コートNO.」行を自動検出してスケジュールグリッドの開始行を見つける
 *  複数のパターン（パターン1, パターン2等）がある場合は最後のグリッドを使用 */
function findScheduleGrid(rows: any[]): {
  headerRowIdx: number;
  dataStartIdx: number;
  timeColumns: { colIdx: number; time: string }[];
} | null {
  let lastMatch: { headerRowIdx: number; dataStartIdx: number; timeColumns: { colIdx: number; time: string }[] } | null = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] as any[];
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
      lastMatch = { headerRowIdx: r, dataStartIdx: r + 1, timeColumns };
    }
  }
  return lastMatch;
}

/** 全角英数字→半角に変換 + 全角スペース→半角 */
function normalizeFullWidth(s: string): string {
  return s
    .replace(/[\u3000]+/g, ' ')
    .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41))
    .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF41 + 0x61))
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
}

/** 時間割Excelをパースする */
function parseScheduleExcel(data: ArrayBuffer): ImportedScheduleItem[] {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

  const items: ImportedScheduleItem[] = [];
  let globalOrder = 0;

  if (!rows || rows.length === 0) return items;

  // === Format 1: 「コートNO.」行を自動検出するグリッド形式 ===
  // 実際の時間割Excelで最もよく使われる形式
  // ヘッダー行: コートNO. | 9:00 | 9:30 | 10:00 | ...
  // データ行:   1         | MS1R | LD QF| ...
  const grid = findScheduleGrid(rows);
  if (grid) {
    for (let ri = grid.dataStartIdx; ri < rows.length; ri++) {
      const row = rows[ri] as any[];
      if (!row || row.length === 0) continue;
      const rawCourtName = String(row[0] ?? '').trim();
      if (!rawCourtName) continue;
      // コート番号（数値）の行のみ処理
      const courtNum = parseInt(rawCourtName, 10);
      if (isNaN(courtNum)) {
        if (items.length > 0) break; // データ行が終わった
        continue;
      }
      const courtName = String(courtNum);

      for (const tc of grid.timeColumns) {
        const cell = normalizeFullWidth(String(row[tc.colIdx] ?? '')).trim();
        if (!cell) continue;
        globalOrder++;
        // 解析: EVENT_MAPのキーで種目を先にマッチし、残りをラウンドとする
        const cellLower = cell.toLowerCase().replace(/\s+/g, '');
        let eventName = '';
        let roundLabel = '';
        // EVENT_MAPのキーを長い順に試す（"m45s" > "ms" のように長い方を優先）
        const sortedKeys = Object.keys(EVENT_MAP).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
          if (cellLower.startsWith(key)) {
            eventName = EVENT_MAP[key].name;
            const remainder = cellLower.slice(key.length).trim();
            if (/^\d+r$/.test(remainder)) roundLabel = remainder.toUpperCase();
            else if (remainder === 'qf') roundLabel = 'QF';
            else if (remainder === 'sf') roundLabel = 'SF';
            else if (remainder === 'f') roundLabel = 'F';
            else if (!remainder) roundLabel = '1R';
            else roundLabel = remainder.toUpperCase() || '1R';
            break;
          }
        }
        // EVENT_MAPにマッチしなかった場合はフォールバック（従来ロジック）
        if (!eventName) {
          const roundMatch = cell.match(/(\d+\s*R|Q\s*F|S\s*F|決勝|準決勝|準々決勝)/i);
          roundLabel = roundMatch ? roundMatch[0].replace(/\s+/g, '').toUpperCase() : '1R';
          // 末尾のF（決勝）を検出（種目名内のFと区別するためスペース区切りまたは末尾）
          if (!roundMatch && /[\s　]F$/i.test(cell)) roundLabel = 'F';
          const rawEventName = cell
            .replace(/\d+\s*R/gi, '')
            .replace(/Q\s*F/gi, '')
            .replace(/S\s*F/gi, '')
            .replace(/準々決勝|準決勝|決勝/g, '')
            .replace(/[\s　]F$/i, '')
            .trim();
          eventName = rawEventName || cell;
        }
        items.push({
          eventName,
          roundLabel: roundLabel || '1R',
          matchOrder: globalOrder,
          courtName,
          startTime: tc.time,
        });
      }
    }
    if (items.length > 0) return items;
  }

  // === Format 2: リスト形式 ===
  // 各行が1試合: コート | 時刻 | 種目 | 回戦
  const firstRow = rows[0] as any[];
  const headerStr = (firstRow || []).map((c: any) => String(c || '').trim().toLowerCase()).join(',');
  const isListFormat = /コート|court/.test(headerStr) && (/時刻|時間|time/.test(headerStr) || /種目|event/.test(headerStr));

  if (isListFormat) {
    const headers = firstRow.map((c: any) => String(c || '').trim());
    let courtIdx = -1, timeIdx = -1, eventIdx = -1, roundIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/^(コート|court|コート名)$/i.test(h)) courtIdx = i;
      else if (/^(時刻|時間|開始時刻|time|開始)$/i.test(h)) timeIdx = i;
      else if (/^(種目|event|イベント|種目名|カテゴリ)$/i.test(h)) eventIdx = i;
      else if (/^(回戦|ラウンド|round|R)$/i.test(h)) roundIdx = i;
    }

    for (let ri = 1; ri < rows.length; ri++) {
      const row = rows[ri] as any[];
      if (!row || row.length < 2) continue;
      const courtVal = courtIdx >= 0 ? String(row[courtIdx] || '').trim() : '';
      const timeVal = timeIdx >= 0 ? String(row[timeIdx] || '').trim() : '';
      const eventVal = eventIdx >= 0 ? String(row[eventIdx] || '').trim() : '';
      const roundVal = roundIdx >= 0 ? String(row[roundIdx] || '').trim() : '1R';
      if (!courtVal && !timeVal && !eventVal) continue;
      globalOrder++;
      items.push({
        eventName: eventVal,
        roundLabel: roundVal || '1R',
        matchOrder: globalOrder,
        courtName: courtVal,
        startTime: normalizeScheduleTime(timeVal),
      });
    }
    if (items.length > 0) return items;
  }

  // === Format 3: シンプルグリッド形式（フォールバック） ===
  // 1行目がコート名、1列目が時刻
  if (firstRow) {
    const courtNames = firstRow.slice(1).map((c: any) => String(c || '').trim()).filter(c => c);
    if (courtNames.length > 0) {
      for (let ri = 1; ri < rows.length; ri++) {
        const row = rows[ri] as any[];
        if (!row || !row[0]) continue;
        const time = excelTimeToString(row[0]) || normalizeScheduleTime(String(row[0]).trim());
        for (let ci = 0; ci < courtNames.length; ci++) {
          const cell = normalizeFullWidth(String(row[ci + 1] || '')).trim();
          if (!cell) continue;
          globalOrder++;
          // EVENT_MAPのキーで種目を先にマッチ
          const cellLower3 = cell.toLowerCase().replace(/\s+/g, '');
          let eventName = '';
          let roundLabel = '';
          const sortedKeys3 = Object.keys(EVENT_MAP).sort((a, b) => b.length - a.length);
          for (const key of sortedKeys3) {
            if (cellLower3.startsWith(key)) {
              eventName = EVENT_MAP[key].name;
              const remainder = cellLower3.slice(key.length).trim();
              if (/^\d+r$/.test(remainder)) roundLabel = remainder.toUpperCase();
              else if (remainder === 'qf') roundLabel = 'QF';
              else if (remainder === 'sf') roundLabel = 'SF';
              else if (remainder === 'f') roundLabel = 'F';
              else if (!remainder) roundLabel = '1R';
              else roundLabel = remainder.toUpperCase() || '1R';
              break;
            }
          }
          if (!eventName) {
            const roundMatch = cell.match(/(\d+\s*R|Q\s*F|S\s*F|決勝|準決勝|準々決勝)/i);
            roundLabel = roundMatch ? roundMatch[0].replace(/\s+/g, '').toUpperCase() : '1R';
            if (!roundMatch && /[\s　]F$/i.test(cell)) roundLabel = 'F';
            const rawEventName = cell
              .replace(/\d+\s*R/gi, '').replace(/Q\s*F/gi, '').replace(/S\s*F/gi, '')
              .replace(/準々決勝|準決勝|決勝/g, '').replace(/[\s　]F$/i, '').trim();
            eventName = rawEventName || cell;
          }
          items.push({
            eventName,
            roundLabel,
            matchOrder: globalOrder,
            courtName: courtNames[ci],
            startTime: time,
          });
        }
      }
    }
  }

  return items;
}

/** 時刻文字列を正規化 */
function normalizeScheduleTime(raw: string): string {
  const trimmed = raw.trim();
  // Excel のシリアル値 (0-1) の場合
  const num = Number(trimmed);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // "9:00" or "09:00" 形式
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return trimmed;
}

interface DataImportProps {
  /** GDriveからダウンロードされた大会Excel (DataSyncから渡される) */
  externalTournamentExcel?: { arrayBuffer: ArrayBuffer; fileName: string } | null;
  /** GDriveからダウンロードされた時間割Excel (DataSyncから渡される) */
  externalScheduleExcel?: { arrayBuffer: ArrayBuffer; fileName: string } | null;
  /** ウィザードで確認済みの自動インポート情報（設定されている場合はモーダル表示せず直接インポート） */
  wizardAutoImport?: { name: string; date: string; venue: string; reserveDate: string } | null;
}

export default function DataImport({ externalTournamentExcel, externalScheduleExcel, wizardAutoImport }: DataImportProps) {
  const setCurrentTournamentId = useAppStore(state => state.setCurrentTournamentId);
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const persistedImportedSchedule = useAppStore(state => state.importedSchedule);
  const persistedScheduleFileName = useAppStore(state => state.scheduleFileName);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parsedExcel, setParsedExcel] = useState<ParsedDrawFile | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [editTournamentName, setEditTournamentName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editReserveDate, setEditReserveDate] = useState('');
  // 会場・日程の選択モード: 'normal' | 'reserve' | 'custom'
  const [venueMode, setVenueMode] = useState<'normal' | 'reserve' | 'custom'>('normal');
  const [dateMode, setDateMode] = useState<'normal' | 'reserve' | 'custom'>('normal');
  // 元データの通常・予備日情報を保持
  const [sourceVenue, setSourceVenue] = useState('');
  const [sourceReserveVenue, setSourceReserveVenue] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [sourceReserveDate, setSourceReserveDate] = useState('');
  // 時間割全画面表示
  const [scheduleFullscreen, setScheduleFullscreen] = useState(false);
  // ミックス大会確認ダイアログ
  const [mixedPending, setMixedPending] = useState<{
    info: TournamentInfo;
    leagues: MixedLeague[];
    matches: LeagueMatchScore[];
    fileName: string;
  } | null>(null);
  const [mixedEditName, setMixedEditName] = useState('');
  // 団体戦確認ダイアログ
  const [teamPending, setTeamPending] = useState<{
    info: TeamTournamentInfo;
    leagues: TeamLeague[];
    matches: TeamLeagueMatch[];
    fileName: string;
  } | null>(null);
  const [teamEditName, setTeamEditName] = useState('');
  const [teamEditDate, setTeamEditDate] = useState('');
  const [teamEditVenue, setTeamEditVenue] = useState('');
  const [mixedEditDate, setMixedEditDate] = useState('');
  const [mixedEditVenue, setMixedEditVenue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleFileInputRef = useRef<HTMLInputElement>(null);

  // 時間割インポート
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleItems, setScheduleItems] = useState<ImportedScheduleItem[]>([]);
  const [scheduleFileName, setScheduleFileName] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  // マウント時：永続化された時間割データを復元
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 時間割データを復元
    if (persistedImportedSchedule.length > 0) {
      setScheduleItems(persistedImportedSchedule);
      setScheduleFileName(persistedScheduleFileName);
    }

    // 大会情報をDBから復元
    if (currentTournamentId) {
      db.tournaments.where('tournamentId').equals(currentTournamentId).first().then(tournament => {
        if (tournament) {
          setEditTournamentName(prev => prev || tournament.name || '');
          setEditDate(prev => prev || tournament.date || '');
          setEditVenue(prev => prev || tournament.venue || '');
          setEditReserveDate(prev => prev || tournament.reserveDate || '');
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 外部から渡されたExcelデータ（GDriveからDL済み）を処理 ---
  const processExcelArrayBuffer = useCallback((arrayBuffer: ArrayBuffer, fileName: string) => {
    try {
      const result = parseDrawExcel(arrayBuffer, fileName);
      if (!result.events || result.events.length === 0) {
        // ミックス大会フォーマットを試行
        try {
          const mixedResult = parseMixedExcel(arrayBuffer);
          if (mixedResult.leagues.length > 0) {
            // Extract raw sheet data for viewer
            try {
              const sheets = extractExcelSheets(arrayBuffer);
              useMixedStore.getState().setRawExcelSheets(sheets);
            } catch { /* ignore extraction errors */ }
            setMixedPending({ info: mixedResult.info, leagues: mixedResult.leagues, matches: mixedResult.matches, fileName });
            setMixedEditName(mixedResult.info.name);
            setMixedEditDate(mixedResult.info.date);
            setMixedEditVenue(mixedResult.info.venue);
            return;
          }
        } catch { /* fall through */ }
        // 団体戦フォーマットを試行
        try {
          const teamResult = parseTeamExcel(arrayBuffer);
          if (teamResult.leagues.length > 0) {
            setTeamPending({ info: teamResult.info, leagues: teamResult.leagues, matches: teamResult.matches, fileName });
            setTeamEditName(teamResult.info.name);
            setTeamEditDate(teamResult.info.date);
            setTeamEditVenue(teamResult.info.venue);
            return;
          }
        } catch { /* fall through */ }
        setImportResult({ success: false, message: 'Excelファイルからドロー情報を検出できませんでした。' });
        return;
      }
      setParsedExcel(result);
      setParsedData(null);
      setSummary(null);
      setImportResult(null);
      const rawName = result.tournamentName || fileName.replace(/\.(xlsx?|xls)$/i, '');
      setEditTournamentName(cleanTournamentName(rawName));
      if (result.date) { setEditDate(result.date); setSourceDate(result.date); }
      if (result.venue) { setEditVenue(result.venue); setSourceVenue(result.venue); }
      if (result.reserveDate) { setSourceReserveDate(result.reserveDate); setEditReserveDate(result.reserveDate); }
      if (result.reserveVenue) setSourceReserveVenue(result.reserveVenue);
      setVenueMode('normal'); setDateMode('normal');
    } catch (err) {
      setImportResult({ success: false, message: `Excelの解析に失敗しました: ${(err as Error).message}` });
    }
  }, []);

  // 外部から渡された時間割Excelを処理
  const processScheduleArrayBuffer = useCallback((arrayBuffer: ArrayBuffer, fileName: string) => {
    try {
      const items = parseScheduleExcel(arrayBuffer);
      if (items.length === 0) {
        setScheduleError('時間割データを検出できませんでした。');
        return;
      }
      setScheduleItems(items);
      setScheduleFileName(fileName);
      setScheduleError('');
      useAppStore.getState().setImportedSchedule(items);
      useAppStore.getState().setScheduleFileName(fileName);
      setScheduleOpen(true);
    } catch (err) {
      setScheduleError(`時間割の解析に失敗しました: ${(err as Error).message}`);
    }
  }, []);

  // GDrive用モーダル表示フラグ
  const [showGDriveModal, setShowGDriveModal] = useState(false);
  // ウィザードからの自動インポートフラグ
  const [autoImportPending, setAutoImportPending] = useState(false);

  // GDriveから大会Excelが渡されたら処理してモーダル表示（またはウィザード経由で自動インポート）
  useEffect(() => {
    if (externalTournamentExcel) {
      if (wizardAutoImport) {
        // ウィザードで確認済み → モーダルなしで自動インポート
        processExcelArrayBuffer(externalTournamentExcel.arrayBuffer, externalTournamentExcel.fileName);
        // 編集済みの値をセット
        setEditTournamentName(wizardAutoImport.name);
        setEditDate(wizardAutoImport.date);
        setEditVenue(wizardAutoImport.venue);
        setEditReserveDate(wizardAutoImport.reserveDate);
        // モーダルを表示せず自動インポートをトリガー
        setAutoImportPending(true);
      } else {
        processExcelArrayBuffer(externalTournamentExcel.arrayBuffer, externalTournamentExcel.fileName);
        setShowGDriveModal(true);
      }
    }
  }, [externalTournamentExcel, processExcelArrayBuffer, wizardAutoImport]);

  // GDriveから時間割Excelが渡されたら処理
  useEffect(() => {
    if (externalScheduleExcel) {
      processScheduleArrayBuffer(externalScheduleExcel.arrayBuffer, externalScheduleExcel.fileName);
    }
  }, [externalScheduleExcel, processScheduleArrayBuffer]);

  // --- JSON file handler (existing) ---
  const handleJsonFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const data = parseImportFile(json);
        if (!data) {
          setImportResult({ success: false, message: 'データ形式を認識できませんでした。' });
          return;
        }
        setParsedData(data);
        setParsedExcel(null);
        const sum = buildSummary(data);
        setSummary(sum);
        setImportResult(null);
        const rawName = data.tournamentName || data.tournaments[0]?.name || '';
        setEditTournamentName(cleanTournamentName(rawName));
        setEditDate(sum.tournamentDate);
        setEditVenue(sum.tournamentVenue);
        if (data.tournaments.length > 0) {
          setEditReserveDate(data.tournaments[0].reserveDate || '');
        }
        if (data.tournaments.length === 1) setSelectedTournament(data.tournaments[0].id);
      } catch (err) {
        setImportResult({ success: false, message: `JSONの解析に失敗しました: ${(err as Error).message}` });
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  // --- Excel file handler (new) ---
  const navigate = useNavigate();
  const handleExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const result = parseDrawExcel(arrayBuffer, file.name);
        if (!result.events || result.events.length === 0) {
          // ドロー検出失敗 → ミックス大会フォーマットを試行
          try {
            const mixedResult = parseMixedExcel(arrayBuffer);
            if (mixedResult.leagues.length > 0) {
              // Extract raw sheet data for viewer
              try {
                const sheets = extractExcelSheets(arrayBuffer);
                useMixedStore.getState().setRawExcelSheets(sheets);
              } catch { /* ignore */ }
              // ミックス大会として読み込み成功 → 確認ダイアログを表示
              setMixedPending({ info: mixedResult.info, leagues: mixedResult.leagues, matches: mixedResult.matches, fileName: file.name });
              setMixedEditName(mixedResult.info.name);
              setMixedEditDate(mixedResult.info.date);
              setMixedEditVenue(mixedResult.info.venue);
              return;
            }
          } catch {
            // ミックスパーサーも失敗
          }
          // 団体戦フォーマットを試行
          try {
            const teamResult = parseTeamExcel(arrayBuffer);
            if (teamResult.leagues.length > 0) {
              setTeamPending({ info: teamResult.info, leagues: teamResult.leagues, matches: teamResult.matches, fileName: file.name });
              setTeamEditName(teamResult.info.name);
              setTeamEditDate(teamResult.info.date);
              setTeamEditVenue(teamResult.info.venue);
              return;
            }
          } catch {
            // 団体戦パーサーも失敗 → 元のエラーを表示
          }
          setImportResult({ success: false, message: 'Excelファイルからドロー情報を検出できませんでした。ドロー表のExcelファイルを選択してください。' });
          return;
        }
        setParsedExcel(result);
        setParsedData(null);
        setSummary(null);
        setImportResult(null);
        // 大会名をプリセット（Excel内の大会名 > ファイル名）
        const rawName = result.tournamentName || file.name.replace(/\.(xlsx?|xls)$/i, '');
        setEditTournamentName(cleanTournamentName(rawName));
        // 日程・会場・予備日をプリセット（ソース情報も保持）
        if (result.date) { setEditDate(result.date); setSourceDate(result.date); }
        if (result.venue) { setEditVenue(result.venue); setSourceVenue(result.venue); }
        if (result.reserveDate) { setSourceReserveDate(result.reserveDate); setEditReserveDate(result.reserveDate); }
        if (result.reserveVenue) setSourceReserveVenue(result.reserveVenue);
        setVenueMode('normal'); setDateMode('normal');
      } catch (err) {
        setImportResult({ success: false, message: `Excelファイルの解析に失敗しました: ${(err as Error).message}` });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [navigate]);

  // --- Schedule Excel handler ---
  const handleScheduleFile = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (ext !== 'xlsx' && ext !== 'xls') {
      setScheduleError('対応していないファイル形式です。.xlsx / .xls ファイルを選択してください。');
      return;
    }
    setScheduleFileName(file.name);
    setScheduleError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const items = parseScheduleExcel(arrayBuffer);
        if (items.length === 0) {
          setScheduleError('時間割データを検出できませんでした。Excelの形式を確認してください。');
          return;
        }
        setScheduleItems(items);
        useAppStore.getState().setImportedSchedule(items);
        useAppStore.getState().setScheduleFileName(file.name);
      } catch (err) {
        setScheduleError(`Excelファイルの解析に失敗しました: ${(err as Error).message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);


  // --- File dispatcher: detect type by extension ---
  const handleFile = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (ext === 'json') {
      handleJsonFile(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      handleExcelFile(file);
    } else {
      setImportResult({ success: false, message: '対応していないファイル形式です。.json / .xlsx / .xls ファイルを選択してください。' });
    }
  }, [handleJsonFile, handleExcelFile]);


  // --- JSON import (existing) ---
  const handleImport = async () => {
    if (!parsedData || !summary) return;
    setIsImporting(true);
    setImportResult(null);

    try {
      const now = Date.now();
      const tournamentId = `T-${new Date().getFullYear()}-${String(now).slice(-4)}`;

      // 大会名決定（編集フィールド優先）
      let tournamentName = editTournamentName.trim();
      if (!tournamentName) {
        tournamentName = parsedData.tournamentName || '';
        if (!tournamentName && selectedTournament !== null) {
          const t = parsedData.tournaments.find(t => t.id === selectedTournament);
          if (t) tournamentName = t.name;
        }
      }
      if (!tournamentName) tournamentName = `インポート大会 ${new Date().toLocaleDateString('ja-JP')}`;

      // 大会の日程・会場
      const selTournament = selectedTournament !== null
        ? parsedData.tournaments.find(t => t.id === selectedTournament)
        : parsedData.tournaments[0];

      // --- 1. 大会作成 ---
      await db.tournaments.add({
        tournamentId,
        name: tournamentName,
        date: editDate || selTournament?.date || '',
        venue: editVenue || selTournament?.venue || '',
        reserveDate: editReserveDate || selTournament?.reserveDate || '',
        reserveVenue: selTournament?.reserveVenue || '',
        createdAt: now,
      });

      // --- 2. 選手マスタ & ふりがな辞書 ---
      const playerMap = new Map<string, { name: string; furigana: string; affiliation: string; rankings: Record<string, number> }>();

      // ランキングデータから選手を収集
      for (const [eventCode, players] of Object.entries(parsedData.rankings)) {
        const eventDef = EVENT_MAP[eventCode];
        if (!eventDef || !Array.isArray(players)) continue;
        for (const p of players) {
          const normalizedName = String(p.name).replace(/\s+/g, '');
          const existing = playerMap.get(normalizedName);
          if (existing) {
            existing.rankings[eventDef.name] = p.points || 0;
            if (!existing.furigana && p.furigana) existing.furigana = p.furigana;
          } else {
            playerMap.set(normalizedName, {
              name: p.name,
              furigana: p.furigana || '',
              affiliation: p.affiliation || '',
              rankings: { [eventDef.name]: p.points || 0 },
            });
          }
        }
      }

      // エントリーデータから選手を収集
      for (const entry of parsedData.entries) {
        const eventDef = EVENT_MAP[entry.eventCode];
        if (!eventDef) continue;

        // メイン選手
        if (entry.name) {
          const normalizedName = entry.name.replace(/\s+/g, '');
          const existing = playerMap.get(normalizedName);
          if (existing) {
            if (entry.points > 0) existing.rankings[eventDef.name] = entry.points;
            if (!existing.furigana && entry.furigana) existing.furigana = entry.furigana;
            if (!existing.affiliation && entry.affiliation) existing.affiliation = entry.affiliation;
          } else {
            playerMap.set(normalizedName, {
              name: entry.name,
              furigana: entry.furigana || '',
              affiliation: entry.affiliation || '',
              rankings: entry.points > 0 ? { [eventDef.name]: entry.points } : {},
            });
          }
        }

        // ダブルスパートナー
        if (entry.partner) {
          const partnerNorm = entry.partner.replace(/\s+/g, '');
          if (!playerMap.has(partnerNorm)) {
            playerMap.set(partnerNorm, {
              name: entry.partner,
              furigana: '',
              affiliation: entry.partnerAffiliation || '',
              rankings: entry.partnerPoints > 0 ? { [eventDef.name]: entry.partnerPoints } : {},
            });
          } else {
            const existing = playerMap.get(partnerNorm)!;
            if (entry.partnerPoints > 0) existing.rankings[eventDef.name] = entry.partnerPoints;
            if (!existing.affiliation && entry.partnerAffiliation) existing.affiliation = entry.partnerAffiliation;
          }
        }
      }

      // ドロー結果から選手を収集（エントリーがない場合の補完）
      for (const [eventCode, result] of Object.entries(parsedData.drawResults)) {
        const eventDef = EVENT_MAP[eventCode];
        if (!eventDef) continue;
        for (const slot of result.draw) {
          if (slot.isBye || !slot.name) continue;
          const isDoubles = eventDef.type === 'Doubles';
          if (isDoubles) {
            const names = slot.name.split(' / ');
            const affiliations = (slot.affiliation || '').split(' / ');
            for (let i = 0; i < names.length; i++) {
              const n = names[i]?.trim();
              if (!n) continue;
              const norm = n.replace(/\s+/g, '');
              if (!playerMap.has(norm)) {
                playerMap.set(norm, {
                  name: n,
                  furigana: '',
                  affiliation: affiliations[i]?.trim() || slot.affiliation1 || '',
                  rankings: slot.points > 0 ? { [eventDef.name]: Math.floor(slot.points / 2) } : {},
                });
              }
            }
          } else {
            const norm = slot.name.replace(/\s+/g, '');
            if (!playerMap.has(norm)) {
              playerMap.set(norm, {
                name: slot.name,
                furigana: slot.furigana || '',
                affiliation: slot.affiliation || '',
                rankings: slot.points > 0 ? { [eventDef.name]: slot.points } : {},
              });
            }
          }
        }
      }

      // ふりがなマップを適用
      for (const [name, furigana] of Object.entries(parsedData.furiganaMap)) {
        const norm = name.replace(/\s+/g, '');
        const p = playerMap.get(norm);
        if (p && !p.furigana && furigana) {
          p.furigana = furigana;
        }
      }

      // 選手をDB保存
      const playersToSave = Array.from(playerMap.entries()).map(([playerId, p]) => ({
        playerId,
        name: p.name,
        furigana: p.furigana,
        affiliation: p.affiliation,
        rankings: p.rankings,
        isManual: false,
      }));
      await db.players.bulkPut(playersToSave);

      // ふりがな辞書も保存
      const furiganaEntries = playersToSave
        .filter(p => p.furigana)
        .map(p => ({
          name: p.playerId,
          furigana: p.furigana.replace(/\s+/g, ''),
          type: 'auto' as const,
          updatedAt: now,
        }));
      if (furiganaEntries.length > 0) {
        await db.furiganaDict.bulkPut(furiganaEntries);
      }

      // --- 3. 種目作成 ---
      const eventIdMap: Record<string, string> = {}; // eventCode → eventId

      for (const eventCode of summary.eventCodes) {
        const eventDef = EVENT_MAP[eventCode];
        if (!eventDef) continue;

        const eventId = `E-${eventCode}-${now}`;
        eventIdMap[eventCode] = eventId;

        await db.events.add({
          tournamentId,
          eventId,
          name: eventDef.name,
          type: eventDef.type,
          gameRules: { sets: 1, games: 6, deuce: true, tiebreakPoint: 7 },
        });
      }

      // --- 4. エントリー作成 ---
      let entryCount = 0;

      if (parsedData.entries.length > 0) {
        // 完全バックアップからエントリーを作成
        // ダブルスはpairIdでペアをグループ化
        const processedPairs = new Set<string>(); // eventCode-pairId

        for (const entry of parsedData.entries) {
          const eventId = eventIdMap[entry.eventCode];
          if (!eventId) continue;
          const eventDef = EVENT_MAP[entry.eventCode];
          if (!eventDef) continue;

          if (eventDef.type === 'Doubles') {
            // ダブルス: pairIdでペアを識別
            const pairKey = `${entry.eventCode}-${entry.pairId}`;
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);

            // 同じpairIdの2エントリーを取得
            const pairEntries = parsedData.entries.filter(
              e => e.eventCode === entry.eventCode && e.pairId === entry.pairId
            );

            const player1 = pairEntries[0];
            const player2 = pairEntries[1];

            if (player1) {
              const p1Id = player1.name.replace(/\s+/g, '');
              const p2Id = player1.partner ? player1.partner.replace(/\s+/g, '') : (player2 ? player2.name.replace(/\s+/g, '') : undefined);

              await db.entries.add({
                eventId,
                entryId: `EN-${entry.eventCode}-${entry.pairId}`,
                playerId: p1Id,
                partnerId: p2Id,
                rankPoint: (player1.points || 0) + (player1.partnerPoints || 0),
                status: 'active',
              });
              entryCount++;
            }
          } else {
            // シングルス
            const playerId = entry.name.replace(/\s+/g, '');
            await db.entries.add({
              eventId,
              entryId: `EN-${entry.eventCode}-${entry.id}`,
              playerId,
              rankPoint: entry.points || 0,
              status: 'active',
            });
            entryCount++;
          }
        }
      } else {
        // draw-share形式: ドロー結果のentriesからエントリーを復元
        for (const [eventCode, result] of Object.entries(parsedData.drawResults)) {
          const eventId = eventIdMap[eventCode];
          if (!eventId) continue;
          const eventDef = EVENT_MAP[eventCode];
          if (!eventDef) continue;

          // ドローのentries配列がある場合はそこから
          const sourceEntries = result.entries && result.entries.length > 0
            ? result.entries
            : result.draw.filter((s: DrawMeetingDrawSlot) => !s.isBye);

          for (let i = 0; i < sourceEntries.length; i++) {
            const s = sourceEntries[i];
            if (!s.name || s.isBye) continue;

            if (eventDef.type === 'Doubles') {
              const names = s.name.split(' / ');
              const p1Id = names[0]?.trim().replace(/\s+/g, '');
              const p2Id = names[1]?.trim().replace(/\s+/g, '');
              if (!p1Id) continue;

              // 重複チェック（同じペアが既に登録されていないか）
              const existingEntries = await db.entries.where('eventId').equals(eventId).toArray();
              const alreadyExists = existingEntries.some(e => e.playerId === p1Id);
              if (alreadyExists) continue;

              await db.entries.add({
                eventId,
                entryId: `EN-${eventCode}-${i}`,
                playerId: p1Id,
                partnerId: p2Id || undefined,
                rankPoint: s.points || 0,
                status: 'active',
              });
              entryCount++;
            } else {
              const playerId = s.name.replace(/\s+/g, '');
              await db.entries.add({
                eventId,
                entryId: `EN-${eventCode}-${i}`,
                playerId,
                rankPoint: s.points || 0,
                status: 'active',
              });
              entryCount++;
            }
          }
        }
      }

      // --- 5. ドロー作成 ---
      let drawCount = 0;

      for (const [eventCode, result] of Object.entries(parsedData.drawResults)) {
        const eventId = eventIdMap[eventCode];
        if (!eventId) continue;
        const eventDef = EVENT_MAP[eventCode];
        if (!eventDef) continue;

        // ドローのスロットを作成
        // name → entryIdのマッピングを構築
        const eventEntries = await db.entries.where('eventId').equals(eventId).toArray();

        const slots = result.draw.map((slot: DrawMeetingDrawSlot) => {
          let entryId: string | null = null;

          if (!slot.isBye && slot.name) {
            if (eventDef.type === 'Doubles') {
              const names = slot.name.split(' / ');
              const p1Id = names[0]?.trim().replace(/\s+/g, '');
              const matched = eventEntries.find(e => e.playerId === p1Id);
              entryId = matched?.entryId || null;
            } else {
              const playerId = slot.name.replace(/\s+/g, '');
              const matched = eventEntries.find(e => e.playerId === playerId);
              entryId = matched?.entryId || null;
            }
          }

          return {
            position: slot.position,
            entryId,
            seed: slot.seed || 0,
            isBye: slot.isBye,
          };
        });

        // drawType を判定: drawSize が2のべき乗でなければリーグ戦
        const ds = result.drawSize;
        const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
        const drawType: 'tournament' | 'roundRobin' = isPowerOf2 ? 'tournament' : 'roundRobin';

        await db.draws.add({
          eventId,
          drawSize: result.drawSize,
          drawType,
          slots,
          updatedAt: now,
        });
        drawCount++;
      }

      // --- 6. 大会を選択状態にする ---
      setCurrentTournamentId(tournamentId);

      setImportResult({
        success: true,
        message: `インポート完了: ${playersToSave.length}名の選手、${Object.keys(eventIdMap).length}種目、${entryCount}エントリー、${drawCount}ドローを取り込みました。`,
      });
      setParsedData(null);
      setSummary(null);
    } catch (err) {
      console.error('インポートエラー:', err);
      setImportResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsImporting(false);
    }
  };

  // --- Excel import (new) ---
  const handleExcelImport = async () => {
    if (!parsedExcel) return;
    setIsImporting(true);
    setImportResult(null);

    try {
      const now = Date.now();
      const tournamentId = `T-${new Date().getFullYear()}-${String(now).slice(-4)}`;
      const tournamentName = editTournamentName.trim() || parsedExcel.fileName.replace(/\.(xlsx?|xls)$/i, '');

      // --- 1. 大会作成 ---
      await db.tournaments.add({
        tournamentId,
        name: tournamentName,
        date: editDate,
        venue: editVenue,
        reserveDate: editReserveDate,
        reserveVenue: parsedExcel.reserveVenue || '',
        createdAt: now,
      });

      // --- 2. 選手マスタ収集 ---
      const playerMap = new Map<string, { name: string; affiliation: string }>();
      let totalEntryCount = 0;
      let totalDrawCount = 0;
      const eventIds: string[] = [];

      for (let ei = 0; ei < parsedExcel.events.length; ei++) {
        const ev = parsedExcel.events[ei];
        const eventId = `E-excel-${ei}-${now}`;
        eventIds.push(eventId);

        // --- 3. 種目作成 ---
        const defaultGames = ev.roundGameRules.length > 0 ? ev.roundGameRules[0].games : 6;
        await db.events.add({
          tournamentId,
          eventId,
          name: ev.eventName,
          type: ev.type,
          gameRules: { sets: 1, games: defaultGames, deuce: true, tiebreakPoint: defaultGames },
          roundGameRules: ev.roundGameRules.length > 0 ? ev.roundGameRules : undefined,
        });

        // --- 4. 選手 & エントリー作成 ---
        const realPlayers = ev.players.filter(p => !p.isBye);

        for (let pi = 0; pi < realPlayers.length; pi++) {
          const p = realPlayers[pi];

          // メイン選手
          const playerId = p.name.replace(/\s+/g, '');
          if (playerId && !playerMap.has(playerId)) {
            playerMap.set(playerId, { name: p.name, affiliation: p.affiliation });
          }

          // ダブルスパートナー
          let partnerId: string | undefined;
          if (ev.type === 'Doubles' && p.partnerName) {
            partnerId = p.partnerName.replace(/\s+/g, '');
            if (partnerId && !playerMap.has(partnerId)) {
              playerMap.set(partnerId, { name: p.partnerName, affiliation: p.partnerAffiliation || '' });
            }
          }

          // エントリー作成
          const entryId = `EN-excel-${ei}-${pi}`;
          await db.entries.add({
            eventId,
            entryId,
            playerId,
            partnerId,
            rankPoint: 0,
            seedNo: p.seed > 0 ? p.seed : undefined,
            status: 'active',
          });
          totalEntryCount++;
        }

        // --- 5. ドロー作成 ---
        if (ev.drawSize > 0) {
          // entryIdマッピングを取得
          const eventEntries = await db.entries.where('eventId').equals(eventId).toArray();

          // ドローサイズ分のスロットを構築
          const slots = [];
          for (let pos = 0; pos < ev.drawSize; pos++) {
            const player = ev.players.find(p => p.position === pos + 1);
            if (!player) {
              // 空スロット（BYE扱い）
              slots.push({
                position: pos + 1,
                entryId: null,
                seed: 0,
                isBye: true,
              });
            } else if (player.isBye) {
              slots.push({
                position: pos + 1,
                entryId: null,
                seed: 0,
                isBye: true,
              });
            } else {
              const pid = player.name.replace(/\s+/g, '');
              const matched = eventEntries.find(e => e.playerId === pid);
              slots.push({
                position: pos + 1,
                entryId: matched?.entryId || null,
                seed: player.seed || 0,
                isBye: false,
              });
            }
          }

          await db.draws.add({
            eventId,
            drawSize: ev.drawSize,
            drawType: ev.isRoundRobin ? 'roundRobin' : 'tournament',
            slots,
            updatedAt: now,
          });
          totalDrawCount++;
        }
      }

      // --- 選手をDB保存 ---
      const playersToSave = Array.from(playerMap.entries()).map(([playerId, p]) => ({
        playerId,
        name: p.name,
        furigana: '',
        affiliation: p.affiliation,
        rankings: {} as Record<string, number>,
        isManual: false,
      }));
      await db.players.bulkPut(playersToSave);

      // --- 6. 大会を選択状態にする ---
      setCurrentTournamentId(tournamentId);

      setImportResult({
        success: true,
        message: `Excelインポート完了: ${playersToSave.length}名の選手、${parsedExcel.events.length}種目、${totalEntryCount}エントリー、${totalDrawCount}ドローを取り込みました。`,
      });
      setParsedExcel(null);
    } catch (err) {
      console.error('Excelインポートエラー:', err);
      setImportResult({ success: false, message: `インポート失敗: ${(err as Error).message}` });
    } finally {
      setIsImporting(false);
    }
  };

  // ウィザードからの自動インポート: parsedExcelが設定されたら自動実行
  useEffect(() => {
    if (autoImportPending && parsedExcel && !isImporting) {
      setAutoImportPending(false);
      handleExcelImport();
    }
  }, [autoImportPending, parsedExcel, isImporting]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setParsedData(null);
    setSummary(null);
    setParsedExcel(null);
    setImportResult(null);
    setSelectedTournament(null);
    setEditTournamentName('');
    setEditDate('');
    setEditVenue('');
    setEditReserveDate('');
  };

  // --- Excel preview helpers ---
  const excelPlayerCount = useMemo(() => {
    if (!parsedExcel) return 0;
    const names = new Set<string>();
    for (const ev of parsedExcel.events) {
      for (const p of ev.players) {
        if (!p.isBye && p.name) names.add(p.name.replace(/\s+/g, ''));
        if (p.partnerName) names.add(p.partnerName.replace(/\s+/g, ''));
      }
    }
    return names.size;
  }, [parsedExcel]);

  const excelDrawCount = useMemo(() => {
    if (!parsedExcel) return 0;
    return parsedExcel.events.filter(ev => ev.drawSize > 0).length;
  }, [parsedExcel]);

  const hasPreview = parsedData && summary;
  const hasExcelPreview = parsedExcel;
  const isMixedImported = useMixedStore(s => s.isImported);
  const showButtons = !hasPreview && !hasExcelPreview && !mixedPending && !teamPending;

  return (
    <div className="space-y-4">
      {/* ミックス大会 確認セクション（インライン表示） */}
      {mixedPending && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <h3 className="font-bold text-sm">ミックス大会情報の確認</h3>
              </div>
              <button onClick={() => setMixedPending(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">大会情報を確認・修正してから確定してください。</p>

            {/* 大会名 */}
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">大会名</label>
              <input
                type="text"
                value={mixedEditName}
                onChange={e => setMixedEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* 日付・会場 横並び */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />開催日</label>
                <input
                  type="text"
                  value={mixedEditDate}
                  onChange={e => setMixedEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="例: 2026年4月1日"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" />会場</label>
                <input
                  type="text"
                  value={mixedEditVenue}
                  onChange={e => setMixedEditVenue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="例: ヤマタスポーツパーク"
                />
              </div>
            </div>

            {/* 読込概要 */}
            <div className="flex gap-3 text-center">
              <div className="flex-1 bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-700">{mixedPending.leagues.length}</div>
                <div className="text-[10px] text-gray-500">リーグ</div>
              </div>
              <div className="flex-1 bg-teal-50 rounded-lg p-2 border border-teal-100">
                <div className="text-lg font-bold text-teal-700">{mixedPending.leagues.reduce((s, l) => s + l.teams.length, 0)}</div>
                <div className="text-[10px] text-gray-500">ペア</div>
              </div>
              <div className="flex-1 bg-cyan-50 rounded-lg p-2 border border-cyan-100">
                <div className="text-lg font-bold text-cyan-700">{mixedPending.matches.length}</div>
                <div className="text-[10px] text-gray-500">試合</div>
              </div>
            </div>

            {/* ルール */}
            {mixedPending.info.rules.length > 0 && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-[10px] font-medium text-amber-600 mb-0.5">ゲームルール</div>
                <div className="text-[11px] text-amber-700">
                  {mixedPending.info.rules.map((r, i) => <div key={i}>{r}</div>)}
                </div>
              </div>
            )}

            {/* ボタン */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setMixedPending(null)}
                className="flex-shrink-0 px-4 py-2.5 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  const info: TournamentInfo = {
                    ...mixedPending!.info,
                    name: mixedEditName,
                    date: mixedEditDate,
                    venue: mixedEditVenue,
                  };
                  const mixedStore = useMixedStore.getState();
                  mixedStore.importData(info, mixedPending!.leagues, mixedPending!.matches);
                  mixedStore.setImportFileName(mixedPending!.fileName);
                  setMixedPending(null);
                  navigate('/entry');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:from-emerald-600 hover:to-teal-700 shadow-md transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                確定してエントリーへ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 団体戦 確認セクション（インライン表示） */}
      {teamPending && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <h3 className="font-bold text-sm">団体戦 大会情報の確認</h3>
              </div>
              <button onClick={() => setTeamPending(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">大会情報を確認・修正してから確定してください。</p>

            {/* 大会名 */}
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">大会名</label>
              <input
                type="text"
                value={teamEditName}
                onChange={e => setTeamEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 日付・会場 横並び */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />開催日</label>
                <input
                  type="text"
                  value={teamEditDate}
                  onChange={e => setTeamEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 令和７年11月23日"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" />会場</label>
                <input
                  type="text"
                  value={teamEditVenue}
                  onChange={e => setTeamEditVenue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: ヤマタスポーツパーク"
                />
              </div>
            </div>

            {/* 読込概要 */}
            <div className="flex gap-3 text-center">
              <div className="flex-1 bg-blue-50 rounded-lg p-2 border border-blue-100">
                <div className="text-lg font-bold text-blue-700">{teamPending.leagues.length}</div>
                <div className="text-[10px] text-gray-500">リーグ</div>
              </div>
              <div className="flex-1 bg-indigo-50 rounded-lg p-2 border border-indigo-100">
                <div className="text-lg font-bold text-indigo-700">{teamPending.leagues.reduce((s, l) => s + l.teams.length, 0)}</div>
                <div className="text-[10px] text-gray-500">チーム</div>
              </div>
              <div className="flex-1 bg-violet-50 rounded-lg p-2 border border-violet-100">
                <div className="text-lg font-bold text-violet-700">{teamPending.matches.length}</div>
                <div className="text-[10px] text-gray-500">対戦</div>
              </div>
            </div>

            {/* リーグ詳細 */}
            <div className="grid grid-cols-5 gap-2">
              {teamPending.leagues.map(l => (
                <div key={l.leagueId} className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                  <div className="text-xs font-bold text-blue-600">{l.leagueId}リーグ</div>
                  <div className="text-[10px] text-gray-500">{l.teams.length}チーム</div>
                </div>
              ))}
            </div>

            {/* ルール */}
            {teamPending.info.rules.length > 0 && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-[10px] font-medium text-amber-600 mb-0.5">ゲームルール</div>
                <div className="text-[11px] text-amber-700">
                  {teamPending.info.rules.map((r, i) => <div key={i}>{r}</div>)}
                </div>
              </div>
            )}

            {/* ボタン */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setTeamPending(null)}
                className="flex-shrink-0 px-4 py-2.5 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  const info: TeamTournamentInfo = {
                    ...teamPending!.info,
                    name: teamEditName,
                    date: teamEditDate,
                    venue: teamEditVenue,
                  };
                  const teamStore = useTeamStore.getState();
                  teamStore.importData(info, teamPending!.leagues, teamPending!.matches);
                  teamStore.setImportFileName(teamPending!.fileName);
                  setTeamPending(null);
                  navigate('/entry');
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-md transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                確定してエントリーへ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel読込ボタン */}
      {showButtons && (
        <div className="space-y-3">
          {isMixedImported ? (
            /* ミックス/団体戦モード: 大会Excel読込のみ */
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <FileSpreadsheet className="w-4.5 h-4.5" />
              大会Excel読込
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <FileSpreadsheet className="w-4.5 h-4.5" />
                大会Excel読込
              </button>
              <button
                onClick={() => scheduleFileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <CalendarClock className="w-4.5 h-4.5" />
                時間割Excel読込
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.xlsx,.xls"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={scheduleFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleScheduleFile(file);
              e.target.value = '';
            }}
          />
          <p className="text-[10px] text-gray-400 text-center">
            {isMixedImported
              ? 'ドローExcel (.xlsx) を読み込みます。'
              : 'ドローExcel (.xlsx) / 時間割Excel (.xlsx) を読み込みます。Google ドライブからの読込は上部の連携セクションをご利用ください。'
            }
          </p>
        </div>
      )}

      {/* JSON プレビュー (既存) */}
      {parsedData && summary && (
        <div className="space-y-3">
          <div className="bg-primary-50 rounded-lg p-3 border border-primary-200">
            <div className="flex items-center gap-2 text-sm font-bold text-primary-600">
              <CheckCircle2 className="w-4 h-4" />
              データ読込成功
              <span className="text-xs font-normal text-gray-500 ml-2">
                形式: {parsedData.format === 'complete-backup' ? '完全バックアップ' : 'ドロー共有'}
              </span>
            </div>
            {parsedData.exportedAt && (
              <p className="text-xs text-gray-500 mt-1">
                エクスポート日時: {new Date(parsedData.exportedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </div>

          {/* 大会選択（完全バックアップで複数大会がある場合） */}
          {parsedData.tournaments.length > 1 && (
            <div className="bg-white rounded-lg border border-border-main p-3">
              <label className="text-xs font-bold text-gray-900 mb-2 block">インポートする大会を選択:</label>
              <div className="space-y-1 max-h-36 overflow-auto">
                {parsedData.tournaments.map(t => (
                  <label key={t.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${
                    selectedTournament === t.id ? 'bg-primary-50' : 'hover:bg-primary-50'
                  }`}>
                    <input
                      type="radio"
                      name="tournament"
                      checked={selectedTournament === t.id}
                      onChange={() => {
                        setSelectedTournament(t.id);
                        setEditTournamentName(cleanTournamentName(t.name || ''));
                        setEditDate(t.date || ''); setSourceDate(t.date || '');
                        setEditVenue(t.venue || ''); setSourceVenue(t.venue || '');
                        setEditReserveDate(t.reserveDate || ''); setSourceReserveDate(t.reserveDate || '');
                        setSourceReserveVenue(t.reserveVenue || '');
                        setVenueMode('normal'); setDateMode('normal');
                      }}
                      className="accent-primary-500"
                    />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-gray-500">{t.date} {t.venue}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 大会名・日程・会場入力 */}
          <div className="bg-white rounded-lg border border-border-main p-3 space-y-2">
            <h4 className="text-xs font-bold text-gray-700">大会情報</h4>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">大会名</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={editTournamentName}
                  onChange={e => setEditTournamentName(e.target.value)}
                  placeholder="大会名を入力"
                  className="flex-1 border border-border-main rounded px-2 py-1 text-sm font-medium focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const raw = parsedData.tournamentName || parsedData.tournaments.find(t => t.id === selectedTournament)?.name || '';
                    setEditTournamentName(cleanTournamentName(raw));
                  }}
                  className="shrink-0 px-2 py-1 text-[10px] font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded hover:bg-primary-100 transition-colors"
                  title="不要な文字を自動除去"
                >
                  <Sparkles className="w-3 h-3 inline mr-0.5" />
                  整理
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">日程</label>
                <select
                  value={dateMode}
                  onChange={e => {
                    const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                    setDateMode(mode);
                    if (mode === 'normal') setEditDate(sourceDate);
                    else if (mode === 'reserve') setEditDate(sourceReserveDate);
                  }}
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 outline-none mb-1"
                >
                  <option value="normal">通常日程{sourceDate ? ` (${sourceDate})` : ''}</option>
                  <option value="reserve">予備日{sourceReserveDate ? ` (${sourceReserveDate})` : ''}</option>
                  <option value="custom">その他</option>
                </select>
                {dateMode === 'custom' && (
                  <input type="text" value={editDate} onChange={e => setEditDate(e.target.value)} placeholder="例: 3/15"
                    className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 outline-none" />
                )}
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">会場</label>
                <select
                  value={venueMode}
                  onChange={e => {
                    const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                    setVenueMode(mode);
                    if (mode === 'normal') setEditVenue(sourceVenue);
                    else if (mode === 'reserve') setEditVenue(sourceReserveVenue);
                  }}
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 outline-none mb-1"
                >
                  <option value="normal">通常会場{sourceVenue ? ` (${sourceVenue})` : ''}</option>
                  <option value="reserve">予備日会場{sourceReserveVenue ? ` (${sourceReserveVenue})` : ''}</option>
                  <option value="custom">その他</option>
                </select>
                {venueMode === 'custom' && (
                  <input type="text" value={editVenue} onChange={e => setEditVenue(e.target.value)} placeholder="例: ヤマタスポーツパーク"
                    className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 outline-none" />
                )}
              </div>
            </div>
          </div>

          {/* サマリー */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Users className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{summary.playerCount}</p>
              <p className="text-[10px] text-gray-500">選手</p>
            </div>
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Trophy className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{summary.eventCodes.length}</p>
              <p className="text-[10px] text-gray-500">種目</p>
            </div>
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Dices className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{Object.keys(summary.drawCounts).length}</p>
              <p className="text-[10px] text-gray-500">ドロー</p>
            </div>
          </div>

          {/* 種目詳細 */}
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            {showDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            種目別詳細
          </button>
          {showDetail && (
            <div className="bg-white rounded-lg border border-border-main overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-primary-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">種目</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">エントリー</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">ドローサイズ</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">確定</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.eventCodes.map(code => {
                    const eventDef = EVENT_MAP[code];
                    const draw = summary.drawCounts[code];
                    const entries = summary.entryCounts[code] || 0;
                    const confirmed = parsedData.confirmedEvents[code];
                    return (
                      <tr key={code} className="border-t border-border-main">
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-gray-900">{eventDef?.name || code}</span>
                          <span className="text-gray-500 ml-1">({eventDef?.type === 'Doubles' ? 'D' : 'S'})</span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {entries > 0 ? `${entries}件` : (draw ? `${draw.entryCount}件` : '-')}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {draw ? draw.drawSize : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {confirmed ? (
                            <span className="text-green-600">
                              <CheckCircle2 className="w-3.5 h-3.5 inline" />
                            </span>
                          ) : draw ? (
                            <span className="text-warning text-[10px]">未確定</span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-border-main rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isImporting ? 'インポート中...' : 'インポート実行'}
            </button>
          </div>
        </div>
      )}

      {/* Excel プレビュー */}
      {parsedExcel && (
        <div className="space-y-4">
          {/* ヘッダーカード */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-lg">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/[0.06]" />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/[0.04]" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <FileSpreadsheet className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Excel読込完了</h3>
                  <p className="text-[10px] text-white/60">ドローExcel形式</p>
                </div>
              </div>
              <p className="text-xs text-white/70 truncate">{parsedExcel.fileName}</p>
              {/* 統計バッジ */}
              <div className="flex gap-2 mt-4">
                {[
                  { icon: Users, value: excelPlayerCount, label: '選手' },
                  { icon: Trophy, value: parsedExcel.events.length, label: '種目' },
                  { icon: Dices, value: excelDrawCount, label: 'ドロー' },
                ].map(({ icon: Icon, value, label }) => (
                  <div key={label} className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center">
                    <Icon className="w-4 h-4 mx-auto mb-1 text-white/80" />
                    <p className="text-xl font-extrabold leading-none">{value}</p>
                    <p className="text-[9px] text-white/60 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 大会情報フォーム */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <h4 className="text-xs font-bold text-gray-600 tracking-wide">大会情報</h4>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">大会名</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editTournamentName}
                    onChange={e => setEditTournamentName(e.target.value)}
                    placeholder="大会名を入力"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium bg-gray-50/50 focus:bg-white focus:border-emerald-400 focus:ring-[3px] focus:ring-emerald-500/10 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const raw = parsedExcel?.fileName.replace(/\.(xlsx?|xls)$/i, '') || '';
                      setEditTournamentName(cleanTournamentName(raw));
                    }}
                    className="shrink-0 px-3 py-2 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
                    title="不要な文字を自動除去"
                  >
                    <Sparkles className="w-3.5 h-3.5 inline mr-0.5 -mt-0.5" />
                    整理
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">
                    <Calendar className="w-3 h-3 inline mr-0.5 -mt-0.5" />日程
                  </label>
                  <select
                    value={dateMode}
                    onChange={e => {
                      const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                      setDateMode(mode);
                      if (mode === 'normal') setEditDate(sourceDate);
                      else if (mode === 'reserve') setEditDate(sourceReserveDate);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all mb-1"
                  >
                    <option value="normal">通常日程{sourceDate ? ` (${sourceDate})` : ''}</option>
                    <option value="reserve">予備日{sourceReserveDate ? ` (${sourceReserveDate})` : ''}</option>
                    <option value="custom">その他</option>
                  </select>
                  {dateMode === 'custom' && (
                    <input type="text" value={editDate} onChange={e => setEditDate(e.target.value)} placeholder="例: 3/15"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all" />
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">
                    <MapPin className="w-3 h-3 inline mr-0.5 -mt-0.5" />会場
                  </label>
                  <select
                    value={venueMode}
                    onChange={e => {
                      const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                      setVenueMode(mode);
                      if (mode === 'normal') setEditVenue(sourceVenue);
                      else if (mode === 'reserve') setEditVenue(sourceReserveVenue);
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all mb-1"
                  >
                    <option value="normal">通常会場{sourceVenue ? ` (${sourceVenue})` : ''}</option>
                    <option value="reserve">予備日会場{sourceReserveVenue ? ` (${sourceReserveVenue})` : ''}</option>
                    <option value="custom">その他</option>
                  </select>
                  {venueMode === 'custom' && (
                    <input type="text" value={editVenue} onChange={e => setEditVenue(e.target.value)} placeholder="例: ヤマタスポーツパーク"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 種目詳細 */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-bold text-gray-600 tracking-wide">種目別詳細</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showDetail ? 'rotate-180' : ''}`} />
            </button>
            {showDetail && (
              <div className="border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-4 py-2 text-left font-semibold text-gray-500">種目</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-500">選手</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-500">ドロー</th>
                      <th className="px-4 py-2 text-center font-semibold text-gray-500">形式</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parsedExcel.events.map((ev, idx) => {
                      const realCount = ev.players.filter(p => !p.isBye).length;
                      return (
                        <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="px-4 py-2">
                            <span className="font-semibold text-gray-800">{ev.eventName}</span>
                            <span className="text-[10px] text-gray-400 ml-1">{ev.type === 'Doubles' ? 'D' : 'S'}</span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-gray-600">{realCount}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-600">
                            {ev.isRoundRobin ? '-' : ev.drawSize}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {ev.isRoundRobin ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">リーグ</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">トーナメント</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-5 py-2.5 text-sm font-semibold text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] shadow-sm transition-all"
            >
              キャンセル
            </button>
            <button
              onClick={handleExcelImport}
              disabled={isImporting}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Upload className="w-4 h-4" />
              {isImporting ? 'インポート中...' : 'インポート実行'}
            </button>
          </div>
        </div>
      )}

      {/* 結果メッセージ */}
      {importResult && !importResult.success && (
        <div className="p-3 rounded-lg text-sm flex items-start gap-2 bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{importResult.message}</span>
        </div>
      )}

      {/* インポート成功 - おしゃれな大会情報表示 */}
      {importResult?.success && (() => {
        const msg = importResult.message;
        const playerMatch = msg.match(/(\d+)名/);
        const eventMatch = msg.match(/(\d+)種目/);
        const drawMatch = msg.match(/(\d+)ドロー/);
        const entryMatch = msg.match(/(\d+)エントリー/);
        const stats = [
          { icon: Users, value: playerMatch?.[1] || '0', label: '選手', delay: '0.3s' },
          { icon: Trophy, value: eventMatch?.[1] || '0', label: '種目', delay: '0.45s' },
          { icon: Dices, value: drawMatch?.[1] || entryMatch?.[1] || '0', label: drawMatch ? 'ドロー' : 'エントリー', delay: '0.6s' },
        ];
        return (
        <div className="relative overflow-hidden rounded-2xl shadow-xl animate-[fadeIn_0.5s_ease-out]">
          {/* グラデーション背景 */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-[#0a2618]" />

          {/* メッシュグラデーション装飾 */}
          <div className="absolute inset-0 opacity-30"
            style={{ background: 'radial-gradient(circle at 20% 20%, rgba(212,225,87,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(61,126,166,0.3) 0%, transparent 50%)' }} />

          {/* パーティクル装飾 */}
          <div className="absolute top-4 right-8 w-2 h-2 bg-accent rounded-full animate-[pulse_2s_ease-in-out_infinite]" />
          <div className="absolute top-12 right-16 w-1.5 h-1.5 bg-white/30 rounded-full animate-[pulse_2.5s_ease-in-out_0.5s_infinite]" />
          <div className="absolute top-8 right-24 w-1 h-1 bg-accent/60 rounded-full animate-[pulse_3s_ease-in-out_1s_infinite]" />
          <div className="absolute bottom-16 left-6 w-1.5 h-1.5 bg-white/20 rounded-full animate-[pulse_2.8s_ease-in-out_0.3s_infinite]" />
          <div className="absolute bottom-20 left-16 w-1 h-1 bg-accent/40 rounded-full animate-[pulse_2.2s_ease-in-out_0.8s_infinite]" />

          {/* 幾何学模様の背景装飾 */}
          <div className="absolute -top-8 -right-8 w-48 h-48 border border-white/[0.07] rounded-full" />
          <div className="absolute -top-4 -right-4 w-36 h-36 border border-white/[0.05] rounded-full" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 border border-white/[0.07] rounded-full" />

          <div className="relative p-5">
            {/* 成功バッジ */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full bg-accent/20 backdrop-blur-sm border border-accent/30 animate-[slideDown_0.4s_ease-out]">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px] font-semibold text-accent tracking-wide">インポート完了</span>
            </div>

            {/* 大会名 */}
            <h3 className="text-xl font-bold text-white mb-1 leading-tight animate-[slideDown_0.5s_ease-out]">
              {editTournamentName || '大会名未設定'}
            </h3>
            <p className="text-[11px] text-white/50 mb-4 animate-[slideDown_0.55s_ease-out]">データを正常に取り込みました</p>

            {/* 大会情報 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5 animate-[slideDown_0.6s_ease-out]">
              {editDate && (
                <div className="flex items-center gap-1.5 text-sm text-white/80">
                  <Calendar className="w-3.5 h-3.5 text-accent/70" />
                  <span>{editDate}</span>
                </div>
              )}
              {editVenue && (
                <div className="flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin className="w-3.5 h-3.5 text-accent/70" />
                  <span>{editVenue}</span>
                </div>
              )}
              {editReserveDate && (
                <div className="flex items-center gap-1.5 text-sm text-white/80">
                  <CalendarClock className="w-3.5 h-3.5 text-accent/70" />
                  <span>予備日 {editReserveDate}</span>
                </div>
              )}
            </div>

            {/* 統計カード */}
            <div className="grid grid-cols-3 gap-2.5">
              {stats.map(({ icon: Icon, value, label, delay }) => (
                <div
                  key={label}
                  className="group relative overflow-hidden rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/[0.1] p-3 text-center hover:bg-white/[0.14] transition-all duration-300 animate-[slideUp_0.5s_ease-out_both]"
                  style={{ animationDelay: delay }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-white/[0.03] to-transparent" />
                  <div className="relative">
                    <div className="flex items-center justify-center w-8 h-8 mx-auto mb-1.5 rounded-lg bg-accent/15">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
                    <p className="text-[10px] text-white/50 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* フッター */}
          <div className="relative border-t border-white/[0.08] px-5 py-2.5 flex items-center justify-between bg-black/15 backdrop-blur-sm">
            <p className="text-[10px] text-white/40 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {importResult.message}
            </p>
            <button
              onClick={reset}
              className="text-[11px] font-medium text-accent/80 hover:text-accent transition-colors flex items-center gap-1"
            >
              新しいインポート
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
        );
      })()}
      {/* ── 時間割読込セクション（ミックス/団体戦モードでは非表示） ── */}
      {!isMixedImported && scheduleItems.length > 0 && (() => {
        // 色分けロジック: 男子=青系, 女子=赤系, 種目ごとに色味を変え, ラウンドで濃淡
        const getScheduleColor = (eventName: string, roundLabel: string) => {
          const isFemale = /女子|レディース|LD|LS|LB/i.test(eventName);
          // 種目ごとにhue微調整
          const eventKey = eventName.replace(/\d+R|QF|SF|F|回戦|準々決勝|準決勝|決勝/g, '').trim();
          let hueShift = 0;
          if (/B級/i.test(eventKey)) hueShift = 20;
          else if (/45|シニア/i.test(eventKey)) hueShift = -15;
          else if (/55/i.test(eventKey)) hueShift = -30;
          else if (/65/i.test(eventKey)) hueShift = -40;
          else if (/35/i.test(eventKey)) hueShift = 10;
          else if (/ダブルス|doubles/i.test(eventKey)) hueShift = 35;
          // ラウンドで明るさ変更（後半ラウンドほど濃い）
          let intensity = 100; // bg opacity
          const rl = roundLabel.toUpperCase();
          if (rl === 'F' || /決勝/.test(roundLabel)) intensity = 200;
          else if (rl === 'SF' || /準決勝/.test(roundLabel)) intensity = 170;
          else if (rl === 'QF' || /準々決勝/.test(roundLabel)) intensity = 140;
          else if (/^[2-9]R|^[2-9]回戦/.test(roundLabel)) intensity = 120;
          if (isFemale) {
            // 赤系
            return {
              bg: intensity >= 170 ? 'bg-rose-200' : intensity >= 140 ? 'bg-rose-100' : intensity >= 120 ? 'bg-pink-100' : 'bg-pink-50',
              text: intensity >= 170 ? 'text-rose-900 font-semibold' : 'text-rose-800',
              border: intensity >= 170 ? 'border-rose-300' : 'border-rose-200',
              hueShift,
            };
          } else {
            // 青系
            return {
              bg: intensity >= 170 ? 'bg-blue-200' : intensity >= 140 ? 'bg-blue-100' : intensity >= 120 ? 'bg-sky-100' : 'bg-sky-50',
              text: intensity >= 170 ? 'text-blue-900 font-semibold' : 'text-blue-800',
              border: intensity >= 170 ? 'border-blue-300' : 'border-blue-200',
              hueShift,
            };
          }
        };
        // グリッド形式で表示: 行=コート, 列=時間
        const courtNames = [...new Set(scheduleItems.map(i => i.courtName))].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
        const timeSlots = [...new Set(scheduleItems.map(i => i.startTime))].sort();
        const gridMap = new Map<string, typeof scheduleItems[0]>();
        for (const item of scheduleItems) {
          gridMap.set(`${item.courtName}|${item.startTime}`, item);
        }
        const renderScheduleGrid = (maxH: string) => (
          <div className={`overflow-auto ${maxH}`}>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-700 text-white">
                  <th className="px-2 py-1.5 text-left font-medium border border-gray-600 whitespace-nowrap">コート</th>
                  {timeSlots.map(t => (
                    <th key={t} className="px-2 py-1.5 text-center font-medium border border-gray-600 whitespace-nowrap">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courtNames.map(cn => (
                  <tr key={cn}>
                    <td className="px-2 py-1.5 font-bold text-gray-700 bg-gray-100 border border-gray-200 whitespace-nowrap text-center">{cn}</td>
                    {timeSlots.map(t => {
                      const item = gridMap.get(`${cn}|${t}`);
                      if (!item) return <td key={t} className="border border-gray-200 bg-gray-50/50" />;
                      const color = getScheduleColor(item.eventName, item.roundLabel);
                      return (
                        <td key={t} className={`border ${color.border} ${color.bg} px-1.5 py-1 text-center whitespace-nowrap`}>
                          <div className={`text-[11px] leading-tight ${color.text}`}>{item.eventName}</div>
                          <div className="text-[10px] text-gray-500 leading-tight">{item.roundLabel}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return (
          <>
            <div className="border border-border-main rounded-lg overflow-hidden">
              <button
                onClick={() => setScheduleOpen(!scheduleOpen)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100/60 transition-colors"
              >
                {scheduleOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                <CalendarClock className="w-4.5 h-4.5 text-primary-500" />
                時間割
                <span className="ml-auto text-xs font-normal text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {scheduleItems.length}試合読込済
                </span>
              </button>
              {scheduleOpen && (
                <div className="p-4 space-y-3 border-t border-border-main">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        時間割読込成功
                      </div>
                      <button
                        onClick={() => setScheduleFullscreen(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                      >
                        <Maximize2 className="w-3 h-3" />
                        全画面
                      </button>
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      {scheduleFileName && <><FileSpreadsheet className="w-3 h-3 inline mr-1" />{scheduleFileName}<br /></>}
                      {scheduleItems.length}試合 / {courtNames.length}コート / {timeSlots.length}時間枠
                    </p>
                  </div>
                  {renderScheduleGrid('max-h-64')}
                  <button
                    onClick={() => {
                      setScheduleItems([]);
                      setScheduleFileName('');
                      useAppStore.getState().setImportedSchedule([]);
                    }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  >
                    時間割をクリア
                  </button>
                </div>
              )}
            </div>
            {/* 全画面モーダル */}
            {scheduleFullscreen && createPortal(
              <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white shrink-0">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" />
                    <span className="text-sm font-bold">時間割</span>
                    <span className="text-xs text-gray-300">{scheduleItems.length}試合 / {courtNames.length}コート</span>
                  </div>
                  <button onClick={() => setScheduleFullscreen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {renderScheduleGrid('')}
                </div>
              </div>,
              document.body
            )}
          </>
        );
      })()}

      {/* 時間割エラー（ミックスモードでは非表示） */}
      {!isMixedImported && scheduleError && (
        <div className="p-3 rounded-lg text-sm flex items-start gap-2 bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{scheduleError}</span>
        </div>
      )}

      {/* GDriveインポートモーダル */}
      {showGDriveModal && parsedExcel && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setShowGDriveModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden m-auto animate-[confirmSlideUp_0.2s_ease-out]">
            {/* ヘッダー */}
            <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4">
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/[0.06]" />
              <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">大会データ読込</h3>
                    <p className="text-[11px] text-white/60 mt-0.5 truncate max-w-[200px]">{parsedExcel.fileName}</p>
                  </div>
                </div>
                <button onClick={() => setShowGDriveModal(false)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              {/* 統計バッジ */}
              <div className="flex gap-2 mt-3 relative">
                {[
                  { icon: Users, value: excelPlayerCount, label: '選手' },
                  { icon: Trophy, value: parsedExcel.events.length, label: '種目' },
                  { icon: Dices, value: excelDrawCount, label: 'ドロー' },
                ].map(({ icon: Icon, value, label }) => (
                  <div key={label} className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg px-2 py-1.5 text-center text-white">
                    <Icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-white/70" />
                    <p className="text-base font-bold leading-none">{value}</p>
                    <p className="text-[9px] text-white/50 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* フォーム */}
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">大会名</label>
                <div className="flex gap-2">
                  <input type="text" value={editTournamentName} onChange={e => setEditTournamentName(e.target.value)}
                    placeholder="大会名を入力"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium bg-gray-50/50 focus:bg-white focus:border-emerald-400 focus:ring-[3px] focus:ring-emerald-500/10 outline-none transition-all" />
                  <button type="button" onClick={() => {
                    const raw = parsedExcel?.fileName.replace(/\.(xlsx?|xls)$/i, '') || '';
                    setEditTournamentName(cleanTournamentName(raw));
                  }} className="shrink-0 px-2.5 py-2 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all" title="不要な文字を自動除去">
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">
                    <Calendar className="w-3 h-3 inline mr-0.5 -mt-0.5" />日程
                  </label>
                  <select value={dateMode} onChange={e => {
                    const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                    setDateMode(mode);
                    if (mode === 'normal') setEditDate(sourceDate);
                    else if (mode === 'reserve') setEditDate(sourceReserveDate);
                  }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all mb-1">
                    <option value="normal">通常日程{sourceDate ? ` (${sourceDate})` : ''}</option>
                    <option value="reserve">予備日{sourceReserveDate ? ` (${sourceReserveDate})` : ''}</option>
                    <option value="custom">その他</option>
                  </select>
                  {dateMode === 'custom' && (
                    <input type="text" value={editDate} onChange={e => setEditDate(e.target.value)} placeholder="例: 3/15"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all" />
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">
                    <MapPin className="w-3 h-3 inline mr-0.5 -mt-0.5" />会場
                  </label>
                  <select value={venueMode} onChange={e => {
                    const mode = e.target.value as 'normal' | 'reserve' | 'custom';
                    setVenueMode(mode);
                    if (mode === 'normal') setEditVenue(sourceVenue);
                    else if (mode === 'reserve') setEditVenue(sourceReserveVenue);
                  }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all mb-1">
                    <option value="normal">通常会場{sourceVenue ? ` (${sourceVenue})` : ''}</option>
                    <option value="reserve">予備日会場{sourceReserveVenue ? ` (${sourceReserveVenue})` : ''}</option>
                    <option value="custom">その他</option>
                  </select>
                  {venueMode === 'custom' && (
                    <input type="text" value={editVenue} onChange={e => setEditVenue(e.target.value)} placeholder="例: ヤマタスポーツパーク"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all" />
                  )}
                </div>
              </div>
            </div>

            {/* アクション */}
            <div className="px-5 pb-4 flex items-center gap-2.5">
              <button onClick={() => { setShowGDriveModal(false); reset(); }}
                className="flex-shrink-0 px-4 py-2.5 text-sm font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all">
                キャンセル
              </button>
              <button onClick={async () => { setShowGDriveModal(false); await handleExcelImport(); }}
                disabled={isImporting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 shadow-sm transition-all">
                <Upload className="w-4 h-4" />
                {isImporting ? 'インポート中...' : 'インポート'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ミックス大会確認はインラインで表示済み */}
    </div>
  );
}
