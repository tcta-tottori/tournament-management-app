import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, MapPin, Pencil, FlaskConical, Info } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedScoreInput from './MixedScoreInput';
import type { LeagueMatchScore, LeagueStanding } from './types';
import { GameRatioCell } from './GameRatioCell';


/** リーグバッジカラー (エントリーページと統一) */
const LEAGUE_COLORS = [
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-700' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-700' },
];

/** 名前を均等割り付けで表示（5文字幅基準） */
function AlignedName({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`inline-block w-[5em] text-justify ${className}`} style={{ textAlignLast: 'justify' }}>
      {name.replace(/[\s\u3000]+/g, '')}
    </span>
  );
}

export default function MixedDrawView() {
  const { leagues, leagueMatches, fillAllScoresForTest } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<LeagueMatchScore | null>(null);
  const [clickY, setClickY] = useState<number | undefined>(undefined);

  const handleEditMatch = (m: LeagueMatchScore, e?: React.MouseEvent) => {
    setClickY(e?.clientY);
    setEditingMatch(m);
  };

  const hasUnfinished = leagueMatches.some(m => m.status !== 'finished');

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* テストボタン */}
      {hasUnfinished && (
        <div className="flex justify-end">
          <button
            onClick={() => { if (confirm('テスト用：全ての予選リーグ未完了試合を6-4で入力しますか？')) fillAllScoresForTest(); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-white text-purple-600 border border-purple-200 hover:bg-purple-50 hover:border-purple-300 transition-all active:scale-95 shadow-sm"
          >
            <FlaskConical size={14} />
            テスト: 全6-4入力
          </button>
        </div>
      )}

      <AllLeaguesView onEditMatch={handleEditMatch} />

      {editingMatch && (
        <MixedScoreInput
          match={editingMatch}
          teams={leagues.find(l => l.leagueId === editingMatch.leagueId)?.teams || []}
          onClose={() => setEditingMatch(null)}
          anchorY={clickY}
        />
      )}
    </div>
  );
}

/** タイブレークスコアの表示テキストを生成 */
function formatScoreText(match: LeagueMatchScore, rowTeamId: string): string {
  const isTeam1 = match.team1Id === rowTeamId;
  const myScore = isTeam1 ? match.score1 : match.score2;
  const oppScore = isTeam1 ? match.score2 : match.score1;
  const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);

  if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
    if (won) {
      return `${myScore}-${oppScore}(${match.tiebreakScore})`;
    } else {
      return `(${match.tiebreakScore})${myScore}-${oppScore}`;
    }
  }
  return `${myScore}-${oppScore}`;
}

