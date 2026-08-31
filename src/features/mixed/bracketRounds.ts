// =============================================
// 決勝トーナメント表の「表示回戦」ユーティリティ
//
// 回戦が進むほどトーナメント表は対戦相手同士が上下に離れて見にくくなる。
// シングルス大会（CourtBracketPage）と同じく、決着済みの前半の回戦を隠して
// 残りを詰めて表示できるようにするための共通ロジック。
//
// ミックス大会・団体戦のどちらのマッチ型でも使えるよう、必要な項目だけを
// 受け取る構造的な型で定義している。
// =============================================

export interface RoundMatchLike {
  round: number;
  status: string;
  isBye?: boolean;
  team1Id: string | null;
  team2Id: string | null;
}

/** 回戦名（決勝 / 準決勝 / 準々決勝 / ◯回戦） */
export function getBracketRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${round}回戦`;
}

/**
 * その回戦が決着しているか。
 * BYE や片側だけの枠は「行われない試合」なので判定から除く。
 * 実際に行う試合が1つも無い回戦（抽選前で未配置など）は「決着済み」にしない。
 * ここを true にすると、まだ何も始まっていないのに決勝だけの表示になってしまう。
 */
export function isBracketRoundSettled(matches: RoundMatchLike[], round: number): boolean {
  const real = matches.filter(m => m.round === round && !m.isBye && m.team1Id && m.team2Id);
  if (real.length === 0) return false;
  return real.every(m => m.status === 'finished');
}

/**
 * 自動省略する回戦数。
 * 先頭から連続して決着済みの回戦を隠す（最低2列は残す）。
 */
export function autoBracketStartRound(matches: RoundMatchLike[], totalRounds: number): number {
  if (totalRounds < 2) return 0;
  let r = 0;
  while (r < totalRounds - 1 && isBracketRoundSettled(matches, r + 1)) r++;
  return r;
}

/** 短い回戦名（F / SF / QF / ◯R）。絞り込みバーの表示に使う */
export function getShortBracketRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return 'F';
  if (fromFinal === 1) return 'SF';
  if (fromFinal === 2) return 'QF';
  return `${round}R`;
}

/**
 * 絞り込みバーに出すラベル（ALL 1R〜 / QF〜 など）。
 * startRound は隠す回戦数なので、先頭に並ぶのは startRound + 1 回戦。
 * 「準々決勝以降」のような長い名前だと文字数でボタンが動くため短い表記にする。
 */
export function startRoundLabel(startRound: number, totalRounds: number): string {
  return startRound === 0
    ? 'ALL 1R〜'
    : `${getShortBracketRoundLabel(startRound + 1, totalRounds)}〜`;
}
