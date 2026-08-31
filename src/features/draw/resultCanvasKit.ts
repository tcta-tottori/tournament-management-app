// =============================================
// 結果画像（Canvas）共通スタイルキット
//
// すべての結果画像（個人戦・ミックス・団体戦のトーナメント／リーグ）で
// 同じ見た目になるよう、配色・角丸カード・ヘッダー（見出し＋大会名＋会場）・
// フッター（協会ロゴ）をここにまとめている。
//
// トンマナは協会サイトに合わせた「白ベース＋赤の差し色」。
//   - 地は白、罫線・枠・バッジは無彩色のグレー
//   - 赤は見出しの四角／罫線、勝者のスコア、決勝・1位など要点だけに使う
// =============================================
import { drawVenueBadge } from '../team/venueBadge';
import { splitBigSmall, measureMixed, drawMixed } from '../team/mixedSizeText';

/** 結果画像共通のフォントファミリー（団体戦と同じ） */
export const FF = '"Inter", "Hiragino Sans", "Yu Gothic", sans-serif';

/**
 * 見出しの英字（背後に敷くストライプ文字）のフォント。
 * サイトの見出しと同じ、太くて字幅の詰まったグロテスク体を優先する。
 */
export const GHOST_FF =
  '"Helvetica Neue", Helvetica, Arial, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif';

/**
 * 結果画像共通のカラーパレット。
 * 協会サイトのトンマナ（白ベース＋赤の差し色）に合わせている。
 * ベースは白とニュートラルグレーで組み、赤は見出し・勝者・決勝など
 * 「ここを見てほしい」箇所だけに差す。
 */
export const COL = {
  white: '#ffffff',
  /** サイトの地色と同じ、ごくわずかに落とした白 */
  paper: '#f8f8f8',
  /** 見出しの背後に敷く英字のグレー（サイトと同じ薄さ） */
  ghost: '#e6e6e6',

  // ---- 差し色（サイトのブランド赤） ----
  red50: '#fdf3f2',
  red100: '#fae3e2',
  red200: '#f2c7c5',
  red300: '#e49f9c',
  red400: '#d46a66',
  /** ブランド赤（サイトの見出し・アイコンと同じ） */
  red500: '#c63834',
  red600: '#ad2c29',
  red700: '#8c2220',
  red800: '#6b1a18',

  // ---- ベース（白と墨のニュートラル） ----
  gray50: '#fafafa',
  gray100: '#f4f4f4',
  gray200: '#e8e8e8',
  gray300: '#d6d6d6',
  gray400: '#a6a6a6',
  gray500: '#767676',
  gray600: '#5a5a5a',
  gray700: '#404040',
  gray800: '#262626',
  gray900: '#141414',

  /** 勝ち上がりライン・勝者スコアの赤 */
  win: '#c63834',
  winSoft: '#fae3e2',
  /** 勝者行のごく淡い赤の敷き色 */
  winRow: 'rgba(198, 56, 52, 0.07)',
  /** 優勝・1位チップ（赤ベタ） */
  champ1: '#d2504c',
  champ2: '#c63834',
  champ3: '#8c2220',
  champText: '#ffffff',
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
  color: string = COL.gray800,
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
  color: string = COL.gray200,
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

/** 協会ロゴを結果画像に入れるかどうかの保存キー */
const ASSOCIATION_LOGO_KEY = 'resultImage.associationLogo';

/** 協会ロゴを入れる設定か（既定: 入れる） */
export function getAssociationLogoEnabled(): boolean {
  try {
    return localStorage.getItem(ASSOCIATION_LOGO_KEY) !== '0';
  } catch {
    return true;
  }
}

/** 協会ロゴを入れるかどうかを保存する */
export function setAssociationLogoEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ASSOCIATION_LOGO_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage が使えない環境では保存しない
  }
}

/** トーナメント表の表示幅の倍率の保存キー */
const BRACKET_WIDTH_KEY = 'resultImage.bracketWidthScale';

/** 表示幅の倍率の下限・上限・既定 */
export const BRACKET_WIDTH_MIN = 0.7;
export const BRACKET_WIDTH_MAX = 1.6;
export const BRACKET_WIDTH_DEFAULT = 0.7;

