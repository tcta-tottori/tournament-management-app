import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Save, Trash2, AlertTriangle, Ban } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { LeagueMatchScore, MixedTeam } from './types';

/** Full-width to half-width number conversion */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** Extract game rule text from rules array, considering team count */
function extractGameRule(rules: string[], teamCount?: number): string | null {
  // チーム数に対応するルールを優先検索
  if (teamCount) {
    for (const r of rules) {
      const cleaned = r.replace(/^（[０-９\d]+）\s*/, '').trim();
      if (/ゲームマッチ|ノーアド|タイブレ|セットマッチ|ゲーム/.test(cleaned) && cleaned.includes(`${teamCount}チーム`)) {
        return cleaned;
      }
    }
    // 全角数字もチェック
    const fullWidthCount = String(teamCount).replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
    for (const r of rules) {
      const cleaned = r.replace(/^（[０-９\d]+）\s*/, '').trim();
      if (/ゲームマッチ|ノーアド|タイブレ|セットマッチ|ゲーム/.test(cleaned) && cleaned.includes(`${fullWidthCount}チーム`)) {
        return cleaned;
      }
    }
  }
  // フォールバック: 最初のゲームルール
  for (const r of rules) {
    const cleaned = r.replace(/^（[０-９\d]+）\s*/, '').trim();
    if (/ゲームマッチ|ノーアド|タイブレ|セットマッチ|ゲーム/.test(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/** Extract winning game number from rule text (e.g. "6ゲームマッチ" -> 6) */
function getWinningGames(gameRule: string | null): number {
  if (!gameRule) return 6;
  const m = gameRule.match(/(\d+)\s*ゲーム/);
  if (m) return parseInt(m[1]);
  // Full-width number check
  const m2 = gameRule.match(/([０-９]+)\s*ゲーム/);
  if (m2) return parseInt(toHalfWidth(m2[1]));
  return 6;
}

interface Props {
  match: LeagueMatchScore;
  teams: MixedTeam[];
  onClose: () => void;
  anchorY?: number;
}

export default function MixedScoreInput({ match, teams, onClose, anchorY }: Props) {
  const { updateLeagueScore, setLeagueMatchStatus, tournamentInfo } = useMixedStore();

  const team1 = teams.find(t => t.teamId === match.team1Id);
  const team2 = teams.find(t => t.teamId === match.team2Id);

  const [score1, setScore1] = useState<string>(match.score1 !== null && match.score1 >= 0 ? match.score1.toString() : '');
  const [score2, setScore2] = useState<string>(match.score2 !== null && match.score2 >= 0 ? match.score2.toString() : '');
  const [tiebreakInput, setTiebreakInput] = useState<string>(match.tiebreakScore?.toString() ?? '');
  const [error, setError] = useState('');

  const score1Ref = useRef<HTMLInputElement>(null);
  const score2Ref = useRef<HTMLInputElement>(null);
  const tiebreakRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef<number>(0);

  const gameRule = useMemo(() => {
    // リーグ内のチーム数を取得してルールを特定
    const teamCount = teams.length;
    return extractGameRule(tournamentInfo?.rules || [], teamCount);
  }, [tournamentInfo, teams.length]);
  const winGames = useMemo(() => getWinningGames(gameRule), [gameRule]);

  useEffect(() => {
    // ポップアップ表示時のスクロール位置を保存し、閉じる時に復元
    scrollPosRef.current = window.scrollY;
    // スクロールを防止
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      // 元のスクロール位置に復元
      window.scrollTo(0, scrollPosRef.current);
    };
  }, []);

  useEffect(() => {
    setScore1(match.score1 !== null && match.score1 >= 0 ? match.score1.toString() : '');
    setScore2(match.score2 !== null && match.score2 >= 0 ? match.score2.toString() : '');
    setTiebreakInput(match.tiebreakScore?.toString() ?? '');
    setError('');
  }, [match]);

  const isTiebreak = useMemo(() => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    return (s1 === winGames + 1 && s2 === winGames) || (s1 === winGames && s2 === winGames + 1);
  }, [score1, score2, winGames]);

  const loserSide = useMemo(() => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (s1 === winGames + 1 && s2 === winGames) return 2;
    if (s1 === winGames && s2 === winGames + 1) return 1;
    return 0;
  }, [score1, score2, winGames]);

  // Determine winner side for highlighting
  const winnerSide = useMemo(() => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (isNaN(s1) || isNaN(s2)) return 0;
    if (s1 > s2) return 1;
    if (s2 > s1) return 2;
    return 0;
  }, [score1, score2]);

  const validate = useCallback((): boolean => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (isNaN(s1) || isNaN(s2)) { setError('スコアを入力してください'); return false; }
    if (s1 < 0 || s2 < 0) { setError('スコアは0以上で入力してください'); return false; }
    if (s1 === s2) { setError('同点は不可です'); return false; }
    if (s1 > winGames + 1 || s2 > winGames + 1) { setError(`スコアは0〜${winGames + 1}の範囲で入力してください`); return false; }
    if ((s1 === winGames + 1 && s2 === winGames) || (s1 === winGames && s2 === winGames + 1)) {
      const tb = parseInt(tiebreakInput);
      if (tiebreakInput && !isNaN(tb) && tb < 0) {
        setError('タイブレークスコアは0以上で入力してください');
        return false;
      }
    }
    setError('');
    return true;
  }, [score1, score2, tiebreakInput, winGames]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const isTb = (s1 === winGames + 1 && s2 === winGames) || (s1 === winGames && s2 === winGames + 1);
    const tb = isTb && tiebreakInput ? parseInt(tiebreakInput) : null;
    updateLeagueScore(match.matchId, s1, s2, tb);
    onClose();
  }, [score1, score2, tiebreakInput, match.matchId, updateLeagueScore, onClose, validate, winGames]);

  const handleDEF = useCallback((winnerTeamId: string) => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const finalScore1 = !isNaN(s1) && s1 >= 0 ? s1 : null;
    const finalScore2 = !isNaN(s2) && s2 >= 0 ? s2 : null;
    updateLeagueScore(
      match.matchId,
      finalScore1 !== null ? finalScore1 : 0,
      finalScore2 !== null ? finalScore2 : 0,
      null,
      winnerTeamId
    );
    onClose();
  }, [score1, score2, match.matchId, updateLeagueScore, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleClear = useCallback(() => {
    setLeagueMatchStatus(match.matchId, 'waiting');
    updateLeagueScore(match.matchId, -1, -1, null);
    onClose();
  }, [match.matchId, setLeagueMatchStatus, updateLeagueScore, onClose]);

  const handleScore1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore1(raw);
    setError('');
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      // Auto-fill score2 if needed
      const num = parseInt(raw);
      if (num !== winGames && num !== winGames + 1 && score2 === '') {
        setScore2(winGames.toString());
      }
      setTimeout(() => { score2Ref.current?.focus(); score2Ref.current?.select(); }, 50);
    }
  };

  const handleScore2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore2(raw);
    setError('');
    const num = parseInt(raw);
    // Auto-fill score1 if needed
    if (raw.length === 1 && !isNaN(num) && num !== winGames && num !== winGames + 1 && score1 === '') {
      setScore1(winGames.toString());
    }
    const s1 = parseInt(score1);
    if (raw.length === 1 && ((s1 === winGames + 1 && num === winGames) || (s1 === winGames && num === winGames + 1))) {
      setTimeout(() => { tiebreakRef.current?.focus(); tiebreakRef.current?.select(); }, 50);
    }
  };

  const handleTiebreakChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setTiebreakInput(raw);
  };

  const popupStyle: React.CSSProperties = {};
  if (anchorY !== undefined) {
    const vh = window.innerHeight;
    const popupH = 480;
    let top = anchorY - popupH / 2;
    if (top < 10) top = 10;
    if (top + popupH > vh - 10) top = vh - popupH - 10;
    popupStyle.position = 'fixed';
    popupStyle.top = top;
    popupStyle.left = '50%';
    popupStyle.transform = 'translateX(-50%)';
  }

  const tbInput = (
    <input
      ref={tiebreakRef}
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={tiebreakInput}
      onChange={handleTiebreakChange}
      onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
      className="w-9 h-14 text-center text-lg font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
      placeholder="?"
    />
  );

  // Winner highlight classes
  const score1HighlightClass = winnerSide === 1
    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
    : 'border-emerald-300';
  const score2HighlightClass = winnerSide === 2
    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
    : 'border-emerald-300';

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        ref={popupRef}
        className={`bg-white rounded-2xl shadow-2xl w-[440px] max-w-[95vw] overflow-hidden ${!anchorY ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : ''}`}
        style={anchorY ? popupStyle : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-5 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">スコア入力</h3>
              <div className="text-xs text-emerald-200">
                第{match.matchNumber}試合 ・ {match.leagueId.trim()}リーグ
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Game rule display */}
          {gameRule && (
            <div className="mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-[11px] text-amber-700 font-medium">{gameRule}</div>
            </div>
          )}

          {/* Match card */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex-1 text-center p-2.5 rounded-xl border-2 transition-all ${winnerSide === 1 ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-[10px] text-gray-400 mb-0.5">チーム{team1?.numberInLeague}</div>
              <div className="font-bold text-sm text-gray-800">{team1?.male.name}</div>
              <div className="text-xs text-gray-700">{team1?.female.name}</div>
            </div>
            <div className="text-lg font-bold text-gray-300">VS</div>
            <div className={`flex-1 text-center p-2.5 rounded-xl border-2 transition-all ${winnerSide === 2 ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className="text-[10px] text-gray-400 mb-0.5">チーム{team2?.numberInLeague}</div>
              <div className="font-bold text-sm text-gray-800">{team2?.male.name}</div>
              <div className="text-xs text-gray-700">{team2?.female.name}</div>
            </div>
          </div>

          {/* Score input */}
          <div className="flex items-center justify-center gap-2 mb-3">
            {isTiebreak && loserSide === 1 && (
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                {tbInput}
              </div>
            )}
            <input
              ref={score1Ref}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={score1}
              onChange={handleScore1Change}
              className={`w-16 h-14 text-center text-3xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${score1HighlightClass}`}
              placeholder="0"
              autoFocus
            />
            <span className="text-3xl font-bold text-gray-400">-</span>
            <input
              ref={score2Ref}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={score2}
              onChange={handleScore2Change}
              onKeyDown={e => { if (e.key === 'Enter' && !isTiebreak) handleSave(); }}
              className={`w-16 h-14 text-center text-3xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${score2HighlightClass}`}
              placeholder="0"
            />
            {isTiebreak && loserSide === 2 && (
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                {tbInput}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mb-3 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle size={14} />{error}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md text-sm font-medium mb-3 active:scale-[0.98]"
          >
            <Save size={14} />決定
          </button>

          {/* DEF buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => match.team2Id && handleDEF(match.team2Id)}
              className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
            >
              <Ban size={14} />
              <span className="truncate">{team1?.teamName || 'チーム1'}</span>
              <span className="text-xs">DEF</span>
            </button>
            <button
              onClick={() => match.team1Id && handleDEF(match.team1Id)}
              className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
            >
              <Ban size={14} />
              <span className="truncate">{team2?.teamName || 'チーム2'}</span>
              <span className="text-xs">DEF</span>
            </button>
          </div>

          {/* Clear / Cancel */}
          <div className="flex gap-3">
            {match.status === 'finished' && (
              <button onClick={handleClear} className="flex items-center gap-1 px-4 py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm active:scale-[0.98]">
                <Trash2 size={14} />クリア
              </button>
            )}
            <button onClick={onClose} className="flex-1 px-4 py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm active:scale-[0.98]">
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
