// =============================================
// 団体戦 結果画像のダウンロードファイル名
//
// リーグ名/トーナメント名だけだと、別の大会（前期/後期・男子/女子など）で
// 同じ区分名が使われた際にファイル名が衝突する。大会名を接頭辞に含めて
// 一意化する。
// =============================================

/** ファイル名に使えない文字を除去し、空白を整える */
function sanitize(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '') // ファイル名禁止文字
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 大会名を含めた結果画像ファイル名を組み立てる。
 * @param tournamentName 大会名（例: 令和8年度 …クラブ対抗戦（後期・女子））
 * @param label 区分ラベル（例: 「女子予選会Aリーグ結果_団体戦」）
 */
export function buildResultFileName(tournamentName: string | undefined, label: string): string {
  const tn = sanitize(tournamentName || '');
  const body = sanitize(label);
  return (tn ? `${tn}_${body}` : body) + '.jpg';
}
