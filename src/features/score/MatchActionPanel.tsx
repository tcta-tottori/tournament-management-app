import { useState, useEffect, useCallback } from 'react';
import { db } from '../../db/database';
import { buildCallText } from '../broadcast/callTextBuilder';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import type { MatchCall, VoiceSettings } from '../broadcast/types';
import {
  Play,
  RotateCcw,
  Volume2,
  Printer,
  X,
  MonitorPlay,
  ChevronRight,
  Trophy,
  VolumeX,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchActionPanelProps {
  match: {
    matchId: string;
    dbId: number;
    round: number;
    position: number;
    matchOrder: number;
    player1Name: string;
    player2Name: string;
    player1Affiliation: string;
    player2Affiliation: string;
    player1EntryId: string | null;
    player2EntryId: string | null;
    score: string;
    winnerEntryId: string | null;
    courtId: string | null;
    status: 'waiting' | 'ready' | 'playing' | 'finished' | 'walkover';
    scheduledTime: string | null;
    eventName: string;
  } | null;
  courts: Array<{ courtId: string; name: string; isAvailable: boolean }>;
  onClose: () => void;
  onMatchUpdate: () => void;
  getRoundName: (round: number) => string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  waiting:  { label: '待機中',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  ready:    { label: '準備完了', bg: 'bg-blue-100',   text: 'text-blue-700' },
  playing:  { label: '試合中',   bg: 'bg-green-100',  text: 'text-green-700' },
  finished: { label: '終了',     bg: 'bg-primary-100', text: 'text-primary-700' },
  walkover: { label: 'W/O',     bg: 'bg-orange-100', text: 'text-orange-700' },
};

// Default voice settings used for broadcast calls
const DEFAULT_VOICE: VoiceSettings = {
  rate: 0.85,
  pitch: 1.1,
  volume: 1.0,
  repeatCount: 2,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MatchActionPanel({
  match,
  courts,
  onClose,
  onMatchUpdate,
  getRoundName,
}: MatchActionPanelProps) {
  // ---- local state ----
  const [scoreInput, setScoreInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const { isSpeaking, speak, stop } = useSpeechSynthesis();

  // Sync score input when a different match is selected
  useEffect(() => {
    setScoreInput(match?.score ?? '');
  }, [match?.matchId, match?.score]);

  // ------------------------------------------------------------------
  // DB helpers
  // ------------------------------------------------------------------

  const updateMatch = useCallback(
    async (fields: Record<string, unknown>) => {
      if (!match) return;
      await db.matches.update(match.dbId, {
        ...fields,
        updatedAt: Date.now(),
      });
      onMatchUpdate();
    },
    [match, onMatchUpdate],
  );

  // ------------------------------------------------------------------
  // Match operations
  // ------------------------------------------------------------------

  const handleStartMatch = async () => {
    if (isProcessing || !match) return;
    setIsProcessing(true);
    try {
      await updateMatch({ status: 'playing' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishMatch = async (winnerNum: 1 | 2) => {
    if (isProcessing || !match) return;
    setIsProcessing(true);
    try {
      const winnerEntryId =
        winnerNum === 1 ? match.player1EntryId : match.player2EntryId;
      const winnerName =
        winnerNum === 1 ? match.player1Name : match.player2Name;
      const winnerAff =
        winnerNum === 1
          ? match.player1Affiliation
          : match.player2Affiliation;

      // Finish current match
      await db.matches.update(match.dbId, {
        status: 'finished',
        score: scoreInput || '(スコア未入力)',
        winnerEntryId,
        updatedAt: Date.now(),
      });

      // Propagate winner to next round
      const nextRound = match.round + 1;
      const nextPosition = Math.ceil(match.position / 2);
      const nextMatch = await db.matches
        .where('eventId')
        .equals(
          (
            await db.matches.get(match.dbId)
          )?.eventId ?? '',
        )
        .filter(
          (m) => m.round === nextRound && m.position === nextPosition,
        )
        .first();

      if (nextMatch?.id) {
        const isUpper = match.position % 2 === 1;
        await db.matches.update(nextMatch.id, {
          ...(isUpper
            ? {
                player1EntryId: winnerEntryId,
                player1Name: winnerName,
                player1Affiliation: winnerAff,
              }
            : {
                player2EntryId: winnerEntryId,
                player2Name: winnerName,
                player2Affiliation: winnerAff,
              }),
          updatedAt: Date.now(),
        });
      }

      onMatchUpdate();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetMatch = async () => {
    if (isProcessing || !match) return;
    if (!confirm('この試合を待機状態にリセットしますか？\nスコアと勝敗結果がクリアされます。')) return;
    setIsProcessing(true);
    try {
      // Clear propagated winner from next round
      const dbMatch = await db.matches.get(match.dbId);
      if (dbMatch) {
        const nextRound = match.round + 1;
        const nextPosition = Math.ceil(match.position / 2);
        const nextMatch = await db.matches
          .where('eventId')
          .equals(dbMatch.eventId)
          .filter(
            (m) => m.round === nextRound && m.position === nextPosition,
          )
          .first();

        if (nextMatch?.id) {
          const isUpper = match.position % 2 === 1;
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? {
                  player1EntryId: null,
                  player1Name: '',
                  player1Affiliation: '',
                }
              : {
                  player2EntryId: null,
                  player2Name: '',
                  player2Affiliation: '',
                }),
            updatedAt: Date.now(),
          });
        }
      }

      // Reset current match
      await db.matches.update(match.dbId, {
        status: 'waiting',
        score: '',
        winnerEntryId: null,
        updatedAt: Date.now(),
      });

      setScoreInput('');
      onMatchUpdate();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignCourt = async (courtId: string) => {
    if (!match) return;
    await updateMatch({ courtId: courtId || null });
  };

  // ------------------------------------------------------------------
  // Broadcast call
  // ------------------------------------------------------------------

  const handleCall = () => {
    if (!match) return;

    const courtName =
      courts.find((c) => c.courtId === match.courtId)?.name ?? '';
    // Extract court number from name (e.g. "A-1コート" -> "A-1", or use courtId)
    const courtNumber = match.courtId
      ? courtName.replace(/コート.*$/, '') || match.courtId
      : '';

    const callData: MatchCall = {
      id: match.dbId,
      eventName: match.eventName,
      round: getRoundName(match.round),
      numberA: parseInt(match.player1EntryId?.replace(/\D/g, '') || '0', 10) || 0,
      nameA: match.player1Name,
      affA: match.player1Affiliation,
      numberB: parseInt(match.player2EntryId?.replace(/\D/g, '') || '0', 10) || 0,
      nameB: match.player2Name,
      affB: match.player2Affiliation,
      type: 'singles',
      status: 'pending',
      courtNumber,
      startTime: match.scheduledTime ?? '',
    };

    const text = buildCallText(callData, courtNumber, match.scheduledTime ?? '');
    speak(text, DEFAULT_VOICE);
  };

  const handleStopCall = () => {
    stop();
  };

  // ------------------------------------------------------------------
  // Print
  // ------------------------------------------------------------------

  const handlePrint = () => {
    if (!match) return;

    const courtName =
      courts.find((c) => c.courtId === match.courtId)?.name ?? '未割当';
    const roundName = getRoundName(match.round);
    const statusLabel = STATUS_CONFIG[match.status]?.label ?? match.status;

    const printWindow = window.open('', '_blank', 'width=600,height=400');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <title>試合情報 #${match.matchOrder}</title>
        <style>
          body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; padding: 24px; }
          h1 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 8px; }
          .info { margin: 12px 0; }
          .players { font-size: 20px; margin: 20px 0; }
          .player { margin: 8px 0; }
          .aff { font-size: 14px; color: #666; margin-left: 8px; }
          .vs { text-align: center; color: #999; margin: 8px 0; }
          .meta { font-size: 14px; color: #555; }
        </style>
      </head>
      <body>
        <h1>試合 #${match.matchOrder} - ${roundName}</h1>
        <div class="info meta">${match.eventName}</div>
        <div class="players">
          <div class="player"><strong>${match.player1Name}</strong><span class="aff">${match.player1Affiliation}</span></div>
          <div class="vs">vs</div>
          <div class="player"><strong>${match.player2Name}</strong><span class="aff">${match.player2Affiliation}</span></div>
        </div>
        <div class="meta">
          <p>ステータス: ${statusLabel}</p>
          <p>コート: ${courtName}</p>
          ${match.score ? `<p>スコア: ${match.score}</p>` : ''}
          ${match.scheduledTime ? `<p>開始予定: ${match.scheduledTime}</p>` : ''}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // ------------------------------------------------------------------
  // Null state
  // ------------------------------------------------------------------

  if (!match) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-lg border border-border-main">
        <MonitorPlay className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">試合を選択してください</p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------

  const roundName = getRoundName(match.round);
  const statusCfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.waiting;
  const isFinished = match.status === 'finished' || match.status === 'walkover';
  const canStart = match.status === 'waiting' || match.status === 'ready';
  const canFinish = match.status === 'playing';
  const canCall = !!match.courtId && !isFinished;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-lg border border-border-main overflow-hidden">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-main bg-gray-50/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-mono">#{match.matchOrder}</span>
            <span>R{match.round}</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-700 truncate">
              {roundName}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {match.eventName}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ---- Scrollable body ---- */}
      <div className="flex-1 overflow-y-auto">
        {/* ---- Players ---- */}
        <div className="px-5 py-4">
          <div className="space-y-1">
            <div
              className={`flex items-center gap-2 ${
                match.winnerEntryId === match.player1EntryId && isFinished
                  ? ''
                  : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={`font-bold text-gray-900 text-base truncate ${
                    match.winnerEntryId === match.player1EntryId && isFinished
                      ? 'text-primary-600'
                      : ''
                  }`}
                >
                  {match.player1Name || '(未定)'}
                  {match.winnerEntryId === match.player1EntryId &&
                    isFinished && (
                      <Trophy className="w-4 h-4 inline ml-1.5 text-yellow-500" />
                    )}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {match.player1Affiliation}
                </p>
              </div>
            </div>

            <p className="text-center text-xs font-semibold text-gray-400 py-0.5 select-none">
              vs
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p
                  className={`font-bold text-gray-900 text-base truncate ${
                    match.winnerEntryId === match.player2EntryId && isFinished
                      ? 'text-primary-600'
                      : ''
                  }`}
                >
                  {match.player2Name || '(未定)'}
                  {match.winnerEntryId === match.player2EntryId &&
                    isFinished && (
                      <Trophy className="w-4 h-4 inline ml-1.5 text-yellow-500" />
                    )}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {match.player2Affiliation}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Status / Court / Score ---- */}
        <div className="px-5 pb-4 space-y-3">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16 shrink-0">ステータス</span>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}
            >
              {statusCfg.label}
            </span>
          </div>

          {/* Court assignment */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16 shrink-0">コート</span>
            <select
              value={match.courtId ?? ''}
              onChange={(e) => handleAssignCourt(e.target.value)}
              className="flex-1 border border-border-main rounded-lg text-sm px-2.5 py-1.5 bg-white focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
            >
              <option value="">未割当</option>
              {courts.map((c) => (
                <option key={c.courtId} value={c.courtId}>
                  {c.name}
                  {!c.isAvailable ? ' (使用中)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Score input */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16 shrink-0">スコア</span>
            <input
              type="text"
              placeholder="例: 6-4 6-3"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              className="flex-1 border border-border-main rounded-lg text-sm px-2.5 py-1.5 bg-white focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 outline-none"
            />
          </div>

          {/* Scheduled time display */}
          {match.scheduledTime && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 shrink-0">予定時刻</span>
              <span className="text-sm text-gray-700 font-medium">
                {match.scheduledTime}
              </span>
            </div>
          )}
        </div>

        {/* ---- Action buttons ---- */}
        <div className="px-5 pb-4">
          <div className="border-t border-border-main pt-4 space-y-2">
            {/* Status transition buttons */}
            <div className="flex flex-wrap gap-2">
              {canStart && (
                <button
                  onClick={handleStartMatch}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  試合開始
                </button>
              )}

              {canFinish && (() => {
                // スコアから勝者を自動判定
                const setParts = scoreInput.trim().split(/\s+/);
                let p1w = 0, p2w = 0;
                for (const part of setParts) {
                  const sm = part.match(/^(\d+)-(\d+)/);
                  if (sm) { const a = +sm[1], b = +sm[2]; if (a > b) p1w++; else if (b > a) p2w++; }
                }
                const aw = p1w > p2w ? 1 : p2w > p1w ? 2 : null;
                return aw ? (
                  <button
                    onClick={() => handleFinishMatch(aw as 1 | 2)}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition-colors shadow-lg shadow-primary-500/25"
                  >
                    <Trophy className="w-4 h-4" />
                    結果確定
                  </button>
                ) : (
                  <p className="text-xs text-gray-400">スコアを入力すると勝者が自動判定されます</p>
                );
              })()}
            </div>

            {/* Reset */}
            {(match.status === 'ready' ||
              match.status === 'playing' ||
              isFinished) && (
              <button
                onClick={handleResetMatch}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-red-300 text-red-600 bg-white hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                リセット
              </button>
            )}
          </div>
        </div>

        {/* ---- Broadcast & Print ---- */}
        <div className="px-5 pb-5">
          <div className="border-t border-border-main pt-4 flex flex-wrap gap-2">
            {/* Call / Stop */}
            {isSpeaking ? (
              <button
                onClick={handleStopCall}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                <VolumeX className="w-4 h-4" />
                停止
              </button>
            ) : (
              <button
                onClick={handleCall}
                disabled={!canCall}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={
                  !match.courtId ? 'コートを割り当ててからコールしてください' : ''
                }
              >
                <Volume2 className="w-4 h-4" />
                コール
              </button>
            )}

            {/* Print */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-border-main text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <Printer className="w-4 h-4" />
              印刷
            </button>
          </div>

          {/* Hint when court not assigned */}
          {!match.courtId && !isFinished && (
            <p className="text-xs text-amber-600 mt-2">
              コールするにはコートを割り当ててください
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
