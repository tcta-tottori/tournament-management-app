import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { findOccupyingMatch, occupiedMessage } from '../../db/courtOccupancy';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import type { Event, RoundGameRule, MatchFormatType } from '../../db/database';
import { ChevronLeft, ChevronRight, MapPin, Trophy, Timer, Layers, Eye, EyeOff } from 'lucide-react';
import CourtBracketView from './CourtBracketView';
import RoundRobinRenderer from '../draw/RoundRobinRenderer';
import ScoreInputDialog from '../score/ScoreInputDialog';
import type { ScoreInputMatch } from '../score/ScoreInputDialog';
import { resolveRequiredGames } from '../score/gameRules';
import { useStandbyMap, matchKey } from '../referee/standbyRanking';
import CourtPickDialog from '../../components/ui/CourtPickDialog';
import EventResultPreview from '../results/EventResultPreview';
import { isEventComplete } from '../results/eventCompletion';

function getGameRulesText(evt: Event | undefined): string {
  if (!evt) return '';
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) {
    const g = evt.gameRules?.games ?? 6;
    return `${g}ゲームマッチ`;
  }
  return rules.map(r => `${r.roundLabel}: ${r.ruleText}`).join(' / ');
}

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/** 回戦に応じたゲームルールを取得 */
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

interface CourtBracketPageProps {
  /** スコア入力を有効にするか（公開ビューでは false で読み取り専用） */
  enableScoreInput?: boolean;
}

