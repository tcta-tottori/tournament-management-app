import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import ScoreboardBracket from './ScoreboardBracket';
import ScoreboardLeague from './ScoreboardLeague';
import ScoreInputDialog from './ScoreInputDialog';
import type { ScoreInputMatch } from './ScoreInputDialog';
import type { Event, RoundGameRule, MatchFormatType } from '../../db/database';
import {
  MonitorPlay,
  Check,
  Play,
  RotateCcw,
  GitBranch,
  LayoutGrid,
  Table2,
  ChevronLeft,
  ChevronRight,
  Printer,
  MapPin,
  Layers,
  Eye,
  Trophy,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/** 回戦に応じたゲームルール情報を取得 */
function getGameRuleForRound(evt: Event | undefined, round: number, totalRounds: number): RoundGameRule | null {
  if (!evt) return null;
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) return null;
  if (rules.length === 1) return rules[0];
  const roundName = getRoundName(round, totalRounds);
  for (const rule of rules) {
    const label = rule.roundLabel;
    if (label === '全回戦') continue;
    const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]), to = parseInt(rangeMatch[2]);
      if (round >= from && round <= to) return rule;
      continue;
    }
    if (label.includes('以降')) {
      const cleanLabel = label.replace('以降', '');
      if (cleanLabel.includes('準々決勝') && round >= totalRounds - 2) return rule;
      if (cleanLabel.includes('準決勝') && round >= totalRounds - 1) return rule;
      if (cleanLabel.includes('決勝') && !cleanLabel.includes('準') && round >= totalRounds) return rule;
      const roundNumMatch = cleanLabel.match(/(\d+)回戦/);
      if (roundNumMatch && round >= parseInt(roundNumMatch[1])) return rule;
      continue;
    }
    if (roundName === label || label.includes(roundName)) return rule;
  }
  return rules[0];
}

function getGameRuleText(evt: Event | undefined, round: number, totalRounds: number): string {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  if (rule) return rule.ruleText;
  const g = evt?.gameRules?.games ?? 6;
  return `${g}ゲームマッチ（${g}-${g}タイブレーク）`;
}

function getMatchFormat(evt: Event | undefined, round: number, totalRounds: number): MatchFormatType {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  return rule?.matchFormat || 'game';
}

/** フルネームから苗字を抽出（ダブルス "A / B" にも対応） */
function getSurname(name: string): string {
  if (!name) return '';
  if (name.includes('/') || name.includes('／')) {
    return name.split(/[/／]/).map(n => getSurname(n.trim())).join('/');
  }
  const parts = name.trim().split(/\s+/);
  return parts[0] || name;
}

