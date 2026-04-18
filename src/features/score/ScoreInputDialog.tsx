import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../db/database';
import { buildCallText, buildWalkoverCallText, buildRetirementCallText } from '../broadcast/callTextBuilder';
import { useCallSpeech } from '../broadcast/useCallSpeech';
import type { MatchCall, VoiceSettings } from '../broadcast/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as appDb } from '../../db/database';
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
  BookOpen,
  UserX,
  AlertCircle,
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

import type { MatchFormatType } from '../../db/database';

interface ScoreInputDialogProps {
  match: ScoreInputMatch | null;
  courts: Array<{ courtId: string; name: string; isAvailable: boolean }>;
  onClose: () => void;
  onMatchUpdate: () => void;
  getRoundName: (round: number) => string;
  bestOf?: number; // 何セットマッチか（デフォルト1セットマッチ）
  isLeague?: boolean; // リーグ戦の場合は次ラウンド進出を行わない
  /** 現在の試合に適用されるゲームルール文字列 */
  gameRuleText?: string;
  /** 試合方式（省略時='game'） */
  matchFormat?: MatchFormatType;
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

const DEFAULT_VOICE: VoiceSettings = { rate: 0.95, pitch: 1.0, volume: 1.0, repeatCount: 1 };

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
  gameRuleText,
  matchFormat = 'game',
}: ScoreInputDialogProps) {
  // twoSetsSuper10 の場合: 2セット + ファイナルSTB（計3入力欄）
  const isTwoSetFormat = matchFormat === 'twoSetsSuper10';
  // セットスコア入力（最大3セット）
  const maxSets = isTwoSetFormat ? 3 : (bestOf >= 3 ? 3 : 1);
  const [sets, setSets] = useState<{ p1: string; p2: string }[]>(
    Array.from({ length: maxSets }, () => ({ p1: '', p2: '' }))
  );
  const [tiebreaks, setTiebreaks] = useState<(string | null)[]>(
    Array.from({ length: maxSets }, () => null)
  );
  /** スーパータイブレーク（ファイナルセット10ポイント）スコア */
  const [superTB, setSuperTB] = useState<{ p1: string; p2: string }>({ p1: '', p2: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('');
  /** W.O（ウォークオーバー）モード: null=通常, 1=P1のW.O, 2=P2のW.O */
  const [retPlayer, setRetPlayer] = useState<1 | 2 | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { isSpeaking, speak, stop } = useCallSpeech();

  // 所属ふりがなマップ（音声コール用）
  const affiliationFuriganaMap = useLiveQuery(async () => {
    const all = await appDb.affiliationFurigana.toArray();
    const map: Record<string, string> = {};
    for (const a of all) map[a.name] = a.furigana;
    return map;
  }) || {} as Record<string, string>;

  // 試合が変わったらスコアを同期
  useEffect(() => {
    if (!match) return;
    // W.O/Retスコアの復元
    if (match.score && (match.score.includes('W.O') || match.score.includes('Ret'))) {
      setRetPlayer(match.score.startsWith('W.O') || match.score.startsWith('Ret') ? 1 : 2);
    } else {
      setRetPlayer(null);
    }
    if (match.score && match.status === 'finished') {
      // 既存スコアをパース: "6-4" or "6-4 7-5" or "6-4 6-7(3) 6-2"
      // or "6-4 4-6 [10-5]" (super TB) or "W.O" or "4-6 W.O"
      const cleanScore = match.score.replace(/\s*W\.O\s*/g, '').replace(/\s*Ret\s*/g, '');
      const setParts = cleanScore.split(/\s+/).filter(Boolean);
      const newSets = Array.from({ length: maxSets }, () => ({ p1: '', p2: '' }));
      const newTB = Array.from<string | null>({ length: maxSets }).fill(null);
      let newSuperTB = { p1: '', p2: '' };
      for (let i = 0; i < setParts.length; i++) {
        // スーパータイブレーク: [10-5] 形式
        const stbMatch = setParts[i].match(/^\[(\d+)-(\d+)\]$/);
        if (stbMatch) {
          newSuperTB = { p1: stbMatch[1], p2: stbMatch[2] };
          continue;
        }
        if (i >= maxSets) continue;
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
      setSuperTB(newSuperTB);
    } else {
      setSets(Array.from({ length: maxSets }, () => ({ p1: '', p2: '' })));
      setTiebreaks(Array.from({ length: maxSets }, () => null));
      setSuperTB({ p1: '', p2: '' });
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

  // twoSetsSuper10: セットカウントが1-1のとき3rd setはスーパーTB
  const needsSuperTB = useMemo(() => {
    if (!isTwoSetFormat) return false;
    let p1w = 0, p2w = 0;
    for (let i = 0; i < 2; i++) {
      const a = parseInt(sets[i]?.p1), b = parseInt(sets[i]?.p2);
      if (isNaN(a) || isNaN(b)) continue;
      if (a > b) p1w++; else if (b > a) p2w++;
    }
    return p1w === 1 && p2w === 1;
  }, [sets, isTwoSetFormat]);

  // 勝者自動判定
  const autoWinner = useMemo(() => {
    if (!match) return null;
    // W.O（ウォークオーバー）の場合: W.O側の相手が勝者
    if (retPlayer === 1) return 2 as const;
    if (retPlayer === 2) return 1 as const;

    if (isTwoSetFormat) {
      // 2セットマッチ: 2-0で勝ちか、1-1でスーパーTBの勝者
      let p1w = 0, p2w = 0;
      for (let i = 0; i < 2; i++) {
        const a = parseInt(sets[i]?.p1), b = parseInt(sets[i]?.p2);
        if (isNaN(a) || isNaN(b) || a === b) continue;
        if (a > b) p1w++; else p2w++;
      }
      if (p1w === 2) return 1 as const;
      if (p2w === 2) return 2 as const;
      // 1-1: スーパーTBで判定
      if (p1w === 1 && p2w === 1) {
        const stb1 = parseInt(superTB.p1), stb2 = parseInt(superTB.p2);
        if (!isNaN(stb1) && !isNaN(stb2) && stb1 !== stb2) {
          return stb1 > stb2 ? 1 as const : 2 as const;
        }
      }
      return null;
    }

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
  }, [sets, match, maxSets, retPlayer, isTwoSetFormat, superTB]);

  // スコアバリデーション: ルールに基づいてスコアの妥当性を検証
  const scoreValidationError = useMemo(() => {
    if (!match || retPlayer) return null; // W.O時はバリデーション不要
    if (match.status !== 'playing') return null;

    // gameRuleText からゲーム数を抽出（例: "6ゲームマッチ（6-6タイブレーク）"）
    const gamesMatch = gameRuleText?.match(/(\d+)ゲームマッチ/);
    const requiredGames = gamesMatch ? parseInt(gamesMatch[1]) : null;

    if (!requiredGames) return null; // ルール不明の場合はスキップ

    const errors: string[] = [];

    for (let i = 0; i < (isTwoSetFormat ? 2 : maxSets); i++) {
      const p1 = parseInt(sets[i]?.p1);
      const p2 = parseInt(sets[i]?.p2);
      if (isNaN(p1) && isNaN(p2)) continue; // 未入力セットはスキップ
      if (isNaN(p1) || isNaN(p2)) {
        errors.push(`Set${i + 1}: 両方のスコアを入力してください`);
        continue;
      }

      const winner = Math.max(p1, p2);
      const loser = Math.min(p1, p2);

      // タイブレーク: winner = requiredGames+1, loser = requiredGames (e.g. 7-6, 9-8)
      // ノーアドの場合なども考慮して、loser < requiredGames の時 winner == requiredGames
      if (winner === requiredGames + 1 && loser === requiredGames) {
        // タイブレークスコア — OK, タイブレーク内ポイントが必要
        if (!tiebreaks[i]) {
          errors.push(`Set${i + 1}: タイブレークポイントを入力してください`);
        }
      } else if (winner === requiredGames && loser < requiredGames) {
        // 通常勝利 — OK
      } else if (winner === requiredGames + 1 && loser === requiredGames - 1) {
        // アドバンテージ勝利 (例: 8ゲームで9-7, 6ゲームで7-5) — OK
      } else if (winner > requiredGames + 1 || (winner === requiredGames + 1 && loser < requiredGames - 1)) {
        errors.push(`Set${i + 1}: ${requiredGames}ゲームマッチのスコアとして不正です (${p1}-${p2})`);
      } else if (winner < requiredGames && (p1 + p2 > 0)) {
        // 途中スコアとして可能なので警告しない
      }
    }

    return errors.length > 0 ? errors : null;
  }, [sets, tiebreaks, gameRuleText, match, retPlayer, isTwoSetFormat, maxSets]);

  // スコア文字列を構築
  const buildScoreString = useCallback(() => {
    // twoSetsSuper10: 最初の2セットのみ通常表示、3rdはスーパーTB
    const setLimit = isTwoSetFormat ? 2 : sets.length;
    const scoreParts = sets.slice(0, setLimit)
      .map((s, i) => {
        const p1 = s.p1.trim(), p2 = s.p2.trim();
        if (!p1 && !p2) return null;
        let score = `${p1}-${p2}`;
        if (tiebreakFlags[i] && tiebreaks[i]) {
          score += `(${tiebreaks[i]})`;
        }
        return score;
      })
      .filter(Boolean);
    // スーパータイブレーク結果を追加 [10-5]
    if (isTwoSetFormat && superTB.p1 && superTB.p2) {
      scoreParts.push(`[${superTB.p1}-${superTB.p2}]`);
    }
    // W.O/Retの場合: 試合中ならRet、それ以外はW.O
    if (retPlayer) {
      const suffix = match?.status === 'playing' ? 'Ret' : 'W.O';
      const base = scoreParts.join(' ');
      return base ? `${base} ${suffix}` : suffix;
    }
    return scoreParts.join(' ');
  }, [sets, tiebreaks, tiebreakFlags, retPlayer, isTwoSetFormat, superTB, match?.status]);

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
    const numA = parseInt(match.player1EntryId?.replace(/\D/g, '') || '0', 10) || 0;
    const numB = parseInt(match.player2EntryId?.replace(/\D/g, '') || '0', 10) || 0;
    const callData: MatchCall = {
      id: match.dbId, eventName: match.eventName, round: getRoundName(match.round),
      numberA: numA, nameA: match.player1Name, affA: match.player1Affiliation,
      numberB: numB, nameB: match.player2Name, affB: match.player2Affiliation,
      type: 'singles', status: 'pending', courtNumber,
      startTime: match.scheduledTime ?? '',
    };

    // W.O/Retの場合は専用コール
    if (retPlayer) {
      const retNum = retPlayer === 1 ? numA : numB;
      const retName = retPlayer === 1 ? match.player1Name : match.player2Name;
      const winNum = retPlayer === 1 ? numB : numA;
      const winName = retPlayer === 1 ? match.player2Name : match.player1Name;
      if (match.status === 'playing') {
        // 試合中 → リタイアコール
        speak(buildRetirementCallText(callData, retNum, retName, winNum, winName, affiliationFuriganaMap), DEFAULT_VOICE);
      } else {
        // 試合前 → ウォークオーバーコール
        speak(buildWalkoverCallText(callData, retNum, retName, winNum, winName, affiliationFuriganaMap), DEFAULT_VOICE);
      }
    } else {
      speak(buildCallText(callData, courtNumber, match.scheduledTime ?? '', affiliationFuriganaMap), DEFAULT_VOICE);
    }
  };

  if (!match) return null;

  const statusCfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.waiting;
  const isFinished = match.status === 'finished' || match.status === 'walkover';
  const canReady = match.status === 'waiting' && !retPlayer;
  const canStart = match.status === 'ready' && !retPlayer;
  const canFinish = match.status === 'playing' || !!retPlayer;
  const canCall = !isFinished || !!retPlayer;
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
            {match.scheduledTime && match.round === 1 && (
              <span className="text-xs text-primary-200">予定 {match.scheduledTime}</span>
            )}
          </div>
        </div>

        {/* ゲームルール表示 */}
        {gameRuleText && (
          <div className="px-4 sm:px-6 pt-3 pb-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
              <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-bold text-amber-800">{gameRuleText}</span>
            </div>
          </div>
        )}

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
                {sets.slice(0, isTwoSetFormat ? 2 : maxSets).map((set, i) => {
                  const loserSide = tiebreakLoserSide[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">
                        {(isTwoSetFormat || maxSets > 1) ? `Set${i + 1}` : ''}
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

                {/* スーパータイブレーク入力（twoSetsSuper10: 1-1の場合） */}
                {isTwoSetFormat && needsSuperTB && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-purple-500 w-8 text-right shrink-0 font-bold">STB</span>
                    <div className="flex items-center gap-1 flex-1 justify-center">
                      <span className="text-[10px] text-purple-400 font-bold">[</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        placeholder="10"
                        value={superTB.p1}
                        onChange={e => {
                          if (!/^\d{0,2}$/.test(e.target.value)) return;
                          setSuperTB(prev => ({ ...prev, p1: e.target.value }));
                          if (e.target.value.length >= 2) {
                            // フォーカスをp2へ
                            const next = e.target.nextElementSibling?.nextElementSibling as HTMLInputElement | null;
                            setTimeout(() => next?.focus(), 50);
                          }
                        }}
                        disabled={isFinished}
                        className="w-12 h-10 text-center text-lg font-bold border-2 border-purple-300 rounded-lg bg-purple-50 focus:border-purple-500 focus:ring-2 focus:ring-purple-300/30 outline-none disabled:bg-purple-50/50 disabled:text-gray-500"
                      />
                      <span className="text-purple-400 font-bold">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        placeholder="0"
                        value={superTB.p2}
                        onChange={e => {
                          if (!/^\d{0,2}$/.test(e.target.value)) return;
                          setSuperTB(prev => ({ ...prev, p2: e.target.value }));
                        }}
                        disabled={isFinished}
                        className="w-12 h-10 text-center text-lg font-bold border-2 border-purple-300 rounded-lg bg-purple-50 focus:border-purple-500 focus:ring-2 focus:ring-purple-300/30 outline-none disabled:bg-purple-50/50 disabled:text-gray-500"
                      />
                      <span className="text-[10px] text-purple-400 font-bold">]</span>
                    </div>
                  </div>
                )}
                {isTwoSetFormat && needsSuperTB && (
                  <p className="text-center text-[10px] text-purple-500 font-medium">10ポイント スーパータイブレーク</p>
                )}
              </div>
            )}

            {/* スコアバリデーションエラー */}
            {scoreValidationError && canFinish && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 space-y-0.5">
                {scoreValidationError.map((err, idx) => (
                  <p key={idx} className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />{err}
                  </p>
                ))}
              </div>
            )}

            {/* 自動勝者判定表示 */}
            {autoWinner && canFinish && !scoreValidationError && (
              <div className="text-center">
                <span className="text-xs text-primary-600 font-bold">
                  → {autoWinner === 1 ? match.player1Name : match.player2Name} 勝利
                  {retPlayer && (match.status === 'playing' ? ' (DEF/Ret)' : ' (DEF/W.O)')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ===== エントリー（結果入力）ボタン ===== */}
        <div className="px-4 sm:px-6 pb-3 space-y-2">
          {/* 準備完了 / 試合開始 */}
          {(canReady || canStart) && (
            <div className="flex gap-2">
              {canReady && (
                <button onClick={handleReadyMatch} disabled={isProcessing}
                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all min-h-[48px]">
                  <Check className="w-5 h-5" /> 準備完了
                </button>
              )}
              {canStart && (
                <button onClick={handleStartMatch} disabled={isProcessing}
                  className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-3.5 rounded-xl bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 transition-all min-h-[48px]">
                  <Play className="w-5 h-5" /> 試合開始
                </button>
              )}
            </div>
          )}

          {/* エントリー（結果確定）ボタン */}
          {canFinish && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-primary-500" />
                エントリー（結果入力）
              </span>
              {autoWinner && !scoreValidationError ? (
                <button onClick={() => handleFinishMatch(autoWinner)} disabled={isProcessing}
                  className="w-full inline-flex items-center justify-center gap-2 text-base font-bold px-4 py-4 rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-primary-500/25 min-h-[56px]">
                  <Trophy className="w-5 h-5" /> 結果確定
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleFinishMatch(1)} disabled={isProcessing}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-3 py-3.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 transition-all min-h-[52px]">
                    <Trophy className="w-4 h-4 shrink-0" />
                    <span className="truncate">{match.player1Name || 'P1'}</span>
                  </button>
                  <button onClick={() => handleFinishMatch(2)} disabled={isProcessing}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-3 py-3.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 transition-all min-h-[52px]">
                    <Trophy className="w-4 h-4 shrink-0" />
                    <span className="truncate">{match.player2Name || 'P2'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== DEF（棄権）ボタン ===== */}
        {!isFinished && (
          <div className="px-4 sm:px-6 pb-3">
            <div className="space-y-2">
              <span className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5" />
                DEF（{match.status === 'playing' ? '途中棄権' : '棄権'}）
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRetPlayer(retPlayer === 1 ? null : 1)}
                  className={`flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl border-2 transition-all active:scale-[0.98] min-h-[52px] ${
                    retPlayer === 1
                      ? 'bg-red-100 border-red-400 text-red-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50'
                  }`}
                >
                  <UserX className="w-4 h-4 shrink-0" />
                  <span className="truncate">{match.player1Name || 'P1'}</span>
                  <span className="text-xs font-bold shrink-0">DEF</span>
                </button>
                <button
                  onClick={() => setRetPlayer(retPlayer === 2 ? null : 2)}
                  className={`flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl border-2 transition-all active:scale-[0.98] min-h-[52px] ${
                    retPlayer === 2
                      ? 'bg-red-100 border-red-400 text-red-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50'
                  }`}
                >
                  <UserX className="w-4 h-4 shrink-0" />
                  <span className="truncate">{match.player2Name || 'P2'}</span>
                  <span className="text-xs font-bold shrink-0">DEF</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== その他アクション ===== */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-5">
          <div className="flex flex-wrap gap-2">
            {canCall && (
              isSpeaking ? (
                <button onClick={() => stop()}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition-all min-h-[44px]">
                  <VolumeX className="w-4 h-4" /> 停止
                </button>
              ) : (
                <button onClick={handleCall}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] transition-all min-h-[44px]">
                  <Volume2 className="w-4 h-4" /> コール
                </button>
              )
            )}
            {(match.status === 'ready' || match.status === 'playing' || isFinished) && (
              <button onClick={handleResetMatch} disabled={isProcessing}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all min-h-[44px]">
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
