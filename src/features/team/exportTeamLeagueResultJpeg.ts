import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding, MatchType } from './types';
import { getMatchTypeOrder, getDisplayNameParts, resolveClubPromotionStatus } from './teamLogic';

const TYPE_LABEL: Record<MatchType, string> = {
  MIX: 'Mix', WD: 'WD', MD: 'MD',
  D1: 'D1', D2: 'D2', D3: 'D3', S1: 'S1', S2: 'S2',
};

/** 種目別カラー（画面側と統一） */
const TYPE_COLORS: Record<MatchType, { bg: string; fg: string; accent: string }> = {
  MIX: { bg: '#ede9fe', fg: '#6d28d9', accent: '#8b5cf6' }, // violet
  WD:  { bg: '#fce7f3', fg: '#be185d', accent: '#ec4899' }, // pink
  MD:  { bg: '#e0f2fe', fg: '#0369a1', accent: '#0ea5e9' }, // sky
  D3:  { bg: '#dbeafe', fg: '#1d4ed8', accent: '#3b82f6' }, // blue
  D2:  { bg: '#cffafe', fg: '#0e7490', accent: '#06b6d4' }, // cyan
  D1:  { bg: '#ccfbf1', fg: '#0f766e', accent: '#14b8a6' }, // teal
  S2:  { bg: '#fef3c7', fg: '#b45309', accent: '#f59e0b' }, // amber
  S1:  { bg: '#fee2e2', fg: '#b91c1c', accent: '#ef4444' }, // red
};

/** リーグ別カラー（TeamLeagueView.LEAGUE_COLORS と対応） */
interface LeagueColor {
  c1: string; c2: string; c3: string;
  text: string;
  headBg1: string; headBg2: string; headBg3: string;
  shadow: string;
}
const LEAGUE_COLORS: LeagueColor[] = [
  // A - Blue → Indigo
  { c1: '#60a5fa', c2: '#3b82f6', c3: '#4338ca', text: '#1e3a8a',
    headBg1: '#eff6ff', headBg2: '#dbeafe', headBg3: '#bfdbfe', shadow: 'rgba(30,58,138,0.32)' },
  // B - Emerald → Teal
  { c1: '#34d399', c2: '#10b981', c3: '#0f766e', text: '#064e3b',
    headBg1: '#ecfdf5', headBg2: '#d1fae5', headBg3: '#a7f3d0', shadow: 'rgba(6,78,59,0.32)' },
  // C - Purple → Violet
  { c1: '#c084fc', c2: '#a855f7', c3: '#7c3aed', text: '#581c87',
    headBg1: '#faf5ff', headBg2: '#f3e8ff', headBg3: '#e9d5ff', shadow: 'rgba(88,28,135,0.32)' },
  // D - Rose → Pink
  { c1: '#fb7185', c2: '#f43f5e', c3: '#be185d', text: '#881337',
    headBg1: '#fff1f2', headBg2: '#ffe4e6', headBg3: '#fecdd3', shadow: 'rgba(136,19,55,0.32)' },
  // E - Amber → Orange
  { c1: '#fbbf24', c2: '#f59e0b', c3: '#ea580c', text: '#7c2d12',
    headBg1: '#fffbeb', headBg2: '#fef3c7', headBg3: '#fde68a', shadow: 'rgba(124,45,18,0.32)' },
  // F - Cyan → Sky
  { c1: '#22d3ee', c2: '#06b6d4', c3: '#0284c7', text: '#0c4a6e',
    headBg1: '#ecfeff', headBg2: '#cffafe', headBg3: '#a5f3fc', shadow: 'rgba(12,74,110,0.32)' },
  // G - Lime → Green
  { c1: '#a3e635', c2: '#84cc16', c3: '#16a34a', text: '#14532d',
    headBg1: '#f7fee7', headBg2: '#ecfccb', headBg3: '#d9f99d', shadow: 'rgba(20,83,45,0.32)' },
  // H - Fuchsia → Purple
  { c1: '#e879f9', c2: '#d946ef', c3: '#9333ea', text: '#581c87',
    headBg1: '#fdf4ff', headBg2: '#fae8ff', headBg3: '#f5d0fe', shadow: 'rgba(88,28,135,0.32)' },
];

/** リーグIDからカラーインデックスを取得（A=0, B=1, ...） */
function getLeagueColorIndex(leagueId: string): number {
  const code = leagueId.trim().toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  if (code < 0 || code >= LEAGUE_COLORS.length) return 0;
  return code;
}

