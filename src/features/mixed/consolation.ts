// =============================================
// 順位別トーナメントの試合番号とコンソレーション（敗者同士の試合）
//
// ドロー表（例: 11ペア・16ドロー）では、準決勝より前の実試合に ❶❷… と番号を振り、
// 左右の山（ハーフ）ごとに、そこで負けたペア同士がもう1試合ずつ行う。
//   ・6ペアの山: 1回戦の敗者同士 / 2回戦の敗者同士
//       例) ❽ ❷敗者-❸敗者 ,  ❶敗者-❹敗者
//   ・5ペアの山: 1回戦の敗者 vs 枠同士で当たった2回戦の敗者 → その勝者 vs 残りの2回戦の敗者
//       例) ❽ ❶敗者-❷敗者 ,  ❽勝者-❸敗者
// コンソレは敗者復活戦ではないので、本戦には戻らない。
// =============================================

import type { BracketMatch, BracketSlotSource, PlacementBracket } from './types';

/** ❶〜⓴（黒丸数字） */
export function blackCircled(n: number): string {
  if (n >= 1 && n <= 10) return String.fromCodePoint(0x2775 + n);
  if (n >= 11 && n <= 20) return String.fromCodePoint(0x24EB + n - 11);
  return `(${n})`;
}

export function isConsolation(m: BracketMatch): boolean {
  return m.kind === 'consolation';
}

/** 本戦の試合だけ */
export function mainMatches(matches: BracketMatch[]): BracketMatch[] {
  return matches.filter(m => !isConsolation(m));
}

/** 本戦の1回戦の並びから BYE 位置を求める（byePositions を持たない古いデータ用） */
export function resolveByePositions(bracket: PlacementBracket): Set<number> {
  if (bracket.byePositions) return new Set(bracket.byePositions);
  const set = new Set<number>();
  const r1 = bracket.matches.filter(m => !isConsolation(m) && m.round === 1);
  for (const m of r1) {
    const base = (m.position - 1) * 2;
    if (m.isBye || m.team1Name === 'BYE' || m.team2Name === 'BYE') {
      if (!m.team1Id) set.add(base);
      if (!m.team2Id) set.add(base + 1);
    }
  }
  return set;
}

interface Node {
  match: BracketMatch;
  /** この試合の下にある（BYEでない）枠の位置 */
  leaves: number[];
  /** 両側に選手が入りうる＝実際に行う試合か */
  real: boolean;
}

function buildNodes(matches: BracketMatch[], drawSize: number, byes: Set<number>): Map<string, Node> {
  const nodes = new Map<string, Node>();
  const totalRounds = Math.log2(drawSize);
  for (let round = 1; round <= totalRounds; round++) {
    const span = Math.pow(2, round);
    for (const m of matches.filter(x => !isConsolation(x) && x.round === round)) {
      const start = (m.position - 1) * span;
      const half = span / 2;
      const side = (from: number) =>
        Array.from({ length: half }, (_, i) => from + i).filter(i => !byes.has(i));
      const a = side(start);
      const b = side(start + half);
      nodes.set(m.matchId, { match: m, leaves: [...a, ...b], real: a.length > 0 && b.length > 0 });
    }
  }
  return nodes;
}

/**
 * 準決勝より前の実試合に ❶❷… の番号を振る。
 * 並びはドロー表の上から（下にある枠の一番上の位置順、同じなら早い回戦が先）。
 */
export function numberMainMatches(matches: BracketMatch[], drawSize: number, byes: Set<number>): BracketMatch[] {
  const totalRounds = Math.log2(drawSize);
  const nodes = buildNodes(matches, drawSize, byes);
  const targets = [...nodes.values()]
    .filter(n => n.real && n.match.round <= totalRounds - 2)
    .sort((a, b) => (Math.min(...a.leaves) - Math.min(...b.leaves)) || (a.match.round - b.match.round));
  const no = new Map<string, number>();
  targets.forEach((n, i) => no.set(n.match.matchId, i + 1));
  return matches.map(m => {
    if (isConsolation(m)) return m;
    const n = no.get(m.matchId);
    if (n === undefined) {
      if (m.matchNo === undefined) return m;
      const { matchNo: _drop, ...rest } = m;
      return rest;
    }
    return m.matchNo === n ? m : { ...m, matchNo: n };
  });
}

interface ConsolationPlan {
  team1Src: BracketSlotSource;
  team2Src: BracketSlotSource;
  afterRound: number;
  /** 山の中で最初の試合か（番号を振る） */
  numbered: boolean;
}

/**
 * コンソレの組合せを決める（どの試合の敗者同士が当たるか）。
 * 本戦の構造（ドローサイズとBYE位置）だけで決まるので、1位トーナメントの抽選前でも作れる。
 */
