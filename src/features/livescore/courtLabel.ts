// =============================================
// コート名の表示整形
//
// コートは大会データ上「9」のように番号だけで登録されていることが多い。
// スコアボードや配信画面では「9番コート」と読める形にしたいので、
// 表示側でここを通す（データ自体は書き換えない）。
// =============================================

/**
 * コート名を表示用に整える。
 *   「9」「No.9」「9番」 → 「9番コート」
 *   「A」               → 「Aコート」
 *   「Aコート」「第1コート」「センターコート」 → そのまま
 */
export function formatCourtLabel(name: string | null | undefined): string {
  const text = (name || '').trim();
  if (!text) return '';
  // 既に「コート」と入っていれば触らない
  if (text.includes('コート') || /court/i.test(text)) return text;

  const numberOnly = text.match(/^(?:No\.?\s*)?(\d+)\s*番?$/i);
  if (numberOnly) return `${numberOnly[1]}番コート`;

  return `${text}コート`;
}
