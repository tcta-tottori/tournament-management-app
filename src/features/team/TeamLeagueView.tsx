import { useState, useMemo } from 'react';
import { Check, Circle, Play, MapPin, Maximize2, X, Trophy, Target, Info, Settings2, ArrowUp, ArrowDown } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamLeagueMatch, TeamLeagueStanding, TiebreakRuleId } from './types';
import { calculateTeamStandings, MATCH_TYPE_ORDER, MATCH_TYPE_SHORT, TIEBREAK_RULE_LABELS } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';
import { createPortal } from 'react-dom';

/** リーグカラー */
const LEAGUE_COLORS = [
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', soft: 'bg-blue-100', ring: 'ring-blue-500/20' },
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', soft: 'bg-emerald-100', ring: 'ring-emerald-500/20' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', soft: 'bg-purple-100', ring: 'ring-purple-500/20' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', soft: 'bg-rose-100', ring: 'ring-rose-500/20' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', soft: 'bg-amber-100', ring: 'ring-amber-500/20' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', soft: 'bg-cyan-100', ring: 'ring-cyan-500/20' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', soft: 'bg-lime-100', ring: 'ring-lime-500/20' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', soft: 'bg-fuchsia-100', ring: 'ring-fuchsia-500/20' },
];

const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

/** 種目カラー */
const MATCH_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  MIX: { bg: 'bg-violet-100', text: 'text-violet-700' },
  WD:  { bg: 'bg-pink-100',   text: 'text-pink-700' },
  MD:  { bg: 'bg-sky-100',    text: 'text-sky-700' },
};

/** 順位（プレーンテキスト） */
function RankText({ rank }: { rank: number }) {
  return <span className="text-sm font-black text-slate-700 tabular-nums">{rank}位</span>;
}

/** 判定ルール設定パネル */
function TiebreakRuleSettings() {
  const { tiebreakOrder, setTiebreakOrder } = useTeamStore();
  const [open, setOpen] = useState(false);

  const move = (idx: number, dir: -1 | 1) => {
    const newOrder = [...tiebreakOrder];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setTiebreakOrder(newOrder);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50 transition-colors"
      >
        <Settings2 className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-bold text-slate-700">判定ルール（優先順）</span>
        <span className="ml-auto text-[10px] text-slate-400 truncate">
          {tiebreakOrder.map(r => TIEBREAK_RULE_LABELS[r].split('（')[0]).join(' → ')}
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-slate-100 space-y-1.5 bg-slate-50/40">
          {tiebreakOrder.map((rule, i) => (
            <div key={rule} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-black">{i + 1}</span>
              <span className="flex-1 text-xs font-bold text-slate-700">{TIEBREAK_RULE_LABELS[rule]}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
                <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === tiebreakOrder.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
                <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          ))}
          <div className="text-[10px] text-slate-400 pt-1">※ 勝数は常に最優先です</div>
        </div>
      )}
    </div>
  );
}