function planConsolation(matches: BracketMatch[], drawSize: number, byes: Set<number>): ConsolationPlan[] {
  const totalRounds = Math.log2(drawSize);
  if (totalRounds < 3) return [];
  const nodes = buildNodes(matches, drawSize, byes);
  const semiRound = totalRounds - 1;
  const semis = matches
    .filter(m => !isConsolation(m) && m.round === semiRound)
    .sort((a, b) => a.position - b.position);

  const plans: ConsolationPlan[] = [];
  for (const semi of semis) {
    const semiNode = nodes.get(semi.matchId);
    if (!semiNode) continue;
    const leafSet = new Set(semiNode.leaves);
    // この山の準決勝より前の実試合
    const inHalf = [...nodes.values()]
      .filter(n => n.real && n.match.round < semiRound && n.leaves.every(l => leafSet.has(l)))
      .map(n => n.match)
      .sort((a, b) => (a.round - b.round) || ((a.matchNo ?? 0) - (b.matchNo ?? 0)));
    if (inHalf.length < 2) continue;

    const loser = (m: BracketMatch): BracketSlotSource => ({ matchId: m.matchId, result: 'loser' });
    const byNo = (a: BracketMatch, b: BracketMatch) => (a.matchNo ?? 0) - (b.matchNo ?? 0);
    const rounds = [...new Set(inHalf.map(m => m.round))].sort((a, b) => a - b);
    const byRound = rounds.map(r => inHalf.filter(m => m.round === r));
    const halfPlans: ConsolationPlan[] = [];

    if (byRound.every(list => list.length % 2 === 0)) {
      // 各回戦の敗者同士で当てる（6ペアの山など）
      for (const list of byRound) {
        for (let i = 0; i + 1 < list.length; i += 2) {
          halfPlans.push({ team1Src: loser(list[i]), team2Src: loser(list[i + 1]), afterRound: list[i].round, numbered: false });
        }
      }
    } else if (byRound.length === 2 && byRound[0].length === 1 && byRound[1].length === 2) {
      // 5ペアの山: 1回戦の敗者 vs 1回戦と関係ない2回戦の敗者 → 勝者 vs 残りの2回戦の敗者
      const first = byRound[0][0];
      const fed = byRound[1].find(m => matches.some(x => x.matchId === first.matchId && x.nextMatchId === m.matchId));
      const direct = byRound[1].find(m => m !== fed) ?? byRound[1][1];
      const fedMatch = fed ?? byRound[1][0];
      const [p1, p2] = [first, direct].sort(byNo);
      halfPlans.push({ team1Src: loser(p1), team2Src: loser(p2), afterRound: 2, numbered: false });
      // 2試合目は「勝者」を参照するので後で matchId を入れる（仮に空）
      const winnerFirst = (fedMatch.matchNo ?? 0) > Math.min(p1.matchNo ?? 0, p2.matchNo ?? 0);
      const winSrc: BracketSlotSource = { matchId: '', result: 'winner' };
      halfPlans.push(winnerFirst
        ? { team1Src: winSrc, team2Src: loser(fedMatch), afterRound: 2, numbered: false }
        : { team1Src: loser(fedMatch), team2Src: winSrc, afterRound: 2, numbered: false });
    } else {
      // それ以外: 早い回戦から順に2つずつ当て、余った1つは最初のコンソレの勝者と当てる
      const list = [...inHalf];
      for (let i = 0; i + 1 < list.length; i += 2) {
        halfPlans.push({ team1Src: loser(list[i]), team2Src: loser(list[i + 1]), afterRound: list[i + 1].round, numbered: false });
      }
      if (list.length % 2 === 1) {
        const last = list[list.length - 1];
        halfPlans.push({ team1Src: { matchId: '', result: 'winner' }, team2Src: loser(last), afterRound: last.round, numbered: false });
      }
    }
    if (halfPlans.length > 0) halfPlans[0].numbered = true;
    plans.push(...halfPlans);
  }
  return plans;
}

/**
 * 本戦の構造からコンソレの試合を作り、本戦に番号を振った試合一覧を返す。
 * enabled=false ならコンソレを取り除いて本戦だけにする。
 * 既にあるコンソレの結果は、同じ試合（同じ出どころ・同じペア）なら引き継ぐ。
 */