/** トーナメント表の表示幅の倍率（既定: 0.7） */
export function getBracketWidthScale(): number {
  try {
    const raw = Number(localStorage.getItem(BRACKET_WIDTH_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return BRACKET_WIDTH_DEFAULT;
    return Math.min(BRACKET_WIDTH_MAX, Math.max(BRACKET_WIDTH_MIN, raw));
  } catch {
    return BRACKET_WIDTH_DEFAULT;
  }
}

/** トーナメント表の表示幅の倍率を保存する */
export function setBracketWidthScale(scale: number): void {
  try {
    localStorage.setItem(BRACKET_WIDTH_KEY, String(scale));
  } catch {
    // localStorage が使えない環境では保存しない
  }
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

/**
 * 見出し（種目名・クラス名）の文字色。
 * サイトのトンマナに合わせ、見出しは種目を問わず「墨」で統一し、
 * 赤は左の小さな四角と罫線だけに使う（＝差し色として効かせる）。
 */
export function headingColors(): { text: string; mark: string } {
  return { text: COL.gray900, mark: COL.red500 };
}

/**
 * ヘッダー下の罫線（淡いグレーのみ）。
 */
export function drawHeaderRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
): void {
  ctx.strokeStyle = COL.gray200;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

/** トーナメント表・リーグ表の外枠（淡いグレーの細線） */
export function drawResultFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  roundRect(ctx, x, y, w, h, r, undefined, COL.gray300, 1.5);
}

/** 1 → 1st, 2 → 2nd … の序数表記 */
function ordinal(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th'
      : n % 10 === 1 ? 'st'
        : n % 10 === 2 ? 'nd'
          : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** 「男子」「女子」「ミックス」から英語の区分を返す */
function genderEnglish(s: string): string {
  if (/ミックス|ミクスト|混合|MIX/i.test(s)) return 'MIXED';
  if (/女子|レディ|WOMEN/i.test(s)) return "WOMEN'S";
  if (/男子|MEN/i.test(s)) return "MEN'S";
  return '';
}

/**
 * 見出しの英字ラベル。日本語見出しの背後に敷く英語を組み立てる。
 *   1位トーナメント → 1st TOURNAMENT
 *   Aリーグ         → LEAGUE A
 *   男子1部         → MEN'S DIVISION 1
 *   一般男子シングルス → MEN'S SINGLES
 * @param fallback どの規則にも当てはまらないときの英字（例: TOURNAMENT）
 */
export function headingEnglish(title: string, fallback = 'RESULT'): string {
  const s = (title || '').trim();
  const gender = genderEnglish(s);

  // 「◯位トーナメント」「4・5位トーナメント」「1位・2位決定戦」など。
  // 連番表記は先頭の数字を採用する（4・5位 → 4th）。
  const place = s.match(/(\d+)(?:\s*[・,、\-–~～]\s*\d+)*\s*位/);
  if (place && /トーナメント|決定戦|決勝|TOURNAMENT/i.test(s)) {
    return `${ordinal(Number(place[1]))} TOURNAMENT`;
  }
  // 「◯部」（男子1部 → MEN'S DIVISION 1）
  const division = s.match(/(\d+)\s*部/);
  if (division) {
    return [gender, 'DIVISION', division[1]].filter(Boolean).join(' ');
  }
  // 「予選会」
  if (/予選/.test(s)) return [gender, 'QUALIFIER'].filter(Boolean).join(' ');
  // 「Aリーグ」「1リーグ」
  const league = s.match(/([0-9A-Za-z])\s*リーグ/);
  if (league) return `LEAGUE ${league[1].toUpperCase()}`;
  // 種目名（一般男子シングルス → MEN'S SINGLES / 45歳以上 → 45+）
  const kind = /ダブルス|DOUBLES/i.test(s) ? 'DOUBLES' : /シングルス|SINGLES/i.test(s) ? 'SINGLES' : '';
  if (kind) {
    const age = s.match(/(\d+)\s*歳/);
    return [gender, kind, age ? `${age[1]}+` : ''].filter(Boolean).join(' ');
  }
  if (/順位表|STANDINGS/i.test(s)) return 'STANDINGS';
  if (/リーグ|LEAGUE/i.test(s)) return 'LEAGUE';
  if (/トーナメント|決勝|TOURNAMENT/i.test(s)) return 'TOURNAMENT';
  return gender ? `${gender} ${fallback}` : fallback;
}

/**
 * 見出しの英字（サイトと同じ、横線を入れた大きな薄いグレーの文字）。
 * 文字を描いたあと、背景色の横線を等間隔で重ねてストライプにする。
 * 文字間を広げて描くので canvas の letterSpacing に依存しない。
 */
export function drawHeadingGhost(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  px: number,
  maxW: number,
  align: 'left' | 'right' = 'left',
  bg: string = COL.white,
): void {
  if (!text || maxW <= 0) return;
  // 太字・字間を詰めたグロテスク体（サイトの見出し英字に合わせる）
  const tracking = -px * 0.012;
  ctx.save();
  ctx.fillStyle = COL.ghost;
  ctx.font = `800 ${px}px ${GHOST_FF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // 文字間を足した実幅が maxW に収まるまで詰める
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  const k = total > maxW ? maxW / total : 1;
  const startX = align === 'right' ? x - total * k : x;
  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    ctx.translate(cx, centerY);
    ctx.scale(k, 1);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
    cx += (widths[i] + tracking) * k;
  }

  // 横ストライプ（背景色の線で文字を切る）
  const capH = px * 0.78;
  const top = centerY - capH * 0.72;
  const bottom = centerY + capH * 0.52;
  const gap = Math.max(6, px * 0.125);
  const lineW = Math.max(2, px * 0.038);
  ctx.strokeStyle = bg;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'butt';
  for (let y = top; y <= bottom; y += gap) {
    ctx.beginPath();
    ctx.moveTo(startX - 2, y);
    ctx.lineTo(cx + 2, y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 見出しの左に置く赤い四角（サイトのセクション見出しと同じ記号）。
 * @returns 四角の右端X
 */
export function drawHeadingMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  size: number,
): number {
  ctx.fillStyle = COL.red500;
  ctx.fillRect(x, centerY - size / 2, size, size);
  return x + size;
}

export interface ResultHeaderOptions {
  /** 左側の見出しに入れる文言（種目名／クラス名） */
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
  /** 大会名の下に添える小見出し（例:「順位表」）。赤で入れる */
  subtitle?: string;
  /** 見出しの基準サイズ（既定 46px）。表が大きい画像では大きくする */
  titlePx?: number;
  /** 見出しの背後に敷く英字（未指定なら見出しから自動判定） */
  titleEn?: string;
  /** 英字を自動判定できないときの既定値（例: TOURNAMENT / LEAGUE） */
  titleEnFallback?: string;
  /** 会場バッジの表示倍率（既定 1） */
  venueScale?: number;
  /** ヘッダー下の罫線を引くか（既定 true）。表の外枠と二重線になる場合は false */
  headerRule?: boolean;
  /**
   * ヘッダー全体の拡大率（既定 1）。
   * 画像の横幅はドローサイズで変わるため、HPなどで幅をそろえて並べると
   * 幅の広い画像ほど縮小されて見出しが小さく見える。表幅に比例して
   * ヘッダーを拡大しておくと、どのクラスも同じ大きさに見える。
   */
  headerScale?: number;
}

/** ヘッダーの拡大率を決めるときの基準幅（この幅のとき等倍） */
export const HEADER_BASE_W = 820;

/** 表幅からヘッダーの拡大率を求める（極端に大きくならないよう頭打ちにする） */
export function headerScaleOf(tableW: number): number {
  return Math.min(1.9, Math.max(1, tableW / HEADER_BASE_W));
}

/**
 * 結果画像のヘッダーを描画する（白ベース＋赤の差し色）。
 *   左  : 赤い四角 ＋ 種目名（墨）＋ 背後に薄いグレーの英字
 *   右上: 大会名（墨） ＋ 会場
 *   下  : 淡いグレーの罫線＋左端だけ赤
 */
export function drawResultHeader(ctx: CanvasRenderingContext2D, o: ResultHeaderOptions): void {
  const {
    title, tournamentName, venue, paddingX, paddingY, tableW, headerH, logos,
    subtitle, headerScale = 1, headerRule = true,
  } = o;
  const titlePx = o.titlePx ?? 46 * headerScale;
  const venueScale = o.venueScale ?? headerScale;
  const titleEn = o.titleEn ?? headingEnglish(title, o.titleEnFallback);

  // ---- 右側（大会名・会場）の基準位置 ----
  // 種目名の高さをここに合わせるため、先に決めておく。
  const NAME_PX = 22 * headerScale;
  const nameY = paddingY + 34 * headerScale;        // 大会名（middle ベースライン）
  const subtitleY = nameY + 22 * headerScale;       // 小見出し（あれば）
  const venueTopY = paddingY + (subtitle ? 66 : 54) * headerScale; // 会場ロゴ／会場名の上端
  // 大会名の下端と会場の上端のちょうど中間＝左右の「分け目」
  const dividerY = (nameY + NAME_PX / 2 + venueTopY) / 2;

  // ---- 左: 赤い四角 + 種目名（墨の一色。サイトの見出しと同じ組み方） ----
  const heading = headingColors();
  const runs = splitBigSmall(title);
  let bigPx = titlePx;
  let smallPx = Math.round(titlePx * 0.74);
  const markSize = Math.max(16, Math.round(titlePx * 0.46));
  const markGap = Math.max(10, Math.round(titlePx * 0.24));
  // 右側の大会名と重ならない範囲まで、はみ出す場合だけ縮める
  const maxTitleW = Math.max(180, tableW * 0.46) - markSize - markGap;
  let titleW = measureMixed(ctx, runs, bigPx, smallPx, '900', '800');
  if (titleW > maxTitleW) {
    const k = maxTitleW / titleW;
    bigPx = Math.floor(bigPx * k);
    smallPx = Math.floor(smallPx * k);
    titleW = measureMixed(ctx, runs, bigPx, smallPx, '900', '800');
  }
  // 文字の高さの中心を「分け目」に合わせる（alphabetic ベースラインからの補正）
  const baselineY = dividerY + bigPx * 0.34;

  // 英字（横線入りの大きな薄いグレー文字）は、大会名・会場の文字に
  // 重ねて右揃えで敷く。最初に描くことで下のレイヤーになる。
  const venueBottomY = venue ? venueTopY + 48 * venueScale : nameY + NAME_PX / 2;
  const ghostPx = titlePx * 1.25;
  const ghostCenterY = (nameY - NAME_PX / 2 + venueBottomY) / 2;
  drawHeadingGhost(ctx, titleEn, paddingX + tableW, ghostCenterY, ghostPx, tableW * 0.9, 'right');

  const markRight = drawHeadingMark(ctx, paddingX, dividerY, markSize);
  const titleX = markRight + markGap;
  ctx.fillStyle = heading.text;
  drawMixed(ctx, runs, titleX, baselineY, bigPx, smallPx, '900', '800');
  // 見出し全体の幅（右側の大会名の折り返し判定に使う）
  const headingW = markSize + markGap + titleW;

  // ---- 右: 大会名 + 小見出し + 会場 ----
  const rightX = paddingX + tableW;
  if (tournamentName) {
    const nameMaxW = Math.max(200, tableW - headingW - 48 * headerScale);
    drawText(ctx, tournamentName, rightX, nameY, NAME_PX, 'right', COL.gray800, 'bold', nameMaxW);
  }
  if (subtitle) {
    drawText(ctx, subtitle, rightX, subtitleY, 14 * headerScale, 'right', COL.red500, 'black');
  }
  drawVenueBadge(ctx, {
    venue,
    rightX,
    topY: venueTopY,
    venueLogo: logos.venue,
    tottoriLogo: logos.tottori,
    scale: venueScale,
  });

  // ---- ヘッダー下の罫線 ----
  if (headerRule) drawHeaderRule(ctx, paddingX, paddingY + headerH - 4, tableW);
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

export interface ScorePairOptions {
  left: number;
  right: number;
  /** スコアの中心座標 */
  centerX: number;
  centerY: number;
  px: number;
  /** 左（＝先に書く側）が勝ちか */
  leftWin?: boolean;
  /** 右が勝ちか */
  rightWin?: boolean;
  /** 未決着など、勝敗が無いときの文字色 */
  neutralColor?: string;
}

/**
 * 「6 - 4」のようなスコアを中央揃えで描き、勝った側の数字だけ赤にする。
 * 白ベース＋赤の差し色というトンマナに合わせ、勝敗は色ではなく
 * 「赤が入っている側」で読ませる。
 * @returns 描画したスコア全体の幅
 */
export function drawScorePair(ctx: CanvasRenderingContext2D, o: ScorePairOptions): number {
  const { left, right, centerX, centerY, px, leftWin, rightWin } = o;
  const neutral = o.neutralColor ?? COL.gray500;
  const l = String(left);
  const r = String(right);
  const sep = ' - ';

  ctx.save();
  ctx.font = fontOf('bold', px);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lw = ctx.measureText(l).width;
  const sw = ctx.measureText(sep).width;
  const rw = ctx.measureText(r).width;
  const total = lw + sw + rw;

  let x = centerX - total / 2;
  ctx.fillStyle = leftWin ? COL.win : neutral;
  ctx.fillText(l, x, centerY);
  x += lw;
  ctx.fillStyle = neutral;
  ctx.fillText(sep, x, centerY);
  x += sw;
  ctx.fillStyle = rightWin ? COL.win : neutral;
  ctx.fillText(r, x, centerY);
  ctx.restore();

  return total;
}

/** 昇降格バッジの配色（白ベース＋赤の差し色で、種類は形で見分ける） */
export function promotionBadgeStyle(
  kind: string,
): { bg: string; fg: string; border?: string } {
  switch (kind) {
    case 'champion':
      return { bg: COL.red500, fg: COL.white };
    case 'promote':
      return { bg: COL.white, fg: COL.red600, border: COL.red500 };
    case 'relegate':
      return { bg: COL.gray600, fg: COL.white };
    default:
      return { bg: COL.gray400, fg: COL.white };
  }
}
