import type { TeamLeague, TeamLeagueStanding, MatchFormat } from './types';
import { resolveClubPromotionStatus } from './teamLogic';
import { buildResultFileName, leagueDivisionLabel } from './resultFileName';
import { COL, drawResultFrame, drawResultHeader, promotionBadgeStyle } from '../draw/resultCanvasKit';

// =============================================
// リーグ結果「順位表サマリー」画像
//
// 総当たり詳細表とは別に、順位・チーム名・勝敗・ゲーム率・昇降格だけを
// 大きく一覧表示する見やすいサマリー画像を生成する。
// ヘッダー（赤い四角＋リーグ名・大会名・会場バッジ）とフッター（TCTAロゴ）の
// 意匠は詳細表と統一する。
// =============================================

function tryLoadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** リーグ順位表サマリーを描画した Canvas から Data URL (JPEG) を生成 */
export async function generateTeamLeagueSummaryDataUrl(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  tournamentName: string,
  _matchFormat?: MatchFormat,
  promotionOverrides: Record<string, string> = {},
  venue?: string,
): Promise<string> {
  const base = import.meta.env.BASE_URL;
  const [tctaLogo, venueLogo, tottoriLogo] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
    tryLoadImage(`${base}logo-tottori-univ.png`),
  ]);

  // 順位で昇順ソート（rank 未確定=0 は末尾へ、勝数で補助ソート）
  const rows = [...standings].sort((a, b) => {
    const ra = a.rank > 0 ? a.rank : 9999;
    const rb = b.rank > 0 ? b.rank : 9999;
    if (ra !== rb) return ra - rb;
    return b.wins - a.wins;
  });

  // 昇降格バッジ（クラブ対抗戦のみ）が1つでもあるかで列の有無を決める
  const promoByTeam = new Map<string, { label: string; kind: string } | null>();
  let hasPromo = false;
  for (const s of rows) {
    const p = resolveClubPromotionStatus(league.leagueId, s.rank, promotionOverrides[s.teamId]);
    promoByTeam.set(s.teamId, p);
    if (p) hasPromo = true;
  }

  // ---- レイアウト定数 ----
  const scale = 2;
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 118; // 見出し + 大会名 + 「順位表」 + 会場ロゴ

  const rankColW = 96;
  const teamColW = 300;
  const recordColW = 150;
  const ratioColW = 140;
  const promoColW = hasPromo ? 132 : 0;
  const tableW = rankColW + teamColW + recordColW + ratioColW + promoColW;

  const colHeaderH = 50;
  const rowH = 66;
  const tableH = colHeaderH + rowH * rows.length;

  // フッター（TCTA横長ロゴ）
  const tctaMaxH = 78;
  const tctaMaxW = Math.min(380, tableW * 0.5);
  let tctaW = 0, tctaH = 0;
  if (tctaLogo) {
    const ratio = tctaLogo.width / tctaLogo.height;
    tctaH = tctaMaxH; tctaW = tctaH * ratio;
    if (tctaW > tctaMaxW) { tctaW = tctaMaxW; tctaH = tctaW / ratio; }
  }
  const footerH = tctaLogo ? tctaH + 14 : 24;

  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘルパー ----
  const drawText = (
    text: string, x: number, y: number, size: number,
    align: CanvasTextAlign = 'center', color: string = COL.gray800,
    weight: 'normal' | 'medium' | 'bold' | 'black' = 'normal', maxWidth?: number,
  ) => {
    const weightMap = { normal: '500', medium: '600', bold: '700', black: '900' };
    ctx.fillStyle = color;
    ctx.font = `${weightMap[weight]} ${size}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (maxWidth) ctx.fillText(text, x, y, maxWidth); else ctx.fillText(text, x, y);
  };

  const drawRoundRect = (
    x: number, y: number, w: number, h: number, r: number,
    fill?: string | CanvasGradient, stroke?: string, strokeW = 1,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  };

  // 数字（大）＋ラベル（小）を下揃えで中央配置。戻り値は使わない。
  const drawNumWithLabel = (
    parts: { num: string; label: string }[], centerX: number, centerY: number,
    numPx: number, labelPx: number, numColor: string, labelColor: string, gap = 3,
  ) => {
    const numFont = `900 ${numPx}px "Inter", "Helvetica Neue", sans-serif`;
    const labelFont = `700 ${labelPx}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    let total = 0;
    for (const p of parts) {
      ctx.font = numFont; total += ctx.measureText(p.num).width;
      ctx.font = labelFont; total += ctx.measureText(p.label).width;
      total += gap;
    }
    let cx = centerX - total / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const baselineY = centerY + numPx * 0.34;
    for (const p of parts) {
      ctx.fillStyle = numColor; ctx.font = numFont;
      ctx.fillText(p.num, cx, baselineY); cx += ctx.measureText(p.num).width;
      ctx.fillStyle = labelColor; ctx.font = labelFont;
      ctx.fillText(p.label, cx, baselineY); cx += ctx.measureText(p.label).width + gap;
    }
  };

  // ---- ヘッダー（詳細表と統一：赤い四角＋墨の見出し）----
  drawResultHeader(ctx, {
    title: leagueDivisionLabel(league.leagueId.trim()),
    tournamentName,
    venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos: { tcta: tctaLogo, venue: venueLogo, tottori: tottoriLogo },
    subtitle: '順位表',
    titlePx: 56,
  });

  // ---- 表枠（影付き）----
  const tableX = paddingX;
  const tableY = paddingY + headerH;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  drawRoundRect(tableX, tableY, tableW, tableH, 18, COL.white);
  ctx.restore();

  // 列ヘッダー背景（角丸マスク + 白〜淡いグレー）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tableX + 18, tableY);
  ctx.arcTo(tableX + tableW, tableY, tableX + tableW, tableY + colHeaderH, 18);
  ctx.arcTo(tableX + tableW, tableY + colHeaderH, tableX, tableY + colHeaderH, 0);
  ctx.arcTo(tableX, tableY + colHeaderH, tableX, tableY, 0);
  ctx.arcTo(tableX, tableY, tableX + tableW, tableY, 18);
  ctx.clip();
  const headGrad = ctx.createLinearGradient(tableX, tableY, tableX, tableY + colHeaderH);
  headGrad.addColorStop(0, COL.white); headGrad.addColorStop(1, COL.gray100);
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(tableX, tableY, tableW, 1.5);
  ctx.restore();

  // 列ヘッダー下の強調ライン（差し色の赤）
  ctx.strokeStyle = COL.red500; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(tableX, tableY + colHeaderH); ctx.lineTo(tableX + tableW, tableY + colHeaderH); ctx.stroke();

  // 列ヘッダー テキスト
  const thColor = COL.gray800;
  const xRank = tableX;
  const xTeam = xRank + rankColW;
  const xRecord = xTeam + teamColW;
  const xRatio = xRecord + recordColW;
  const xPromo = xRatio + ratioColW;
  drawText('順位', xRank + rankColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, 'black');
  drawText('チーム', xTeam + 16, tableY + colHeaderH / 2, 13, 'left', thColor, 'black');
  drawText('勝敗', xRecord + recordColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, 'black');
  drawText('ゲーム率', xRatio + ratioColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, 'black');
  if (hasPromo) drawText('昇降格', xPromo + promoColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, 'black');

  // ---- 各行 ----
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i];
    const rowTop = tableY + colHeaderH + rowH * i;
    const cy = rowTop + rowH / 2;
    // 行背景（1位だけ淡い赤、その他はゼブラ）
    if (s.rank === 1) {
      const g = ctx.createLinearGradient(tableX, rowTop, tableX + tableW, rowTop);
      g.addColorStop(0, COL.red50); g.addColorStop(1, COL.white);
      ctx.fillStyle = g;
      ctx.fillRect(tableX + 1, rowTop + 1, tableW - 2, rowH - 1);
    } else if (i % 2 === 1) {
      ctx.fillStyle = COL.gray50;
      ctx.fillRect(tableX + 1, rowTop + 1, tableW - 2, rowH - 1);
    }

    // 行境界線
    if (i > 0) {
      ctx.strokeStyle = COL.gray200; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tableX + 8, rowTop); ctx.lineTo(tableX + tableW - 8, rowTop); ctx.stroke();
    }

    // 順位（バッジは付けず、数字＋「位」だけで表示する）
    if (s.rank > 0) {
      drawNumWithLabel([{ num: String(s.rank), label: '位' }], xRank + rankColW / 2, cy, 34, 14,
        s.rank === 1 ? COL.gray900 : COL.gray800, COL.gray500);
    } else {
      drawText('-', xRank + rankColW / 2, cy, 20, 'center', COL.gray300, 'normal');
    }

    // チーム名
    drawText(s.teamName, xTeam + 16, cy, 26, 'left', COL.gray900, 'black', teamColW - 28);

    // 勝敗
    drawNumWithLabel(
      [{ num: String(s.wins), label: '勝' }, { num: String(s.losses), label: '敗' }],
      xRecord + recordColW / 2, cy, 30, 15, COL.gray800, COL.gray500, 5,
    );

    // ゲーム率
    const ratio = (s.gamesWon + s.gamesLost) === 0 ? 0 : s.gamesWon / (s.gamesWon + s.gamesLost);
    drawText(ratio.toFixed(3), xRatio + ratioColW / 2, cy, 26, 'center', COL.gray700, 'bold');

    // 昇降格バッジ
    if (hasPromo) {
      const promo = promoByTeam.get(s.teamId);
      if (promo) {
        const badgeStyle = promotionBadgeStyle(promo.kind);
        ctx.font = '800 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        const txtW = ctx.measureText(promo.label).width;
        const padX = 12;
        const bw = Math.min(promoColW - 12, txtW + padX * 2);
        const bh = 30;
        const bx = xPromo + (promoColW - bw) / 2;
        const by = cy - bh / 2;
        drawRoundRect(bx, by, bw, bh, bh / 2, badgeStyle.bg, badgeStyle.border, 1.5);
        ctx.fillStyle = badgeStyle.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.fillText(promo.label, bx + bw / 2, by + bh / 2 + 0.5);
      }
    }
  }

  // 列区切り縦線
  ctx.strokeStyle = COL.gray200; ctx.lineWidth = 1;
  for (const x of [xTeam, xRecord, xRatio, ...(hasPromo ? [xPromo] : [])]) {
    ctx.beginPath(); ctx.moveTo(x, tableY + colHeaderH); ctx.lineTo(x, tableY + tableH); ctx.stroke();
  }

  // 表の外枠（ブランド赤の二重線）
  drawResultFrame(ctx, tableX, tableY, tableW, tableH, 18);

  // フッター: TCTAロゴ
  if (tctaLogo) {
    const logoX = paddingX + tableW - tctaW;
    const logoY = tableY + tableH + 8;
    ctx.drawImage(tctaLogo, logoX, logoY, tctaW, tctaH);
  }

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Canvas to Blob failed')); return; }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.95);
  });
}

/** リーグ順位表サマリーの推奨ダウンロードファイル名 */
export function summaryResultFileName(tournamentName: string, leagueId: string): string {
  return buildResultFileName(tournamentName, `${leagueDivisionLabel(leagueId)}順位表`);
}
