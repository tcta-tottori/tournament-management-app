/**
 * コート名から物理コート番号を抽出する
 * 範囲表記（例: "5～8番コート"）をすべての番号に展開する
 * 個別表記（例: "5・6・7・8コート"）はそのまま抽出する
 */
export function expandCourtNumbers(courtName: string | undefined | null): number[] {
  const courtStr = (courtName || '').replace(/[\s\u3000]+/g, '');
  if (!courtStr) return [];

  // 範囲表記をチェック: "5～8", "5〜8", "5-8", "5－8"
  const rangeMatch = courtStr.match(/(\d+)[～〜\-－](\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    const nums: number[] = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      nums.push(i);
    }
    return nums;
  }

  // 個別番号を抽出
  const matches = courtStr.match(/\d+/g);
  return matches ? matches.map(n => parseInt(n)) : [];
}
