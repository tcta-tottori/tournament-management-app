import type {
  MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding,
  PlacementBracket, PlacementCategory, BracketMatch, MatchOrderEntry, TournamentInfo
} from './types';

/** 4チームリーグの対戦順 */
const MATCH_ORDER_4: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 3, team2Index: 4 },
  { matchNumber: 3, team1Index: 1, team2Index: 3 },
  { matchNumber: 4, team1Index: 2, team2Index: 4 },
  { matchNumber: 5, team1Index: 1, team2Index: 4 },
  { matchNumber: 6, team1Index: 2, team2Index: 3 },
];

/** 5チームリーグの対戦順 */
const MATCH_ORDER_5: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 3, team2Index: 4 },
  { matchNumber: 3, team1Index: 1, team2Index: 5 },
  { matchNumber: 4, team1Index: 2, team2Index: 3 },
  { matchNumber: 5, team1Index: 1, team2Index: 4 },
  { matchNumber: 6, team1Index: 2, team2Index: 5 },
  { matchNumber: 7, team1Index: 3, team2Index: 5 },
  { matchNumber: 8, team1Index: 2, team2Index: 4 },
  { matchNumber: 9, team1Index: 4, team2Index: 5 },
  { matchNumber: 10, team1Index: 1, team2Index: 3 },
];

/** ラウンドロビン対戦順を生成（一般N人用） */
function generateMatchOrder(n: number): MatchOrderEntry[] {
  if (n === 4) return MATCH_ORDER_4;
  if (n === 5) return MATCH_ORDER_5;
  const order: MatchOrderEntry[] = [];
  let num = 1;
  for (let i = 1; i <= n; i++) {
    for (let j = i + 1; j <= n; j++) {
      order.push({ matchNumber: num++, team1Index: i, team2Index: j });
    }
  }
  return order;
}

/** リーグの試合データを再生成 */
export function regenerateLeagueMatches(league: MixedLeague): LeagueMatchScore[] {
  const matchOrder = generateMatchOrder(league.teams.length);
  const matches: LeagueMatchScore[] = [];
  for (const mo of matchOrder) {
    const team1 = league.teams[mo.team1Index - 1];
    const team2 = league.teams[mo.team2Index - 1];
    if (!team1 || !team2) continue;
    matches.push({
      matchId: `league-${league.leagueId}-${mo.matchNumber}`,
      leagueId: league.leagueId,
      matchNumber: mo.matchNumber,
      team1Id: team1.teamId,
      team2Id: team2.teamId,
      score1: null, score2: null, tiebreakScore: null, winnerId: null,
      status: 'waiting',
    });
  }
  return matches;
}

/**
 * リーグ順位計算
 * 1. 勝数 → 2. 直接対決 → 3. 取得ゲーム率
 */
