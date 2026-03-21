import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { ClipboardList, ListOrdered, Printer, Trophy, Edit3, Check, X, ChevronDown, ChevronUp, Volume2, Play, Square, Mic, ChevronRight, Megaphone } from 'lucide-react';
import type { Match, Court } from '../../db/database';
import type { MatchCall, CallLogEntry, VoiceSettings } from '../broadcast/types';
import { buildCallText } from '../broadcast/callTextBuilder';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

type DrawSlot = { position: number; entryId: string | null; seed: number; isBye: boolean };


export default function MatchManager() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
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

  // 全試合をmatchOrder順でグローバルソート（対戦順表示用）
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
    return arr.sort((a, b) => (a.matchOrder || 9999) - (b.matchOrder || 9999));
  }, [allMatchesByEvent, events]);

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

  const { isSpeaking, voiceName, speak, stop, testVoice } = useSpeechSynthesis();

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
  const buildMatchCall = useCallback((m: Match, courtNum: string): MatchCall | null => {
    if (!m.player1Name || !m.player2Name) return null;

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
      const entry = entries.find(e => e.entryId === entryId);
      if (!entry) return { name: fallbackName, aff: affiliationFuriganaMap[fallbackAff] || fallbackAff };
      const player = players.find(p => p.playerId === entry.playerId);
      if (!player) return { name: fallbackName, aff: affiliationFuriganaMap[fallbackAff] || fallbackAff };
      const affReading = affiliationFuriganaMap[player.affiliation] || player.affiliation;
      return { name: player.furigana || player.name, aff: affReading };
    };

    const isDoubles = currentEvent?.type === 'Doubles';
    const roundName = getRoundName(m.round, totalRounds);

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
        const entry1 = entries.find(e => e.entryId === m.player1EntryId);
        if (entry1?.partnerId) {
          const partner = players.find(p => p.playerId === entry1.partnerId);
          if (partner) partnerA = { name: partner.furigana || partner.name, aff: partner.affiliation };
        }
      }
      if (m.player2EntryId) {
        const entry2 = entries.find(e => e.entryId === m.player2EntryId);
        if (entry2?.partnerId) {
          const partner = players.find(p => p.playerId === entry2.partnerId);
          if (partner) partnerB = { name: partner.furigana || partner.name, aff: partner.affiliation };
        }
      }

      return {
        id: m.id || 0,
        eventName: currentEvent?.name || '',
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
        eventName: currentEvent?.name || '',
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
  }, [drawData, allDraws, entries, players, currentEvent, totalRounds, affiliationFuriganaMap]);

  // コール実行
  const handleVoiceCall = useCallback((m: Match, courtNum: string) => {
    if (!courtNum) return;
    const matchCall = buildMatchCall(m, courtNum);
    if (!matchCall) return;

    const text = buildCallText(matchCall, courtNum, m.scheduledTime || '', affiliationFuriganaMap);
    setSpeakingMatchId(m.matchId);

    speak(text, voiceSettings, () => {
      setSpeakingMatchId(null);
      const roundName = getRoundName(m.round, totalRounds);
      setCallLog(prev => [{
        timestamp: new Date(),
        courtNumber: courtNum,
        eventName: currentEvent?.name || '',
        round: `${roundName} #${m.position}`,
        text,
        matchId: m.id || 0,
      }, ...prev]);
    });
  }, [buildMatchCall, speak, voiceSettings, affiliationFuriganaMap, currentEvent, totalRounds]);

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

  const courts = useLiveQuery(() => db.courts.toArray()) || [];

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

  const handleBulkFirstCall = useCallback(async () => {
    if (!currentTournamentId || courts.length === 0) return;

    const firstMatches: { match: Match; court: Court }[] = [];
    for (const court of courts) {
      if (!court.isAvailable) continue;
      const courtMatches = allMatchesFlat
        .filter(m => m.courtId === court.courtId && (m.status === 'waiting' || m.status === 'ready'))
        .sort((a, b) => {
          if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
          return (a.matchOrder || 0) - (b.matchOrder || 0);
        });
      if (courtMatches.length > 0) firstMatches.push({ match: courtMatches[0], court });
    }

    if (firstMatches.length === 0) { alert('コールする試合がありません。'); return; }

    const confirmed = confirm(
      `${firstMatches.length}コートの初戦を一斉にコールします。よろしいですか？\n\n` +
      firstMatches.map(fm => `${fm.court.name}番: ${fm.match.player1Name} vs ${fm.match.player2Name}`).join('\n')
    );
    if (!confirmed) return;

    for (const fm of firstMatches) {
      if (fm.match.id) {
        await db.matches.update(fm.match.id, { status: 'playing', updatedAt: Date.now() });
        if (fm.court.id) await db.courts.update(fm.court.id, { currentMatchId: fm.match.matchId });
      }
    }
    alert(`${firstMatches.length}コートの初戦をコールしました。`);
  }, [currentTournamentId, courts, allMatchesFlat]);

  // --- 結果入力 ---
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [editTiebreak, setEditTiebreak] = useState('');

  // ゲーム数からタイブレークかどうか判定
  const games = currentEvent?.gameRules?.games ?? 6;
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
    if (selectedEventId) {
      const eventDraw = await db.draws.where('eventId').equals(selectedEventId).first();
      const ds = eventDraw?.drawSize || 0;
      const isLeague = eventDraw?.drawType === 'roundRobin' || (ds > 0 && (ds & (ds - 1)) !== 0);

      if (!isLeague) {
        const nextRound = m.round + 1;
        const nextPosition = Math.ceil(m.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(selectedEventId)
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
    const games = evt?.gameRules?.games ?? 6;
    const gameMethod = `${games}ゲームマッチ\n（${games}-${games}タイブレーク）`;
    const eventDraw = allDraws.get(eventId);
    const eventTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;

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
        ${gameMethod}
      </td>
      <td colspan="5" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        開始時間
      </td>
      <td colspan="7" rowspan="2"
          class="fg bt br2 bb2"
          style="text-align:center; font-size:22px; font-weight:bold;">
        ${m.scheduledTime || ''}
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
    const gamesVal = evt.gameRules?.games ?? 6;
    const gameMethod = `${gamesVal}ゲームマッチ\n（${gamesVal}-${gamesVal}タイブレーク）`;
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
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto">
      {/* TOP: プルダウン式コントロールパネル */}
      <div className="shrink-0 mb-3 sticky top-0 z-10 bg-bg-main pt-0">
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
                className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-primary-500 transition-colors"
              >
                {showVoiceSettings ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                <Volume2 className="w-4 h-4 text-primary-500" />
                音声コール設定
              </button>
              {showVoiceSettings && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-50 rounded-lg border border-pink-200 text-xs">
                    <span>👩</span>
                    <span className="font-medium text-pink-700">女性音声</span>
                    <span className="text-pink-500">{voiceName}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        速度: {voiceSettings.rate.toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="1.2"
                        step="0.05"
                        value={voiceSettings.rate}
                        onChange={e => setVoiceSettings(s => ({ ...s, rate: parseFloat(e.target.value) }))}
                        className="w-full accent-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">繰り返し</label>
                      <div className="flex gap-1">
                        {[1, 2, 3].map(n => (
                          <button
                            key={n}
                            onClick={() => setVoiceSettings(s => ({ ...s, repeatCount: n }))}
                            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                              voiceSettings.repeatCount === n
                                ? 'bg-primary-500 text-white'
                                : 'bg-primary-50 text-gray-500 hover:bg-primary-100'
                            }`}
                          >
                            {n}回
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => testVoice(voiceSettings)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-500 rounded-lg text-xs font-medium hover:bg-primary-100 transition-colors"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        テスト
                      </button>
                      {isSpeaking && (
                        <button
                          onClick={handleVoiceStop}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" />
                          停止
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div ref={matchContentRef} className="flex-1 min-w-0 overflow-auto space-y-3">
        {/* === 対戦順（グローバル）表示 === */}
        {viewMode === 'global' && (
          globalSortedMatches.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-5 h-5 text-white" />
                  <span className="font-bold text-white text-sm">対戦順（時間割・コート順）</span>
                  <span className="text-white/70 text-xs">{globalSortedMatches.length}試合</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm" style={{ tableLayout: 'fixed', minWidth: '600px' }}>
                  <colgroup>
                    <col style={{ width: '40px' }} />
                    <col style={{ width: '56px' }} />
                    <col />
                    <col style={{ width: '28px' }} />
                    <col />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '56px' }} />
                    <col style={{ width: '56px' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">#</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">時間</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-gray-500">選手1</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">vs</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-gray-500">選手2</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-gray-500">種目・回戦</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">コート</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalSortedMatches.map((m) => {
                      const st = statusLabels[m.status] || statusLabels.waiting;
                      const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
                      const eventDraw = allDraws.get(m.eventId);
                      const evTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;
                      const rName = getRoundName(m.round, evTotalRounds);
                      const hasPlayers = !!m.player1Name && !!m.player2Name;
                      return (
                        <tr key={m.matchId} className={`border-b border-gray-100 ${!hasPlayers ? 'opacity-40' : ''} ${m.status === 'playing' ? 'bg-green-50' : m.status === 'finished' ? 'bg-gray-50' : ''}`}>
                          <td className="py-2 px-2 text-center font-mono text-blue-500 text-xs font-bold">{m.matchOrder}</td>
                          <td className="py-2 px-2 text-center text-xs font-mono text-gray-600">{m.scheduledTime || '-'}</td>
                          <td className="py-2 px-2">
                            <div className="text-sm font-medium truncate">{m.player1Name || '-'}</div>
                          </td>
                          <td className="py-2 px-1 text-center text-blue-300 text-xs font-bold">vs</td>
                          <td className="py-2 px-2">
                            <div className="text-sm font-medium truncate">{m.player2Name || '-'}</div>
                          </td>
                          <td className="py-2 px-2">
                            <div className="text-[10px] text-gray-500 truncate">{m.eventName}</div>
                            <div className="text-[10px] font-medium text-gray-700">{rName}</div>
                          </td>
                          <td className="py-2 px-2 text-center text-xs font-bold text-gray-700">{courtObj?.name || '-'}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${st.color}`}>{st.text}</span>
                          </td>
                        </tr>
                      );
                    })}
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
            const eventMatches = (allMatchesByEvent.get(evt.eventId) || []).filter(m => m.status !== 'walkover');
            const eventDraw = allDraws.get(evt.eventId);
            const ds = eventDraw?.drawSize || 0;
            const isLeagueEvent = eventDraw?.drawType === 'roundRobin' || (ds > 0 && (ds & (ds - 1)) !== 0) || /リーグ/i.test(evt.name || '');
            const evTotalRounds = eventDraw ? Math.log2(eventDraw.drawSize) : 1;
            const finishedCount = eventMatches.filter(m => m.status === 'finished').length;
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
                        {eventMatches.length}試合 / {finishedCount}完了
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
    </div>
  );
}
