import { useState, useMemo } from 'react';
import { Trophy, ChevronRight, MapPin, Play, Check, Circle } from 'lucide-react';
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

const CATEGORY_COLORS: Record<PlacementCategory, string> = {
  '1st': 'from-yellow-500 to-amber-600',
  '2nd': 'from-gray-400 to-gray-600',
  '3rd': 'from-orange-400 to-orange-600',
  '4th': 'from-blue-400 to-blue-600',
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
      <div className="text-center text-gray-400 py-12">
        <Trophy size={48} className="mx-auto mb-4 opacity-30" />
        <p>決勝トーナメントが生成されていません</p>
        <p className="text-sm mt-2">予選リーグ順位表から生成してください</p>
      </div>
    );
  }

  const totalRounds = Math.log2(currentBracket.drawSize);

  const getRoundName = (round: number) => {
    if (round === totalRounds) return '決勝';
    if (round === totalRounds - 1) return '準決勝';
    return `${round}回戦`;
  };

  // ラウンドごとに試合をグループ化
  const roundMatches = Array.from({ length: totalRounds }, (_, i) =>
    currentBracket.matches.filter(m => m.round === i + 1)
  );

  return (
    <div className="space-y-4">
      {/* カテゴリタブ */}
      <div className="flex gap-2 flex-wrap">
        {brackets.map(b => {
          const isSelected = b.category === selectedBracketCategory;
          const color = CATEGORY_COLORS[b.category];
          const finishedCount = b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length;
          return (
            <button
              key={b.category}
              onClick={() => setSelectedBracketCategory(b.category)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                isSelected
                  ? `bg-gradient-to-r ${color} text-white shadow-md`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[b.category]}
              <span className="ml-1 text-xs opacity-80">
                {finishedCount}/{b.matches.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ブラケット表示 */}
      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-fit pb-4">
          {roundMatches.map((matches, ri) => (
            <div key={ri} className="flex flex-col gap-4 min-w-[260px]">
              {/* ラウンドヘッダー */}
              <div className={`text-center font-bold text-sm px-3 py-1.5 rounded-lg ${
                ri + 1 === totalRounds
                  ? 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {getRoundName(ri + 1)}
              </div>

              {/* 試合カード */}
              <div className="flex flex-col justify-around flex-1 gap-4">
                {matches.map(match => {
                  const court = bracketCourtAssignments[match.matchId];
                  const isFinished = match.status === 'finished';
                  const isBye = match.status === 'bye';
                  const isPlaying = match.status === 'playing';
                  const isReady = match.status === 'ready';

                  return (
                    <div
                      key={match.matchId}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        isFinished ? 'border-green-200 bg-green-50/30' :
                        isBye ? 'border-gray-200 bg-gray-50 opacity-60' :
                        isPlaying ? 'border-blue-300 bg-blue-50/30 ring-2 ring-blue-200' :
                        isReady ? 'border-blue-200 hover:border-blue-400' :
                        'border-gray-200'
                      }`}
                    >
                      {/* コート・ステータスバー */}
                      <div className="flex items-center justify-between px-2 py-0.5 bg-gray-50 text-[10px] text-gray-500">
                        <span>
                          {court && (
                            <span className="text-blue-600">
                              <MapPin size={10} className="inline mr-0.5" />
                              {court.courtName}
                            </span>
                          )}
                        </span>
                        <span>
                          {isFinished && <Check size={12} className="text-green-500 inline" />}
                          {isPlaying && <Play size={12} className="text-blue-500 inline" />}
                          {isBye && <span className="text-gray-400">BYE</span>}
                        </span>
                      </div>

                      {/* チーム1 */}
                      <div
                        className={`flex items-center px-3 py-1.5 cursor-pointer ${
                          match.winnerId === match.team1Id ? 'bg-blue-50 font-bold' : ''
                        } ${!isBye && isReady ? 'hover:bg-blue-50' : ''}`}
                        onClick={() => !isBye && match.team1Id && match.team2Id && setEditingMatch(match)}
                      >
                        <span className="text-[10px] text-gray-400 mr-1 w-4">
                          {match.team1League}
                        </span>
                        <span className={`flex-1 text-sm truncate ${
                          match.team1Name === 'BYE' ? 'text-gray-300 italic' : ''
                        }`}>
                          {match.team1Name || '---'}
                        </span>
                        {isFinished && !isBye && (
                          <span className={`text-xs font-bold ml-2 ${
                            match.winnerId === match.team1Id ? 'text-blue-600' : 'text-red-400'
                          }`}>
                            {match.winsTeam1}
                          </span>
                        )}
                      </div>

                      {/* スコア表示 */}
                      {isFinished && !isBye && (
                        <div className="px-3 py-0.5 bg-gray-50 border-y border-gray-100">
                          <div className="flex gap-2 text-[10px] text-gray-500 justify-center">
                            {match.subMatches.map(sm => (
                              <span key={sm.type} className={`${
                                sm.winnerId === match.team1Id ? 'text-blue-600' :
                                sm.winnerId === match.team2Id ? 'text-red-400' : ''
                              }`}>
                                {MATCH_TYPE_SHORT[sm.type]}:{sm.score1}-{sm.score2}
                                {sm.tiebreakScore !== null && `(${sm.tiebreakScore})`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* チーム2 */}
                      <div
                        className={`flex items-center px-3 py-1.5 cursor-pointer border-t ${
                          match.winnerId === match.team2Id ? 'bg-blue-50 font-bold' : ''
                        } ${!isBye && isReady ? 'hover:bg-blue-50' : ''}`}
                        onClick={() => !isBye && match.team1Id && match.team2Id && setEditingMatch(match)}
                      >
                        <span className="text-[10px] text-gray-400 mr-1 w-4">
                          {match.team2League}
                        </span>
                        <span className={`flex-1 text-sm truncate ${
                          match.team2Name === 'BYE' ? 'text-gray-300 italic' : ''
                        }`}>
                          {match.team2Name || '---'}
                        </span>
                        {isFinished && !isBye && (
                          <span className={`text-xs font-bold ml-2 ${
                            match.winnerId === match.team2Id ? 'text-blue-600' : 'text-red-400'
                          }`}>
                            {match.winsTeam2}
                          </span>
                        )}
                      </div>

                      {/* アクションバー */}
                      {!isBye && match.team1Id && match.team2Id && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-t text-[10px]">
                          {isFinished && match.winnerId && match.nextMatchId && (
                            <button
                              onClick={() => advanceWinner(match.matchId)}
                              className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5"
                            >
                              勝者進出 <ChevronRight size={12} />
                            </button>
                          )}
                          {isReady && !court && (
                            <button
                              onClick={() => setCourtInput({ matchId: match.matchId, value: '' })}
                              className="text-gray-500 hover:text-blue-600 flex items-center gap-0.5"
                            >
                              <MapPin size={10} /> コート割当
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
          <div className="flex flex-col justify-center min-w-[200px]">
            {(() => {
              const final = currentBracket.matches.find(m => m.round === totalRounds);
              if (!final || !final.winnerId) return null;
              const winner = allTeams.find(t => t.teamId === final.winnerId);
              return (
                <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border-2 border-yellow-300">
                  <Trophy size={32} className="mx-auto text-yellow-500 mb-2" />
                  <div className="text-xs text-gray-500 mb-1">優勝</div>
                  <div className="text-lg font-bold text-gray-800">
                    {winner?.teamName || final.winnerId}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* コート割当ダイアログ */}
      {courtInput && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCourtInput(null)}>
          <div className="bg-white rounded-xl p-4 shadow-xl w-72" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3">コート割当</h3>
            <input
              type="text"
              value={courtInput.value}
              onChange={e => setCourtInput({ ...courtInput, value: e.target.value })}
              placeholder="コート番号"
              className="w-full border rounded-lg px-3 py-2 mb-3"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && courtInput.value.trim()) {
                  assignBracketMatchToCourt(courtInput.matchId, courtInput.value.trim());
                  setCourtInput(null);
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCourtInput(null)} className="px-3 py-1.5 text-sm text-gray-500">
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (courtInput.value.trim()) {
                    assignBracketMatchToCourt(courtInput.matchId, courtInput.value.trim());
                    setCourtInput(null);
                  }
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-bold"
              >
                割当
              </button>
            </div>
          </div>
        </div>
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
