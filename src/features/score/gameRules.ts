/**
 * ゲームルール文（回戦別の記述を含む場合あり）から、指定回戦に適用される
 * ゲーム数を求めるユーティリティ。
 *
 * 課題:
 * - ルール文が「1～3回戦 8ゲームマッチ… 準々決勝以降 6ゲームマッチ…」のように
 *   複数回戦分を1つの文にまとめて記載されている場合、先頭の「Nゲームマッチ」を
 *   そのまま採用すると、後半回戦（準々決勝以降）でも 8 を使うなど誤判定になる。
 * - 逆に、全角数字「８ゲームマッチ」で入力されていると /\d/ にマッチせず、
 *   次の半角「6ゲームマッチ」を拾ってしまい、1回戦なのに 6 ゲーム扱いになる
 *   （＝熱中症パターンでもないのに 6 ゲーム判定される不具合）。
 *
 * そこで全角数字・波ダッシュを正規化した上で、各「Nゲームマッチ」の直前にある
 * 回戦スコープ指定（「A～B回戦」「準々決勝以降」等）を見て、対象回戦に一致する
 * ものを採用する。
 */

/** 全角数字→半角、波ダッシュ(〜 U+301C)→全角チルダ(～ U+FF5E)に正規化 */
function normalizeJp(s: string): string {
  return s
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[〜～]/g, '～');
}

/**
 * ルール文から先頭の「Nゲームマッチ」のゲーム数を抽出する（全角数字も対応）。
 * 回戦情報が無い場面のフォールバック用。
 */
export function extractGamesFromText(gameRuleText: string | undefined | null): number | null {
  if (!gameRuleText) return null;
  const m = normalizeJp(gameRuleText).match(/(\d+)\s*ゲームマッチ/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * 指定回戦に適用されるゲーム数を返す。判定不能なら null。
 * @param gameRuleText ルール文（回戦別記述を含む場合あり）
 * @param round 対象回戦（1始まり）
 * @param totalRounds その種目の総回戦数（決勝＝totalRounds）
 */
export function resolveRequiredGames(
  gameRuleText: string | undefined | null,
  round: number,
  totalRounds: number,
): number | null {
  if (!gameRuleText) return null;
  const t = normalizeJp(gameRuleText);

  const gameMatches = [...t.matchAll(/(\d+)\s*ゲームマッチ/g)];
  if (gameMatches.length === 0) return null;
  if (gameMatches.length === 1) return parseInt(gameMatches[0][1], 10);

  // 回戦スコープマーカー（出現位置 + 対象回戦を含むか判定する関数）
  const markers: { index: number; covers: (r: number) => boolean }[] = [];
  for (const m of t.matchAll(/(\d+)～(\d+)回戦/g)) {
    const from = parseInt(m[1], 10), to = parseInt(m[2], 10);
    markers.push({ index: m.index ?? 0, covers: r => r >= from && r <= to });
  }
  for (const m of t.matchAll(/準々決勝以降/g)) {
    markers.push({ index: m.index ?? 0, covers: r => r >= totalRounds - 2 });
  }
  for (const m of t.matchAll(/準決勝以降/g)) {
    markers.push({ index: m.index ?? 0, covers: r => r >= totalRounds - 1 });
  }
  for (const m of t.matchAll(/(\d+)回戦以降/g)) {
    const n = parseInt(m[1], 10);
    markers.push({ index: m.index ?? 0, covers: r => r >= n });
  }

  // 各「Nゲームマッチ」について、直前（最も近い前方）の回戦マーカーのスコープを採用し、
  // 対象回戦を含むものを返す。
  for (const gm of gameMatches) {
    const pos = gm.index ?? 0;
    const preceding = markers
      .filter(mk => mk.index < pos)
      .sort((a, b) => b.index - a.index)[0];
    if (preceding && preceding.covers(round)) {
      return parseInt(gm[1], 10);
    }
  }

  // スコープ判定できない場合は先頭の数値にフォールバック（正規化済みなので全角でも拾える）
  return parseInt(gameMatches[0][1], 10);
}
