// =============================================
// 結果画像ヘッダーの会場表示
//
// 通常は会場ロゴ (logo-venue.png) を右上に描画する。
// ただし会場が「鳥取大学」の場合は、鳥取大学ロゴ
// (logo-tottori-univ.png) ＋「鳥取大学テニスコート」の
// テキストを表示する。
//
// ※ logo-tottori-univ.png が未配置でもテキストは表示される
//   （画像が用意され次第、自動的にロゴも表示される）。
// =============================================

/** 会場が鳥取大学かどうか */
export function isTottoriUniv(venue?: string): boolean {
  return !!venue && venue.includes('鳥取大学');
}

interface VenueBadgeOptions {
  /** 会場名（tournamentInfo.venue） */
  venue?: string;
  /** ヘッダー右端の基準X座標 */
  rightX: number;
  /** 会場ロゴ上端のY座標 */
  topY: number;
  /** 通常時の会場ロゴ */
  venueLogo: HTMLImageElement | null;
  /** 鳥取大学用ロゴ */
  tottoriLogo: HTMLImageElement | null;
}

/**
 * ヘッダー右上に会場表示を描画する。
 * 鳥取大学の場合は専用ロゴ＋テキスト、それ以外は従来の会場ロゴ。
 */
export function drawVenueBadge(ctx: CanvasRenderingContext2D, opts: VenueBadgeOptions): void {
  const { venue, rightX, topY, venueLogo, tottoriLogo } = opts;

  ctx.save();
  if (isTottoriUniv(venue)) {
    // 鳥取大学ロゴ（用意されていれば描画）＋「鳥取大学テニスコート」
    let logoBottom = topY;
    if (tottoriLogo) {
      const maxH = 32;
      const maxW = 230;
      const ratio = tottoriLogo.width / tottoriLogo.height;
      let h = maxH;
      let w = h * ratio;
      if (w > maxW) { w = maxW; h = w / ratio; }
      const startY = topY - 6;
      ctx.drawImage(tottoriLogo, rightX - w, startY, w, h);
      logoBottom = startY + h;
    }
    ctx.font = '700 12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#334155'; // slate-700
    ctx.fillText('鳥取大学テニスコート', rightX, tottoriLogo ? logoBottom + 4 : topY + 8);
  } else if (venueLogo) {
    // 従来の会場ロゴ
    const venueMaxH = 48;
    const venueMaxW = 230;
    const vRatio = venueLogo.width / venueLogo.height;
    let vH = venueMaxH;
    let vW = vH * vRatio;
    if (vW > venueMaxW) { vW = venueMaxW; vH = vW / vRatio; }
    ctx.drawImage(venueLogo, rightX - vW, topY, vW, vH);
  }
  ctx.restore();
}
