import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Trophy, ChevronRight, MapPin, Play, Check, Medal, Award, Users, Sparkles, Shuffle, RotateCcw, ClipboardList } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTeamStore } from './teamStore';
import type { TeamBracketMatch, PlacementCategory, TeamPlacementBracket } from './types';
import { MATCH_TYPE_SHORT } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

const CATEGORY_CONFIG: Record<PlacementCategory, { grad: string; bg: string; text: string; icon: typeof Trophy }> = {
  '1st': { grad: 'from-yellow-400 to-amber-500', bg: 'bg-yellow-50', text: 'text-yellow-700', icon: Trophy },
  '2nd': { grad: 'from-slate-400 to-slate-500', bg: 'bg-slate-50', text: 'text-slate-700', icon: Medal },
  '3rd': { grad: 'from-orange-400 to-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: Award },
  '4th': { grad: 'from-blue-400 to-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', icon: Sparkles },
};

export default function TeamBracketView() {
  const {
    brackets, selectedBracketCategory, setSelectedBracketCategory,
    advanceWinner, bracketCourtAssignments, assignBracketMatchToCourt,
    allTeams, leagues, rebuildBracketFromSlots,
  } = useTeamStore();

  const [editingMatch, setEditingMatch] = useState<TeamBracketMatch | null>(null);
  const [courtAssignMatch, setCourtAssignMatch] = useState<TeamBracketMatch | null>(null);
  const [courtAssignSelected, setCourtAssignSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'bracket' | 'waiting'>('bracket');

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

  // 全ブラケットから対戦待ち（ready）試合を収集（控えリスト用）
  const waitingMatches = useMemo(() => {
    const items: { match: TeamBracketMatch; bracket: TeamPlacementBracket; roundLabel: string }[] = [];
    for (const b of brackets) {
      const totalR = Math.log2(b.drawSize);
      for (const m of b.matches) {
        if (m.team1Id && m.team2Id && !m.isBye && (m.status === 'waiting' || m.status === 'ready')) {
          const fromFinal = totalR - m.round;
          const rl = fromFinal === 0 ? '決勝' : fromFinal === 1 ? '準決勝' : fromFinal === 2 ? '準々決勝' : `${m.round}回戦`;
          items.push({ match: m, bracket: b, roundLabel: rl });
        }
      }
    }
    items.sort((a, b) => {
      if (a.match.round !== b.match.round) return a.match.round - b.match.round;
      const order = ['1st', '2nd', '3rd', '4th'];
      return order.indexOf(a.bracket.category) - order.indexOf(b.bracket.category);
    });
    return items;
  }, [brackets]);
  const is1stBracket = selectedBracketCategory === '1st';
  const showDrawPanel = useMemo(() => {
    if (!is1stBracket || !currentBracket) return false;
    const r1 = currentBracket.matches.filter(m => m.round === 1 && !m.isBye);
    return r1.some(m => !m.team1Id || !m.team2Id);
  }, [is1stBracket, currentBracket]);

  // 使用中コート（決勝Tに割り当て済みのコート＋予選未完了リーグのコート）
  const usedCourtNames = useMemo(() => {
    const used = new Set<string>();
    for (const ca of Object.values(bracketCourtAssignments)) {
      for (const c of ca.courtNames) used.add(c);
    }
    return used;
  }, [bracketCourtAssignments]);

  const openCourtAssign = (match: TeamBracketMatch) => {
    setCourtAssignMatch(match);
    const existing = bracketCourtAssignments[match.matchId];
    setCourtAssignSelected(existing ? [...existing.courtNames] : []);
  };

  const confirmCourtAssign = () => {
    if (!courtAssignMatch || courtAssignSelected.length === 0) return;
    assignBracketMatchToCourt(courtAssignMatch.matchId, courtAssignSelected);
    setCourtAssignMatch(null);
    setCourtAssignSelected([]);
  };

  if (!currentBracket || brackets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-slate-500">決勝トーナメント未生成</p>
        <p className="text-sm mt-1">予選リーグ順位表から生成してください</p>
      </div>
    );
  }

  const totalRounds = Math.log2(currentBracket.drawSize);

  const getRoundName = (round: number) => {
    if (round === totalRounds) return '決勝';
    if (round === totalRounds - 1) return '準決勝';
    if (round === totalRounds - 2) return '準々決勝';
    return `${round}回戦`;
  };

  // ラウンドごとに試合をグループ化
  const roundMatches = Array.from({ length: totalRounds }, (_, i) =>
    currentBracket.matches.filter(m => m.round === i + 1)
  );

  // 優勝チーム
  const final = currentBracket.matches.find(m => m.round === totalRounds);
  const winnerTeam = final?.winnerId ? allTeams.find(t => t.teamId === final.winnerId) : null;

  const currentConfig = CATEGORY_CONFIG[selectedBracketCategory];

  return (
    <div className="space-y-4 pb-20">
      {/* メインタブ: トーナメント / 控えリスト */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setViewMode('bracket')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            viewMode === 'bracket' ? 'bg-white border border-b-white border-slate-200 text-slate-800 -mb-[1px]' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Trophy size={14} />
          トーナメント
        </button>
        <button
          onClick={() => setViewMode('waiting')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            viewMode === 'waiting' ? 'bg-white border border-b-white border-slate-200 text-slate-800 -mb-[1px]' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClipboardList size={14} />
          控えリスト
          {waitingMatches.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{waitingMatches.length}</span>
          )}
        </button>
      </div>

      {viewMode === 'waiting' && (
        <TeamWaitingList
          waitingMatches={waitingMatches}
          onAssignCourt={openCourtAssign}
          bracketCourtAssignments={bracketCourtAssignments}
        />
      )}

      {viewMode === 'bracket' && (<>
      {/* カテゴリタブ */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-2 bg-gradient-to-b from-slate-50 via-slate-50 to-transparent">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 min-w-max">
            {brackets.map(b => {
              const isSelected = b.category === selectedBracketCategory;
              const cfg = CATEGORY_CONFIG[b.category];
              const Icon = cfg.icon;
              const finishedCount = b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length;
              const total = b.matches.length;
              return (
                <button
                  key={b.category}
                  onClick={() => setSelectedBracketCategory(b.category)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    isSelected
                      ? `bg-gradient-to-br ${cfg.grad} text-white shadow-md`
                      : `${cfg.bg} ${cfg.text} hover:shadow-sm`
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{CATEGORY_LABELS[b.category]}</span>
                  <span className={`text-[10px] tabular-nums ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                    {finishedCount}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* カテゴリヘッダー */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${currentConfig.grad} text-white shadow-lg`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative p-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <currentConfig.icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black tracking-tight">{CATEGORY_LABELS[selectedBracketCategory]}</h1>
            <p className="text-xs opacity-90 mt-0.5">{currentBracket.drawSize}チームドロー</p>
          </div>
          {winnerTeam && (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">優勝</div>
              <div className="text-sm font-black truncate max-w-[140px]">{winnerTeam.teamName}</div>
            </div>
          )}
        </div>
      </div>

      {/* 1位トーナメント抽選パネル（1回戦に未配置スロットがある場合のみ） */}
      {showDrawPanel && currentBracket && (
        <TeamRouletteDrawPanel
          bracket={currentBracket}
          onRebuild={rebuildBracketFromSlots}
        />
      )}

      {/* ブラケット表示 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold text-slate-700">トーナメント表</span>
          <span className="ml-auto text-[10px] text-slate-400">横スクロールで全体表示</span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-fit p-3">
            {roundMatches.map((matches, ri) => (
              <div key={ri} className="flex flex-col gap-3 min-w-[240px]">
                {/* ラウンドヘッダー */}
                <div className={`text-center font-black text-xs px-3 py-2 rounded-xl ${
                  ri + 1 === totalRounds
                    ? 'bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-800 border border-amber-200'
                    : ri + 1 === totalRounds - 1
                    ? 'bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {getRoundName(ri + 1)}
                </div>

                {/* 試合カード */}
                <div className="flex flex-col justify-around flex-1 gap-3">
                  {matches.map(match => {
                    const court = bracketCourtAssignments[match.matchId];
                    const isFinished = match.status === 'finished';
                    const isBye = match.status === 'bye';
                    const isPlaying = match.status === 'playing';
                    const isReady = match.status === 'ready';

                    const cardStyle = isFinished
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : isBye
                      ? 'border-slate-200 bg-slate-50/50 opacity-70'
                      : isPlaying
                      ? 'border-blue-300 bg-blue-50/30 ring-2 ring-blue-500/20 shadow-md'
                      : isReady
                      ? 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
                      : 'border-slate-200 opacity-80';

                    return (
                      <div
                        key={match.matchId}
                        className={`border rounded-xl overflow-hidden transition-all bg-white ${cardStyle}`}
                      >
                        {/* ステータスバー */}
                        <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50/80 border-b border-slate-100 text-[10px]">
                          <div className="flex items-center gap-1 min-w-0">
                            {court ? (
                              <span className="flex items-center gap-0.5 text-blue-600 font-bold truncate">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{court.courtNames.join('・')}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">#{match.position}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isFinished && (
                              <span className="flex items-center gap-0.5 text-emerald-600 font-bold">
                                <Check className="w-2.5 h-2.5" />
                                完了
                              </span>
                            )}
                            {isPlaying && (
                              <span className="flex items-center gap-0.5 text-blue-600 font-bold animate-pulse">
                                <Play className="w-2.5 h-2.5" />
                                対戦中
                              </span>
                            )}
                            {isBye && <span className="text-slate-400 font-bold">BYE</span>}
                          </div>
                        </div>

                        {/* チーム1 */}
                        <button
                          onClick={() => !isBye && match.team1Id && match.team2Id && setEditingMatch(match)}
                          disabled={isBye || !match.team1Id || !match.team2Id}
                          className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-left ${
                            match.winnerId === match.team1Id ? 'bg-blue-50' : ''
                          } ${!isBye && isReady ? 'hover:bg-blue-50 active:bg-blue-100' : ''} disabled:cursor-default`}
                        >
                          {match.team1League && (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-black shrink-0">
                              {match.team1League}
                            </span>
                          )}
                          <span className={`flex-1 text-sm truncate ${
                            match.team1Name === 'BYE'
                              ? 'text-slate-300 italic'
                              : match.winnerId === match.team1Id
                              ? 'font-black text-blue-700'
                              : 'text-slate-700'
                          }`}>
                            {match.team1Name || '---'}
                          </span>
                          {isFinished && !isBye && (
                            <span className={`text-sm font-black tabular-nums ${
                              match.winnerId === match.team1Id ? 'text-blue-600' : 'text-slate-300'
                            }`}>
                              {match.winsTeam1}
                            </span>
                          )}
                        </button>

                        {/* スコア詳細 */}
                        {isFinished && !isBye && match.subMatches.length > 0 && (
                          <div className="px-2 py-1 bg-slate-50/50 border-y border-slate-100">
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] justify-center">
                              {match.subMatches.map(sm => (
                                <span key={sm.type} className="font-mono">
                                  <span className="text-slate-400 font-bold">{MATCH_TYPE_SHORT[sm.type]}</span>
                                  <span className={`ml-0.5 font-black ${
                                    sm.winnerId === match.team1Id ? 'text-blue-600' :
                                    sm.winnerId === match.team2Id ? 'text-red-400' : 'text-slate-400'
                                  }`}>
                                    {sm.score1}-{sm.score2}
                                  </span>
                                  {sm.tiebreakScore !== null && <span className="text-slate-400">({sm.tiebreakScore})</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* チーム2 */}
                        <button
                          onClick={() => !isBye && match.team1Id && match.team2Id && setEditingMatch(match)}
                          disabled={isBye || !match.team1Id || !match.team2Id}
                          className={`w-full flex items-center gap-2 px-3 py-2 border-t border-slate-100 transition-colors text-left ${
                            match.winnerId === match.team2Id ? 'bg-blue-50' : ''
                          } ${!isBye && isReady ? 'hover:bg-blue-50 active:bg-blue-100' : ''} disabled:cursor-default`}
                        >
                          {match.team2League && (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-black shrink-0">
                              {match.team2League}
                            </span>
                          )}
                          <span className={`flex-1 text-sm truncate ${
                            match.team2Name === 'BYE'
                              ? 'text-slate-300 italic'
                              : match.winnerId === match.team2Id
                              ? 'font-black text-blue-700'
                              : 'text-slate-700'
                          }`}>
                            {match.team2Name || '---'}
                          </span>
                          {isFinished && !isBye && (
                            <span className={`text-sm font-black tabular-nums ${
                              match.winnerId === match.team2Id ? 'text-blue-600' : 'text-slate-300'
                            }`}>
                              {match.winsTeam2}
                            </span>
                          )}
                        </button>

                        {/* アクションバー */}
                        {!isBye && match.team1Id && match.team2Id && (isReady || (isFinished && match.winnerId && match.nextMatchId)) && (
                          <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50/80 border-t border-slate-100">
                            {isFinished && match.winnerId && match.nextMatchId && (
                              <button
                                onClick={e => { e.stopPropagation(); advanceWinner(match.matchId); }}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition-colors"
                              >
                                勝者進出
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            {isReady && !court && (
                              <button
                                onClick={e => { e.stopPropagation(); openCourtAssign(match); }}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <MapPin className="w-3 h-3" />
                                コート割当
                              </button>
                            )}
                            {isPlaying && court && (
                              <button
                                onClick={e => { e.stopPropagation(); openCourtAssign(match); }}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                              >
                                <MapPin className="w-3 h-3" />
                                コート変更
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 優勝チーム表示 */}
            {winnerTeam && (
              <div className="flex flex-col justify-center min-w-[220px]">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 p-5 text-white shadow-xl">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute -top-5 -right-5 w-24 h-24 rounded-full bg-white blur-2xl" />
                    <div className="absolute -bottom-5 -left-5 w-24 h-24 rounded-full bg-white blur-2xl" />
                  </div>
                  <div className="relative text-center">
                    <Trophy className="w-10 h-10 mx-auto mb-2 drop-shadow-lg" />
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-90">優勝</div>
                    <div className="text-lg font-black tracking-tight mt-1">
                      {winnerTeam.teamName}
                    </div>
                    {winnerTeam.leagueId && (
                      <div className="inline-flex items-center gap-0.5 mt-2 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold">
                        <Users className="w-2.5 h-2.5" />
                        {winnerTeam.leagueId}リーグ
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </>)}

      {/* コート割当ダイアログ（複数選択可） */}
      {courtAssignMatch && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setCourtAssignMatch(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <h3 className="font-black">コート割当（複数選択可）</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  {courtAssignMatch.team1League && <span className="w-4 h-4 rounded bg-slate-200 text-[8px] font-bold text-slate-600 flex items-center justify-center">{courtAssignMatch.team1League}</span>}
                  <span className="font-bold truncate">{courtAssignMatch.team1Name}</span>
                </div>
                <div className="text-slate-400 text-[9px] my-0.5">vs</div>
                <div className="flex items-center gap-2">
                  {courtAssignMatch.team2League && <span className="w-4 h-4 rounded bg-slate-200 text-[8px] font-bold text-slate-600 flex items-center justify-center">{courtAssignMatch.team2League}</span>}
                  <span className="font-bold truncate">{courtAssignMatch.team2Name}</span>
                </div>
              </div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                コートを選択 <span className="text-slate-400 font-normal">（複数選択可・使用中は選択不可）</span>
              </label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: 16 }, (_, i) => `${i + 1}コート`).map(c => {
                  const inLeagueProgress = (() => {
                    for (const l of leagues) {
                      const lm = useTeamStore.getState().leagueMatches.filter(m => m.leagueId === l.leagueId);
                      if (lm.length > 0 && lm.some(m => m.status !== 'finished')) {
                        const nums = (l.courtName || '').match(/\d+/g);
                        if (nums && nums.includes(c.replace('コート', ''))) return true;
                      }
                    }
                    return false;
                  })();
                  // 既に他のマッチで使用中
                  const usedByOther = Array.from(usedCourtNames).some(uc => uc === c) &&
                    !(bracketCourtAssignments[courtAssignMatch.matchId]?.courtNames.includes(c));
                  const isUsed = inLeagueProgress || usedByOther;
                  const isSelected = courtAssignSelected.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (isUsed) return;
                        setCourtAssignSelected(prev =>
                          prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                        );
                      }}
                      disabled={isUsed}
                      className={`py-2 text-xs font-bold rounded-lg border-2 transition-all
                        ${isUsed ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' :
                          isSelected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                          'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {c.replace('コート', '')}
                      {isUsed && <span className="block text-[7px] text-slate-300">使用中</span>}
                    </button>
                  );
                })}
              </div>
              {courtAssignSelected.length > 0 && (
                <div className="mb-3 text-[10px] text-slate-500 text-center">
                  選択中: <span className="font-bold text-emerald-600">{courtAssignSelected.sort((a, b) => parseInt(a) - parseInt(b)).join('・')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCourtAssignMatch(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={confirmCourtAssign}
                  disabled={courtAssignSelected.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* スコア入力ダイアログ */}
      {editingMatch && (
        <TeamScoreInput
          matchId={editingMatch.matchId}
          team1Id={editingMatch.team1Id || ''}
          team2Id={editingMatch.team2Id || ''}
          team1Name={editingMatch.team1Name}
          team2Name={editingMatch.team2Name}
          subMatches={editingMatch.subMatches}
          onClose={() => setEditingMatch(null)}
          isBracket
        />
      )}
    </div>
  );
}

/** 控えリスト — 全ブラケットの対戦待ち試合を1回戦優先で表示 */
function TeamWaitingList({
  waitingMatches,
  onAssignCourt,
  bracketCourtAssignments,
}: {
  waitingMatches: { match: TeamBracketMatch; bracket: TeamPlacementBracket; roundLabel: string }[];
  onAssignCourt: (match: TeamBracketMatch) => void;
  bracketCourtAssignments: Record<string, { courtNames: string[]; startedAt: number }>;
}) {
  if (waitingMatches.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">対戦控えはありません</p>
        <p className="text-[11px] mt-1">両チームが確定した試合がここに表示されます</p>
      </div>
    );
  }

  const catLabel = (cat: PlacementCategory) =>
    cat === '1st' ? '1位' : cat === '2nd' ? '2位' : cat === '3rd' ? '3位' : '4・5位';

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500 mb-1">
        {waitingMatches.length}試合が控えています（1回戦優先で自動並べ替え）
      </div>
      {waitingMatches.map(({ match, bracket, roundLabel }) => {
        const cfg = CATEGORY_CONFIG[bracket.category];
        const ca = bracketCourtAssignments[match.matchId];
        return (
          <div key={match.matchId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-stretch">
              <div className={`shrink-0 w-14 flex flex-col items-center justify-center border-r border-slate-100 ${cfg.bg}`}>
                <div className={`text-[10px] font-bold ${cfg.text}`}>{catLabel(bracket.category)}</div>
                <div className="text-[8px] text-slate-400 mt-0.5">{roundLabel}</div>
              </div>
              <div className="flex-1 min-w-0 py-2 px-3">
                <div className="flex items-center gap-1.5">
                  {match.team1League && (
                    <span className="w-5 h-5 rounded bg-slate-100 text-[9px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                      {match.team1League}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-800 truncate">{match.team1Name}</span>
                </div>
                <div className="text-[9px] text-slate-300 font-bold my-0.5 pl-6">VS</div>
                <div className="flex items-center gap-1.5">
                  {match.team2League && (
                    <span className="w-5 h-5 rounded bg-slate-100 text-[9px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                      {match.team2League}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-800 truncate">{match.team2Name}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center pr-3 gap-1.5">
                {ca && ca.courtNames.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-blue-600">
                    <MapPin className="w-2.5 h-2.5" />
                    {ca.courtNames.join('・')}
                  </span>
                )}
                <button
                  onClick={() => onAssignCourt(match)}
                  className="px-3 py-2 text-[10px] font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  {ca && ca.courtNames.length > 0 ? 'コート変更' : 'コート入れ'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 1位トーナメント抽選パネル（ルーレット＋手動配置） */
function TeamRouletteDrawPanel({ bracket, onRebuild }: {
  bracket: TeamPlacementBracket;
  onRebuild: (category: PlacementCategory, slots: (string | null)[], byePositions?: Set<number>) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teams = bracket.teams;
  const DRAW_SIZE = 8;

  // チーム数に応じてBYE位置を決定（5チームなら3 BYE等）
  const BYE_POSITIONS = useMemo(() => {
    const byeCount = Math.max(0, DRAW_SIZE - teams.length);
    // 5チーム→[1,5,7]、4チーム→[1,3,5,7]、6チーム→[1,5]、7チーム→[1]、8チーム→[]
    const presets: Record<number, number[]> = {
      0: [],
      1: [1],
      2: [1, 5],
      3: [1, 5, 7],
      4: [1, 3, 5, 7],
    };
    return new Set(presets[byeCount] ?? []);
  }, [teams.length]);

  const teamSlots = useMemo(() =>
    Array.from({ length: DRAW_SIZE }, (_, i) => i).filter(i => !BYE_POSITIONS.has(i)),
  [BYE_POSITIONS]);

  const assignedTeamIds = useMemo(() => new Set(assignedSlots.values()), [assignedSlots]);
  const availableSlots = useMemo(() => teamSlots.filter(i => !assignedSlots.has(i)), [teamSlots, assignedSlots]);
  const unassignedTeams = useMemo(() => teams.filter(t => !assignedTeamIds.has(t.teamId)), [teams, assignedTeamIds]);
  const activeTeam = selectedTeamId ? teams.find(t => t.teamId === selectedTeamId) : unassignedTeams[0];

  const syncToBracket = useCallback((slotsMap: Map<number, string>) => {
    const slots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    slotsMap.forEach((teamId, slot) => { slots[slot] = teamId; });
    onRebuild(bracket.category, slots, BYE_POSITIONS);
  }, [bracket.category, onRebuild, BYE_POSITIONS]);

  const spinRoulette = useCallback(() => {
    if (!activeTeam || availableSlots.length === 0) return;
    setSpinning(true);
    let count = 0;
    const totalSpins = 12 + Math.floor(Math.random() * 8);
    const spin = () => {
      setCurrentHighlight(availableSlots[Math.floor(Math.random() * availableSlots.length)]);
      count++;
      if (count < totalSpins) {
        spinTimerRef.current = setTimeout(spin, 50 + count * 18);
      } else {
        const finalSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
        setCurrentHighlight(finalSlot);
        const newSlots = new Map(assignedSlots);
        newSlots.set(finalSlot, activeTeam.teamId);
        setAssignedSlots(newSlots);
        setSpinning(false);
        setSelectedTeamId(null);
        syncToBracket(newSlots);
      }
    };
    spin();
  }, [activeTeam, availableSlots, assignedSlots, syncToBracket]);

  const manualAssign = (slotIdx: number) => {
    if (!activeTeam || assignedSlots.has(slotIdx) || BYE_POSITIONS.has(slotIdx)) return;
    const newSlots = new Map(assignedSlots);
    newSlots.set(slotIdx, activeTeam.teamId);
    setAssignedSlots(newSlots);
    setSelectedTeamId(null);
    syncToBracket(newSlots);
  };

  const autoDrawAll = useCallback(() => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const slots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    let ti = 0;
    for (let i = 0; i < DRAW_SIZE; i++) {
      if (BYE_POSITIONS.has(i)) continue;
      if (ti < shuffled.length) { slots[i] = shuffled[ti].teamId; ti++; }
    }
    onRebuild(bracket.category, slots, BYE_POSITIONS);
    setDrawComplete(true);
  }, [teams, bracket.category, onRebuild, BYE_POSITIONS]);

  const confirmDraw = useCallback(() => {
    syncToBracket(assignedSlots);
    setDrawComplete(true);
  }, [assignedSlots, syncToBracket]);

  const resetDraw = () => {
    setAssignedSlots(new Map());
    setSelectedTeamId(null);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    const emptySlots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    onRebuild(bracket.category, emptySlots, BYE_POSITIONS);
  };

  useEffect(() => () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-yellow-200 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-2.5 border-b border-yellow-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
          <Shuffle size={14} className="text-yellow-600" />
          1位トーナメント 抽選
        </h3>
        <button onClick={resetDraw} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <RotateCcw size={12} />リセット
        </button>
      </div>

      <div className="p-3">
        {!drawComplete ? (
          <>
            {/* チーム選択 */}
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 mb-1.5">チームを選択してスロットに配置</div>
              <div className="flex flex-wrap gap-1">
                {teams.map(t => {
                  const isAssigned = assignedTeamIds.has(t.teamId);
                  const isSelected = activeTeam?.teamId === t.teamId;
                  return (
                    <button
                      key={t.teamId}
                      onClick={() => !isAssigned && setSelectedTeamId(t.teamId)}
                      disabled={isAssigned || spinning}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                        isAssigned ? 'bg-emerald-50 border-emerald-200 text-emerald-500 line-through opacity-60' :
                        isSelected ? 'bg-yellow-100 border-yellow-400 text-yellow-800 ring-1 ring-yellow-300' :
                        'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {t.leagueId} {t.teamName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ルーレットボタン */}
            {activeTeam && !spinning && (
              <div className="mb-3 flex items-center gap-2 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                <span className="text-[10px] text-yellow-700 flex-1 truncate">
                  <span className="font-bold">{activeTeam.leagueId}</span> {activeTeam.teamName}
                </span>
                <button
                  onClick={spinRoulette}
                  className="px-3 py-1 rounded-lg text-[10px] font-bold bg-yellow-500 text-white hover:bg-yellow-600 shrink-0"
                >
                  🎲 ルーレット
                </button>
              </div>
            )}
            {spinning && (
              <div className="mb-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg text-center text-xs font-bold text-yellow-700 animate-pulse">
                抽選中...
              </div>
            )}

            {/* スロット表示（対戦ペアで2列表示） */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-3">
              {Array.from({ length: DRAW_SIZE / 2 }, (_, matchIdx) => {
                const s1 = matchIdx * 2;
                const s2 = matchIdx * 2 + 1;
                const isBye1 = BYE_POSITIONS.has(s1);
                const isBye2 = BYE_POSITIONS.has(s2);
                const a1 = assignedSlots.get(s1);
                const a2 = assignedSlots.get(s2);
                const t1 = a1 ? teams.find(t => t.teamId === a1) : null;
                const t2 = a2 ? teams.find(t => t.teamId === a2) : null;
                const hl1 = currentHighlight === s1 && spinning;
                const hl2 = currentHighlight === s2 && spinning;
                const canPlace1 = !isBye1 && !assignedSlots.has(s1) && !!activeTeam && !spinning;
                const canPlace2 = !isBye2 && !assignedSlots.has(s2) && !!activeTeam && !spinning;

                const renderSlot = (si: number, isBye: boolean, team: typeof t1, hl: boolean, canPlace: boolean) => (
                  <div
                    onClick={() => canPlace && manualAssign(si)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] transition-all ${
                      isBye ? 'bg-slate-100 text-slate-400' :
                      hl ? 'bg-yellow-200' :
                      team ? 'bg-emerald-50' :
                      canPlace ? 'bg-yellow-50 cursor-pointer hover:bg-yellow-100' : 'bg-white'
                    }`}
                  >
                    <span className="text-slate-400 font-bold w-4 text-center shrink-0">{si + 1}</span>
                    {isBye ? (
                      <span className="text-slate-300 italic">BYE</span>
                    ) : team ? (
                      <span className="font-bold text-slate-800 truncate">
                        <span className="text-slate-400">{team.leagueId}</span> {team.teamName}
                      </span>
                    ) : canPlace ? (
                      <span className="text-yellow-500">← タップ</span>
                    ) : (
                      <span className="text-slate-300">―</span>
                    )}
                  </div>
                );

                return (
                  <div key={matchIdx} className="rounded border border-slate-200 overflow-hidden">
                    {renderSlot(s1, isBye1, t1, hl1, canPlace1)}
                    <div className="border-t border-slate-100" />
                    {renderSlot(s2, isBye2, t2, hl2, canPlace2)}
                  </div>
                );
              })}
            </div>

            {/* ボタン群 */}
            <div className="flex gap-2">
              <button
                onClick={autoDrawAll}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600"
              >
                🎲 全自動抽選
              </button>
              {unassignedTeams.length === 0 && (
                <button
                  onClick={confirmDraw}
                  className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600"
                >
                  ✓ 確定
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-emerald-600 font-bold text-sm mb-2">抽選完了</div>
            <p className="text-xs text-slate-500">トーナメント表に反映されました</p>
          </div>
        )}
      </div>
    </div>
  );
}
