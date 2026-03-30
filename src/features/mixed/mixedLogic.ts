import type {
  MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding,
  PlacementBracket, PlacementCategory, BracketMatch
} from './types';

/**
 * リーグ順位計算
 * 1. 勝数 → 2. 直接対決 → 3. 取得ゲーム率
 */
export function calculateLeagueStandings(
  leagues: MixedLeague[],
  matches: LeagueMatchScore[]
): Map<string, LeagueStanding[]> {
  const result = new Map<string, LeagueStanding[]>();

  for (const league of leagues) {
    const leagueMatches = matches.filter(m => m.leagueId === league.leagueId && m.status === 'finished');

    // 各チームの成績集計
    const statsMap = new Map<string, { wins: number; losses: number; gamesWon: number; gamesLost: number }>();
    for (const team of league.teams) {
      statsMap.set(team.teamId, { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
    }

    for (const m of leagueMatches) {
      if (m.score1 === null || m.score2 === null) continue;
      const s1 = statsMap.get(m.team1Id);
      const s2 = statsMap.get(m.team2Id);
      if (s1) {
        s1.gamesWon += m.score1;
        s1.gamesLost += m.score2;
        if (m.score1 > m.score2) s1.wins++; else s1.losses++;
      }
      if (s2) {
        s2.gamesWon += m.score2;
        s2.gamesLost += m.score1;
        if (m.score2 > m.score1) s2.wins++; else s2.losses++;
      }
    }

    // 順位決定
    const standings: LeagueStanding[] = league.teams.map(team => {
      const stats = statsMap.get(team.teamId)!;
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        leagueId: league.leagueId,
        rank: 0,
        wins: stats.wins,
        losses: stats.losses,
        gamesWon: stats.gamesWon,
        gamesLost: stats.gamesLost,
        gameRatio: stats.gamesLost === 0 ? (stats.gamesWon > 0 ? Infinity : 0) : stats.gamesWon / stats.gamesLost,
        headToHeadWin: 0,
      };
    });

    // ソート: 勝数降順 → タイブレーク
    standings.sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;

      // 同じ勝数のチーム群を確認
      const tiedTeams = standings.filter(s => s.wins === a.wins);

      if (tiedTeams.length === 2) {
        // 2チーム同率: 直接対決
        const h2h = leagueMatches.find(m =>
          (m.team1Id === a.teamId && m.team2Id === b.teamId) ||
          (m.team1Id === b.teamId && m.team2Id === a.teamId)
        );
        if (h2h && h2h.winnerId) {
          return h2h.winnerId === a.teamId ? -1 : 1;
        }
      }

      if (tiedTeams.length >= 3) {
        // 3チーム以上同率: 取得ゲーム率
        const ratioA = a.gamesLost === 0 ? Infinity : a.gamesWon / a.gamesLost;
        const ratioB = b.gamesLost === 0 ? Infinity : b.gamesWon / b.gamesLost;
        if (ratioA !== ratioB) return ratioB - ratioA;
      }

      // 最終: ゲーム率
      return (b.gameRatio === Infinity ? 9999 : b.gameRatio) - (a.gameRatio === Infinity ? 9999 : a.gameRatio);
    });

    standings.forEach((s, i) => { s.rank = i + 1; });
    result.set(league.leagueId, standings);
  }

  return result;
}

/**
 * 次の2のべき乗を返す
 */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * 順位別トーナメント生成
 */
export function generateAllBrackets(
  standings: Map<string, LeagueStanding[]>,
  _allTeams: MixedTeam[],
  leagues: MixedLeague[]
): PlacementBracket[] {
  const categories: { cat: PlacementCategory; label: string; rank: number }[] = [
    { cat: '1st', label: '1位トーナメント', rank: 1 },
    { cat: '2nd', label: '2位トーナメント', rank: 2 },
    { cat: '3rd', label: '3位トーナメント', rank: 3 },
    { cat: '4th', label: '4位・5位トーナメント', rank: 4 },
  ];

  const brackets: PlacementBracket[] = [];

  for (const { cat, label, rank } of categories) {
    // 該当順位のチームを収集
    const teamsForBracket: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[] = [];
    let seed = 1;

    const leagueIds = leagues.map(l => l.leagueId);
    for (const lid of leagueIds) {
      const ls = standings.get(lid);
      if (!ls) continue;

      if (rank <= 3) {
        const entry = ls.find(s => s.rank === rank);
        if (entry) {
          teamsForBracket.push({ teamId: entry.teamId, teamName: entry.teamName, leagueId: lid, seedPosition: seed++ });
        }
      } else {
        // 4位以降すべて
        const entries = ls.filter(s => s.rank >= 4);
        for (const entry of entries) {
          teamsForBracket.push({ teamId: entry.teamId, teamName: entry.teamName, leagueId: lid, seedPosition: seed++ });
        }
      }
    }

    const drawSize = nextPowerOf2(teamsForBracket.length);
    const matches = generateBracketMatches(cat, drawSize, teamsForBracket);

    brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
  }

  return brackets;
}

