import type { TeamLeague, TeamLeagueStanding, MatchFormat } from './types';
import { resolveClubPromotionStatus } from './teamLogic';
import { drawVenueBadge } from './venueBadge';
import { buildResultFileName, leagueDivisionLabel } from './resultFileName';
import { splitBigSmall, measureMixed, drawMixed } from './mixedSizeText';

// =============================================
// リーグ結果「順位表サマリー」画像
//
// 総当たり詳細表とは別に、順位・チーム名・勝敗・ゲーム率・昇降格だけを
// 大きく一覧表示する見やすいサマリー画像を生成する。
// ヘッダー（リーグピル・大会名・会場バッジ）とフッター（TCTAロゴ）の
// 意匠は詳細表と統一する。
// =============================================

interface LeagueColor {
  c1: string; c2: string; c3: string; text: string; shadow: string;
}
const LEAGUE_COLORS: LeagueColor[] = [
  { c1: '#60a5fa', c2: '#3b82f6', c3: '#4338ca', text: '#1e3a8a', shadow: 'rgba(30,58,138,0.32)' },
  { c1: '#34d399', c2: '#10b981', c3: '#0f766e', text: '#064e3b', shadow: 'rgba(6,78,59,0.32)' },
  { c1: '#c084fc', c2: '#a855f7', c3: '#7c3aed', text: '#581c87', shadow: 'rgba(88,28,135,0.32)' },
  { c1: '#fb7185', c2: '#f43f5e', c3: '#be185d', text: '#881337', shadow: 'rgba(136,19,55,0.32)' },
  { c1: '#fbbf24', c2: '#f59e0b', c3: '#ea580c', text: '#7c2d12', shadow: 'rgba(124,45,18,0.32)' },
  { c1: '#22d3ee', c2: '#06b6d4', c3: '#0284c7', text: '#0c4a6e', shadow: 'rgba(12,74,110,0.32)' },
  { c1: '#a3e635', c2: '#84cc16', c3: '#16a34a', text: '#14532d', shadow: 'rgba(20,83,45,0.32)' },
  { c1: '#e879f9', c2: '#d946ef', c3: '#9333ea', text: '#581c87', shadow: 'rgba(88,28,135,0.32)' },
];

function getLeagueColorIndex(leagueId: string): number {
  const code = leagueId.trim().toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  if (code < 0 || code >= LEAGUE_COLORS.length) return 0;
  return code;
}

function tryLoadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const COL = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  sky300: '#7dd3fc',
  sky800: '#075985',
  // メダル配色（上位3位）
  medal: [
    { c1: '#fef3c7', c2: '#fde68a', edge: '#f59e0b', text: '#7c2d12' }, // gold
    { c1: '#f8fafc', c2: '#e2e8f0', edge: '#94a3b8', text: '#334155' }, // silver
    { c1: '#ffedd5', c2: '#fed7aa', edge: '#ea580c', text: '#7c2d12' }, // bronze
  ],
};

