import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { ClipboardList, ListOrdered, Printer, Trophy, Edit3, Check, X, ChevronDown, ChevronUp, Volume2, Play, Square, Mic, ChevronRight, Megaphone, Settings2, Gauge, BookOpen, Plus, Trash2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Match, Court, Event, RoundGameRule } from '../../db/database';
import type { MatchCall, CallLogEntry, VoiceSettings } from '../broadcast/types';
import { buildCallText } from '../broadcast/callTextBuilder';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import { useBulkCallStore } from '../../stores/bulkCallStore';
import type { BulkCallItem } from '../../stores/bulkCallStore';

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

function shortEventName(name: string): string {
  return name.replace(/シングルス/g, '').replace(/ダブルス/g, '');
}

/** 種目名から時間割Excelの色分けに対応する背景色・文字色を返す */
function getEventColor(eventName: string): { bg: string; text: string; border: string } {
  const n = eventName.replace(/シングルス|ダブルス|一般|級/g, '').trim();
  if (/女子\s*45/i.test(n)) return { bg: 'bg-[#1E4E79]/15', text: 'text-[#1E4E79]', border: 'border-[#1E4E79]/30' };
  if (/女子\s*B/i.test(n)) return { bg: 'bg-[#7DBEFF]/20', text: 'text-[#1a4f8b]', border: 'border-[#7DBEFF]/40' };
  if (/女子\s*A/i.test(n)) return { bg: 'bg-[#9BFFFF]/25', text: 'text-[#0a6b6b]', border: 'border-[#9BFFFF]/50' };
  if (/男子\s*65/i.test(n)) return { bg: 'bg-[#94F592]/25', text: 'text-[#1a6b19]', border: 'border-[#94F592]/50' };
  if (/男子\s*55/i.test(n)) return { bg: 'bg-[#C5E0B3]/30', text: 'text-[#3d6b2e]', border: 'border-[#C5E0B3]/50' };
  if (/男子\s*45/i.test(n)) return { bg: 'bg-[#FFFF99]/30', text: 'text-[#7a7a00]', border: 'border-[#FFFF99]/50' };
  if (/男子\s*C/i.test(n)) return { bg: 'bg-[#FFCC99]/30', text: 'text-[#8b5e2b]', border: 'border-[#FFCC99]/50' };
  if (/男子\s*B/i.test(n)) return { bg: 'bg-[#FFCCFF]/30', text: 'text-[#8b3a8b]', border: 'border-[#FFCCFF]/50' };
  if (/男子\s*A/i.test(n)) return { bg: 'bg-[#EE8184]/20', text: 'text-[#a83235]', border: 'border-[#EE8184]/40' };
  return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
}

function stripRoundPrefix(text: string): string {
  return text
    .replace(/^[\d～〜\-~]+回戦[はで\s　]*|^準々?決勝(以降)?[はで\s　]*|^決勝[はで\s　]*|^全回戦[はで\s　]*/g, '')
    .trim();
}

function shortRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'F';
  if (round === totalRounds - 1) return 'SF';
  if (round === totalRounds - 2) return 'QF';
  return `${round}R`;
}

function getGameCountForRound(evt: { gameRules?: { games?: number }; roundGameRules?: { roundLabel: string; games: number; matchFormat?: string }[] } | undefined, round: number, totalRounds: number): { count: number; format?: string } {
  if (!evt) return { count: 6 };
  const rules = evt.roundGameRules;
  if (!rules || rules.length === 0) return { count: evt.gameRules?.games ?? 6 };
  if (rules.length === 1) return { count: rules[0].games, format: rules[0].matchFormat };
  const rName = getRoundName(round, totalRounds);
  for (const rule of rules) {
    const label = rule.roundLabel;
    if (label === '全回戦') continue;
    const rm = label.match(/(\d+)～(\d+)回戦/);
    if (rm && round >= parseInt(rm[1]) && round <= parseInt(rm[2])) return { count: rule.games, format: rule.matchFormat };
    if (label.includes('以降')) {
      const cl = label.replace('以降', '');
      if (cl.includes('準々決勝') && round >= totalRounds - 2) return { count: rule.games, format: rule.matchFormat };
      if (cl.includes('準決勝') && round >= totalRounds - 1) return { count: rule.games, format: rule.matchFormat };
      if (cl.includes('決勝') && !cl.includes('準') && round >= totalRounds) return { count: rule.games, format: rule.matchFormat };
      const rn = cl.match(/(\d+)回戦/);
      if (rn && round >= parseInt(rn[1])) return { count: rule.games, format: rule.matchFormat };
      continue;
    }
    if (rName === label || label.includes(rName)) return { count: rule.games, format: rule.matchFormat };
  }
  return { count: rules[0].games, format: rules[0].matchFormat };
}

type DrawSlot = { position: number; entryId: string | null; seed: number; isBye: boolean };


