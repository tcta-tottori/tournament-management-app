import type {
  TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding,
  TeamPlacementBracket, PlacementCategory, TeamBracketMatch,
  MatchOrderEntry, TeamTournamentInfo, SubMatchScore, BracketSubMatchScore, MatchType,
  TiebreakRuleId
} from './types';

/** タイブレークルール定義 */
export const TIEBREAK_RULE_LABELS: Record<TiebreakRuleId, string> = {
  points: '取得ポイント（種目勝利数）',
  gameRatio: 'ゲーム率',
  headToHead: '直接対決',
};

/** デフォルト判定順序 */
export const DEFAULT_TIEBREAK_ORDER: TiebreakRuleId[] = ['points', 'gameRatio', 'headToHead'];

/** 種目の対戦順（固定） */
export const MATCH_TYPE_ORDER: MatchType[] = ['MIX', 'WD', 'MD'];

/** 種目ラベル */
export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  MIX: 'ミックスダブルス',
  WD: '女子ダブルス',
  MD: '男子ダブルス',
};

/** 種目短縮ラベル */
export const MATCH_TYPE_SHORT: Record<MatchType, string> = {
  MIX: 'Mix',
  WD: 'WD',
  MD: 'MD',
};

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
  { matchNumber: 5, team1Index: 4, team2Index: 5 },
  { matchNumber: 6, team1Index: 1, team2Index: 3 },
  { matchNumber: 7, team1Index: 2, team2Index: 4 },
  { matchNumber: 8, team1Index: 3, team2Index: 5 },
  { matchNumber: 9, team1Index: 1, team2Index: 4 },
  { matchNumber: 10, team1Index: 2, team2Index: 5 },
];

/** 対戦順を生成 */
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

/** 空のサブマッチ配列を生成 */
function createEmptySubMatches(): SubMatchScore[] {
  return MATCH_TYPE_ORDER.map(type => ({
    type,
    score1: null,
    score2: null,
    tiebreakScore: null,
    winnerId: null,
  }));
}

/** リーグの試合データを再生成 */
export function regenerateLeagueMatches(league: TeamLeague): TeamLeagueMatch[] {
  const matchOrder = generateMatchOrder(league.teams.length);
  const matches: TeamLeagueMatch[] = [];
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
      subMatches: createEmptySubMatches(),
      winnerId: null,
      winsTeam1: 0,
      winsTeam2: 0,
      status: 'waiting',
    });
  }
  return matches;
}

/** 種目勝利数からチーム勝敗を判定 */
export function determineTeamWinner(
  subMatches: SubMatchScore[],
  team1Id: string,
  team2Id: string
): { winnerId: string | null; winsTeam1: number; winsTeam2: number } {
  let winsTeam1 = 0;
  let winsTeam2 = 0;
  for (const sm of subMatches) {
    if (sm.winnerId === team1Id) winsTeam1++;
    else if (sm.winnerId === team2Id) winsTeam2++;
  }
  let winnerId: string | null = null;
  if (winsTeam1 >= 2) winnerId = team1Id;
  else if (winsTeam2 >= 2) winnerId = team2Id;
  // 3種目全て終了している場合のみ、3-0でなくても勝者確定
  const allFinished = subMatches.every(sm => sm.winnerId !== null);
  if (allFinished && !winnerId) {
    // 全種目終了で同率の場合は存在しないはず（3種目あるので）
    winnerId = winsTeam1 > winsTeam2 ? team1Id : team2Id;
  }
  return { winnerId, winsTeam1, winsTeam2 };
}

/**
 * リーグ順位計算
 * 団体戦特別ルール:
 * 1. 勝率（対戦チーム勝利数）
 * 2. 取得ポイント（種目勝利数）
 * 3. 取得ゲーム率
 * 4. 直接対決
 */