export function calculateLeagueStandings(
  leagues: MixedLeague[],
  matches: LeagueMatchScore[],
  rankOverrides?: Record<string, Record<string, number>>
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
      if (!m.winnerId) continue;
      const actualScore1 = m.score1 !== null && m.score1 >= 0 ? m.score1 : 0;
      const actualScore2 = m.score2 !== null && m.score2 >= 0 ? m.score2 : 0;
      const s1 = statsMap.get(m.team1Id);
      const s2 = statsMap.get(m.team2Id);
      if (s1) {
        s1.gamesWon += actualScore1;
        s1.gamesLost += actualScore2;
        if (m.winnerId === m.team1Id) s1.wins++; else s1.losses++;
      }
      if (s2) {
        s2.gamesWon += actualScore2;
        s2.gamesLost += actualScore1;
        if (m.winnerId === m.team2Id) s2.wins++; else s2.losses++;
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
          // 直接対決で順位決定
          const winner = h2h.winnerId === a.teamId ? a : b;
          const loser = h2h.winnerId === a.teamId ? b : a;
          winner.tiebreakReason = '直接対決勝ち';
          loser.tiebreakReason = '直接対決負け';
          return h2h.winnerId === a.teamId ? -1 : 1;
        }
      }

      if (tiedTeams.length >= 3) {
        // 3チーム以上同率: 取得ゲーム率
        const ratioA = a.gamesLost === 0 ? Infinity : a.gamesWon / a.gamesLost;
        const ratioB = b.gamesLost === 0 ? Infinity : b.gamesWon / b.gamesLost;
        if (ratioA !== ratioB) {
          a.tiebreakReason = `ゲーム率 ${ratioA === Infinity ? '∞' : ratioA.toFixed(3)}`;
          b.tiebreakReason = `ゲーム率 ${ratioB === Infinity ? '∞' : ratioB.toFixed(3)}`;
          return ratioB - ratioA;
        }
      }

      // 最終: ゲーム率
      return (b.gameRatio === Infinity ? 9999 : b.gameRatio) - (a.gameRatio === Infinity ? 9999 : a.gameRatio);
    });

    standings.forEach((s, i) => { s.rank = i + 1; });

    // 手動順位オーバーライドを適用
    const overrides = rankOverrides?.[league.leagueId];
    if (overrides) {
      for (const s of standings) {
        if (overrides[s.teamId] !== undefined) {
          s.rank = overrides[s.teamId];
          s.tiebreakReason = '抽選確定';
        }
      }
      // オーバーライド適用後にランク順で再ソート
      standings.sort((a, b) => a.rank - b.rank);
    }

    // タイブレーク理由が未設定の同率チームにゲーム率を表示
    // ゲーム率も同率の場合は「抽選」を表示
    for (let i = 0; i < standings.length; i++) {
      const tied = standings.filter(s => s.wins === standings[i].wins && s.wins > 0);
      if (tied.length >= 2) {
        // ゲーム率が完全に同率のチーム群を検出
        const ratioGroups = new Map<string, LeagueStanding[]>();
        for (const s of tied) {
          const ratioKey = s.gamesLost === 0 ? (s.gamesWon > 0 ? 'inf' : '0') : (s.gamesWon / s.gamesLost).toFixed(6);
          if (!ratioGroups.has(ratioKey)) ratioGroups.set(ratioKey, []);
          ratioGroups.get(ratioKey)!.push(s);
        }
        for (const s of tied) {
          if (!s.tiebreakReason) {
            const ratio = s.gamesLost === 0 ? Infinity : s.gamesWon / s.gamesLost;
            const ratioKey = s.gamesLost === 0 ? (s.gamesWon > 0 ? 'inf' : '0') : ratio.toFixed(6);
            const sameRatioTeams = ratioGroups.get(ratioKey) || [];
            if (sameRatioTeams.length >= 2) {
              s.tiebreakReason = `抽選（ゲーム率 ${ratio === Infinity ? '∞' : ratio.toFixed(3)}）`;
            } else {
              s.tiebreakReason = `ゲーム率 ${ratio === Infinity ? '∞' : ratio.toFixed(3)}`;
            }
          }
        }
      }
    }

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
 * ドロー表に記載された順位別トーナメントのスロット配置
 * drawSize=16 のスロット1~16にリーグIDを配置。null=BYE。
 * ドロー表のトーナメント線を正確に転記。
 *
 * 2位 (13チーム, 3BYE):
 *   R1: G(bye) | E-L | H-C | J(bye) | B-F | A-M | I-D | K(bye)
 *   R2: G vs E/L勝者 | H/C勝者 vs J | B/F勝者 vs A/M勝者 | I/D勝者 vs K
 *
 * 3位 (13チーム, 3BYE):
 *   R1: D(bye) | H-M | F-A | K(bye) | I-G | C-E | L-J | B(bye)
 *
 * 4・5位 (14チーム, 2BYE):
 *   R1: A-M | F-J | L-B | D(bye) | E-H | K-I | G-C | (bye)M5
 */
export const BRACKET_SLOT_MAP: Record<string, (string | null)[]> = {
  '2nd': ['G',null,'E','L','H','C','J',null,'B','F','A','M','I','D','K',null],
  '3rd': ['D',null,'H','M','F','A','K',null,'I','G','C','E','L','J','B',null],
  '4th': ['A','M','F','J','L','B','D',null,'E','H','K','I','G','C',null,'M'],
};

/**
 * 順位別トーナメント生成
 */
