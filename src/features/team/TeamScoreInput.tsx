import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Trophy } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { SubMatchScore, MatchType, BracketSubMatchScore } from './types';
import { MATCH_TYPE_ORDER, MATCH_TYPE_LABELS, MATCH_TYPE_SHORT } from './teamLogic';

/** Full-width to half-width number conversion */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

interface Props {
  matchId: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  subMatches: (SubMatchScore | BracketSubMatchScore)[];
  onClose: () => void;
  isBracket?: boolean;
  /** team1の選手苗字候補リスト */
  team1Roster?: string[];
  /** team2の選手苗字候補リスト */
  team2Roster?: string[];
}

interface SubMatchState {
  score1: string;
  score2: string;
  tiebreakScore: string;
  p1a: string;
  p1b: string;
  p2a: string;
  p2b: string;
}

/** Default winning game count for team matches */
const WIN_GAMES = 6;

export default function TeamScoreInput({
  matchId, team1Id, team2Id, team1Name, team2Name, subMatches, onClose, isBracket = false,
  team1Roster = [], team2Roster = [],
}: Props) {
  const {
    updateSubMatchScore, clearSubMatchScore, updateSubMatchPlayers,
    updateBracketSubMatchScore, clearBracketSubMatchScore,
  } = useTeamStore();

  // Local state for each sub-match (MIX, WD, MD)
  const [scores, setScores] = useState<Record<MatchType, SubMatchState>>(() => {
    const init: Record<MatchType, SubMatchState> = {} as any;
    for (const mt of MATCH_TYPE_ORDER) {
      const sm = subMatches.find(s => s.type === mt);
      init[mt] = {
        score1: sm?.score1 !== null && sm?.score1 !== undefined && sm.score1 >= 0 ? sm.score1.toString() : '',
        score2: sm?.score2 !== null && sm?.score2 !== undefined && sm.score2 >= 0 ? sm.score2.toString() : '',
        tiebreakScore: sm?.tiebreakScore?.toString() ?? '',
        p1a: sm?.players1?.[0] ?? '',
        p1b: sm?.players1?.[1] ?? '',
        p2a: sm?.players2?.[0] ?? '',
        p2b: sm?.players2?.[1] ?? '',
      };
    }
    return init;
  });

  const handlePlayerChange = useCallback((mt: MatchType, key: 'p1a'|'p1b'|'p2a'|'p2b', value: string) => {
    setScores(prev => ({ ...prev, [mt]: { ...prev[mt], [key]: value } }));
  }, []);

  // Refs for all inputs: 3 match types x 3 inputs (score1, score2, tiebreak)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setRef = useCallback((key: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  }, []);

  // Auto-focus first input
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstInput = inputRefs.current[`${MATCH_TYPE_ORDER[0]}-score1`];
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
        firstInput.select();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Determine winner for each sub-match
  const subMatchWinners = useMemo(() => {
    const result: Record<MatchType, { winner: 0 | 1 | 2; isTiebreak: boolean; loserSide: 0 | 1 | 2 }> = {} as any;
    for (const mt of MATCH_TYPE_ORDER) {
      const s = scores[mt];
      const s1 = parseInt(s.score1);
      const s2 = parseInt(s.score2);
      let winner: 0 | 1 | 2 = 0;
      let isTiebreak = false;
      let loserSide: 0 | 1 | 2 = 0;

      if (!isNaN(s1) && !isNaN(s2) && s1 !== s2) {
        winner = s1 > s2 ? 1 : 2;
      }

      // Tiebreak detection: 7-6 or 6-7
      if ((s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1)) {
        isTiebreak = true;
        loserSide = s1 > s2 ? 2 : 1;
      }

      result[mt] = { winner, isTiebreak, loserSide };
    }
    return result;
  }, [scores]);

  // Win tally
  const winTally = useMemo(() => {
    let t1 = 0, t2 = 0;
    for (const mt of MATCH_TYPE_ORDER) {
      const w = subMatchWinners[mt].winner;
      if (w === 1) t1++;
      if (w === 2) t2++;
    }
    return { t1, t2 };
  }, [subMatchWinners]);

  // Overall winner detection (2+ wins)
  const overallWinner = useMemo(() => {
    if (winTally.t1 >= 2) return 1;
    if (winTally.t2 >= 2) return 2;
    return 0;
  }, [winTally]);

  // Input handlers
  const handleScoreChange = useCallback((matchType: MatchType, field: 'score1' | 'score2', value: string) => {
    const raw = toHalfWidth(value).replace(/[^0-9]/g, '');
    setScores(prev => ({
      ...prev,
      [matchType]: { ...prev[matchType], [field]: raw },
    }));

    // Auto-advance focus
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (field === 'score1') {
        // Auto-fill opponent score if lower score entered
        if (num < WIN_GAMES) {
          setScores(prev => {
            const current = prev[matchType];
            if (current.score2 === '') {
              return { ...prev, [matchType]: { ...current, score1: raw, score2: WIN_GAMES.toString() } };
            }
            return { ...prev, [matchType]: { ...current, score1: raw } };
          });
        }
        setTimeout(() => {
          inputRefs.current[`${matchType}-score2`]?.focus();
          inputRefs.current[`${matchType}-score2`]?.select();
        }, 50);
      } else {
        // score2 changed
        // Auto-fill score1 if needed
        setScores(prev => {
          const current = prev[matchType];
          if (num < WIN_GAMES && current.score1 === '') {
            return { ...prev, [matchType]: { ...current, score2: raw, score1: WIN_GAMES.toString() } };
          }
          return { ...prev, [matchType]: { ...current, score2: raw } };
        });

        const s1 = parseInt(scores[matchType].score1);
        // Check if tiebreak
        if ((s1 === WIN_GAMES + 1 && num === WIN_GAMES) || (s1 === WIN_GAMES && num === WIN_GAMES + 1)) {
          setTimeout(() => {
            inputRefs.current[`${matchType}-tiebreak`]?.focus();
            inputRefs.current[`${matchType}-tiebreak`]?.select();
          }, 50);
        } else {
          // Advance to next match type's score1
          const idx = MATCH_TYPE_ORDER.indexOf(matchType);
          if (idx < MATCH_TYPE_ORDER.length - 1) {
            const nextType = MATCH_TYPE_ORDER[idx + 1];
            setTimeout(() => {
              inputRefs.current[`${nextType}-score1`]?.focus();
              inputRefs.current[`${nextType}-score1`]?.select();
            }, 50);
          }
        }
      }
    }
  }, [scores]);

  const handleTiebreakChange = useCallback((matchType: MatchType, value: string) => {
    const raw = toHalfWidth(value).replace(/[^0-9]/g, '');
    setScores(prev => ({
      ...prev,
      [matchType]: { ...prev[matchType], tiebreakScore: raw },
    }));

    // Auto-advance to next match type on tiebreak entry
    if (raw.length >= 1) {
      const idx = MATCH_TYPE_ORDER.indexOf(matchType);
      if (idx < MATCH_TYPE_ORDER.length - 1) {
        const nextType = MATCH_TYPE_ORDER[idx + 1];
        setTimeout(() => {
          inputRefs.current[`${nextType}-score1`]?.focus();
          inputRefs.current[`${nextType}-score1`]?.select();
        }, 100);
      }
    }
  }, []);

  // Validate all sub-matches that have been filled
  const validate = useCallback((): boolean => {
    for (const mt of MATCH_TYPE_ORDER) {
      const s = scores[mt];
      const s1 = parseInt(s.score1);
      const s2 = parseInt(s.score2);
      // Skip empty sub-matches
      if (s.score1 === '' && s.score2 === '') continue;
      if (isNaN(s1) || isNaN(s2)) return false;
      if (s1 < 0 || s2 < 0) return false;
      if (s1 === s2) return false;
      if (s1 > WIN_GAMES + 1 || s2 > WIN_GAMES + 1) return false;
    }
    return true;
  }, [scores]);

  // Count how many sub-matches have been filled
  const filledCount = useMemo(() => {
    return MATCH_TYPE_ORDER.filter(mt => {
      const s = scores[mt];
      return s.score1 !== '' && s.score2 !== '';
    }).length;
  }, [scores]);

  const handleSave = useCallback(() => {
    if (!validate()) return;

    const updateFn = isBracket ? updateBracketSubMatchScore : updateSubMatchScore;
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;

    for (const mt of MATCH_TYPE_ORDER) {
      const s = scores[mt];
      const s1 = parseInt(s.score1);
      const s2 = parseInt(s.score2);

      if (s.score1 === '' && s.score2 === '') {
        // Clear this sub-match if previously had score
        const existing = subMatches.find(sm => sm.type === mt);
        if (existing && existing.score1 !== null) {
          clearFn(matchId, mt);
        }
        continue;
      }

      if (isNaN(s1) || isNaN(s2)) continue;

      const isTb = (s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1);
      const tb = isTb && s.tiebreakScore ? parseInt(s.tiebreakScore) : null;
      updateFn(matchId, mt, s1, s2, tb);
    }

    // 選手名は団体戦リーグのみ保存
    if (!isBracket) {
      for (const mt of MATCH_TYPE_ORDER) {
        const s = scores[mt];
        const p1 = [s.p1a, s.p1b].map(x => x.trim()).filter(Boolean);
        const p2 = [s.p2a, s.p2b].map(x => x.trim()).filter(Boolean);
        updateSubMatchPlayers(matchId, mt, p1, p2);
      }
    }

    onClose();
  }, [scores, matchId, isBracket, subMatches, onClose, validate,
      updateSubMatchScore, clearSubMatchScore, updateBracketSubMatchScore, clearBracketSubMatchScore, updateSubMatchPlayers]);

  const handleClearAll = useCallback(() => {
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;
    for (const mt of MATCH_TYPE_ORDER) {
      clearFn(matchId, mt);
    }
    onClose();
  }, [matchId, isBracket, onClose, clearSubMatchScore, clearBracketSubMatchScore]);

  // Check if any sub-match has existing scores
  const hasExistingScores = subMatches.some(sm => sm.score1 !== null);

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[100]" onClick={onClose}>
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto z-[110]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">団体戦スコア入力</h3>
              <div className="text-xs text-indigo-200 mt-0.5">3種目のスコアを入力</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Team names */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex-1 text-center p-2.5 rounded-xl border-2 transition-all ${
              overallWinner === 1 ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="font-bold text-sm text-gray-800 truncate">{team1Name}</div>
              {overallWinner === 1 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Trophy size={12} className="text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600">勝利確定</span>
                </div>
              )}
            </div>
            <div className="text-lg font-bold text-gray-300 flex-shrink-0">VS</div>
            <div className={`flex-1 text-center p-2.5 rounded-xl border-2 transition-all ${
              overallWinner === 2 ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="font-bold text-sm text-gray-800 truncate">{team2Name}</div>
              {overallWinner === 2 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Trophy size={12} className="text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600">勝利確定</span>
                </div>
              )}
            </div>
          </div>

          {/* Win tally */}
          <div className="flex items-center justify-center mb-4">
            <div className={`px-4 py-1.5 rounded-full text-sm font-bold ${
              overallWinner > 0
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              <span className={winTally.t1 > winTally.t2 ? 'text-indigo-700' : ''}>{winTally.t1}</span>
              <span className="mx-2">-</span>
              <span className={winTally.t2 > winTally.t1 ? 'text-indigo-700' : ''}>{winTally.t2}</span>
              {overallWinner > 0 && (
                <span className="ml-2 text-xs text-amber-600">勝利確定</span>
              )}
            </div>
          </div>

          {/* Sub-match score rows */}
          <div className="space-y-3 mb-4">
            {MATCH_TYPE_ORDER.map((mt) => {
              const s = scores[mt];
              const info = subMatchWinners[mt];
              const s1Val = parseInt(s.score1);
              const s2Val = parseInt(s.score2);
              const hasScores = s.score1 !== '' && s.score2 !== '';

              const score1Class = hasScores && info.winner === 1
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                : 'border-gray-300';
              const score2Class = hasScores && info.winner === 2
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                : 'border-gray-300';

              // Row background for winner/loser indication
              const rowBg = hasScores && info.winner > 0
                ? 'bg-slate-50'
                : 'bg-white';

              const renderPlayerInput = (
                key: 'p1a'|'p1b'|'p2a'|'p2b',
                listId: string,
                placeholder: string
              ) => (
                <input
                  type="text"
                  value={s[key]}
                  onChange={e => handlePlayerChange(mt, key, e.target.value)}
                  list={listId}
                  placeholder={placeholder}
                  className="w-full text-[11px] border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                />
              );
              return (
                <div key={mt} className={`rounded-xl border border-gray-200 p-3 ${rowBg} transition-all`}>
                  {/* Match type label */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-10 h-6 bg-indigo-100 text-indigo-700 text-xs font-bold rounded">
                        {MATCH_TYPE_SHORT[mt]}
                      </span>
                      <span className="text-xs text-gray-500">{MATCH_TYPE_LABELS[mt]}</span>
                    </div>
                    {hasScores && info.winner > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {info.winner === 1 ? team1Name : team2Name} 勝利
                      </span>
                    )}
                  </div>

                  {/* Score inputs */}
                  <div className="flex items-center justify-center gap-2">
                    {/* Tiebreak for team1 side (when team1 lost the tiebreak) */}
                    {info.isTiebreak && info.loserSide === 1 && (
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                        <input
                          ref={setRef(`${mt}-tiebreak`)}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={s.tiebreakScore}
                          onChange={e => handleTiebreakChange(mt, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                          autoComplete="off"
                          autoCorrect="off"
                          data-lpignore="true"
                          data-form-type="other"
                          className="w-9 h-12 text-center text-base font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
                          placeholder="?"
                        />
                      </div>
                    )}

                    <input
                      ref={setRef(`${mt}-score1`)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={s.score1}
                      onChange={e => handleScoreChange(mt, 'score1', e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      data-lpignore="true"
                      data-form-type="other"
                      className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${score1Class}`}
                      placeholder="0"
                    />

                    <span className="text-2xl font-bold text-gray-400">-</span>

                    <input
                      ref={setRef(`${mt}-score2`)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={s.score2}
                      onChange={e => handleScoreChange(mt, 'score2', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const idx = MATCH_TYPE_ORDER.indexOf(mt);
                          if (idx < MATCH_TYPE_ORDER.length - 1 && !info.isTiebreak) {
                            // Move to next row
                            const nextType = MATCH_TYPE_ORDER[idx + 1];
                            inputRefs.current[`${nextType}-score1`]?.focus();
                            inputRefs.current[`${nextType}-score1`]?.select();
                          } else if (idx === MATCH_TYPE_ORDER.length - 1 && !info.isTiebreak) {
                            handleSave();
                          }
                        }
                      }}
                      autoComplete="off"
                      autoCorrect="off"
                      data-lpignore="true"
                      data-form-type="other"
                      className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${score2Class}`}
                      placeholder="0"
                    />

                    {/* Tiebreak for team2 side (when team2 lost the tiebreak) */}
                    {info.isTiebreak && info.loserSide === 2 && (
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                        <input
                          ref={setRef(`${mt}-tiebreak`)}
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={s.tiebreakScore}
                          onChange={e => handleTiebreakChange(mt, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const idx = MATCH_TYPE_ORDER.indexOf(mt);
                              if (idx < MATCH_TYPE_ORDER.length - 1) {
                                const nextType = MATCH_TYPE_ORDER[idx + 1];
                                inputRefs.current[`${nextType}-score1`]?.focus();
                              } else {
                                handleSave();
                              }
                            }
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          data-lpignore="true"
                          data-form-type="other"
                          className="w-9 h-12 text-center text-base font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
                          placeholder="?"
                        />
                      </div>
                    )}
                  </div>

                  {/* 選手名入力 */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold truncate">{team1Name}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {renderPlayerInput('p1a', `roster-${team1Id}`, '苗字')}
                        {renderPlayerInput('p1b', `roster-${team1Id}`, '苗字')}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold truncate">{team2Name}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {renderPlayerInput('p2a', `roster-${team2Id}`, '苗字')}
                        {renderPlayerInput('p2b', `roster-${team2Id}`, '苗字')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 選手名候補 datalist */}
          <datalist id={`roster-${team1Id}`}>
            {team1Roster.map(n => <option key={n} value={n} />)}
          </datalist>
          <datalist id={`roster-${team2Id}`}>
            {team2Roster.map(n => <option key={n} value={n} />)}
          </datalist>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={filledCount === 0 || !validate()}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded-xl transition-all shadow-md text-sm font-medium mb-3 active:scale-[0.98] ${
              filledCount > 0 && validate()
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save size={14} />
            決定 {filledCount > 0 && `(${filledCount}/3)`}
          </button>

          {/* Clear / Cancel */}
          <div className="flex gap-3">
            {hasExistingScores && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-4 py-2.5 min-h-[48px] bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-colors text-sm active:scale-[0.98]"
              >
                <Trash2 size={14} />クリア
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm active:scale-[0.98]"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
