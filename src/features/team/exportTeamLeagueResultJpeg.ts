import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding, MatchType } from './types';
import { getMatchTypeOrder, getDisplayNameParts, resolveClubPromotionStatus } from './teamLogic';
import { buildResultFileName, leagueDivisionLabel } from './resultFileName';
import {
  COL, drawResultFrame, drawResultHeader, drawScorePair, promotionBadgeStyle,
} from '../draw/resultCanvasKit';

const TYPE_LABEL: Record<MatchType, string> = {
  MIX: 'Mix', WD: 'WD', MD: 'MD',
  D1: 'D1', D2: 'D2', D3: 'D3', S1: 'S1', S2: 'S2',
};

/**
 * 種目ラベルの文字色。
 * 白ベース＋赤の差し色というトンマナに合わせ、種目は色分けせず墨で統一する
 * （種目は D1 / S1 などのラベル自体で判別できる）。
 */
const TYPE_TEXT = COL.gray800;

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
  venue?: string,
): Promise<string> {
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
  const [tctaLogo, venueLogo, tottoriLogo] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
    tryLoadImage(`${base}logo-tottori-univ.png`),
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
  const headerH = 160; // 見出し + 大会名 + 会場ロゴ + 英字（ストライプ文字）
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

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景: リーグの枠外は完全な白で塗りつぶす（ロゴの矩形が背景に浮かないように）
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘルパー ----
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string = COL.gray200, w = 1) => {
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
    color: string = COL.gray800,
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

  // ---- ヘッダー（他の結果画像と共通の意匠：赤い四角＋墨の見出し）----
  drawResultHeader(ctx, {
    title: leagueDivisionLabel(league.leagueId.trim()),
    tournamentName,
    venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos: { tcta: tctaLogo, venue: venueLogo, tottori: tottoriLogo },
    titlePx: 56,
  });

  // ---- 表全体枠（影付け - より上質な深さ） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
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
  headGrad.addColorStop(0, COL.white);
  headGrad.addColorStop(1, COL.gray100);
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  // 列ヘッダー上端の細い光彩ライン
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(tableX, tableY, tableW, 1.5);
  ctx.restore();

  // 列ヘッダー下の強めのライン（差し色の赤）
  ctx.strokeStyle = COL.red500;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(tableX, tableY + colHeaderH);
  ctx.lineTo(tableX + tableW, tableY + colHeaderH);
  ctx.stroke();

  // ---- 列ヘッダー テキスト ----
  const thColor = COL.gray800;
  drawText('No.', tableX + numColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, 'black');
  drawText('チーム', tableX + numColW + nameColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');
  drawText('種目', tableX + numColW + nameColW + typeColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, 'black');

  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const x = tableX + numColW + nameColW + typeColW + scoreColW * i + scoreColW / 2;
    drawText(team.teamName, x, tableY + colHeaderH / 2, 18, 'center', thColor, 'black', scoreColW - 10);
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
      drawLine(tableX, rowTop, tableX + tableW, rowTop, COL.gray200, 1);
    }

    const subAreaTop = rowTop + overallAreaH;
    const subCenters = Array.from({ length: subCount }, (_, i) => subAreaTop + subH * i + subH / 2);

    // --- 番号列 (バッジなし、専用列に大きな数字) ---
    const numColCenterX = tableX + numColW / 2;
    // 番号列に薄い背景帯を入れて視覚的に独立させる
    ctx.fillStyle = COL.gray50;
    ctx.fillRect(tableX + 0.5, rowTop + 0.5, numColW - 0.5, rowH - 1);
    drawText(String(team.teamNumber), numColCenterX, rowTop + rowH / 2, 20, 'center', COL.gray500, 'black');
    // 番号列とチーム名列の境界
    drawLine(tableX + numColW, tableY + colHeaderH, tableX + numColW, tableY + tableH, COL.gray200, 1);

    // --- チーム名列 ---
    drawText(team.teamName, tableX + numColW + 14, rowTop + rowH / 2 - 10, 22, 'left', COL.gray900, 'black', nameColW - 22);

    // 昇降格バッジ（クラブ対抗戦のみ、確定後に表示。右下に配置）
    if (standing) {
      const promo = resolveClubPromotionStatus(league.leagueId, standing.rank, promotionOverrides[team.teamId]);
      if (promo) {
        const badgeStyle = promotionBadgeStyle(promo.kind);
        const badgeFont = '800 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.save();
        ctx.font = badgeFont;
        const txtW = ctx.measureText(promo.label).width;
        const padX = 8;
        const bw = txtW + padX * 2;
        const bh = 18;
        const bx = tableX + numColW + nameColW - bw - 8;
        const by = rowTop + rowH - bh - 6;
        drawRoundRect(bx, by, bw, bh, bh / 2, badgeStyle.bg, badgeStyle.border, 1.5);
        ctx.fillStyle = badgeStyle.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(promo.label, bx + bw / 2, by + bh / 2 + 0.5);
        ctx.restore();
      }
    }

    // --- 種目列 ---
    const typeColX = tableX + numColW + nameColW;
    drawLine(typeColX, tableY + colHeaderH, typeColX, tableY + tableH, COL.gray200, 1);

    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      // シンプルなテキスト表示（バッジなし・墨で統一）
      ctx.fillStyle = TYPE_TEXT;
      ctx.font = '900 14px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], typeColX + typeColW / 2, subCenters[i]);
    }

    // 種目列の上部（総合勝敗エリア）に「勝敗」ラベルを表示
    const overallY = rowTop + overallAreaH / 2;
    drawText('勝敗', typeColX + typeColW / 2, overallY, 11, 'center', COL.gray500, 'bold');

    // サブ行の境界線
    const subRowRightEdge = tableX + numColW + nameColW + typeColW + scoreColW * teamCount;
    drawLine(typeColX, subAreaTop, subRowRightEdge, subAreaTop, COL.gray200, 0.8);
    for (let i = 1; i < subCount; i++) {
      const y = subAreaTop + subH * i;
      drawLine(typeColX, y, subRowRightEdge, y, COL.gray100, 0.6);
    }

    // --- 対戦スコア列 ---
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + numColW + nameColW + typeColW + scoreColW * colIdx;

      drawLine(x, tableY + colHeaderH, x, tableY + tableH, COL.gray200, 1);

      const oppTeam = teams[colIdx];
      const match = colIdx === rowIdx ? undefined : matches.find(m =>
        m.leagueId === league.leagueId &&
        ((m.team1Id === team.teamId && m.team2Id === oppTeam.teamId) ||
          (m.team1Id === oppTeam.teamId && m.team2Id === team.teamId))
      );

      if (colIdx === rowIdx || !match) {
        // 対戦無しセル（同チーム同士の交点、または変則リーグで対戦の無い組み合わせ）
        // 背景: ごく淡いベタ塗りで他と差別化（slate-50）
        ctx.fillStyle = COL.gray50;
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        // 右肩下がりの斜め線：両端透明 → 中央 slate-300 のグラデで控えめにおしゃれに
        ctx.save();
        const lx0 = x + 10;
        const ly0 = rowTop + 10;
        const lx1 = x + scoreColW - 10;
        const ly1 = rowTop + rowH - 10;
        const lineGrad = ctx.createLinearGradient(lx0, ly0, lx1, ly1);
        lineGrad.addColorStop(0,    'rgba(120, 120, 120, 0)');
        lineGrad.addColorStop(0.15, 'rgba(120, 120, 120, 0.35)');
        lineGrad.addColorStop(0.5,  'rgba(90, 90, 90, 0.55)');
        lineGrad.addColorStop(0.85, 'rgba(120, 120, 120, 0.35)');
        lineGrad.addColorStop(1,    'rgba(120, 120, 120, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.lineTo(lx1, ly1);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (match.status !== 'finished') continue;

      const isTeam1 = match.team1Id === team.teamId;
      const won = match.winnerId === team.teamId;
      const myWins = isTeam1 ? match.winsTeam1 : match.winsTeam2;
      const oppWins = isTeam1 ? match.winsTeam2 : match.winsTeam1;

      // 勝利側のセルは淡い赤でハイライト
      if (won) {
        const wonGrad = ctx.createLinearGradient(x, rowTop, x, rowTop + rowH);
        wonGrad.addColorStop(0, COL.white);
        wonGrad.addColorStop(1, COL.red50);
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
        pillGrad.addColorStop(0, COL.champ2);
        pillGrad.addColorStop(1, COL.champ3);
        drawRoundRect(bx2, by2, bw, bh, bh / 2, pillGrad);
      } else {
        drawRoundRect(bx2, by2, bw, bh, bh / 2, COL.gray50, COL.gray300, 1);
      }
      // 描画開始位置（左端）。混合サイズは下揃え（alphabetic baseline）で描画
      let bcx = bx2 + badgePadX;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const baselineY = overallY + 18 * 0.34;
      const numColor = won ? COL.white : COL.gray500;
      const labelColor = won ? 'rgba(255,255,255,0.75)' : COL.gray400;
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

        if (!sub || sub.score1 === null || sub.score2 === null) {
          drawText('—', x + scoreColW / 2, subY, 13, 'center', COL.gray300, 'normal');
          continue;
        }

        const myScore = isTeam1 ? sub.score1 : sub.score2;
        const oppScore = isTeam1 ? sub.score2 : sub.score1;
        const subWon = sub.winnerId === team.teamId;
        const myPlayers = (isTeam1 ? sub.players1 : sub.players2) || [];
        const oppPlayers = (isTeam1 ? sub.players2 : sub.players1) || [];
        // 左 = 行チーム（自分）、右 = 対戦相手。
        // 「左側が勝者のセル（subWon）」では左の選手名のみ太字にして強調する。
        const leftIsWinner = subWon;
        const nameColor = COL.gray700;

        // 【中央揃えレイアウト】
        // スコア（"6 - 4"）をセル中央に配置し、左右の選手名はスコアを挟むように配置する。
        const cellCx = x + scoreColW / 2;
        const gap = CELL_GAP;

        // スコアをセル中央に描画（勝った側の数字だけ赤にする）
        const scoreW = drawScorePair(ctx, {
          left: myScore, right: oppScore,
          centerX: cellCx, centerY: subY, px: 18,
          leftWin: leftIsWinner, rightWin: !leftIsWinner && sub.winnerId === oppTeam.teamId,
        });

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
    drawLine(recL, tableY + colHeaderH, recL, tableY + tableH, COL.gray200, 1);
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
      ctx.fillStyle = COL.gray800;
      ctx.font = numFont;
      ctx.fillText(String(wins), cx, baselineY);
      cx += wWins;
      ctx.fillStyle = COL.gray500;
      ctx.font = labelFont;
      ctx.fillText('勝', cx, baselineY);
      cx += wKachi + gap;
      ctx.fillStyle = COL.gray800;
      ctx.font = numFont;
      ctx.fillText(String(losses), cx, baselineY);
      cx += wLoss;
      ctx.fillStyle = COL.gray500;
      ctx.font = labelFont;
      ctx.fillText('敗', cx, baselineY);
    }

    // --- 順位列 --- 数字大きく / "位" 小さく
    const rkL = recL + recordColW;
    drawLine(rkL, tableY + colHeaderH, rkL, tableY + tableH, COL.gray200, 1);
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
      ctx.fillStyle = COL.gray800;
      ctx.font = numFont;
      ctx.fillText(String(rank), cx, baselineY);
      cx += wNum + 4;
      ctx.fillStyle = COL.gray500;
      ctx.font = labelFont;
      ctx.fillText('位', cx, baselineY);
    } else {
      drawText('-', rankCx, rankCy, 16, 'center', COL.gray300, 'normal');
    }
  }

  // 表の外枠（ブランド赤の二重線）
  drawResultFrame(ctx, tableX, tableY, tableW, tableH, 18);

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
  venue?: string,
) {
  const dataUrl = await generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, playerNameOverrides, matchFormat, promotionOverrides, venue);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = buildResultFileName(tournamentName, `${leagueDivisionLabel(league.leagueId)}結果_団体戦`);
  a.click();
}
