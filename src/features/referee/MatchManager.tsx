import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { FURIGANA_SEED } from '../../db/seedData';
import { useAppStore } from '../../stores/appStore';
import { ClipboardList, ListOrdered, Printer, Trophy, Edit3, Check, X, ChevronDown, ChevronUp, Volume2, Play, Square, Megaphone, BookOpen, Plus, Trash2, Clock } from 'lucide-react';
import type { Match, Court, Event, RoundGameRule } from '../../db/database';
import type { MatchCall, VoiceSettings } from '../broadcast/types';
import { buildCallText, familyReading, familyName, kataToHira, toSpeechText } from '../broadcast/callTextBuilder';
import CallSettingsModal from '../broadcast/CallSettingsModal';
import { useGeminiTts } from '../broadcast/useGeminiTts';
import { useBulkCallStore } from '../../stores/bulkCallStore';
import type { BulkCallItem } from '../../stores/bulkCallStore';
import ScoreInputDialog from '../score/ScoreInputDialog';
import type { ScoreInputMatch } from '../score/ScoreInputDialog';
import { resolveRequiredGames } from '../score/gameRules';
import type { MatchFormatType } from '../../db/database';
import { assignStandbyInOrder } from './standbyRanking';

/** 回戦に応じたゲームルール（試合方式）を解決する */
function resolveRoundRule(evt: Event | undefined, round: number, totalRounds: number): RoundGameRule | null {
  const rules = evt?.roundGameRules;
  if (!rules || rules.length === 0) return null;
  if (rules.length === 1) return rules[0];
  const roundName = getRoundName(round, totalRounds);
  for (const rule of rules) {
    const label = rule.roundLabel;
    if (label === '全回戦') continue;
    const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
    if (rangeMatch) {
      if (round >= parseInt(rangeMatch[1]) && round <= parseInt(rangeMatch[2])) return rule;
      continue;
    }
    if (label.includes('以降')) {
      const cl = label.replace('以降', '');
      if (cl.includes('準々決勝') && round >= totalRounds - 2) return rule;
      if (cl.includes('準決勝') && round >= totalRounds - 1) return rule;
      if (cl.includes('決勝') && !cl.includes('準') && round >= totalRounds) return rule;
      const rn = cl.match(/(\d+)回戦/);
      if (rn && round >= parseInt(rn[1])) return rule;
      continue;
    }
    if (roundName === label || label.includes(roundName)) return rule;
  }
  return rules[0];
}

function getMatchGameRuleText(evt: Event | undefined, round: number, totalRounds: number): string {
  const rule = resolveRoundRule(evt, round, totalRounds);
  if (rule) return rule.ruleText;
  const g = evt?.gameRules?.games ?? 6;
  return `${g}ゲームマッチ（${g}-${g}タイブレーク）`;
}

function getMatchFormatForRound(evt: Event | undefined, round: number, totalRounds: number): MatchFormatType {
  return resolveRoundRule(evt, round, totalRounds)?.matchFormat || 'game';
}

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

type DrawSlot = { position: number; entryId: string | null; seed: number; isBye: boolean };