/** 経過時間を H:MM 形式で返す */
function formatElapsedMinutes(startedAt: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------
type ViewMode = 'bracket' | 'table';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Scoreboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const matchDuration = useAppStore(state => state.scheduleConfig.matchDuration);

  // -- Event navigation (前種目/次種目) --
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(-1);
  const [showAllEvents, setShowAllEvents] = useState(true); // デフォルト: 全種目表示
  const [viewMode, setViewMode] = useState<ViewMode>('bracket');
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [selectedAllEventId, setSelectedAllEventId] = useState<string | null>(null); // 全種目表示時の選択中種目
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // スクロールでヘッダーを非表示にする
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const y = container.scrollTop;
      if (y > lastScrollY.current && y > 50) {
        setHeaderVisible(false);
      }
      lastScrollY.current = y;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // -- Data queries --
  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  const selectedEventId = events[selectedEventIdx]?.eventId || '';
  const eventIds = useMemo(() => events.map(e => e.eventId), [events]);

  const matches = useLiveQuery(
    () => selectedEventId
      ? db.matches.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  // 全種目表示用: 全イベントの試合データ
  const allMatches = useLiveQuery(
    () => eventIds.length > 0
      ? db.matches.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  // 全種目表示用: 全イベントのドローデータ
  const allDrawsData = useLiveQuery(
    () => eventIds.length > 0
      ? db.draws.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const drawData = useLiveQuery(
    () => selectedEventId
      ? db.draws.where('eventId').equals(selectedEventId).first()
      : undefined,
    [selectedEventId]
  );

  // 全種目表示用: 全イベントのエントリーデータ
  const allEntries = useLiveQuery(
    () => eventIds.length > 0
      ? db.entries.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const entries = useLiveQuery(
    () => selectedEventId
      ? db.entries.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  // -- 経過時間表示用タイマー（30秒ごと更新） --
  const [clockTick, setClockTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // -- Default: 全種目表示。個別表示に切り替えた場合のみidx選択 --
  useEffect(() => {
    if (initializedRef.current) return;
    if (events.length === 0) return;
    if (!showAllEvents) {
      const idx = events.length >= 2 ? events.length - 2 : events.length - 1;
      setSelectedEventIdx(idx);
    }
    initializedRef.current = true;
  }, [events, showAllEvents]);

  // -- Build draw slot data --
  const editedSlots: DrawSlotData[] = useMemo(() => {
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

  // -- Match results for bracket/league --
  const matchResults: MatchResult[] = useMemo(() =>
    matches.map(m => {
      const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      return {
        round: m.round,
        position: m.position,
        player1Name: m.player1Name,
        player2Name: m.player2Name,
        winnerEntryId: m.winnerEntryId,
        player1EntryId: m.player1EntryId,
        player2EntryId: m.player2EntryId,
        score: m.score,
        status: m.status,
        courtId: m.courtId,
        courtName: court?.name || '',
        scheduledTime: m.scheduledTime,
        updatedAt: m.updatedAt,
      };
    }),
    [matches, courts]
  );

  // -- Detect round-robin vs tournament --
  const isRoundRobin = useMemo(() => {
    if (!drawData) return false;
    if (drawData.drawType === 'roundRobin') return true;
    if (drawData.drawType === 'tournament') return false;
    const realPlayers = editedSlots.filter(s => !s.isBye);
    return realPlayers.length >= 2 && realPlayers.length <= 5 && drawData.drawSize <= 8;
  }, [drawData, editedSlots]);

  // -- 全種目表示用ヘルパー: 種目ごとのデータ構築 --
  const perEventData = useMemo(() => {
    if (!showAllEvents) return [];
    return events.map(evt => {
      const evtMatches = allMatches.filter(m => m.eventId === evt.eventId);
      const evtDraw = allDrawsData.find(d => d.eventId === evt.eventId);
      const evtEntries = allEntries.filter(e => e.eventId === evt.eventId);

      const evtSlots: DrawSlotData[] = evtDraw?.slots
        ? evtDraw.slots.map(s => {
            let name = 'BYE';
            let affiliation = '';
            if (!s.isBye && s.entryId) {
              const entry = evtEntries.find(e => e.entryId === s.entryId);
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
          }).sort((a, b) => a.position - b.position)
        : [];

      const evtMatchResults: MatchResult[] = evtMatches.map(m => {
        const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
        return {
          round: m.round, position: m.position,
          player1Name: m.player1Name, player2Name: m.player2Name,
          winnerEntryId: m.winnerEntryId,
          player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
          score: m.score, status: m.status, courtId: m.courtId,
          courtName: court?.name || '', scheduledTime: m.scheduledTime,
          updatedAt: m.updatedAt,
        };
      });

      const realPlayers = evtSlots.filter(s => !s.isBye);
      const evtIsRoundRobin = evtDraw
        ? (evtDraw.drawType === 'roundRobin' ||
           (evtDraw.drawType !== 'tournament' && realPlayers.length >= 2 && realPlayers.length <= 5 && evtDraw.drawSize <= 8))
        : false;

      const total = evtMatches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
      const finished = evtMatches.filter(m => m.status === 'finished').length;
      const playing = evtMatches.filter(m => m.status === 'playing').length;
      const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

      return {
        event: evt,
        matches: evtMatches,
        draw: evtDraw,
        slots: evtSlots,
        matchResults: evtMatchResults,
        isRoundRobin: evtIsRoundRobin,
        totalRounds: evtDraw ? Math.log2(evtDraw.drawSize) : 1,
        progress: { total, finished, playing, pct },
      };
    }).filter(d => d.matches.length > 0);
  }, [showAllEvents, events, allMatches, allDrawsData, allEntries, players, courts]);

  // -- 全種目表示時の選択中マッチ --
  const selectedAllMatch: ScoreInputMatch | null = useMemo(() => {
    if (!showAllEvents || !selectedMatchKey || !selectedAllEventId) return null;
    const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
    if (!evtData) return null;

    const buildMatch = (m: typeof allMatches[0]): ScoreInputMatch => ({
      matchId: m.matchId, dbId: m.id!, round: m.round, position: m.position,
      matchOrder: m.matchOrder, player1Name: m.player1Name, player2Name: m.player2Name,
      player1Affiliation: m.player1Affiliation, player2Affiliation: m.player2Affiliation,
      player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
      score: m.score, winnerEntryId: m.winnerEntryId, courtId: m.courtId,
      status: m.status, scheduledTime: m.scheduledTime,
      eventName: evtData.event.name, updatedAt: m.updatedAt,
    });

    // bracket key: "round-position"
    const parts = selectedMatchKey.split('-');
    if (parts.length === 2) {
      const round = parseInt(parts[0]);
      const position = parseInt(parts[1]);
      if (!isNaN(round) && !isNaN(position)) {
        const m = evtData.matches.find(mt => mt.round === round && mt.position === position);
        if (m) return buildMatch(m);
      }
    }
    // league key: "entryId1-entryId2"
    const lm = evtData.matches.find(m => {
      const k1 = `${m.player1EntryId}-${m.player2EntryId}`;
      const k2 = `${m.player2EntryId}-${m.player1EntryId}`;
      return selectedMatchKey === k1 || selectedMatchKey === k2;
    });
    if (lm) return buildMatch(lm);
    return null;
  }, [showAllEvents, selectedMatchKey, selectedAllEventId, perEventData, allMatches]);

  // -- Total rounds for round name --
  const totalRounds = drawData ? Math.log2(drawData.drawSize) : 1;
  const makeRoundName = useCallback(
    (round: number) => getRoundName(round, totalRounds),
    [totalRounds]
  );

  // -- Selected match for action panel --
  const selectedMatch: ScoreInputMatch | null = useMemo(() => {
    if (!selectedMatchKey) return null;

    const buildMatch = (m: typeof matches[0]): ScoreInputMatch => {
      const event = events[selectedEventIdx];
      return {
        matchId: m.matchId, dbId: m.id!, round: m.round, position: m.position,
        matchOrder: m.matchOrder, player1Name: m.player1Name, player2Name: m.player2Name,
        player1Affiliation: m.player1Affiliation, player2Affiliation: m.player2Affiliation,
        player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
        score: m.score, winnerEntryId: m.winnerEntryId, courtId: m.courtId,
        status: m.status, scheduledTime: m.scheduledTime,
        eventName: event?.name || '', updatedAt: m.updatedAt,
      };
    };

    // For bracket: key is "round-position"
    const bracketParts = selectedMatchKey.split('-');
    if (bracketParts.length === 2) {
      const round = parseInt(bracketParts[0]);
      const position = parseInt(bracketParts[1]);
      if (!isNaN(round) && !isNaN(position)) {
        const m = matches.find(mt => mt.round === round && mt.position === position);
        if (m) return buildMatch(m);
      }
    }

    // For league: key is "entryId1-entryId2"
    const leagueMatch = matches.find(m => {
      const k1 = `${m.player1EntryId}-${m.player2EntryId}`;
      const k2 = `${m.player2EntryId}-${m.player1EntryId}`;
      return selectedMatchKey === k1 || selectedMatchKey === k2;
    });
    if (leagueMatch) return buildMatch(leagueMatch);

    return null;
  }, [selectedMatchKey, matches, events, selectedEventIdx]);

  // -- Match status groups for table view --
  const activeMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'playing')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const waitingMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'waiting' && m.player1Name && m.player2Name)
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const finishedMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'finished' || m.status === 'walkover')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  // -- Court status summary --
  const courtStatus = useMemo(() => {
    const src = showAllEvents ? allMatches : matches;
    const playing = src.filter(m => m.status === 'playing');
    return courts
      .sort((a, b) => a.order - b.order)
      .map(c => {
        const currentMatch = playing.find(m => m.courtId === c.courtId);
        if (!currentMatch) return { ...c, matchInfo: null as string | null, startedAt: 0, eventName: '' };
        const evt = events.find(e => e.eventId === currentMatch.eventId);
        return {
          ...c,
          matchInfo: `${getSurname(currentMatch.player1Name)} vs ${getSurname(currentMatch.player2Name)}`,
          startedAt: currentMatch.updatedAt || 0,
          eventName: evt?.name || '',
        };
      });
  }, [courts, matches, showAllEvents, allMatches, events]);

  // -- 使用中コートの判定（playing/ready で courtId が割り当て済み） --
  const occupiedCourtIds = useMemo(() => {
    const src = showAllEvents ? allMatches : matches;
    return new Set(
      src
        .filter(m => (m.status === 'playing' || m.status === 'ready') && m.courtId)
        .map(m => m.courtId!)
    );
  }, [showAllEvents, allMatches, matches]);

  // -- Event navigation handlers --
  const handlePrevEvent = () => {
    if (selectedEventIdx > 0) {
      setSelectedEventIdx(selectedEventIdx - 1);
      setSelectedMatchKey(null);
    }
  };

  const handleNextEvent = () => {
    if (selectedEventIdx < events.length - 1) {
      setSelectedEventIdx(selectedEventIdx + 1);
      setSelectedMatchKey(null);
    }
  };

  // -- Table view: legacy match operations --

  const handleFinishMatch = async (matchId: string, winnerNum: 1 | 2) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;

      const winnerEntryId = winnerNum === 1 ? match.player1EntryId : match.player2EntryId;
      await db.matches.update(match.id, {
        status: 'finished',
        score: scoreInput || '(スコア未入力)',
        winnerEntryId,
        updatedAt: Date.now()
      });

      // 次ラウンドへの自動進出（リーグ戦では不要）
      if (!isRoundRobin) {
        const nextRound = match.round + 1;
        const nextPosition = Math.ceil(match.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(match.eventId)
          .filter(m => m.round === nextRound && m.position === nextPosition)
          .first();

        if (nextMatch?.id) {
          const winnerName = winnerNum === 1 ? match.player1Name : match.player2Name;
          const winnerAff = winnerNum === 1 ? match.player1Affiliation : match.player2Affiliation;
          const isUpper = match.position % 2 === 1;
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
              : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
            ),
            updatedAt: Date.now()
          });
        }
      }

      setEditingMatchId(null);
      setScoreInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetMatch = async (matchId: string) => {
    if (isProcessing) return;
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    if (!confirm('この試合を待機状態に戻しますか？')) return;
    setIsProcessing(true);
    try {
      // 次ラウンドのクリア（リーグ戦では不要）
      if (!isRoundRobin) {
        const nextRound = match.round + 1;
        const nextPosition = Math.ceil(match.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(match.eventId)
          .filter(m => m.round === nextRound && m.position === nextPosition)
          .first();

        if (nextMatch?.id) {
          const isUpper = match.position % 2 === 1;
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
              : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
            ),
            updatedAt: Date.now()
          });
        }
      }

      await db.matches.update(match.id, {
        status: 'waiting',
        score: '',
        winnerEntryId: null,
        updatedAt: Date.now()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignCourt = async (matchId: string, courtId: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { courtId: courtId || null, updatedAt: Date.now() });
  };

  const getCourtName = (courtId: string | null) => {
    if (!courtId) return '';
    return courts.find(c => c.courtId === courtId)?.name || courtId;
  };

  // -- Bracket/league selection handlers --
  const handleBracketMatchSelect = (round: number, position: number) => {
    const key = `${round}-${position}`;
    setSelectedMatchKey(prev => prev === key ? null : key);
  };

  const handleLeagueMatchSelect = (entryId1: string, entryId2: string) => {
    const key = `${entryId1}-${entryId2}`;
    setSelectedMatchKey(prev => {
      // Check both directions
      const altKey = `${entryId2}-${entryId1}`;
      if (prev === key || prev === altKey) return null;
      return key;
    });
  };

  // -- Print entire bracket --
  const handlePrintBracket = () => {
    window.print();
  };

  // -- Progress stats --
  const progressStats = useMemo(() => {
    const total = matches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
    const finished = matches.filter(m => m.status === 'finished').length;
    const playing = matches.filter(m => m.status === 'playing').length;
    const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, finished, playing, pct };
  }, [matches]);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div ref={scrollContainerRef} className="h-full flex flex-col p-4 md:p-6 mx-auto space-y-4 print:p-0 print:space-y-2 overflow-auto">
      {/* ヘッダー再表示ボタン（非表示時のみ） */}
      {!headerVisible && (
        <button
          onClick={() => setHeaderVisible(true)}
          className="fixed bottom-20 right-3 z-50 bg-primary-600 text-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 active:scale-95 transition-all print:hidden"
          title="メニュー表示"
        >
          <Eye className="w-5 h-5" />
        </button>
      )}
      {/* ===== HEADER ===== */}
      <header className={`flex flex-col gap-3 bg-white p-4 rounded-xl shadow-sm border border-border-main print:shadow-none print:border-none print:p-2 shrink-0 z-10 transition-all duration-300 ${!headerVisible ? 'hidden' : ''}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MonitorPlay className="w-6 h-6 text-primary-500" />
              スコアボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">
              トーナメント／リーグの対戦状況・スコア管理
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 全種目 / 個別 切替 */}
            <div className="flex rounded-lg border border-border-main overflow-hidden">
              <button
                onClick={() => { setShowAllEvents(true); setSelectedMatchKey(null); }}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                  showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /><span className="hidden xs:inline">全種目</span><span className="xs:hidden">全</span>
              </button>
              <button
                onClick={() => {
                  setShowAllEvents(false);
                  setSelectedMatchKey(null);
                  if (selectedEventIdx < 0 && events.length > 0) {
                    setSelectedEventIdx(events.length >= 2 ? events.length - 2 : 0);
                  }
                }}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                  !showAllEvents ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /><span className="hidden xs:inline">個別</span><span className="xs:hidden">1</span>
              </button>
            </div>

            {!showAllEvents && (
              <div className="flex rounded-lg border border-border-main overflow-hidden">
                <button
                  onClick={() => { setViewMode('bracket'); setSelectedMatchKey(null); }}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                    viewMode === 'bracket'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {isRoundRobin ? <LayoutGrid className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
                  {isRoundRobin ? 'リーグ' : 'トーナメント'}
                </button>
                <button
                  onClick={() => { setViewMode('table'); setSelectedMatchKey(null); }}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  テーブル
                </button>
              </div>
            )}
            <button
              onClick={handlePrintBracket}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium bg-white text-gray-600 border border-border-main rounded-lg hover:bg-gray-50 transition-colors print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">印刷</span>
            </button>
          </div>
        </div>

        {/* Event navigator — 個別表示時のみ */}
        {!showAllEvents && (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevEvent}
              disabled={selectedEventIdx <= 0}
              className="p-2 rounded-lg border border-border-main text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors print:hidden"
              title="前種目"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={selectedEventIdx >= 0 ? selectedEventIdx : ''}
              onChange={e => {
                setSelectedEventIdx(Number(e.target.value));
                setSelectedMatchKey(null);
              }}
              className="flex-1 border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
            >
              <option value="" disabled>-- 種目を選択 --</option>
              {events.map((e, i) => (
                <option key={e.eventId} value={i}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>

            <button
              onClick={handleNextEvent}
              disabled={selectedEventIdx >= events.length - 1}
              className="p-2 rounded-lg border border-border-main text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors print:hidden"
              title="次種目"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Progress bar — 個別表示時 */}
        {!showAllEvents && selectedEventId && matches.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-500"
                style={{ width: `${progressStats.pct}%` }}
              />
            </div>
            <span className="font-medium whitespace-nowrap">
              {progressStats.finished}/{progressStats.total} 完了
              {progressStats.playing > 0 && (
                <span className="text-green-600 ml-1">({progressStats.playing} 試合中)</span>
              )}
            </span>
          </div>
        )}
        {/* Progress bar — 全種目表示時（集計） */}
        {showAllEvents && perEventData.length > 0 && (() => {
          const agg = perEventData.reduce((a, d) => ({
            total: a.total + d.progress.total,
            finished: a.finished + d.progress.finished,
            playing: a.playing + d.progress.playing,
          }), { total: 0, finished: 0, playing: 0 });
          const pct = agg.total > 0 ? Math.round((agg.finished / agg.total) * 100) : 0;
          return (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-medium whitespace-nowrap">
                {agg.finished}/{agg.total} 完了
                {agg.playing > 0 && (
                  <span className="text-green-600 ml-1">({agg.playing} 試合中)</span>
                )}
              </span>
            </div>
          );
        })()}
      </header>

      {/* ===== COURT STATUS BAR ===== */}
      {!headerVisible ? null : courtStatus.length > 0 && (showAllEvents || selectedEventId) && (
        <div className="flex gap-2 overflow-x-auto pb-1 print:hidden shrink-0">
          {courtStatus.map(c => {
            const isOver = c.matchInfo && c.startedAt > 0 && (clockTick - c.startedAt) > matchDuration * 60 * 1000;
            return (
              <div
                key={c.courtId}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  isOver
                    ? 'bg-red-50 border-red-400 text-red-700 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                    : c.matchInfo
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : c.isAvailable
                        ? 'bg-white border-border-main text-gray-500'
                        : 'bg-gray-100 border-gray-300 text-gray-400'
                }`}
              >
                <MapPin className={`w-3 h-3 ${isOver ? 'text-red-500' : ''}`} />
                <span className="font-bold">{c.name}</span>
                {isOver && <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />}
                {c.matchInfo && (
                  <>
                    {c.eventName && <span className={`text-[10px] truncate max-w-[80px] ${isOver ? 'text-red-400' : 'text-green-500'}`}>{c.eventName}</span>}
                    <span className={`truncate max-w-[120px] ${isOver ? 'text-red-600' : 'text-green-600'}`}>{c.matchInfo}</span>
                    {c.startedAt > 0 && (
                      <span className={`text-[10px] font-mono whitespace-nowrap ${isOver ? 'text-red-500 font-bold' : 'text-green-500'}`}>{formatElapsedMinutes(c.startedAt, clockTick)}</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      {showAllEvents ? (
        /* ===== 全種目表示 ===== */
        <div className="flex-1 flex flex-col gap-6 overflow-auto">
          {perEventData.length === 0 ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-xl border border-border-main shadow-sm min-h-64">
              <p className="font-semibold text-gray-500">試合データがありません</p>
            </div>
          ) : (
            perEventData.map(evtData => {
              return (
                <section key={evtData.event.eventId} className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
                  {/* Event header — sticky */}
                  <div className="px-4 py-3 bg-gradient-to-r from-primary-50 to-white border-b border-border-main sticky -top-4 md:-top-6 z-[5] shadow-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {evtData.isRoundRobin
                          ? <LayoutGrid className="w-4 h-4 text-primary-500" />
                          : <GitBranch className="w-4 h-4 text-primary-500" />
                        }
                        {evtData.event.name}
                        <span className="text-xs font-normal text-gray-500">({evtData.event.type})</span>
                      </h2>
                      <span className="text-xs text-gray-500 font-medium">
                        {evtData.progress.finished}/{evtData.progress.total} 完了
                        {evtData.progress.playing > 0 && (
                          <span className="text-green-600 ml-1">({evtData.progress.playing} 試合中)</span>
                        )}
                      </span>
                    </div>
                    {/* Per-event mini progress bar */}
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-500"
                        style={{ width: `${evtData.progress.pct}%` }}
                      />
                    </div>
                  </div>
                  {/* Bracket / League */}
                  <div className="min-h-[200px]">
                    {evtData.slots.length > 0 && evtData.draw ? (
                      evtData.isRoundRobin ? (
                        <ScoreboardLeague
                          slots={evtData.slots}
                          matchResults={evtData.matchResults}
                          onMatchSelect={(e1, e2) => {
                            setSelectedAllEventId(evtData.event.eventId);
                            const key = `${e1}-${e2}`;
                            setSelectedMatchKey(prev => {
                              const altKey = `${e2}-${e1}`;
                              if (prev === key || prev === altKey) return null;
                              return key;
                            });
                          }}
                          selectedMatchKey={selectedAllEventId === evtData.event.eventId ? selectedMatchKey : null}
                        />
                      ) : (
                        <ScoreboardBracket
                          slots={evtData.slots}
                          drawSize={evtData.draw.drawSize}
                          matchResults={evtData.matchResults}
                          eventType={evtData.event.type}
                          selectedMatchId={selectedAllEventId === evtData.event.eventId ? selectedMatchKey : null}
                          onMatchSelect={(round, pos) => {
                            setSelectedAllEventId(evtData.event.eventId);
                            const key = `${round}-${pos}`;
                            setSelectedMatchKey(prev => prev === key ? null : key);
                          }}
                        />
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <MonitorPlay className="w-12 h-12 text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500">試合を生成してください</p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          )}

          {/* Score input dialog for all-events mode */}
          {selectedAllMatch && (
            <ScoreInputDialog
              match={selectedAllMatch}
              courts={courts.filter(c => c.isAvailable).map(c => ({
                courtId: c.courtId,
                name: c.name,
                isAvailable: !occupiedCourtIds.has(c.courtId) || c.courtId === selectedAllMatch.courtId,
              }))}
              onClose={() => { setSelectedMatchKey(null); setSelectedAllEventId(null); }}
              onMatchUpdate={() => {}}
              getRoundName={(round) => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getRoundName(round, evtData.totalRounds) : `${round}回戦`;
              }}
              isLeague={perEventData.find(d => d.event.eventId === selectedAllEventId)?.isRoundRobin}
              gameRuleText={(() => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getGameRuleText(evtData.event, selectedAllMatch.round, evtData.totalRounds) : '';
              })()}
              matchFormat={(() => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getMatchFormat(evtData.event, selectedAllMatch.round, evtData.totalRounds) : 'game';
              })()}
            />
          )}
        </div>
      ) : !selectedEventId || selectedEventIdx < 0 ? (
        <div className="flex items-center justify-center p-8 bg-white rounded-xl border border-border-main shadow-sm min-h-64">
          <p className="font-semibold text-gray-500">種目を選択してください</p>
        </div>
      ) : viewMode === 'bracket' ? (
        /* ===== BRACKET / LEAGUE VIEW (MAIN) ===== */
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Bracket/League area */}
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden shadow-sm border border-border-main bg-white">
            {editedSlots.length > 0 && drawData ? (
              isRoundRobin ? (
                <ScoreboardLeague
                  slots={editedSlots}
                  matchResults={matchResults}
                  onMatchSelect={handleLeagueMatchSelect}
                  selectedMatchKey={selectedMatchKey}
                />
              ) : (
                <ScoreboardBracket
                  slots={editedSlots}
                  drawSize={drawData.drawSize}
                  matchResults={matchResults}
                  eventType={events[selectedEventIdx]?.type}
                  selectedMatchId={selectedMatchKey}
                  onMatchSelect={handleBracketMatchSelect}
                />
              )
            ) : matches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <MonitorPlay className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-500">エントリーを確定して試合を生成してください</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <GitBranch className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-500">ドロー表が見つかりません。テーブル表示に切り替えてください。</p>
              </div>
            )}
          </div>

          {/* Score input dialog (popup) */}
          {selectedMatch && (
            <ScoreInputDialog
              match={selectedMatch}
              courts={courts.filter(c => c.isAvailable).map(c => ({
                courtId: c.courtId,
                name: c.name,
                isAvailable: !occupiedCourtIds.has(c.courtId) || c.courtId === selectedMatch.courtId,
              }))}
              onClose={() => setSelectedMatchKey(null)}
              onMatchUpdate={() => {}}
              getRoundName={makeRoundName}
              isLeague={isRoundRobin}
              gameRuleText={getGameRuleText(events[selectedEventIdx], selectedMatch.round, totalRounds)}
              matchFormat={getMatchFormat(events[selectedEventIdx], selectedMatch.round, totalRounds)}
            />
          )}
        </div>
      ) : (
        /* ===== TABLE VIEW (LEGACY) ===== */
        <div className="flex-1 flex flex-col gap-6 overflow-auto">
          {/* 試合中 */}
          {activeMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Play className="w-4 h-4" /> 進行中 ({activeMatches.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {activeMatches.map(m => {
                  // テーブルビュー用: スコアから勝者自動判定
                  const tableAutoWinner = (() => {
                    if (!scoreInput || editingMatchId !== m.matchId) return null;
                    const setParts = scoreInput.trim().split(/\s+/);
                    let p1w = 0, p2w = 0;
                    for (const part of setParts) {
                      const sm = part.match(/^(\d+)-(\d+)/);
                      if (sm) { const a = +sm[1], b = +sm[2]; if (a > b) p1w++; else if (b > a) p2w++; }
                    }
                    if (p1w > p2w) return 1 as const;
                    if (p2w > p1w) return 2 as const;
                    return null;
                  })();
                  return (
                    <div key={m.matchId} className="bg-white rounded-xl shadow-sm border-2 border-green-600/40 p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-mono text-gray-500">#{m.matchOrder} R{m.round}</span>
                        {m.courtId && <span className="text-xs bg-primary-50 text-primary-500 px-2 py-0.5 rounded font-medium">{getCourtName(m.courtId)}</span>}
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-600">
                          試合中
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 truncate">{m.player1Name}</p>
                            <p className="text-xs text-gray-500">{m.player1Affiliation}</p>
                          </div>
                        </div>
                        <div className="text-center text-xs text-gray-500">vs</div>
                        <div className="flex items-center">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 truncate">{m.player2Name}</p>
                            <p className="text-xs text-gray-500">{m.player2Affiliation}</p>
                          </div>
                        </div>
                      </div>
                      {editingMatchId === m.matchId ? (
                        <div className="mt-3 pt-3 border-t border-border-main space-y-2">
                          <input
                            type="text" placeholder="スコア (例: 6-4 6-3)" value={scoreInput}
                            onChange={e => setScoreInput(e.target.value)}
                            className="w-full border border-border-main rounded-lg px-2 py-1 text-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
                          />
                          {tableAutoWinner ? (
                            <button onClick={() => handleFinishMatch(m.matchId, tableAutoWinner)} disabled={isProcessing}
                              className="w-full text-xs bg-primary-600 text-white px-3 py-2 rounded-md font-bold hover:bg-primary-700 disabled:opacity-50">
                              <Trophy className="w-3 h-3 inline mr-1" />
                              結果確定 ({tableAutoWinner === 1 ? getSurname(m.player1Name) : getSurname(m.player2Name)} 勝利)
                            </button>
                          ) : (
                            <p className="text-xs text-gray-400 text-center">スコアを入力すると勝者が自動判定されます</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-border-main flex items-center gap-2">
                          {m.status === 'playing' && (
                            <button onClick={() => { setEditingMatchId(m.matchId); setScoreInput(''); }}
                              className="text-xs bg-primary-500 text-white px-3 py-2 rounded-md font-medium hover:bg-primary-600">
                              <Check className="w-3 h-3 inline mr-1" />結果入力
                            </button>
                          )}
                          {m.status === 'playing' && m.updatedAt > 0 && (
                            <span className="ml-auto text-xs text-green-500 font-mono whitespace-nowrap">
                              {formatElapsedMinutes(m.updatedAt, clockTick)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 待機中 */}
          {waitingMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                待機中 ({waitingMatches.length})
              </h2>
              <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-primary-50 text-xs font-semibold text-gray-900">
                    <tr>
                      <th className="py-2 px-2 sm:px-3 w-8 sm:w-10 border-b-2 border-border-main">#</th>
                      <th className="py-2 px-2 sm:px-3 border-b-2 border-border-main">対戦</th>
                      <th className="py-2 px-2 sm:px-3 w-24 sm:w-32 border-b-2 border-border-main">コート</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingMatches.map((m, idx) => (
                      <tr key={m.matchId} className={`border-b border-border-main hover:bg-primary-50 ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                        <td className="py-2 px-2 sm:px-3 font-mono text-gray-500">{m.matchOrder}</td>
                        <td className="py-2 px-2 sm:px-3">
                          <span className="font-medium">{m.player1Name}</span>
                          <span className="text-gray-500 mx-1 sm:mx-2">vs</span>
                          <span className="font-medium">{m.player2Name}</span>
                        </td>
                        <td className="py-2 px-3">
                          <select value={m.courtId || ''} onChange={e => handleAssignCourt(m.matchId, e.target.value)}
                            className="w-full border-border-main rounded-lg text-xs px-2 py-1 bg-white border">
                            <option value="">未割当</option>
                            {courts.filter(c => c.isAvailable && (!occupiedCourtIds.has(c.courtId) || c.courtId === m.courtId)).map(c => (
                              <option key={c.courtId} value={c.courtId}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 終了済み */}
          {finishedMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-primary-500 uppercase tracking-wider mb-3">
                終了 ({finishedMatches.length})
              </h2>
              <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-primary-50 text-xs font-semibold text-gray-900">
                    <tr>
                      <th className="py-2 px-3 w-10 border-b-2 border-border-main">#</th>
                      <th className="py-2 px-3 border-b-2 border-border-main">勝者</th>
                      <th className="py-2 px-3 border-b-2 border-border-main">敗者</th>
                      <th className="py-2 px-3 w-28 border-b-2 border-border-main">スコア</th>
                      <th className="py-2 px-3 w-16 border-b-2 border-border-main"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishedMatches.map((m, idx) => {
                      const isP1Winner = m.winnerEntryId === m.player1EntryId;
                      const winner = isP1Winner ? m.player1Name : m.player2Name;
                      const loser = isP1Winner ? m.player2Name : m.player1Name;
                      return (
                        <tr key={m.matchId} className={`border-b border-border-main hover:bg-primary-50 ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                          <td className="py-2 px-3 font-mono text-gray-500">{m.matchOrder}</td>
                          <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">{winner}</td>
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{loser || 'BYE'}</td>
                          <td className="py-2 px-3 font-mono font-bold text-gray-800">{m.score || (m.status === 'walkover' ? 'W/O' : '-')}</td>
                          <td className="py-2 px-3">
                            <button onClick={() => handleResetMatch(m.matchId)} disabled={isProcessing}
                              className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-50" title="リセット">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {matches.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-border-main">
              <MonitorPlay className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500">エントリーを確定して試合を生成してください</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