export default function CourtBracketPage({ enableScoreInput = true }: CourtBracketPageProps) {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(0);
  // スコア入力対象の試合キー "round-position"
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);

  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

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
  const startRoundLabel = startRound === 0
    ? '全回戦表示'
    : `${getRoundName(startRound + 1, totalRounds)}以降`;
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

  // --- コート選択（タップした試合をどのコートに入れるか運営が選ぶ）---
  /** コート選択ダイアログの対象 "round-position" */
  const [courtPickKey, setCourtPickKey] = useState<string | null>(null);

  // 大会全体の進行中試合（他種目のコート使用も見て空きコートを判定する）
  const playingMatches = useLiveQuery(async () => {
    if (!currentTournamentId) return [];
    const evs = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
    const ids = evs.map(e => e.eventId);
    if (ids.length === 0) return [];
    const all = await db.matches.where('eventId').anyOf(ids).toArray();
    return all.filter(m => m.status === 'playing');
  }, [currentTournamentId]) || [];

  /**
   * コート選択ダイアログ用の全コート一覧（番号順・同名コートは1つにまとめる）。
   * 空き＝選択可、試合中／使用しないコートはグレーで選択できない。
   */
  const courtPickList = useMemo(() => {
    const idToName = new Map(courts.map(c => [c.courtId, c.name]));
    const usedNames = new Set<string>();
    for (const m of playingMatches) {
      const n = m.courtId ? idToName.get(m.courtId) : undefined;
      if (n) usedNames.add(n);
    }
    const sorted = [...courts].sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0));
    const seen = new Set<string>();
    const list: { courtId: string; name: string; status: 'empty' | 'playing' | 'unavailable' }[] = [];
    for (const c of sorted) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const status = c.isAvailable === false
        ? 'unavailable'
        : usedNames.has(c.name) ? 'playing' : 'empty';
      list.push({ courtId: c.courtId, name: c.name, status });
    }
    return list;
  }, [courts, playingMatches]);

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

  // 選んだコートへ実際に投入する
  const enterSelectedCourt = async (courtId: string) => {
    const target = courtPickMatch;
    setCourtPickKey(null);
    if (!target?.id) return;
    const court = (courts || []).find(c => c.courtId === courtId);
    if (!court) return;
    // 他種目を含め、そのコートで進行中の試合があれば投入しない（1コート2試合を防ぐ）
    const occupied = await findOccupyingMatch(court.courtId, target.id);
    if (occupied) {
      alert(occupiedMessage(court.name, occupied));
      return;
    }
    await db.matches.update(target.id, {
      courtId: court.courtId,
      status: 'playing',
      updatedAt: Date.now(),
    });
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
            <h2 className="text-base font-bold text-gray-800 truncate">
              <Trophy className="w-4 h-4 inline-block mr-1 text-amber-500" />
              {selectedEvent?.name || '種目を選択'}
            </h2>
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
            <span className="flex items-center gap-0.5 text-green-600 font-bold">
              <Timer className="w-3 h-3" />
              {progress.playing}試合中
            </span>
          )}
        </div>

        {/* 表示回戦の絞り込み + 結果画像プレビュー */}
        {(canAdjustRounds || resultPreviewOpts) && (
          <div className="flex items-center justify-between gap-2 mt-1.5">
            {canAdjustRounds ? (
              <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1 py-0.5">
                <button
                  onClick={() => setStartRound(Math.max(0, startRound - 1))}
                  disabled={startRound === 0}
                  className="p-0.5 rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="前の回戦を表示する"
                  aria-label="前の回戦を表示する"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setStartRound(null)}
                  className="flex items-center gap-1 px-1.5 text-[10px] font-bold text-gray-600 whitespace-nowrap"
                  title="タップで自動（決着済みの回戦を省略）に戻す"
                >
                  {startRound === 0
                    ? <Eye className="w-3 h-3 text-gray-400" />
                    : <EyeOff className="w-3 h-3 text-primary-500" />}
                  {startRoundLabel}
                </button>
                <button
                  onClick={() => setStartRound(Math.min(maxStartRound, startRound + 1))}
                  disabled={startRound >= maxStartRound}
                  className="p-0.5 rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="終わった回戦を隠す"
                  aria-label="終わった回戦を隠す"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : <span />}
            {resultPreviewOpts && <EventResultPreview opts={resultPreviewOpts} size="sm" />}
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
            slots={slots}
            drawSize={drawSize}
            matchResults={matchResults}
            eventType={selectedEvent?.type as 'Singles' | 'Doubles' | 'Team'}
            totalRounds={totalRounds}
            onMatchSelect={enableScoreInput ? (round, position) => setSelectedMatchKey(`${round}-${position}`) : undefined}
            onEnterCourt={enableScoreInput ? handleEnterCourt : undefined}
            startRound={startRound}
          />
        ) : isRoundRobin ? (
          <div className="p-3 space-y-3">
            {/* リーグ表（星取表・セルタップで直接スコア入力） */}
            <RoundRobinRenderer
              slots={slots}
              matchResults={matchResults}
              onCellSelect={enableScoreInput ? (round, position) => setSelectedMatchKey(`${round}-${position}`) : undefined}
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
                        isPlaying ? 'bg-green-50 border-2 border-green-500'
                        : isFinished ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-200 hover:border-primary-300'} ${enableScoreInput ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-center">
                          <span className={`text-sm truncate ${w1 ? 'font-bold text-primary-700' : 'font-semibold text-gray-900'}`}>{m.player1Name}</span>
                        </div>
                        <div className="shrink-0 text-center min-w-[52px]">
                          {isFinished && m.score
                            ? <span className="text-xs font-mono font-bold text-gray-700">{m.score}</span>
                            : <span className="text-[11px] font-bold text-blue-300">vs</span>}
                        </div>
                        <div className="flex-1 min-w-0 text-center">
                          <span className={`text-sm truncate ${w2 ? 'font-bold text-primary-700' : 'font-semibold text-gray-900'}`}>{m.player2Name}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        {court && (isPlaying || isFinished) && (
                          <span className="text-[10px] font-bold text-green-700">{court.name}番コート</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          isPlaying ? 'bg-green-100 text-green-700'
                          : isFinished ? 'bg-gray-200 text-gray-500'
                          : 'bg-gray-100 text-gray-500'}`}>
                          {isPlaying ? '試合中' : isFinished ? '終了' : '待機'}
                        </span>
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
          getRoundName={(round) => getRoundName(round, totalRounds)}
          isLeague={isRoundRobin}
          gameRuleText={getGameRuleText(selectedEvent, selectedMatch.round, totalRounds)}
          requiredGames={resolveRequiredGames(getGameRuleText(selectedEvent, selectedMatch.round, totalRounds), selectedMatch.round, totalRounds)}
          matchFormat={getMatchFormat(selectedEvent, selectedMatch.round, totalRounds)}
        />
      )}

      {/* コート選択（ドロー上のカードをタップしたとき。自動で決めずに運営が選ぶ） */}
      {courtPickMatch && (
        <CourtPickDialog
          eventName={selectedEvent?.name || ''}
          roundName={getRoundName(courtPickMatch.round, totalRounds)}
          player1Name={courtPickMatch.player1Name}
          player2Name={courtPickMatch.player2Name}
          courts={courtPickList}
          onSelect={enterSelectedCourt}
          onClose={() => setCourtPickKey(null)}
        />
      )}
    </div>
  );
}
