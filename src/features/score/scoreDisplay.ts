// =============================================================================
// スコア表示の共通ヘルパー
//
// DBに入るスコア文字列（"8-4" / "9-8(5)" / "6-4 6-7(3) [10-5]" / "4-6 Ret" / "W.O"）を
// 上側（player1）・下側（player2）それぞれの表示文字列に分解する。
//
// 表示ルールは結果画像（DrawResultExporter）と揃える:
//   - タイブレークの得点は「そのセットを落とした側」に添える（7-6(4) → 勝者 7 / 敗者 6(4)）
//   - Ret / W.O は棄権した側（＝負けた側）に添える注記として別に返す
// =============================================================================

export interface ScoreParts {
  /** player1（ドロー上側）のゲーム表示。例: "6" / "6 3" / "6(4)" */
  p1: string;
  /** player2（ドロー下側）のゲーム表示 */
  p2: string;
  /** セットごとの表示（"6-4 6-7(3)" のように組で並べたいとき用） */
  sets: { p1: string; p2: string; stb?: boolean }[];
  /** Ret / W.O の注記（無ければ空文字）。負けた側に添えて表示する。 */
  note: string;
  /** ゲームスコアが1つでもあるか（"W.O" のみのときは false） */
  hasGames: boolean;
}

/** 棄権表記を "Ret" / "W.O" に正規化する */
function normalizeNote(raw: string): string {
  return /ret/i.test(raw) ? 'Ret' : 'W.O';
}

/**
 * スコア文字列を上側・下側の表示に分解する。
 * 解釈できない文字列のときは null を返す（呼び出し側で素のまま表示する）。
 */
export function parseScoreParts(score: string | null | undefined): ScoreParts | null {
  if (!score) return null;
  const raw = score.trim();
  if (!raw) return null;

  // 末尾（または単独）の Ret / W.O を取り出す
  let note = '';
  const rest = raw.replace(/(?:^|\s)(Ret\.?|W\.?\s?O\.?)\s*$/i, (_m, g1: string) => {
    note = normalizeNote(g1);
    return '';
  }).trim();

  const p1Parts: string[] = [];
  const p2Parts: string[] = [];
  const sets: { p1: string; p2: string; stb?: boolean }[] = [];
  for (const part of rest.split(/\s+/).filter(Boolean)) {
    // スーパータイブレーク [10-5]
    const stb = part.match(/^\[(\d+)\s*-\s*(\d+)\]$/);
    if (stb) {
      p1Parts.push(`[${stb[1]}]`);
      p2Parts.push(`[${stb[2]}]`);
      sets.push({ p1: stb[1], p2: stb[2], stb: true });
      continue;
    }
    // 通常のセット 6-4 / 7-6(4)
    const set = part.match(/^(\d+)\s*-\s*(\d+)(?:\s*\((\d+)\))?$/);
    if (!set) continue;
    const [, g1, g2, tb] = set;
    // タイブレークの得点は落とした側へ添える
    const tbOnP1 = tb && parseInt(g1) < parseInt(g2);
    const tbOnP2 = tb && parseInt(g2) < parseInt(g1);
    const v1 = tbOnP1 ? `${g1}(${tb})` : g1;
    const v2 = tbOnP2 ? `${g2}(${tb})` : g2;
    p1Parts.push(v1);
    p2Parts.push(v2);
    sets.push({ p1: v1, p2: v2 });
  }

  if (p1Parts.length === 0 && !note) return null;
  return {
    p1: p1Parts.join(' '),
    p2: p2Parts.join(' '),
    sets,
    note,
    hasGames: p1Parts.length > 0,
  };
}

/**
 * 片側視点のスコア表示（"6-4" のように自分-相手の順）を作る。
 * リーグ星取表など、行の選手を主語にして表示する場所で使う。
 */
export function sideScoreText(
  score: string | null | undefined,
  /** 主語となる側が player1 か（false なら player2 視点で左右を入れ替える） */
  isPlayer1: boolean,
): string | null {
  const parts = parseScoreParts(score);
  if (!parts) return null;
  const games = parts.sets
    .map(s => {
      const pair = isPlayer1 ? `${s.p1}-${s.p2}` : `${s.p2}-${s.p1}`;
      return s.stb ? `[${pair}]` : pair;
    })
    .join(' ');
  return [games, parts.note].filter(Boolean).join(' ');
}