export function calculateTeamStandings(
  leagues: TeamLeague[],
  matches: TeamLeagueMatch[],
  rankOverrides?: Record<string, Record<string, number>>,
  tiebreakOrder: TiebreakRuleId[] = DEFAULT_TIEBREAK_ORDER
): Map<string, TeamLeagueStanding[]> {
  const result = new Map<string, TeamLeagueStanding[]>();

  for (const league of leagues) {
    const leagueMatches = matches.filter(m => m.leagueId === league.leagueId && m.status === 'finished');

    const statsMap = new Map<string, {
      wins: number; losses: number;
      pointsWon: number; pointsLost: number;
      gamesWon: number; gamesLost: number;
    }>();
    for (const team of league.teams) {
      statsMap.set(team.teamId, { wins: 0, losses: 0, pointsWon: 0, pointsLost: 0, gamesWon: 0, gamesLost: 0 });
    }

    for (const m of leagueMatches) {
      if (!m.winnerId) continue;
      const s1 = statsMap.get(m.team1Id);
      const s2 = statsMap.get(m.team2Id);

      // 対戦勝敗
      if (s1) {
        if (m.winnerId === m.team1Id) s1.wins++; else s1.losses++;
        s1.pointsWon += m.winsTeam1;
        s1.pointsLost += m.winsTeam2;
      }
      if (s2) {
        if (m.winnerId === m.team2Id) s2.wins++; else s2.losses++;
        s2.pointsWon += m.winsTeam2;
        s2.pointsLost += m.winsTeam1;
      }

      // ゲーム数集計
      for (const sm of m.subMatches) {
        const gs1 = sm.score1 !== null && sm.score1 >= 0 ? sm.score1 : 0;
        const gs2 = sm.score2 !== null && sm.score2 >= 0 ? sm.score2 : 0;
        if (s1) { s1.gamesWon += gs1; s1.gamesLost += gs2; }
        if (s2) { s2.gamesWon += gs2; s2.gamesLost += gs1; }
      }
    }

    const standings: TeamLeagueStanding[] = league.teams.map(team => {
      const stats = statsMap.get(team.teamId)!;
      const totalGames = stats.gamesWon + stats.gamesLost;
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        leagueId: league.leagueId,
        rank: 0,
        wins: stats.wins,
        losses: stats.losses,
        pointsWon: stats.pointsWon,
        pointsLost: stats.pointsLost,
        gamesWon: stats.gamesWon,
        gamesLost: stats.gamesLost,
        gameRatio: totalGames === 0 ? 0 : stats.gamesWon / totalGames,
      };
    });

    // ソート: 勝数 → ユーザー設定の優先順位に従ってタイブレーク
    standings.sort((a, b) => {
      // 0. 勝数降順（常に最優先）
      if (a.wins !== b.wins) return b.wins - a.wins;

      const tiedTeams = standings.filter(s => s.wins === a.wins);

      for (const rule of tiebreakOrder) {
        if (rule === 'points') {
          if (a.pointsWon !== b.pointsWon) {
            a.tiebreakReason = `ポイント ${a.pointsWon}`;
            b.tiebreakReason = `ポイント ${b.pointsWon}`;
            return b.pointsWon - a.pointsWon;
          }
        } else if (rule === 'gameRatio') {
          const totalA = a.gamesWon + a.gamesLost;
          const totalB = b.gamesWon + b.gamesLost;
          const ratioA = totalA === 0 ? 0 : a.gamesWon / totalA;
          const ratioB = totalB === 0 ? 0 : b.gamesWon / totalB;
          if (Math.abs(ratioA - ratioB) > 0.0001) {
            a.tiebreakReason = `ゲーム率 ${ratioA.toFixed(3)}`;
            b.tiebreakReason = `ゲーム率 ${ratioB.toFixed(3)}`;
            return ratioB - ratioA;
          }
        } else if (rule === 'headToHead') {
          if (tiedTeams.length === 2) {
            const h2h = leagueMatches.find(m =>
              (m.team1Id === a.teamId && m.team2Id === b.teamId) ||
              (m.team1Id === b.teamId && m.team2Id === a.teamId)
            );
            if (h2h && h2h.winnerId) {
              const winner = h2h.winnerId === a.teamId ? a : b;
              const loser = h2h.winnerId === a.teamId ? b : a;
              winner.tiebreakReason = '直接対決勝ち';
              loser.tiebreakReason = '直接対決負け';
              return h2h.winnerId === a.teamId ? -1 : 1;
            }
          }
        }
      }

      return 0;
    });

    standings.forEach((s, i) => { s.rank = i + 1; });

    // 手動順位オーバーライド
    const overrides = rankOverrides?.[league.leagueId];
    if (overrides) {
      for (const s of standings) {
        if (overrides[s.teamId] !== undefined) {
          s.rank = overrides[s.teamId];
          s.tiebreakReason = '抽選確定';
        }
      }
      standings.sort((a, b) => a.rank - b.rank);
    }

    // タイブレーク理由未設定の同率チームに表示
    for (let i = 0; i < standings.length; i++) {
      const tied = standings.filter(s => s.wins === standings[i].wins && s.wins > 0);
      if (tied.length >= 2) {
        for (const s of tied) {
          if (!s.tiebreakReason) {
            const total = s.gamesWon + s.gamesLost;
            const ratio = total === 0 ? 0 : s.gamesWon / total;
            s.tiebreakReason = `ポイント ${s.pointsWon} / ゲーム率 ${ratio.toFixed(3)}`;
          }
        }
      }
    }

    result.set(league.leagueId, standings);
  }

  return result;
}

/** 次の2のべき乗 */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * 団体戦ドロー表に記載された順位別トーナメントのスロット配置
 * drawSize=8 (5リーグ→最大5チーム)
 *
 * 2位: C2, B2, D2, A2, E2
 * 3位: D3, C3, E3, B3, A3
 * 4・5位: B4, D4, E5, A4, D5, E4, C4
 */
