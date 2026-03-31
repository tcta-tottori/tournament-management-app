import { useState } from 'react';
import { Check, Circle, Play, MapPin, Pencil } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { LeagueMatchScore } from './types';
import { calculateLeagueStandings } from './mixedLogic';
import MixedScoreInput from './MixedScoreInput';

export default function MixedLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId, updateCourtName } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<LeagueMatchScore | null>(null);
  const [editingCourt, setEditingCourt] = useState(false);
  const [courtNameInput, setCourtNameInput] = useState('');

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  if (!selectedLeague) return <div className="text-center text-gray-400 py-12">データがありません</div>;

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  // スコアマトリックス構築
  const scoreMatrix = new Map<string, LeagueMatchScore>();
  for (const m of leagueMatchList) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    // 逆方向も登録
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  const getMatchBetween = (team1Id: string, team2Id: string): LeagueMatchScore | undefined => {
    return scoreMatrix.get(`${team1Id}-${team2Id}`);
  };

  const getCellDisplay = (rowTeamId: string, colTeamId: string): { text: string; color: string; bg: string } => {
    if (rowTeamId === colTeamId) return { text: '―', color: 'text-gray-300', bg: 'bg-gray-100' };
    const match = getMatchBetween(rowTeamId, colTeamId);
    if (!match || match.status !== 'finished') return { text: '', color: 'text-gray-400', bg: 'bg-white hover:bg-emerald-50 cursor-pointer' };

    const isTeam1 = match.team1Id === rowTeamId;
    const myScore = isTeam1 ? match.score1 : match.score2;
    const oppScore = isTeam1 ? match.score2 : match.score1;
    const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);

    return {
      text: `${myScore}-${oppScore}`,
      color: won ? 'text-emerald-700 font-bold' : 'text-red-600',
      bg: won ? 'bg-emerald-50 cursor-pointer' : 'bg-red-50 cursor-pointer',
    };
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* 左サイドバー: リーグ一覧 */}
      <div className="w-48 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
        <div className="p-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700">リーグ一覧</h3>
        </div>
        <div className="p-2 space-y-1">
          {leagues.map(league => {
            const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
            const lFinished = lMatches.filter(m => m.status === 'finished').length;
            const lTotal = lMatches.length;
            const isComplete = lFinished === lTotal && lTotal > 0;
            const isActive = league.leagueId === selectedLeague.leagueId;

            return (
              <button
                key={league.leagueId}
                onClick={() => setSelectedLeagueId(league.leagueId)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all
                  ${isActive
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'hover:bg-gray-100 text-gray-700'
                  }
                `}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${isActive ? 'bg-white/20' : isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}
                `}>
                  {isComplete ? <Check size={12} /> : league.leagueId.trim()}
                </div>
                <span className="flex-1 text-left font-medium">{league.leagueId.trim()}リーグ</span>
                <span className={`text-xs ${isActive ? 'text-emerald-200' : 'text-gray-400'}`}>
                  {lFinished}/{lTotal}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* リーグヘッダー */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                  {selectedLeague.leagueId.trim()}
                </span>
                {selectedLeague.leagueId.trim()}リーグ
                {editingCourt ? (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={courtNameInput}
                      onChange={e => setCourtNameInput(e.target.value)}
                      onBlur={() => {
                        updateCourtName(selectedLeague.leagueId, courtNameInput);
                        setEditingCourt(false);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          updateCourtName(selectedLeague.leagueId, courtNameInput);
                          setEditingCourt(false);
                        }
                        if (e.key === 'Escape') setEditingCourt(false);
                      }}
                      className="px-2 py-0.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32"
                      autoFocus
                    />
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditingCourt(true); setCourtNameInput(selectedLeague.courtName); }}
                    className="ml-2 inline-flex items-center gap-1 text-sm text-gray-400 font-normal hover:text-emerald-600 transition-colors"
                    title="コート名を編集"
                  >
                    <MapPin size={14} />
                    {selectedLeague.courtName || '(未設定)'}
                    <Pencil size={10} className="opacity-0 group-hover:opacity-100" />
                  </button>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">
                {finishedCount}/{totalCount} 試合完了
              </div>
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                  style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 対戦結果マトリックス */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="px-3 py-2 text-left text-xs text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500 min-w-[180px]">ペア名</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500 min-w-[100px]">所属</th>
                {selectedLeague.teams.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center text-xs text-gray-500 w-20">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {i + 1}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs text-gray-500 w-16">勝敗</th>
                <th className="px-3 py-2 text-center text-xs text-gray-500 w-12">順位</th>
              </tr>
            </thead>
            <tbody>
              {selectedLeague.teams.map((team, rowIdx) => {
                const standing = standings.find(s => s.teamId === team.teamId);
                return (
                  <tr key={team.teamId} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        {rowIdx + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-800">{team.male.name}</div>
                      <div className="text-sm text-gray-500">{team.female.name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs text-gray-500">{team.male.affiliation}</div>
                      <div className="text-xs text-gray-400">{team.female.affiliation}</div>
                    </td>
                    {selectedLeague.teams.map((colTeam, colIdx) => {
                      const cell = getCellDisplay(team.teamId, colTeam.teamId);
                      return (
                        <td
                          key={colIdx}
                          className={`px-2 py-2 text-center text-sm ${cell.color} ${cell.bg} border-l border-gray-100 transition-colors`}
                          onClick={() => {
                            if (team.teamId === colTeam.teamId) return;
                            // 正方向のmatchを探す
                            const forwardMatch = leagueMatchList.find(m =>
                              (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
                              (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
                            );
                            if (forwardMatch) setEditingMatch(forwardMatch);
                          }}
                        >
                          {cell.text || (team.teamId !== colTeam.teamId && (
                            <span className="text-gray-300 text-xs">未入力</span>
                          ))}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-sm font-semibold text-gray-700 border-l border-gray-200">
                      {standing ? `${standing.wins}-${standing.losses}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-center border-l border-gray-200">
                      {standing && standing.rank > 0 && (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold
                          ${standing.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                            standing.rank === 2 ? 'bg-gray-200 text-gray-600' :
                            standing.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}
                        `}>
                          {standing.rank}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 対戦順 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">対戦順</h3>
          <div className="flex flex-wrap gap-2">
            {selectedLeague.matchOrder.map(mo => {
              const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
              const isFinished = match?.status === 'finished';
              const isPlaying = match?.status === 'playing';
              return (
                <button
                  key={mo.matchNumber}
                  onClick={() => match && setEditingMatch(match)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border
                    ${isFinished
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isPlaying
                        ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className="font-mono text-xs">第{mo.matchNumber}試合</span>
                  <span className="font-bold">
                    {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-{String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                  </span>
                  {isFinished && match && (
                    <span className="text-xs ml-1">({match.score1}-{match.score2})</span>
                  )}
                  {isFinished ? <Check size={14} /> : isPlaying ? <Play size={14} /> : <Circle size={14} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 順位表 */}
        {standings.length > 0 && finishedCount > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">暫定順位</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-2 text-center w-10">順位</th>
                  <th className="py-2 px-2 text-left">ペア名</th>
                  <th className="py-2 px-2 text-center w-16">勝敗</th>
                  <th className="py-2 px-2 text-center w-16">取得G</th>
                  <th className="py-2 px-2 text-center w-16">失G</th>
                  <th className="py-2 px-2 text-center w-20">ゲーム率</th>
                  <th className="py-2 px-2 text-left w-28">判定理由</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.teamId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                        ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-200 text-gray-600'}
                      `}>
                        {s.rank}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-800">{s.teamName}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-700">{s.wins}-{s.losses}</td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-600">{s.gamesWon}</td>
                    <td className="py-2 px-2 text-center font-mono text-red-500">{s.gamesLost}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-600">
                      {s.gamesLost === 0 ? (s.gamesWon > 0 ? '∞' : '-') : (s.gamesWon / s.gamesLost).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-400">
                      {s.tiebreakReason || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* スコア入力ダイアログ */}
      {editingMatch && (
        <MixedScoreInput
          match={editingMatch}
          teams={selectedLeague.teams}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </div>
  );
}