export default function MatchManager({ readOnly = false }: { readOnly?: boolean } = {}) {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const importedSchedule = useAppStore(state => state.importedSchedule);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'event' | 'global'>('global'); // 種目別 or 対戦順

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // コールで修正した苗字読みの上書き辞書（localStorage永続化）
  const nameReadingOverrides = useAppStore(state => state.nameReadingOverrides);
  const setNameReadingOverride = useAppStore(state => state.setNameReadingOverride);

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

  // 種目ごとの最大ラウンド（ドロー未取得時のラウンド表示フォールバック用）
  const eventMaxRound = useMemo(() => {
    const map = new Map<string, number>();
    for (const [eventId, matches] of allMatchesByEvent) {
      let mx = 1;
      for (const m of matches) if (m.round > mx) mx = m.round;
      map.set(eventId, mx);
    }
    return map;
  }, [allMatchesByEvent]);


  // イベント名の略称マッチング（正規化して比較）
  const normalizeEventName = useCallback((name: string): string => {
    return name
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
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

  // コートは現在の大会に紐づくものだけを対象にする。
  // db.courts.toArray()（全大会分）だと他大会・過去セッションの残存コートまで
  // 「空きコート」として数えてしまい、控え計算で全試合が「◯番コートへ」になり
  // 控えが一切表示されなくなる（ドロー画面の useStandbyMap は大会スコープで一致）。
  const courts = useLiveQuery(
    () => currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  // コートID ↔ コート名（番号）の相互マップ
  const courtIdToName = useMemo(() => new Map(courts.map(c => [c.courtId, c.name])), [courts]);
  const courtNameToId = useMemo(() => new Map(courts.map(c => [c.name, c.courtId])), [courts]);

  // 全試合を時間割の並び順でソート（対戦順表示用）。
  // タイムテーブル（生成/取込済みの開始時刻）がある場合はその並び（開始時刻→コート番号）を最優先し、
  // 無い場合は試合順Excel（importedSchedule）→ドロー順にフォールバックする。
  const globalSortedMatches = useMemo(() => {
    const raw: (Match & { eventName: string })[] = [];
    for (const [eventId, matches] of allMatchesByEvent) {
      const evt = events.find(e => e.eventId === eventId);
      const name = evt?.name || '';
      for (const m of matches) {
        if (m.status === 'walkover') continue;
        raw.push({ ...m, eventName: name });
      }
    }

    // 同期不整合による「幻の後半ラウンド重複」を除去する。
    // シングルエリミネーションでは同一2名は1度しか対戦しないため、同一種目内で
    // 同じ対戦カード（2名）が複数ラウンドに現れる場合は不整合とみなし、実際の対戦
    // である最小ラウンドの1件のみを残す（ドロー表どおりの表示にするため）。
    const arr: (Match & { eventName: string })[] = [];
    const bestByPair = new Map<string, Match & { eventName: string }>();
    for (const m of raw) {
      const p1 = (m.player1Name || '').trim();
      const p2 = (m.player2Name || '').trim();
      const dedupable = !isLeagueEvent(m.eventId)
        && p1 && p2 && p1 !== 'BYE' && p2 !== 'BYE';
      if (!dedupable) { arr.push(m); continue; }
      const pairKey = `${m.eventId}|${[p1, p2].sort().join('')}`;
      const cur = bestByPair.get(pairKey);
      if (!cur) {
        bestByPair.set(pairKey, m);
        arr.push(m);
      } else if (m.round < cur.round || (m.round === cur.round && (m.position || 0) < (cur.position || 0))) {
        // より小さいラウンド（実際の対戦）を採用し、既存の幻ラウンドを差し替える
        const idx = arr.indexOf(cur);
        if (idx >= 0) arr[idx] = m;
        bestByPair.set(pairKey, m);
      }
      // それ以外（既存より後半ラウンドの重複）は破棄
    }

    const toMin = (t?: string | null) => {
      if (!t) return Number.POSITIVE_INFINITY;
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : Number.POSITIVE_INFINITY;
    };

    // タイムテーブル最優先: 開始時刻が設定されている試合が1件でもあれば、
    // タイムテーブルの並び（開始時刻→対戦順(matchOrder)→ラウンド→ポジション）で表示する。
    // matchOrder が大会全体の正規の対戦順なので、控えの採番とも一致させる。
    const hasScheduledTime = arr.some(m => !!m.scheduledTime);
    if (hasScheduledTime) {
      return [...arr].sort((a, b) => {
        const ta = toMin(a.scheduledTime);
        const tb = toMin(b.scheduledTime);
        if (ta !== tb) return ta - tb;
        const oa = a.matchOrder || 9999, ob = b.matchOrder || 9999;
        if (oa !== ob) return oa - ob;
        if (a.round !== b.round) return a.round - b.round;
        return (a.position || 0) - (b.position || 0);
      });
    }

    if (importedSchedule.length === 0) {
      // 時間割未生成・開始時刻なし: 対戦順(matchOrder)で並べる
      return arr.sort((a, b) => {
        const ta = toMin(a.scheduledTime);
        const tb = toMin(b.scheduledTime);
        if (ta !== tb) return ta - tb;
        return (a.matchOrder || 9999) - (b.matchOrder || 9999);
      });
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
  }, [allMatchesByEvent, events, importedSchedule, allDraws, isLeagueEvent, matchEventName, matchRoundLabel, courtIdToName]);


  // 控え／入るコートのランキング。表示中の対戦順(globalSortedMatches)そのままで採番し、
  // 控え番号と表示位置を必ず一致させる。
  const standbyInfo = useMemo(
    () => assignStandbyInOrder(globalSortedMatches, courts),
    [globalSortedMatches, courts],
  );

  // --- 音声コール ---
  // Gemini TTS では話速・音程は「音声設定」のスタイル指示で制御するため、
  // ここでは互換のための固定値のみ保持する
  const voiceSettings: VoiceSettings = {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    repeatCount: 1,
  };
  const [callTargetMatchId, setCallTargetMatchId] = useState<string | null>(null);
  const [callCourtNumber, setCallCourtNumber] = useState('');
  // コール設定ポップアップ用の試合開始時刻（HH:MM）。標準は「指定なし」で、未指定でもコール可能。
  const [callStartTime, setCallStartTime] = useState('');
  // コール設定ポップアップ用の読み（フリガナ）。苗字・所属を漢字で表示し、その読みを個別に修正してコールする。
  // キーは漢字（苗字 or 所属）、値は読み（ひらがな）。空欄なら漢字のまま読み上げる。
  const [callNameReadings, setCallNameReadings] = useState<Record<string, string>>({});
  const [callAffReadings, setCallAffReadings] = useState<Record<string, string>>({});
  const [speakingMatchId, setSpeakingMatchId] = useState<string | null>(null);

  const { speak, stop } = useGeminiTts();

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

  // 苗字漢字 → 苗字の読み（ひらがな）の推定マップ。
  // 選手のふりがな（フルネーム連結）はスペースが無く苗字を分割できないことが多いため、
  // 同じ苗字の選手が複数いる場合、その読みの最長共通接頭辞を苗字の読みとして採用する。
  // 例: 「田中」の選手が「たなかよしひろ」「たなかまさし」→ 共通「たなか」
  const surnameReadingMap = useMemo(() => {
    // 同姓読みの最長共通接頭辞（LCP）を苗字の読みとして採用するヘルパー。
    // 異なる読みが2種以上ある場合のみ採用（1種だと名前まで含む可能性がある）。
    const lcpOf = (readings: string[]): string => {
      if (readings.length < 2) return '';
      let lcp = readings[0];
      for (const r of readings) {
        let i = 0;
        while (i < lcp.length && i < r.length && lcp[i] === r[i]) i++;
        lcp = lcp.slice(0, i);
        if (!lcp) break;
      }
      const distinct = new Set(readings);
      return (lcp.length >= 1 && distinct.size >= 2) ? lcp : '';
    };

    // 1) 現在の選手群から推定
    const groups = new Map<string, string[]>();
    for (const p of players) {
      const surname = familyName(p.name);
      const reading = kataToHira((p.furigana || '').trim());
      if (!surname || !reading) continue;
      const arr = groups.get(surname);
      if (arr) arr.push(reading); else groups.set(surname, [reading]);
    }
    const map: Record<string, string> = {};
    for (const [surname, readings] of groups) {
      const lcp = lcpOf(readings);
      if (lcp) map[surname] = lcp;
    }

    // 2) 未解決の苗字を全国名簿(FURIGANA_SEED)から解決する。
    // シードは「漢字フルネーム(スペース無)」→「かなフルネーム(スペース無)」。
    // 対象の苗字で前方一致する同姓者を集め、その読みのLCPを苗字読みとする。
    const need = new Set<string>();
    for (const p of players) {
      const s = familyName(p.name);
      if (s && !map[s]) need.add(s);
    }
    for (const s of need) {
      const readings: string[] = [];
      for (const [name, furi] of FURIGANA_SEED) {
        if (name.length > s.length && name.startsWith(s)) readings.push(kataToHira(furi));
      }
      const lcp = lcpOf(readings);
      if (lcp) map[s] = lcp;
    }
    return map;
  }, [players]);

  // entryId → ドロー番号（コールの番号と同じ slot.position）。
  const getDrawNumber = useCallback((entryId: string | null, eventId?: string): number => {
    if (!entryId) return 0;
    const draw = eventId ? allDraws.get(eventId) : undefined;
    if (!draw?.slots) return 0;
    const slot = (draw.slots as DrawSlot[]).find(s => s.entryId === entryId);
    if (slot) return slot.position ?? 0;
    // entryId がずれている場合は playerId で照合
    const entry = allEntries.find(e => e.entryId === entryId);
    if (entry) {
      for (const s of draw.slots as DrawSlot[]) {
        if (!s.entryId) continue;
        const se = allEntries.find(e => e.entryId === s.entryId);
        if (se && se.playerId === entry.playerId) return s.position ?? 0;
      }
    }
    return 0;
  }, [allDraws, allEntries]);

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
      // まずは entryId で直接一致
      const slot = draw.slots.find((s: DrawSlot) => s.entryId === entryId);
      if (slot) return slot.position ?? 0;
      // フォールバック: entryId が一致しない（再抽選等でIDがずれた）場合は playerId で照合
      const entry = entries.find(e => e.entryId === entryId) || allEntries.find(e => e.entryId === entryId);
      if (entry) {
        for (const s of draw.slots as DrawSlot[]) {
          if (!s.entryId) continue;
          const se = entries.find(e => e.entryId === s.entryId) || allEntries.find(e => e.entryId === s.entryId);
          if (se && se.playerId === entry.playerId) return s.position ?? 0;
        }
      }
      return 0;
    };

    // 苗字の読み（ひらがな）を取得。ふりがなにスペースがあればそこから、
    // 無ければ同姓の共通接頭辞マップから推定する（表示は「漢字（かな）」）。
    // 一度コールで修正した苗字読みは最優先で使用する（ふりがな自動推定より優先）。
    const resolveSurnameReading = (kanjiName: string, furigana: string) =>
      nameReadingOverrides[familyName(kanjiName)] || familyReading(furigana) || surnameReadingMap[familyName(kanjiName)] || '';

    // 名前は漢字（フルネーム）、所属も漢字で返す。
    const resolveFurigana = (entryId: string | null, fallbackName: string, fallbackAff: string) => {
      if (!entryId) return { name: fallbackName, reading: resolveSurnameReading(fallbackName, ''), aff: fallbackAff };
      const entry = entries.find(e => e.entryId === entryId) || allEntries.find(e => e.entryId === entryId);
      if (!entry) return { name: fallbackName, reading: resolveSurnameReading(fallbackName, ''), aff: fallbackAff };
      const player = players.find(p => p.playerId === entry.playerId);
      if (!player) return { name: fallbackName, reading: resolveSurnameReading(fallbackName, ''), aff: fallbackAff };
      return { name: player.name || fallbackName, reading: resolveSurnameReading(player.name || fallbackName, player.furigana), aff: player.affiliation || fallbackAff };
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

      let partnerA = { name: fallbackPairNameA.trim(), reading: '', aff: fallbackPairAffA.trim() };
      let partnerB = { name: fallbackPairNameB.trim(), reading: '', aff: fallbackPairAffB.trim() };

      if (m.player1EntryId) {
        const entry1 = entries.find(e => e.entryId === m.player1EntryId) || allEntries.find(e => e.entryId === m.player1EntryId);
        if (entry1?.partnerId) {
          const partner = players.find(p => p.playerId === entry1.partnerId);
          if (partner) partnerA = { name: partner.name, reading: resolveSurnameReading(partner.name, partner.furigana), aff: partner.affiliation };
        }
      }
      if (m.player2EntryId) {
        const entry2 = entries.find(e => e.entryId === m.player2EntryId) || allEntries.find(e => e.entryId === m.player2EntryId);
        if (entry2?.partnerId) {
          const partner = players.find(p => p.playerId === entry2.partnerId);
          if (partner) partnerB = { name: partner.name, reading: resolveSurnameReading(partner.name, partner.furigana), aff: partner.affiliation };
        }
      }

      return {
        id: m.id || 0,
        eventName: useEvent?.name || '',
        round: `${roundName} #${m.position}`,
        numberA: getPos(m.player1EntryId, m.eventId),
        nameA: p1.name,
        affA: p1.aff,
        nameAReading: p1.reading,
        pairNameA: partnerA.name,
        pairAffA: partnerA.aff,
        pairNameAReading: partnerA.reading,
        numberB: getPos(m.player2EntryId, m.eventId),
        nameB: p2.name,
        affB: p2.aff,
        nameBReading: p2.reading,
        pairNameB: partnerB.name,
        pairAffB: partnerB.aff,
        pairNameBReading: partnerB.reading,
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
        nameAReading: p1.reading,
        numberB: getPos(m.player2EntryId, m.eventId),
        nameB: p2.name,
        affB: p2.aff,
        nameBReading: p2.reading,
        type: 'singles',
        status: 'pending',
        courtNumber: courtNum,
        startTime: m.scheduledTime || '',
      };
    }
  }, [drawData, allDraws, entries, allEntries, players, currentEvent, totalRounds, affiliationFuriganaMap, surnameReadingMap, nameReadingOverrides]);

  // コール実行
  // startTimeOverride を指定した場合はその開始時刻でコールする（ポップアップからの指定）。
  // 開始時刻は任意（標準は「指定なし」）で、未指定でもコール可能。
  // textOverride を指定した場合は、その修正済みテキストでコールする（ポップアップで編集した内容）。
  const handleVoiceCall = useCallback((m: Match, courtNum: string, startTimeOverride?: string, textOverride?: string) => {
    if (!courtNum) return;
    const startTime = startTimeOverride ?? m.scheduledTime ?? '';
    // グローバル表示でも正しくイベント・ラウンド数を解決
    const evt = events.find(e => e.eventId === m.eventId) || currentEvent;
    const evDraw = allDraws.get(m.eventId);
    const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : totalRounds;
    const matchCall = buildMatchCall(m, courtNum, evt, evTotalRounds);
    if (!matchCall) return;

    // ポップアップで確定したコート・開始時刻を試合へ反映（次回以降も同じコートでコール可能に）
    if (m.id != null) {
      const resolvedCourtId = courtNameToId.get(courtNum) || m.courtId || null;
      if (resolvedCourtId !== m.courtId || startTime !== (m.scheduledTime || '')) {
        db.matches.update(m.id, {
          courtId: resolvedCourtId,
          scheduledTime: startTime,
          updatedAt: Date.now(),
        }).catch(() => { /* 反映失敗は無視（コールは続行） */ });
      }
    }

    // 修正済みテキスト（漢字（かな）注釈付き）があればそれを優先。無ければ通常どおり生成。
    const text = (textOverride && textOverride.trim())
      ? textOverride.trim()
      : buildCallText(matchCall, courtNum, startTime, affiliationFuriganaMap);
    setSpeakingMatchId(m.matchId);

    // 実際の読み上げは「漢字（かな）」→かな へ変換したテキストを使う
    speak(toSpeechText(text), voiceSettings, () => {
      setSpeakingMatchId(null);
    });
  }, [buildMatchCall, speak, voiceSettings, affiliationFuriganaMap, currentEvent, totalRounds, events, allDraws, courtNameToId]);

  // コール停止
  const handleVoiceStop = useCallback(() => {
    stop();
    setSpeakingMatchId(null);
  }, [stop]);

  // コール設定ポップアップを開く（どの導線から押しても必ずポップアップを表示）
  // 既にコートが決まっていればそのコートを初期選択し、開始時刻も引き継ぐ（どちらも修正可）。
  const openCallModal = useCallback((m: Match) => {
    setCallTargetMatchId(m.matchId);
    setCallCourtNumber(m.courtId ? (courtIdToName.get(m.courtId) || '') : '');
    // 開始時刻の標準は「指定なし」（空欄）。9:00等の既定値は入れない。
    setCallStartTime('');

    // 苗字・所属の読み（フリガナ）の初期値を用意する。コートに依存しないため '0' で生成。
    const evt = events.find(e => e.eventId === m.eventId) || currentEvent;
    const evDraw = allDraws.get(m.eventId);
    const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : totalRounds;
    const mc = buildMatchCall(m, '0', evt, evTotalRounds);
    const nameMap: Record<string, string> = {};
    const affMap: Record<string, string> = {};
    if (mc) {
      const addName = (full: string | undefined, reading: string | undefined) => {
        const s = familyName(full || '');
        if (s && !(s in nameMap)) nameMap[s] = reading || '';
      };
      const addAff = (aff: string | undefined) => {
        const a = (aff || '').trim();
        if (a && !(a in affMap)) affMap[a] = affiliationFuriganaMap[a] || '';
      };
      addName(mc.nameA, mc.nameAReading);
      addName(mc.nameB, mc.nameBReading);
      addAff(mc.affA);
      addAff(mc.affB);
      if (mc.type === 'doubles') {
        addName(mc.pairNameA, mc.pairNameAReading);
        addName(mc.pairNameB, mc.pairNameBReading);
        addAff(mc.pairAffA);
        addAff(mc.pairAffB);
      }
    }
    setCallNameReadings(nameMap);
    setCallAffReadings(affMap);
  }, [courtIdToName, events, currentEvent, allDraws, totalRounds, buildMatchCall, affiliationFuriganaMap]);

  // コール設定ポップアップを閉じる
  const closeCallModal = useCallback(() => {
    setCallTargetMatchId(null);
    setCallCourtNumber('');
    setCallStartTime('');
    setCallNameReadings({});
    setCallAffReadings({});
  }, []);

  // 修正済みの読み（フリガナ）からコール読み上げテキストを生成する。
  const buildCallTextFromReadings = useCallback((
    m: Match,
    court: string,
    startTime: string,
    nameReadings: Record<string, string>,
    affReadings: Record<string, string>,
  ): string => {
    const evt = events.find(e => e.eventId === m.eventId) || currentEvent;
    const evDraw = allDraws.get(m.eventId);
    const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : totalRounds;
    const mc = buildMatchCall(m, court, evt, evTotalRounds);
    if (!mc) return '';
    // 苗字ごとの読みを反映（空欄は既定の推定読みを使う）
    const nr = (full: string | undefined, fallback: string | undefined): string => {
      const s = familyName(full || '');
      const v = s ? nameReadings[s] : '';
      return v && v.trim() ? v.trim() : (fallback || '');
    };
    const withReadings = {
      ...mc,
      nameAReading: nr(mc.nameA, mc.nameAReading),
      nameBReading: nr(mc.nameB, mc.nameBReading),
      pairNameAReading: nr(mc.pairNameA || '', mc.pairNameAReading || ''),
      pairNameBReading: nr(mc.pairNameB || '', mc.pairNameBReading || ''),
    };
    // 所属ごとの読みを反映（空欄は漢字のまま）
    const affMap = { ...affiliationFuriganaMap };
    for (const [k, v] of Object.entries(affReadings)) {
      if (v && v.trim()) affMap[k] = v.trim();
    }
    return buildCallText(withReadings, court, startTime, affMap);
  }, [events, currentEvent, allDraws, totalRounds, buildMatchCall, affiliationFuriganaMap]);

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

    const isReal = (m: Match) =>
      (m.status === 'waiting' || m.status === 'ready')
      && !!m.player1Name && !!m.player2Name
      && m.player1Name !== 'BYE' && m.player2Name !== 'BYE';
    const toMin = (t?: string | null) => {
      if (!t) return Number.POSITIVE_INFINITY;
      const mm = t.match(/^(\d{1,2}):(\d{2})$/);
      return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : Number.POSITIVE_INFINITY;
    };

    // ドロー開始時刻を最優先で「初回」を決める。
    // globalSortedMatches は (開始時刻→対戦順) でソート済み。
    const realWaiting = globalSortedMatches.filter(isReal);
    // 記載された開始時刻のうち最も早い時刻（=初回に始めるべき試合の時刻）
    const finiteTimes = realWaiting.map(m => toMin(m.scheduledTime)).filter(t => Number.isFinite(t));
    const earliest = finiteTimes.length > 0 ? Math.min(...finiteTimes) : null;
    // 初回に起動する対象:
    // - 開始時刻あり: 最早時刻の試合のみ（例: 9:00の試合だけ。9:40はまだ起動しない）
    // - 開始時刻なし（時間割未生成）: 対戦順の上からコート数分
    const candidates = earliest != null
      ? realWaiting.filter(m => toMin(m.scheduledTime) === earliest)
      : realWaiting;

    // コート割当: 各試合は自分の割当コート(courtId)を優先し、無ければ番号の若い空きコートへ。
    // 対戦順の若い順に割り当てるため、最早時刻の試合が確実にコートを確保できる。
    const nameById = new Map(courts.map(c => [c.courtId, c.name]));
    const courtByName = new Map(availableCourts.map(c => [c.name, c]));
    const freeCourtNames = new Set(availableCourts.map(c => c.name));
    const nextFreeCourtName = () =>
      [...freeCourtNames].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))[0];

    const assignments: { match: Match & { eventName: string }; court: Court }[] = [];
    for (const m of candidates) {
      if (freeCourtNames.size === 0) break;
      const ownName = m.courtId ? nameById.get(m.courtId) : undefined;
      const name = (ownName && freeCourtNames.has(ownName)) ? ownName : nextFreeCourtName();
      const court = courtByName.get(name);
      if (court) {
        assignments.push({ match: m, court });
        freeCourtNames.delete(name);
      }
    }

    if (assignments.length === 0) { alert('割り当てる試合がありません。'); return; }

    const confirmed = confirm(
      `${assignments.length}試合にコートを割り当てて試合開始にします。\n\n` +
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

  // 現在試合中のコート名（空きコート判定用）
  const playingCourtNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatchesFlat) {
      if (m.status === 'playing' && m.courtId) {
        const n = courtIdToName.get(m.courtId);
        if (n) set.add(n);
      }
    }
    return set;
  }, [allMatchesFlat, courtIdToName]);

  // 空きコート（使用可能で試合中でない）を番号順に
  const emptyCourts = useMemo(() => {
    return courts
      .filter(c => c.isAvailable && !playingCourtNames.has(c.name))
      .sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0));
  }, [courts, playingCourtNames]);

  // 待機試合を指定コートに入れる（試合開始）
  const handleEnterCourt = useCallback(async (matchId: string, courtId: string) => {
    const m = allMatchesFlat.find(mm => mm.matchId === matchId);
    if (!m?.id) return;
    await db.matches.update(m.id, {
      courtId,
      status: 'playing',
      updatedAt: Date.now(),
    });
    setCourtPickMatchId(null);
  }, [allMatchesFlat]);

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
      // 一斉コールは編集画面が無いため、読み上げ用（かな）テキストをそのまま格納する
      const text = toSpeechText(buildCallText(matchCall, courtNum, m.scheduledTime || '', affiliationFuriganaMap, true));

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
  // 対戦順カードのタップで開くスコア入力ポップアップの対象
  const [scoreDialogMatchId, setScoreDialogMatchId] = useState<string | null>(null);
  // 対戦順（グローバル）タブ: 進行中 / 終了 の切替
  const [globalTab, setGlobalTab] = useState<'active' | 'finished'>('active');
  // 待機カードのタップで開く「コートに入れる」ポップアップの対象
  const [courtPickMatchId, setCourtPickMatchId] = useState<string | null>(null);
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

    // 試合終了時は空いたコートを自動では埋めず、空きコートとして残す。
    // 空きが出た次の控え（控え1）はオレンジ点滅で「入れる」状態になり、
    // 審判/運営がタップして手動でコートに入れる運用にする。

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

    /** 回戦に応じた熱中症警戒時ルール文字列（無ければ空） */
    const getHeatMethodForRound = (round: number): string => {
      const rules = evt?.roundGameRules;
      if (!rules || rules.length === 0) return '';
      const pick = (): RoundGameRule => {
        if (rules.length === 1) return rules[0];
        const roundN = getRoundName(round, eventTotalRounds);
        let chosen = rules[0];
        for (const rule of rules) {
          const label = rule.roundLabel;
          if (label === '全回戦') continue;
          const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
          if (rangeMatch) { if (round >= parseInt(rangeMatch[1]) && round <= parseInt(rangeMatch[2])) { chosen = rule; break; } continue; }
          if (label.includes('以降')) {
            const cl = label.replace('以降', '');
            if (cl.includes('準々決勝') && round >= eventTotalRounds - 2) { chosen = rule; break; }
            if (cl.includes('準決勝') && round >= eventTotalRounds - 1) { chosen = rule; break; }
            if (cl.includes('決勝') && !cl.includes('準') && round >= eventTotalRounds) { chosen = rule; break; }
            const rn = cl.match(/(\d+)回戦/);
            if (rn && round >= parseInt(rn[1])) { chosen = rule; break; }
            continue;
          }
          if (roundN === label || label.includes(roundN)) { chosen = rule; break; }
        }
        return chosen;
      };
      const matched = pick();
      if (matched.heatRuleText && matched.heatRuleText.trim()) return stripRoundPrefix(matched.heatRuleText.trim());
      if (matched.heatGames) return `${matched.heatGames}ゲームマッチ`;
      return '';
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
        ${getGameMethodForRound(m.round)}${(() => { const h = getHeatMethodForRound(m.round); return h ? `<div style="color:#c00;font-size:12px;line-height:1.2;margin-top:2px;">🌡熱中症警戒時<br>${h}</div>` : ''; })()}
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
    let heatMethod = '';
    if (rules2 && rules2.length > 0) {
      const pickRule = (): RoundGameRule => {
        if (rules2.length === 1) return rules2[0];
        const rn2 = getRoundName(m.round, eventTotalRounds);
        let chosen = rules2[0];
        for (const rule of rules2) {
          const label = rule.roundLabel;
          if (label === '全回戦') continue;
          const rm = label.match(/(\d+)～(\d+)回戦/);
          if (rm) { if (m.round >= parseInt(rm[1]) && m.round <= parseInt(rm[2])) { chosen = rule; break; } continue; }
          if (label.includes('以降')) {
            const cl = label.replace('以降', '');
            if (cl.includes('準々決勝') && m.round >= eventTotalRounds - 2) { chosen = rule; break; }
            if (cl.includes('準決勝') && m.round >= eventTotalRounds - 1) { chosen = rule; break; }
            if (cl.includes('決勝') && !cl.includes('準') && m.round >= eventTotalRounds) { chosen = rule; break; }
            const rn3 = cl.match(/(\d+)回戦/);
            if (rn3 && m.round >= parseInt(rn3[1])) { chosen = rule; break; }
            continue;
          }
          if (rn2 === label || label.includes(rn2)) { chosen = rule; break; }
        }
        return chosen;
      };
      const matched = pickRule();
      gameMethod = stripRoundPrefix(matched.ruleText);
      if (matched.heatRuleText && matched.heatRuleText.trim()) heatMethod = stripRoundPrefix(matched.heatRuleText.trim());
      else if (matched.heatGames) heatMethod = `${matched.heatGames}ゲームマッチ`;
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
<tr style="height:${rh[7]};"><td colspan="6" rowspan="2" class="fg bl2 bt br bb2" style="text-align:center;font-size:16px;height:calc(${rh[7]}+${rh[8]});">コート№</td><td colspan="6" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:36px;font-weight:bold;">${courtDisplay}</td><td colspan="5" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:16px;">試合方法</td><td colspan="9" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:18px;white-space:pre-line;line-height:1.3;">${gameMethod}${heatMethod ? `<div style="color:#c00;font-size:12px;line-height:1.2;margin-top:2px;">🌡熱中症警戒時<br>${heatMethod}</div>` : ''}</td><td colspan="5" rowspan="2" class="fg bt br bb2" style="text-align:center;font-size:16px;">開始時間</td><td colspan="7" rowspan="2" class="fg bt br2 bb2" style="text-align:center;font-size:22px;font-weight:bold;">${m.scheduledTime || ''}</td></tr><tr style="height:${rh[8]};"></tr>
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
    // コンテナ内スクロール（デスクトップ）とウィンドウスクロール（モバイル）の両方に対応
    let lastContainerY = 0;
    let lastWindowY = window.scrollY;
    const onContainerScroll = () => {
      const y = el ? el.scrollTop : 0;
      if (y > 20 && y > lastContainerY) setControlsOpen(false);
      lastContainerY = y;
    };
    const onWindowScroll = () => {
      const y = window.scrollY;
      if (y > 20 && y > lastWindowY) setControlsOpen(false);
      lastWindowY = y;
    };
    el?.addEventListener('scroll', onContainerScroll, { passive: true });
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    return () => {
      el?.removeEventListener('scroll', onContainerScroll);
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, []);

  // 試合経過時間の表示用に現在時刻を定期更新（30秒ごと）
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
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
      {/* LEFT: コントロールパネル（観戦用は非表示） */}
      {!readOnly && (
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
            {/* コール中の停止操作は画面下部の固定ポップアップから行う */}
          </div>
        </div>
      </div>
      )}

      {/* RIGHT: メインコンテンツ */}
      <div ref={matchContentRef} className="flex-1 min-w-0 order-2 lg:order-2 overflow-auto space-y-3 lg:h-full pb-28 [padding-bottom:calc(7rem_+_env(safe-area-inset-bottom))]">
        {/* === 対戦順（グローバル）表示 === */}
        {viewMode === 'global' && (
          globalSortedMatches.length > 0 ? (
            <div className="space-y-2">
                {/* 進行中 / 終了 タブ（終了した試合は別タブで管理） */}
                <div className="flex rounded-lg border border-border-main overflow-hidden text-sm w-full sticky top-0 z-10">
                  <button onClick={() => setGlobalTab('active')}
                    className={`flex-1 px-3 py-1.5 font-bold transition-colors ${globalTab === 'active' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    進行中（{globalSortedMatches.filter(m => m.status !== 'finished').length}）
                  </button>
                  <button onClick={() => setGlobalTab('finished')}
                    className={`flex-1 px-3 py-1.5 font-bold transition-colors ${globalTab === 'finished' ? 'bg-gray-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    終了（{globalSortedMatches.filter(m => m.status === 'finished').length}）
                  </button>
                </div>
                {(() => {
                  const activeMatches = globalSortedMatches.filter(m => m.status !== 'finished');
                  const finishedMatches = globalSortedMatches.filter(m => m.status === 'finished');
                  // 進行中タブ=未終了、終了タブ=終了した試合のみ（混在させない）
                  const shown = globalTab === 'finished' ? finishedMatches : activeMatches;

                  if (shown.length === 0) {
                    return (
                      <div className="text-center text-sm text-gray-400 py-10">
                        {globalTab === 'finished' ? '終了した試合はまだありません。' : '進行中・待機中の試合はありません。'}
                      </div>
                    );
                  }

                  const renderPlayer = (num: number, name: string, affiliation: string, isWinner: boolean, dim: boolean) => (
                    <div className="min-w-0 flex-1 text-center">
                      <div className="flex items-baseline justify-center gap-1 min-w-0">
                        {num > 0 && <span className="text-sm font-mono font-bold text-blue-400 shrink-0">{num}</span>}
                        <span className={`text-sm leading-tight truncate ${isWinner ? 'font-bold text-primary-700' : dim ? 'font-medium text-gray-500' : 'font-semibold text-gray-900'}`} title={name}>
                          {name || '-'}
                        </span>
                      </div>
                      {affiliation && affiliation !== 'BYE' && (
                        <div className="text-[10px] leading-tight text-gray-500 truncate" title={affiliation}>{affiliation}</div>
                      )}
                    </div>
                  );

                  return shown.map((m) => {
                    const st = statusLabels[m.status] || statusLabels.waiting;
                    const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
                    const eventDraw = allDraws.get(m.eventId);
                    const evTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : Math.max(1, eventMaxRound.get(m.eventId) || 1);
                    const rName = shortRoundName(m.round, evTotalRounds);
                    const hasPlayers = !!m.player1Name && !!m.player2Name
                      && m.player1Name !== 'BYE' && m.player2Name !== 'BYE';
                    const evLabel = `${shortEventName(m.eventName)} ${rName}`;
                    const schedTime = m.scheduledTime || '';
                    const sb = standbyInfo.get(m.matchId);
                    const evColor = getEventColor(m.eventName);
                    const isPlaying = m.status === 'playing';
                    const isFinished = m.status === 'finished';

                    // 空きコートが割り当たった（対戦順で若い順に）試合は枠のみ点滅させ、入るコートを表示する。
                    const enterCourtName = sb?.enterCourtName || null;

                    let statusDisplay: { text: string; color: string };
                    if (isPlaying) {
                      statusDisplay = { text: '試合中', color: 'bg-green-100 text-green-700' };
                    } else if (isFinished) {
                      statusDisplay = st;
                    } else if (!hasPlayers) {
                      statusDisplay = { text: '未定', color: 'bg-gray-50 text-gray-400' };
                    } else {
                      statusDisplay = st;
                    }

                    // 中央上のコートバッジ:
                    // - 試合中/終了 → コート番号
                    // - コート確定後は大会全体で対戦順の上から「控え1〜5」を表示（全体で5試合）。
                    //   空きコートが出て入れる状態のものはオレンジ表示（タップで入れる）。
                    let centerBadge: { text: string; color: string } | null = null;
                    if ((isPlaying || isFinished) && courtObj?.name) {
                      centerBadge = { text: `${courtObj.name}番コート`, color: isPlaying ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600' };
                    } else if (hasPlayers && enterCourtName) {
                      // 空きコートに入れる（控え番号があれば併記）
                      centerBadge = { text: sb?.standbyLabel ? `${sb.standbyLabel}・入る` : '▶ コートに入る', color: 'bg-orange-500 text-white' };
                    } else if (hasPlayers && sb?.standbyLabel) {
                      centerBadge = { text: sb.standbyLabel, color: 'bg-amber-500 text-white' };
                    }

                    // カード枠の配色:
                    // - 試合中: 緑枠点滅
                    // - 空きコートに入れる（コート確定後・空き発生）: オレンジ枠点滅（タップで入れる）
                    // - 控え1〜5: 青ベースのカード
                    // - それ以外の待機: 通常カード
                    const cardClass = isFinished
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : isPlaying
                        ? 'bg-green-50 border-2 border-green-500 bracket-card-blink'
                        : !hasPlayers
                          ? 'bg-white border-gray-200 opacity-50'
                          : enterCourtName
                            ? 'bg-orange-50 border-2 border-orange-400 enter-court-orange-blink'
                            : sb?.standbyLabel
                              ? 'bg-blue-50 border-2 border-blue-300'
                              : `${evColor.bg} border-gray-200`;

                    const w1 = isFinished && !!m.winnerEntryId && m.winnerEntryId === m.player1EntryId;
                    const w2 = isFinished && !!m.winnerEntryId && m.winnerEntryId === m.player2EntryId;
                    const num1 = getDrawNumber(m.player1EntryId, m.eventId);
                    const num2 = getDrawNumber(m.player2EntryId, m.eventId);
                    const evt = events.find(e => e.eventId === m.eventId);
                    const canEditResult = hasPlayers && m.status !== 'walkover';
                    let elapsedLabel = '';
                    if (isPlaying && m.updatedAt) {
                      const mins = Math.max(0, Math.floor((now - m.updatedAt) / 60000));
                      const h = Math.floor(mins / 60);
                      const mm = mins % 60;
                      elapsedLabel = h > 0 ? `${h}時間${mm}分` : `${mm}分`;
                    }

                    // タップ動作:
                    // - 試合中/終了(編集可) → スコア入力
                    // - 待機中(コートに入っていない) → コートに入れる/控え変更ポップアップ
                    const isWaitingEnterable = !readOnly && hasPlayers && !isPlaying && !isFinished && m.status !== 'walkover';
                    const onCardClick = () => {
                      if (readOnly) return;
                      if (isPlaying || isFinished) {
                        if (canEditResult) setScoreDialogMatchId(m.matchId);
                      } else if (isWaitingEnterable) {
                        setCourtPickMatchId(m.matchId);
                      }
                    };
                    const clickable = !readOnly && ((isPlaying || isFinished) ? canEditResult : isWaitingEnterable);

                    return (
                      <React.Fragment key={m.matchId}>
                        <div
                          onClick={onCardClick}
                          className={`rounded-lg border p-2 transition-all ${cardClass} ${clickable ? 'cursor-pointer' : ''}`}
                        >
                          {/* ヘッダー行: クラス(左)・コート(中央)・状態(右) */}
                          <div className="relative flex items-center gap-1.5 mb-1.5 min-h-[20px]">
                            <span className={`text-[11px] font-bold truncate ${evColor.text}`} title={evLabel}>{evLabel}</span>
                            <div className="flex-1" />
                            {centerBadge && (
                              <span className={`absolute left-1/2 -translate-x-1/2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shadow-sm ${centerBadge.color}`}>
                                {centerBadge.text}
                              </span>
                            )}
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap shrink-0 ${statusDisplay.color}`}>{statusDisplay.text}</span>
                          </div>
                          {/* 選手（横並び・各エリア中央寄せ） */}
                          <div className="flex items-start gap-2">
                            {renderPlayer(num1, m.player1Name, m.player1Affiliation, w1, isFinished)}
                            <div className="flex flex-col items-center justify-center shrink-0 pt-0.5 min-w-[32px]">
                              <span className="text-base font-bold text-blue-300 leading-none">vs</span>
                              {isFinished && m.score && <span className="text-[9px] font-mono font-bold text-gray-500 leading-tight mt-0.5">{m.score}</span>}
                            </div>
                            {renderPlayer(num2, m.player2Name, m.player2Affiliation, w2, isFinished)}
                          </div>
                          {/* フッター行: 開始時刻(左)・経過時間(中央)・操作ボタン(右) */}
                          <div className="relative flex items-center gap-2 mt-1.5 pl-1 min-h-[36px]">
                            {schedTime && <span className="text-[10px] text-gray-400 font-mono">{schedTime}</span>}
                            <div className="flex-1" />
                            {elapsedLabel && (
                              <span className="absolute left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-bold font-mono">
                                <Clock className="w-3 h-3" />
                                {elapsedLabel}
                              </span>
                            )}
                            {!readOnly && (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handlePrintMatch(m)}
                                className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-all"
                                title="印刷"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {evt && (
                                <button
                                  onClick={() => openRuleEditor(evt)}
                                  className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200 transition-all"
                                  title="試合ルール"
                                >
                                  <BookOpen className="w-4 h-4" />
                                </button>
                              )}
                              {hasPlayers && m.status !== 'walkover' && (
                                <button
                                  onClick={() => openCallModal(m)}
                                  className={`p-1.5 rounded-lg border transition-all ${
                                    callTargetMatchId === m.matchId
                                      ? 'text-emerald-600 bg-emerald-50 border-emerald-300'
                                      : 'text-emerald-400 border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title="音声コール"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()}
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
                                                openCallModal(m);
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

      {/* コール中の固定ポップアップ（画面下部・点滅表示） */}
      {speakingMatchId && (() => {
        const sm = allMatchesFlat.find(mm => mm.matchId === speakingMatchId);
        if (!sm) return null;
        const evt = events.find(e => e.eventId === sm.eventId);
        const evDraw = allDraws.get(sm.eventId);
        const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : 1;
        const roundName = getRoundName(sm.round, evTotalRounds);
        const courtName = sm.courtId ? (courtIdToName.get(sm.courtId) || '') : '';
        return (
          <div className="fixed inset-x-0 bottom-0 z-[9998] flex justify-center px-3 pb-3 pointer-events-none">
            {/* 枠のみ点滅・背景は半透明・赤ベース */}
            <div className="pointer-events-auto w-full max-w-lg rounded-xl border-2 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden call-popup-blink">
              <div className="flex items-center gap-3 bg-gradient-to-r from-red-600/90 to-rose-600/90 px-4 py-2">
                <div className="relative shrink-0">
                  <Megaphone className="w-5 h-5 text-white" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold">
                    コール中{courtName ? ` ・ ${courtName}番コート` : ''}
                  </p>
                  <p className="text-white/90 text-[11px] truncate">
                    {evt?.name || ''} {roundName}
                  </p>
                </div>
                <button
                  onClick={handleVoiceStop}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/25 hover:bg-white/40 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                  停止
                </button>
              </div>
              <div className="flex items-center justify-center gap-3 px-4 py-3 text-center bg-red-50/70">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{sm.player1Name || '-'}</p>
                  {sm.player1Affiliation && sm.player1Affiliation !== 'BYE' && (
                    <p className="text-[10px] text-gray-500 truncate">{sm.player1Affiliation}</p>
                  )}
                </div>
                <span className="text-xs font-bold text-red-500 shrink-0">vs</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{sm.player2Name || '-'}</p>
                  {sm.player2Affiliation && sm.player2Affiliation !== 'BYE' && (
                    <p className="text-[10px] text-gray-500 truncate">{sm.player2Affiliation}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                      {/* 熱中症警戒アラート時の試合形式（任意） */}
                      <div className="mt-1 pt-2 border-t border-dashed border-red-200 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-red-600">🌡 熱中症警戒時の試合形式（任意）</span>
                        </div>
                        <input
                          type="text"
                          value={rule.heatRuleText ?? ''}
                          onChange={e => {
                            const next = [...editingRules];
                            const text = e.target.value;
                            const gMatch = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)).match(/(\d+)\s*ゲーム/);
                            next[i] = { ...next[i], heatRuleText: text, heatGames: gMatch ? parseInt(gMatch[1]) : next[i].heatGames };
                            setEditingRules(next);
                          }}
                          placeholder="例: 6ゲームマッチ（ノーアドバンテージ）"
                          className="w-full text-sm border border-red-200 rounded-lg px-2.5 py-1.5 focus:border-red-400 focus:ring-2 focus:ring-red-200 outline-none"
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-500 font-medium">ゲーム数</label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={rule.heatGames ?? ''}
                              onChange={e => {
                                const next = [...editingRules];
                                const v = e.target.value;
                                next[i] = { ...next[i], heatGames: v === '' ? undefined : (parseInt(v) || undefined) };
                                setEditingRules(next);
                              }}
                              placeholder="-"
                              className="w-16 text-sm text-center border border-red-200 rounded-lg px-2 py-1 focus:border-red-400 outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-500 font-medium">方式</label>
                            <select
                              value={rule.heatMatchFormat || 'game'}
                              onChange={e => {
                                const next = [...editingRules];
                                next[i] = { ...next[i], heatMatchFormat: e.target.value as 'game' | 'twoSetsSuper10' };
                                setEditingRules(next);
                              }}
                              className="text-xs border border-red-200 rounded-lg px-2 py-1 focus:border-red-400 outline-none"
                            >
                              <option value="game">ゲームマッチ</option>
                              <option value="twoSetsSuper10">2セット+STB</option>
                            </select>
                          </div>
                          {(rule.heatRuleText || rule.heatGames) && (
                            <button
                              onClick={() => {
                                const next = [...editingRules];
                                next[i] = { ...next[i], heatRuleText: undefined, heatGames: undefined, heatMatchFormat: undefined };
                                setEditingRules(next);
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700 underline"
                            >
                              クリア
                            </button>
                          )}
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

      {/* 対戦順カードのタップで開くスコア入力ポップアップ（ドローシートと同じダイアログ） */}
      {scoreDialogMatchId && (() => {
        const sm = allMatchesFlat.find(mm => mm.matchId === scoreDialogMatchId);
        if (!sm) return null;
        const evt = events.find(e => e.eventId === sm.eventId);
        const evDraw = allDraws.get(sm.eventId);
        const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : Math.max(1, eventMaxRound.get(sm.eventId) || 1);
        const dialogMatch: ScoreInputMatch = {
          matchId: sm.matchId,
          dbId: sm.id || 0,
          round: sm.round,
          position: sm.position,
          matchOrder: sm.matchOrder,
          player1Name: sm.player1Name,
          player2Name: sm.player2Name,
          player1Affiliation: sm.player1Affiliation,
          player2Affiliation: sm.player2Affiliation,
          player1EntryId: sm.player1EntryId,
          player2EntryId: sm.player2EntryId,
          score: sm.score,
          winnerEntryId: sm.winnerEntryId,
          courtId: sm.courtId,
          status: sm.status,
          scheduledTime: sm.scheduledTime,
          eventName: evt?.name || '',
          updatedAt: sm.updatedAt,
        };
        return (
          <ScoreInputDialog
            match={dialogMatch}
            courts={courts.map(c => ({ courtId: c.courtId, name: c.name, isAvailable: c.isAvailable !== false }))}
            onClose={() => setScoreDialogMatchId(null)}
            onMatchUpdate={() => {}}
            getRoundName={(round) => getRoundName(round, evTotalRounds)}
            isLeague={false}
            gameRuleText={getMatchGameRuleText(evt, sm.round, evTotalRounds)}
            requiredGames={resolveRequiredGames(getMatchGameRuleText(evt, sm.round, evTotalRounds), sm.round, evTotalRounds)}
            matchFormat={getMatchFormatForRound(evt, sm.round, evTotalRounds)}
          />
        );
      })()}

      {/* 待機カードのタップで開く「コートに入れる」ポップアップ */}
      {courtPickMatchId && (() => {
        const pm = allMatchesFlat.find(mm => mm.matchId === courtPickMatchId);
        if (!pm) return null;
        const evt = events.find(e => e.eventId === pm.eventId);
        const evDraw = allDraws.get(pm.eventId);
        const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : Math.max(1, eventMaxRound.get(pm.eventId) || 1);
        const suggested = standbyInfo.get(pm.matchId)?.enterCourtName || null;
        return (
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setCourtPickMatchId(null)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">コートに入れる</h3>
                <button onClick={() => setCourtPickMatchId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <div>
                  <span className="font-medium">{shortEventName(evt?.name || pm.eventId)}</span>
                  <span className="ml-2 text-gray-500">{getRoundName(pm.round, evTotalRounds)}</span>
                </div>
                <div className="text-gray-900 font-semibold">
                  {pm.player1Name} <span className="text-gray-400 font-normal mx-0.5">vs</span> {pm.player2Name}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">入れる空きコートを選択</label>
                {emptyCourts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2 text-center">現在、空きコートがありません。</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {emptyCourts.map(c => (
                      <button
                        key={c.courtId}
                        onClick={() => handleEnterCourt(pm.matchId, c.courtId)}
                        className={`px-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                          suggested === c.name
                            ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-primary-50 hover:border-primary-300'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {suggested && emptyCourts.length > 0 && (
                  <p className="text-[11px] text-orange-600 mt-2">オレンジ = 対戦順で次に入るコート（{suggested}番）</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* コール設定ポップアップ（どの導線からでも表示。ビューポート中央に表示） */}
      {callTargetMatchId && (() => {
        const cm = allMatchesFlat.find(mm => mm.matchId === callTargetMatchId);
        if (!cm) return null;
        const evt = events.find(e => e.eventId === cm.eventId);
        const availCourts = courts.filter(c => c.isAvailable);
        const courtOptions = availCourts.map(c => ({ value: c.name, label: `${c.name}番コート` }));
        // 上部表示用のドロー番号を取得（番号はコートに依存しない）
        const evDraw = allDraws.get(cm.eventId);
        const evTotalRounds = evDraw ? Math.log2(evDraw.drawSize) : totalRounds;
        const headerCall = buildMatchCall(cm, callCourtNumber || '0', evt, evTotalRounds);
        // 開始時刻は任意。コートが決まっていればコール可能。
        const canCall = !!callCourtNumber;

        // フリガナ編集用の一覧（苗字・所属）を対戦カードから構築する。
        const seenName = new Set<string>();
        const seenAff = new Set<string>();
        const nameItems: { key: string; kanji: string; reading: string }[] = [];
        const affItems: { key: string; kanji: string; reading: string }[] = [];
        const pushName = (full?: string) => {
          const s = familyName(full || '');
          if (s && !seenName.has(s)) { seenName.add(s); nameItems.push({ key: s, kanji: s, reading: callNameReadings[s] ?? '' }); }
        };
        const pushAff = (aff?: string) => {
          const a = (aff || '').trim();
          if (a && !seenAff.has(a)) { seenAff.add(a); affItems.push({ key: a, kanji: a, reading: callAffReadings[a] ?? '' }); }
        };
        if (headerCall) {
          pushName(headerCall.nameA); pushName(headerCall.nameB);
          pushAff(headerCall.affA); pushAff(headerCall.affB);
          if (headerCall.type === 'doubles') {
            pushName(headerCall.pairNameA); pushName(headerCall.pairNameB);
            pushAff(headerCall.pairAffA); pushAff(headerCall.pairAffB);
          }
        }
        return (
          <CallSettingsModal
            open
            eventName={evt?.name || ''}
            player1Name={cm.player1Name || ''}
            player2Name={cm.player2Name || ''}
            player1={{ number: headerCall?.numberA, name: cm.player1Name || '', affiliation: cm.player1Affiliation || '' }}
            player2={{ number: headerCall?.numberB, name: cm.player2Name || '', affiliation: cm.player2Affiliation || '' }}
            courtOptions={courtOptions}
            courtNumber={callCourtNumber}
            onCourtChange={setCallCourtNumber}
            courtAssigned={!!cm.courtId}
            startTime={callStartTime}
            onStartTimeChange={setCallStartTime}
            nameReadings={nameItems}
            onNameReadingChange={(key, value) => setCallNameReadings(prev => ({ ...prev, [key]: value }))}
            affReadings={affItems}
            onAffReadingChange={(key, value) => setCallAffReadings(prev => ({ ...prev, [key]: value }))}
            canCall={canCall}
            onCall={() => {
              // 修正した読みを永続化: 苗字はストア、所属はDBへ保存し以後のコールにも反映する
              for (const [surname, reading] of Object.entries(callNameReadings)) {
                if (reading && reading.trim()) setNameReadingOverride(surname, reading.trim());
              }
              void (async () => {
                for (const [aff, reading] of Object.entries(callAffReadings)) {
                  const v = (reading || '').trim();
                  if (!v) continue;
                  const existing = await db.affiliationFurigana.where('name').equals(aff).first();
                  if (existing?.id != null) {
                    await db.affiliationFurigana.update(existing.id, { furigana: v, updatedAt: Date.now() });
                  } else {
                    await db.affiliationFurigana.add({ name: aff, furigana: v, updatedAt: Date.now() });
                  }
                }
              })();
              const text = buildCallTextFromReadings(cm, callCourtNumber, callStartTime, callNameReadings, callAffReadings);
              handleVoiceCall(cm, callCourtNumber, callStartTime, text);
              closeCallModal();
            }}
            onClose={closeCallModal}
          />
        );
      })()}
    </div>
  );
}
