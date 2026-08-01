// =============================================
// 結果画像（Canvas）共通スタイルキット
//
// 団体戦の結果画像（exportTeamBracketResultJpeg）と
// 同じ見た目・同じヘッダー構成を個人戦の結果画像でも使えるように、
// 配色・角丸カード・ヘッダー（大会名＋会場）・フッター（協会ロゴ）を
// ここにまとめている。
// =============================================
import { drawVenueBadge } from '../team/venueBadge';
import { splitBigSmall, measureMixed, drawMixed } from '../team/mixedSizeText';

/** 結果画像共通のフォントファミリー（団体戦と同じ） */
export const FF = '"Inter", "Hiragino Sans", "Yu Gothic", sans-serif';

/** 結果画像共通のカラーパレット（団体戦と同じ水色ベース） */
export const COL = {
  white: '#ffffff',
  sky50: '#f0f9ff',
  sky100: '#e0f2fe',
  sky200: '#bae6fd',
  sky300: '#7dd3fc',
  sky400: '#38bdf8',
  sky500: '#0ea5e9',
  sky600: '#0284c7',
  sky700: '#0369a1',
  sky800: '#075985',
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
  /** 勝ち上がりライン（トーナメント表の慣習に合わせた赤） */
  win: '#dc2626',
  winSoft: '#fecaca',
  gold1: '#fbbf24',
  gold2: '#f59e0b',
  gold3: '#b45309',
  goldText: '#7c2d12',
} as const;

export type FontWeight = 'normal' | 'medium' | 'bold' | 'black';

const WEIGHT_MAP: Record<FontWeight, string> = {
  normal: '500',
  medium: '600',
  bold: '700',
  black: '900',
};

/** 数値を範囲内に丸める */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** フォント指定文字列を組み立てる */
export function fontOf(weight: FontWeight, px: number): string {
  return `${WEIGHT_MAP[weight]} ${px}px ${FF}`;
}

/** テキストを描画する（団体戦の drawText と同じシグネチャ） */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign = 'center',
  color: string = COL.slate800,
  weight: FontWeight = 'normal',
  maxWidth?: number,
): void {
  ctx.fillStyle = color;
  ctx.font = fontOf(weight, size);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxWidth) ctx.fillText(text, x, y, maxWidth);
  else ctx.fillText(text, x, y);
}

/** 角丸矩形を描画する */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string | CanvasGradient,
  stroke?: string,
  strokeW = 1,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.stroke();
  }
}

/** 直線を描画する */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string = COL.slate200,
  w = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// ---------------------------------------------
// ロゴ
// ---------------------------------------------

/** 画像を読み込むヘルパー（失敗時は null） */
function tryLoadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface ResultLogos {
  /** 協会（TCTA）ロゴ：結果画像の右下に入れる */
  tcta: HTMLImageElement | null;
  /** 会場ロゴ */
  venue: HTMLImageElement | null;
  /** 鳥取大学ロゴ */
  tottori: HTMLImageElement | null;
}

/** 結果画像で使うロゴをまとめて読み込む */
export async function loadResultLogos(): Promise<ResultLogos> {
  const base = import.meta.env.BASE_URL;
  const [tcta, venue, tottori] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
    tryLoadImage(`${base}logo-tottori-univ.png`),
  ]);
  return { tcta, venue, tottori };
}

/** 画像を maxW × maxH に収まるサイズへ縮小した寸法を返す */
export function fitLogo(
  img: HTMLImageElement | null,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (!img || !img.width || !img.height) return { w: 0, h: 0 };
  const ratio = img.width / img.height;
  let h = maxH;
  let w = h * ratio;
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  return { w, h };
}

// ---------------------------------------------
// 共通パーツ
// ---------------------------------------------

/** 種目名から見出しバッジの配色を決める */
export function eventBadgeColors(name: string): { c1: string; c2: string; c3: string } {
  const s = name || '';
  if (/ミックス|ミクスト|混合|MIX/i.test(s)) return { c1: '#c4b5fd', c2: '#8b5cf6', c3: '#6d28d9' }; // violet
  if (/女子|レディ|WOMEN|WD|WS/i.test(s)) return { c1: '#f9a8d4', c2: '#ec4899', c3: '#be185d' };   // pink
  if (/男子|MEN|MD|MS/i.test(s)) return { c1: '#7dd3fc', c2: '#0ea5e9', c3: '#0369a1' };            // sky
  return { c1: '#67e8f9', c2: '#06b6d4', c3: '#0e7490' };                                           // cyan
}