export const BRACKET_SLOT_MAP: Record<string, (string | null)[]> = {
  '2nd': ['C', null, 'B', 'D', 'A', 'E', null, null],
  '3rd': ['D', null, 'C', 'E', 'B', 'A', null, null],
  '4th': ['B', 'D', 'E5', 'A', 'D5', 'E', 'C', null],
};

/** 空のブラケットサブマッチを生成 */
function createEmptyBracketSubMatches(): BracketSubMatchScore[] {
  return MATCH_TYPE_ORDER.map(type => ({
    type,
    score1: null,
    score2: null,
    tiebreakScore: null,
    winnerId: null,
  }));
}

/**
 * 順位別トーナメント生成
 */
export function generateAllBrackets(
  standings: Map<string, TeamLeagueStanding[]>,
  _allTeams: TeamEntry[],
  leagues: TeamLeague[],
  _bracketOrders?: TeamTournamentInfo['bracketOrders']
): TeamPlacementBracket[] {
  const categories: { cat: PlacementCategory; label: string; rank: number }[] = [
    { cat: '1st', label: '1位トーナメント', rank: 1 },
    { cat: '2nd', label: '2位トーナメント', rank: 2 },
    { cat: '3rd', label: '3位トーナメント', rank: 3 },
    { cat: '4th', label: '4・5位トーナメント', rank: 4 },
  ];

  const brackets: TeamPlacementBracket[] = [];

  for (const { cat, label, rank } of categories) {
    const teamByLeague = new Map<string, { teamId: string; teamName: string; leagueId: string }[]>();
    for (const lid of leagues.map(l => l.leagueId)) {
      const normalizedLid = lid.trim();
      const ls = standings.get(normalizedLid) || standings.get(lid);
      if (!ls) continue;
      if (rank <= 3) {
        const entry = ls.find(s => s.rank === rank);
        if (entry) teamByLeague.set(normalizedLid, [{ teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid }]);
      } else {
        const entries = ls.filter(s => s.rank >= 4).map(entry => ({
          teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid
        }));
        if (entries.length > 0) teamByLeague.set(normalizedLid, entries);
      }
    }

    const slotMap = BRACKET_SLOT_MAP[cat];
    if (slotMap) {
      const drawSize = 8;
      const slots: ({ teamId: string; teamName: string; leagueId: string } | null)[] = [];
      for (const lid of slotMap) {
        if (lid === null) {
          slots.push(null);
        } else {
          // 4・5位の場合、"D5" のような特殊キーを処理
          let leagueKey = lid;
          let rankNum = rank;
          const m = lid.match(/^([A-E])(\d)$/);
          if (m) {
            leagueKey = m[1];
            rankNum = parseInt(m[2]);
          }
          const teamList = teamByLeague.get(leagueKey);
          if (teamList && teamList.length > 0) {
            if (rank >= 4 && m) {
              // 特定順位のチームを探す
              const ls = standings.get(leagueKey);
              const specific = ls?.find(s => s.rank === rankNum);
              if (specific) {
                const idx = teamList.findIndex(t => t.teamId === specific.teamId);
                if (idx >= 0) {
                  slots.push(teamList.splice(idx, 1)[0]);
                } else {
                  slots.push(null);
                }
              } else {
                slots.push(null);
              }
            } else {
              slots.push(teamList.shift()!);
            }
          } else {
            slots.push(null);
          }
        }
      }
      const teamsForBracket = slots.filter((s): s is NonNullable<typeof s> => s !== null)
        .map((t, i) => ({ ...t, seedPosition: i + 1 }));
      const matches = generateBracketMatchesWithSlots(cat, drawSize, slots);
      brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
    } else {
      // 1位トーナメント: 抽選
      const teamsForBracket: { teamId: string; teamName: string; leagueId: string; seedPosition: number }[] = [];
      let seed = 1;
      for (const [, teamList] of teamByLeague) {
        for (const t of teamList) {
          teamsForBracket.push({ ...t, seedPosition: seed++ });
        }
      }
      const drawSize = 8;
      const emptySlots: (null)[] = Array(drawSize).fill(null);
      const matches = generateBracketMatchesWithSlots(cat, drawSize, emptySlots);
      brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
    }
  }

  return brackets;
}

/** スロットマップを使ったトーナメント試合生成 */
function generateBracketMatchesWithSlots(
  category: PlacementCategory,
  drawSize: number,
  slots: ({ teamId: string; teamName: string; leagueId: string } | null)[]
): TeamBracketMatch[] {
  const matches: TeamBracketMatch[] = [];
  const totalRounds = Math.log2(drawSize);

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
        subMatches: createEmptyBracketSubMatches(),
        winsTeam1: 0, winsTeam2: 0,
        winnerId: null,
        status: 'waiting', isBye: false,
        nextMatchId, nextSlot: nextMatchId ? nextSlot : null,
      });
    }
  }

  // 1回戦にスロットから配置
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
