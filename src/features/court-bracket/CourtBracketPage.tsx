import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { findOccupyingMatch, occupiedMessage } from '../../db/courtOccupancy';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import {
  buildMatchesFromDraw, findResetMatches, isLeagueEvent, rebuildEventMatches,
} from '../draw/rebuildMatches';
import { insertGapAt, isEmptySlot, removeGapAt, swapSlotContents } from '../draw/drawSlotOps';
import { ChevronLeft, ChevronRight, MapPin, Trophy, Timer, Layers, Eye, EyeOff, Shuffle, ArrowDownToLine, ArrowUpToLine, Undo2, Play, Pencil, Medal, UserPen, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import CourtBracketView from './CourtBracketView';
import RoundRobinRenderer from '../draw/RoundRobinRenderer';
import ScoreInputDialog from '../score/ScoreInputDialog';
import type { ScoreInputMatch } from '../score/ScoreInputDialog';
import { resolveRequiredGames } from '../score/gameRules';
import { useStandbyMap, matchKey } from '../referee/standbyRanking';
import CourtPickDialog from '../../components/ui/CourtPickDialog';
import LeagueCourtDialog from '../../components/ui/LeagueCourtDialog';
import GameRulesDialog from '../../components/ui/GameRulesDialog';
import PlayerNameDialog, { type PlayerNameTarget } from '../../components/ui/PlayerNameDialog';
import { buildLeagueCourtMap, freeLeagueCourts, MAX_LEAGUE_COURTS } from '../draw/leagueCourts';
import { isThirdPlaceMatch, THIRD_PLACE_LABEL, wantsThirdPlace } from '../draw/thirdPlace';
import EventResultPreview from '../results/EventResultPreview';
import { sortEventsByClass } from '../data/eventOrder';
import { isEventComplete } from '../results/eventCompletion';
import {
  getGameRuleText, getGameRulesText, getMatchFormat, getRoundName,
} from '../score/roundRules';

interface CourtBracketPageProps {
  /** スコア入力を有効にするか（公開ビューでは false で読み取り専用） */
  enableScoreInput?: boolean;
}

export default function CourtBracketPage({ enableScoreInput = true }: CourtBracketPageProps) {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(0);
  // スコア入力対象の試合キー "round-position"
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  /** クラス名をタップして開くクラス一覧 */
  const [classListOpen, setClassListOpen] = useState(false);
  /** 右下の編集ボタンで開くメニュー（あたり修正・名前修正など） */
  const [editMenuOpen, setEditMenuOpen] = useState(false);

  // === あたり（対戦の組み合わせ）修正モード ===
  // 取り込んだドロー表と実際の組み合わせが違っていた場合に、
  // 1回戦の枠（空き枠を含む）を入れ替えて直せるようにする。
  const [editMode, setEditMode] = useState(false);
  /** 修正中のスロット（保存するまでDBには書き込まない） */
  const [draftSlots, setDraftSlots] = useState<DrawSlotData[] | null>(null);
  const [selectedSlotPos, setSelectedSlotPos] = useState<number | null>(null);
  const [savingDraw, setSavingDraw] = useState(false);
  /** 修正操作の履歴（「1つ戻す」用） */
  const [draftHistory, setDraftHistory] = useState<DrawSlotData[][]>([]);

  const rawEvents = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];
  // クラスは「男子→女子」「アルファベット→年齢」の順に並べる
  const events = useMemo(() => sortEventsByClass(rawEvents), [rawEvents]);

  const selectedEventId = events[selectedEventIdx]?.eventId || '';
  const selectedEvent = events[selectedEventIdx];

  // 控え状況（対戦順シートと共通のランキング）
  const standbyMap = useStandbyMap(currentTournamentId);

  // クラス切替（末尾↔先頭で循環）
  const gotoPrevEvent = useCallback(() => {
    setSelectedEventIdx(i => events.length > 0 ? (i - 1 + events.length) % events.length : 0);
  }, [events.length]);
  const gotoNextEvent = useCallback(() => {
    setSelectedEventIdx(i => events.length > 0 ? (i + 1) % events.length : 0);
  }, [events.length]);

  // スワイプでクラス切替
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);
  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || events.length <= 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) gotoNextEvent(); else gotoPrevEvent();
  }, [events.length, gotoNextEvent, gotoPrevEvent]);

  const matches = useLiveQuery(
    () => selectedEventId
      ? db.matches.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  const drawData = useLiveQuery(
    () => selectedEventId
      ? db.draws.where('eventId').equals(selectedEventId).first()
      : undefined,
    [selectedEventId]
  );

  const entries = useLiveQuery(
    () => selectedEventId
      ? db.entries.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  // 経過時間更新
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // 初期選択
  useEffect(() => {
    if (events.length > 0 && selectedEventIdx >= events.length) {
      setSelectedEventIdx(0);
    }
  }, [events, selectedEventIdx]);

  // ドロースロットデータ構築
  const slots: DrawSlotData[] = useMemo(() => {
    if (!drawData?.slots) return [];
    return drawData.slots
      .map(s => {
        let name = 'BYE';
        let affiliation = '';
        if (!s.isBye && s.entryId) {
          const entry = entries.find(e => e.entryId === s.entryId);
          if (entry) {
            const p1 = players.find(p => p.playerId === entry.playerId);
            const isDoubles = !!entry.partnerId;
            const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
            name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
            affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
              ? `${p1.affiliation} / ${p2.affiliation}`
              : (p1?.affiliation || '');
          }
        }
        return { position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye, name, affiliation };
      })
      .sort((a, b) => a.position - b.position);
  }, [drawData, entries, players]);

  // 試合結果データ構築
  const matchResults: MatchResult[] = useMemo(() =>
    matches.map(m => {
      const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      const sb = standbyMap.get(matchKey(m));
      return {
        round: m.round, position: m.position,
        player1Name: m.player1Name, player2Name: m.player2Name,
        winnerEntryId: m.winnerEntryId,
        player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
        score: m.score, status: m.status, courtId: m.courtId,
        courtName: court?.name || '', scheduledTime: m.scheduledTime,
        updatedAt: m.updatedAt,
        standbyLabel: sb?.standbyLabel ?? null,
        enterCourtName: sb?.enterCourtName ?? null,
      };
    }),
    [matches, courts, standbyMap]
  );

  const totalRounds = drawData ? Math.log2(drawData.drawSize) : 1;
  const drawSize = drawData?.drawSize || 0;

  // リーグ戦の対戦カード（対戦順）
  const rrMatches = useMemo(() =>
    matches
      .filter(m => !!m.player1Name && !!m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE')
      .sort((a, b) => (a.matchOrder || 0) - (b.matchOrder || 0)),
    [matches]);
  // 進捗
  const progress = useMemo(() => {
    const total = matches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
    const finished = matches.filter(m => m.status === 'finished').length;
    const playing = matches.filter(m => m.status === 'playing').length;
    const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, finished, playing, pct };
  }, [matches]);

  // クラスの全試合が終わっていれば、結果画像のプレビュー→JPEG保存を出す
  const tournament = useLiveQuery(
    () => (currentTournamentId
      ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
      : undefined),
    [currentTournamentId]
  );
  const resultPreviewOpts = useMemo(() => {
    if (!tournament || !selectedEvent || !drawData) return null;
    if (!isEventComplete(drawData, matches)) return null;
    return { tournament, event: selectedEvent, draw: drawData, matches, entries, players };
  }, [tournament, selectedEvent, drawData, matches, entries, players]);

  // ---- 表示回戦の絞り込み ----
  // 回戦が進むほどトーナメント表は対戦相手同士が上下に離れて見にくくなる。
  // 決着済みの前半の回戦を隠して、残りを詰めて表示できるようにする。
  // null = 自動（決着済みの回戦を自動で省略）
  // 種目を切り替えたら自動に戻したいので、対象の種目IDも一緒に保持する。
  const [roundOverride, setRoundOverride] = useState<{ eventId: string; value: number } | null>(null);

  /** その回戦の試合がすべて決着しているか（BYE等の片側だけの枠は無視） */
  const isRoundSettled = useCallback((round: number) => {
    const rm = matches.filter(m => m.round === round);
    if (rm.length === 0) return false;
    return rm.every(m => {
      if (!m.player1EntryId || !m.player2EntryId) return true;
      return m.status === 'finished' || m.status === 'walkover';
    });
  }, [matches]);

  /** 自動省略: 先頭から連続して決着済みの回戦数（最低2列は残す） */
  const autoStartRound = useMemo(() => {
    if (totalRounds < 2) return 0;
    let r = 0;
    while (r < totalRounds - 1 && isRoundSettled(r + 1)) r++;
    return r;
  }, [totalRounds, isRoundSettled]);

  // ラウンドロビン判定
  const isRoundRobin = useMemo(() => {
    if (!drawData) return false;
    if (drawData.drawType === 'roundRobin') return true;
    if (drawData.drawType === 'tournament') return false;
    const realPlayers = slots.filter(s => !s.isBye);
    return realPlayers.length >= 2 && realPlayers.length <= 5 && drawData.drawSize <= 8;
  }, [drawData, slots]);

  const maxStartRound = Math.max(0, totalRounds - 1);
  const manualStartRound = roundOverride?.eventId === selectedEventId ? roundOverride.value : null;
  const startRound = Math.min(manualStartRound ?? autoStartRound, maxStartRound);
  const canAdjustRounds = !isRoundRobin && drawSize > 0 && maxStartRound >= 1;
  // 先頭の列にはその回戦の試合が並ぶので、絞り込みの表示もその回戦名にする
  const startRoundLabel = startRound === 0
    ? '全回戦表示'
    : `${getRoundName(startRound, totalRounds)}以降`;
  const setStartRound = (value: number | null) =>
    setRoundOverride(value == null ? null : { eventId: selectedEventId, value });

  // スコア入力対象の試合（"round-position" キーから解決）
  const selectedMatch: ScoreInputMatch | null = useMemo(() => {
    if (!enableScoreInput || !selectedMatchKey) return null;
    const [rs, ps] = selectedMatchKey.split('-');
    const round = parseInt(rs), position = parseInt(ps);
    if (isNaN(round) || isNaN(position)) return null;
    const m = matches.find(mt => mt.round === round && mt.position === position);
    if (!m || m.id == null) return null;
    return {
      matchId: m.matchId, dbId: m.id, round: m.round, position: m.position,
      matchOrder: m.matchOrder, player1Name: m.player1Name, player2Name: m.player2Name,
      player1Affiliation: m.player1Affiliation, player2Affiliation: m.player2Affiliation,
      player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
      score: m.score, winnerEntryId: m.winnerEntryId, courtId: m.courtId,
      status: m.status, scheduledTime: m.scheduledTime,
      eventName: selectedEvent?.name || '', updatedAt: m.updatedAt,
    };
  }, [enableScoreInput, selectedMatchKey, matches, selectedEvent]);

  // --- 選手名の修正（エントリー確定後でもドロー画面から直せるようにする）---
  const [nameEditMode, setNameEditMode] = useState(false);
  const [nameEditTarget, setNameEditTarget] = useState<PlayerNameTarget | null>(null);

  /** エントリーから修正対象の選手（ダブルスは2人）を組み立てて開く */
  const openNameEditor = useCallback((entryId: string) => {
    const entry = entries.find(e => e.entryId === entryId);
    if (!entry) return;
    const targets = [entry.playerId, entry.partnerId]
      .filter((id): id is string => !!id)
      .map(id => players.find(p => p.playerId === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (targets.length === 0) return;
    const slot = slots.find(sl => sl.entryId === entryId);
    const drawNumber = slot
      ? slots.filter(sl => !sl.isBye && sl.entryId).findIndex(sl => sl.entryId === entryId) + 1
      : undefined;
    setNameEditTarget({ drawNumber: drawNumber || undefined, players: targets });
  }, [entries, players, slots]);

  // --- あたり修正 ---
  /** 表示に使うスロット（修正中は編集用のドラフト） */
  const viewSlots = editMode && draftSlots ? draftSlots : slots;

  const startEdit = useCallback(() => {
    setDraftSlots(slots.map(s => ({ ...s })));
    setDraftHistory([]);
    setSelectedSlotPos(null);
    setEditMode(true);
  }, [slots]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setDraftSlots(null);
    setDraftHistory([]);
    setSelectedSlotPos(null);
  }, []);

  /** 枠のタップ: 名前修正モードでは選手名の修正、あたり修正モードでは入れ替え */
  const handleSlotSelect = useCallback((position: number) => {
    if (nameEditMode) {
      const slot = slots.find(s => s.position === position);
      if (slot?.entryId) openNameEditor(slot.entryId);
      return;
    }
    if (selectedSlotPos == null) { setSelectedSlotPos(position); return; }
    if (selectedSlotPos === position) { setSelectedSlotPos(null); return; }
    if (draftSlots) {
      setDraftHistory(h => [...h, draftSlots]);
      setDraftSlots(swapSlotContents(draftSlots, selectedSlotPos, position));
    }
    setSelectedSlotPos(null);
  }, [selectedSlotPos, draftSlots, nameEditMode, slots, openNameEditor]);

  /** 直前の修正操作を取り消す */
  const undoDraft = useCallback(() => {
    if (draftHistory.length === 0) return;
    setDraftSlots(draftHistory[draftHistory.length - 1]);
    setDraftHistory(draftHistory.slice(0, -1));
    setSelectedSlotPos(null);
  }, [draftHistory]);

  /**
   * 枠を1つずつ下へずらして、指定位置に空き枠を作る。
   *
   * トーナメント表は「4枠ずつのブロック」で2回戦の相手が決まるため、
   * 入れ替えだけでは手書きドロー特有の並び（例: 7・8の勝者と9が2回戦で当たる）
   * を作れない。空き枠の挿入で全体を1つずつ下へずらせるようにする。
   * ずれるのは「挿入位置から、その先にある最初の空き枠まで」に限る。
   */
  const handleInsertGap = useCallback((position: number) => {
    if (!draftSlots) return;
    const { slots: next, error } = insertGapAt(draftSlots, position);
    if (error) { alert(error); return; }
    setDraftHistory(h => [...h, draftSlots]);
    setDraftSlots(next);
    // 選択は残す（同じ位置に続けて空きを入れて、まとめてずらせるように）
  }, [draftSlots]);

  /** 空き枠を詰めて、以降の枠を1つずつ上へ上げる（空き枠は末尾へ回す） */
  const handleRemoveGap = useCallback((position: number) => {
    if (!draftSlots) return;
    setDraftHistory(h => [...h, draftSlots]);
    setDraftSlots(removeGapAt(draftSlots, position));
    // 選択は残す（続けて詰められるように）
  }, [draftSlots]);

  /** 選択中の枠が空き枠か */
  const selectedSlotIsEmpty = useMemo(() => {
    if (selectedSlotPos == null || !draftSlots) return false;
    const s = draftSlots.find(x => x.position === selectedSlotPos);
    return !!s && isEmptySlot(s);
  }, [selectedSlotPos, draftSlots]);

  const drawDirty = useMemo(() => {
    if (!draftSlots) return false;
    return draftSlots.some((s, i) => s.entryId !== slots[i]?.entryId || s.isBye !== slots[i]?.isBye);
  }, [draftSlots, slots]);

  /** 修正内容を保存し、対戦表を組み直す（入力済みスコアは可能な限り引き継ぐ） */
  const saveEdit = useCallback(async () => {
    if (!drawData?.id || !draftSlots || !selectedEventId) return;
    const nextSlots = draftSlots.map(s => ({
      position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye,
    }));

    // 対戦カードが変わることで結果が消える試合を先に知らせる
    const draftDraw = { ...drawData, slots: nextSlots };
    const isLeague = await isLeagueEvent(selectedEventId, draftDraw);
    const nextMatches = await buildMatchesFromDraw(selectedEventId, draftDraw, isLeague);
    const lost = findResetMatches(nextMatches, matches);
    if (lost.length > 0) {
      const names = lost.slice(0, 5).map(m => `・${m.player1Name} vs ${m.player2Name}（${m.score || '結果あり'}）`).join('\n');
      const more = lost.length > 5 ? `\n…ほか${lost.length - 5}試合` : '';
      if (!confirm(`対戦の組み合わせが変わるため、次の試合の結果は取り消されます。\n\n${names}${more}\n\n保存してよろしいですか？`)) return;
    }

    setSavingDraw(true);
    try {
      await db.draws.update(drawData.id, { slots: nextSlots, updatedAt: Date.now() });
      await rebuildEventMatches(selectedEventId);
      setEditMode(false);
      setDraftSlots(null);
      setDraftHistory([]);
      setSelectedSlotPos(null);
    } catch (e) {
      console.error('[あたり修正] 保存に失敗:', e);
      alert('保存に失敗しました');
    } finally {
      setSavingDraw(false);
    }
  }, [drawData, draftSlots, selectedEventId, matches]);

  // 種目を切り替えたら修正モードは解除する
  useEffect(() => {
    setEditMode(false);
    setDraftSlots(null);
    setDraftHistory([]);
    setSelectedSlotPos(null);
  }, [selectedEventId]);

  // --- コート選択（タップした試合をどのコートに入れるか運営が選ぶ）---
  /** コート選択ダイアログの対象 "round-position" */
  const [courtPickKey, setCourtPickKey] = useState<string | null>(null);

  // 大会全体のドロー（他のリーグが専有しているコートを避けるために使う）
  const allDraws = useLiveQuery(async () => {
    if (!currentTournamentId) return [];
    const evs = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
    const ids = evs.map(e => e.eventId);
    return ids.length > 0 ? db.draws.where('eventId').anyOf(ids).toArray() : [];
  }, [currentTournamentId]) || [];

  // 大会全体の進行中試合（他種目のコート使用も見て空きコートを判定する）
  const playingMatches = useLiveQuery(async () => {
    if (!currentTournamentId) return [];
    const evs = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
    const ids = evs.map(e => e.eventId);
    if (ids.length === 0) return [];
    const all = await db.matches.where('eventId').anyOf(ids).toArray();
    return all.filter(m => m.status === 'playing');
  }, [currentTournamentId]) || [];

  // リーグ戦のコート割り当て（eventId → コートID）
  const leagueCourtMap = useMemo(() => buildLeagueCourtMap(allDraws), [allDraws]);
  /** この種目（リーグ）に割り当てたコート */
  const assignedLeagueCourts = useMemo(() => {
    const ids = leagueCourtMap.get(selectedEventId) || [];
    return ids
      .map(id => courts.find(c => c.courtId === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
  }, [leagueCourtMap, selectedEventId, courts]);
  /** 割り当てコートのうち、いま試合が入っていないもの */
  const freeAssignedCourts = useMemo(
    () => freeLeagueCourts(leagueCourtMap.get(selectedEventId) || [], courts, playingMatches),
    [leagueCourtMap, selectedEventId, courts, playingMatches],
  );

  /**
   * コート選択ダイアログ用のコート一覧（番号順・同名コートは1つにまとめる）。
   * 空き＝選択可、試合中／使用しないコートはグレーで選択できない。
   * リーグにコートを割り当てている種目では、そのコートだけを候補にする。
   * 逆に他のリーグが専有しているコートは、この種目からは選べない。
   */
  const courtPickList = useMemo(() => {
    const idToName = new Map(courts.map(c => [c.courtId, c.name]));
    const usedNames = new Set<string>();
    for (const m of playingMatches) {
      const n = m.courtId ? idToName.get(m.courtId) : undefined;
      if (n) usedNames.add(n);
    }
    // 他のリーグが専有しているコート名
    const reservedNames = new Set<string>();
    for (const [eventId, ids] of leagueCourtMap) {
      if (eventId === selectedEventId) continue;
      for (const id of ids) {
        const n = idToName.get(id);
        if (n) reservedNames.add(n);
      }
    }
    const ownIds = leagueCourtMap.get(selectedEventId) || [];
    const target = ownIds.length > 0
      ? courts.filter(c => ownIds.includes(c.courtId))
      : courts;
    const sorted = [...target].sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0));
    const seen = new Set<string>();
    const list: { courtId: string; name: string; status: 'empty' | 'playing' | 'unavailable' }[] = [];
    for (const c of sorted) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const status = c.isAvailable === false || reservedNames.has(c.name)
        ? 'unavailable'
        : usedNames.has(c.name) ? 'playing' : 'empty';
      list.push({ courtId: c.courtId, name: c.name, status });
    }
    return list;
  }, [courts, playingMatches, leagueCourtMap, selectedEventId]);

  /** コート選択ダイアログの対象試合 */
  const courtPickMatch = useMemo(() => {
    if (!courtPickKey) return null;
    const [rs, ps] = courtPickKey.split('-');
    const round = parseInt(rs), position = parseInt(ps);
    if (isNaN(round) || isNaN(position)) return null;
    return matches.find(mt => mt.round === round && mt.position === position) || null;
  }, [courtPickKey, matches]);

  // 空きコートに入れる（enterCourtName付きの待機試合をタップ）→ コート選択ダイアログを開く。
  // 以前はここで対戦順の「次に入るコート」を自動で決めてしまい、運営がコートを
  // 選べなかったため、対戦順シートと同じ選択ダイアログを経由するようにした。
  const handleEnterCourt = (round: number, position: number) => {
    setCourtPickKey(`${round}-${position}`);
  };

  /** 指定した試合を指定コートへ投入する（1コート2試合にならないよう確認してから） */
  const enterMatchToCourt = async (matchDbId: number, courtId: string) => {
    const court = (courts || []).find(c => c.courtId === courtId);
    if (!court) return;
    // 他種目を含め、そのコートで進行中の試合があれば投入しない（1コート2試合を防ぐ）
    const occupied = await findOccupyingMatch(court.courtId, matchDbId);
    if (occupied) {
      alert(occupiedMessage(court.name, occupied));
      return;
    }
    await db.matches.update(matchDbId, {
      courtId: court.courtId,
      status: 'playing',
      updatedAt: Date.now(),
    });
  };

  // 選んだコートへ実際に投入する
  const enterSelectedCourt = async (courtId: string) => {
    const target = courtPickMatch;
    setCourtPickKey(null);
    if (!target?.id) return;
    await enterMatchToCourt(target.id, courtId);
  };

  // --- 3位決定戦 ---
  /** この種目で3位決定戦を行うか（ドローの設定 → 無ければルール文から判定） */
  const hasThirdPlace = useMemo(
    () => !isRoundRobin && drawSize >= 4 && wantsThirdPlace(drawData, selectedEvent),
    [isRoundRobin, drawSize, drawData, selectedEvent],
  );

  /** 3位決定戦の有無を切り替える（対戦表も作り直す） */
  const toggleThirdPlace = useCallback(async () => {
    if (!drawData?.id) return;
    const next = !hasThirdPlace;
    if (!next) {
      const third = matches.find(isThirdPlaceMatch);
      if (third && (third.score || third.winnerEntryId)) {
        if (!confirm('3位決定戦の入力済みの結果も削除されます。よろしいですか？')) return;
      }
    }
    await db.draws.update(drawData.id, { hasThirdPlace: next, updatedAt: Date.now() });
    await rebuildEventMatches(selectedEventId);
  }, [drawData, hasThirdPlace, matches, selectedEventId]);

  // --- ゲームルール編集（対戦順シートと共通のダイアログ）---
  // 取り込んだドロー表のルールが違っていたときに、その場で直せるようにする。
  const [rulesDialogOpen, setRulesDialogOpen] = useState(false);

  // --- リーグ戦: 割り当てたコートへ次の対戦を入れる ---
  /** リーグの使用コート割り当てダイアログ */
  const [leagueCourtDialogOpen, setLeagueCourtDialogOpen] = useState(false);

  /** リーグの使用コートを保存する（空配列なら割り当て解除） */
  const saveLeagueCourts = async (courtIds: string[]) => {
    setLeagueCourtDialogOpen(false);
    if (!drawData?.id) return;
    await db.draws.update(drawData.id, {
      leagueCourtIds: courtIds.slice(0, MAX_LEAGUE_COURTS),
      updatedAt: Date.now(),
    });
  };

  /**
   * 待機中のリーグ戦をコートに入れる。
   * 空いている割り当てコートが1面ならそのまま投入し、2面空いていれば選んでもらう。
   */
  const enterLeagueMatch = (match: { id?: number; round: number; position: number }) => {
    if (match.id == null) return;
    if (freeAssignedCourts.length === 1) {
      void enterMatchToCourt(match.id, freeAssignedCourts[0].courtId);
      return;
    }
    setCourtPickKey(`${match.round}-${match.position}`);
  };

  if (!currentTournamentId) {
    return (
      <div className="p-6 text-center text-gray-500">
        大会を選択してください
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー: 種目選択 + ルール（上部固定・スワイプ切替） */}
      <div
        className="sticky top-0 z-30 shrink-0 bg-white border-b px-3 py-2 shadow-sm"
        onTouchStart={onSwipeStart}
        onTouchEnd={(e) => handleSwipeEnd(e)}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={gotoPrevEvent}
            className="p-1 rounded hover:bg-gray-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 text-center">
            {/* クラス名をタップすると、下にクラス一覧が開く */}
            <button
              onClick={() => setClassListOpen(v => !v)}
              className="max-w-full inline-flex items-center gap-1 text-base font-bold text-gray-900 rounded px-1 hover:bg-gray-100 transition-colors"
              aria-expanded={classListOpen}
              title="タップしてクラスを選ぶ"
            >
              <Trophy className="w-4 h-4 shrink-0 text-primary-500" />
              <span className="truncate">{selectedEvent?.name || '種目を選択'}</span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${classListOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {selectedEvent && (
              <p className="text-[10px] text-gray-500 truncate mt-0.5">
                {getGameRulesText(selectedEvent)}
              </p>
            )}
          </div>

          <button
            onClick={gotoNextEvent}
            className="p-1 rounded hover:bg-gray-100"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* クラス一覧（見出しをタップすると開く） */}
        {classListOpen && (
          <div className="mt-1.5 max-h-[45vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {events.map((evt, i) => (
              <button
                key={evt.eventId}
                onClick={() => { setSelectedEventIdx(i); setClassListOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  i === selectedEventIdx ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <Trophy className={`w-4 h-4 shrink-0 ${i === selectedEventIdx ? 'text-primary-500' : 'text-gray-300'}`} />
                <span className={`flex-1 min-w-0 truncate text-sm ${
                  i === selectedEventIdx ? 'font-bold text-primary-700' : 'font-medium text-gray-800'
                }`}>
                  {evt.name}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        )}

        {/* 進捗バー + コート使用状況 */}
        <div className="flex items-center gap-3 mt-1.5 text-[10px]">
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <span className="text-gray-500 whitespace-nowrap">
              {progress.finished}/{progress.total} ({progress.pct}%)
            </span>
          </div>
          {progress.playing > 0 && (
            <span className="flex items-center gap-0.5 text-gray-700 font-bold">
              <Timer className="w-3 h-3" />
              {progress.playing}試合中
            </span>
          )}
        </div>

        {/* 表示範囲の切り替え（大きく中央）と、編集メニュー（右下） */}
        {!editMode && (canAdjustRounds || resultPreviewOpts || (enableScoreInput && drawSize > 0)) && (
          <div className="relative mt-2 flex items-center justify-center min-h-[38px]">
            {canAdjustRounds && (
              <div className="inline-flex items-center gap-0.5 rounded-full border border-gray-300 bg-white px-1 py-0.5 shadow-sm">
                <button
                  onClick={() => setStartRound(Math.max(0, startRound - 1))}
                  disabled={startRound === 0}
                  className="p-1.5 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent"
                  title="前の回戦を表示する"
                  aria-label="前の回戦を表示する"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setStartRound(null)}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm font-bold text-gray-900 whitespace-nowrap"
                  title="タップで自動（決着済みの回戦を省略）に戻す"
                >
                  {startRound === 0
                    ? <Eye className="w-4 h-4 text-gray-400" />
                    : <EyeOff className="w-4 h-4 text-primary-500" />}
                  {startRoundLabel}
                </button>
                <button
                  onClick={() => setStartRound(Math.min(maxStartRound, startRound + 1))}
                  disabled={startRound >= maxStartRound}
                  className="p-1.5 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent"
                  title="終わった回戦を隠す"
                  aria-label="終わった回戦を隠す"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* 右下: 結果画像プレビューと編集メニュー */}
            <div className="absolute right-0 bottom-0 flex items-center gap-1.5">
              {resultPreviewOpts && <EventResultPreview opts={resultPreviewOpts} size="sm" />}
              {enableScoreInput && drawSize > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setEditMenuOpen(v => !v)}
                    className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${
                      editMenuOpen || nameEditMode
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    title="あたり・名前・ゲームルールの修正"
                    aria-label="修正メニューを開く"
                    aria-expanded={editMenuOpen}
                  >
                    <SlidersHorizontal className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                  </button>

                  {editMenuOpen && (
                    <>
                      {/* 外側をタップして閉じる */}
                      <button
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setEditMenuOpen(false)}
                        aria-label="メニューを閉じる"
                      />
                      {/* 上に開くとヘッダーの外にはみ出して隠れるため、下向きに開く */}
                      <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                          <span className="text-[11px] font-bold text-gray-500">修正メニュー</span>
                          <button onClick={() => setEditMenuOpen(false)} className="p-0.5 text-gray-400 hover:text-gray-700" aria-label="閉じる">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {!isRoundRobin && (
                          <button
                            onClick={() => { setEditMenuOpen(false); startEdit(); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 text-left"
                          >
                            <Shuffle className="w-4 h-4 shrink-0 text-primary-500" />
                            あたりを修正
                          </button>
                        )}
                        {!isRoundRobin && drawSize >= 4 && (
                          <button
                            onClick={() => { setEditMenuOpen(false); void toggleThirdPlace(); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 text-left"
                          >
                            <Medal className="w-4 h-4 shrink-0 text-primary-500" />
                            3位決定戦
                            <span className={`ml-auto text-[11px] font-bold ${hasThirdPlace ? 'text-primary-600' : 'text-gray-400'}`}>
                              {hasThirdPlace ? 'あり' : 'なし'}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={() => { setEditMenuOpen(false); setNameEditMode(v => !v); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 text-left"
                        >
                          <UserPen className="w-4 h-4 shrink-0 text-primary-500" />
                          名前を修正
                          {nameEditMode && <span className="ml-auto text-[11px] font-bold text-primary-600">修正中</span>}
                        </button>
                        <button
                          onClick={() => { setEditMenuOpen(false); setRulesDialogOpen(true); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 text-left"
                        >
                          <Pencil className="w-4 h-4 shrink-0 text-primary-500" />
                          ゲームルールを変更
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 名前の修正中は、枠をタップして直せることを知らせる */}
        {!editMode && nameEditMode && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1.5">
            <UserPen className="w-3.5 h-3.5 shrink-0 text-primary-500" />
            <span className="text-[11px] font-bold text-gray-800">名前を修正中</span>
            <span className="text-[10px] text-gray-600 flex-1">枠をタップすると氏名・ふりがな・所属を直せます</span>
            <button
              onClick={() => setNameEditMode(false)}
              className="text-[10px] font-bold text-gray-600 border border-gray-300 bg-white rounded-full px-2 py-0.5 hover:bg-gray-100"
            >
              やめる
            </button>
          </div>
        )}

        {/* あたり（対戦の組み合わせ）修正中の操作 */}
        {enableScoreInput && drawSize > 0 && editMode && (
          <div className="mt-1.5">
            {(
              <div className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-800 flex items-center gap-1">
                    <Shuffle className="w-3 h-3" />あたり修正中
                  </span>
                  <span className="text-[10px] text-gray-600 flex-1 min-w-[150px]">
                    {selectedSlotPos == null
                      ? '枠をタップして選ぶと、入れ替え・ずらしができます（空き枠も選べます）'
                      : `#${selectedSlotPos} を選択中 — 入れ替え先の枠をタップ、または下のボタンでずらす`}
                  </span>
                  <button
                    onClick={undoDraft}
                    disabled={savingDraw || draftHistory.length === 0}
                    className="flex items-center gap-1 text-[10px] font-bold text-gray-600 border border-gray-300 bg-white rounded-full px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
                  >
                    <Undo2 className="w-3 h-3" />1つ戻す
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={savingDraw}
                    className="text-[10px] font-bold text-gray-600 border border-gray-300 bg-white rounded-full px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
                  >
                    やめる
                  </button>
                  <button
                    onClick={() => void saveEdit()}
                    disabled={savingDraw || !drawDirty}
                    className="text-[10px] font-bold text-white bg-primary-600 rounded-full px-3 py-1 hover:brightness-110 disabled:opacity-40"
                  >
                    {savingDraw ? '保存中...' : '保存して対戦表に反映'}
                  </button>
                </div>
                {/* 枠のずらし操作。2回戦の相手は4枠ごとのブロックで決まるため、
                    入れ替えだけでは作れない並びを「空き枠の挿入・詰め」で作れるようにする。 */}
                {selectedSlotPos != null && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button
                      onClick={() => handleInsertGap(selectedSlotPos)}
                      className="flex items-center gap-1 text-[10px] font-bold text-gray-700 border border-gray-300 bg-white rounded-full px-2 py-1 hover:bg-gray-100"
                      title="この位置に空き枠を作り、以降の選手を1つずつ下へずらします"
                    >
                      <ArrowDownToLine className="w-3 h-3" />ここに空きを入れて下へずらす
                    </button>
                    {selectedSlotIsEmpty && (
                      <button
                        onClick={() => handleRemoveGap(selectedSlotPos)}
                        className="flex items-center gap-1 text-[10px] font-bold text-gray-700 border border-gray-300 bg-white rounded-full px-2 py-1 hover:bg-gray-100"
                        title="この空き枠を詰めて、以降の選手を1つずつ上へ上げます"
                      >
                        <ArrowUpToLine className="w-3 h-3" />この空きを詰めて上へずらす
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedSlotPos(null)}
                      className="text-[10px] text-gray-500 px-1.5 py-1 hover:text-gray-700"
                    >
                      選択解除
                    </button>
                  </div>
                )}
                <p className="text-[9px] text-gray-500 mt-1 leading-relaxed">
                  2回戦の相手は4枠ずつのまとまりで決まります。「7・8の勝者と9が2回戦で当たる」形にするには、
                  その3人が同じまとまりに入るよう空き枠でずらしてください。
                  入力済みのスコアは、対戦カードが変わらない試合はそのまま引き継がれます。
                </p>
              </div>
            )}
          </div>
        )}

        {/* 種目タブ（小さいドット） */}
        {events.length > 1 && (
          <div className="flex items-center justify-center gap-1 mt-1.5">
            {events.map((evt, i) => (
              <button
                key={evt.eventId}
                onClick={() => setSelectedEventIdx(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === selectedEventIdx
                    ? 'bg-primary-500 scale-125'
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                title={evt.name}
              />
            ))}
          </div>
        )}
      </div>

      {/* ブラケット表示 */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {drawSize > 0 && !isRoundRobin ? (
          <CourtBracketView
            slots={viewSlots}
            drawSize={drawSize}
            matchResults={matchResults}
            eventType={selectedEvent?.type as 'Singles' | 'Doubles' | 'Team'}
            totalRounds={totalRounds}
            onMatchSelect={enableScoreInput ? (round, position) => setSelectedMatchKey(`${round}-${position}`) : undefined}
            onEnterCourt={enableScoreInput ? handleEnterCourt : undefined}
            startRound={editMode ? 0 : startRound}
            editMode={editMode}
            selectedSlotPosition={selectedSlotPos}
            onSlotSelect={handleSlotSelect}
            nameEditMode={nameEditMode}
          />
        ) : isRoundRobin ? (
          <div className="p-3 space-y-3">
            {/* リーグの使用コート（1〜2面を固定で使い、空いたら次の対戦を入れる） */}
            <div className="flex items-center gap-2 flex-wrap rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary-600" />使用コート
              </span>
              {assignedLeagueCourts.length > 0 ? (
                <>
                  {assignedLeagueCourts.map(c => {
                    const isFree = freeAssignedCourts.some(f => f.courtId === c.courtId);
                    return (
                      <span
                        key={c.courtId}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          isFree
                            ? 'bg-primary-50 text-gray-800 border-primary-300'
                            : 'bg-primary-600 text-white border-primary-600'
                        }`}
                      >
                        {c.name}番コート{isFree ? '（空き）' : '（試合中）'}
                      </span>
                    );
                  })}
                </>
              ) : (
                <span className="text-[11px] text-gray-500">未割り当て（試合ごとにコートを選ぶ運用のまま）</span>
              )}
              {enableScoreInput && (
                <button
                  onClick={() => setLeagueCourtDialogOpen(true)}
                  className="ml-auto text-[10px] font-bold text-gray-600 border border-gray-200 bg-gray-50 rounded-full px-2 py-1 hover:bg-gray-100"
                >
                  {assignedLeagueCourts.length > 0 ? 'コートを変更' : 'コートを割り当て'}
                </button>
              )}
            </div>

            {/* リーグ表（星取表・セルタップで直接スコア入力） */}
            <RoundRobinRenderer
              slots={slots}
              matchResults={matchResults}
              onCellSelect={enableScoreInput && !nameEditMode ? (round, position) => setSelectedMatchKey(`${round}-${position}`) : undefined}
              onPlayerSelect={enableScoreInput && nameEditMode ? openNameEditor : undefined}
            />
            {/* 対戦カード（タップでスコア入力） */}
            {rrMatches.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-500 px-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  対戦カード{enableScoreInput ? '（タップでスコア入力）' : ''}
                </div>
                {rrMatches.map(m => {
                  const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
                  const isFinished = m.status === 'finished' || m.status === 'walkover';
                  const isPlaying = m.status === 'playing';
                  const w1 = isFinished && !!m.winnerEntryId && m.winnerEntryId === m.player1EntryId;
                  const w2 = isFinished && !!m.winnerEntryId && m.winnerEntryId === m.player2EntryId;
                  return (
                    <button
                      key={m.matchId}
                      onClick={() => enableScoreInput && setSelectedMatchKey(`${m.round}-${m.position}`)}
                      disabled={!enableScoreInput}
                      className={`w-full text-left rounded-lg border p-2 transition-all ${
                        isPlaying ? 'bg-primary-50 border-2 border-primary-500'
                        : isFinished ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-200 hover:border-primary-300'} ${enableScoreInput ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-center">
                          <span className={`text-sm truncate ${w1 ? 'font-bold text-gray-800' : 'font-semibold text-gray-900'}`}>{m.player1Name}</span>
                        </div>
                        <div className="shrink-0 text-center min-w-[52px]">
                          {isFinished && m.score
                            ? <span className="text-xs font-mono font-bold text-gray-700">{m.score}</span>
                            : <span className="text-[11px] font-bold text-gray-300">vs</span>}
                        </div>
                        <div className="flex-1 min-w-0 text-center">
                          <span className={`text-sm truncate ${w2 ? 'font-bold text-gray-800' : 'font-semibold text-gray-900'}`}>{m.player2Name}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        {court && (isPlaying || isFinished) && (
                          <span className="text-[10px] font-bold text-gray-800">{court.name}番コート</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          isPlaying ? 'bg-primary-100 text-gray-800'
                          : isFinished ? 'bg-gray-200 text-gray-500'
                          : 'bg-gray-100 text-gray-500'}`}>
                          {isPlaying ? '試合中' : isFinished ? '終了' : '待機'}
                        </span>
                        {/* 待機中の対戦は、割り当てコートが空いていればここから入れられる */}
                        {enableScoreInput && !isPlaying && !isFinished && assignedLeagueCourts.length > 0 && (
                          <span
                            role="button"
                            aria-disabled={freeAssignedCourts.length === 0}
                            onClick={e => {
                              e.stopPropagation();
                              if (freeAssignedCourts.length === 0) return;
                              enterLeagueMatch(m);
                            }}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${
                              freeAssignedCourts.length === 0
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700 cursor-pointer'
                            }`}
                          >
                            <Play className="w-3 h-3" />
                            {freeAssignedCourts.length === 0
                              ? 'コート使用中'
                              : freeAssignedCourts.length === 1
                                ? `${freeAssignedCourts[0].name}番コートに入れる`
                                : 'コートに入れる'}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            ドローデータがありません
          </div>
        )}
      </div>

      {/* スコア入力ダイアログ（ドロー画面から試合をタップして入力） */}
      {selectedMatch && (
        <ScoreInputDialog
          match={selectedMatch}
          courts={courts.map(c => ({ courtId: c.courtId, name: c.name, isAvailable: c.isAvailable !== false }))}
          onClose={() => setSelectedMatchKey(null)}
          onMatchUpdate={() => {}}
          getRoundName={(round) => (
            isThirdPlaceMatch(selectedMatch) ? THIRD_PLACE_LABEL : getRoundName(round, totalRounds)
          )}
          isLeague={isRoundRobin}
          gameRuleText={getGameRuleText(selectedEvent, selectedMatch.round, totalRounds)}
          onEditRules={selectedEvent ? () => setRulesDialogOpen(true) : undefined}
          requiredGames={resolveRequiredGames(getGameRuleText(selectedEvent, selectedMatch.round, totalRounds), selectedMatch.round, totalRounds)}
          matchFormat={getMatchFormat(selectedEvent, selectedMatch.round, totalRounds)}
        />
      )}

      {/* 選手名の修正 */}
      {nameEditTarget && (
        <PlayerNameDialog
          target={nameEditTarget}
          onClose={() => setNameEditTarget(null)}
          onSaved={() => setNameEditMode(false)}
        />
      )}

      {/* ゲームルール編集（種目名の下のルール表示をタップ） */}
      {rulesDialogOpen && selectedEvent && (
        <GameRulesDialog event={selectedEvent} onClose={() => setRulesDialogOpen(false)} />
      )}

      {/* リーグの使用コート割り当て */}
      {leagueCourtDialogOpen && (
        <LeagueCourtDialog
          eventName={selectedEvent?.name || ''}
          courts={[...courts]
            .sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0))
            .map(c => {
              const otherLeague = [...leagueCourtMap.entries()]
                .find(([eventId, ids]) => eventId !== selectedEventId && ids.includes(c.courtId));
              const otherName = otherLeague
                ? events.find(e => e.eventId === otherLeague[0])?.name || ''
                : undefined;
              return {
                courtId: c.courtId,
                name: c.name,
                unavailable: c.isAvailable === false,
                takenBy: otherName,
              };
            })}
          selectedCourtIds={assignedLeagueCourts.map(c => c.courtId)}
          onSave={(ids) => void saveLeagueCourts(ids)}
          onClose={() => setLeagueCourtDialogOpen(false)}
        />
      )}

      {/* コート選択（ドロー上のカードをタップしたとき。自動で決めずに運営が選ぶ） */}
      {courtPickMatch && (
        <CourtPickDialog
          eventName={selectedEvent?.name || ''}
          roundName={
            isRoundRobin ? 'リーグ戦'
              : isThirdPlaceMatch(courtPickMatch) ? THIRD_PLACE_LABEL
                : getRoundName(courtPickMatch.round, totalRounds)
          }
          player1Name={courtPickMatch.player1Name}
          player2Name={courtPickMatch.player2Name}
          courts={courtPickList}
          onSelect={enterSelectedCourt}
          onClose={() => setCourtPickKey(null)}
          onScoreInput={() => {
            // コート未選択のままスコア入力へ（結果だけ先に入れる運用に対応）
            const key = `${courtPickMatch.round}-${courtPickMatch.position}`;
            setCourtPickKey(null);
            setSelectedMatchKey(key);
          }}
        />
      )}
    </div>
  );
}
