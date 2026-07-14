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
    // 鳥取大学ロゴ（マーク）を「鳥取大学テニスコート」テキストの左側に横並びで配置。
    // ［ロゴ］ 鳥取大学テニスコート  の並びで、全体を rightX に右揃えする。
    const label = '鳥取大学テニスコート';
    const fontPx = 16;
    ctx.font = `700 ${fontPx}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(label).width;

    // ロゴ寸法（テキストより少し高め）
    let logoW = 0;
    let logoH = 0;
    if (tottoriLogo) {
      logoH = 30;
      logoW = logoH * (tottoriLogo.width / tottoriLogo.height);
    }
    const gap = tottoriLogo ? 8 : 0;
    const totalW = logoW + gap + textW;
    const startX = rightX - totalW;
    // ロゴ／テキストの縦中心。従来テキスト位置（topY 付近）に合わせて中央寄せ。
    const centerY = topY + logoH / 2;

    if (tottoriLogo) {
      ctx.drawImage(tottoriLogo, startX, centerY - logoH / 2, logoW, logoH);
    }
    ctx.fillStyle = '#334155'; // slate-700
    ctx.fillText(label, startX + logoW + gap, centerY);
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
