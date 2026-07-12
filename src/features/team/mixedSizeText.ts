// =============================================
// バッジ用の「数字・英字は大きく、その他（日本語等）は小さく」描画ヘルパー
// 例）「女子1部」→ 女子(小) 1(大) 部(小)
//     「予選会 1位・2位決定戦」→ 1,2 だけ大きく、他は小さく
// =============================================

const FONT_FAMILY = '"Inter", "Hiragino Sans", "Yu Gothic", sans-serif';

export interface SizedRun {
  text: string;
  big: boolean;
}

/** テキストを「数字/英字の連続(big)」と「その他の連続(small)」に分割 */
export function splitBigSmall(text: string): SizedRun[] {
  const runs: SizedRun[] = [];
  let cur = '';
  let curBig: boolean | null = null;
  for (const ch of text) {
    const big = /[0-9A-Za-z]/.test(ch);
    if (curBig === null || big === curBig) {
      cur += ch;
      curBig = big;
    } else {
      runs.push({ text: cur, big: curBig });
      cur = ch;
      curBig = big;
    }
  }
  if (cur) runs.push({ text: cur, big: curBig! });
  return runs;
}

const fontOf = (weight: string, px: number) => `${weight} ${px}px ${FONT_FAMILY}`;

/** 混在サイズの合計幅を計測 */
export function measureMixed(
  ctx: CanvasRenderingContext2D,
  runs: SizedRun[],
  bigPx: number,
  smallPx: number,
  bigWeight = '900',
  smallWeight = '700',
): number {
  let w = 0;
  for (const r of runs) {
    ctx.font = fontOf(r.big ? bigWeight : smallWeight, r.big ? bigPx : smallPx);
    w += ctx.measureText(r.text).width;
  }
  return w;
}

/**
 * 混在サイズで左揃え描画（alphabetic ベースラインで下端を揃える）。
 * 事前に ctx.fillStyle を設定しておくこと。
 */
export function drawMixed(
  ctx: CanvasRenderingContext2D,
  runs: SizedRun[],
  startX: number,
  baselineY: number,
  bigPx: number,
  smallPx: number,
  bigWeight = '900',
  smallWeight = '700',
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let cx = startX;
  for (const r of runs) {
    ctx.font = fontOf(r.big ? bigWeight : smallWeight, r.big ? bigPx : smallPx);
    ctx.fillText(r.text, cx, baselineY);
    cx += ctx.measureText(r.text).width;
  }
}