/** リーグ順位表サマリーを描画した Canvas から Data URL (JPEG) を生成 */
export async function generateTeamLeagueSummaryDataUrl(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  tournamentName: string,
  _matchFormat?: MatchFormat,
  promotionOverrides: Record<string, string> = {},
  venue?: string,
): Promise<string> {
  const lc = LEAGUE_COLORS[getLeagueColorIndex(league.leagueId)];

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
  const headerH = 110;

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

  // 上端アクセントバー
  const topBarGrad = ctx.createLinearGradient(0, 0, totalW, 0);
  topBarGrad.addColorStop(0, '#0ea5e9');
  topBarGrad.addColorStop(0.5, '#8b5cf6');
  topBarGrad.addColorStop(1, '#a855f7');
  ctx.fillStyle = topBarGrad;
  ctx.fillRect(0, 0, totalW, 5);

  // ---- ヘルパー ----
  const drawText = (
    text: string, x: number, y: number, size: number,
    align: CanvasTextAlign = 'center', color = COL.slate800,
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

  // ---- ヘッダー（詳細表と統一）----
  const leagueId = league.leagueId.trim();
  // それ自体で完結する名称（「男子予選会」「◯部」「◯リーグ」など）には "リーグ" を付けない
  const pillText = leagueDivisionLabel(leagueId);
  const pillRuns = splitBigSmall(pillText);
  // 数字/英字の「大」アンカーが無い日本語のみの名称は、全体を大きめに描いて
  // ピル内で間延びしないようにする（レイアウトのバランス調整）。
  const hasBig = pillRuns.some(r => r.big);
  const pillH = 96;
  const pillPadX = hasBig ? 40 : 34;
  const pillX = paddingX;
  const pillY = paddingY + 4;
  let bigPx = 64;
  let smallPx = hasBig ? 30 : 46;
  const maxPillW = Math.min(tableW * 0.5, 560);
  let pillTextW = measureMixed(ctx, pillRuns, bigPx, smallPx, '900', '600');
  if (pillTextW + pillPadX * 2 > maxPillW) {
    const s = Math.max(0.4, (maxPillW - pillPadX * 2) / pillTextW);
    bigPx = Math.round(bigPx * s); smallPx = Math.round(smallPx * s);
    pillTextW = measureMixed(ctx, pillRuns, bigPx, smallPx, '900', '600');
  }
  const pillW = pillTextW + pillPadX * 2;

  ctx.save();
  ctx.shadowColor = lc.shadow; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
  pillGrad.addColorStop(0, lc.c1); pillGrad.addColorStop(0.55, lc.c2); pillGrad.addColorStop(1, lc.c3);
  drawRoundRect(pillX, pillY, pillW, pillH, pillH / 2, pillGrad);
  ctx.restore();
  const innerHL = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH * 0.55);
  innerHL.addColorStop(0, 'rgba(255,255,255,0.28)');
  innerHL.addColorStop(1, 'rgba(255,255,255,0)');
  drawRoundRect(pillX + 2, pillY + 2, pillW - 4, pillH * 0.55, pillH / 2 - 2, innerHL);
  drawRoundRect(pillX + 1.5, pillY + 1.5, pillW - 3, pillH - 3, pillH / 2 - 1.5, undefined, 'rgba(255,255,255,0.4)', 1);
  ctx.fillStyle = COL.white;
  const pillBaselineY = pillY + pillH / 2 + bigPx * 0.34;
  drawMixed(ctx, pillRuns, pillX + (pillW - pillTextW) / 2, pillBaselineY, bigPx, smallPx, '900', '600');

  // 右: 大会名 + 「順位表」ラベル + 会場バッジ
  const headerRightX = paddingX + tableW;
  if (tournamentName) {
    const nameMaxW = Math.max(200, tableW - pillW - 48);
    drawText(tournamentName, headerRightX, paddingY + 30, 22, 'right', COL.slate800, 'bold', nameMaxW);
  }
  drawText('順位表', headerRightX, paddingY + 52, 14, 'right', lc.c3, 'black');
  drawVenueBadge(ctx, { venue, rightX: headerRightX, topY: paddingY + 66, venueLogo, tottoriLogo });

  // ヘッダーと表の間のアクセントライン
  const accentY = paddingY + headerH - 4;
  const accentGrad = ctx.createLinearGradient(paddingX, accentY, paddingX + tableW, accentY);
  accentGrad.addColorStop(0, 'rgba(14, 165, 233, 0)');
  accentGrad.addColorStop(0.2, 'rgba(14, 165, 233, 0.45)');
  accentGrad.addColorStop(0.8, 'rgba(14, 165, 233, 0.45)');
  accentGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.strokeStyle = accentGrad; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(paddingX, accentY); ctx.lineTo(paddingX + tableW, accentY); ctx.stroke();

  // ---- 表枠（影付き）----
  const tableX = paddingX;
  const tableY = paddingY + headerH;
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  drawRoundRect(tableX, tableY, tableW, tableH, 18, COL.white);
  ctx.restore();

  // 列ヘッダー背景（角丸マスク + 水色グラデ）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tableX + 18, tableY);
  ctx.arcTo(tableX + tableW, tableY, tableX + tableW, tableY + colHeaderH, 18);
  ctx.arcTo(tableX + tableW, tableY + colHeaderH, tableX, tableY + colHeaderH, 0);
  ctx.arcTo(tableX, tableY + colHeaderH, tableX, tableY, 0);
  ctx.arcTo(tableX, tableY, tableX + tableW, tableY, 18);
  ctx.clip();
  const headGrad = ctx.createLinearGradient(tableX, tableY, tableX, tableY + colHeaderH);
  headGrad.addColorStop(0, '#ecfeff'); headGrad.addColorStop(0.5, '#e0f2fe'); headGrad.addColorStop(1, '#bae6fd');
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(tableX, tableY, tableW, 1.5);
  ctx.restore();

  // 列ヘッダー下の強調ライン
  const headerLineGrad = ctx.createLinearGradient(tableX, 0, tableX + tableW, 0);
  headerLineGrad.addColorStop(0, '#0ea5e9'); headerLineGrad.addColorStop(0.5, '#8b5cf6'); headerLineGrad.addColorStop(1, '#a855f7');
  ctx.strokeStyle = headerLineGrad; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(tableX, tableY + colHeaderH); ctx.lineTo(tableX + tableW, tableY + colHeaderH); ctx.stroke();

  // 列ヘッダー テキスト
  const thColor = COL.sky800;
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
    const isMedal = s.rank >= 1 && s.rank <= 3;
    const medal = isMedal ? COL.medal[s.rank - 1] : null;

    // 行背景（メダルは淡いグラデ、その他はゼブラ）
    if (medal) {
      const g = ctx.createLinearGradient(tableX, rowTop, tableX + tableW, rowTop);
      g.addColorStop(0, medal.c1); g.addColorStop(1, COL.white);
      ctx.fillStyle = g;
      ctx.fillRect(tableX + 1, rowTop + 1, tableW - 2, rowH - 1);
    } else if (i % 2 === 1) {
      ctx.fillStyle = COL.slate50;
      ctx.fillRect(tableX + 1, rowTop + 1, tableW - 2, rowH - 1);
    }

    // 行境界線
    if (i > 0) {
      ctx.strokeStyle = COL.slate200; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tableX + 8, rowTop); ctx.lineTo(tableX + tableW - 8, rowTop); ctx.stroke();
    }

    // 順位（メダルは丸チップ、その他は数字＋位）
    if (medal) {
      const chipR = 22;
      const chipX = xRank + rankColW / 2;
      const chipY = cy;
      const cg = ctx.createLinearGradient(chipX, chipY - chipR, chipX, chipY + chipR);
      cg.addColorStop(0, medal.c1); cg.addColorStop(1, medal.c2);
      ctx.beginPath(); ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = medal.edge; ctx.stroke();
      drawText(String(s.rank), chipX, chipY - 1, 26, 'center', medal.text, 'black');
    } else if (s.rank > 0) {
      drawNumWithLabel([{ num: String(s.rank), label: '位' }], xRank + rankColW / 2, cy, 34, 14, COL.slate800, COL.slate500);
    } else {
      drawText('-', xRank + rankColW / 2, cy, 20, 'center', COL.slate300, 'normal');
    }

    // チーム名
    drawText(s.teamName, xTeam + 16, cy, 26, 'left', COL.slate900, 'black', teamColW - 28);

    // 勝敗
    drawNumWithLabel(
      [{ num: String(s.wins), label: '勝' }, { num: String(s.losses), label: '敗' }],
      xRecord + recordColW / 2, cy, 30, 15, COL.slate800, COL.slate500, 5,
    );

    // ゲーム率
    const ratio = (s.gamesWon + s.gamesLost) === 0 ? 0 : s.gamesWon / (s.gamesWon + s.gamesLost);
    drawText(ratio.toFixed(3), xRatio + ratioColW / 2, cy, 26, 'center', COL.slate700, 'bold');

    // 昇降格バッジ
    if (hasPromo) {
      const promo = promoByTeam.get(s.teamId);
      if (promo) {
        const badgeColor =
          promo.kind === 'champion' ? '#f59e0b' :
          promo.kind === 'promote' ? '#059669' :
          promo.kind === 'relegate' ? '#e11d48' : '#64748b';
        ctx.font = '800 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        const txtW = ctx.measureText(promo.label).width;
        const padX = 12;
        const bw = Math.min(promoColW - 12, txtW + padX * 2);
        const bh = 30;
        const bx = xPromo + (promoColW - bw) / 2;
        const by = cy - bh / 2;
        drawRoundRect(bx, by, bw, bh, bh / 2, badgeColor);
        ctx.fillStyle = COL.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.fillText(promo.label, bx + bw / 2, by + bh / 2 + 0.5);
      }
    }
  }

  // 列区切り縦線
  ctx.strokeStyle = COL.slate200; ctx.lineWidth = 1;
  for (const x of [xTeam, xRecord, xRatio, ...(hasPromo ? [xPromo] : [])]) {
    ctx.beginPath(); ctx.moveTo(x, tableY + colHeaderH); ctx.lineTo(x, tableY + tableH); ctx.stroke();
  }

  // 表の外枠
  drawRoundRect(tableX, tableY, tableW, tableH, 18, undefined, COL.sky300, 1.5);
  drawRoundRect(tableX + 1.2, tableY + 1.2, tableW - 2.4, tableH - 2.4, 17, undefined, 'rgba(255,255,255,0.6)', 1);

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