export function generateAllBrackets(
  standings: Map<string, LeagueStanding[]>,
  _allTeams: MixedTeam[],
  leagues: MixedLeague[],
  _bracketOrders?: TournamentInfo['bracketOrders']
): PlacementBracket[] {
  const categories: { cat: PlacementCategory; label: string; rank: number }[] = [
    { cat: '1st', label: '1位トーナメント', rank: 1 },
    { cat: '2nd', label: '2位トーナメント', rank: 2 },
    { cat: '3rd', label: '3位トーナメント', rank: 3 },
    { cat: '4th', label: '4・5位トーナメント', rank: 4 },
  ];

  const brackets: PlacementBracket[] = [];

  for (const { cat, label, rank } of categories) {
    // 全チームをリーグID→チーム情報のマップとして収集
    const teamByLeague = new Map<string, { teamId: string; teamName: string; leagueId: string }[]>();
    for (const lid of leagues.map(l => l.leagueId)) {
      const normalizedLid = lid.trim();
      const ls = standings.get(normalizedLid) || standings.get(lid);
      if (!ls) continue;
      if (rank <= 3) {
        const entry = ls.find(s => s.rank === rank);
        if (entry) teamByLeague.set(normalizedLid, [{ teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid }]);
      } else {
        const entries = ls.filter(s => s.rank >= 4).map(entry => ({ teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid }));
        if (entries.length > 0) teamByLeague.set(normalizedLid, entries);
      }
    }

    // スロットマップからdrawSize=16のスロット配列を構築
    const slotMap = BRACKET_SLOT_MAP[cat];
    if (slotMap) {
      // スロットマップ使用: BYE位置を明示的に含む
      const drawSize = slotMap.length; // 16
      const slots: ({ teamId: string; teamName: string; leagueId: string } | null)[] = [];
      for (const lid of slotMap) {
        if (lid === null) {
          slots.push(null); // BYE
        } else {
          const teamList = teamByLeague.get(lid);
          if (teamList && teamList.length > 0) {
            slots.push(teamList.shift()!);
          } else {
            slots.push(null); // チームが見つからない場合もBYE
          }
        }
      }
      const teamsForBracket = slots.filter((s): s is NonNullable<typeof s> => s !== null)
        .map((t, i) => ({ ...t, seedPosition: i + 1 }));
      const matches = generateBracketMatchesWithSlots(cat, drawSize, slots);
      brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
    } else {
      // 1位トーナメント: 抽選なのでリーグ順で収集
      const teamsForBracket: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[] = [];
      let seed = 1;
      for (const [, teamList] of teamByLeague) {
        for (const t of teamList) {
          teamsForBracket.push({ ...t, seedPosition: seed++ });
        }
      }
      const drawSize = nextPowerOf2(teamsForBracket.length);
      const matches = generateBracketMatches(cat, drawSize, teamsForBracket);
      brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
    }
  }

  return brackets;
}

/**
 * スロットマップ（BYE位置明示）を使ったトーナメント試合生成
 */
function generateBracketMatchesWithSlots(
  category: PlacementCategory,
  drawSize: number,
  slots: ({ teamId: string; teamName: string; leagueId: string } | null)[]
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
        matchId, category, round, position: pos,
        team1Id: null, team2Id: null, team1Name: '', team2Name: '',
        team1League: '', team2League: '',
        score1: null, score2: null, winnerId: null,
        status: 'waiting', isBye: false,
        nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
      });
    }
  }

  // 1回戦にスロットマップからチーム/BYEを配置
  const r1Matches = matches.filter(m => m.round === 1);
  for (let i = 0; i < r1Matches.length; i++) {
    const s1 = slots[i * 2] || null;
    const s2 = slots[i * 2 + 1] || null;

    if (s1) { r1Matches[i].team1Id = s1.teamId; r1Matches[i].team1Name = s1.teamName; r1Matches[i].team1League = s1.leagueId; }
    if (s2) { r1Matches[i].team2Id = s2.teamId; r1Matches[i].team2Name = s2.teamName; r1Matches[i].team2League = s2.leagueId; }

    if (r1Matches[i].team1Id && !r1Matches[i].team2Id) {
      r1Matches[i].isBye = true; r1Matches[i].status = 'bye'; r1Matches[i].winnerId = r1Matches[i].team1Id; r1Matches[i].team2Name = 'BYE';
    } else if (!r1Matches[i].team1Id && r1Matches[i].team2Id) {
      r1Matches[i].isBye = true; r1Matches[i].status = 'bye'; r1Matches[i].winnerId = r1Matches[i].team2Id; r1Matches[i].team1Name = 'BYE';
    } else if (r1Matches[i].team1Id && r1Matches[i].team2Id) {
      r1Matches[i].status = 'ready';
    }
  }

  // BYE勝者を2回戦に自動進出
  for (const m of r1Matches) {
    if (m.isBye && m.winnerId && m.nextMatchId) {
      const nextMatch = matches.find(nm => nm.matchId === m.nextMatchId);
      if (nextMatch) {
        const team = slots.find(s => s && s.teamId === m.winnerId);
        if (m.nextSlot === 'team1') {
          nextMatch.team1Id = m.winnerId; nextMatch.team1Name = team?.teamName || ''; nextMatch.team1League = team?.leagueId || '';
        } else {
          nextMatch.team2Id = m.winnerId; nextMatch.team2Name = team?.teamName || ''; nextMatch.team2League = team?.leagueId || '';
        }
        if (nextMatch.team1Id && nextMatch.team2Id) nextMatch.status = 'ready';
      }
    }
  }

  return matches;
}

/**
 * トーナメント試合生成（1位トーナメント用）
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

  // 1回戦にチームを配置（1位トーナメントは抽選で決めるため初期配置しない）
  const r1Matches = matches.filter(m => m.round === 1);
  const skipInitialPlacement = category === '1st';
  for (let i = 0; i < r1Matches.length; i++) {
    if (skipInitialPlacement) continue;
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

    // BYE処理（1位トーナメントは初期配置しないためスキップ）
    if (skipInitialPlacement) continue;
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

  // BYE勝者を2回戦に自動進出（1位トーナメントは抽選後に処理）
  if (skipInitialPlacement) return matches;
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
