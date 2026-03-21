import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../db/database';
import { buildCallText } from '../broadcast/callTextBuilder';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import type { MatchCall, VoiceSettings } from '../broadcast/types';
import {
  X,
  Trophy,
  Play,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  Timer,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreInputMatch {
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
  updatedAt?: number;
}

interface ScoreInputDialogProps {
  match: ScoreInputMatch | null;
  courts: Array<{ courtId: string; name: string; isAvailable: boolean }>;
  onClose: () => void;
  onMatchUpdate: () => void;
  getRoundName: (round: number) => string;
  bestOf?: number; // 何セットマッチか（デフォルト1セットマッチ）
  isLeague?: boolean; // リーグ戦の場合は次ラウンド進出を行わない
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  waiting:  { label: '待機中',   bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  ready:    { label: '準備完了', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  playing:  { label: '試合中',   bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500' },
  finished: { label: '終了',     bg: 'bg-primary-100', text: 'text-primary-700', dot: 'bg-primary-500' },
  walkover: { label: 'W/O',     bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-400' },
};

const DEFAULT_VOICE: VoiceSettings = { rate: 0.85, pitch: 1.1, volume: 1.0, repeatCount: 2 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreInputDialog({
  match,
  courts,
  onClose,
  onMatchUpdate,
  getRoundName,
  bestOf = 1,
  isLeague = false,
}: ScoreInputDialogProps) {
  // セットスコア入力（最大3セット）
  const maxSets = bestOf >= 3 ? 3 : 1;
  const [sets, setSets] = useState<{ p1: string; p2: string }[]>(
    Array.from({ length: maxSets }, () => ({ p1: '', p2: '' }))
  );
  const [tiebreaks, setTiebreaks] = useState<(string | null)[]>(
    Array.from({ length: maxSets }, () => null)
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { isSpeaking, speak, stop } = useSpeechSynthesis();

  // 試合が変わったらスコアを同期
  useEffect(() => {
    if (!match) return;
    if (match.score && match.status === 'finished') {
      // 既存スコアをパース: "6-4" or "6-4 7-5" or "6-4 6-7(3) 6-2"
      const setParts = match.score.split(/\s+/);
      const newSets = Array.from({ length: maxSets }, () => ({ p1: '', p2: '' }));
      const newTB = Array.from<string | null>({ length: maxSets }).fill(null);
      for (let i = 0; i < setParts.length && i < maxSets; i++) {
        const tbMatch = setParts[i].match(/^(\d+)-(\d+)\((\d+)\)$/);
        if (tbMatch) {
          newSets[i] = { p1: tbMatch[1], p2: tbMatch[2] };
          newTB[i] = tbMatch[3];
        } else {
          const scoreMatch = setParts[i].match(/^(\d+)-(\d+)$/);
          if (scoreMatch) {
            newSets[i] = { p1: scoreMatch[1], p2: scoreMatch[2] };
          }
        }
      }
      setSets(newSets);
      setTiebreaks(newTB);
    } else {
      setSets(Array.from({ length: maxSets }, () => ({ p1: '', p2: '' })));
      setTiebreaks(Array.from({ length: maxSets }, () => null));
    }
  }, [match?.matchId, match?.score, match?.status, maxSets]);

  // 経過時間タイマー
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!match || match.status !== 'playing') {
      setElapsedTime('');
      return;
    }
    const startedAt = match.updatedAt || Date.now();
    const update = () => {
      const diff = Math.floor((Date.now() - startedAt) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsedTime(h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
      );
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [match?.matchId, match?.status, match?.updatedAt]);

  // タイブレーク判定（各セット）— 6-6 TB (7-6) & 8-8 TB (9-8) に対応
  const tiebreakFlags = useMemo(() => {
    return sets.map(s => {
      const p1 = parseInt(s.p1);
      const p2 = parseInt(s.p2);
      if (isNaN(p1) || isNaN(p2)) return false;
      return (p1 === 7 && p2 === 6) || (p1 === 6 && p2 === 7)
          || (p1 === 9 && p2 === 8) || (p1 === 8 && p2 === 9);
    });
  }, [sets]);

  // タイブレーク敗者側判定（'p1' or 'p2' — TB入力欄を敗者側に表示）
  const tiebreakLoserSide = useMemo(() => {
    return sets.map(s => {
      const p1 = parseInt(s.p1);
      const p2 = parseInt(s.p2);
      if (isNaN(p1) || isNaN(p2)) return null;
      if ((p1 === 7 && p2 === 6) || (p1 === 9 && p2 === 8)) return 'p2' as const;
      if ((p1 === 6 && p2 === 7) || (p1 === 8 && p2 === 9)) return 'p1' as const;
      return null;
    });
  }, [sets]);

  // 勝者自動判定
  const autoWinner = useMemo(() => {
    if (!match) return null;
    let p1Wins = 0, p2Wins = 0;
    for (const s of sets) {
      const a = parseInt(s.p1), b = parseInt(s.p2);
      if (isNaN(a) || isNaN(b) || a === b) continue;
      if (a > b) p1Wins++; else p2Wins++;
    }
    const neededSets = maxSets >= 3 ? 2 : 1;
    if (p1Wins >= neededSets) return 1 as const;
    if (p2Wins >= neededSets) return 2 as const;
    return null;
  }, [sets, match, maxSets]);

  // スコア文字列を構築
  const buildScoreString = useCallback(() => {
    return sets
      .map((s, i) => {
        const p1 = s.p1.trim(), p2 = s.p2.trim();
        if (!p1 && !p2) return null;
        let score = `${p1}-${p2}`;
        if (tiebreakFlags[i] && tiebreaks[i]) {
          score += `(${tiebreaks[i]})`;
        }
        return score;
      })
      .filter(Boolean)
      .join(' ');
  }, [sets, tiebreaks, tiebreakFlags]);

  // セットスコア入力ハンドラ
  const handleSetChange = (setIdx: number, player: 'p1' | 'p2', value: string) => {
    if (!/^\d{0,2}$/.test(value)) return;
    setSets(prev => {
      const next = [...prev];
      next[setIdx] = { ...next[setIdx], [player]: value };
      return next;
    });
    // 自動フォーカス移動: 2桁入力で次の入力欄へ
    if (value.length >= 1) {
      const nextRef = player === 'p1' ? setIdx * 3 + 1 : (setIdx + 1) * 3;
      setTimeout(() => inputRefs.current[nextRef]?.focus(), 50);
    }
  };

  const handleTiebreakChange = (setIdx: number, value: string) => {
    if (!/^\d{0,2}$/.test(value)) return;
    setTiebreaks(prev => {
      const next = [...prev];
      next[setIdx] = value || null;
      return next;
    });
  };

  // --- DB操作 ---
  const handleReadyMatch = async () => {
    if (isProcessing || !match) return;
    setIsProcessing(true);
    try {
      await db.matches.update(match.dbId, { status: 'ready', updatedAt: Date.now() });
      onMatchUpdate();
    } finally { setIsProcessing(false); }
  };

  const handleStartMatch = async () => {
    if (isProcessing || !match) return;
    setIsProcessing(true);
    try {
      await db.matches.update(match.dbId, { status: 'playing', updatedAt: Date.now() });
      onMatchUpdate();
    } finally { setIsProcessing(false); }
  };

  const handleFinishMatch = async (winnerNum: 1 | 2) => {
    if (isProcessing || !match) return;
    setIsProcessing(true);
    try {
      const winnerEntryId = winnerNum === 1 ? match.player1EntryId : match.player2EntryId;
      const winnerName = winnerNum === 1 ? match.player1Name : match.player2Name;
      const winnerAff = winnerNum === 1 ? match.player1Affiliation : match.player2Affiliation;
      const scoreStr = buildScoreString() || '(スコア未入力)';

      await db.matches.update(match.dbId, {
        status: 'finished', score: scoreStr, winnerEntryId, updatedAt: Date.now(),
      });

      // 次ラウンドへ勝者を反映（リーグ戦では不要）
      if (!isLeague) {
        const dbMatch = await db.matches.get(match.dbId);
        if (dbMatch) {
          const nextRound = match.round + 1;
          const nextPosition = Math.ceil(match.position / 2);
          const nextMatch = await db.matches
            .where('eventId').equals(dbMatch.eventId)
            .filter(m => m.round === nextRound && m.position === nextPosition)
            .first();
          if (nextMatch?.id) {
            const isUpper = match.position % 2 === 1;
            await db.matches.update(nextMatch.id, {
              ...(isUpper
                ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
                : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
              ),
              updatedAt: Date.now(),
            });
          }
        }
      }
      onMatchUpdate();
    } finally { setIsProcessing(false); }
  };

  const handleResetMatch = async () => {
    if (isProcessing || !match) return;
    if (!confirm('この試合をリセットしますか？')) return;
    setIsProcessing(true);
    try {
      if (!isLeague) {
        const dbMatch = await db.matches.get(match.dbId);
        if (dbMatch) {
          const nextRound = match.round + 1;
          const nextPosition = Math.ceil(match.position / 2);
          const nextMatch = await db.matches
            .where('eventId').equals(dbMatch.eventId)
            .filter(m => m.round === nextRound && m.position === nextPosition)
            .first();
          if (nextMatch?.id) {
            const isUpper = match.position % 2 === 1;
            await db.matches.update(nextMatch.id, {
              ...(isUpper
                ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
                : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
              ),
              updatedAt: Date.now(),
            });
          }
        }
      }
      await db.matches.update(match.dbId, {
        status: 'waiting', score: '', winnerEntryId: null, updatedAt: Date.now(),
      });
      setSets(Array.from({ length: maxSets }, () => ({ p1: '', p2: '' })));
      setTiebreaks(Array.from({ length: maxSets }, () => null));
      onMatchUpdate();
    } finally { setIsProcessing(false); }
  };

  const handleAssignCourt = async (courtId: string) => {
    if (!match) return;
    await db.matches.update(match.dbId, { courtId: courtId || null, updatedAt: Date.now() });
    onMatchUpdate();
  };

  // --- ブロードキャストコール ---
  const handleCall = () => {
    if (!match) return;
    const courtName = courts.find(c => c.courtId === match.courtId)?.name ?? '';
    const courtNumber = match.courtId ? courtName.replace(/コート.*$/, '') || match.courtId : '';
    const callData: MatchCall = {
      id: match.dbId, eventName: match.eventName, round: getRoundName(match.round),
      numberA: parseInt(match.player1EntryId?.replace(/\D/g, '') || '0', 10) || 0,
      nameA: match.player1Name, affA: match.player1Affiliation,
      numberB: parseInt(match.player2EntryId?.replace(/\D/g, '') || '0', 10) || 0,
      nameB: match.player2Name, affB: match.player2Affiliation,
      type: 'singles', status: 'pending', courtNumber,
      startTime: match.scheduledTime ?? '',
    };
    speak(buildCallText(callData, courtNumber, match.scheduledTime ?? ''), DEFAULT_VOICE);
  };

  if (!match) return null;

  const statusCfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.waiting;
  const isFinished = match.status === 'finished' || match.status === 'walkover';
  const canReady = match.status === 'waiting';
  const canStart = match.status === 'ready';
  const canFinish = match.status === 'playing';
  const canCall = !!match.courtId && !isFinished;
  const roundName = getRoundName(match.round);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 m-auto shrink-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary-200 text-xs">
                <span className="font-mono">#{match.matchOrder}</span>
                <ChevronRight className="w-3 h-3" />
                <span>{match.eventName}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="font-bold text-white">{roundName}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ステータスと経過時間 */}
          <div className="flex items-center gap-3 mt-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
              {statusCfg.label}
            </span>
            {elapsedTime && (
              <span className="flex items-center gap-1 text-xs text-primary-200">
                <Timer className="w-3.5 h-3.5" />
                <span className="font-mono font-bold text-white">{elapsedTime}</span>
              </span>
            )}
            {match.scheduledTime && (
              <span className="text-xs text-primary-200">予定 {match.scheduledTime}</span>
            )}
          </div>
        </div>

        {/* Players */}
        <div className="px-4 sm:px-6 py-4 sm:py-5">
          {(() => {
            const isP1Winner = isFinished && match.winnerEntryId === match.player1EntryId;
            const isP2Winner = isFinished && match.winnerEntryId === match.player2EntryId;
            const isP1Loser = isFinished && match.winnerEntryId && !isP1Winner;
            const isP2Loser = isFinished && match.winnerEntryId && !isP2Winner;
            return (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
                {/* Player 1 */}
                <div className="text-center">
                  <p className={`font-bold text-base sm:text-lg leading-tight ${
                    isP1Winner ? 'text-primary-600' : isP1Loser ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {match.player1Name || '(未定)'}
                    {isP1Winner && <Trophy className="w-4 h-4 inline ml-1 text-yellow-500" />}
                  </p>
                  <p className={`text-xs mt-0.5 ${isP1Loser ? 'text-gray-300' : 'text-gray-500'}`}>{match.player1Affiliation}</p>
                </div>

                <div className="text-gray-300 font-bold text-sm">VS</div>

                {/* Player 2 */}
                <div className="text-center">
                  <p className={`font-bold text-base sm:text-lg leading-tight ${
                    isP2Winner ? 'text-primary-600' : isP2Loser ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {match.player2Name || '(未定)'}
                    {isP2Winner && <Trophy className="w-4 h-4 inline ml-1 text-yellow-500" />}
                  </p>
                  <p className={`text-xs mt-0.5 ${isP2Loser ? 'text-gray-300' : 'text-gray-500'}`}>{match.player2Affiliation}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Score Input — 試合中・終了時のみ表示 */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 space-y-3">
            {/* コート — 終了後は非表示 */}
            {!isFinished && (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs text-gray-500 w-12 sm:w-14 shrink-0">コート</span>
                <select
                  value={match.courtId ?? ''}
                  onChange={e => handleAssignCourt(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg text-sm px-2.5 py-1.5 bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                >
                  <option value="">未割当</option>
                  {courts.map(c => {
                    const isCurrentCourt = c.courtId === match.courtId;
                    const isOccupied = !c.isAvailable && !isCurrentCourt;
                    if (isOccupied) return null;
                    return (
                      <option key={c.courtId} value={c.courtId}>{c.name}</option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* セットスコア入力 — 試合中・終了時のみ */}
            {(match.status === 'playing' || isFinished) && (
              <div className="space-y-2">
                <span className="text-xs text-gray-500">スコア</span>
                {sets.map((set, i) => {
                  const loserSide = tiebreakLoserSide[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">
                        {maxSets > 1 ? `Set${i + 1}` : ''}
                      </span>
                      <div className="flex items-center gap-1 flex-1 justify-center">
                        <input
                          ref={el => { inputRefs.current[i * 3] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="0"
                          value={set.p1}
                          onChange={e => handleSetChange(i, 'p1', e.target.value)}
                          disabled={isFinished}
                          className="w-12 h-10 text-center text-lg font-bold border border-gray-200 rounded-lg bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {/* タイブレーク — P1側が敗者の場合ここに表示 */}
                        {tiebreakFlags[i] && loserSide === 'p1' && (
                          <>
                            <span className="text-gray-300 text-[10px]">(</span>
                            <input
                              ref={el => { inputRefs.current[i * 3 + 2] = el; }}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              placeholder="TB"
                              value={tiebreaks[i] || ''}
                              onChange={e => handleTiebreakChange(i, e.target.value)}
                              disabled={isFinished}
                              className="w-10 h-8 text-center text-sm font-bold border border-orange-200 rounded bg-orange-50 focus:border-orange-400 focus:ring-2 focus:ring-orange-300/30 outline-none disabled:bg-orange-50/50 disabled:text-gray-400"
                            />
                            <span className="text-gray-300 text-[10px]">)</span>
                          </>
                        )}
                        <span className="text-gray-400 font-bold">-</span>
                        <input
                          ref={el => { inputRefs.current[i * 3 + 1] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="0"
                          value={set.p2}
                          onChange={e => handleSetChange(i, 'p2', e.target.value)}
                          disabled={isFinished}
                          className="w-12 h-10 text-center text-lg font-bold border border-gray-200 rounded-lg bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {/* タイブレーク — P2側が敗者の場合ここに表示 */}
                        {tiebreakFlags[i] && loserSide === 'p2' && (
                          <>
                            <span className="text-gray-300 text-[10px]">(</span>
                            <input
                              ref={el => { inputRefs.current[i * 3 + 2] = el; }}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              placeholder="TB"
                              value={tiebreaks[i] || ''}
                              onChange={e => handleTiebreakChange(i, e.target.value)}
                              disabled={isFinished}
                              className="w-10 h-8 text-center text-sm font-bold border border-orange-200 rounded bg-orange-50 focus:border-orange-400 focus:ring-2 focus:ring-orange-300/30 outline-none disabled:bg-orange-50/50 disabled:text-gray-400"
                            />
                            <span className="text-gray-300 text-[10px]">)</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 自動勝者判定表示 */}
            {autoWinner && canFinish && (
              <div className="text-center">
                <span className="text-xs text-primary-600 font-bold">
                  → {autoWinner === 1 ? match.player1Name : match.player2Name} 勝利
                </span>
              </div>
            )}
            {/* スコア未入力時のヒント */}
            {canFinish && !autoWinner && (
              <p className="text-center text-xs text-gray-400">スコアを入力すると勝者が自動判定されます</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-5 space-y-2">
          <div className="flex flex-wrap gap-2">
            {canReady && (
              <button onClick={handleReadyMatch} disabled={isProcessing}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Check className="w-4 h-4" /> 準備完了
              </button>
            )}
            {canStart && (
              <button onClick={handleStartMatch} disabled={isProcessing}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                <Play className="w-4 h-4" /> 試合開始
              </button>
            )}
            {canFinish && autoWinner && (
              <button onClick={() => handleFinishMatch(autoWinner)} disabled={isProcessing}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-lg shadow-primary-500/25">
                <Trophy className="w-4 h-4" /> 結果確定
              </button>
            )}
          </div>

          {/* Secondary actions */}
          <div className="flex flex-wrap gap-2">
            {canCall && (
              isSpeaking ? (
                <button onClick={() => stop()}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors">
                  <VolumeX className="w-4 h-4" /> 停止
                </button>
              ) : (
                <button onClick={handleCall}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors">
                  <Volume2 className="w-4 h-4" /> コール
                </button>
              )
            )}
            {(match.status === 'ready' || match.status === 'playing' || isFinished) && (
              <button onClick={handleResetMatch} disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                <RotateCcw className="w-4 h-4" /> リセット
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
