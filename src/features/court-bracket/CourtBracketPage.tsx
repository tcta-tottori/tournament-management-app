import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import type { Event, RoundGameRule } from '../../db/database';
import { ChevronLeft, ChevronRight, MapPin, Trophy, Timer, Layers } from 'lucide-react';
import CourtBracketView from './CourtBracketView';

function getGameRulesText(evt: Event | undefined): string {
  if (!evt) return '';
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) {
    const g = evt.gameRules?.games ?? 6;
    return `${g}ゲームマッチ`;
  }
  return rules.map(r => `${r.roundLabel}: ${r.ruleText}`).join(' / ');
}

export default function CourtBracketPage() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(0);

  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  const selectedEventId = events[selectedEventIdx]?.eventId || '';
  const selectedEvent = events[selectedEventIdx];

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
      return {
        round: m.round, position: m.position,
        player1Name: m.player1Name, player2Name: m.player2Name,
        winnerEntryId: m.winnerEntryId,
        player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
        score: m.score, status: m.status, courtId: m.courtId,
        courtName: court?.name || '', scheduledTime: m.scheduledTime,
        updatedAt: m.updatedAt,
      };
    }),
    [matches, courts]
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

  if (!currentTournamentId) {
    return (
      <div className="p-6 text-center text-gray-500">
        大会を選択してください
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー: 種目選択 + ルール */}
      <div className="shrink-0 bg-white border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedEventIdx(Math.max(0, selectedEventIdx - 1))}
            disabled={selectedEventIdx <= 0}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
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
            onClick={() => setSelectedEventIdx(Math.min(events.length - 1, selectedEventIdx + 1))}
            disabled={selectedEventIdx >= events.length - 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
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
    </div>
  );
}
