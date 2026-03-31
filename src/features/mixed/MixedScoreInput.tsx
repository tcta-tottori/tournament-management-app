import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Save, Trash2, AlertTriangle } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { LeagueMatchScore, MixedTeam } from './types';

/** 全角数字→半角変換 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** ルール一覧からゲームルールのみ抽出 */
function extractGameRule(rules: string[]): string | null {
  for (const r of rules) {
    if (/ゲームマッチ|ノーアド|タイブレ|セットマッチ|ゲーム/.test(r)) {
      return r.replace(/^（[０-９\d]+）\s*/, '').trim();
    }
  }
  return null;
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

  const [score1, setScore1] = useState<string>(match.score1?.toString() ?? '');
  const [score2, setScore2] = useState<string>(match.score2?.toString() ?? '');
  const [tiebreakInput, setTiebreakInput] = useState<string>(match.tiebreakScore?.toString() ?? '');
  const [error, setError] = useState('');

  const score1Ref = useRef<HTMLInputElement>(null);
  const score2Ref = useRef<HTMLInputElement>(null);
  const tiebreakRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef<number>(0);

  useEffect(() => {
    scrollPosRef.current = window.scrollY;
    return () => {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosRef.current);
      });
    };
  }, []);

  useEffect(() => {
    setScore1(match.score1?.toString() ?? '');
    setScore2(match.score2?.toString() ?? '');
    setTiebreakInput(match.tiebreakScore?.toString() ?? '');
    setError('');
  }, [match]);

  const isTiebreak = useMemo(() => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    return (s1 === 7 && s2 === 6) || (s1 === 6 && s2 === 7);
  }, [score1, score2]);

  // どちらが敗者か (6の方)
  const loserSide = useMemo(() => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (s1 === 7 && s2 === 6) return 2;
    if (s1 === 6 && s2 === 7) return 1;
    return 0;
  }, [score1, score2]);

  const gameRule = useMemo(() => {
    return extractGameRule(tournamentInfo?.rules || []);
  }, [tournamentInfo]);

  const validate = useCallback((): boolean => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (isNaN(s1) || isNaN(s2)) { setError('スコアを入力してください'); return false; }
    if (s1 < 0 || s2 < 0) { setError('スコアは0以上で入力してください'); return false; }
    if (s1 === s2) { setError('同点は不可です'); return false; }
    if (s1 > 7 || s2 > 7) { setError('スコアは0〜7の範囲で入力してください'); return false; }
    if ((s1 === 7 && s2 === 6) || (s1 === 6 && s2 === 7)) {
      const tb = parseInt(tiebreakInput);
      if (tiebreakInput && !isNaN(tb) && tb < 0) {
        setError('タイブレークスコアは0以上で入力してください');
        return false;
      }
    }
    setError('');
    return true;
  }, [score1, score2, tiebreakInput]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const isTb = (s1 === 7 && s2 === 6) || (s1 === 6 && s2 === 7);
    const tb = isTb && tiebreakInput ? parseInt(tiebreakInput) : null;
    updateLeagueScore(match.matchId, s1, s2, tb);
    onClose();
  }, [score1, score2, tiebreakInput, match.matchId, updateLeagueScore, onClose, validate]);

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
    if (raw.length === 1 && /^[0-7]$/.test(raw)) {
      setTimeout(() => { score2Ref.current?.focus(); score2Ref.current?.select(); }, 50);
    }
  };

  const handleScore2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore2(raw);
    setError('');
    const s1 = parseInt(score1);
    const s2n = parseInt(raw);
    if (raw.length === 1 && ((s1 === 7 && s2n === 6) || (s1 === 6 && s2n === 7))) {
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
    const popupH = 380;
    let top = anchorY - popupH / 2;
    if (top < 10) top = 10;
    if (top + popupH > vh - 10) top = vh - popupH - 10;
    popupStyle.position = 'fixed';
    popupStyle.top = top;
    popupStyle.left = '50%';
    popupStyle.transform = 'translateX(-50%)';
  }

  /** タイブレーク入力欄 */
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}>
      <div
        ref={popupRef}
        className={`bg-white rounded-2xl shadow-2xl w-[440px] max-w-[95vw] overflow-hidden ${!anchorY ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : ''}`}
        style={anchorY ? popupStyle : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
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
          {/* ゲームルールのみ表示 */}
          {gameRule && (
            <div className="mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-[11px] text-amber-700 font-medium">{gameRule}</div>
            </div>
          )}

          {/* 対戦カード */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 text-center p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-[10px] text-gray-400 mb-0.5">チーム{team1?.numberInLeague}</div>
              <div className="font-bold text-sm text-gray-800">{team1?.male.name}</div>
              <div className="text-xs text-gray-700">{team1?.female.name}</div>
            </div>
            <div className="text-lg font-bold text-gray-300">VS</div>
            <div className="flex-1 text-center p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-[10px] text-gray-400 mb-0.5">チーム{team2?.numberInLeague}</div>
              <div className="font-bold text-sm text-gray-800">{team2?.male.name}</div>
              <div className="text-xs text-gray-700">{team2?.female.name}</div>
            </div>
          </div>

          {/* スコア入力 — タイブレーク入力は敗者側(6)の外側に配置 */}
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
              className="w-16 h-14 text-center text-3xl font-bold border-2 border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
              className="w-16 h-14 text-center text-3xl font-bold border-2 border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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

          <div className="flex gap-3">
            {match.status === 'finished' && (
              <button onClick={handleClear} className="flex items-center gap-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm">
                <Trash2 size={14} />クリア
              </button>
            )}
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm">
              キャンセル
            </button>
            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md text-sm font-medium">
              <Save size={14} />保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
