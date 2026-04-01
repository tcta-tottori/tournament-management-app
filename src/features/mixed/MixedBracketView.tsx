import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Trophy, Medal, Award, Users, Shuffle, Hand, RotateCcw, Ban, Save } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { PlacementCategory, BracketMatch, PlacementBracket } from './types';

/** 全角数字→半角変換 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** Extract winning game number from rules */
function getWinningGamesFromRules(rules: string[]): number {
  for (const r of rules) {
    if (/ゲームマッチ|ゲーム/.test(r)) {
      const cleaned = r.replace(/^（[０-９\d]+）\s*/, '').trim();
      const m = cleaned.match(/(\d+)\s*ゲーム/);
      if (m) return parseInt(m[1]);
      const m2 = cleaned.match(/([０-９]+)\s*ゲーム/);
      if (m2) return parseInt(toHalfWidth(m2[1]));
    }
  }
  return 6;
}

const CATEGORY_TABS: { id: PlacementCategory; label: string; icon: React.ElementType; color: string }[] = [
  { id: '1st', label: '1位', icon: Trophy, color: 'from-yellow-500 to-amber-600' },
  { id: '2nd', label: '2位', icon: Medal, color: 'from-gray-400 to-gray-500' },
  { id: '3rd', label: '3位', icon: Award, color: 'from-orange-400 to-orange-500' },
  { id: '4th', label: '4-5位', icon: Users, color: 'from-slate-400 to-slate-500' },
];

