import { useState } from 'react';
import { Trophy, Medal, Award, Users } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { PlacementCategory, BracketMatch, PlacementBracket } from './types';

const CATEGORY_TABS: { id: PlacementCategory; label: string; icon: React.ElementType; color: string }[] = [
  { id: '1st', label: '1位トーナメント', icon: Trophy, color: 'from-yellow-500 to-amber-600' },
  { id: '2nd', label: '2位トーナメント', icon: Medal, color: 'from-gray-400 to-gray-500' },
  { id: '3rd', label: '3位トーナメント', icon: Award, color: 'from-orange-400 to-orange-500' },
  { id: '4th', label: '4位・5位トーナメント', icon: Users, color: 'from-slate-400 to-slate-500' },
];

export default function MixedBracketView() {
  const { brackets, selectedBracketCategory, setSelectedBracketCategory, updateBracketScore, advanceWinner } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');

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
    setScore1Input(match.score1?.toString() ?? '');
    setScore2Input(match.score2?.toString() ?? '');
  };

  const saveScore = () => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2) || s1 === s2) return;
    updateBracketScore(editingMatch.matchId, s1, s2);
    // Advance winner
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
    setEditingMatch(null);
  };

  return (
    <div className="space-y-4">
      {/* カテゴリタブ */}
      <div className="flex gap-2">
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
                flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              <Icon size={16} />
              {tab.label}
              {bracket && (
                <span className={`text-xs ml-1 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  ({finished}/{total})
                </span>
              )}
            </button>
          );
        })}
      </div>

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
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">スコア入力</h3>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 text-center">
                <div className="font-medium text-sm">{editingMatch.team1Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team1League}</div>
              </div>
              <span className="text-gray-300 font-bold">VS</span>
              <div className="flex-1 text-center">
                <div className="font-medium text-sm">{editingMatch.team2Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team2League}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mb-6">
              <input
                type="number"
                min={0}
                max={7}
                value={score1Input}
                onChange={e => setScore1Input(e.target.value)}
                className="w-16 h-14 text-center text-2xl font-bold border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <span className="text-2xl font-bold text-gray-300">-</span>
              <input
                type="number"
                min={0}
                max={7}
                value={score2Input}
                onChange={e => setScore2Input(e.target.value)}
                className="w-16 h-14 text-center text-2xl font-bold border-2 border-red-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                onKeyDown={e => { if (e.key === 'Enter') saveScore(); }}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditingMatch(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm">
                キャンセル
              </button>
              <button onClick={saveScore} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
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
  const MATCH_WIDTH = 200;
  const ROUND_GAP = 40;
  const MATCH_GAP = 8;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
      <div className="flex gap-0" style={{ minWidth: (MATCH_WIDTH + ROUND_GAP) * totalRounds }}>
        {matchesByRound.map((roundMatches, roundIdx) => {
          const round = roundIdx + 1;
          const spacing = Math.pow(2, roundIdx);

          return (
            <div key={round} className="flex-shrink-0" style={{ width: MATCH_WIDTH + ROUND_GAP }}>
              {/* ラウンドラベル */}
              <div className="text-center mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold
                  ${round === totalRounds ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white' :
                    round === totalRounds - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {getRoundLabel(round, totalRounds)}
                </span>
              </div>

              {/* 試合カード */}
              <div className="space-y-0">
                {roundMatches.map((match, matchIdx) => {
                  const topPadding = roundIdx === 0 ? 0 : (spacing - 1) * (MATCH_HEIGHT + MATCH_GAP) / 2;
                  const bottomPadding = (spacing - 1) * (MATCH_HEIGHT + MATCH_GAP);

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
                        {/* Team 1 */}
                        <div className={`flex items-center px-2 h-[34px] text-xs border-b border-gray-100
                          ${match.winnerId === match.team1Id ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                        `}>
                          <span className="text-[10px] text-gray-400 w-5 flex-shrink-0">{match.team1League}</span>
                          <span className="flex-1 truncate">{match.team1Name || (match.team1Id ? '' : '―')}</span>
                          {match.score1 !== null && (
                            <span className={`font-mono font-bold ml-1 ${match.winnerId === match.team1Id ? 'text-emerald-600' : 'text-gray-500'}`}>
                              {match.score1}
                            </span>
                          )}
                        </div>
                        {/* Team 2 */}
                        <div className={`flex items-center px-2 h-[34px] text-xs
                          ${match.winnerId === match.team2Id ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                        `}>
                          <span className="text-[10px] text-gray-400 w-5 flex-shrink-0">{match.team2League}</span>
                          <span className="flex-1 truncate">{match.team2Name || (match.team2Id ? '' : '―')}</span>
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
