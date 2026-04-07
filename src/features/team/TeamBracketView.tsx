import { useState } from 'react';
import { Trophy, ChevronRight, MapPin, Play, Check, Medal, Award, Users, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTeamStore } from './teamStore';
import type { TeamBracketMatch, PlacementCategory } from './types';
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
    allTeams,
  } = useTeamStore();

  const [editingMatch, setEditingMatch] = useState<TeamBracketMatch | null>(null);
  const [courtInput, setCourtInput] = useState<{ matchId: string; value: string } | null>(null);

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

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
                              <span className="flex items-center gap-0.5 text-blue-600 font-bold">
                                <MapPin className="w-2.5 h-2.5" />
                                {court.courtName}
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
                                onClick={e => { e.stopPropagation(); setCourtInput({ matchId: match.matchId, value: '' }); }}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <MapPin className="w-3 h-3" />
                                コート割当
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

      {/* コート割当ダイアログ */}
      {courtInput && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setCourtInput(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <h3 className="font-black">コート割当</h3>
              </div>
            </div>
            <div className="p-5">
              <input
                type="text"
                value={courtInput.value}
                onChange={e => setCourtInput({ ...courtInput, value: e.target.value })}
                placeholder="コート番号（例: 1コート）"
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 mb-4 text-sm focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && courtInput.value.trim()) {
                    assignBracketMatchToCourt(courtInput.matchId, courtInput.value.trim());
                    setCourtInput(null);
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setCourtInput(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    if (courtInput.value.trim()) {
                      assignBracketMatchToCourt(courtInput.matchId, courtInput.value.trim());
                      setCourtInput(null);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  割当
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