export default function MatchManager() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const importedSchedule = useAppStore(state => state.importedSchedule);
  const setImportedSchedule = useAppStore(state => state.setImportedSchedule);
  const scheduleFileName = useAppStore(state => state.scheduleFileName);
  const setScheduleFileName = useAppStore(state => state.setScheduleFileName);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'event' | 'global'>('global'); // 種目別 or 対戦順

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // 全種目の試合データを一括取得
  const allMatchesByEvent = useLiveQuery(
    async () => {
      if (!currentTournamentId) return new Map<string, Match[]>();
      const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const map = new Map<string, Match[]>();
      for (const evt of allEvents) {
        const eventMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
        if (eventMatches.length > 0) {
          map.set(evt.eventId, eventMatches.sort((a, b) => a.round - b.round || a.matchOrder - b.matchOrder));
        }
      }
      return map;
    },
    [currentTournamentId]
  ) || new Map<string, Match[]>();

  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const allEntries = useLiveQuery(
    async () => {
      if (!currentTournamentId) return [];
      const allEvts = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const entryArr: any[] = [];
      for (const evt of allEvts) {
        const evtEntries = await db.entries.where('eventId').equals(evt.eventId).toArray();
        entryArr.push(...evtEntries);
      }
      return entryArr;
    },
    [currentTournamentId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  const drawData = useLiveQuery(
    () => selectedEventId ? db.draws.where('eventId').equals(selectedEventId).first() : undefined,
    [selectedEventId]
  );

  const allDraws = useLiveQuery(
    async () => {
      if (!currentTournamentId) return new Map<string, any>();
      const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const map = new Map<string, any>();
      for (const evt of allEvents) {
        const draw = await db.draws.where('eventId').equals(evt.eventId).first();
        if (draw) map.set(evt.eventId, draw);
      }
      return map;
    },
    [currentTournamentId]
  ) || new Map<string, any>();

  const tournament = useLiveQuery(
    () => currentTournamentId ? db.tournaments.where('tournamentId').equals(currentTournamentId).first() : undefined,
    [currentTournamentId]
  );

  const currentEvent = useMemo(() => events.find(e => e.eventId === selectedEventId), [events, selectedEventId]);

  const totalRounds = useMemo(() => {
    if (!drawData) return 1;
    return Math.log2(drawData.drawSize);
  }, [drawData]);

  // 全種目のうち試合データがある種目数
  const eventsWithMatches = useMemo(() => {
    return events.filter(e => (allMatchesByEvent.get(e.eventId)?.length || 0) > 0);
  }, [events, allMatchesByEvent]);

  // --- 試合順Excelインポート ---
  const matchOrderInputRef = useRef<HTMLInputElement>(null);
  /** セルテキストを正規化（全角→半角、全角スペース→半角） */
  const normalizeLabel = useCallback((text: string): string => {
    return text
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[\u3000]+/g, ' ')
      .trim();
  }, []);

  const handleImportMatchOrder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const roundPattern = /^(.+?)\s*(\d+R|QF|SF|F)\s*$/i;

      const parseLabel = (raw: string): { eventName: string; roundLabel: string } => {
        const norm = normalizeLabel(raw);
        const rm = norm.match(roundPattern);
        if (rm) return { eventName: rm[1].trim(), roundLabel: rm[2].toUpperCase() };
        return { eventName: norm, roundLabel: '' };
      };

      let flatList: { eventName: string; roundLabel: string }[] = [];

      // 全シートを走査し「パターン2」のB列フラットリストを探す（最後のシートから）
      for (let si = wb.SheetNames.length - 1; si >= 0; si--) {
        const ws = wb.Sheets[wb.SheetNames[si]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // 「パターン2」行を探し、「コートNO.」行の次からB列を読む
        let dataStart = -1;
        for (let i = 0; i < rows.length; i++) {
          const cellA = normalizeLabel(String(rows[i]?.[0] ?? ''));
          if (/パターン\s*2/i.test(cellA)) {
            for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
              const a = normalizeLabel(String(rows[j]?.[0] ?? ''));
              if (/コート/i.test(a)) {
                dataStart = j + 1;
                break;
              }
            }
            if (dataStart === -1) dataStart = i + 2;
            break;
          }
        }

        if (dataStart >= 0) {
          for (let i = dataStart; i < rows.length; i++) {
            const cellB = String(rows[i]?.[1] ?? '').trim();
            if (!cellB) continue;
            flatList.push(parseLabel(cellB));
          }
          if (flatList.length > 10) break;
          flatList = [];
        }
      }

      // フラットリストが見つからない場合、旧ロジック(2列形式)にフォールバック
      if (flatList.length === 0) {
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        let startRow = 0;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          const firstCell = String(rows[i][0] || '').toLowerCase().trim();
          if (firstCell === 'no' || firstCell === 'no.' || firstCell === '#') {
            startRow = i + 1;
            break;
          }
        }
        if (startRow === 0 && rows.length > 1) {
          startRow = /^\d+$/.test(String(rows[0][0]).trim()) ? 0 : 1;
        }
        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          let label = '';
          if (row.length >= 2 && String(row[1]).trim()) label = String(row[1]).trim();
          else if (String(row[0]).trim()) label = String(row[0]).trim();
          if (!label) continue;
          flatList.push(parseLabel(label));
        }
      }

      if (flatList.length === 0) {
        alert('有効なデータが見つかりませんでした。');
        return;
      }

      // フラットリストをimportedSchedule形式に変換（1行=1試合分）
      const items = flatList.map((item, i) => ({
        eventName: item.eventName,
        roundLabel: item.roundLabel,
        matchOrder: i + 1,
        courtName: '',
        startTime: '',
      }));

      setImportedSchedule(items);
      setScheduleFileName(file.name);
      alert(`試合順を取り込みました: ${items.length}項目\n${file.name}`);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [setImportedSchedule, setScheduleFileName, normalizeLabel]);

  // イベント名の略称マッチング（正規化して比較）
  const normalizeEventName = useCallback((name: string): string => {
    return name
      .replace(/シングルス|ダブルス|一般|歳以上|級/g, '')
      .replace(/[\s\u3000]+/g, '')
      .trim();
  }, []);

  const matchEventName = useCallback((fullName: string, abbrev: string): boolean => {
    if (fullName === abbrev) return true;
    const normFull = normalizeEventName(fullName);
    const normAbbr = normalizeEventName(abbrev);
    if (normFull === normAbbr) return true;
    if (normFull.includes(normAbbr) || normAbbr.includes(normFull)) return true;
    return false;
  }, [normalizeEventName]);

  // ラウンドラベル照合
  const matchRoundLabel = useCallback((rLabel: string, round: number, evTotalRounds: number): boolean => {
    if (!rLabel) return false;
    const upper = rLabel.toUpperCase().trim();
    if (upper === `${round}R`) return true;
    const rName = getRoundName(round, evTotalRounds);
    if (rLabel === rName) return true;
    if (upper === 'QF' && rName === '準々決勝') return true;
    if (upper === 'SF' && rName === '準決勝') return true;
    if (upper === 'F' && rName === '決勝') return true;
    const sLabel = shortRoundName(round, evTotalRounds);
    if (upper === sLabel.toUpperCase()) return true;
    return false;
  }, []);

  // リーグ戦判定
  const isLeagueEvent = useCallback((eventId: string): boolean => {
    const evDraw = allDraws.get(eventId);
    if (!evDraw) return false;
    if (evDraw.drawType === 'roundRobin') return true;
    const ds = evDraw.drawSize || 0;
    return ds > 0 && (ds & (ds - 1)) !== 0;
  }, [allDraws]);

  // 全試合を時間割のフラットリスト順でソート（対戦順表示用）
  // importedScheduleの各アイテムを1つずつDB試合にマッピングし、時間割と同じ並びにする
  const globalSortedMatches = useMemo(() => {
    const arr: (Match & { eventName: string })[] = [];
    for (const [eventId, matches] of allMatchesByEvent) {
      const evt = events.find(e => e.eventId === eventId);
      const name = evt?.name || '';
      for (const m of matches) {
        if (m.status === 'walkover') continue;
        arr.push({ ...m, eventName: name });
      }
    }

    if (importedSchedule.length === 0) {
      return arr.sort((a, b) => (a.matchOrder || 9999) - (b.matchOrder || 9999));
    }

    // 種目+ラウンド別にDB試合をプール化（ポジション順にソート）
    type Pool = { matches: (Match & { eventName: string })[]; consumed: number };
    const pools = new Map<string, Pool>();
    for (const m of arr) {
      const isLg = isLeagueEvent(m.eventId);
      const key = isLg ? `${m.eventId}|league` : `${m.eventId}|R${m.round}`;
      if (!pools.has(key)) pools.set(key, { matches: [], consumed: 0 });
      pools.get(key)!.matches.push(m);
    }
    for (const [key, pool] of pools) {
      const isLg = key.endsWith('|league');
      pool.matches.sort((a, b) => isLg ? (a.matchOrder || 0) - (b.matchOrder || 0) : (a.position || 0) - (b.position || 0));
    }

    // importedScheduleの各アイテムを1つずつDB試合にマッピング
    const orderMap = new Map<string, number>();
    for (let i = 0; i < importedSchedule.length; i++) {
      const item = importedSchedule[i];

      for (const [key, pool] of pools) {
        if (pool.consumed >= pool.matches.length) continue;
        const nextMatch = pool.matches[pool.consumed];
        const evDraw = allDraws.get(nextMatch.eventId);
        const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : 1;
        const isLg = key.endsWith('|league');

        if (!matchEventName(nextMatch.eventName, item.eventName)) continue;
        if (item.roundLabel) {
          if (isLg) continue;
          if (!matchRoundLabel(item.roundLabel, nextMatch.round, evTotalRounds)) continue;
        } else {
          if (!isLg) continue;
        }

        orderMap.set(nextMatch.matchId, i);
        pool.consumed++;
        break;
      }
    }

    return arr.sort((a, b) => {
      const oa = orderMap.get(a.matchId) ?? 9999;
      const ob = orderMap.get(b.matchId) ?? 9999;
      if (oa !== ob) return oa - ob;
      return (a.matchOrder || 0) - (b.matchOrder || 0);
    });
  }, [allMatchesByEvent, events, importedSchedule, allDraws, isLeagueEvent, matchEventName, matchRoundLabel]);


  const courts = useLiveQuery(() => db.courts.toArray()) || [];

  // 控え表示ロジック: 使用可能コートを埋めてから控え1-5、以降は控え
  const standbyInfo = useMemo(() => {
    const availableCourts = courts.filter(c => c.isAvailable);
    const totalCourts = availableCourts.length;

    // 現在コートに入っている試合のコートIDセット
    const playingCourtIds = new Set<string>();
    for (const m of globalSortedMatches) {
      if (m.status === 'playing' && m.courtId) playingCourtIds.add(m.courtId);
    }
    const onCourtCount = playingCourtIds.size;
    const emptyCourtCount = Math.max(0, totalCourts - onCourtCount);

    // 待機中（対戦相手が決まっている）試合を対戦順で取得
    const waitingMatches: (Match & { eventName: string })[] = [];
    for (const m of globalSortedMatches) {
      if (m.status !== 'waiting' && m.status !== 'ready') continue;
      if (!m.player1Name || !m.player2Name) continue;
      if (m.player1Name === 'BYE' || m.player2Name === 'BYE') continue;
      waitingMatches.push(m);
    }

    const standbyMap = new Map<string, { label: string; type: 'court' | 'standby' }>();
    let standbyNum = 1;
    let courtAssigned = 0;

    for (const m of waitingMatches) {
      if (courtAssigned < emptyCourtCount) {
        standbyMap.set(m.matchId, { label: '次コート', type: 'court' });
        courtAssigned++;
      } else if (standbyNum <= 5) {
        standbyMap.set(m.matchId, { label: `控え${standbyNum}`, type: 'standby' });
        standbyNum++;
      } else {
        standbyMap.set(m.matchId, { label: '控え', type: 'standby' });
      }
    }

    return standbyMap;
  }, [globalSortedMatches, courts]);

  // --- 音声コール ---
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    rate: 0.95,
    pitch: 1.0,
    volume: 1.0,
    repeatCount: 1,
  });
  const [callTargetMatchId, setCallTargetMatchId] = useState<string | null>(null);
  const [callCourtNumber, setCallCourtNumber] = useState('');
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [speakingMatchId, setSpeakingMatchId] = useState<string | null>(null);

  const { isSpeaking, voiceName, speak, stop, testVoice, selectedVoiceKey, setSelectedVoiceKey, availableVoices } = useSpeechSynthesis();

  // 所属ふりがなマップ
  const affiliationFuriganaMap = useLiveQuery(
    async () => {
      const entries = await db.affiliationFurigana.toArray();
      const map: Record<string, string> = {};
      for (const entry of entries) {
        map[entry.name] = entry.furigana;
      }
      return map;
    },
    []
  ) || {};

  // Match → MatchCall 変換
  const buildMatchCall = useCallback((m: Match, courtNum: string, overrideEvent?: Event, overrideTotalRounds?: number): MatchCall | null => {
    if (!m.player1Name || !m.player2Name) return null;

    const useEvent = overrideEvent || currentEvent;
    const useTotalRounds = overrideTotalRounds ?? totalRounds;

    const getPos = (entryId: string | null, eventId?: string) => {
      if (!entryId) return 0;
      // 該当種目のdrawを使用（選択種目以外の試合にも対応）
      const draw = eventId ? allDraws.get(eventId) : drawData;
      if (!draw?.slots) return 0;
      const slot = draw.slots.find((s: DrawSlot) => s.entryId === entryId);
      return slot?.position ?? 0;
    };

    const resolveFurigana = (entryId: string | null, fallbackName: string, fallbackAff: string) => {
      if (!entryId) return { name: fallbackName, aff: affiliationFuriganaMap[fallbackAff] || fallbackAff };
      const entry = entries.find(e => e.entryId === entryId) || allEntries.find(e => e.entryId === entryId);
      if (!entry) return { name: fallbackName, aff: affiliationFuriganaMap[fallbackAff] || fallbackAff };
      const player = players.find(p => p.playerId === entry.playerId);
      if (!player) return { name: fallbackName, aff: affiliationFuriganaMap[fallbackAff] || fallbackAff };
      const affReading = affiliationFuriganaMap[player.affiliation] || player.affiliation;
      return { name: player.furigana || player.name, aff: affReading };
    };

    const isDoubles = useEvent?.type === 'Doubles';
    const roundName = getRoundName(m.round, useTotalRounds);

    if (isDoubles) {
      const [fallbackNameA, fallbackPairNameA] = m.player1Name.includes(' / ')
        ? m.player1Name.split(' / ') : [m.player1Name, ''];
      const [fallbackNameB, fallbackPairNameB] = m.player2Name.includes(' / ')
        ? m.player2Name.split(' / ') : [m.player2Name, ''];
      const [fallbackAffA, fallbackPairAffA] = m.player1Affiliation.includes(' / ')
        ? m.player1Affiliation.split(' / ') : [m.player1Affiliation, m.player1Affiliation];
      const [fallbackAffB, fallbackPairAffB] = m.player2Affiliation.includes(' / ')
        ? m.player2Affiliation.split(' / ') : [m.player2Affiliation, m.player2Affiliation];

      const p1 = resolveFurigana(m.player1EntryId, fallbackNameA, fallbackAffA);
      const p2 = resolveFurigana(m.player2EntryId, fallbackNameB, fallbackAffB);

      let partnerA = { name: fallbackPairNameA.trim(), aff: fallbackPairAffA.trim() };
      let partnerB = { name: fallbackPairNameB.trim(), aff: fallbackPairAffB.trim() };

      if (m.player1EntryId) {
        const entry1 = entries.find(e => e.entryId === m.player1EntryId) || allEntries.find(e => e.entryId === m.player1EntryId);
        if (entry1?.partnerId) {
          const partner = players.find(p => p.playerId === entry1.partnerId);
          if (partner) partnerA = { name: partner.furigana || partner.name, aff: partner.affiliation };
        }
      }
      if (m.player2EntryId) {
        const entry2 = entries.find(e => e.entryId === m.player2EntryId) || allEntries.find(e => e.entryId === m.player2EntryId);
        if (entry2?.partnerId) {
          const partner = players.find(p => p.playerId === entry2.partnerId);
          if (partner) partnerB = { name: partner.furigana || partner.name, aff: partner.affiliation };
        }
      }

      return {
        id: m.id || 0,
        eventName: useEvent?.name || '',
        round: `${roundName} #${m.position}`,
        numberA: getPos(m.player1EntryId, m.eventId),
        nameA: p1.name,
        affA: p1.aff,
        pairNameA: partnerA.name,
        pairAffA: partnerA.aff,
        numberB: getPos(m.player2EntryId, m.eventId),
        nameB: p2.name,
        affB: p2.aff,
        pairNameB: partnerB.name,
        pairAffB: partnerB.aff,
        type: 'doubles',
        status: 'pending',
        courtNumber: courtNum,
        startTime: m.scheduledTime || '',
      };
    } else {
      const p1 = resolveFurigana(m.player1EntryId, m.player1Name, m.player1Affiliation);
      const p2 = resolveFurigana(m.player2EntryId, m.player2Name, m.player2Affiliation);

      return {
        id: m.id || 0,
        eventName: useEvent?.name || '',
        round: `${roundName} #${m.position}`,
        numberA: getPos(m.player1EntryId, m.eventId),
        nameA: p1.name,
        affA: p1.aff,
        numberB: getPos(m.player2EntryId, m.eventId),
        nameB: p2.name,
        affB: p2.aff,
        type: 'singles',
        status: 'pending',
        courtNumber: courtNum,
        startTime: m.scheduledTime || '',
      };
    }
  }, [drawData, allDraws, entries, allEntries, players, currentEvent, totalRounds, affiliationFuriganaMap]);

  // コール実行
  const handleVoiceCall = useCallback((m: Match, courtNum: string) => {
    if (!courtNum) return;
    // グローバル表示でも正しくイベント・ラウンド数を解決
    const evt = events.find(e => e.eventId === m.eventId) || currentEvent;
    const evDraw = allDraws.get(m.eventId);
    const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : totalRounds;
    const matchCall = buildMatchCall(m, courtNum, evt, evTotalRounds);
    if (!matchCall) return;

    const text = buildCallText(matchCall, courtNum, m.scheduledTime || '', affiliationFuriganaMap);
    setSpeakingMatchId(m.matchId);

    speak(text, voiceSettings, () => {
      setSpeakingMatchId(null);
      const roundName = getRoundName(m.round, evTotalRounds);
      setCallLog(prev => [{
        timestamp: new Date(),
        courtNumber: courtNum,
        eventName: evt?.name || '',
        round: `${roundName} #${m.position}`,
        text,
        matchId: m.id || 0,
      }, ...prev]);
    });
  }, [buildMatchCall, speak, voiceSettings, affiliationFuriganaMap, currentEvent, totalRounds, events, allDraws]);

  // コール停止
  const handleVoiceStop = useCallback(() => {
    stop();
    setSpeakingMatchId(null);
  }, [stop]);

  // コール対象選択
  const toggleCallTarget = useCallback((m: Match) => {
    if (callTargetMatchId === m.matchId) {
      setCallTargetMatchId(null);
    } else {
      setCallTargetMatchId(m.matchId);
      setCallCourtNumber(m.courtId || '');
    }
  }, [callTargetMatchId]);

  // (生成機能は削除済み - ドロー画面から試合生成を行う)

  // --- 全コート初戦一斉コール ---
  const allMatchesFlat = useMemo(() => {
    const arr: Match[] = [];
    for (const [, matches] of allMatchesByEvent) arr.push(...matches);
    return arr;
  }, [allMatchesByEvent]);

  const hasWaitingMatchesWithCourts = useMemo(() => {
    return allMatchesFlat.some(m =>
      m.courtId && (m.status === 'waiting' || m.status === 'ready')
    );
  }, [allMatchesFlat]);

  // 初回コートが未確定か（playing中の試合が0かつ、courtId付きの待機試合がある or まだコートを振っていない）
  const hasPlayingMatches = useMemo(() => {
    return allMatchesFlat.some(m => m.status === 'playing');
  }, [allMatchesFlat]);

  // 初回コート確定ハンドラ
  const handleAssignInitialCourts = useCallback(async () => {
    const availableCourts = courts.filter(c => c.isAvailable).sort((a, b) => (parseInt(a.name) || 0) - (parseInt(b.name) || 0));
    if (availableCourts.length === 0) { alert('使用可能なコートがありません。'); return; }

    // 対戦順の上からコート数分の待機試合を取得
    const waitingMatches = globalSortedMatches.filter(m =>
      (m.status === 'waiting' || m.status === 'ready')
      && !!m.player1Name && !!m.player2Name
      && m.player1Name !== 'BYE' && m.player2Name !== 'BYE'
    );

    const assignCount = Math.min(waitingMatches.length, availableCourts.length);
    if (assignCount === 0) { alert('割り当てる試合がありません。'); return; }

    const assignments = waitingMatches.slice(0, assignCount).map((m, i) => ({
      match: m,
      court: availableCourts[i],
    }));

    const confirmed = confirm(
      `${assignCount}試合にコートを割り当てて試合開始にします。\n\n` +
      assignments.map(a => `${a.court.name}番コート: ${a.match.player1Name} vs ${a.match.player2Name}`).join('\n')
    );
    if (!confirmed) return;

    for (const a of assignments) {
      if (a.match.id) {
        await db.matches.update(a.match.id, {
          courtId: a.court.courtId,
          status: 'playing',
          updatedAt: Date.now(),
        });
      }
    }
  }, [courts, globalSortedMatches]);

  const bulkCallStart = useBulkCallStore(s => s.start);
  const bulkCallActive = useBulkCallStore(s => s.isActive);

  const handleBulkFirstCall = useCallback(async () => {
    if (!currentTournamentId || courts.length === 0) return;
    if (bulkCallActive) { alert('現在コール中です。'); return; }

    const firstMatches: { match: Match; court: Court }[] = [];
    for (const court of courts) {
      if (!court.isAvailable) continue;
      const courtMatches = allMatchesFlat
        .filter(m => m.courtId === court.courtId && (m.status === 'waiting' || m.status === 'ready')
          && !!m.player1Name && !!m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE')
        .sort((a, b) => (a.matchOrder || 0) - (b.matchOrder || 0));
      if (courtMatches.length > 0) firstMatches.push({ match: courtMatches[0], court });
    }

    if (firstMatches.length === 0) { alert('コールする試合がありません。'); return; }

    // コート番号順にソート
    firstMatches.sort((a, b) => {
      const numA = parseInt(a.court.name) || 0;
      const numB = parseInt(b.court.name) || 0;
      return numA - numB;
    });

    const confirmed = confirm(
      `${firstMatches.length}コートの初戦を順番にコールします。よろしいですか？\n\n` +
      firstMatches.map(fm => `${fm.court.name}番コート: ${fm.match.player1Name} vs ${fm.match.player2Name}`).join('\n')
    );
    if (!confirmed) return;

    // コールテキストを生成
    const bulkItems: BulkCallItem[] = [];
    for (const fm of firstMatches) {
      const m = fm.match;
      const courtNum = fm.court.name;
      const evt = events.find(e => e.eventId === m.eventId);
      const evDraw = allDraws.get(m.eventId);
      const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : 1;
      const matchCall = buildMatchCall(m, courtNum, evt, evTotalRounds);
      if (!matchCall) continue;
      const text = buildCallText(matchCall, courtNum, m.scheduledTime || '', affiliationFuriganaMap, true);

      bulkItems.push({
        matchId: m.matchId,
        dbId: m.id || 0,
        courtName: courtNum,
        courtId: fm.court.courtId,
        player1Name: m.player1Name,
        player2Name: m.player2Name,
        eventName: evt?.name || '',
        roundLabel: getRoundName(m.round, evTotalRounds),
        callText: text,
      });
    }

    if (bulkItems.length === 0) { alert('コール対象がありません。'); return; }

    // Zustand storeでコール開始（BulkCallOverlayが自動実行）
    bulkCallStart(bulkItems, voiceSettings.rate, 1);
  }, [currentTournamentId, courts, allMatchesFlat, bulkCallActive, bulkCallStart, buildMatchCall, affiliationFuriganaMap, voiceSettings, events, allDraws]);

  // --- ゲームルール編集 ---
  const [editingRuleEventId, setEditingRuleEventId] = useState<string | null>(null);
  const [editingRules, setEditingRules] = useState<RoundGameRule[]>([]);

  const openRuleEditor = useCallback((evt: Event) => {
    setEditingRuleEventId(evt.eventId);
    setEditingRules(evt.roundGameRules?.length ? [...evt.roundGameRules] : [
      { roundLabel: '全回戦', ruleText: `${evt.gameRules?.games ?? 6}ゲームマッチ（${evt.gameRules?.games ?? 6}-${evt.gameRules?.games ?? 6}タイブレーク）`, games: evt.gameRules?.games ?? 6 },
    ]);
  }, []);

  const saveRules = useCallback(async () => {
    if (!editingRuleEventId) return;
    const evt = events.find(e => e.eventId === editingRuleEventId);
    if (!evt?.id) return;
    const defaultGames = editingRules.length > 0 ? editingRules[0].games : 6;
    await db.events.update(evt.id, {
      roundGameRules: editingRules,
      gameRules: { ...evt.gameRules, games: defaultGames, tiebreakPoint: defaultGames },
    });
    setEditingRuleEventId(null);
  }, [editingRuleEventId, editingRules, events]);

  // --- 結果入力 ---
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [editTiebreak, setEditTiebreak] = useState('');

  // ゲーム数からタイブレークかどうか判定（グローバル表示では編集中の試合の種目から取得）
  const games = useMemo(() => {
    if (currentEvent?.gameRules?.games) return currentEvent.gameRules.games;
    // グローバル表示: 編集中の試合のeventIdからゲーム数を取得
    if (editingMatchId) {
      const editingMatch = globalSortedMatches.find(m => m.matchId === editingMatchId)
        || Array.from(allMatchesByEvent.values()).flat().find(m => m.matchId === editingMatchId);
      if (editingMatch) {
        const evt = events.find(e => e.eventId === editingMatch.eventId);
        if (evt?.gameRules?.games) return evt.gameRules.games;
      }
    }
    return 6;
  }, [currentEvent, editingMatchId, globalSortedMatches, allMatchesByEvent, events]);
  const isTiebreakScore = useMemo(() => {
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) return false;
    // タイブレーク: 両者がgames数で並んだ場合（6-6→7-6など）
    // 勝者はgames+1、敗者はgames
    return (s1 === games + 1 && s2 === games) || (s2 === games + 1 && s1 === games);
  }, [editScore1, editScore2, games]);

  // スコアから勝者を自動判定
  const autoWinner = useMemo((): 1 | 2 | null => {
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) return null;
    if (s1 > s2) return 1;
    if (s2 > s1) return 2;
    return null;
  }, [editScore1, editScore2]);

  // タイブレーク敗者側の判定（1=P1が敗者, 2=P2が敗者）
  const tiebreakLoserSide = useMemo((): 1 | 2 | null => {
    if (!isTiebreakScore || !autoWinner) return null;
    return autoWinner === 1 ? 2 : 1;
  }, [isTiebreakScore, autoWinner]);

  const startEdit = useCallback((m: Match) => {
    setEditingMatchId(m.matchId);
    // 既存スコアをパース ("8-6" or "7-6(4)")
    const scoreMatch = (m.score || '').match(/^(\d+)\s*[-–―]\s*(\d+)(?:\((\d+)\))?$/);
    if (scoreMatch) {
      setEditScore1(scoreMatch[1]);
      setEditScore2(scoreMatch[2]);
      setEditTiebreak(scoreMatch[3] || '');
    } else {
      setEditScore1('');
      setEditScore2('');
      setEditTiebreak('');
    }
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMatchId(null);
    setEditScore1('');
    setEditScore2('');
    setEditTiebreak('');
  }, []);

  const saveResult = useCallback(async (m: Match) => {
    if (!m.id) return;
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) {
      alert('スコアを入力してください');
      return;
    }
    if (s1 === s2) {
      alert('同点のスコアは入力できません');
      return;
    }

    const winner: 1 | 2 = s1 > s2 ? 1 : 2;
    const winnerEntryId = winner === 1 ? m.player1EntryId : m.player2EntryId;
    const winnerName = winner === 1 ? m.player1Name : m.player2Name;
    const winnerAff = winner === 1 ? m.player1Affiliation : m.player2Affiliation;

    // スコア文字列を生成
    let scoreStr = `${s1}-${s2}`;
    if (isTiebreakScore && editTiebreak) {
      scoreStr += `(${editTiebreak})`;
    }

    // スコアと勝者を更新
    await db.matches.update(m.id, {
      score: scoreStr,
      winnerEntryId,
      status: winnerEntryId ? 'finished' : 'waiting',
      updatedAt: Date.now(),
    });

    // 次ラウンドへの自動進出（リーグ戦では不要）
    const matchEventId = m.eventId || selectedEventId;
    if (matchEventId) {
      const eventDraw = await db.draws.where('eventId').equals(matchEventId).first();
      const ds = eventDraw?.drawSize || 0;
      const isLeague = eventDraw?.drawType === 'roundRobin' || (ds > 0 && (ds & (ds - 1)) !== 0);

      if (!isLeague) {
        const nextRound = m.round + 1;
        const nextPosition = Math.ceil(m.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(matchEventId)
          .filter(nm => nm.round === nextRound && nm.position === nextPosition)
          .first();

        if (nextMatch?.id) {
          const isUpper = m.position % 2 === 1;
          if (winnerEntryId) {
            await db.matches.update(nextMatch.id, {
              ...(isUpper
                ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
                : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
              ),
              updatedAt: Date.now(),
            });
          } else {
            await db.matches.update(nextMatch.id, {
              ...(isUpper
                ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
                : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
              ),
              ...(nextMatch.winnerEntryId ? { winnerEntryId: null, score: '', status: 'waiting' } : {}),
              updatedAt: Date.now(),
            });
          }
        }
      }
    }

    // 試合終了時のコートプロモーション: 空いたコートに次の待機試合を自動割当
    if (winnerEntryId && m.courtId) {
      const freedCourtId = m.courtId;
      // 現在の全試合を取得して待機順で次の試合を見つける
      const tid = useAppStore.getState().currentTournamentId;
      if (tid) {
        const allEvts = await db.events.where('tournamentId').equals(tid).toArray();
        const allEvtIds = allEvts.map(e => e.eventId);
        const allMs = await db.matches.where('eventId').anyOf(allEvtIds).toArray();
        const sortedMs = allMs
          .filter(mm => mm.status !== 'walkover')
          .sort((a, b) => (a.matchOrder || 9999) - (b.matchOrder || 9999));

        // 次の待機試合（対戦相手確定済み、waiting/ready）を見つける
        const nextWaiting = sortedMs.find(mm =>
          (mm.status === 'waiting' || mm.status === 'ready')
          && mm.player1Name && mm.player2Name
          && mm.player1Name !== 'BYE' && mm.player2Name !== 'BYE'
        );
        if (nextWaiting?.id) {
          await db.matches.update(nextWaiting.id, {
            courtId: freedCourtId,
            status: 'playing',
            updatedAt: Date.now(),
          });
        }
      }
    }

    cancelEdit();
  }, [editScore1, editScore2, editTiebreak, isTiebreakScore, selectedEventId, cancelEdit]);

  const handlePrintEvent = useCallback((eventId: string) => {
    const eventMatches = allMatchesByEvent.get(eventId) || [];
    const printableMatches = eventMatches.filter(m => m.status !== 'walkover').sort((a, b) => a.round - b.round || a.matchOrder - b.matchOrder);
    if (printableMatches.length === 0) {
      alert('印刷対象の試合がありません');
      return;
    }

    const evt = events.find(e => e.eventId === eventId);
    const eventName = evt?.name || '';
    const tournamentName = tournament?.name || '';
    const tournamentDate = tournament?.date || '';
    const eventDraw = allDraws.get(eventId);
    const eventTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;

    /** 回戦に応じたゲームルール文字列を取得 */
    const getGameMethodForRound = (round: number): string => {
      const rules = evt?.roundGameRules;
      if (rules && rules.length > 0) {
        if (rules.length === 1) return stripRoundPrefix(rules[0].ruleText).replace(/\n/g, '\n');
        const roundN = getRoundName(round, eventTotalRounds);
        for (const rule of rules) {
          const label = rule.roundLabel;
          if (label === '全回戦') continue;
          const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
          if (rangeMatch) {
            const from = parseInt(rangeMatch[1]), to = parseInt(rangeMatch[2]);
            if (round >= from && round <= to) return stripRoundPrefix(rule.ruleText);
            continue;
          }
          if (label.includes('以降')) {
            const cl = label.replace('以降', '');
            if (cl.includes('準々決勝') && round >= eventTotalRounds - 2) return stripRoundPrefix(rule.ruleText);
            if (cl.includes('準決勝') && round >= eventTotalRounds - 1) return stripRoundPrefix(rule.ruleText);
            if (cl.includes('決勝') && !cl.includes('準') && round >= eventTotalRounds) return stripRoundPrefix(rule.ruleText);
            const rn = cl.match(/(\d+)回戦/);
            if (rn && round >= parseInt(rn[1])) return stripRoundPrefix(rule.ruleText);
            continue;
          }
          if (roundN === label || label.includes(roundN)) return stripRoundPrefix(rule.ruleText);
        }
        return stripRoundPrefix(rules[0].ruleText);
      }
      const games = evt?.gameRules?.games ?? 6;
      return `${games}ゲームマッチ\n（${games}-${games}タイブレーク）`;
    };

    const roundName = (round: number) => getRoundName(round, eventTotalRounds);

    // B5 landscape: 250mm x 176mm, margin 5mm → usable 240mm x 166mm
    // Excel column structure: 38 columns (A-AL)
    const colA = (3.29 / 315.20 * 100).toFixed(3);
    const colN = (8.43 / 315.20 * 100).toFixed(3);

    const colgroup = `<colgroup>
      <col style="width:${colA}%">` + /* col A (1) */
      Array.from({length: 37}, () => `<col style="width:${colN}%">`).join('') + /* cols B-AL (2-38) */
      `</colgroup>`;

    // Row heights from Excel (in points, converted proportionally).
    // Total: 16.5+21+22.5+18.75*4+37.5*2+7.5+18.75*2+16.5*6+39.75*3+25.5 = 418.5pt
    // We'll use these as fixed heights summing to 190mm.
    // Scale factor: 190mm / 418.5pt
    const rowHeights = [16.5, 21, 22.5, 18.75, 18.75, 18.75, 18.75, 37.5, 37.5, 7.5, 18.75, 18.75, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 39.75, 39.75, 39.75, 25.5];
    const totalPt = rowHeights.reduce((a, b) => a + b, 0);
    const rh = rowHeights.map(h => (h / totalPt * 166).toFixed(2) + 'mm');
    // rh[0]=R1, rh[1]=R2, ... rh[21]=R22

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>審判用紙 - ${eventName}</title>
<style>
  @page { size: B5 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', 'Hiragino Sans', monospace;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    width: 240mm;
    height: 166mm;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .sheet:last-child { page-break-after: auto; }

  .ref-table {
    width: 100%;
    height: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .ref-table td {
    padding: 0;
    margin: 0;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ====== Shared font families ====== */
  .fg { font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', monospace; }
  .fp { font-family: 'MS PGothic', 'MS Pゴシック', 'Yu Gothic', sans-serif; }
  .ft { font-family: 'Times New Roman', serif; }

  /* ====== Border helpers ====== */
  .bt  { border-top: 1px solid #000; }
  .bb  { border-bottom: 1px solid #000; }
  .bl  { border-left: 1px solid #000; }
  .br  { border-right: 1px solid #000; }
  .bt2 { border-top: 2px solid #000; }
  .bb2 { border-bottom: 2px solid #000; }
  .bl2 { border-left: 2px solid #000; }
  .br2 { border-right: 2px solid #000; }
  .ba  { border: 1px solid #000; }
</style></head><body>
${printableMatches.map(m => {
      const rName = roundName(m.round);
      const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      const courtDisplay = courtObj?.name || '';

      // Find entry numbers: extract numeric part from entryId (e.g. "EN-001" -> 1)
      // or use draw slot position if available
      const getEntryNo = (entryId: string | null): string => {
        if (!entryId) return '';
        // Try to find position from draw slots
        if (eventDraw) {
          const slot = eventDraw.slots.find((s: DrawSlot) => s.entryId === entryId);
          if (slot) return String(slot.position);
        }
        // Fallback: extract number from entryId
        const numMatch = entryId.match(/(\d+)/);
        return numMatch ? String(parseInt(numMatch[1], 10)) : '';
      };
      const entryNo1 = getEntryNo(m.player1EntryId);
      const entryNo2 = getEntryNo(m.player2EntryId);

      return `
<div class="sheet">
  <table class="ref-table">
    ${colgroup}

    <!-- Row 1: Title top half (A1:AL2 merged, spans rows 1-2) -->
    <tr style="height:${rh[0]};">
      <td colspan="38" rowspan="2"
          class="fg" style="text-align:center; font-size:32px; font-weight:bold; letter-spacing:0.5em; height:calc(${rh[0]} + ${rh[1]});">
        審　判　用　紙
      </td>
    </tr>

    <!-- Row 2: consumed by rowspan -->
    <tr style="height:${rh[1]};"></tr>

    <!-- Row 3: Tournament name (H3:AD3) + Date (AE3:AL3) -->
    <tr style="height:${rh[2]};">
      <td colspan="7" style="height:${rh[2]};"></td>
      <td colspan="23" class="fg bb2" style="text-align:center; font-size:14px;">
        (${tournamentName})
      </td>
      <td colspan="8" class="fg bb2" style="text-align:right; font-size:14px; padding-right:4px;">
        ${tournamentDate}
      </td>
    </tr>

    <!-- Row 4: 種目/Event/回戦/Round (rows 4-7 merged) -->
    <tr style="height:${rh[3]};">
      <td colspan="6" rowspan="4"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:16px; height:calc(${rh[3]} + ${rh[4]} + ${rh[5]} + ${rh[6]});">
        種　目
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:24px; white-space:nowrap;">
        ${eventName}
      </td>
      <td colspan="6" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:18px;">
        回　戦
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br2 bb"
          style="text-align:center; font-size:28px; font-weight:bold;">
        ${rName}
      </td>
    </tr>
    <tr style="height:${rh[4]};"></tr>
    <tr style="height:${rh[5]};"></tr>
    <tr style="height:${rh[6]};"></tr>

    <!-- Row 8: Court/Method/Time (rows 8-9 merged) -->
    <tr style="height:${rh[7]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt br bb2"
          style="text-align:center; font-size:16px; height:calc(${rh[7]} + ${rh[8]});">
        コート№
      </td>
      <td colspan="6" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:36px; font-weight:bold;">
        ${courtDisplay}
      </td>
      <td colspan="5" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        試合方法
      </td>
      <td colspan="9" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:18px; white-space:pre-line; line-height:1.3;">
        ${getGameMethodForRound(m.round)}
      </td>
      <td colspan="5" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        開始時間
      </td>
      <td colspan="7" rowspan="2"
          class="fg bt br2 bb2"
          style="text-align:center; font-size:22px; font-weight:bold;">
        ${m.round === 1 ? (m.scheduledTime || '') : ''}
      </td>
    </tr>
    <tr style="height:${rh[8]};"></tr>

    <!-- Row 10: Spacer -->
    <tr style="height:${rh[9]};">
      <td colspan="38" style="height:${rh[9]};"></td>
    </tr>

    <!-- Row 11: Entry numbers (rows 11-12 merged) -->
    <tr style="height:${rh[10]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[10]} + ${rh[11]});">
        エントリー№
      </td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb"
          style="text-align:right; font-size:20px; padding-right:2px; border-left:1px solid #000;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br"
          style="text-align:center; font-size:26px;">
        ${entryNo1}
      </td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb"
          style="text-align:right; font-size:20px; padding-right:2px; border-left:1px solid #000;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br2"
          style="text-align:center; font-size:26px;">
        ${entryNo2}
      </td>
    </tr>
    <tr style="height:${rh[11]};"></tr>

    <!-- Row 13: Player names (rows 13-18, label spans all 6) -->
    <tr style="height:${rh[12]};">
      <td colspan="6" rowspan="6"
          class="fg bl2 bt br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[12]} + ${rh[13]} + ${rh[14]} + ${rh[15]} + ${rh[16]} + ${rh[17]});">
        選 手 氏 名
      </td>
      <!-- Player 1 name: G13:V16 (cols 7-22, rows 13-16) -->
      <td colspan="16" rowspan="4"
          class="fp bt br"
          style="text-align:center; font-size:28px; white-space:nowrap; height:calc(${rh[12]} + ${rh[13]} + ${rh[14]} + ${rh[15]});">
        ${m.player1Name}
      </td>
      <!-- Player 2 name: W13:AL16 (cols 23-38, rows 13-16) -->
      <td colspan="16" rowspan="4"
          class="fp bt br2"
          style="text-align:center; font-size:28px; white-space:nowrap;">
        ${m.player2Name}
      </td>
    </tr>
    <tr style="height:${rh[13]};"></tr>
    <tr style="height:${rh[14]};"></tr>
    <tr style="height:${rh[15]};"></tr>

    <!-- Row 17: Affiliations (rows 17-18) -->
    <tr style="height:${rh[16]};">
      <!-- Player 1 affiliation: （ G17:H18, name I17:T18, ） U17:V18 -->
      <td colspan="2" rowspan="2"
          class="fp bl bb"
          style="text-align:right; font-size:20px; vertical-align:top;">
        （
      </td>
      <td colspan="12" rowspan="2"
          class="fp bb"
          style="text-align:center; font-size:20px; vertical-align:top; white-space:nowrap;">
        ${m.player1Affiliation || ''}
      </td>
      <td colspan="2" rowspan="2"
          class="fp br bb"
          style="text-align:left; font-size:20px; vertical-align:top;">
        ）
      </td>
      <!-- Player 2 affiliation: （ W17:X18, name Y17:AJ18, ） AK17:AL18 -->
      <td colspan="2" rowspan="2"
          class="fp bl bb"
          style="text-align:right; font-size:20px; vertical-align:top;">
        （
      </td>
      <td colspan="12" rowspan="2"
          class="fp bb"
          style="text-align:center; font-size:20px; vertical-align:top; white-space:nowrap;">
        ${m.player2Affiliation || ''}
      </td>
      <td colspan="2" rowspan="2"
          class="fp br2 bb"
          style="text-align:left; font-size:20px; vertical-align:top;">
        ）
      </td>
    </tr>
    <tr style="height:${rh[17]};"></tr>

    <!-- Row 19: Score (rows 19-20 merged) -->
    <tr style="height:${rh[18]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[18]} + ${rh[19]});">
        ス　コ　ア
      </td>
      <!-- Score area left: G19:U20 (cols 7-21, 15 cols) -->
      <td colspan="15" rowspan="2"
          class="fg bt bl br bb"
          style="text-align:center; font-size:24px;">
      </td>
      <!-- Dash: V19:W20 (cols 22-23, 2 cols) -->
      <td colspan="2" rowspan="2"
          class="fg bt bb"
          style="text-align:center; font-size:24px;">
        ―
      </td>
      <!-- Score area right: X19:AL20 (cols 24-38, 15 cols) -->
      <td colspan="15" rowspan="2"
          class="fg bt bl br2 bb"
          style="text-align:center; font-size:24px;">
      </td>
    </tr>
    <tr style="height:${rh[19]};"></tr>

    <!-- Row 21: Tiebreak (colspans match score row: 15+2+15) -->
    <tr style="height:${rh[20]};">
      <td colspan="6"
          class="fg bl2 bt br bb2"
          style="text-align:center; font-size:14px; height:${rh[20]};">
        （ＴＢ）
      </td>
      <!-- TB area left: cols 7-21 (15 cols) -->
      <td colspan="15"
          class="fg bt bl br bb2"
          style="height:${rh[20]};">
      </td>
      <!-- TB paren area: cols 22-23 (2 cols) -->
      <td colspan="2"
          class="fg bt bb2"
          style="text-align:center; font-size:12px;">
        （　）
      </td>
      <!-- TB area right: cols 24-38 (15 cols) -->
      <td colspan="15"
          class="fg bt bl br2 bb2"
          style="height:${rh[20]};">
      </td>
    </tr>

    <!-- Row 22: Footer -->
    <tr style="height:${rh[21]};">
      <td colspan="25" style="height:${rh[21]};"></td>
      <td colspan="13"
          class="fg bt2"
          style="text-align:right; font-size:12px; padding-right:4px;">
        鳥取市テニス協会
      </td>
    </tr>
  </table>
</div>`;
    }).join('')}
</body></html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 500);
    }
  }, [allMatchesByEvent, allDraws, events, players, courts, tournament]);

  // 個別試合の印刷
  const handlePrintMatch = useCallback((m: Match) => {
    const evt = events.find(e => e.eventId === m.eventId);
    if (!evt) return;
    const eventDraw = allDraws.get(m.eventId);
    const eventTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;
    const rName = getRoundName(m.round, eventTotalRounds);
    const eventName = evt.name;
    const tournamentName = tournament?.name || '';
    const tournamentDate = tournament?.date || '';
    // 回戦に応じたゲームルール
    const rules2 = evt.roundGameRules;
    let gameMethod: string;
    if (rules2 && rules2.length > 0) {
      if (rules2.length === 1) { gameMethod = stripRoundPrefix(rules2[0].ruleText); }
      else {
        const rn2 = getRoundName(m.round, eventTotalRounds);
        gameMethod = stripRoundPrefix(rules2[0].ruleText); // default
        for (const rule of rules2) {
          const label = rule.roundLabel;
          if (label === '全回戦') continue;
          const rm = label.match(/(\d+)～(\d+)回戦/);
          if (rm) { if (m.round >= parseInt(rm[1]) && m.round <= parseInt(rm[2])) { gameMethod = stripRoundPrefix(rule.ruleText); break; } continue; }
          if (label.includes('以降')) {
            const cl = label.replace('以降', '');
            if (cl.includes('準々決勝') && m.round >= eventTotalRounds - 2) { gameMethod = stripRoundPrefix(rule.ruleText); break; }
            if (cl.includes('準決勝') && m.round >= eventTotalRounds - 1) { gameMethod = stripRoundPrefix(rule.ruleText); break; }
            if (cl.includes('決勝') && !cl.includes('準') && m.round >= eventTotalRounds) { gameMethod = stripRoundPrefix(rule.ruleText); break; }
            const rn3 = cl.match(/(\d+)回戦/);
            if (rn3 && m.round >= parseInt(rn3[1])) { gameMethod = stripRoundPrefix(rule.ruleText); break; }
            continue;
          }
          if (rn2 === label || label.includes(rn2)) { gameMethod = stripRoundPrefix(rule.ruleText); break; }
        }
      }
    } else {
      const gamesVal = evt.gameRules?.games ?? 6;
      gameMethod = `${gamesVal}ゲームマッチ\n（${gamesVal}-${gamesVal}タイブレーク）`;
    }
    const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
    const courtDisplay = courtObj?.name || '';

    const getEntryNo = (entryId: string | null): string => {
      if (!entryId) return '';
      if (eventDraw) {
        const slot = eventDraw.slots.find((s: DrawSlot) => s.entryId === entryId);
        if (slot) return String(slot.position);
      }
      const numMatch = entryId.match(/(\d+)/);
      return numMatch ? String(parseInt(numMatch[1], 10)) : '';
    };
    const entryNo1 = getEntryNo(m.player1EntryId);
    const entryNo2 = getEntryNo(m.player2EntryId);

    const colA = (3.29 / 315.20 * 100).toFixed(3);
    const colN = (8.43 / 315.20 * 100).toFixed(3);
    const colgroup = `<colgroup><col style="width:${colA}%">` + Array.from({length: 37}, () => `<col style="width:${colN}%">`).join('') + `</colgroup>`;
    const rowHeights = [16.5, 21, 22.5, 18.75, 18.75, 18.75, 18.75, 37.5, 37.5, 7.5, 18.75, 18.75, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 39.75, 39.75, 39.75, 25.5];
    const totalPt = rowHeights.reduce((a, b) => a + b, 0);
    const rh = rowHeights.map(h => (h / totalPt * 166).toFixed(2) + 'mm');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>審判用紙 - ${eventName} ${rName}</title>
<style>@page{size:B5 landscape;margin:5mm;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'MS Gothic','MS ゴシック','Yu Gothic','Hiragino Sans',monospace;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.sheet{width:240mm;height:166mm;overflow:hidden;position:relative;}.ref-table{width:100%;height:100%;table-layout:fixed;border-collapse:collapse;}.ref-table td{padding:0;margin:0;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;}.fg{font-family:'MS Gothic','MS ゴシック','Yu Gothic',monospace;}.fp{font-family:'MS PGothic','MS Pゴシック','Yu Gothic',sans-serif;}.ft{font-family:'Times New Roman',serif;}.bt{border-top:1px solid #000;}.bb{border-bottom:1px solid #000;}.bl{border-left:1px solid #000;}.br{border-right:1px solid #000;}.bt2{border-top:2px solid #000;}.bb2{border-bottom:2px solid #000;}.bl2{border-left:2px solid #000;}.br2{border-right:2px solid #000;}.ba{border:1px solid #000;}</style></head><body>
<div class="sheet"><table class="ref-table">${colgroup}
<tr style="height:${rh[0]};"><td colspan="38" rowspan="2" class="fg" style="text-align:center;font-size:32px;font-weight:bold;letter-spacing:0.5em;height:calc(${rh[0]}+${rh[1]});">審　判　用　紙</td></tr><tr style="height:${rh[1]};"></tr>
<tr style="height:${rh[2]};"><td colspan="7" style="height:${rh[2]};"></td><td colspan="23" class="fg bb2" style="text-align:center;font-size:14px;">(${tournamentName})</td><td colspan="8" class="fg bb2" style="text-align:right;font-size:14px;padding-right:4px;">${tournamentDate}</td></tr>
<tr style="height:${rh[3]};"><td colspan="6" rowspan="4" class="fg bl2 bt2 br bb" style="text-align:center;font-size:16px;height:calc(${rh[3]}+${rh[4]}+${rh[5]}+${rh[6]});">種　目</td><td colspan="13" rowspan="4" class="fg bt2 br bb" style="text-align:center;font-size:24px;white-space:nowrap;">${eventName}</td><td colspan="6" rowspan="4" class="fg bt2 br bb" style="text-align:center;font-size:18px;">回　戦</td><td colspan="13" rowspan="4" class="fg bt2 br2 bb" style="text-align:center;font-size:28px;font-weight:bold;">${rName}</td></tr><tr style="height:${rh[4]};"></tr><tr style="height:${rh[5]};"></tr><tr style="height:${rh[6]};"></tr>
<tr style="height:${rh[7]};"><td colspan="6" rowspan="2" class="fg bl2 bt br bb2" style="text-align:center;font-size:16px;height:calc(${rh[7]}+${rh[8]});">コート№</td><td colspan="6" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:36px;font-weight:bold;">${courtDisplay}</td><td colspan="5" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:16px;">試合方法</td><td colspan="9" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:18px;white-space:pre-line;line-height:1.3;">${gameMethod}</td><td colspan="5" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:16px;">開始時間</td><td colspan="7" rowspan="2" class="fg bt br2 bb2" style="text-align:center;font-size:22px;font-weight:bold;">${m.scheduledTime || ''}</td></tr><tr style="height:${rh[8]};"></tr>
<tr style="height:${rh[9]};"><td colspan="38" style="height:${rh[9]};"></td></tr>
<tr style="height:${rh[10]};"><td colspan="6" rowspan="2" class="fg bl2 bt2 br bb" style="text-align:center;font-size:14px;height:calc(${rh[10]}+${rh[11]});">エントリー№</td><td colspan="4" rowspan="2" class="ft bt2 bb" style="text-align:right;font-size:20px;padding-right:2px;border-left:1px solid #000;">No.</td><td colspan="12" rowspan="2" class="fp bt2 bb br" style="text-align:center;font-size:26px;">${entryNo1}</td><td colspan="4" rowspan="2" class="ft bt2 bb" style="text-align:right;font-size:20px;padding-right:2px;border-left:1px solid #000;">No.</td><td colspan="12" rowspan="2" class="fp bt2 bb br2" style="text-align:center;font-size:26px;">${entryNo2}</td></tr><tr style="height:${rh[11]};"></tr>
<tr style="height:${rh[12]};"><td colspan="6" rowspan="6" class="fg bl2 bt br bb" style="text-align:center;font-size:14px;height:calc(${rh[12]}+${rh[13]}+${rh[14]}+${rh[15]}+${rh[16]}+${rh[17]});">選 手 氏 名</td><td colspan="16" rowspan="4" class="fp bt br" style="text-align:center;font-size:28px;white-space:nowrap;height:calc(${rh[12]}+${rh[13]}+${rh[14]}+${rh[15]});">${m.player1Name}</td><td colspan="16" rowspan="4" class="fp bt br2" style="text-align:center;font-size:28px;white-space:nowrap;">${m.player2Name}</td></tr><tr style="height:${rh[13]};"></tr><tr style="height:${rh[14]};"></tr><tr style="height:${rh[15]};"></tr>
<tr style="height:${rh[16]};"><td colspan="2" rowspan="2" class="fp bl bb" style="text-align:right;font-size:20px;vertical-align:top;">（</td><td colspan="12" rowspan="2" class="fp bb" style="text-align:center;font-size:20px;vertical-align:top;white-space:nowrap;">${m.player1Affiliation || ''}</td><td colspan="2" rowspan="2" class="fp br bb" style="text-align:left;font-size:20px;vertical-align:top;">）</td><td colspan="2" rowspan="2" class="fp bl bb" style="text-align:right;font-size:20px;vertical-align:top;">（</td><td colspan="12" rowspan="2" class="fp bb" style="text-align:center;font-size:20px;vertical-align:top;white-space:nowrap;">${m.player2Affiliation || ''}</td><td colspan="2" rowspan="2" class="fp br2 bb" style="text-align:left;font-size:20px;vertical-align:top;">）</td></tr><tr style="height:${rh[17]};"></tr>
<tr style="height:${rh[18]};"><td colspan="6" rowspan="2" class="fg bl2 bt br bb" style="text-align:center;font-size:14px;height:calc(${rh[18]}+${rh[19]});">ス　コ　ア</td><td colspan="15" rowspan="2" class="fg bt bl br bb" style="text-align:center;font-size:24px;"></td><td colspan="2" rowspan="2" class="fg bt bb" style="text-align:center;font-size:24px;">―</td><td colspan="15" rowspan="2" class="fg bt bl br2 bb" style="text-align:center;font-size:24px;"></td></tr><tr style="height:${rh[19]};"></tr>
<tr style="height:${rh[20]};"><td colspan="6" class="fg bl2 bt br bb2" style="text-align:center;font-size:14px;height:${rh[20]};">（ＴＢ）</td><td colspan="15" class="fg bt bl br bb2" style="height:${rh[20]};"></td><td colspan="2" class="fg bt bb2" style="text-align:center;font-size:12px;">（　）</td><td colspan="15" class="fg bt bl br2 bb2" style="height:${rh[20]};"></td></tr>
<tr style="height:${rh[21]};"><td colspan="25" style="height:${rh[21]};"></td><td colspan="13" class="fg bt2" style="text-align:right;font-size:12px;padding-right:4px;">鳥取市テニス協会</td></tr>
</table></div></body></html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 500);
    }
  }, [events, allDraws, courts, tournament]);

  // スクロール時にコントロールを自動非表示
  const [controlsOpen, setControlsOpen] = useState(true);
  const matchContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = matchContentRef.current;
    if (!el) return;
    let lastScrollY = 0;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > 20 && y > lastScrollY) {
        setControlsOpen(false);
      }
      lastScrollY = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const statusLabels: Record<string, { text: string; color: string }> = {
    waiting: { text: '待機', color: 'bg-gray-100 text-gray-500' },
    ready: { text: '準備完了', color: 'bg-primary-50 text-primary-500' },
    playing: { text: '試合中', color: 'bg-green-100 text-primary-500' },
    finished: { text: '終了', color: 'bg-primary-50 text-primary-600' },
    walkover: { text: '不戦勝', color: 'bg-amber-100 text-warning' },
  };

  return (
    <div className="max-w-full mx-auto lg:h-full flex flex-col lg:flex-row lg:gap-4 p-4">
      {/* LEFT: コントロールパネル */}
      <div className="lg:w-[280px] shrink-0 order-1 lg:order-1 mb-3 lg:mb-0 sticky top-0 z-20 lg:self-start bg-bg-main pb-1">
        <button
          onClick={() => setControlsOpen(prev => !prev)}
          className="w-full flex items-center justify-between bg-white px-4 py-2.5 rounded-xl shadow-sm border border-border-main hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary-500" />
            <span className="font-bold text-gray-900">対戦順・審判用紙</span>
            <span className="text-xs text-gray-500 ml-1">
              {eventsWithMatches.length} 種目
            </span>
          </div>
          {controlsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        <div className={`transition-all duration-300 overflow-hidden ${controlsOpen ? 'max-h-[600px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-border-main space-y-3">
            {/* 表示切替 */}
            <div className="flex rounded-lg border border-border-main overflow-hidden text-sm w-full">
              <button onClick={() => setViewMode('global')}
                className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${viewMode === 'global' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <ListOrdered className="w-3.5 h-3.5" />対戦順
              </button>
              <button onClick={() => setViewMode('event')}
                className={`flex-1 px-3 py-1.5 flex items-center justify-center gap-1 font-medium transition-colors ${viewMode === 'event' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <ClipboardList className="w-3.5 h-3.5" />種目別
              </button>
            </div>
            {/* 試合順インポート */}
            <div className="flex items-center gap-2">
              <input ref={matchOrderInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportMatchOrder} className="hidden" />
              <button
                onClick={() => matchOrderInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                試合順取込
              </button>
              {scheduleFileName && (
                <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={scheduleFileName}>{scheduleFileName}</span>
              )}
            </div>
            {/* 初回コート確定 */}
            {!hasPlayingMatches && globalSortedMatches.some(m => (m.status === 'waiting' || m.status === 'ready') && !!m.player1Name && !!m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE') && (
              <button
                onClick={handleAssignInitialCourts}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-md transition-all"
              >
                <Play className="w-4 h-4" />
                初回コート確定（{courts.filter(c => c.isAvailable).length}コートに割り当て）
              </button>
            )}
            {/* 全コート初戦一斉コール */}
            {hasWaitingMatchesWithCourts && (
              <button
                onClick={handleBulkFirstCall}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-md transition-all"
              >
                <Megaphone className="w-4 h-4" />
                全コート初戦一斉コール
              </button>
            )}
            {/* 音声コール設定 */}
            <div>
              <button
                onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-emerald-600 transition-colors"
              >
                {showVoiceSettings ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                <Settings2 className="w-4 h-4 text-emerald-500" />
                音声コール設定
              </button>
              {showVoiceSettings && (
                <div className="mt-3 bg-gradient-to-br from-slate-50 to-emerald-50/50 rounded-xl border border-emerald-100 p-4 space-y-4">
                  {/* 音声エンジン情報 */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-emerald-100 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
                      <Volume2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800">大会運営システム 音声エンジン</p>
                      <p className="text-[10px] text-gray-500">Web Speech API — {voiceName || '日本語音声'}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">Active</span>
                  </div>

                  {/* 音声選択 */}
                  {availableVoices.length > 1 && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                        <Mic className="w-3.5 h-3.5 text-emerald-500" />
                        音声タイプ
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {availableVoices.map(v => (
                          <button
                            key={v.key}
                            onClick={() => setSelectedVoiceKey(v.key)}
                            className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition-all ${
                              selectedVoiceKey === v.key
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:text-emerald-600'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 速度スライダー */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <Gauge className="w-3.5 h-3.5 text-emerald-500" />
                        読み上げ速度
                      </label>
                      <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {voiceSettings.rate.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min="0.5"
                        max="1.2"
                        step="0.05"
                        value={voiceSettings.rate}
                        onChange={e => setVoiceSettings(s => ({ ...s, rate: parseFloat(e.target.value) }))}
                        className="w-full h-2 accent-emerald-500 cursor-pointer"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-gray-400">ゆっくり</span>
                        <span className="text-[9px] text-gray-400">はやい</span>
                      </div>
                    </div>
                  </div>

                  {/* テスト・停止ボタン */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => testVoice(voiceSettings)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-600 rounded-lg text-xs font-bold border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all shadow-sm"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      テスト再生
                    </button>
                    {isSpeaking && (
                      <button
                        onClick={handleVoiceStop}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100 transition-all"
                      >
                        <Square className="w-3.5 h-3.5" />
                        停止
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: メインコンテンツ */}
      <div ref={matchContentRef} className="flex-1 min-w-0 order-2 lg:order-2 overflow-auto space-y-3 lg:h-full">
        {/* === 対戦順（グローバル）表示 === */}
        {viewMode === 'global' && (
          globalSortedMatches.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
              <div className="px-3 py-2 bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-white" />
                  <span className="font-bold text-white text-xs">対戦順</span>
                  <span className="text-white/70 text-[10px]">{globalSortedMatches.length}試合</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-400">
                      <th className="px-1.5 py-1.5 text-center whitespace-nowrap">#</th>
                      <th className="px-1.5 py-1.5 whitespace-nowrap">種目</th>
                      <th className="px-1 py-1.5 text-center whitespace-nowrap">G</th>
                      <th className="px-1.5 py-1.5 whitespace-nowrap">選手1</th>
                      <th className="px-0.5 py-1.5 text-center whitespace-nowrap"></th>
                      <th className="px-1.5 py-1.5 whitespace-nowrap">選手2</th>
                      <th className="px-1 py-1.5 text-center whitespace-nowrap">時間</th>
                      <th className="px-1 py-1.5 text-center whitespace-nowrap">C</th>
                      <th className="px-1 py-1.5 text-center whitespace-nowrap">状態</th>
                      <th className="px-1 py-1.5 text-center whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const availableCourtCount = courts.filter(c => c.isAvailable).length;
                      let courtNum = 1;
                      const courtAssignMap = new Map<string, string>();
                      for (const m of globalSortedMatches) {
                        if (m.status === 'playing' || m.status === 'finished') continue;
                        const hasP = !!m.player1Name && !!m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE';
                        if (!hasP) continue;
                        if (courtNum <= availableCourtCount) {
                          courtAssignMap.set(m.matchId, String(courtNum));
                          courtNum++;
                        }
                      }
                      let seqNum = 0;
                      let prevEventRound = '';
                      return globalSortedMatches.map((m) => {
                        seqNum++;
                        const st = statusLabels[m.status] || statusLabels.waiting;
                        const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
                        const eventDraw = allDraws.get(m.eventId);
                        const evTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;
                        const rName = shortRoundName(m.round, evTotalRounds);
                        const hasPlayers = !!m.player1Name && !!m.player2Name
                          && m.player1Name !== 'BYE' && m.player2Name !== 'BYE';
                        const evt = events.find(e => e.eventId === m.eventId);
                        const gameInfo = getGameCountForRound(evt, m.round, evTotalRounds);
                        const gameDisplay = gameInfo.format === 'twoSetsSuper10' ? '2S' : String(gameInfo.count);
                        const evLabel = `${shortEventName(m.eventName)} ${rName}`;
                        const schedTime = m.scheduledTime || '';
                        const sb = standbyInfo.get(m.matchId);
                        const evColor = getEventColor(m.eventName);
                        // グループ区切り線（種目+ラウンドが変わったら太線）
                        const curEventRound = `${m.eventId}|${m.round}`;
                        const isNewGroup = prevEventRound !== '' && curEventRound !== prevEventRound;
                        prevEventRound = curEventRound;
                        let statusDisplay: { text: string; color: string };
                        if (m.status === 'playing') {
                          statusDisplay = { text: '試合中', color: 'bg-green-100 text-green-700' };
                        } else if (m.status === 'finished') {
                          statusDisplay = st;
                        } else if (sb?.type === 'court') {
                          statusDisplay = { text: '次C', color: 'bg-amber-100 text-amber-700' };
                        } else if (sb?.type === 'standby') {
                          statusDisplay = { text: sb.label, color: 'bg-orange-50 text-orange-600 border border-orange-200' };
                        } else if (!hasPlayers) {
                          statusDisplay = { text: '未定', color: 'bg-gray-50 text-gray-400' };
                        } else {
                          statusDisplay = st;
                        }
                        // 状態別の背景（色付きの上に重ねる）
                        const statusBgClass =
                          m.status === 'playing' ? 'bg-green-50' :
                          m.status === 'finished' ? 'bg-gray-50/60' :
                          sb?.type === 'court' ? 'bg-amber-50/40' :
                          sb?.type === 'standby' ? 'bg-orange-50/30' : evColor.bg;
                        return (
                          <React.Fragment key={m.matchId}>
                            <tr className={`${isNewGroup ? 'border-t-2 border-t-gray-300' : 'border-b border-gray-100'} ${
                              !hasPlayers ? 'opacity-30' : ''
                            } ${statusBgClass}`}>
                              <td className="py-1.5 px-1.5 text-center font-mono text-blue-500 text-[10px] font-bold whitespace-nowrap">{seqNum}</td>
                              <td className={`py-1.5 px-1.5 text-[10px] font-semibold whitespace-nowrap ${evColor.text}`} title={evLabel}>{evLabel}</td>
                              <td className="py-1.5 px-1 text-center text-[10px] font-bold text-gray-500 whitespace-nowrap">{gameDisplay}</td>
                              <td className="py-1.5 px-1.5 whitespace-nowrap">
                                <span className="text-xs font-medium">{m.player1Name || '-'}</span>
                              </td>
                              <td className="py-1.5 px-0.5 text-center text-blue-300 text-[10px] font-bold whitespace-nowrap">vs</td>
                              <td className="py-1.5 px-1.5 whitespace-nowrap">
                                <span className="text-xs font-medium">{m.player2Name || '-'}</span>
                              </td>
                              <td className="py-1.5 px-1 text-center text-[10px] text-gray-400 whitespace-nowrap">{schedTime}</td>
                              <td className="py-1.5 px-1 text-center text-[10px] font-bold text-gray-700 whitespace-nowrap">{(() => {
                                if (m.status === 'playing' || m.status === 'finished') return courtObj?.name || '-';
                                const assignedCourt = courtAssignMap.get(m.matchId);
                                if (assignedCourt) return assignedCourt;
                                return '-';
                              })()}</td>
                              <td className="py-1.5 px-1 text-center whitespace-nowrap">
                                <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${statusDisplay.color}`}>{statusDisplay.text}</span>
                              </td>
                              <td className="py-1 px-1 text-center whitespace-nowrap">
                                <div className="flex items-center gap-0.5 justify-center">
                                  <button
                                    onClick={() => handlePrintMatch(m)}
                                    className="p-0.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-all"
                                    title="印刷"
                                  >
                                    <Printer className="w-3 h-3" />
                                  </button>
                                  {hasPlayers && m.status !== 'walkover' && (
                                    <button
                                      onClick={() => startEdit(m)}
                                      className={`p-0.5 rounded border transition-all ${
                                        m.status === 'finished'
                                          ? 'text-orange-400 border-orange-200 hover:text-orange-600 hover:bg-orange-50'
                                          : 'text-primary-400 border-primary-200 hover:text-primary-600 hover:bg-primary-50'
                                      }`}
                                      title={m.status === 'finished' ? 'スコア修正' : 'スコア入力'}
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {hasPlayers && m.status !== 'walkover' && (
                                    speakingMatchId === m.matchId ? (
                                      <button
                                        onClick={handleVoiceStop}
                                        className="p-0.5 text-red-500 bg-red-50 hover:bg-red-100 rounded border border-red-300 transition-all animate-pulse"
                                        title="停止"
                                      >
                                        <Square className="w-3 h-3" />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => toggleCallTarget(m)}
                                        className={`p-0.5 rounded border transition-all ${
                                          callTargetMatchId === m.matchId
                                            ? 'text-emerald-600 bg-emerald-50 border-emerald-300'
                                            : 'text-emerald-400 border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50'
                                        }`}
                                        title="音声コール"
                                      >
                                        <Volume2 className="w-3 h-3" />
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                            {editingMatchId === m.matchId && (
                              <tr className="bg-blue-50 border-b border-blue-200">
                                <td colSpan={10} className="px-3 py-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-gray-600">スコア:</span>
                                    <input type="number" value={editScore1} onChange={e => { setEditScore1(e.target.value); setEditTiebreak(''); }} className="w-14 px-1.5 py-1 border rounded text-center text-xs" placeholder="P1" autoFocus
                                      onKeyDown={e => { if (e.key === 'Enter') saveResult(m); if (e.key === 'Escape') cancelEdit(); }} />
                                    <span className="text-gray-400 font-bold text-xs">-</span>
                                    <input type="number" value={editScore2} onChange={e => { setEditScore2(e.target.value); setEditTiebreak(''); }} className="w-14 px-1.5 py-1 border rounded text-center text-xs" placeholder="P2"
                                      onKeyDown={e => { if (e.key === 'Enter') saveResult(m); if (e.key === 'Escape') cancelEdit(); }} />
                                    {isTiebreakScore && (
                                      <>
                                        <span className="text-[10px] text-gray-500">TB:</span>
                                        <input type="number" value={editTiebreak} onChange={e => setEditTiebreak(e.target.value)} className="w-14 px-1.5 py-1 border rounded text-center text-xs" placeholder="TB"
                                          onKeyDown={e => { if (e.key === 'Enter') saveResult(m); if (e.key === 'Escape') cancelEdit(); }} />
                                      </>
                                    )}
                                    <button onClick={() => saveResult(m)} disabled={!autoWinner} className="px-2 py-1 bg-primary-500 text-white rounded text-[10px] font-bold disabled:opacity-30">
                                      <Check className="w-3 h-3 inline mr-0.5" />確定
                                    </button>
                                    <button onClick={cancelEdit} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-[10px] font-bold">
                                      <X className="w-3 h-3 inline mr-0.5" />取消
                                    </button>
                                    {autoWinner && <span className="text-[10px] text-primary-600 font-bold">勝: {autoWinner === 1 ? m.player1Name : m.player2Name}</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {callTargetMatchId === m.matchId && (
                              <tr className="bg-emerald-50 border-b border-emerald-200">
                                <td colSpan={10} className="px-3 py-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-emerald-700">コート:</span>
                                    <select value={callCourtNumber} onChange={e => setCallCourtNumber(e.target.value)} className="px-1.5 py-1 border rounded text-xs">
                                      <option value="">選択</option>
                                      {courts.filter(c => c.isAvailable).map(c => (
                                        <option key={c.courtId} value={c.name}>{c.name}番</option>
                                      ))}
                                    </select>
                                    <button onClick={() => { if (callCourtNumber) { handleVoiceCall(m, callCourtNumber); setCallTargetMatchId(null); } }} disabled={!callCourtNumber} className="px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-bold disabled:opacity-30">
                                      <Volume2 className="w-3 h-3 inline mr-0.5" />コール
                                    </button>
                                    <button onClick={() => setCallTargetMatchId(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-[10px] font-bold">
                                      閉じる
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-border-main shadow-sm">
              <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">試合データがありません</h3>
              <p className="text-gray-500 max-w-md">
                エントリー画面で種目を確定すると、時間割順で対戦順が表示されます。
              </p>
            </div>
          )
        )}

        {/* === 種目別表示 === */}
        {viewMode === 'event' && (eventsWithMatches.length > 0 ? (
          eventsWithMatches.map(evt => {
            const eventMatchesAll = (allMatchesByEvent.get(evt.eventId) || []).filter(m => m.status !== 'walkover');
            // 実際に試合が行われるもののみカウント（BYE・対戦相手未定は除外）
            const isPlayable = (m: Match) => !!m.player1Name && !!m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE';
            const eventMatches = eventMatchesAll;
            const playableMatches = eventMatchesAll.filter(isPlayable);
            const eventDraw = allDraws.get(evt.eventId);
            const ds = eventDraw?.drawSize || 0;
            const isLeagueEvent = eventDraw?.drawType === 'roundRobin' || (ds > 0 && (ds & (ds - 1)) !== 0) || /リーグ/i.test(evt.name || '');
            const evTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;
            const finishedCount = playableMatches.filter(m => m.status === 'finished').length;
            const isActive = selectedEventId === evt.eventId;

            // ラウンド別にグループ化
            const roundGroups = new Map<number, Match[]>();
            for (const m of eventMatches) {
              if (!roundGroups.has(m.round)) roundGroups.set(m.round, []);
              roundGroups.get(m.round)!.push(m);
            }

            return (
              <div key={evt.eventId} className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
                {/* 種目ヘッダー */}
                <div
                  className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                    isActive ? 'bg-primary-500 text-white' : 'bg-gradient-to-r from-gray-50 to-white hover:from-primary-50'
                  }`}
                  onClick={() => setSelectedEventId(isActive ? '' : evt.eventId)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-600'
                    }`}>
                      <ListOrdered className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className={`text-sm font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                        {evt.name}
                      </h3>
                      <p className={`text-[10px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                        {playableMatches.length}試合 / {finishedCount}完了
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openRuleEditor(evt); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                        isActive
                          ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                          : 'bg-amber-500 text-white hover:bg-amber-600'
                      }`}
                      title="ゲームルール"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePrintEvent(evt.eventId); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                        isActive
                          ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                          : 'bg-primary-500 text-white hover:bg-primary-600'
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      印刷
                    </button>
                    {isActive
                      ? <ChevronUp className="w-4 h-4 text-white/60" />
                      : <ChevronDown className="w-4 h-4 text-gray-300" />
                    }
                  </div>
                </div>

                {/* 試合リスト - 固定列幅テーブル */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm" style={{ tableLayout: 'fixed', minWidth: '480px' }}>
                    <colgroup>
                      <col style={{ width: '36px' }} />    {/* # */}
                      <col />                              {/* Player 1 */}
                      <col style={{ width: '28px' }} />    {/* vs */}
                      <col />                              {/* Player 2 */}
                      <col style={{ width: '72px' }} />    {/* Score */}
                      <col style={{ width: '56px' }} />    {/* Status */}
                      <col style={{ width: '130px' }} />   {/* Actions */}
                    </colgroup>
                    <tbody className="text-sm">
                  {Array.from(roundGroups.entries()).map(([round, roundMatches]) => {
                    const roundLabel = isLeagueEvent ? 'リーグ戦' : getRoundName(round, evTotalRounds);
                    const rFinished = roundMatches.filter(m => m.status === 'finished').length;
                    return (
                      <React.Fragment key={round}>
                        {/* ラウンドヘッダー */}
                        <tr>
                          <td colSpan={7} className="px-0 py-0">
                            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-t border-slate-200">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-700 text-white text-[10px] font-bold">{round}</span>
                                <span className="text-xs font-bold text-slate-700 tracking-wide">{roundLabel}</span>
                                {evt.roundGameRules && evt.roundGameRules.length > 0 && (
                                  <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
                                    {(() => {
                                      const rules = evt.roundGameRules;
                                      if (rules.length === 1) return rules[0].ruleText;
                                      for (const rule of rules) {
                                        const label = rule.roundLabel;
                                        if (label === '全回戦') continue;
                                        const rm = label.match(/(\d+)～(\d+)回戦/);
                                        if (rm && round >= parseInt(rm[1]) && round <= parseInt(rm[2])) return rule.ruleText;
                                        if (label.includes('以降')) {
                                          const cl = label.replace('以降', '');
                                          if (cl.includes('準々決勝') && round >= evTotalRounds - 2) return rule.ruleText;
                                          if (cl.includes('準決勝') && round >= evTotalRounds - 1) return rule.ruleText;
                                          if (cl.includes('決勝') && !cl.includes('準') && round >= evTotalRounds) return rule.ruleText;
                                          const rn = cl.match(/(\d+)回戦/);
                                          if (rn && round >= parseInt(rn[1])) return rule.ruleText;
                                          continue;
                                        }
                                        if (roundLabel === label || label.includes(roundLabel)) return rule.ruleText;
                                      }
                                      return rules[0].ruleText;
                                    })()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="h-1.5 w-16 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                    style={{ width: roundMatches.length > 0 ? `${(rFinished / roundMatches.length) * 100}%` : '0%' }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-slate-400">{rFinished}/{roundMatches.length}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {roundMatches.map((m, idx) => {
                              const st = statusLabels[m.status] || statusLabels.waiting;
                              const isEditing = editingMatchId === m.matchId && isActive;
                              const isWinner1 = m.winnerEntryId && m.winnerEntryId === m.player1EntryId;
                              const isWinner2 = m.winnerEntryId && m.winnerEntryId === m.player2EntryId;
                              const hasPlayers = !!m.player1Name && !!m.player2Name;
                              const isWalkover = m.status === 'walkover';

                              if (isEditing) {
                                return (
                                  <tr key={m.matchId} className="border-b border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                                    <td className="py-2.5 px-2 text-center font-mono text-blue-400 text-xs font-bold">{m.matchOrder}</td>
                                    <td className="py-2.5 px-2">
                                      <div className="flex items-center gap-1">
                                        {autoWinner === 1 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`whitespace-nowrap text-sm ${autoWinner === 1 ? 'font-bold text-amber-800' : autoWinner === 2 ? 'text-gray-400' : 'font-medium'}`}>
                                          {m.player1Name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-1 text-center text-blue-300 text-xs font-bold">vs</td>
                                    <td className="py-2.5 px-2">
                                      <div className="flex items-center gap-1">
                                        {autoWinner === 2 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`whitespace-nowrap text-sm ${autoWinner === 2 ? 'font-bold text-amber-800' : autoWinner === 1 ? 'text-gray-400' : 'font-medium'}`}>
                                          {m.player2Name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2">
                                      <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max="99"
                                            value={editScore1}
                                            onChange={e => { setEditScore1(e.target.value); setEditTiebreak(''); }}
                                            placeholder="0"
                                            className="w-11 border border-blue-300 rounded-md px-1 py-1 text-sm text-center font-mono bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') saveResult(m);
                                              if (e.key === 'Escape') cancelEdit();
                                            }}
                                            autoFocus
                                          />
                                          <span className="text-blue-300 font-bold text-xs">-</span>
                                          <input
                                            type="number"
                                            min="0"
                                            max="99"
                                            value={editScore2}
                                            onChange={e => { setEditScore2(e.target.value); setEditTiebreak(''); }}
                                            placeholder="0"
                                            className="w-11 border border-blue-300 rounded-md px-1 py-1 text-sm text-center font-mono bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') saveResult(m);
                                              if (e.key === 'Escape') cancelEdit();
                                            }}
                                          />
                                        </div>
                                        {isTiebreakScore && (
                                          <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <span className="text-amber-600 font-bold">TB</span>
                                            {tiebreakLoserSide === 1 && (
                                              <>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="99"
                                                  value={editTiebreak}
                                                  onChange={e => setEditTiebreak(e.target.value)}
                                                  placeholder="0"
                                                  className="w-9 border border-amber-300 rounded-md px-1 py-0.5 text-xs text-center font-mono bg-amber-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') saveResult(m);
                                                    if (e.key === 'Escape') cancelEdit();
                                                  }}
                                                />
                                                <span className="text-gray-300">-</span>
                                                <span className="text-gray-300 w-9 text-center">-</span>
                                              </>
                                            )}
                                            {tiebreakLoserSide === 2 && (
                                              <>
                                                <span className="text-gray-300 w-9 text-center">-</span>
                                                <span className="text-gray-300">-</span>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="99"
                                                  value={editTiebreak}
                                                  onChange={e => setEditTiebreak(e.target.value)}
                                                  placeholder="0"
                                                  className="w-9 border border-amber-300 rounded-md px-1 py-0.5 text-xs text-center font-mono bg-amber-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') saveResult(m);
                                                    if (e.key === 'Escape') cancelEdit();
                                                  }}
                                                />
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2 text-center">
                                      {autoWinner ? (
                                        <span className="text-[10px] text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded-full">
                                          {autoWinner === 1 ? 'P1' : 'P2'}勝
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-blue-500 font-medium">...</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-center">
                                      <div className="flex items-center gap-1 justify-center">
                                        <button
                                          onClick={() => saveResult(m)}
                                          disabled={!autoWinner}
                                          className="p-1.5 text-white bg-emerald-500 hover:bg-emerald-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm"
                                          title="保存"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={cancelEdit} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors" title="キャンセル">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              const isCallTarget = callTargetMatchId === m.matchId;
                              const isThisSpeaking = speakingMatchId === m.matchId;

                              return (
                                <React.Fragment key={m.matchId}>
                                  <tr className={`border-b border-slate-100 transition-colors group ${
                                    isThisSpeaking
                                      ? 'bg-gradient-to-r from-amber-50 to-orange-50'
                                      : m.status === 'finished'
                                        ? 'bg-slate-50/50'
                                        : m.status === 'playing'
                                          ? 'bg-gradient-to-r from-emerald-50/50 to-transparent'
                                          : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                                  } hover:bg-primary-50/40`}>
                                    <td className="py-2.5 px-2 text-center">
                                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                                        m.status === 'finished'
                                          ? 'bg-slate-200 text-slate-500'
                                          : m.status === 'playing'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {m.matchOrder}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 overflow-hidden">
                                      <div className="flex items-center gap-1 min-w-0">
                                        {isWinner1 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`truncate ${isWinner1 ? 'font-bold text-amber-800' : isWinner2 ? 'text-gray-400' : 'font-medium text-slate-800'}`}>
                                          {m.player1Name || '(未定)'}
                                        </span>
                                        {m.player1Affiliation && (
                                          <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">({m.player1Affiliation})</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-0 text-center">
                                      <span className="text-[10px] text-slate-300 font-bold">vs</span>
                                    </td>
                                    <td className="py-2.5 px-2 overflow-hidden">
                                      <div className="flex items-center gap-1 min-w-0">
                                        {isWinner2 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`truncate ${isWinner2 ? 'font-bold text-amber-800' : isWinner1 ? 'text-gray-400' : 'font-medium text-slate-800'}`}>
                                          {m.player2Name || '(未定)'}
                                        </span>
                                        {m.player2Affiliation && (
                                          <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">({m.player2Affiliation})</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2 text-center">
                                      <span className={`font-mono text-xs ${m.status === 'finished' ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                                        {m.score || (isWalkover ? 'W.O' : '-')}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}>{st.text}</span>
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                      <div className="flex items-center gap-1 justify-center">
                                        {/* 対戦票印刷 */}
                                        <button
                                          onClick={() => handlePrintMatch(m)}
                                          className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 hover:border-blue-300 transition-all shadow-sm hover:shadow"
                                          title="対戦票印刷"
                                        >
                                          <Printer className="w-4 h-4" />
                                        </button>
                                        {/* スコア入力/修正 */}
                                        {hasPlayers && !isWalkover && (
                                          <button
                                            onClick={() => {
                                              if (!isActive) setSelectedEventId(m.eventId);
                                              startEdit(m);
                                            }}
                                            className={`p-1.5 rounded-lg border transition-all shadow-sm hover:shadow ${
                                              m.status === 'finished'
                                                ? 'text-orange-400 border-orange-200 hover:text-orange-600 hover:bg-orange-50 hover:border-orange-300'
                                                : 'text-primary-400 border-primary-200 hover:text-primary-600 hover:bg-primary-50 hover:border-primary-300'
                                            }`}
                                            title={m.status === 'finished' ? 'スコア修正' : 'スコア入力'}
                                          >
                                            <Edit3 className="w-4 h-4" />
                                          </button>
                                        )}
                                        {/* 音声コール */}
                                        {hasPlayers && !isWalkover && (
                                          isThisSpeaking ? (
                                            <button
                                              onClick={handleVoiceStop}
                                              className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-300 transition-all shadow-sm animate-pulse"
                                              title="停止"
                                            >
                                              <Square className="w-4 h-4" />
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                if (!isActive) setSelectedEventId(m.eventId);
                                                toggleCallTarget(m);
                                              }}
                                              className={`p-1.5 rounded-lg border transition-all shadow-sm hover:shadow ${
                                                isCallTarget
                                                  ? 'text-emerald-600 bg-emerald-50 border-emerald-300'
                                                  : 'text-emerald-400 border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                                              }`}
                                              title="音声コール"
                                            >
                                              <Volume2 className="w-4 h-4" />
                                            </button>
                                          )
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {isCallTarget && !isThisSpeaking && (
                                    <tr className="border-b border-emerald-200">
                                      <td colSpan={7} className="py-0 px-0">
                                        <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50">
                                          <div className="flex items-center gap-1.5">
                                            <label className="text-xs font-medium text-slate-600">コート:</label>
                                            <select
                                              value={callCourtNumber}
                                              onChange={e => setCallCourtNumber(e.target.value)}
                                              className="border border-emerald-300 rounded-md px-2 py-1 text-sm w-20 bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                            >
                                              <option value="">--</option>
                                              {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                                                <option key={n} value={String(n)}>{n}番</option>
                                              ))}
                                            </select>
                                          </div>
                                          <button
                                            onClick={() => {
                                              if (callCourtNumber) {
                                                handleVoiceCall(m, callCourtNumber);
                                                setCallTargetMatchId(null);
                                              }
                                            }}
                                            disabled={!callCourtNumber}
                                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm ${
                                              callCourtNumber
                                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-md'
                                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                          >
                                            <Play className="w-3.5 h-3.5" />
                                            コール
                                          </button>
                                          <button
                                            onClick={() => setCallTargetMatchId(null)}
                                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-auto"
                                          >
                                            閉じる
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                      </React.Fragment>
                    );
                  })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-border-main shadow-sm">
            <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">試合データがありません</h3>
            <p className="text-gray-500 max-w-md">
              ドロー画面で試合を生成すると、ここに全種目の対戦順が表示されます。
            </p>
          </div>
        ))}
      </div>

      {/* コール履歴 */}
      {callLog.length > 0 && (
        <div className="shrink-0 mt-3 bg-white rounded-xl shadow-sm border border-border-main">
          <div className="px-4 py-2 flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-border-main">
            <Volume2 className="w-4 h-4 text-primary-500" />
            コール履歴 ({callLog.length}件)
          </div>
          <div className="px-4 py-2 max-h-32 overflow-auto">
            <div className="space-y-1">
              {callLog.map((log, i) => (
                <div key={`${log.matchId}-${log.timestamp.getTime()}-${i}`} className="flex items-start gap-2 text-xs text-gray-500 py-1 border-b border-primary-50 last:border-0">
                  <span className="font-mono text-gray-900 shrink-0">
                    {log.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="bg-primary-50 text-primary-500 px-1.5 rounded shrink-0">
                    {log.courtNumber}番
                  </span>
                  <span className="truncate">{log.eventName} {log.round}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ゲームルール編集ダイアログ */}
      {editingRuleEventId && (() => {
        const ruleEvt = events.find(e => e.eventId === editingRuleEventId);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setEditingRuleEventId(null)}>
            <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  <div>
                    <h3 className="text-sm font-bold">ゲームルール編集</h3>
                    <p className="text-[10px] text-white/70">{ruleEvt?.name}</p>
                  </div>
                </div>
                <button onClick={() => setEditingRuleEventId(null)} className="p-1 rounded-lg hover:bg-white/20">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
                {editingRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex-1 space-y-2">
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">適用範囲</label>
                        <input
                          type="text"
                          value={rule.roundLabel}
                          onChange={e => {
                            const next = [...editingRules];
                            next[i] = { ...next[i], roundLabel: e.target.value };
                            setEditingRules(next);
                          }}
                          placeholder="例: 全回戦, 1～2回戦, 準決勝以降"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">ルール</label>
                        <input
                          type="text"
                          value={rule.ruleText}
                          onChange={e => {
                            const next = [...editingRules];
                            const text = e.target.value;
                            const gMatch = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)).match(/(\d+)\s*ゲーム/);
                            next[i] = { ...next[i], ruleText: text, games: gMatch ? parseInt(gMatch[1]) : next[i].games };
                            setEditingRules(next);
                          }}
                          placeholder="例: 8ゲームマッチ（8-8タイブレーク）"
                          className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-gray-500 font-medium">ゲーム数</label>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={rule.games}
                            onChange={e => {
                              const next = [...editingRules];
                              next[i] = { ...next[i], games: parseInt(e.target.value) || 6 };
                              setEditingRules(next);
                            }}
                            className="w-16 text-sm text-center border border-gray-200 rounded-lg px-2 py-1 focus:border-amber-400 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-gray-500 font-medium">方式</label>
                          <select
                            value={rule.matchFormat || 'game'}
                            onChange={e => {
                              const next = [...editingRules];
                              next[i] = { ...next[i], matchFormat: e.target.value as 'game' | 'twoSetsSuper10' };
                              setEditingRules(next);
                            }}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:border-amber-400 outline-none"
                          >
                            <option value="game">ゲームマッチ</option>
                            <option value="twoSetsSuper10">2セット+STB</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    {editingRules.length > 1 && (
                      <button
                        onClick={() => setEditingRules(editingRules.filter((_, idx) => idx !== i))}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => setEditingRules([...editingRules, { roundLabel: '', ruleText: '', games: 6 }])}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-amber-600 border border-dashed border-amber-300 rounded-xl hover:bg-amber-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  ルールを追加
                </button>
              </div>

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={() => setEditingRuleEventId(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveRules}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 shadow-sm"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
