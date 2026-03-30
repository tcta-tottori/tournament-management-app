import { FileDown, Trophy, Medal, Award, Users, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import type { PlacementCategory } from './types';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4位・5位トーナメント',
};

export default function MixedResultsExport() {
  const { leagues, leagueMatches, brackets, tournamentInfo, allTeams } = useMixedStore();
  const allStandings = calculateLeagueStandings(leagues, leagueMatches);

  // トーナメント結果取得
  const getBracketResults = (category: PlacementCategory) => {
    const bracket = brackets.find(b => b.category === category);
    if (!bracket) return null;

    const totalRounds = Math.log2(bracket.drawSize);
    const finalMatch = bracket.matches.find(m => m.round === totalRounds);
    const sfMatches = bracket.matches.filter(m => m.round === totalRounds - 1);

    const winner = finalMatch?.winnerId ? allTeams.find(t => t.teamId === finalMatch.winnerId) : null;
    const runnerUp = finalMatch ? allTeams.find(t => t.teamId === (finalMatch.winnerId === finalMatch.team1Id ? finalMatch.team2Id : finalMatch.team1Id)) : null;

    // 準決勝敗者 = 3位
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

      // 個別試合結果
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

    // シート2: トーナメント結果
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

    // ダウンロード
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
                      <div className="text-xs text-yellow-600 font-medium mb-1">🏆 優勝</div>
                      <div className="font-bold text-gray-800">{results.winner.teamName}</div>
                      <div className="text-xs text-gray-500 mt-1">{results.winner.male.name} / {results.winner.female.name}</div>
                      <div className="text-xs text-gray-400">{results.winner.male.affiliation}</div>
                    </div>
                  )}
                  {results.runnerUp && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 font-medium mb-1">🥈 準優勝</div>
                      <div className="font-bold text-gray-800">{results.runnerUp.teamName}</div>
                      <div className="text-xs text-gray-500 mt-1">{results.runnerUp.male.name} / {results.runnerUp.female.name}</div>
                      <div className="text-xs text-gray-400">{results.runnerUp.male.affiliation}</div>
                    </div>
                  )}
                  {results.sfLosers.length > 0 && (
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                      <div className="text-xs text-orange-500 font-medium mb-1">🥉 3位</div>
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
    </div>
  );
}