export default function MixedBracketView() {
  const { brackets, selectedBracketCategory, setSelectedBracketCategory, updateBracketScore, advanceWinner, shuffleBracketSeeds, tournamentInfo } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');
  const score2Ref = useRef<HTMLInputElement>(null);

  const winGames = useMemo(() => getWinningGamesFromRules(tournamentInfo?.rules || []), [tournamentInfo]);

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

  if (brackets.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Trophy size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">順位表からトーナメントを生成してください</p>
      </div>
    );
  }

  const getRoundLabel = (round: number, totalRounds: number): string => {
    const fromFinal = totalRounds - round;
    if (fromFinal === 0) return '決勝';
    if (fromFinal === 1) return '準決勝';
    if (fromFinal === 2) return '準々決勝';
    return `${round}回戦`;
  };

  const openScoreEditor = (match: BracketMatch) => {
    if (!match.team1Id || !match.team2Id || match.isBye) return;
    setEditingMatch(match);
    setScore1Input(match.score1 !== null && match.score1 >= 0 ? match.score1.toString() : '');
    setScore2Input(match.score2 !== null && match.score2 >= 0 ? match.score2.toString() : '');
  };

  const saveScore = () => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2) || s1 === s2) return;
    updateBracketScore(editingMatch.matchId, s1, s2);
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
    setEditingMatch(null);
  };

  const handleDEF = (winnerTeamId: string) => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    const finalScore1 = !isNaN(s1) && s1 >= 0 ? s1 : 0;
    const finalScore2 = !isNaN(s2) && s2 >= 0 ? s2 : 0;
    updateBracketScore(editingMatch.matchId, finalScore1, finalScore2, winnerTeamId);
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
    setEditingMatch(null);
  };

  const handleScore1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore1Input(raw);
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (num !== winGames && num !== winGames + 1 && score2Input === '') {
        setScore2Input(winGames.toString());
      }
      setTimeout(() => {
        score2Ref.current?.focus();
        score2Ref.current?.select();
      }, 50);
    }
  };

  const handleScore2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore2Input(raw);
    if (raw.length === 1) {
      const num = parseInt(raw);
      if (!isNaN(num) && num !== winGames && num !== winGames + 1 && score1Input === '') {
        setScore1Input(winGames.toString());
      }
    }
  };

  // Winner highlight
  const winnerSide = (() => {
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2)) return 0;
    if (s1 > s2) return 1;
    if (s2 > s1) return 2;
    return 0;
  })();

  // 1位トーナメントかつ試合がまだ始まっていないかチェック
  const is1stBracket = selectedBracketCategory === '1st';
  const noMatchesStarted = currentBracket?.matches.every(m => m.status === 'waiting' || m.status === 'bye') ?? true;

  return (
    <div className="space-y-4">
      {/* カテゴリタブ */}
      <div className="flex gap-2 overflow-x-auto">
        {CATEGORY_TABS.map(tab => {
          const Icon = tab.icon;
          const bracket = brackets.find(b => b.category === tab.id);
          const isActive = selectedBracketCategory === tab.id;
          const finished = bracket?.matches.filter(m => m.status === 'finished' || m.status === 'bye').length || 0;
          const total = bracket?.matches.length || 0;

          return (
            <button
              key={tab.id}
              onClick={() => setSelectedBracketCategory(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap
                ${isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
              {bracket && (
                <span className={`text-[10px] ml-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  ({finished}/{total})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1位トーナメント: ルーレット抽選 */}
      {is1stBracket && noMatchesStarted && currentBracket && (
        <RouletteDrawPanel
          bracket={currentBracket}
          onShuffle={shuffleBracketSeeds}
        />
      )}

      {/* ブラケット表示 */}
      {currentBracket && (
        <BracketDisplay
          bracket={currentBracket}
          onMatchClick={openScoreEditor}
          getRoundLabel={getRoundLabel}
        />
      )}

      {/* スコア入力モーダル */}
      {editingMatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setEditingMatch(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[95vw] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-800 mb-4">スコア入力</h3>

            <div className="flex items-center gap-4 mb-5">
              <div className={`flex-1 text-center p-2 rounded-xl border-2 transition-all ${winnerSide === 1 ? 'bg-emerald-50 border-emerald-300' : 'border-transparent'}`}>
                <div className="font-medium text-sm">{editingMatch.team1Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team1League}</div>
              </div>
              <span className="text-gray-300 font-bold">VS</span>
              <div className={`flex-1 text-center p-2 rounded-xl border-2 transition-all ${winnerSide === 2 ? 'bg-emerald-50 border-emerald-300' : 'border-transparent'}`}>
                <div className="font-medium text-sm">{editingMatch.team2Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team2League}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mb-5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={score1Input}
                onChange={handleScore1Change}
                className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${winnerSide === 1 ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-emerald-300'}`}
                autoFocus
              />
              <span className="text-2xl font-bold text-gray-300">-</span>
              <input
                ref={score2Ref}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={score2Input}
                onChange={handleScore2Change}
                onKeyDown={e => { if (e.key === 'Enter') saveScore(); }}
                className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${winnerSide === 2 ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-emerald-300'}`}
              />
            </div>

            {/* Save button */}
            <button
              onClick={saveScore}
              className="w-full flex items-center justify-center gap-2 py-3 min-h-[48px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium mb-3 active:scale-[0.98] transition-all shadow-md"
            >
              <Save size={14} />保存
            </button>

            {/* DEF buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => editingMatch.team2Id && handleDEF(editingMatch.team2Id)}
                className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
              >
                <Ban size={14} />
                <span className="truncate">{editingMatch.team1Name}</span>
                <span className="text-xs">DEF</span>
              </button>
              <button
                onClick={() => editingMatch.team1Id && handleDEF(editingMatch.team1Id)}
                className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
              >
                <Ban size={14} />
                <span className="truncate">{editingMatch.team2Name}</span>
                <span className="text-xs">DEF</span>
              </button>
            </div>

            <button onClick={() => setEditingMatch(null)} className="w-full py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ルーレット抽選パネル */
function RouletteDrawPanel({ bracket, onShuffle }: {
  bracket: PlacementBracket;
  onShuffle: (category: PlacementCategory, newOrder: string[]) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [currentTeamIdx, setCurrentTeamIdx] = useState(0);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ドロー枠の数（BYEを除いた1回戦のスロット数）
  const round1Matches = bracket.matches.filter(m => m.round === 1);
  const totalSlots = round1Matches.length * 2;
  const teams = bracket.teams;

  // 未割当のスロット番号リスト
  const getAvailableSlots = useCallback(() => {
    const all = Array.from({ length: totalSlots }, (_, i) => i);
    return all.filter(i => !assignedSlots.has(i));
  }, [totalSlots, assignedSlots]);

  // ルーレット回転
  const spinRoulette = useCallback(() => {
    if (currentTeamIdx >= teams.length) return;
    const available = getAvailableSlots();
    if (available.length === 0) return;

    setSpinning(true);
    let count = 0;
    const totalSpins = 15 + Math.floor(Math.random() * 10);

    const spin = () => {
      const idx = available[Math.floor(Math.random() * available.length)];
      setCurrentHighlight(idx);
      count++;

      if (count < totalSpins) {
        const delay = 50 + count * 15; // 徐々に遅くなる
        spinTimerRef.current = setTimeout(spin, delay);
      } else {
        // 停止 - このスロットに割り当て
        const finalSlot = available[Math.floor(Math.random() * available.length)];
        setCurrentHighlight(finalSlot);
        setAssignedSlots(prev => {
          const next = new Map(prev);
          next.set(finalSlot, teams[currentTeamIdx].teamId);
          return next;
        });
        setSpinning(false);
        setCurrentTeamIdx(prev => prev + 1);
      }
    };
    spin();
  }, [currentTeamIdx, teams, getAvailableSlots]);

  // 全自動抽選
  const autoDrawAll = useCallback(() => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const newOrder = shuffled.map(t => t.teamId);
    onShuffle(bracket.category, newOrder);
    setDrawComplete(true);
  }, [teams, bracket.category, onShuffle]);

  // 手動割当確定
  const confirmManualDraw = useCallback(() => {
    // assignedSlots を元に順序を決定
    const ordered: string[] = new Array(totalSlots).fill('');
    assignedSlots.forEach((teamId, slot) => { ordered[slot] = teamId; });
    const newOrder = ordered.filter(id => id !== '');
    // 未割当のチームも末尾に追加
    const assignedIds = new Set(newOrder);
    for (const t of teams) {
      if (!assignedIds.has(t.teamId)) newOrder.push(t.teamId);
    }
    onShuffle(bracket.category, newOrder);
    setDrawComplete(true);
  }, [assignedSlots, totalSlots, teams, bracket.category, onShuffle]);

  // リセット
  const resetDraw = () => {
    setAssignedSlots(new Map());
    setCurrentTeamIdx(0);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
  };

  useEffect(() => {
    return () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); };
  }, []);

  // 全チーム割当済みかチェック
  const allAssigned = currentTeamIdx >= teams.length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-3 border-b border-yellow-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
            <Shuffle size={16} className="text-yellow-600" />
            1位トーナメント 抽選
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetDraw}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={12} />
              リセット
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {!drawComplete ? (
          <>
            {/* 抽選スロット表示 */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-4">
              {Array.from({ length: totalSlots }, (_, i) => {
                const assignedTeamId = assignedSlots.get(i);
                const assignedTeam = assignedTeamId ? teams.find(t => t.teamId === assignedTeamId) : null;
                const isHighlighted = currentHighlight === i && spinning;
                const isAvailable = !assignedSlots.has(i);

                return (
                  <div
                    key={i}
                    className={`
                      relative p-2 rounded-lg border-2 text-center transition-all min-h-[56px] flex flex-col items-center justify-center
                      ${isHighlighted ? 'border-yellow-400 bg-yellow-100 scale-105 shadow-lg' :
                        assignedTeam ? 'border-emerald-300 bg-emerald-50' :
                        isAvailable ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-100'}
                    `}
                  >
                    <div className="text-[10px] text-gray-400 font-mono">#{i + 1}</div>
                    {assignedTeam ? (
                      <>
                        <div className="text-[10px] font-bold text-emerald-700 truncate w-full">{assignedTeam.teamName}</div>
                        <div className="text-[8px] text-emerald-500">{assignedTeam.leagueId}リーグ</div>
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-300">―</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 次の抽選チーム */}
            {!allAssigned && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="text-xs text-yellow-600 mb-1">次の抽選</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-yellow-800">{teams[currentTeamIdx]?.teamName}</span>
                    <span className="text-xs text-yellow-600 ml-2">({teams[currentTeamIdx]?.leagueId}リーグ)</span>
                  </div>
                  <button
                    onClick={spinRoulette}
                    disabled={spinning}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all
                      ${spinning
                        ? 'bg-yellow-200 text-yellow-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:from-yellow-600 hover:to-amber-600 shadow-md'
                      }
                    `}
                  >
                    <Shuffle size={14} className={spinning ? 'animate-spin' : ''} />
                    {spinning ? '抽選中...' : 'ルーレット'}
                  </button>
                </div>
              </div>
            )}

            {/* ボタン群 */}
            <div className="flex gap-3">
              <button
                onClick={autoDrawAll}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-xl hover:from-yellow-600 hover:to-amber-600 text-sm font-medium shadow-md transition-all"
              >
                <Shuffle size={14} />
                全自動抽選
              </button>
              {allAssigned && (
                <button
                  onClick={confirmManualDraw}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium shadow-md transition-all"
                >
                  <Hand size={14} />
                  この配置で確定
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-emerald-600 font-bold text-sm mb-2">抽選完了</div>
            <p className="text-xs text-gray-500">トーナメント表に反映されました</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** ブラケット描画コンポーネント */
function BracketDisplay({ bracket, onMatchClick, getRoundLabel }: {
  bracket: PlacementBracket;
  onMatchClick: (match: BracketMatch) => void;
  getRoundLabel: (round: number, total: number) => string;
}) {
  const totalRounds = Math.log2(bracket.drawSize);
  const matchesByRound: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    matchesByRound.push(bracket.matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
  }

  const MATCH_HEIGHT = 72;
  const MATCH_WIDTH = 220;
  const ROUND_GAP = 40;
  const MATCH_GAP = 8;

  // 1位トーナメント以外: 配置されるリーグ情報をビジュアル表示
  const is1stBracket = bracket.category === '1st';

  // 未配置スロットに配置予定のリーグ情報を表示
  const getPlaceholderInfo = (match: BracketMatch, slot: 'team1' | 'team2'): { text: string; leagueId?: string; rank?: string } | null => {
    if (is1stBracket) return { text: '―' };
    const id = slot === 'team1' ? match.team1Id : match.team2Id;
    if (id) return null; // 既に配置済み
    // 1回戦のみプレースホルダー表示
    if (match.round !== 1) return null;
    const pos = match.position;
    const slotIdx = slot === 'team1' ? (pos - 1) * 2 : (pos - 1) * 2 + 1;
    if (slotIdx < bracket.teams.length) {
      const t = bracket.teams[slotIdx];
      const rank = bracket.category === '2nd' ? '2' : bracket.category === '3rd' ? '3' : '4';
      return { text: `${t.leagueId}リーグ ${rank}位`, leagueId: t.leagueId, rank };
    }
    return { text: 'BYE' };
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
      <div className="flex gap-0" style={{ minWidth: (MATCH_WIDTH + ROUND_GAP) * totalRounds }}>
        {matchesByRound.map((roundMatches, roundIdx) => {
          const round = roundIdx + 1;
          const spacing = Math.pow(2, roundIdx);

          return (
            <div key={round} className="flex-shrink-0" style={{ width: MATCH_WIDTH + ROUND_GAP }}>
              <div className="text-center mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold
                  ${round === totalRounds ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white' :
                    round === totalRounds - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {getRoundLabel(round, totalRounds)}
                </span>
              </div>

              <div className="space-y-0">
                {roundMatches.map((match, matchIdx) => {
                  const topPadding = roundIdx === 0 ? 0 : (spacing - 1) * (MATCH_HEIGHT + MATCH_GAP) / 2;
                  const bottomPadding = (spacing - 1) * (MATCH_HEIGHT + MATCH_GAP);

                  const ph1 = getPlaceholderInfo(match, 'team1');
                  const ph2 = getPlaceholderInfo(match, 'team2');

                  return (
                    <div key={match.matchId} style={{ paddingTop: matchIdx === 0 ? topPadding : bottomPadding }}>
                      <div
                        onClick={() => onMatchClick(match)}
                        className={`
                          rounded-lg border-2 overflow-hidden transition-all cursor-pointer
                          ${match.status === 'finished' ? 'border-emerald-300 shadow-sm' :
                            match.status === 'ready' ? 'border-blue-300 shadow-sm hover:shadow-md' :
                            match.status === 'bye' ? 'border-gray-200 opacity-60' :
                            'border-gray-200 hover:border-gray-300'}
                        `}
                        style={{ width: MATCH_WIDTH, height: MATCH_HEIGHT }}
                      >
                        <div className={`flex items-center px-2 h-[34px] text-xs border-b border-gray-100
                          ${match.winnerId === match.team1Id ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                        `}>
                          <span className="text-[10px] text-gray-400 w-5 flex-shrink-0">{match.team1League}</span>
                          <span className="flex-1 truncate">
                            {match.team1Name || (ph1 ? (
                              ph1.leagueId ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[10px] font-bold">{ph1.leagueId}</span>
                                  <span className="text-[10px] text-blue-400">{ph1.rank}位</span>
                                </span>
                              ) : <span className="text-[10px] text-gray-400 italic">{ph1.text}</span>
                            ) : '―')}
                          </span>
                          {match.score1 !== null && (
                            <span className={`font-mono font-bold ml-1 ${match.winnerId === match.team1Id ? 'text-emerald-600' : 'text-gray-500'}`}>
                              {match.score1}
                            </span>
                          )}
                        </div>
                        <div className={`flex items-center px-2 h-[34px] text-xs
                          ${match.winnerId === match.team2Id ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                        `}>
                          <span className="text-[10px] text-gray-400 w-5 flex-shrink-0">{match.team2League}</span>
                          <span className="flex-1 truncate">
                            {match.team2Name || (ph2 ? (
                              ph2.leagueId ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[10px] font-bold">{ph2.leagueId}</span>
                                  <span className="text-[10px] text-blue-400">{ph2.rank}位</span>
                                </span>
                              ) : <span className="text-[10px] text-gray-400 italic">{ph2.text}</span>
                            ) : '―')}
                          </span>
                          {match.score2 !== null && (
                            <span className={`font-mono font-bold ml-1 ${match.winnerId === match.team2Id ? 'text-emerald-600' : 'text-gray-500'}`}>
                              {match.score2}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
