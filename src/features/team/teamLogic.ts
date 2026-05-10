import type {
  TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding,
  TeamPlacementBracket, PlacementCategory, TeamBracketMatch,
  MatchOrderEntry, TeamTournamentInfo, SubMatchScore, BracketSubMatchScore, MatchType, MatchFormat,
  TiebreakRuleId, TeamPlayer, TeamMember
} from './types';

/** 苗字のみ抽出 */
export function familyName(name: string): string {
  return name.trim().split(/[\s\u3000]+/)[0] || name;
}

/** 名前（下の名前）の先頭1文字を取得 */
function givenNameInitial(name: string): string {
  const parts = name.trim().split(/[\s\u3000]+/);
  return parts.length > 1 ? parts[1][0] || '' : '';
}

/** 表示名の構造（メイン部分＋補助文字） */
export interface DisplayNameParts {
  main: string;    // メイン表示（苗字。最大3文字）
  sub: string;     // 同姓時の補助文字（名前の1文字目）
  full: string;    // main + sub の結合文字列
}

/**
 * メンバーの表示名を生成する
 * - displayName が設定されていればそれを使用
 * - 未設定の場合は苗字（最大3文字）
 * - 同じチームに同姓がいる場合、名前の1文字目を補助文字として付加
 */
export function getDisplayNameParts(
  player: TeamPlayer,
  allMembers: TeamMember[],
): DisplayNameParts {
  // displayName が設定済みならそのまま返す
  if (player.displayName) {
    return { main: player.displayName, sub: '', full: player.displayName };
  }

  const surname = familyName(player.name);
  const main = surname.slice(0, 3);

  // 同チーム内で同姓（先頭3文字一致）がいるかチェック
  const sameNameMembers = allMembers.filter(m => {
    const otherSurname = familyName(m.player.name);
    return otherSurname.slice(0, 3) === main && m.player.name !== player.name;
  });

  if (sameNameMembers.length > 0) {
    const sub = givenNameInitial(player.name);
    return { main, sub, full: main + sub };
  }

  return { main, sub: '', full: main };
}

/**
 * 表示名の文字列を取得（単純な文字列として）
 */
export function getDisplayName(
  player: TeamPlayer,
  allMembers: TeamMember[],
): string {
  return getDisplayNameParts(player, allMembers).full;
}

/** タイブレークルール定義 */
export const TIEBREAK_RULE_LABELS: Record<TiebreakRuleId, string> = {
  points: '取得ポイント（種目勝利数）',
  gameRatio: 'ゲーム率',
  headToHead: '直接対決',
};

/** デフォルト判定順序 */
export const DEFAULT_TIEBREAK_ORDER: TiebreakRuleId[] = ['points', 'gameRatio', 'headToHead'];

/** 種目の対戦順（ミックス大会形式 = MIX/WD/MD の3種目） */
export const MATCH_TYPE_ORDER_MIX: MatchType[] = ['MIX', 'WD', 'MD'];

/** 種目の対戦順（クラブ対抗戦形式 = ダブルス3 → 2 → 1 → シングルス2 → 1） */
export const MATCH_TYPE_ORDER_CLUB: MatchType[] = ['D3', 'D2', 'D1', 'S2', 'S1'];

/** 互換用：既存のミックス大会と同じ並び（後方互換のため "MIX/WD/MD" のまま） */
export const MATCH_TYPE_ORDER: MatchType[] = MATCH_TYPE_ORDER_MIX;

/** 試合形式に応じた種目順を返す */
export function getMatchTypeOrder(format?: MatchFormat | null): MatchType[] {
  return format === 'club' ? MATCH_TYPE_ORDER_CLUB : MATCH_TYPE_ORDER_MIX;
}

/** 種目ラベル */
export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  MIX: 'ミックスダブルス',
  WD: '女子ダブルス',
  MD: '男子ダブルス',
  D1: 'ダブルス1',
  D2: 'ダブルス2',
  D3: 'ダブルス3',
  S1: 'シングルス1',
  S2: 'シングルス2',
};

/** 種目短縮ラベル */
export const MATCH_TYPE_SHORT: Record<MatchType, string> = {
  MIX: 'Mix',
  WD: 'WD',
  MD: 'MD',
  D1: 'D1',
  D2: 'D2',
  D3: 'D3',
  S1: 'S1',
  S2: 'S2',
};

/** 種目あたりの選手数（シングルス=1名、ダブルス系=2名） */
export function playersPerSubMatch(type: MatchType): 1 | 2 {
  return type === 'S1' || type === 'S2' ? 1 : 2;
}

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

