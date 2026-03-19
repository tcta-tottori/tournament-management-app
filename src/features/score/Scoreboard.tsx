import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import ScoreboardBracket from './ScoreboardBracket';
import ScoreboardLeague from './ScoreboardLeague';
import MatchActionPanel from './MatchActionPanel';
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

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------
type ViewMode = 'bracket' | 'table';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Scoreboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  // -- Event navigation (前種目/次種目) --
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(-1);
  const [viewMode, setViewMode] = useState<ViewMode>('bracket');
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);

  // -- Data queries --
  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  const selectedEventId = events[selectedEventIdx]?.eventId || '';

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

  // -- Default to previous event (前種目表示) --
  useEffect(() => {
    if (initializedRef.current) return;
    if (events.length === 0) return;
    // Default: show the second-to-last event (前種目), or last if only one
    const idx = events.length >= 2 ? events.length - 2 : events.length - 1;
    setSelectedEventIdx(idx);
    initializedRef.current = true;
  }, [events]);

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

  // -- Total rounds for round name --
  const totalRounds = drawData ? Math.log2(drawData.drawSize) : 1;
  const makeRoundName = useCallback(
    (round: number) => getRoundName(round, totalRounds),
    [totalRounds]
  );

  // -- Selected match for action panel --
  const selectedMatch = useMemo(() => {
    if (!selectedMatchKey) return null;

    // For bracket: key is "round-position"
    const bracketParts = selectedMatchKey.split('-');
    if (bracketParts.length === 2) {
      const round = parseInt(bracketParts[0]);
      const position = parseInt(bracketParts[1]);
      if (!isNaN(round) && !isNaN(position)) {
        const m = matches.find(mt => mt.round === round && mt.position === position);
        if (m) {
          const event = events[selectedEventIdx];
          return {
            matchId: m.matchId,
            dbId: m.id!,
            round: m.round,
            position: m.position,
            matchOrder: m.matchOrder,
            player1Name: m.player1Name,
            player2Name: m.player2Name,
            player1Affiliation: m.player1Affiliation,
            player2Affiliation: m.player2Affiliation,
            player1EntryId: m.player1EntryId,
            player2EntryId: m.player2EntryId,
            score: m.score,
            winnerEntryId: m.winnerEntryId,
            courtId: m.courtId,
            status: m.status,
            scheduledTime: m.scheduledTime,
            eventName: event?.name || '',
          };
        }
      }
    }

    // For league: key is "entryId1-entryId2" (entryIds can contain dashes)
    // Try to find a match by scanning
    const leagueMatch = matches.find(m => {
      const k1 = `${m.player1EntryId}-${m.player2EntryId}`;
      const k2 = `${m.player2EntryId}-${m.player1EntryId}`;
      return selectedMatchKey === k1 || selectedMatchKey === k2;
    });
    if (leagueMatch) {
      const event = events[selectedEventIdx];
      return {
        matchId: leagueMatch.matchId,
        dbId: leagueMatch.id!,
        round: leagueMatch.round,
        position: leagueMatch.position,
        matchOrder: leagueMatch.matchOrder,
        player1Name: leagueMatch.player1Name,
        player2Name: leagueMatch.player2Name,
        player1Affiliation: leagueMatch.player1Affiliation,
        player2Affiliation: leagueMatch.player2Affiliation,
        player1EntryId: leagueMatch.player1EntryId,
        player2EntryId: leagueMatch.player2EntryId,
        score: leagueMatch.score,
        winnerEntryId: leagueMatch.winnerEntryId,
        courtId: leagueMatch.courtId,
        status: leagueMatch.status,
        scheduledTime: leagueMatch.scheduledTime,
        eventName: event?.name || '',
      };
    }

    return null;
  }, [selectedMatchKey, matches, events, selectedEventIdx]);

  // -- Match status groups for table view --
  const activeMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'playing' || m.status === 'ready')
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
    const playing = matches.filter(m => m.status === 'playing');
    return courts
      .sort((a, b) => a.order - b.order)
      .map(c => {
        const currentMatch = playing.find(m => m.courtId === c.courtId);
        return {
          ...c,
          matchInfo: currentMatch
            ? `${currentMatch.player1Name} vs ${currentMatch.player2Name}`
            : null,
        };
      });
  }, [courts, matches]);

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
  const handleStartMatch = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;
      await db.matches.update(match.id, { status: 'playing', updatedAt: Date.now() });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReadyMatch = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;
      await db.matches.update(match.id, { status: 'ready', updatedAt: Date.now() });
    } finally {
      setIsProcessing(false);
    }
  };

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
    <div className="h-full flex flex-col p-4 md:p-6 mx-auto space-y-4 print:p-0 print:space-y-2">
      {/* ===== HEADER ===== */}
      <header className="flex flex-col gap-3 bg-white p-4 rounded-xl shadow-sm border border-border-main print:shadow-none print:border-none print:p-2 shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MonitorPlay className="w-6 h-6 text-primary-500" />
              スコアボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              トーナメント／リーグの対戦状況・スコア管理
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border-main overflow-hidden">
              <button
                onClick={() => { setViewMode('bracket'); setSelectedMatchKey(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  viewMode === 'bracket'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {isRoundRobin ? <LayoutGrid className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
                {isRoundRobin ? 'リーグ' : 'ブラケット'}
              </button>
              <button
                onClick={() => { setViewMode('table'); setSelectedMatchKey(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                テーブル
              </button>
            </div>
            <button
              onClick={handlePrintBracket}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white text-gray-600 border border-border-main rounded-lg hover:bg-gray-50 transition-colors print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              印刷
            </button>
          </div>
        </div>

        {/* Event navigator with prev/next */}
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

        {/* Progress bar */}
        {selectedEventId && matches.length > 0 && (
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
      </header>

      {/* ===== COURT STATUS BAR ===== */}
      {courtStatus.length > 0 && selectedEventId && (
        <div className="flex gap-2 overflow-x-auto pb-1 print:hidden shrink-0">
          {courtStatus.map(c => (
            <div
              key={c.courtId}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                c.matchInfo
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : c.isAvailable
                    ? 'bg-white border-border-main text-gray-500'
                    : 'bg-gray-100 border-gray-300 text-gray-400'
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span className="font-bold">{c.name}</span>
              {c.matchInfo && (
                <span className="text-green-600 truncate max-w-[160px]">{c.matchInfo}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      {!selectedEventId || selectedEventIdx < 0 ? (
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

          {/* Action panel (right side) */}
          <div className="w-80 shrink-0 print:hidden hidden lg:block">
            <MatchActionPanel
              match={selectedMatch}
              courts={courts.filter(c => c.isAvailable).map(c => ({
                courtId: c.courtId,
                name: c.name,
                isAvailable: c.isAvailable,
              }))}
              onClose={() => setSelectedMatchKey(null)}
              onMatchUpdate={() => {
                // Live query auto-updates; just clear selection if needed
              }}
              getRoundName={makeRoundName}
            />
          </div>

          {/* Mobile action panel (bottom sheet) */}
          {selectedMatch && (
            <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden print:hidden">
              <div className="bg-black/20 fixed inset-0" onClick={() => setSelectedMatchKey(null)} />
              <div className="relative max-h-[70vh] overflow-y-auto">
                <MatchActionPanel
                  match={selectedMatch}
                  courts={courts.filter(c => c.isAvailable).map(c => ({
                    courtId: c.courtId,
                    name: c.name,
                    isAvailable: c.isAvailable,
                  }))}
                  onClose={() => setSelectedMatchKey(null)}
                  onMatchUpdate={() => {}}
                  getRoundName={makeRoundName}
                />
              </div>
            </div>
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
                {activeMatches.map(m => (
                  <div key={m.matchId} className="bg-white rounded-xl shadow-sm border-2 border-green-600/40 p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-mono text-gray-500">#{m.matchOrder} R{m.round}</span>
                      {m.courtId && <span className="text-xs bg-primary-50 text-primary-500 px-2 py-0.5 rounded font-medium">{getCourtName(m.courtId)}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'playing' ? 'bg-green-100 text-green-600' : 'bg-primary-50 text-primary-500'}`}>
                        {m.status === 'playing' ? '試合中' : '準備完了'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 whitespace-nowrap">{m.player1Name}</p>
                          <p className="text-xs text-gray-500">{m.player1Affiliation}</p>
                        </div>
                        {editingMatchId === m.matchId && (
                          <button onClick={() => handleFinishMatch(m.matchId, 1)} disabled={isProcessing}
                            className="ml-2 bg-primary-500 text-white text-sm px-3 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50">
                            勝利
                          </button>
                        )}
                      </div>
                      <div className="text-center text-xs text-gray-500">vs</div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 whitespace-nowrap">{m.player2Name}</p>
                          <p className="text-xs text-gray-500">{m.player2Affiliation}</p>
                        </div>
                        {editingMatchId === m.matchId && (
                          <button onClick={() => handleFinishMatch(m.matchId, 2)} disabled={isProcessing}
                            className="ml-2 bg-primary-500 text-white text-sm px-3 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50">
                            勝利
                          </button>
                        )}
                      </div>
                    </div>
                    {editingMatchId === m.matchId ? (
                      <div className="mt-3 pt-3 border-t border-border-main">
                        <input
                          type="text" placeholder="スコア (例: 6-4 6-3)" value={scoreInput}
                          onChange={e => setScoreInput(e.target.value)}
                          className="w-full border border-border-main rounded-lg px-2 py-1 text-sm mb-2 focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
                        />
                        <p className="text-xs text-gray-500">スコア入力後、勝者ボタンを押してください</p>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-border-main flex gap-2">
                        {m.status === 'ready' && (
                          <button onClick={() => handleStartMatch(m.matchId)} disabled={isProcessing}
                            className="text-xs bg-green-600 text-white px-3 py-2 rounded-md font-medium hover:bg-green-700 disabled:opacity-50">
                            開始
                          </button>
                        )}
                        {m.status === 'playing' && (
                          <button onClick={() => { setEditingMatchId(m.matchId); setScoreInput(''); }}
                            className="text-xs bg-primary-500 text-white px-3 py-2 rounded-md font-medium hover:bg-primary-600">
                            <Check className="w-3 h-3 inline mr-1" />結果入力
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-primary-50 text-xs font-semibold text-gray-900">
                    <tr>
                      <th className="py-2 px-3 w-10 border-b-2 border-border-main">#</th>
                      <th className="py-2 px-3 border-b-2 border-border-main">対戦</th>
                      <th className="py-2 px-3 w-32 border-b-2 border-border-main">コート</th>
                      <th className="py-2 px-3 w-24 border-b-2 border-border-main"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingMatches.map((m, idx) => (
                      <tr key={m.matchId} className={`border-b border-border-main hover:bg-primary-50 ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                        <td className="py-2 px-3 font-mono text-gray-500">{m.matchOrder}</td>
                        <td className="py-2 px-3">
                          <span className="font-medium whitespace-nowrap">{m.player1Name}</span>
                          <span className="text-gray-500 mx-2">vs</span>
                          <span className="font-medium whitespace-nowrap">{m.player2Name}</span>
                        </td>
                        <td className="py-2 px-3">
                          <select value={m.courtId || ''} onChange={e => handleAssignCourt(m.matchId, e.target.value)}
                            className="w-full border-border-main rounded-lg text-xs px-2 py-1 bg-white border">
                            <option value="">未割当</option>
                            {courts.filter(c => c.isAvailable).map(c => (
                              <option key={c.courtId} value={c.courtId}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <button onClick={() => handleReadyMatch(m.matchId)} disabled={isProcessing}
                            className="text-xs bg-primary-500 text-white px-3 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50">
                            準備完了
                          </button>
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
                          <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{loser || 'BYE'}</td>
                          <td className="py-2 px-3 font-mono">{m.score || (m.status === 'walkover' ? 'W/O' : '-')}</td>
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