export function applyConsolation(bracket: PlacementBracket, enabled: boolean): PlacementBracket {
  const byes = resolveByePositions(bracket);
  const main = numberMainMatches(mainMatches(bracket.matches), bracket.drawSize, byes);
  if (!enabled) return { ...bracket, matches: main, consolation: false };

  const oldCons = bracket.matches.filter(isConsolation);
  const plans = planConsolation(main, bracket.drawSize, byes);
  const numbered = main.filter(m => m.matchNo !== undefined).length;

  // 山ごとの先頭に番号を振る（例: 左の山 ❽、右の山 ❾）
  let nextNo = numbered + 1;
  const ids = plans.map((_, i) => `bracket-${bracket.category}-C${i + 1}`);
  const consNo = plans.map(p => (p.numbered ? nextNo++ : undefined));
  // 「勝者」参照（matchId 未設定）は同じ山の1つ目のコンソレを指す
  let headIdx = 0;
  const resolved = plans.map((p, i) => {
    if (p.numbered) headIdx = i;
    const fix = (s: BracketSlotSource) => (s.matchId === '' ? { matchId: ids[headIdx], result: s.result } : s);
    return { ...p, team1Src: fix(p.team1Src), team2Src: fix(p.team2Src) };
  });

  const noOf = (matchId: string): number | undefined =>
    main.find(m => m.matchId === matchId)?.matchNo ?? consNo[ids.indexOf(matchId)];
  const srcLabel = (s: BracketSlotSource) => {
    const n = noOf(s.matchId);
    return `${n !== undefined ? blackCircled(n) : '?'}${s.result === 'winner' ? '勝者' : '敗者'}`;
  };

  const cons: BracketMatch[] = resolved.map((p, i) => {
    const id = ids[i];
    const prev = oldCons.find(c => c.matchId === id
      && c.team1Src?.matchId === p.team1Src.matchId && c.team1Src?.result === p.team1Src.result
      && c.team2Src?.matchId === p.team2Src.matchId && c.team2Src?.result === p.team2Src.result);
    const base: BracketMatch = prev ?? {
      matchId: id, category: bracket.category, round: 0, position: i + 1,
      team1Id: null, team2Id: null, team1Name: '', team2Name: '', team1League: '', team2League: '',
      score1: null, score2: null, tiebreakScore: null, winnerId: null,
      status: 'waiting', isBye: false, nextMatchId: null, nextSlot: null,
    };
    const m: BracketMatch = {
      ...base,
      round: 0, position: i + 1, kind: 'consolation',
      team1Src: p.team1Src, team2Src: p.team2Src,
      consolationLabel: `${srcLabel(p.team1Src)}-${srcLabel(p.team2Src)}`,
      consolationAfterRound: p.afterRound,
    };
    if (consNo[i] !== undefined) m.matchNo = consNo[i];
    else delete m.matchNo;
    return m;
  });

  return syncConsolation({ ...bracket, matches: [...main, ...cons], consolation: true });
}

/**
 * コンソレの各枠に、出どころの試合の勝者／敗者を入れる。
 * 本戦のスコアが修正されてペアが変わった場合は、そのコンソレの結果を消して組み直す。
 */
export function syncConsolation(bracket: PlacementBracket): PlacementBracket {
  if (!bracket.matches.some(isConsolation)) return bracket;
  const byId = new Map(bracket.matches.map(m => [m.matchId, m]));
  let changed = false;

  const pick = (src: BracketSlotSource | undefined) => {
    if (!src) return null;
    const m = byId.get(src.matchId);
    if (!m || m.status !== 'finished' || !m.winnerId || !m.team1Id || !m.team2Id) return null;
    const winIs1 = m.winnerId === m.team1Id;
    const take1 = src.result === 'winner' ? winIs1 : !winIs1;
    return take1
      ? { id: m.team1Id, name: m.team1Name, league: m.team1League }
      : { id: m.team2Id, name: m.team2Name, league: m.team2League };
  };

  // コンソレ同士の参照（勝者）があるので、並び順に処理する
  const out = bracket.matches.map(m => m);
  for (let i = 0; i < out.length; i++) {
    const m = out[i];
    if (!isConsolation(m)) continue;
    const t1 = pick(m.team1Src);
    const t2 = pick(m.team2Src);
    const id1 = t1?.id ?? null;
    const id2 = t2?.id ?? null;
    if (id1 === m.team1Id && id2 === m.team2Id) {
      // ペアは同じ。両方そろったのに待機のままなら控えに出す
      if (id1 && id2 && m.status === 'waiting') {
        out[i] = { ...m, status: 'ready' };
        byId.set(m.matchId, out[i]);
        changed = true;
      }
      continue;
    }
    const next: BracketMatch = {
      ...m,
      team1Id: id1, team1Name: t1?.name ?? '', team1League: t1?.league ?? '',
      team2Id: id2, team2Name: t2?.name ?? '', team2League: t2?.league ?? '',
      score1: null, score2: null, tiebreakScore: null, winnerId: null,
      status: id1 && id2 ? 'ready' : 'waiting',
    };
    out[i] = next;
    byId.set(m.matchId, next);
    changed = true;
  }
  return changed ? { ...bracket, matches: out } : bracket;
}

/** 全ブラケットのコンソレを同期 */
export function syncAllConsolation(brackets: PlacementBracket[]): PlacementBracket[] {
  let changed = false;
  const out = brackets.map(b => {
    const s = syncConsolation(b);
    if (s !== b) changed = true;
    return s;
  });
  return changed ? out : brackets;
}

/** 大会ルールの文面からコンソレを行うか判定 */
export function rulesMentionConsolation(rules: string[] | undefined): boolean {
  return !!rules?.some(r => /コンソレ/.test(r));
}

/** 控えリスト・コール等に出す回戦名 */
export function bracketMatchRoundLabel(m: BracketMatch, totalRounds: number): string {
  if (isConsolation(m)) return m.matchNo !== undefined ? `コンソレ${blackCircled(m.matchNo)}` : 'コンソレ';
  const fromFinal = totalRounds - m.round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${m.round}回戦`;
}
