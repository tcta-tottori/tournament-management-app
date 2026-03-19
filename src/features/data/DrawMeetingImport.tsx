import { useState, useCallback, useRef } from 'react';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Upload, CheckCircle2, AlertCircle, FileJson, Users, Trophy, Dices, ChevronDown, ChevronRight, FileSpreadsheet, Sparkles, Calendar, MapPin, CalendarClock, Download, RefreshCw } from 'lucide-react';
import { parseDrawExcel } from './drawExcelParser';
import type { ParsedDrawFile } from './drawExcelParser';
import {
  getSavedToken as gdriveGetSavedToken,
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
} from '../backup/googleDriveApi';

/** Google Drive ブランドアイコン */
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

/** Google Drive からドロー会議システムの最新バックアップを取得 */
async function fetchDrawBackupFromGDrive(token: string): Promise<{ data: any; fileName: string }> {
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const hdrs = { Authorization: `Bearer ${token}` };

  // 「鳥取テニス協会バックアップ」フォルダを検索
  const rootQ = `name='鳥取テニス協会バックアップ' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const rootRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: rootQ, fields: 'files(id)', pageSize: '1' })}`, { headers: hdrs });
  if (!rootRes.ok) throw new Error(`Google Drive API エラー (${rootRes.status})`);
  const rootData = await rootRes.json();
  const rootId = rootData.files?.[0]?.id;
  if (!rootId) throw new Error('Google Drive に「鳥取テニス協会バックアップ」フォルダが見つかりません');

  // 「ドロー会議システム」サブフォルダを検索
  const subQ = `name='ドロー会議システム' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`;
  const subRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: subQ, fields: 'files(id)', pageSize: '1' })}`, { headers: hdrs });
  if (!subRes.ok) throw new Error(`Google Drive API エラー (${subRes.status})`);
  const subData = await subRes.json();
  const subId = subData.files?.[0]?.id;
  if (!subId) throw new Error('Google Drive に「ドロー会議システム」フォルダが見つかりません');

  // フォルダ内のJSONバックアップを最新順で取得
  const filesQ = `'${subId}' in parents and trashed=false and mimeType='application/json'`;
  const filesRes = await fetch(`${DRIVE_API}/files?${new URLSearchParams({ q: filesQ, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '1' })}`, { headers: hdrs });
  if (!filesRes.ok) throw new Error(`Google Drive API エラー (${filesRes.status})`);
  const filesData = await filesRes.json();
  const latest = filesData.files?.[0];
  if (!latest) throw new Error('Google Drive にドロー会議のバックアップファイルがありません');

  // ダウンロード
  const dlRes = await fetch(`${DRIVE_API}/files/${latest.id}?alt=media`, { headers: hdrs });
  if (!dlRes.ok) throw new Error(`ダウンロード失敗 (${dlRes.status})`);
  const data = await dlRes.json();
  return { data, fileName: latest.name };
}

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

export default function DataImport() {
  const setCurrentTournamentId = useAppStore(state => state.setCurrentTournamentId);
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
  const [isLoadingGDrive, setIsLoadingGDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive 接続状態
  const gdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();

  // --- Google Drive からドロー会議データを読み込む ---
  const handleLoadFromGDrive = useCallback(async () => {
    const token = gdriveGetSavedToken();
    if (!token) {
      setImportResult({ success: false, message: 'Google Drive に接続されていません。バックアップ画面で接続してください。' });
      return;
    }
    setIsLoadingGDrive(true);
    setImportResult(null);
    try {
      const { data: json, fileName } = await fetchDrawBackupFromGDrive(token);
      const data = parseImportFile(json);
      if (!data) {
        setImportResult({ success: false, message: 'Google Drive のバックアップはドロー会議システムのデータ形式ではありません。' });
        return;
      }
      setParsedData(data);
      setParsedExcel(null);
      const sum = buildSummary(data);
      setSummary(sum);
      // 大会名をプリセット
      const rawName = data.tournamentName || data.tournaments[0]?.name || fileName.replace(/\.json$/i, '');
      setEditTournamentName(cleanTournamentName(rawName));
      setEditDate(sum.tournamentDate);
      setEditVenue(sum.tournamentVenue);
      if (data.tournaments.length > 0) {
        setEditReserveDate(data.tournaments[0].reserveDate || '');
      }
      if (data.tournaments.length === 1) setSelectedTournament(data.tournaments[0].id);
    } catch (err) {
      setImportResult({ success: false, message: `Google Drive 読込失敗: ${(err as Error).message}` });
    } finally {
      setIsLoadingGDrive(false);
    }
  }, []);

  // --- JSON file handler (existing) ---
  const handleJsonFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const data = parseImportFile(json);
        if (!data) {
          setImportResult({ success: false, message: 'ドロー会議システムのデータ形式ではありません。完全バックアップJSON または ドロー共有JSONを選択してください。' });
          return;
        }
        setParsedData(data);
        setParsedExcel(null);
        const sum = buildSummary(data);
        setSummary(sum);
        setImportResult(null);
        // 大会名をプリセット（自動クリーンアップ）
        const rawName = data.tournamentName || data.tournaments[0]?.name || '';
        setEditTournamentName(cleanTournamentName(rawName));
        // 日程・会場をプリセット
        setEditDate(sum.tournamentDate);
        setEditVenue(sum.tournamentVenue);
        if (data.tournaments.length > 0) {
          setEditReserveDate(data.tournaments[0].reserveDate || '');
        }
        // 大会が1つだけならプリセレクト
        if (data.tournaments.length === 1) setSelectedTournament(data.tournaments[0].id);
      } catch (err) {
        setImportResult({ success: false, message: `JSONの解析に失敗しました: ${(err as Error).message}` });
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  // --- Excel file handler (new) ---
  const handleExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const result = parseDrawExcel(arrayBuffer, file.name);
        if (!result.events || result.events.length === 0) {
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
        // 日程・会場・予備日をプリセット
        if (result.date) setEditDate(result.date);
        if (result.venue) setEditVenue(result.venue);
        if (result.reserveDate) setEditReserveDate(result.reserveDate);
      } catch (err) {
        setImportResult({ success: false, message: `Excelファイルの解析に失敗しました: ${(err as Error).message}` });
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

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

        await db.draws.add({
          eventId,
          drawSize: result.drawSize,
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
        await db.events.add({
          tournamentId,
          eventId,
          name: ev.eventName,
          type: ev.type,
          gameRules: { sets: 1, games: 6, deuce: true, tiebreakPoint: 7 },
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
  const excelPlayerCount = parsedExcel
    ? (() => {
        const names = new Set<string>();
        for (const ev of parsedExcel.events) {
          for (const p of ev.players) {
            if (!p.isBye && p.name) names.add(p.name.replace(/\s+/g, ''));
            if (p.partnerName) names.add(p.partnerName.replace(/\s+/g, ''));
          }
        }
        return names.size;
      })()
    : 0;

  const excelDrawCount = parsedExcel
    ? parsedExcel.events.filter(ev => ev.drawSize > 0).length
    : 0;

  const hasPreview = parsedData && summary;
  const hasExcelPreview = parsedExcel;
  const showDropZone = !hasPreview && !hasExcelPreview;

  return (
    <div className="space-y-4">
      {/* ファイルアップロード */}
      {showDropZone && (
        <div className="space-y-3">
          {/* Google Drive から読込 */}
          <button
            onClick={handleLoadFromGDrive}
            disabled={!gdriveConnected || isLoadingGDrive}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 text-sm font-medium text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isLoadingGDrive ? (
              <RefreshCw className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <GoogleDriveIcon className="w-4.5 h-4.5" />
            )}
            {isLoadingGDrive ? 'Google Drive から読込中...' : 'Google Drive から最新データを読込'}
          </button>
          {!gdriveConnected && (
            <p className="text-[10px] text-gray-400 text-center -mt-1">※ バックアップ画面でGoogle Driveに接続すると利用できます</p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="flex-1 border-t border-border-main" />
            <span>または</span>
            <div className="flex-1 border-t border-border-main" />
          </div>

          {/* ファイルドロップゾーン */}
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border-main rounded-lg p-6 text-center bg-primary-50 hover:bg-primary-50 hover:border-primary-500 transition-colors cursor-pointer"
          >
            <FileJson className="w-10 h-10 text-primary-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium text-gray-900">ドロー会議JSON / ドローExcelファイルを読込</p>
            <p className="text-xs text-gray-500 mt-1">完全バックアップJSON / ドロー共有JSON / ドローExcel (.xlsx) に対応</p>
            <p className="text-xs text-gray-500 mt-0.5">クリックまたはドラッグ＆ドロップ</p>
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
          </div>
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
                        setEditDate(t.date || '');
                        setEditVenue(t.venue || '');
                        setEditReserveDate(t.reserveDate || '');
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
                <input
                  type="text"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  placeholder="例: 3/15"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">会場</label>
                <input
                  type="text"
                  value={editVenue}
                  onChange={e => setEditVenue(e.target.value)}
                  placeholder="例: コカ・コーラウエストパーク"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">予備日</label>
                <input
                  type="text"
                  value={editReserveDate}
                  onChange={e => setEditReserveDate(e.target.value)}
                  placeholder="例: 3/22"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
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

      {/* Excel プレビュー (新規) */}
      {parsedExcel && (
        <div className="space-y-3">
          <div className="bg-primary-50 rounded-lg p-3 border border-primary-200">
            <div className="flex items-center gap-2 text-sm font-bold text-primary-600">
              <FileSpreadsheet className="w-4 h-4" />
              Excel読込成功
              <span className="text-xs font-normal text-gray-500 ml-2">
                形式: ドローExcel
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ファイル: {parsedExcel.fileName}
            </p>
          </div>

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
                    const raw = parsedExcel?.fileName.replace(/\.(xlsx?|xls)$/i, '') || '';
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
                <input
                  type="text"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  placeholder="例: 3/15"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">会場</label>
                <input
                  type="text"
                  value={editVenue}
                  onChange={e => setEditVenue(e.target.value)}
                  placeholder="例: コカ・コーラウエストパーク"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">予備日</label>
                <input
                  type="text"
                  value={editReserveDate}
                  onChange={e => setEditReserveDate(e.target.value)}
                  placeholder="例: 3/22"
                  className="w-full border border-border-main rounded px-2 py-1 text-sm focus:border-primary-500 focus:ring-[2px] focus:ring-primary-500/15 outline-none"
                />
              </div>
            </div>
          </div>

          {/* サマリー */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Users className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{excelPlayerCount}</p>
              <p className="text-[10px] text-gray-500">選手</p>
            </div>
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Trophy className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{parsedExcel.events.length}</p>
              <p className="text-[10px] text-gray-500">種目</p>
            </div>
            <div className="bg-white rounded-lg border border-border-main p-3 text-center">
              <Dices className="w-5 h-5 text-primary-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900">{excelDrawCount}</p>
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
                    <th className="px-3 py-2 text-right font-medium text-gray-500">選手数</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">ドローサイズ</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">形式</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedExcel.events.map((ev, idx) => {
                    const realCount = ev.players.filter(p => !p.isBye).length;
                    return (
                      <tr key={idx} className="border-t border-border-main">
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-gray-900">{ev.eventName}</span>
                          <span className="text-gray-500 ml-1">({ev.type === 'Doubles' ? 'D' : 'S'})</span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {realCount}名
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {ev.isRoundRobin ? '-' : ev.drawSize}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {ev.isRoundRobin ? (
                            <span className="text-blue-600 text-[10px] font-medium">リーグ</span>
                          ) : (
                            <span className="text-green-600 text-[10px] font-medium">トーナメント</span>
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
              onClick={handleExcelImport}
              disabled={isImporting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      {importResult?.success && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-lg">
          {/* 背景装飾 */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative p-5">
            {/* ヘッダー */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full backdrop-blur-sm">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold">インポート完了</p>
                <p className="text-[10px] text-white/70">データを正常に取り込みました</p>
              </div>
            </div>

            {/* 大会名 */}
            <h3 className="text-lg font-bold mb-3 leading-tight">
              {editTournamentName || '大会名未設定'}
            </h3>

            {/* 大会情報 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-sm">
              {editDate && (
                <div className="flex items-center gap-1.5 text-white/90">
                  <Calendar className="w-3.5 h-3.5 text-white/60" />
                  <span>{editDate}</span>
                </div>
              )}
              {editVenue && (
                <div className="flex items-center gap-1.5 text-white/90">
                  <MapPin className="w-3.5 h-3.5 text-white/60" />
                  <span>{editVenue}</span>
                </div>
              )}
              {editReserveDate && (
                <div className="flex items-center gap-1.5 text-white/90">
                  <CalendarClock className="w-3.5 h-3.5 text-white/60" />
                  <span>予備日 {editReserveDate}</span>
                </div>
              )}
            </div>

            {/* 統計カード */}
            <div className="grid grid-cols-3 gap-2">
              {(() => {
                // インポート結果メッセージから数値を抽出
                const msg = importResult.message;
                const playerMatch = msg.match(/(\d+)名/);
                const eventMatch = msg.match(/(\d+)種目/);
                const drawMatch = msg.match(/(\d+)ドロー/);
                const entryMatch = msg.match(/(\d+)エントリー/);
                return (
                  <>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                      <Users className="w-5 h-5 mx-auto mb-1 text-white/80" />
                      <p className="text-xl font-bold">{playerMatch?.[1] || '0'}</p>
                      <p className="text-[10px] text-white/60">選手</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                      <Trophy className="w-5 h-5 mx-auto mb-1 text-white/80" />
                      <p className="text-xl font-bold">{eventMatch?.[1] || '0'}</p>
                      <p className="text-[10px] text-white/60">種目</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
                      <Dices className="w-5 h-5 mx-auto mb-1 text-white/80" />
                      <p className="text-xl font-bold">{drawMatch?.[1] || entryMatch?.[1] || '0'}</p>
                      <p className="text-[10px] text-white/60">{drawMatch ? 'ドロー' : 'エントリー'}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* フッター */}
          <div className="bg-black/10 px-5 py-2.5 flex items-center justify-between">
            <p className="text-[10px] text-white/50">
              <Download className="w-3 h-3 inline mr-1" />
              {importResult.message}
            </p>
            <button
              onClick={reset}
              className="text-[10px] font-medium text-white/70 hover:text-white transition-colors"
            >
              新しいインポート →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