/** 判定詳細ポップアップ */
function TiebreakDetailPopup({ standing, onClose }: { standing: TeamLeagueStanding; onClose: () => void }) {
  const { tiebreakOrder } = useTeamStore();
  const totalGames = standing.gamesWon + standing.gamesLost;
  const ratio = totalGames === 0 ? 0 : standing.gamesWon / totalGames;
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-slate-700 to-slate-900 px-5 py-3 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] opacity-80 font-bold uppercase tracking-wider">判定詳細</div>
            <div className="text-base font-black">{standing.teamName}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">対戦勝敗</div>
              <div className="text-base font-black tabular-nums">{standing.wins} - {standing.losses}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">取得ポイント</div>
              <div className="text-base font-black tabular-nums">{standing.pointsWon} - {standing.pointsLost}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">取得ゲーム</div>
              <div className="text-base font-black tabular-nums">{standing.gamesWon} - {standing.gamesLost}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">ゲーム率</div>
              <div className="text-base font-black tabular-nums">{ratio.toFixed(3)}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-bold mb-1.5">適用された判定順</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
                <span className="inline-flex w-5 h-5 rounded-full bg-amber-500 text-white items-center justify-center text-[10px] font-black">0</span>
                <span className="font-bold text-amber-800">対戦勝数</span>
              </div>
              {tiebreakOrder.map((r, i) => (
                <div key={r} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="inline-flex w-5 h-5 rounded-full bg-slate-600 text-white items-center justify-center text-[10px] font-black">{i + 1}</span>
                  <span className="font-bold text-slate-700">{TIEBREAK_RULE_LABELS[r]}</span>
                </div>
              ))}
            </div>
          </div>
          {standing.tiebreakReason && (
            <div className="text-xs px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-blue-800 font-bold">適用理由: </span>
              <span className="text-blue-700">{standing.tiebreakReason}</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function TeamLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId, tiebreakOrder } = useTeamStore();
  const [editingMatch, setEditingMatch] = useState<TeamLeagueMatch | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [judgementTarget, setJudgementTarget] = useState<TeamLeagueStanding | null>(null);

  const { rankOverrides } = useTeamStore();
  const allStandings = calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder);

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  if (!selectedLeague) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Target className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-slate-500">データがありません</p>
      </div>
    );
  }

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const leagueComplete = finishedCount === totalCount && totalCount > 0;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  const leagueIdx = leagues.findIndex(l => l.leagueId === selectedLeague.leagueId);
  const color = getColor(leagueIdx);

  // 現在の対戦番号
  const currentMatchNumber = useMemo(() => {
    for (const mo of selectedLeague.matchOrder) {
      const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
      if (!match || match.status !== 'finished') return mo.matchNumber;
    }
    return null;
  }, [selectedLeague.matchOrder, leagueMatchList]);

  // スコアマトリクス
  const scoreMatrix = new Map<string, TeamLeagueMatch>();
  for (const m of leagueMatchList) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  const getMatchBetween = (team1Id: string, team2Id: string) => scoreMatrix.get(`${team1Id}-${team2Id}`);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 overflow-auto p-4' : ''} space-y-4 pb-20`}>
      {/* リーグ選択タブ（横スクロール可） */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-2 bg-gradient-to-b from-slate-50 via-slate-50 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1.5 min-w-max">
              {leagues.map((l, i) => {
                const c = getColor(i);
                const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
                const done = lm.filter(m => m.status === 'finished').length;
                const total = lm.length;
                const complete = done === total && total > 0;
                const isSelected = l.leagueId === selectedLeague.leagueId;
                return (
                  <button
                    key={l.leagueId}
                    onClick={() => setSelectedLeagueId(l.leagueId)}
                    className={`relative px-3.5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                      isSelected
                        ? `bg-gradient-to-br ${c.grad} text-white shadow-md`
                        : `${c.bg} ${c.text} hover:shadow-sm`
                    }`}
                  >
                    <span className="text-base font-black">{l.leagueId}</span>
                    <span className={`ml-1 text-[10px] tabular-nums ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                      {done}/{total}
                    </span>
                    {complete && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white flex items-center justify-center">
                        <Check className="w-2 h-2 text-white" strokeWidth={4} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 shrink-0 transition-colors"
            title={isFullscreen ? '通常表示' : '全画面'}
          >
            {isFullscreen ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* リーグヘッダーカード */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${color.grad} text-white shadow-lg`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight">{selectedLeague.leagueId}</span>
                <span className="text-sm font-medium opacity-90">リーグ</span>
              </div>
              {selectedLeague.courtName && (
                <div className="flex items-center gap-1 text-xs opacity-90 mt-1">
                  <MapPin className="w-3 h-3" />
                  {selectedLeague.courtName}
                </div>
              )}
            </div>
            <div className="text-right">
              {leagueComplete ? (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-black">
                  <Check className="w-3.5 h-3.5" />
                  全試合完了
                </div>
              ) : (
                <div className="text-[10px] opacity-80 font-medium">進行状況</div>
              )}
              <div className="text-2xl font-black tabular-nums leading-tight mt-0.5">
                {finishedCount}<span className="text-sm opacity-60">/{totalCount}</span>
              </div>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 判定ルール設定 */}
      <TiebreakRuleSettings />

      {/* 成績表 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-gradient-to-b from-white to-slate-50/60">
          <Target className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700 tracking-wide">成績表</span>
          <span className="ml-auto text-[10px] text-slate-400 tracking-wider">タップで入力</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-2 py-2 text-left min-w-[110px] font-bold text-slate-600 border-b border-slate-200">チーム</th>
                <th className="px-1 py-2 text-center w-[34px] font-bold text-slate-600 border-b border-slate-200">種目</th>
                {selectedLeague.teams.map(t => (
                  <th key={t.teamId} className="px-1.5 py-2 text-center min-w-[64px] text-[10px] font-bold text-slate-600 border-b border-slate-200">
                    {t.teamName.split(' ')[0]}
                  </th>
                ))}
                <th className="px-2 py-2 text-center min-w-[58px] font-bold text-slate-600 border-b border-slate-200">成績</th>
                {leagueComplete && (
                  <>
                    <th className="px-2 py-2 text-center min-w-[52px] font-bold text-slate-600 border-b border-slate-200">順位</th>
                    <th className="px-2 py-2 text-center min-w-[80px] font-bold text-slate-600 border-b border-slate-200">判定</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {selectedLeague.teams.map(rowTeam => {
                const standing = standings.find(s => s.teamId === rowTeam.teamId);
                return (
                  <tr key={rowTeam.teamId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-bold text-xs bg-slate-50/40 align-middle border-r border-slate-100">
                      <div className="truncate max-w-[150px]" title={rowTeam.teamName}>{rowTeam.teamName}</div>
                    </td>
                    {/* 種目ラベル列 */}
                    <td className="px-0.5 py-1.5 align-middle border-r border-slate-100 bg-slate-50/30">
                      <div className="flex flex-col gap-0.5 items-center">
                        {MATCH_TYPE_ORDER.map(mt => {
                          const tag = MATCH_TYPE_COLORS[mt];
                          return (
                            <span key={mt} className={`inline-flex items-center justify-center w-7 h-3.5 rounded text-[8px] font-black tracking-wider ${tag.bg} ${tag.text}`}>
                              {MATCH_TYPE_SHORT[mt]}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {selectedLeague.teams.map(colTeam => {
                      if (rowTeam.teamId === colTeam.teamId) {
                        return <td key={colTeam.teamId} className="bg-gradient-to-br from-slate-100 to-slate-50 border-r border-slate-100" />;
                      }
                      const match = getMatchBetween(rowTeam.teamId, colTeam.teamId);
                      if (!match) return <td key={colTeam.teamId} className="border-r border-slate-100" />;
                      const isTeam1 = match.team1Id === rowTeam.teamId;
                      const isCurrent = currentMatchNumber && match.matchNumber === currentMatchNumber;
                      const isFinished = match.status === 'finished';
                      const cellWonAll = isFinished && match.winnerId === rowTeam.teamId;
                      const cellLostAll = isFinished && match.winnerId === colTeam.teamId;

                      return (
                        <td
                          key={colTeam.teamId}
                          className={`p-0 text-center cursor-pointer transition-all border-r border-slate-100 align-middle group ${
                            cellWonAll ? 'bg-gradient-to-br from-blue-50 to-indigo-50/60' :
                            cellLostAll ? 'bg-gradient-to-br from-rose-50/60 to-rose-50/30' :
                            isCurrent ? 'league-match-blink' :
                            'hover:bg-slate-50 active:bg-slate-100'
                          }`}
                          onClick={() => setEditingMatch(match)}
                        >
                          <div className="flex flex-col gap-0.5 px-1.5 py-1.5 ring-inset group-hover:ring-1 group-hover:ring-slate-300/60 rounded-md">
                            {MATCH_TYPE_ORDER.map(matchType => {
                              const sub = match.subMatches.find(sm => sm.type === matchType);
                              const myScore = isTeam1 ? sub?.score1 : sub?.score2;
                              const oppScore = isTeam1 ? sub?.score2 : sub?.score1;
                              const won = sub?.winnerId === rowTeam.teamId;
                              const hasScore = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;
                              return (
                                <div key={matchType} className="flex items-center justify-center text-[11px] tabular-nums h-3.5">
                                  {hasScore ? (
                                    <span className={`font-black ${won ? 'text-blue-700' : 'text-rose-500'}`}>
                                      {myScore}-{oppScore}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">-</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-black text-sm align-middle bg-slate-50/40">
                      {standing ? (
                        <div className="tabular-nums">
                          {standing.wins}<span className="text-slate-300">-</span>{standing.losses}
                        </div>
                      ) : '-'}
                    </td>
                    {leagueComplete && (
                      <>
                        <td className="px-2 py-1 text-center align-middle bg-slate-50/40">
                          {standing && <RankText rank={standing.rank || 0} />}
                        </td>
                        <td
                          className="px-2 py-1 text-center align-middle bg-slate-50/40 cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => standing && setJudgementTarget(standing)}
                        >
                          {standing?.tiebreakReason ? (
                            <div className="inline-flex items-center gap-0.5 text-[9px] text-slate-600 font-medium">
                              <Info className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[80px]">{standing.tiebreakReason}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {judgementTarget && <TiebreakDetailPopup standing={judgementTarget} onClose={() => setJudgementTarget(null)} />}

      {/* 対戦順 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <Play className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">対戦順</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
          {selectedLeague.matchOrder.map(mo => {
            const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
            const team1 = selectedLeague.teams[mo.team1Index - 1];
            const team2 = selectedLeague.teams[mo.team2Index - 1];
            if (!match || !team1 || !team2) return null;

            const isFinished = match.status === 'finished';
            const isCurrent = mo.matchNumber === currentMatchNumber;

            return (
              <button
                key={mo.matchNumber}
                onClick={() => setEditingMatch(match)}
                className={`relative p-2.5 rounded-xl border text-xs transition-all active:scale-95 text-left ${
                  isFinished
                    ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                    : isCurrent
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black text-slate-400">#{mo.matchNumber}</span>
                  {isFinished ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black">
                      <Check className="w-2.5 h-2.5" />
                      完了
                    </div>
                  ) : isCurrent ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black animate-pulse">
                      <Play className="w-2.5 h-2.5" />
                      対戦中
                    </div>
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className={`truncate ${match.winnerId === team1.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team1.teamName.split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-slate-400 text-center font-bold">
                    {isFinished ? `${match.winsTeam1} - ${match.winsTeam2}` : 'vs'}
                  </div>
                  <div className={`truncate ${match.winnerId === team2.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team2.teamName.split(' ')[0]}
                  </div>
                </div>

                {/* 種目別スコア（選手名つき） */}
                {(isFinished || isCurrent) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                    {MATCH_TYPE_ORDER.map(mt => {
                      const sub = match.subMatches.find(sm => sm.type === mt);
                      const has = sub && sub.score1 !== null && sub.score2 !== null;
                      const tag = MATCH_TYPE_COLORS[mt];
                      const p1 = sub?.players1?.join('/') || '';
                      const p2 = sub?.players2?.join('/') || '';
                      return (
                        <div key={mt} className="flex items-center gap-1 text-[9px]">
                          <span className={`inline-flex items-center justify-center w-7 h-3 rounded text-[7px] font-black ${tag.bg} ${tag.text}`}>
                            {MATCH_TYPE_SHORT[mt]}
                          </span>
                          {has ? (
                            <span className="flex-1 truncate text-slate-600 tabular-nums">
                              {p1 && <span className="font-bold">{p1} </span>}
                              <span className="font-black">{sub!.score1}-{sub!.score2}</span>
                              {p2 && <span className="font-bold"> {p2}</span>}
                            </span>
                          ) : (
                            <span className="flex-1 text-slate-300">
                              {p1 || p2 ? `${p1} vs ${p2}` : '—'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* スコア入力ダイアログ */}
      {editingMatch && (() => {
        const team1 = selectedLeague.teams.find(t => t.teamId === editingMatch.team1Id);
        const team2 = selectedLeague.teams.find(t => t.teamId === editingMatch.team2Id);
        const familyOf = (n: string) => n.trim().split(/[\s\u3000]+/)[0] || n;
        const t1Roster = Array.from(new Set((team1?.members || []).map(m => familyOf(m.player.name)).filter(Boolean)));
        const t2Roster = Array.from(new Set((team2?.members || []).map(m => familyOf(m.player.name)).filter(Boolean)));
        return (
          <TeamScoreInput
            matchId={editingMatch.matchId}
            team1Id={editingMatch.team1Id}
            team2Id={editingMatch.team2Id}
            team1Name={team1?.teamName || ''}
            team2Name={team2?.teamName || ''}
            subMatches={editingMatch.subMatches}
            team1Roster={t1Roster}
            team2Roster={t2Roster}
            onClose={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
}
