import { useState, useEffect, useCallback } from 'react';
import { X, Save, Trash2, AlertTriangle } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { LeagueMatchScore, MixedTeam } from './types';

interface Props {
  match: LeagueMatchScore;
  teams: MixedTeam[];
  onClose: () => void;
}

export default function MixedScoreInput({ match, teams, onClose }: Props) {
  const { updateLeagueScore, setLeagueMatchStatus } = useMixedStore();

  const team1 = teams.find(t => t.teamId === match.team1Id);
  const team2 = teams.find(t => t.teamId === match.team2Id);

  const [score1, setScore1] = useState<string>(match.score1?.toString() ?? '');
  const [score2, setScore2] = useState<string>(match.score2?.toString() ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    setScore1(match.score1?.toString() ?? '');
    setScore2(match.score2?.toString() ?? '');
    setError('');
  }, [match]);

  const validate = useCallback((): boolean => {
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);

    if (isNaN(s1) || isNaN(s2)) {
      setError('スコアを入力してください');
      return false;
    }
    if (s1 < 0 || s2 < 0) {
      setError('スコアは0以上で入力してください');
      return false;
    }
    if (s1 === s2) {
      setError('同点は不可です（タイブレーク結果を入力）');
      return false;
    }
    // 6ゲームマッチ: 6-X, X-6, or 7-6/6-7 (tiebreak)
    if (s1 > 7 || s2 > 7) {
      setError('スコアは0〜7の範囲で入力してください');
      return false;
    }
    if (s1 === 7 && s2 !== 6 && s2 !== 5) {
      // 7 is only valid as 7-6 or 7-5
    }
    if (s2 === 7 && s1 !== 6 && s1 !== 5) {
      // same
    }
    setError('');
    return true;
  }, [score1, score2]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    updateLeagueScore(match.matchId, s1, s2);
    onClose();
  }, [score1, score2, match.matchId, updateLeagueScore, onClose, validate]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !e.shiftKey) handleSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, onClose]);

  const handleClear = useCallback(() => {
    // Reset to waiting state
    setLeagueMatchStatus(match.matchId, 'waiting');
    // Reset scores by setting to a special clear state
    updateLeagueScore(match.matchId, -1, -1); // Will be handled as reset
    onClose();
  }, [match.matchId, setLeagueMatchStatus, updateLeagueScore, onClose]);

  // Quick score buttons
  const quickScores = [
    ['6-0', '6-1', '6-2', '6-3', '6-4'],
    ['0-6', '1-6', '2-6', '3-6', '4-6'],
    ['7-5', '5-7', '7-6', '6-7'],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">スコア入力</h3>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="text-sm text-emerald-200 mt-1">
            第{match.matchNumber}試合 ・ {match.leagueId.trim()}リーグ
          </div>
        </div>

        <div className="p-6">
          {/* 対戦カード */}
          <div className="flex items-center gap-4 mb-6">
            {/* Team 1 */}
            <div className="flex-1 text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <div className="text-xs text-blue-500 mb-1">チーム{team1?.numberInLeague}</div>
              <div className="font-bold text-gray-800">{team1?.male.name}</div>
              <div className="text-sm text-gray-600">{team1?.female.name}</div>
              <div className="text-xs text-gray-400 mt-1">{team1?.male.affiliation}</div>
            </div>

            <div className="text-2xl font-bold text-gray-300">VS</div>

            {/* Team 2 */}
            <div className="flex-1 text-center p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-xl">
              <div className="text-xs text-red-500 mb-1">チーム{team2?.numberInLeague}</div>
              <div className="font-bold text-gray-800">{team2?.male.name}</div>
              <div className="text-sm text-gray-600">{team2?.female.name}</div>
              <div className="text-xs text-gray-400 mt-1">{team2?.male.affiliation}</div>
            </div>
          </div>

          {/* スコア入力 */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <input
              type="number"
              min={0}
              max={7}
              value={score1}
              onChange={e => setScore1(e.target.value)}
              className="w-20 h-16 text-center text-3xl font-bold border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0"
              autoFocus
            />
            <span className="text-3xl font-bold text-gray-400">-</span>
            <input
              type="number"
              min={0}
              max={7}
              value={score2}
              onChange={e => setScore2(e.target.value)}
              className="w-20 h-16 text-center text-3xl font-bold border-2 border-red-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="0"
            />
          </div>

          {/* クイックスコアボタン */}
          <div className="space-y-2 mb-4">
            {quickScores.map((row, ri) => (
              <div key={ri} className="flex justify-center gap-2">
                {row.map(qs => {
                  const [q1, q2] = qs.split('-');
                  return (
                    <button
                      key={qs}
                      onClick={() => { setScore1(q1); setScore2(q2); setError(''); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-all border
                        ${score1 === q1 && score2 === q2
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }
                      `}
                    >
                      {qs}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* エラー */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 px-3 py-2 rounded-lg">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* アクション */}
          <div className="flex gap-3">
            {match.status === 'finished' && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                <Trash2 size={14} />
                クリア
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md text-sm font-medium"
            >
              <Save size={14} />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