/** 上端のアクセントバー（水色グラデーション） */
export function drawTopAccentBar(ctx: CanvasRenderingContext2D, totalW: number, h = 5): void {
  const grad = ctx.createLinearGradient(0, 0, totalW, 0);
  grad.addColorStop(0, COL.sky300);
  grad.addColorStop(0.5, COL.sky500);
  grad.addColorStop(1, COL.sky300);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, totalW, h);
}

export interface ResultHeaderOptions {
  /** 左側のバッジに入れる文言（種目名／クラス名） */
  title: string;
  /** 右上に表示する大会名 */
  tournamentName: string;
  /** 右上・大会名の下に表示する会場（団体戦と同じ表示ルール） */
  venue?: string;
  paddingX: number;
  paddingY: number;
  tableW: number;
  headerH: number;
  logos: ResultLogos;
}

/**
 * 結果画像のヘッダーを描画する。
 * 左＝種目バッジ / 右上＝大会名＋会場（団体戦と同じ体裁）。
 */
export function drawResultHeader(ctx: CanvasRenderingContext2D, o: ResultHeaderOptions): void {
  const { title, tournamentName, venue, paddingX, paddingY, tableW, headerH, logos } = o;

  // ---- 左: 種目名バッジ ----
  const cat = eventBadgeColors(title);
  const runs = splitBigSmall(title);
  const bigPx = 30;
  const smallPx = 21;
  const badgeH = 58;
  const badgeTextW = measureMixed(ctx, runs, bigPx, smallPx, '900', '800');
  const badgePadX = 26;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeX = paddingX;
  const badgeY = paddingY + (headerH - badgeH) / 2 - 8;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 9;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
  badgeGrad.addColorStop(0, cat.c1);
  badgeGrad.addColorStop(0.55, cat.c2);
  badgeGrad.addColorStop(1, cat.c3);
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeGrad);
  ctx.restore();

  // 内側ハイライト
  const innerHL = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH * 0.55);
  innerHL.addColorStop(0, 'rgba(255,255,255,0.32)');
  innerHL.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, badgeX + 2, badgeY + 2, badgeW - 4, badgeH * 0.55, badgeH / 2 - 2, innerHL);
  // 内側ボーダー
  roundRect(ctx, badgeX + 1.5, badgeY + 1.5, badgeW - 3, badgeH - 3, badgeH / 2 - 1.5, undefined, 'rgba(255,255,255,0.45)', 1);

  ctx.fillStyle = COL.white;
  const baselineY = badgeY + badgeH / 2 + bigPx * 0.34;
  drawMixed(ctx, runs, badgeX + (badgeW - badgeTextW) / 2, baselineY, bigPx, smallPx, '900', '800');

  // ---- 右: 大会名 + 会場（団体戦と同じ） ----
  const rightX = paddingX + tableW;
  if (tournamentName) {
    const nameMaxW = Math.max(200, tableW - badgeW - 48);
    drawText(ctx, tournamentName, rightX, paddingY + 34, 22, 'right', COL.slate800, 'bold', nameMaxW);
  }
  drawVenueBadge(ctx, {
    venue,
    rightX,
    topY: paddingY + 54,
    venueLogo: logos.venue,
    tottoriLogo: logos.tottori,
  });

  // ---- ヘッダー下のアクセントライン ----
  const accentY = paddingY + headerH - 4;
  const accentGrad = ctx.createLinearGradient(paddingX, accentY, paddingX + tableW, accentY);
  accentGrad.addColorStop(0, 'rgba(14, 165, 233, 0)');
  accentGrad.addColorStop(0.2, 'rgba(14, 165, 233, 0.45)');
  accentGrad.addColorStop(0.8, 'rgba(14, 165, 233, 0.45)');
  accentGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.strokeStyle = accentGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(paddingX, accentY);
  ctx.lineTo(paddingX + tableW, accentY);
  ctx.stroke();
}

/**
 * 「シード 1.〇〇 2.〇〇 …」のような一覧を maxW に収まるよう複数行に折り返す。
 */
export function wrapItems(
  ctx: CanvasRenderingContext2D,
  prefix: string,
  items: string[],
  maxW: number,
  px: number,
  maxLines = 2,
): string[] {
  if (items.length === 0) return [];
  ctx.font = fontOf('medium', px);
  const SEP = '　'; // 全角スペース区切り
  const lines: string[] = [];
  let cur = prefix;
  for (const item of items) {
    const next = cur === prefix ? `${cur}${item}` : `${cur}${SEP}${item}`;
    if (ctx.measureText(next).width > maxW && cur !== prefix) {
      lines.push(cur);
      if (lines.length >= maxLines) return lines;
      cur = `${' '.repeat(prefix.length)}${item}`;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur);
  return lines.slice(0, maxLines);
}