/** 抽選ボタン — 同率ゲーム率のチームの順位を手動で決定 */
function TiebreakLotteryButton({ standing, standings, leagueId }: {
  standing: LeagueStanding;
  standings: LeagueStanding[];
  leagueId: string;
}) {
  const { setRankOverride } = useMixedStore();
  const [showPicker, setShowPicker] = useState(false);
  const [lotteryResult, setLotteryResult] = useState<{ teamId: string; teamName: string; rank: number }[] | null>(null);
  const [manualRanks, setManualRanks] = useState<Map<string, number>>(new Map());

  const [spinning, setSpinning] = useState(false);
  const [spinDisplay, setSpinDisplay] = useState<{ teamId: string; teamName: string; rank: number }[] | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同じゲーム率のチーム群を特定
  const sameRatioTeams = standings.filter(s => {
    if (s.wins !== standing.wins) return false;
    const r1 = s.gamesLost === 0 ? (s.gamesWon > 0 ? Infinity : 0) : s.gamesWon / s.gamesLost;
    const r2 = standing.gamesLost === 0 ? (standing.gamesWon > 0 ? Infinity : 0) : standing.gamesWon / standing.gamesLost;
    return Math.abs(r1 - r2) < 0.0001 || (r1 === Infinity && r2 === Infinity);
  });

  const baseRank = Math.min(...sameRatioTeams.map(s => s.rank));

  const applyResult = (result: { teamId: string; rank: number }[]) => {
    for (const r of result) {
      setRankOverride(leagueId, r.teamId, r.rank);
    }
    setShowPicker(false);
    setLotteryResult(null);
    setManualRanks(new Map());
    setSpinDisplay(null);
  };

  const handleLottery = () => {
    // 最終結果を先に決定
    const finalShuffled = [...sameRatioTeams].sort(() => Math.random() - 0.5);
    const finalResult = finalShuffled.map((s, i) => ({ teamId: s.teamId, teamName: s.teamName, rank: baseRank + i }));

    // スピンアニメーション
    setSpinning(true);
    setLotteryResult(null);
    let count = 0;
    const totalSpins = 12;

    const spin = () => {
      const shuffled = [...sameRatioTeams].sort(() => Math.random() - 0.5);
      setSpinDisplay(shuffled.map((s, i) => ({ teamId: s.teamId, teamName: s.teamName, rank: baseRank + i })));
      count++;

      if (count < totalSpins) {
        const delay = 80 + count * 40; // 徐々に遅くなる
        spinTimerRef.current = setTimeout(spin, delay);
      } else {
        // 最終結果を表示
        setTimeout(() => {
          setSpinDisplay(null);
          setSpinning(false);
          setLotteryResult(finalResult);
        }, 300);
      }
    };
    spin();
  };

  // クリーンアップ
  useEffect(() => {
    return () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); };
  }, []);

  const handleManualSet = (teamId: string, rank: number) => {
    setManualRanks(prev => {
      const next = new Map(prev);
      // 既にこのrankが割り当てられているチームがあれば解除
      for (const [tid, r] of next) {
        if (r === rank && tid !== teamId) next.delete(tid);
      }
      next.set(teamId, rank);
      return next;
    });
  };

  const allManualAssigned = manualRanks.size === sameRatioTeams.length;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowPicker(true); setLotteryResult(null); setManualRanks(new Map()); }}
        className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-amber-100 transition-colors"
      >
        🎲 抽選
      </button>
      {showPicker && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">順位決定（抽選）</h3>
            <p className="text-xs text-gray-500 mb-3">
              ゲーム取得率が同率のため、抽選または手動で順位を決定してください。
            </p>

            {/* 同率チーム一覧 */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="text-[10px] font-bold text-gray-500 mb-2">同率チーム（{sameRatioTeams.length}チーム）</div>
              {sameRatioTeams.map(s => (
                <div key={s.teamId} className="flex items-center gap-2 text-xs py-1">
                  <span className="font-bold text-gray-800">{s.teamName}</span>
                  <span className="text-gray-400">ゲーム率 {s.gameRatio === Infinity ? '∞' : s.gameRatio.toFixed(3)}</span>
                </div>
              ))}
            </div>

            {/* スピンアニメーション */}
            {spinning && spinDisplay && (
              <div className="mb-4">
                <div className="text-center mb-3">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-100 to-orange-100 rounded-full">
                    <span className="text-lg animate-spin">🎲</span>
                    <span className="text-sm font-bold text-amber-700">抽選中...</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {spinDisplay.sort((a, b) => a.rank - b.rank).map(r => (
                    <div key={r.teamId} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-amber-200 transition-all duration-75">
                      <span className="w-7 h-7 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs font-bold animate-pulse">{r.rank}</span>
                      <span className="font-bold text-gray-800 text-sm">{r.teamName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ルーレット結果表示 */}
            {!spinning && lotteryResult && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="text-xs font-bold text-amber-700 mb-2 text-center">🎊 抽選結果</div>
                <div className="space-y-2">
                  {lotteryResult.sort((a, b) => a.rank - b.rank).map(r => (
                    <div key={r.teamId} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        r.rank === baseRank ? 'bg-yellow-400 text-white' :
                        r.rank === baseRank + 1 ? 'bg-gray-400 text-white' :
                        'bg-gray-200 text-gray-600'
                      }`}>{r.rank}</span>
                      <span className="font-bold text-gray-800 text-sm">{r.teamName}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => applyResult(lotteryResult)}
                  className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-[0.98]"
                >
                  この結果で確定
                </button>
                <button
                  onClick={handleLottery}
                  className="w-full mt-2 py-2 text-xs text-amber-600 hover:text-amber-700 transition-colors"
                >
                  もう一度ルーレット
                </button>
              </div>
            )}

            {/* ルーレット結果がない場合のアクション */}
            {!lotteryResult && (
              <>
                <button
                  onClick={handleLottery}
                  disabled={spinning}
                  className="w-full py-3 mb-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {spinning ? '🎲 抽選中...' : '🎲 ルーレットで決定'}
                </button>

                {/* 手動で全員の順位を指定 */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-bold text-gray-600 mb-3">手動で順位を指定</div>
                  {sameRatioTeams.map(s => {
                    const assigned = manualRanks.get(s.teamId);
                    return (
                      <div key={s.teamId} className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-gray-800 flex-1 truncate">{s.teamName}</span>
                        <div className="flex gap-1">
                          {sameRatioTeams.map((_, i) => {
                            const rank = baseRank + i;
                            const isSelected = assigned === rank;
                            const isTaken = !isSelected && [...manualRanks.values()].includes(rank);
                            return (
                              <button key={rank} onClick={() => handleManualSet(s.teamId, rank)}
                                disabled={isTaken}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                  isSelected ? 'bg-emerald-500 text-white ring-2 ring-emerald-300' :
                                  isTaken ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                                  'bg-gray-50 border border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50'
                                }`}
                              >{rank}位</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {allManualAssigned && (
                    <button
                      onClick={() => applyResult([...manualRanks.entries()].map(([teamId, rank]) => ({ teamId, teamName: '', rank })))}
                      className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-[0.98]"
                    >
                      この順位で確定
                    </button>
                  )}
                </div>
              </>
            )}

            <button onClick={() => setShowPicker(false)} className="w-full mt-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-all">
              閉じる
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** 全リーグ一覧表示 */
function AllLeaguesView({ onEditMatch }: { onEditMatch: (m: LeagueMatchScore, e?: React.MouseEvent) => void }) {
  const { leagues, leagueMatches, updateCourtName, rankOverrides } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  return (
    <>
      {/* 点滅アニメーション */}
      <style>{`
        @keyframes cell-blink {
          0%, 100% { background-color: rgba(253, 224, 71, 0.2); }
          50% { background-color: rgba(253, 224, 71, 0.6); }
        }
        .cell-blink { animation: cell-blink 1.5s ease-in-out infinite; }
        @keyframes badge-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .badge-blink { animation: badge-blink 1.5s ease-in-out infinite; }
      `}</style>

      <div className="space-y-4">
        {leagues.map((league, leagueIdx) => {
          const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
          const finishedCount = lMatches.filter(m => m.status === 'finished').length;
          const totalCount = lMatches.length;
          const standings = allStandings.get(league.leagueId) || [];
          const isComplete = finishedCount === totalCount && totalCount > 0;
          const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];
          const hasTiebreak = finishedCount > 0 && standings.some(s => s.tiebreakReason);
          // エントリーが全チーム完了しているか（entry or def）
          const allEntryDone = league.teams.every(t => t.status === 'entry' || t.status === 'def');

          // 現在の対戦を特定
          const currentMatchNumber = (() => {
            for (const mo of league.matchOrder) {
              const match = lMatches.find(m => m.matchNumber === mo.matchNumber);
              if (!match || match.status !== 'finished') return mo.matchNumber;
            }
            return null;
          })();
          const currentMatch = currentMatchNumber ? lMatches.find(m => m.matchNumber === currentMatchNumber) : null;

          const scoreMatrix = new Map<string, LeagueMatchScore>();
          for (const m of lMatches) {
            scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
            scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
          }

          const isCellCurrent = (team1Id: string, team2Id: string) => {
            if (!currentMatch) return false;
            return (
              (currentMatch.team1Id === team1Id && currentMatch.team2Id === team2Id) ||
              (currentMatch.team1Id === team2Id && currentMatch.team2Id === team1Id)
            );
          };

          const getCellDisplay = (rowTeamId: string, colTeamId: string) => {
            if (rowTeamId === colTeamId) return { text: '__DIAG__', color: '', bg: 'bg-gray-100' };
            const match = scoreMatrix.get(`${rowTeamId}-${colTeamId}`);
            const current = isCellCurrent(rowTeamId, colTeamId);
            if (!match || match.status !== 'finished') {
              return { text: '', color: '', bg: current ? 'cell-blink cursor-pointer' : 'bg-white hover:bg-emerald-50 cursor-pointer' };
            }
            const isTeam1 = match.team1Id === rowTeamId;
            const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
            return {
              text: formatScoreText(match, rowTeamId),
              color: won ? 'text-emerald-700 font-bold' : 'text-red-600',
              bg: won ? 'bg-emerald-50 cursor-pointer' : 'bg-red-50 cursor-pointer',
            };
          };

          return (
            <div key={league.leagueId} className={`relative bg-white rounded-xl shadow-sm border ${colors.border} overflow-hidden ${!allEntryDone ? 'opacity-50' : ''}`}>
              {!allEntryDone && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 pointer-events-none">
                  <span className="px-4 py-2 bg-gray-800/70 text-white text-xs font-bold rounded-full">エントリー未完了</span>
                </div>
              )}
              {/* リーグヘッダー */}
              <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r ${colors.light} border-b ${colors.border}`}>
                <span className={`w-8 h-8 bg-gradient-to-br ${colors.from} ${colors.to} text-white text-sm font-bold rounded-lg flex items-center justify-center shadow shrink-0`}>
                  {league.leagueId.trim()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-800 text-sm">
                    {league.leagueId.trim()}リーグ
                    <span className="text-xs font-normal text-gray-400 ml-1">{league.teams.length}ペア</span>
                  </h3>
                  {editingCourtId === league.leagueId ? (
                    <div className="flex items-center gap-1">
                      <MapPin size={10} className="text-gray-400 shrink-0" />
                      <input
                        type="text"
                        value={courtInput}
                        onChange={e => setCourtInput(e.target.value)}
                        onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                          if (e.key === 'Escape') setEditingCourtId(null);
                        }}
                        className="px-1 py-0 text-xs border border-emerald-400 rounded focus:outline-none w-24"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                      className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-emerald-600 transition-colors"
                    >
                      <MapPin size={10} />
                      {league.courtName || '(コート未設定)'}
                      <Pencil size={8} className="opacity-40" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500">{finishedCount}/{totalCount}</span>
                  {isComplete && <Check size={14} className="text-emerald-500" />}
                  <div className="w-12 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${colors.from} ${colors.to} rounded-full transition-all`}
                      style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 対戦マトリックス — scrollbar-thin */}
              <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
                <table className="w-full text-xs sm:text-sm" style={{ minWidth: league.teams.length >= 5 ? 740 : 580 }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-6">#</th>
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-[120px] sm:w-[150px]">ペア名</th>
                      <th className="px-1.5 sm:px-2 py-1.5 text-left text-[10px] sm:text-xs text-gray-500 w-[80px] sm:w-[100px]">所属</th>
                      {league.teams.map((t, i) => {
                        const maleSei = t.male.name.replace(/[\s\u3000]+/g, '').slice(0, 2);
                        const femaleSei = t.female.name.replace(/[\s\u3000]+/g, '').slice(0, 2);
                        return (
                          <th key={i} className="px-0.5 sm:px-1 py-1.5 text-center text-gray-500 w-14 sm:w-[70px]">
                            <span className={`inline-flex items-center justify-center w-5 h-5 ${colors.badge} rounded-full text-[10px] font-bold`}>{i + 1}</span>
                            <div className="text-[8px] sm:text-[9px] text-gray-400 leading-tight mt-0.5 truncate">{maleSei}/{femaleSei}</div>
                          </th>
                        );
                      })}
                      <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-10 sm:w-14">勝敗</th>
                      <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-8 sm:w-10">位</th>
                      {hasTiebreak && (
                        <th className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs text-gray-500 w-20 sm:w-28">判定</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {league.teams.map((team, rowIdx) => {
                      const standing = standings.find(s => s.teamId === team.teamId);
                      return (
                        <tr key={team.teamId} className={`border-t border-gray-100 hover:bg-gray-50/50 ${rowIdx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-1.5 sm:px-2 py-2">
                            <div className="flex flex-col items-center">
                              <span className={`inline-flex items-center justify-center w-5 h-5 ${colors.badge} rounded-full text-[10px] font-bold`}>{rowIdx + 1}</span>
                              <span className="text-[8px] text-gray-400 mt-0.5">No.{team.pairNumber}</span>
                            </div>
                          </td>
                          <td className="px-1.5 sm:px-2 py-2 w-[130px] sm:w-[150px]">
                            <div className="text-sm font-bold text-gray-800 leading-snug"><AlignedName name={team.male.name} /></div>
                            <div className="text-sm font-bold text-gray-800 leading-snug"><AlignedName name={team.female.name} /></div>
                          </td>
                          <td className="px-1.5 sm:px-2 py-2 w-[80px] sm:w-[100px] border-l border-gray-200">
                            <div className="text-[11px] text-gray-400 leading-snug truncate">{team.male.affiliation}</div>
                            <div className="text-[11px] text-gray-400 leading-snug truncate">{team.female.affiliation}</div>
                          </td>
                          {league.teams.map((colTeam, colIdx) => {
                            const cell = getCellDisplay(team.teamId, colTeam.teamId);
                            return (
                              <td
                                key={colIdx}
                                className={`px-0.5 sm:px-1 py-1.5 text-center text-[9px] sm:text-[11px] ${cell.color} ${cell.bg} border-l border-gray-100 transition-colors whitespace-nowrap ${cell.text === '__DIAG__' ? 'relative' : ''}`}
                                onClick={e => {
                                  if (team.teamId === colTeam.teamId) return;
                                  const match = lMatches.find(m =>
                                    (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
                                    (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
                                  );
                                  if (match) onEditMatch(match, e);
                                }}
                              >
                                {cell.text === '__DIAG__' ? (
                                  <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none"><line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1" /></svg>
                                ) : cell.text || (team.teamId !== colTeam.teamId && <span className="text-gray-300 text-[9px]">-</span>)}
                              </td>
                            );
                          })}
                          <td className="px-1 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold text-gray-700 border-l border-gray-200">
                            {standing ? `${standing.wins}-${standing.losses}` : '-'}
                          </td>
                          <td className="px-1 sm:px-2 py-1.5 text-center border-l border-gray-200">
                            {isComplete && standing && standing.rank > 0 && (
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
                                ${standing.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                  standing.rank === 2 ? 'bg-gray-200 text-gray-600' :
                                  standing.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
                              `}>
                                {standing.rank}
                              </span>
                            )}
                          </td>
                          {hasTiebreak && (
                            <td className="px-1 sm:px-2 py-1.5 text-center border-l border-gray-200">
                              {standing?.tiebreakReason && (
                                standing.tiebreakReason.startsWith('ゲーム率') ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <Info size={9} className="shrink-0" />
                                    <GameRatioCell
                                      gamesWon={standing.gamesWon}
                                      gamesLost={standing.gamesLost}
                                      className="text-[9px] sm:text-[10px]"
                                      teamName={standing.teamName}
                                      matchDetails={lMatches.filter(m => m.status === 'finished' && (m.team1Id === standing.teamId || m.team2Id === standing.teamId)).map(m => {
                                        const isT1 = m.team1Id === standing.teamId;
                                        const oppId = isT1 ? m.team2Id : m.team1Id;
                                        const oppTeam = league.teams.find(t => t.teamId === oppId);
                                        return {
                                          opponentName: oppTeam?.teamName || '?',
                                          won: (isT1 ? m.score1 : m.score2) ?? 0,
                                          lost: (isT1 ? m.score2 : m.score1) ?? 0,
                                          isWin: m.winnerId === standing.teamId,
                                        };
                                      })}
                                    />
                                  </span>
                                ) : standing.tiebreakReason?.startsWith('抽選') ? (
                                  <TiebreakLotteryButton
                                    standing={standing}
                                    standings={standings}
                                    leagueId={league.leagueId}
                                  />
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <Info size={9} className="shrink-0" />
                                    {standing.tiebreakReason}
                                  </span>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 対戦順 */}
              {league.matchOrder.length > 0 && (
                <div className={`px-3 py-2 bg-gradient-to-r ${colors.light} border-t ${colors.border}`}>
                  <div className="text-[10px] font-bold text-gray-500 mb-1">対戦順</div>
                  <div className="flex flex-wrap gap-1">
                    {league.matchOrder.map(mo => {
                      const match = lMatches.find(m => m.matchNumber === mo.matchNumber);
                      const isFinished = match?.status === 'finished';
                      const isCurrent = mo.matchNumber === currentMatchNumber;
                      return (
                        <span
                          key={mo.matchNumber}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${isFinished ? `${colors.badge}` :
                              isCurrent ? 'bg-yellow-200 text-yellow-800 font-bold badge-blink' :
                              'bg-white text-gray-400 border border-gray-200'}
                          `}
                        >
                          {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-{String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
