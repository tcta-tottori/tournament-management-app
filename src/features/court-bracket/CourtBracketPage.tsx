import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import type { Event, RoundGameRule, MatchFormatType } from '../../db/database';
import { ChevronLeft, ChevronRight, MapPin, Trophy, Timer, Layers } from 'lucide-react';
import CourtBracketView from './CourtBracketView';
import ScoreInputDialog from '../score/ScoreInputDialog';
import type { ScoreInputMatch } from '../score/ScoreInputDialog';
import { useStandbyMap } from '../referee/standbyRanking';

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
      const sb = standbyMap.get(m.matchId);
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
  // 進捗
  const progress = useMemo(() => {
    const total = matches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
    const finished = matches.filter(m => m.status === 'finished').length;
    const playing = matches.filter(m => m.status === 'playing').length;
    const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, finished, playing, pct };
  }, [matches]);

  // ラウンドロビン判定
  const isRoundRobin = useMemo(() => {
    if (!drawData) return false;
    if (drawData.drawType === 'roundRobin') return true;
    if (drawData.drawType === 'tournament') return false;
    const realPlayers = slots.filter(s => !s.isBye);
    return realPlayers.length >= 2 && realPlayers.length <= 5 && drawData.drawSize <= 8;
  }, [drawData, slots]);

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
          />
        ) : isRoundRobin ? (
          <div className="p-6 text-center text-gray-500">
            <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            リーグ戦は対応していません
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
          isLeague={false}
          gameRuleText={getGameRuleText(selectedEvent, selectedMatch.round, totalRounds)}
          matchFormat={getMatchFormat(selectedEvent, selectedMatch.round, totalRounds)}
        />
      )}
    </div>
  );
}