/** 表示用選手名の短縮（苗字最大3文字） + 手動上書き */
function shortenPlayerName(name: string, overrides: Record<string, string>): string {
  if (overrides[name] !== undefined) return overrides[name];
  const trimmed = name.trim();
  // 苗字部分（空白前）を取り出して最大3文字
  const famName = trimmed.split(/[\s　]+/)[0] || trimmed;
  if (famName.length <= 3) return famName;
  return famName.substring(0, 3);
}

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

/** 団体戦リーグ結果を表形式で描画したCanvasからData URL (JPEG) を生成する */
export async function generateTeamLeagueResultDataUrl(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  matches: TeamLeagueMatch[],
  _allTeams: TeamEntry[],
  tournamentName: string,
  playerNameOverrides: Record<string, string> = {},
  matchFormat?: import('./types').MatchFormat,
  promotionOverrides: Record<string, string> = {},
): Promise<string> {
  // リーグカラー（A=青, B=緑, C=紫, D=ローズ, E=アンバー, ...）
  const lc = LEAGUE_COLORS[getLeagueColorIndex(league.leagueId)];
  const shortName = (name: string) => shortenPlayerName(name, playerNameOverrides);
  // チームごとの「表示名 → 構造（main/sub）」マップ。同姓ディスアンビグの sub を
  // 小文字描画するために使う。手動入力（メンバーに無い名前）は plain として扱う。
  const partsLookupByTeam = new Map<string, Map<string, { main: string; sub: string }>>();
  for (const t of league.teams) {
    const m = new Map<string, { main: string; sub: string }>();
    for (const member of t.members) {
      const parts = getDisplayNameParts(member.player, t.members);
      // 上書き名がある場合はそれをキーにも登録
      m.set(parts.full, { main: parts.main, sub: parts.sub });
      const overridden = playerNameOverrides[member.player.name];
      if (overridden) m.set(overridden, { main: overridden, sub: '' });
    }
    partsLookupByTeam.set(t.teamId, m);
  }
  const getParts = (teamId: string, name: string): { main: string; sub: string } => {
    const map = partsLookupByTeam.get(teamId);
    const hit = map?.get(name);
    if (hit) return hit;
    return { main: name, sub: '' };
  };
  // 試合形式に応じた種目順
  const TYPE_ORDER = getMatchTypeOrder(matchFormat);
  // 公式ロゴ・会場ロゴを事前に読み込む
  const base = import.meta.env.BASE_URL;
  const [tctaLogo, venueLogo] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
  ]);

  // チーム番号順
  const teams = [...league.teams].sort((a, b) => a.numberInLeague - b.numberInLeague);
  const teamCount = teams.length;

  // ---- フォント定義 ----
  const NAME_FONT = '600 12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const NAME_FONT_BOLD = '700 12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const NAME_SUB_FONT = '500 9px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const NAME_SUB_FONT_BOLD = '700 9px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const SCORE_FONT = 'bold 18px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';

  // ---- 対戦テキストの最大幅を事前計測して scoreColW を最適化 ----
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  // 中央揃えスコアのため、左右それぞれの必要幅 = max(p1,p2) * 2 + score + 2*gap
  const CELL_GAP = 6;
  let maxTextW = 160;
  for (const m of matches) {
    if (m.leagueId !== league.leagueId) continue;
    for (const sub of m.subMatches) {
      if (sub.score1 === null || sub.score2 === null) continue;
      const p1 = (sub.players1 || []).map(shortName).join('/') || '　';
      const p2 = (sub.players2 || []).map(shortName).join('/') || '　';

      mctx.font = NAME_FONT;
      const p1W = mctx.measureText(p1).width;
      const p2W = mctx.measureText(p2).width;

      mctx.font = SCORE_FONT;
      const scoreW = mctx.measureText(`${sub.score1} - ${sub.score2}`).width;

      // 中央揃え: scoreW + 2*gap + 2*max(p1, p2)
      const halfMax = Math.max(p1W, p2W);
      const total = scoreW + 2 * CELL_GAP + 2 * halfMax;
      if (total > maxTextW) maxTextW = total;
    }
  }
  const scoreColW = Math.min(320, Math.max(190, Math.ceil(maxTextW) + 30));

  // ---- レイアウト定数 ----
  const scale = 2;
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110; // 角丸バッジ + 大会名 + 会場ロゴ
  const colHeaderH = 54;
  // 種目数（3 = ミックス大会, 5 = クラブ対抗戦）に応じて行高を調整
  const _subCountForRow = TYPE_ORDER.length;
  const _baseOverallH = 38;
  const _perSubH = 36;
  const rowH = _baseOverallH + _perSubH * _subCountForRow;
  const numColW = 60;       // チーム番号専用列
  const nameColW = 168;     // チーム名（番号と分離したのでやや細く）
  const typeColW = 54;
  const recordColW = 96;
  const rankColW = 88;
  const tableW = numColW + nameColW + typeColW + scoreColW * teamCount + recordColW + rankColW;
  const tableH = colHeaderH + rowH * teamCount;

  // ---- フッター（TCTA横長ロゴ — やや大きめに表示） ----
  const tctaMaxH = 78;
  const tctaMaxW = Math.min(380, tableW * 0.42);
  let tctaW = 0;
  let tctaH = 0;
  if (tctaLogo) {
    const ratio = tctaLogo.width / tctaLogo.height;
    tctaH = tctaMaxH;
    tctaW = tctaH * ratio;
    if (tctaW > tctaMaxW) {
      tctaW = tctaMaxW;
      tctaH = tctaW / ratio;
    }
  }
  const footerH = tctaLogo ? tctaH + 14 : 24;

  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH + footerH;

  // ---- カラーパレット（refined sky + premium medal palette） ----
  const COL = {
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
    sky900: '#0c4a6e',
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
    // 勝敗スコア用：勝ち=赤、負け=グレー
    // スコア色：勝者=緑、敗者=グレー
    winGreen: '#059669',
    loseGray: '#94a3b8',
    // 上位3チームのメダル風グラデ
    gold:   { c1: '#fde68a', c2: '#f59e0b', c3: '#b45309', text: '#7c2d12' },
    silver: { c1: '#f1f5f9', c2: '#cbd5e1', c3: '#64748b', text: '#334155' },
    bronze: { c1: '#fed7aa', c2: '#c2410c', c3: '#7c2d12', text: '#7c2d12' },
  };

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景: リーグの枠外は完全な白で塗りつぶす（ロゴの矩形が背景に浮かないように）
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- リッチ装飾: キャンバス上端の細いアクセントバー（水色 → 紫） ----
  const topBarH = 5;
  const topBarGrad = ctx.createLinearGradient(0, 0, totalW, 0);
  topBarGrad.addColorStop(0,   '#0ea5e9'); // sky-500
  topBarGrad.addColorStop(0.5, '#8b5cf6'); // violet-500
  topBarGrad.addColorStop(1,   '#a855f7'); // purple-500
  ctx.fillStyle = topBarGrad;
  ctx.fillRect(0, 0, totalW, topBarH);

  // ---- ヘルパー ----
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color = COL.slate200, w = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = 'center',
    color = COL.slate800,
    weight: 'normal' | 'medium' | 'bold' | 'black' = 'normal',
    maxWidth?: number,
    fontFamily = '"Inter", "Hiragino Sans", "Yu Gothic", sans-serif',
  ) => {
    const weightMap = { normal: '500', medium: '600', bold: '700', black: '900' };
    ctx.fillStyle = color;
    ctx.font = `${weightMap[weight]} ${size}px ${fontFamily}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (maxWidth) ctx.fillText(text, x, y, maxWidth);
    else ctx.fillText(text, x, y);
  };

  const drawRoundRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string | CanvasGradient,
    stroke?: string,
    strokeW = 1,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
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
  };

  // ---- ヘッダー ----
  const leagueId = league.leagueId.trim();

  // 左: 「Aリーグ」を1つの大きな角丸ピルバッジにまとめる
  // 「男子8部」など既に "部" を含む場合は "リーグ" を重ねない
  const pillText = /部|リーグ/.test(leagueId) ? leagueId : `${leagueId}リーグ`;
  // 「男子1部」など数字を含むラベルは「数字 大 + 文字 小」で描画する
  const numberMatch = pillText.match(/^(.*?)(\d+)(.*)$/);
  const pillH = 92;
  const bigFont = '900 64px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const smallFont = '900 32px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.save();
  let pillTextW: number;
  if (numberMatch) {
    const [, prefix, num, suffix] = numberMatch;
    ctx.font = smallFont;
    const wPre = ctx.measureText(prefix).width;
    const wSuf = ctx.measureText(suffix).width;
    ctx.font = bigFont;
    const wNum = ctx.measureText(num).width;
    pillTextW = wPre + wNum + wSuf;
  } else {
    ctx.font = bigFont;
    pillTextW = ctx.measureText(pillText).width;
  }
  ctx.restore();
  const pillPadX = 34;
  const pillW = pillTextW + pillPadX * 2;
  const pillX = paddingX;
  const pillY = paddingY + 4;

  // 外側影
  ctx.save();
  ctx.shadowColor = lc.shadow;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
  pillGrad.addColorStop(0, lc.c1);
  pillGrad.addColorStop(0.55, lc.c2);
  pillGrad.addColorStop(1, lc.c3);
  drawRoundRect(pillX, pillY, pillW, pillH, pillH / 2, pillGrad);
  ctx.restore();

  // 内側ハイライト（上半分に微妙な明るさ）
  const innerHL = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH * 0.55);
  innerHL.addColorStop(0, 'rgba(255,255,255,0.28)');
  innerHL.addColorStop(1, 'rgba(255,255,255,0)');
  drawRoundRect(pillX + 2, pillY + 2, pillW - 4, pillH * 0.55, pillH / 2 - 2, innerHL);

  // 内側ボーダー
  drawRoundRect(pillX + 1.5, pillY + 1.5, pillW - 3, pillH - 3, pillH / 2 - 1.5, undefined, 'rgba(255,255,255,0.4)', 1);

  // バッジ内テキスト
  ctx.fillStyle = COL.white;
  ctx.textAlign = 'left';
  // 数字と文字でサイズが異なる場合は alphabetic ベースラインで揃え（＝下揃え）
  ctx.textBaseline = 'alphabetic';
  if (numberMatch) {
    const [, prefix, num, suffix] = numberMatch;
    let cx = pillX + (pillW - pillTextW) / 2;
    // 64px の数字を視覚的に中央配置する baseline 位置
    const baselineY = pillY + pillH / 2 + 64 * 0.34;
    ctx.font = smallFont;
    const wPre = ctx.measureText(prefix).width;
    ctx.fillText(prefix, cx, baselineY);
    cx += wPre;
    ctx.font = bigFont;
    const wNum = ctx.measureText(num).width;
    ctx.fillText(num, cx, baselineY);
    cx += wNum;
    ctx.font = smallFont;
    ctx.fillText(suffix, cx, baselineY);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = bigFont;
    ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 2);
  }

  const badgeSize = pillH; // 以降の参照用（ヘッダー配置のため）

  // 右: 大会名 + 会場ロゴ
  const headerRightX = paddingX + tableW;
  if (tournamentName) {
    drawText(tournamentName, headerRightX, paddingY + 34, 22, 'right', COL.slate800, 'bold', tableW - badgeSize - 160);
  }
  // 会場ロゴ（添付 logo-venue.png）
  if (venueLogo) {
    const venueMaxH = 48;
    const venueMaxW = 230;
    const vRatio = venueLogo.width / venueLogo.height;
    let vH = venueMaxH;
    let vW = vH * vRatio;
    if (vW > venueMaxW) {
      vW = venueMaxW;
      vH = vW / vRatio;
    }
    const vX = headerRightX - vW;
    const vY = paddingY + 54;
    ctx.drawImage(venueLogo, vX, vY, vW, vH);
  }

  // ---- ヘッダーと表の間の装飾アクセントライン ----
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

  // ---- 表全体枠（影付け - より上質な深さ） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
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
  headGrad.addColorStop(0,   '#ecfeff');
  headGrad.addColorStop(0.5, '#e0f2fe');
  headGrad.addColorStop(1,   '#bae6fd');
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  // 列ヘッダー上端の細い光彩ライン
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(tableX, tableY, tableW, 1.5);
  ctx.restore();

  // 列ヘッダー下の強めのライン (水色 → 紫 で統一)
  const headerLineGrad = ctx.createLinearGradient(tableX, 0, tableX + tableW, 0);
  headerLineGrad.addColorStop(0,   '#0ea5e9');
  headerLineGrad.addColorStop(0.5, '#8b5cf6');
  headerLineGrad.addColorStop(1,   '#a855f7');
  ctx.strokeStyle = headerLineGrad;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(tableX, tableY + colHeaderH);
  ctx.lineTo(tableX + tableW, tableY + colHeaderH);
  ctx.stroke();

  // ---- 列ヘッダー テキスト ----
  const thColor = COL.sky800;
  drawText('No.', tableX + numColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, 'black');
  drawText('チーム', tableX + numColW + nameColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');
  drawText('種目', tableX + numColW + nameColW + typeColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, 'black');

  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const x = tableX + numColW + nameColW + typeColW + scoreColW * i + scoreColW / 2;
    drawText(team.teamName, x, tableY + colHeaderH / 2, 14, 'center', thColor, 'black', scoreColW - 10);
  }
  let colCursor = tableX + numColW + nameColW + typeColW + scoreColW * teamCount;
  drawText('勝敗', colCursor + recordColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');
  colCursor += recordColW;
  drawText('順位', colCursor + rankColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');

  // 各行レイアウト: 上部の総合勝敗 + 3サブ行
  const overallAreaH = 38;
  const subAreaH = rowH - overallAreaH;
  const subCount = TYPE_ORDER.length;
  const subH = subAreaH / subCount;

  // ---- 各行の描画 ----
  for (let rowIdx = 0; rowIdx < teamCount; rowIdx++) {
    const team = teams[rowIdx];
    const standing = standings.find(s => s.teamId === team.teamId);
    const rowTop = tableY + colHeaderH + rowH * rowIdx;

    if (rowIdx > 0) {
      drawLine(tableX, rowTop, tableX + tableW, rowTop, COL.slate200, 1);
    }

    const subAreaTop = rowTop + overallAreaH;
    const subCenters = Array.from({ length: subCount }, (_, i) => subAreaTop + subH * i + subH / 2);

    // --- 番号列 (バッジなし、専用列に大きな数字) ---
    const numColCenterX = tableX + numColW / 2;
    // 番号列に薄い背景帯を入れて視覚的に独立させる
    ctx.fillStyle = COL.slate50;
    ctx.fillRect(tableX + 0.5, rowTop + 0.5, numColW - 0.5, rowH - 1);
    drawText(String(team.teamNumber), numColCenterX, rowTop + rowH / 2, 20, 'center', COL.slate500, 'black');
    // 番号列とチーム名列の境界
    drawLine(tableX + numColW, tableY + colHeaderH, tableX + numColW, tableY + tableH, COL.slate200, 1);

    // --- チーム名列 ---
    drawText(team.teamName, tableX + numColW + 14, rowTop + rowH / 2 - 8, 16, 'left', COL.slate900, 'bold', nameColW - 22);

    // 昇降格バッジ（クラブ対抗戦のみ、確定後に表示。右下に配置）
    if (standing) {
      const promo = resolveClubPromotionStatus(league.leagueId, standing.rank, promotionOverrides[team.teamId]);
      if (promo) {
        const badgeColor =
          promo.kind === 'champion' ? '#f59e0b' :
          promo.kind === 'promote'  ? '#059669' :
          promo.kind === 'relegate' ? '#e11d48' : '#64748b';
        const badgeFont = '800 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.save();
        ctx.font = badgeFont;
        const txtW = ctx.measureText(promo.label).width;
        const padX = 8;
        const bw = txtW + padX * 2;
        const bh = 18;
        const bx = tableX + numColW + nameColW - bw - 8;
        const by = rowTop + rowH - bh - 6;
        drawRoundRect(bx, by, bw, bh, bh / 2, badgeColor);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(promo.label, bx + bw / 2, by + bh / 2 + 0.5);
        ctx.restore();
      }
    }

    // --- 種目列 ---
    const typeColX = tableX + numColW + nameColW;
    drawLine(typeColX, tableY + colHeaderH, typeColX, tableY + tableH, COL.slate200, 1);

    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      const tc = TYPE_COLORS[mt];
      // シンプルなテキスト表示（バッジなし）
      // クラブ対抗戦は黒文字、ミックス大会は種目色を維持
      ctx.fillStyle = matchFormat === 'club' ? COL.slate900 : tc.fg;
      ctx.font = '900 14px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], typeColX + typeColW / 2, subCenters[i]);
    }

    // 種目列の上部（総合勝敗エリア）に「勝敗」ラベルを表示
    const overallY = rowTop + overallAreaH / 2;
    drawText('勝敗', typeColX + typeColW / 2, overallY, 11, 'center', COL.slate500, 'bold');

    // サブ行の境界線
    const subRowRightEdge = tableX + numColW + nameColW + typeColW + scoreColW * teamCount;
    drawLine(typeColX, subAreaTop, subRowRightEdge, subAreaTop, COL.slate200, 0.8);
    for (let i = 1; i < subCount; i++) {
      const y = subAreaTop + subH * i;
      drawLine(typeColX, y, subRowRightEdge, y, COL.slate100, 0.6);
    }

    // --- 対戦スコア列 ---
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + numColW + nameColW + typeColW + scoreColW * colIdx;

      drawLine(x, tableY + colHeaderH, x, tableY + tableH, COL.slate200, 1);

      if (colIdx === rowIdx) {
        // 対戦無しセル（同チーム同士の交点）
        ctx.fillStyle = COL.slate100;
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        // 右肩下がりの斜め線：太く濃く描いて視認性を上げる
        drawLine(x + 4, rowTop + 4, x + scoreColW - 4, rowTop + rowH - 4, COL.slate400, 3);
        continue;
      }

      const oppTeam = teams[colIdx];
      const match = matches.find(m =>
        m.leagueId === league.leagueId &&
        ((m.team1Id === team.teamId && m.team2Id === oppTeam.teamId) ||
          (m.team1Id === oppTeam.teamId && m.team2Id === team.teamId))
      );

      if (!match || match.status !== 'finished') continue;

      const isTeam1 = match.team1Id === team.teamId;
      const won = match.winnerId === team.teamId;
      const myWins = isTeam1 ? match.winsTeam1 : match.winsTeam2;
      const oppWins = isTeam1 ? match.winsTeam2 : match.winsTeam1;

      // 勝利側のセル淡水色ハイライト
      if (won) {
        const wonGrad = ctx.createLinearGradient(x, rowTop, x, rowTop + rowH);
        wonGrad.addColorStop(0, '#f0f9ff');
        wonGrad.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = wonGrad;
        ctx.fillRect(x + 1, rowTop + 1, scoreColW - 2, rowH - 2);
      }

      // 総合勝敗（各対戦セル上部）— ピルバッジ型で描画。
      // 数字は大きく、「勝/敗」は小さく描画する。
      const overallY = rowTop + overallAreaH / 2;
      const numFont = '900 18px "Inter", "Helvetica Neue", sans-serif';
      const labelFont = '700 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      // 幅測定：myWins(大) + 勝(小) + ギャップ + oppWins(大) + 敗(小)
      ctx.font = numFont;
      const wWins = ctx.measureText(String(myWins)).width;
      const wLoss = ctx.measureText(String(oppWins)).width;
      ctx.font = labelFont;
      const wKachi = ctx.measureText('勝').width;
      const wMake = ctx.measureText('敗').width;
      const gap = 4;
      const inner = wWins + wKachi + gap + wLoss + wMake;
      const badgePadX = 12;
      const bw = inner + badgePadX * 2;
      const bh = 24;
      const bx2 = x + scoreColW / 2 - bw / 2;
      const by2 = overallY - bh / 2;
      if (won) {
        const pillGrad = ctx.createLinearGradient(bx2, by2, bx2 + bw, by2 + bh);
        pillGrad.addColorStop(0, COL.sky500);
        pillGrad.addColorStop(1, COL.sky700);
        drawRoundRect(bx2, by2, bw, bh, bh / 2, pillGrad);
      } else {
        drawRoundRect(bx2, by2, bw, bh, bh / 2, '#f8fafc', COL.slate300, 1);
      }
      // 描画開始位置（左端）。混合サイズは下揃え（alphabetic baseline）で描画
      let bcx = bx2 + badgePadX;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const baselineY = overallY + 18 * 0.34;
      const numColor = won ? COL.white : COL.slate500;
      const labelColor = won ? 'rgba(255,255,255,0.75)' : COL.slate400;
      ctx.fillStyle = numColor;
      ctx.font = numFont;
      ctx.fillText(String(myWins), bcx, baselineY);
      bcx += wWins;
      ctx.fillStyle = labelColor;
      ctx.font = labelFont;
      ctx.fillText('勝', bcx, baselineY);
      bcx += wKachi + gap;
      ctx.fillStyle = numColor;
      ctx.font = numFont;
      ctx.fillText(String(oppWins), bcx, baselineY);
      bcx += wLoss;
      ctx.fillStyle = labelColor;
      ctx.font = labelFont;
      ctx.fillText('敗', bcx, baselineY);

      // 種目ごとの対戦結果行（選手名＋大きなスコア）
      for (let i = 0; i < TYPE_ORDER.length; i++) {
        const mt = TYPE_ORDER[i];
        const sub = match.subMatches.find(s => s.type === mt);
        const subY = subCenters[i];
        const tc = TYPE_COLORS[mt];

        if (!sub || sub.score1 === null || sub.score2 === null) {
          drawText('—', x + scoreColW / 2, subY, 13, 'center', COL.slate300, 'normal');
          continue;
        }

        const myScore = isTeam1 ? sub.score1 : sub.score2;
        const oppScore = isTeam1 ? sub.score2 : sub.score1;
        const subWon = sub.winnerId === team.teamId;
        const myPlayers = (isTeam1 ? sub.players1 : sub.players2) || [];
        const oppPlayers = (isTeam1 ? sub.players2 : sub.players1) || [];
        const displayScoreText = `${myScore} - ${oppScore}`;

        // 左 = 行チーム（自分）、右 = 対戦相手。
        // 「左側が勝者のセル（subWon）」では左の選手名のみ太字にして強調する。
        const leftIsWinner = subWon;
        const nameColor = COL.slate700;
        // 自チームの勝ち試合は赤、負け試合はグレー
        const scoreColor = leftIsWinner ? COL.winGreen : COL.loseGray;

        // 【中央揃えレイアウト】
        // スコア（"6 - 4"）をセル中央に配置し、左右の選手名はスコアを挟むように配置する。
        const cellCx = x + scoreColW / 2;
        const gap = CELL_GAP;

        // スコアをセル中央に描画
        ctx.font = SCORE_FONT;
        ctx.fillStyle = scoreColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayScoreText, cellCx, subY);
        const scoreW = ctx.measureText(displayScoreText).width;

        // 同姓ディスアンビグの1文字名は小文字（小さめ）で描画する
        const drawPlayerList = (
          players: string[],
          tid: string,
          edgeX: number,
          y: number,
          align: 'left' | 'right',
          bold: boolean,
        ) => {
          const items = players.map(p => {
            const short = shortName(p);
            return getParts(tid, short);
          });
          const mainFont = bold ? NAME_FONT_BOLD : NAME_FONT;
          const subFont = bold ? NAME_SUB_FONT_BOLD : NAME_SUB_FONT;
          if (items.length === 0) {
            ctx.font = mainFont;
            ctx.fillStyle = nameColor;
            ctx.textAlign = align;
            ctx.textBaseline = 'middle';
            ctx.fillText('　', edgeX, y);
            return;
          }
          // 幅を測定
          ctx.font = mainFont;
          const sepW = ctx.measureText('/').width;
          const widths = items.map(it => {
            ctx.font = mainFont;
            const mw = ctx.measureText(it.main).width;
            ctx.font = subFont;
            const sw = it.sub ? ctx.measureText(it.sub).width : 0;
            return { mw, sw };
          });
          let totalW = 0;
          widths.forEach((w, i) => { totalW += w.mw + w.sw; if (i > 0) totalW += sepW; });
          let cx = align === 'right' ? edgeX - totalW : edgeX;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = nameColor;
          for (let idx = 0; idx < items.length; idx++) {
            ctx.font = mainFont;
            ctx.fillText(items[idx].main, cx, y);
            cx += widths[idx].mw;
            if (items[idx].sub) {
              ctx.font = subFont;
              // ベースライン微調整：小文字はわずかに下げて視認性UP
              ctx.fillText(items[idx].sub, cx, y + 1);
              cx += widths[idx].sw;
            }
            if (idx < items.length - 1) {
              ctx.font = mainFont;
              ctx.fillText('/', cx, y);
              cx += sepW;
            }
          }
        };

        drawPlayerList(myPlayers, team.teamId, cellCx - scoreW / 2 - gap, subY, 'right', leftIsWinner);
        drawPlayerList(oppPlayers, oppTeam.teamId, cellCx + scoreW / 2 + gap, subY, 'left', false);
      }
    }

    // --- 勝敗列 --- 数字大きく / "勝"・"敗" 小さく
    const wins = standing?.wins ?? 0;
    const losses = standing?.losses ?? 0;
    const recL = tableX + numColW + nameColW + typeColW + scoreColW * teamCount;
    drawLine(recL, tableY + colHeaderH, recL, tableY + tableH, COL.slate200, 1);
    {
      const numFont = '900 26px "Inter", "Helvetica Neue", sans-serif';
      const labelFont = '700 14px "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.font = numFont;
      const wWins = ctx.measureText(String(wins)).width;
      const wLoss = ctx.measureText(String(losses)).width;
      ctx.font = labelFont;
      const wKachi = ctx.measureText('勝').width;
      const wMake = ctx.measureText('敗').width;
      const gap = 4;
      const total = wWins + wKachi + gap + wLoss + wMake;
      let cx = recL + (recordColW - total) / 2;
      const cy = rowTop + rowH / 2;
      ctx.textAlign = 'left';
      // 数字（26px）と文字（14px）を下揃え
      ctx.textBaseline = 'alphabetic';
      const baselineY = cy + 26 * 0.34;
      ctx.fillStyle = COL.slate800;
      ctx.font = numFont;
      ctx.fillText(String(wins), cx, baselineY);
      cx += wWins;
      ctx.fillStyle = COL.slate500;
      ctx.font = labelFont;
      ctx.fillText('勝', cx, baselineY);
      cx += wKachi + gap;
      ctx.fillStyle = COL.slate800;
      ctx.font = numFont;
      ctx.fillText(String(losses), cx, baselineY);
      cx += wLoss;
      ctx.fillStyle = COL.slate500;
      ctx.font = labelFont;
      ctx.fillText('敗', cx, baselineY);
    }

    // --- 順位列 --- 数字大きく / "位" 小さく
    const rkL = recL + recordColW;
    drawLine(rkL, tableY + colHeaderH, rkL, tableY + tableH, COL.slate200, 1);
    const rank = standing?.rank ?? 0;
    const rankCx = rkL + rankColW / 2;
    const rankCy = rowTop + rowH / 2;
    if (rank > 0) {
      const numFont = '900 52px "Inter", "Helvetica Neue", sans-serif';
      const labelFont = '700 18px "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.font = numFont;
      const wNum = ctx.measureText(String(rank)).width;
      ctx.font = labelFont;
      const wKurai = ctx.measureText('位').width;
      const total = wNum + wKurai + 4;
      let cx = rankCx - total / 2;
      ctx.textAlign = 'left';
      // 数字（52px）と「位」（18px）を下揃え
      ctx.textBaseline = 'alphabetic';
      const baselineY = rankCy + 52 * 0.34;
      ctx.fillStyle = COL.slate800;
      ctx.font = numFont;
      ctx.fillText(String(rank), cx, baselineY);
      cx += wNum + 4;
      ctx.fillStyle = COL.slate500;
      ctx.font = labelFont;
      ctx.fillText('位', cx, baselineY);
    } else {
      drawText('-', rankCx, rankCy, 16, 'center', COL.slate300, 'normal');
    }
  }

  // 表の外枠（やや太め + 内側に薄い反射ライン）
  drawRoundRect(tableX, tableY, tableW, tableH, 18, undefined, COL.sky300, 1.5);
  drawRoundRect(tableX + 1.2, tableY + 1.2, tableW - 2.4, tableH - 2.4, 17, undefined, 'rgba(255,255,255,0.6)', 1);

  // ---- フッター: TCTA公式ロゴを右下に最小余白で配置 ----
  if (tctaLogo) {
    const logoX = paddingX + tableW - tctaW;
    const logoY = tableY + tableH + 8;
    ctx.drawImage(tctaLogo, logoX, logoY, tctaW, tctaH);
  }

  // PromiseでエンコードしてData URLを返す
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Canvas to Blob failed'));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.95);
  });
}

/** 団体戦リーグ結果をJPEGダウンロード */
export async function exportTeamLeagueResultJpeg(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  matches: TeamLeagueMatch[],
  allTeams: TeamEntry[],
  tournamentName: string,
  playerNameOverrides: Record<string, string> = {},
  matchFormat?: import('./types').MatchFormat,
  promotionOverrides: Record<string, string> = {},
) {
  const dataUrl = await generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, playerNameOverrides, matchFormat, promotionOverrides);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${league.leagueId.trim()}リーグ結果_団体戦.jpg`;
  a.click();
}