/**
 * トーナメント試合生成
 */
function generateBracketMatches(
  category: PlacementCategory,
  drawSize: number,
  teams: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[]
): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const totalRounds = Math.log2(drawSize);

  // 全ラウンドの試合を生成
  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = drawSize / Math.pow(2, round);
    for (let pos = 1; pos <= matchesInRound; pos++) {
      const matchId = `bracket-${category}-R${round}-${pos}`;
      const nextRound = round + 1;
      const nextPos = Math.ceil(pos / 2);
      const nextMatchId = round < totalRounds ? `bracket-${category}-R${nextRound}-${nextPos}` : null;
      const nextSlot = pos % 2 === 1 ? 'team1' as const : 'team2' as const;

      matches.push({
        matchId,
        category,
        round,
        position: pos,
        team1Id: null,
        team2Id: null,
        team1Name: '',
        team2Name: '',
        team1League: '',
        team2League: '',
        score1: null,
        score2: null,
        winnerId: null,
        status: 'waiting',
        isBye: false,
        nextMatchId,
        nextSlot: nextMatchId ? nextSlot : null,
      });
    }
  }

  // 1回戦にチームを配置
  const r1Matches = matches.filter(m => m.round === 1);
  for (let i = 0; i < r1Matches.length; i++) {
    const t1Idx = i * 2;
    const t2Idx = i * 2 + 1;

    if (t1Idx < teams.length) {
      r1Matches[i].team1Id = teams[t1Idx].teamId;
      r1Matches[i].team1Name = teams[t1Idx].teamName;
      r1Matches[i].team1League = teams[t1Idx].leagueId;
    }
    if (t2Idx < teams.length) {
      r1Matches[i].team2Id = teams[t2Idx].teamId;
      r1Matches[i].team2Name = teams[t2Idx].teamName;
      r1Matches[i].team2League = teams[t2Idx].leagueId;
    }

    // BYE処理
    if (r1Matches[i].team1Id && !r1Matches[i].team2Id) {
      r1Matches[i].isBye = true;
      r1Matches[i].status = 'bye';
      r1Matches[i].winnerId = r1Matches[i].team1Id;
      r1Matches[i].team2Name = 'BYE';
    } else if (!r1Matches[i].team1Id && r1Matches[i].team2Id) {
      r1Matches[i].isBye = true;
      r1Matches[i].status = 'bye';
      r1Matches[i].winnerId = r1Matches[i].team2Id;
      r1Matches[i].team1Name = 'BYE';
    } else if (r1Matches[i].team1Id && r1Matches[i].team2Id) {
      r1Matches[i].status = 'ready';
    }
  }

  // BYE勝者を2回戦に自動進出
  for (const m of r1Matches) {
    if (m.isBye && m.winnerId && m.nextMatchId) {
      const nextMatch = matches.find(nm => nm.matchId === m.nextMatchId);
      if (nextMatch) {
        const team = teams.find(t => t.teamId === m.winnerId);
        if (m.nextSlot === 'team1') {
          nextMatch.team1Id = m.winnerId;
          nextMatch.team1Name = team?.teamName || '';
          nextMatch.team1League = team?.leagueId || '';
        } else {
          nextMatch.team2Id = m.winnerId;
          nextMatch.team2Name = team?.teamName || '';
          nextMatch.team2League = team?.leagueId || '';
        }
        if (nextMatch.team1Id && nextMatch.team2Id) {
          nextMatch.status = 'ready';
        }
      }
    }
  }

  return matches;
}
