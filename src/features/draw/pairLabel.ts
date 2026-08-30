// =============================================================================
// ダブルスの「A / B」表記を1人ずつに分けるための共通処理
//
// エントリー名は composeEntryLabel（playerNameEdit.ts）で
//   氏名   : 「山田 太郎 / 鈴木 次郎」
//   所属   : 「A社」（2人とも同じ）／「A社 / B高」（別々）
// のように組み立てられている。ドロー表示ではこれを1人ずつの行に分けて出す。
// =============================================================================

/** ダブルスの「A / B」表記を1人ずつに分ける（分けられなければ元の1件） */
export function pairLines(text: string): string[] {
  const parts = (text || '').split(/\s*[/／・]\s*/).map(t => t.trim()).filter(Boolean);
  return parts.length === 2 ? parts : [text];
}

/**
 * ダブルスの氏名・所属を、表示用に1人ずつの行へ分ける。
 * - 氏名が2人分に分けられないときは分割しない（names.length === 1）
 * - 所属が1つだけのときは2人共通なので1件のまま返す（表示側で縦中央に置く）
 */
export function pairDisplayLines(
  name: string,
  affiliation: string,
): { names: string[]; affiliations: string[] } {
  const names = pairLines(name);
  const affiliations = affiliation ? pairLines(affiliation) : [];
  // 氏名が1行のときは所属も分けない（対応が取れないため）
  if (names.length < 2) {
    return { names, affiliations: affiliation ? [affiliation] : [] };
  }
  return { names, affiliations };
}