/** 空のサブマッチ配列を生成（試合形式を渡せばその種目順で生成） */
function createEmptySubMatches(format?: MatchFormat): SubMatchScore[] {
  return getMatchTypeOrder(format).map(type => ({
    type,
    score1: null,
    score2: null,
    tiebreakScore: null,
    winnerId: null,
  }));
}

/** リーグの試合データを再生成 */
export function regenerateLeagueMatches(league: TeamLeague, format?: MatchFormat): TeamLeagueMatch[] {
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
      subMatches: createEmptySubMatches(format),
      winnerId: null,
      winsTeam1: 0,
      winsTeam2: 0,
      status: 'waiting',
    });
  }
  return matches;
}

/** 種目勝利数からチーム勝敗を判定。打ち切り種目はカウントから除外 */
export function determineTeamWinner(
  subMatches: SubMatchScore[],
  team1Id: string,
  team2Id: string
): { winnerId: string | null; winsTeam1: number; winsTeam2: number } {
  let winsTeam1 = 0;
  let winsTeam2 = 0;
  for (const sm of subMatches) {
    if (sm.terminated) continue; // 打ち切りは勝利数にカウントしない
    if (sm.winnerId === team1Id) winsTeam1++;
    else if (sm.winnerId === team2Id) winsTeam2++;
  }
  // 過半数（カウント対象種目の半分超）獲得で勝利確定
  // 例) 3種目 → 2勝必要 / 5種目 → 3勝必要
  const totalCounted = subMatches.filter(sm => !sm.terminated).length;
  const majorityWins = Math.floor(totalCounted / 2) + 1;
  let winnerId: string | null = null;
  if (winsTeam1 >= majorityWins) winnerId = team1Id;
  else if (winsTeam2 >= majorityWins) winnerId = team2Id;
  // 全種目（打ち切り含む）が確定している場合のみ、過半数に届かなくても勝ち数の多い方を勝者とする
  const allFinished = subMatches.every(sm => sm.winnerId !== null || sm.terminated);
  if (allFinished && !winnerId && winsTeam1 !== winsTeam2) {
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
 * 団体戦ドロー表に記載された順位別トーナメントのデフォルトスロット配置
 * drawSize=8 (5リーグ→最大5チーム)
 *
 * ※ bracketOrders が Excel から読み込まれた場合はそちらが優先される
 */
export const BRACKET_SLOT_MAP: Record<string, (string | null)[]> = {
  '2nd': ['C', null, 'B', null, 'D', 'A', 'E', null],
  '3rd': ['D', null, 'C', null, 'E', 'B', 'A', null],
  '4th': ['B', 'D', 'E5', 'A', 'D5', 'E', 'C', null],
};

/**
 * bracketOrders（Excelから読み込んだ "A2","E2" 等のリスト）を
 * ブラケットスロット配列に変換する。
 * drawSize に合わせて null (BYE) を挿入して分散させる。
 */
function bracketOrdersToSlots(entries: string[], drawSizeIn: number): (string | null)[] {
  const drawSize = Math.max(drawSizeIn, nextPowerOf2(entries.length));
  const byeCount = drawSize - entries.length;
  const slots: (string | null)[] = [];

  if (byeCount <= 0) {
    // BYEなし: そのまま配置
    return entries.slice(0, drawSize);
  }

  // BYE を分散配置：各 R1 マッチ（ペア）に最大1つの BYE を入れる
  // entries をインデックスの偶数位置に配置し、奇数位置に BYE/残りを入れる
  // 戦略: 上位シードに BYE を付与（トーナメント下部から BYE を配置）
  // まず全エントリを配置し、残りを null で埋める
  for (let i = 0; i < entries.length; i++) {
    slots.push(entries[i]);
  }
  while (slots.length < drawSize) {
    slots.push(null);
  }
  return slots;
}

/** 空のブラケットサブマッチを生成 */
function createEmptyBracketSubMatches(format?: MatchFormat): BracketSubMatchScore[] {
  return getMatchTypeOrder(format).map(type => ({
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
  bracketOrders?: TeamTournamentInfo['bracketOrders'],
  matchFormat?: MatchFormat,
): TeamPlacementBracket[] {
  // 3位と4位を分けるかどうかをbracketOrdersから判定
  const has3rd = bracketOrders?.['3rd'] && bracketOrders['3rd'].length > 0;
  const has4th = bracketOrders?.['4th'] && bracketOrders['4th']!.length > 0;

  const categories: { cat: PlacementCategory; label: string; rank: number }[] = [
    { cat: '1st', label: '1位トーナメント', rank: 1 },
    { cat: '2nd', label: '2位トーナメント', rank: 2 },
  ];

  // bracketOrders に "3rd" があればそれを3位・4位統合として使う
  // bracketOrders がない場合はデフォルト（3位と4・5位を分ける）
  if (has3rd && !has4th) {
    // "3rd" キーが3位・4位統合トーナメント
    categories.push({ cat: '3rd', label: '3位・4位トーナメント', rank: 3 });
  } else {
    categories.push({ cat: '3rd', label: '3位トーナメント', rank: 3 });
    categories.push({ cat: '4th', label: '4・5位トーナメント', rank: 4 });
  }

  const brackets: TeamPlacementBracket[] = [];

  for (const { cat, label, rank } of categories) {
    // bracketOrders からスロット配列を取得
    const orderEntries = bracketOrders?.[cat === '4th' ? '4th' : cat === '3rd' ? '3rd' : cat === '2nd' ? '2nd' : undefined as never];

    // standings からチーム情報を収集
    const teamByLeague = new Map<string, { teamId: string; teamName: string; leagueId: string }[]>();
    for (const lid of leagues.map(l => l.leagueId)) {
      const normalizedLid = lid.trim();
      const ls = standings.get(normalizedLid) || standings.get(lid);
      if (!ls) continue;
      if (rank <= 3 && !(has3rd && !has4th && rank === 3)) {
        const entry = ls.find(s => s.rank === rank);
        if (entry) teamByLeague.set(normalizedLid, [{ teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid }]);
      } else if (has3rd && !has4th && rank === 3) {
        // 3位・4位統合: 3位以下のすべてのチーム
        const entries = ls.filter(s => s.rank >= 3).map(entry => ({
          teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid
        }));
        if (entries.length > 0) teamByLeague.set(normalizedLid, entries);
      } else {
        const entries = ls.filter(s => s.rank >= 4).map(entry => ({
          teamId: entry.teamId, teamName: entry.teamName, leagueId: normalizedLid
        }));
        if (entries.length > 0) teamByLeague.set(normalizedLid, entries);
      }
    }

    // bracketOrders がある場合はそれに基づいてスロットを配置
    if (orderEntries && orderEntries.length > 0) {
      const drawSize = nextPowerOf2(orderEntries.length);
      const slotCodes = bracketOrdersToSlots(orderEntries, drawSize);
      const slots: ({ teamId: string; teamName: string; leagueId: string } | null)[] = [];

      for (const code of slotCodes) {
        if (code === null) {
          slots.push(null);
        } else {
          // "A2" → league=A, rank=2
          const m = code.match(/^([A-Z])(\d)$/);
          if (m) {
            const leagueKey = m[1];
            const rankNum = parseInt(m[2]);
            const ls = standings.get(leagueKey);
            const entry = ls?.find(s => s.rank === rankNum);
            if (entry) {
              slots.push({ teamId: entry.teamId, teamName: entry.teamName, leagueId: leagueKey });
            } else {
              slots.push(null);
            }
          } else {
            // 単純なリーグ名の場合（デフォルトランク）
            const teamList = teamByLeague.get(code);
            if (teamList && teamList.length > 0) {
              slots.push(teamList.shift()!);
            } else {
              slots.push(null);
            }
          }
        }
      }

      const teamsForBracket = slots.filter((s): s is NonNullable<typeof s> => s !== null)
        .map((t, i) => ({ ...t, seedPosition: i + 1 }));
      const matches = generateBracketMatchesWithSlots(cat, drawSize, slots);
      brackets.push({ category: cat, label, drawSize, teams: teamsForBracket, matches });
    } else if (cat !== '1st') {
      // デフォルトのスロットマップを使用
      const slotMap = BRACKET_SLOT_MAP[cat];
      if (slotMap) {
        const drawSize = 8;
        const slots: ({ teamId: string; teamName: string; leagueId: string } | null)[] = [];
        for (const lid of slotMap) {
          if (lid === null) {
            slots.push(null);
          } else {
            let leagueKey = lid;
            let rankNum = rank;
            const m = lid.match(/^([A-Z])(\d)$/);
            if (m) {
              leagueKey = m[1];
              rankNum = parseInt(m[2]);
            }
            const teamList = teamByLeague.get(leagueKey);
            if (teamList && teamList.length > 0) {
              if (rank >= 4 && m) {
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
      }
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

/** カテゴリラベル（既定値） */
export const PLACEMENT_CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

/** カテゴリ短縮ラベル（既定値） */
export const PLACEMENT_CATEGORY_SHORT_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位T',
  '2nd': '2位T',
  '3rd': '3位T',
  '4th': '4·5位T',
};

/**
 * 大会情報のカスタムラベルを優先してカテゴリのフルラベルを取得する。
 */
export function resolveBracketLabel(
  category: PlacementCategory,
  customLabels?: Partial<Record<PlacementCategory, string>>
): string {
  const custom = customLabels?.[category];
  if (custom && custom.trim()) return custom;
  return PLACEMENT_CATEGORY_LABELS[category];
}

/**
 * 短縮ラベル。カスタムラベルがあれば「トーナメント」を除いて末尾に「T」を付ける。
 */
export function resolveBracketShortLabel(
  category: PlacementCategory,
  customLabels?: Partial<Record<PlacementCategory, string>>
): string {
  const custom = customLabels?.[category];
  if (custom && custom.trim()) {
    return custom.replace(/トーナメント$/, '').trim() + 'T';
  }
  return PLACEMENT_CATEGORY_SHORT_LABELS[category];
}

/** ラウンドラベル（決勝/準決勝/準々決勝/N回戦） */
export function getBracketRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${round}回戦`;
}

/** "1コート" → "1番コート" 形式に変換 */
export function toCourtCallName(courtName: string): string {
  const m = courtName.match(/^(\d+)\s*コート$/);
  return m ? `${m[1]}番コート` : courtName;
}

/** コート番号を抽出（'5コート' → 5） */
function extractCourtNumber(courtName: string): number | null {
  const m = courtName.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * コール用のコート名テキストを生成。
 * - 0件: '指定のコート'
 * - 1～2件: 「1番コートと2番コート」形式
 * - 3件以上で連番: 「5番コートから8番コートまで」に省略
 * - 3件以上で非連番: 「と」でフルに列挙
 */
export function formatCourtsForCall(courtNames: string[]): string {
  if (courtNames.length === 0) return '指定のコート';
  if (courtNames.length <= 2) {
    return courtNames.map(toCourtCallName).join('と');
  }
  const numbers = courtNames.map(extractCourtNumber);
  if (numbers.every((n): n is number => n !== null)) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
    if (isContiguous) {
      return `${sorted[0]}番コートから${sorted[sorted.length - 1]}番コートまで`;
    }
  }
  return courtNames.map(toCourtCallName).join('と');
}

/**
 * 読み上げ用に装飾記号（♪ ★ ♡ 等）を取り除く。
 * Unicode Symbol, other (\p{So}) と Symbol, modifier (\p{Sk}) を対象とする。
 */
export function sanitizeForSpeech(text: string): string {
  return text.replace(/[\p{So}\p{Sk}]/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * 団体戦・決勝トーナメントのコール文を生成。
 * 選手名や所属は含めず、チーム番号とチーム名のみを使う。
 * チーム名から装飾記号（♪ ★ 等）は取り除いて読み上げる。
 *
 * 読み上げ時にチーム番号とチーム名が詰まらないよう、句点 "。" で
 * 明示的にチャンク境界を入れる（useSpeechSynthesis が "。" で
 * 分割して 600ms のポーズを挟む仕様のため）。"行って" は TTS が
 * 「いって」と読んでしまうので、ひらがなで「おこなって」と書く。
 *
 * 例:
 *   試合のコールをします。
 *   1位トーナメント、1回戦。
 *   3番。ファイヤーボルト。
 *   4番。チームどんどん舞い上がれ。
 *   こちらの試合を、5番コートから8番コートまで使っておこなってください。
 *   ボールは、3番、ファイヤーボルトの方、お願いいたします。
 */
export function buildTeamBracketCallText(args: {
  category: PlacementCategory;
  roundLabel: string;
  team1Number: number;
  team1Name: string;
  team2Number: number;
  team2Name: string;
  courtNames: string[];
  customLabels?: Partial<Record<PlacementCategory, string>>;
}): string {
  const { category, roundLabel, team1Number, team1Name, team2Number, team2Name, courtNames, customLabels } = args;
  const categoryLabel = resolveBracketLabel(category, customLabels);
  const courtsText = formatCourtsForCall(courtNames);
  const cleanTeam1Name = sanitizeForSpeech(team1Name);
  const cleanTeam2Name = sanitizeForSpeech(team2Name);
  return [
    '試合のコールをします。',
    `${categoryLabel}、${roundLabel}。`,
    `${team1Number}番。${cleanTeam1Name}。`,
    `${team2Number}番。${cleanTeam2Name}。`,
    `こちらの試合を、${courtsText}を使っておこなってください。`,
    `ボールは、${team1Number}番、${cleanTeam1Name}の方、お願いいたします。`,
  ].join('\n');
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
        subMatches: createEmptyBracketSubMatches(matchFormat),
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
