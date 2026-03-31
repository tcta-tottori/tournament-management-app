import { useState } from 'react';
import { FileDown, Trophy, Medal, Award, Users, Printer, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import type { PlacementCategory, LeagueMatchScore } from './types';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4位・5位トーナメント',
};

/** タイブレークスコア表示 */
function formatScoreText(match: LeagueMatchScore, rowTeamId: string): string {
  const isTeam1 = match.team1Id === rowTeamId;
  const myScore = isTeam1 ? match.score1 : match.score2;
  const oppScore = isTeam1 ? match.score2 : match.score1;
  const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
  if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
    return won ? `${myScore}-${oppScore}(${match.tiebreakScore})` : `(${match.tiebreakScore})${myScore}-${oppScore}`;
  }
  return `${myScore}-${oppScore}`;
}

export default function MixedResultsExport() {
  const { leagues, leagueMatches, brackets, tournamentInfo, allTeams } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);
  const [activeTab, setActiveTab] = useState<'all' | 'league'>('all');
  const [selectedLeague, setSelectedLeague] = useState<string>(leagues[0]?.leagueId || '');

  // トーナメント結果取得
  const getBracketResults = (category: PlacementCategory) => {
    const bracket = brackets.find(b => b.category === category);
    if (!bracket) return null;

    const totalRounds = Math.log2(bracket.drawSize);
    const finalMatch = bracket.matches.find(m => m.round === totalRounds);
    const sfMatches = bracket.matches.filter(m => m.round === totalRounds - 1);

    const winner = finalMatch?.winnerId ? allTeams.find(t => t.teamId === finalMatch.winnerId) : null;
    const runnerUp = finalMatch ? allTeams.find(t => t.teamId === (finalMatch.winnerId === finalMatch.team1Id ? finalMatch.team2Id : finalMatch.team1Id)) : null;

    const sfLosers = sfMatches
      .filter(m => m.winnerId)
      .map(m => {
        const loserId = m.winnerId === m.team1Id ? m.team2Id : m.team1Id;
        return allTeams.find(t => t.teamId === loserId);
      })
      .filter(Boolean);

    return { winner, runnerUp, sfLosers, finalMatch, totalMatches: bracket.matches.length };
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // シート1: 予選リーグ結果
    const leagueData: (string | number)[][] = [];
    leagueData.push([tournamentInfo?.name || 'ミックスダブルス大会', '', '', '', '', '', '']);
    leagueData.push([tournamentInfo?.date || '', '', tournamentInfo?.venue || '']);
    leagueData.push([]);
    leagueData.push(['■予選リーグ結果']);
    leagueData.push([]);

    for (const league of leagues) {
      const standings = allStandings.get(league.leagueId) || [];
      leagueData.push([`${league.leagueId.trim()}リーグ`, `(${league.courtName})`]);
      leagueData.push(['順位', 'ペア名', '男子選手', '男子所属', '女子選手', '女子所属', '勝', '敗', '取得G', '失G']);

      for (const s of standings) {
        const team = allTeams.find(t => t.teamId === s.teamId);
        if (!team) continue;
        leagueData.push([
          s.rank, s.teamName,
          team.male.name, team.male.affiliation,
          team.female.name, team.female.affiliation,
          s.wins, s.losses, s.gamesWon, s.gamesLost,
        ]);
      }
      leagueData.push([]);

      const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
      for (const m of lMatches) {
        const t1 = allTeams.find(t => t.teamId === m.team1Id);
        const t2 = allTeams.find(t => t.teamId === m.team2Id);
        leagueData.push([
          `第${m.matchNumber}試合`,
          t1?.teamName || '', m.score1 ?? '', '-', m.score2 ?? '', t2?.teamName || '',
          m.winnerId ? (allTeams.find(t => t.teamId === m.winnerId)?.teamName || '') + ' 勝利' : '',
        ]);
      }
      leagueData.push([]);
    }

    const wsLeague = XLSX.utils.aoa_to_sheet(leagueData);
    XLSX.utils.book_append_sheet(wb, wsLeague, '予選リーグ結果');

    // 個別リーグシート
    for (const league of leagues) {
      const standings = allStandings.get(league.leagueId) || [];
      const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
      const data: (string | number)[][] = [];
      data.push([`${league.leagueId.trim()}リーグ`, `コート: ${league.courtName || '未設定'}`]);
      data.push([]);

      // ドロー表形式ヘッダー
      const header: (string | number)[] = ['#', 'ペア名', '所属'];
      for (let i = 0; i < league.teams.length; i++) header.push(`${i + 1}`);
      header.push('勝敗', '順位');
      data.push(header);

      for (const [rowIdx, team] of league.teams.entries()) {
        const standing = standings.find(s => s.teamId === team.teamId);
        const row: (string | number)[] = [
          rowIdx + 1,
          `${team.male.name}\n${team.female.name}`,
          `${team.male.affiliation}\n${team.female.affiliation}`,
        ];
        for (const colTeam of league.teams) {
          if (team.teamId === colTeam.teamId) { row.push('―'); continue; }
          const match = lMatches.find(m =>
            (m.team1Id === team.teamId && m.team2Id === colTeam.teamId) ||
            (m.team1Id === colTeam.teamId && m.team2Id === team.teamId)
          );
          if (match && match.status === 'finished') {
            row.push(formatScoreText(match, team.teamId));
          } else {
            row.push('');
          }
        }
        row.push(standing ? `${standing.wins}-${standing.losses}` : '-');
        row.push(standing?.rank || '-');
        data.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, `${league.leagueId.trim()}リーグ`);
    }

    // トーナメント結果シート
    const tourneyData: (string | number)[][] = [];
    tourneyData.push(['■順位別トーナメント結果']);
    tourneyData.push([]);

    for (const cat of ['1st', '2nd', '3rd', '4th'] as PlacementCategory[]) {
      const bracket = brackets.find(b => b.category === cat);
      if (!bracket) continue;

      tourneyData.push([CATEGORY_LABELS[cat]]);
      tourneyData.push(['試合', 'チーム1', 'スコア', '', 'チーム2', '勝者']);

      const totalRounds = Math.log2(bracket.drawSize);
      for (let r = 1; r <= totalRounds; r++) {
        const roundLabel = r === totalRounds ? '決勝' : r === totalRounds - 1 ? '準決勝' : `${r}回戦`;
        const roundMatches = bracket.matches.filter(m => m.round === r && !m.isBye);
        for (const m of roundMatches) {
          const winner = m.winnerId ? allTeams.find(t => t.teamId === m.winnerId)?.teamName || '' : '';
          tourneyData.push([
            roundLabel, m.team1Name, m.score1 ?? '', '-', m.score2 ?? '', m.team2Name, winner,
          ]);
        }
      }

      const results = getBracketResults(cat);
      if (results?.winner) {
        tourneyData.push([]);
        tourneyData.push(['優勝', results.winner.teamName, `${results.winner.male.name} / ${results.winner.female.name}`]);
        if (results.runnerUp) {
          tourneyData.push(['準優勝', results.runnerUp.teamName, `${results.runnerUp.male.name} / ${results.runnerUp.female.name}`]);
        }
      }
      tourneyData.push([]);
    }

    const wsTourney = XLSX.utils.aoa_to_sheet(tourneyData);
    XLSX.utils.book_append_sheet(wb, wsTourney, 'トーナメント結果');

    const fileName = `${tournamentInfo?.name || 'ミックス大会'}_結果.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* エクスポートヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">大会結果</h2>
            <p className="text-emerald-200 text-sm mt-1">{tournamentInfo?.name}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors"
            >
              <Printer size={16} />
              印刷
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition-colors shadow-md"
            >
              <FileDown size={16} />
              Excel出力
            </button>
          </div>
        </div>
      </div>

      {/* タブ切替 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          全体結果
        </button>
        <button
          onClick={() => setActiveTab('league')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'league' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          個別リーグ結果
        </button>
      </div>

      {activeTab === 'all' ? (
        <>
          {/* 予選リーグ結果サマリー */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-bold text-gray-800 mb-4">予選リーグ結果</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {leagues.map(league => {
                const standings = allStandings.get(league.leagueId) || [];
                return (
                  <div key={league.leagueId} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded text-white text-xs font-bold flex items-center justify-center">
                        {league.leagueId.trim()}
                      </span>
                      <span className="text-sm font-bold text-gray-700">{league.leagueId.trim()}リーグ</span>
                    </div>
                    {standings.map(s => (
                      <div key={s.teamId} className="flex items-center gap-1 text-xs py-0.5">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                          ${s.rank === 1 ? 'bg-yellow-400 text-white' : s.rank === 2 ? 'bg-gray-300 text-white' : 'bg-gray-100 text-gray-500'}
                        `}>{s.rank}</span>
                        <span className="truncate">{s.teamName}</span>
                        <span className="text-gray-400 ml-auto">{s.wins}W{s.losses}L</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* トーナメント結果 */}
          {brackets.length > 0 && (
            <div className="space-y-4">
              {(['1st', '2nd', '3rd', '4th'] as PlacementCategory[]).map(cat => {
                const results = getBracketResults(cat);
                if (!results) return null;

                const icons = { '1st': Trophy, '2nd': Medal, '3rd': Award, '4th': Users };
                const colors = { '1st': 'yellow', '2nd': 'gray', '3rd': 'orange', '4th': 'slate' };
                const Icon = icons[cat];
                const color = colors[cat];

                return (
                  <div key={cat} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Icon size={20} className={`text-${color}-500`} />
                      <h3 className="text-lg font-bold text-gray-800">{CATEGORY_LABELS[cat]}</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {results.winner && (
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4 border border-yellow-200">
                          <div className="text-xs text-yellow-600 font-medium mb-1">優勝</div>
                          <div className="font-bold text-gray-800">{results.winner.teamName}</div>
                          <div className="text-xs text-gray-500 mt-1">{results.winner.male.name} / {results.winner.female.name}</div>
                          <div className="text-xs text-gray-400">{results.winner.male.affiliation}</div>
                        </div>
                      )}
                      {results.runnerUp && (
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                          <div className="text-xs text-gray-500 font-medium mb-1">準優勝</div>
                          <div className="font-bold text-gray-800">{results.runnerUp.teamName}</div>
                          <div className="text-xs text-gray-500 mt-1">{results.runnerUp.male.name} / {results.runnerUp.female.name}</div>
                          <div className="text-xs text-gray-400">{results.runnerUp.male.affiliation}</div>
                        </div>
                      )}
                      {results.sfLosers.length > 0 && (
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                          <div className="text-xs text-orange-500 font-medium mb-1">3位</div>
                          {results.sfLosers.map((team, i) => team && (
                            <div key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-orange-200' : ''}>
                              <div className="font-bold text-gray-800">{team.teamName}</div>
                              <div className="text-xs text-gray-500">{team.male.name} / {team.female.name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* 個別リーグ結果 (ドロー表形式) */
        <div className="space-y-4">
          {/* リーグ選択 */}
          <div className="flex gap-2 overflow-x-auto">
            {leagues.map(l => (
              <button
                key={l.leagueId}
                onClick={() => setSelectedLeague(l.leagueId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedLeague === l.leagueId
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {l.leagueId.trim()}リーグ
              </button>
            ))}
          </div>

          {/* 選択リーグのドロー表形式結果 */}
          {(() => {
            const league = leagues.find(l => l.leagueId === selectedLeague);
            if (!league) return null;
            const standings = allStandings.get(league.leagueId) || [];
            const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
            const hasTiebreak = standings.some(s => s.tiebreakReason);
            const isComplete = lMatches.length > 0 && lMatches.every(m => m.status === 'finished');

            const scoreMatrix = new Map<string, LeagueMatchScore>();
            for (const m of lMatches) {
              scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
              scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
            }

            return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-sm font-bold rounded-lg flex items-center justify-center">
                      {league.leagueId.trim()}
                    </span>
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm">{league.leagueId.trim()}リーグ</h3>
                      <div className="text-xs text-gray-500">{league.courtName || '(コート未設定)'} ・ {league.teams.length}ペア</div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm" style={{ minWidth: league.teams.length >= 5 ? 700 : 580 }}>
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-1.5 text-left text-[10px] text-gray-500 w-6">#</th>
                        <th className="px-2 py-1.5 text-left text-[10px] text-gray-500 min-w-[120px]">ペア名</th>
                        <th className="px-2 py-1.5 text-left text-[10px] text-gray-500 min-w-[70px]">所属</th>
                        {league.teams.map((_, i) => (
                          <th key={i} className="px-1 py-1.5 text-center text-[10px] text-gray-500 w-16">
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">{i + 1}</span>
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-center text-[10px] text-gray-500 w-12">勝敗</th>
                        <th className="px-2 py-1.5 text-center text-[10px] text-gray-500 w-8">位</th>
                        {isComplete && hasTiebreak && (
                          <th className="px-2 py-1.5 text-center text-[10px] text-gray-500 w-24">判定</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {league.teams.map((team, rowIdx) => {
                        const standing = standings.find(s => s.teamId === team.teamId);
                        return (
                          <tr key={team.teamId} className="border-t border-gray-100">
                            <td className="px-2 py-1">
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">{rowIdx + 1}</span>
                            </td>
                            <td className="px-2 py-1">
                              <div className="text-[11px] font-medium text-gray-800 leading-tight">{team.male.name}</div>
                              <div className="text-[11px] font-medium text-gray-800 leading-tight">{team.female.name}</div>
                            </td>
                            <td className="px-2 py-1">
                              <div className="text-[10px] text-gray-500 leading-tight">{team.male.affiliation}</div>
                              <div className="text-[10px] text-gray-500 leading-tight">{team.female.affiliation}</div>
                            </td>
                            {league.teams.map((colTeam, colIdx) => {
                              if (team.teamId === colTeam.teamId) {
                                return <td key={colIdx} className="px-1 py-1 text-center text-gray-300 bg-gray-100 border-l border-gray-100">―</td>;
                              }
                              const match = scoreMatrix.get(`${team.teamId}-${colTeam.teamId}`);
                              if (!match || match.status !== 'finished') {
                                return <td key={colIdx} className="px-1 py-1 text-center text-gray-300 border-l border-gray-100 text-[9px]">-</td>;
                              }
                              const isTeam1 = match.team1Id === team.teamId;
                              const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
                              return (
                                <td key={colIdx} className={`px-1 py-1 text-center text-[10px] border-l border-gray-100 whitespace-nowrap ${won ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                  {formatScoreText(match, team.teamId)}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-center text-[10px] font-semibold text-gray-700 border-l border-gray-200">
                              {standing ? `${standing.wins}-${standing.losses}` : '-'}
                            </td>
                            <td className="px-2 py-1 text-center border-l border-gray-200">
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
                            {isComplete && hasTiebreak && (
                              <td className="px-2 py-1 text-center border-l border-gray-200">
                                {standing?.tiebreakReason && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                    <Info size={9} className="shrink-0" />
                                    {standing.tiebreakReason}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
