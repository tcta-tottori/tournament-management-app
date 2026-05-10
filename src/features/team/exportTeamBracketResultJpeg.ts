import type { TeamPlacementBracket, TeamBracketMatch, TeamEntry, MatchType, PlacementCategory, MatchFormat } from './types';
import { resolveBracketLabel, getMatchTypeOrder } from './teamLogic';

const TYPE_LABEL: Record<MatchType, string> = {
  MIX: 'Mix', WD: 'WD', MD: 'MD',
  D1: 'D1', D2: 'D2', D3: 'D3', S1: 'S1', S2: 'S2',
};

/** 種目別カラー（画面側・予選リーグ結果と統一） */
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

/** カテゴリ別カラー（ヘッダーのバッジに使用） */
const CATEGORY_COLORS: Record<PlacementCategory, { c1: string; c2: string; c3: string }> = {
  '1st': { c1: '#fbbf24', c2: '#f59e0b', c3: '#b45309' }, // amber / gold
  '2nd': { c1: '#cbd5e1', c2: '#94a3b8', c3: '#475569' }, // slate / silver
  '3rd': { c1: '#fb923c', c2: '#f97316', c3: '#c2410c' }, // orange / bronze
  '4th': { c1: '#60a5fa', c2: '#3b82f6', c3: '#1d4ed8' }, // blue
};

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

/** 団体戦決勝トーナメントの結果画像を生成する */
export async function generateTeamBracketResultDataUrl(
  bracket: TeamPlacementBracket,
  _allTeams: TeamEntry[],
  tournamentName: string,
  customLabels?: Partial<Record<PlacementCategory, string>>,
  matchFormat?: MatchFormat,
): Promise<string> {
  // 公式ロゴ・会場ロゴを事前に読み込む
  const base = import.meta.env.BASE_URL;
  const [tctaLogo, venueLogo] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
  ]);

  // 試合形式に応じた種目順
  const TYPE_ORDER = getMatchTypeOrder(matchFormat);
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMatches: TeamBracketMatch[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    roundMatches.push(
      matches.filter(m => m.round === r).sort((a, b) => a.position - b.position),
    );
  }

  // ---- レイアウト定数 ----
  const scale = 2;
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110;
  const matchW = 260;
  const matchH = 158; // チーム名2段 + サブマッチ3行 + ステータス
  const roundGap = 44;
  const matchGap = 22;

  const gridUnit = matchH + matchGap;
  const r1Count = roundMatches[0]?.length || 0;

  // 接続線がはみ出さないよう、上部に余裕を持たせる
  const bracketTopPad = 56; // ラウンドラベル用（少し広めに）
  // ブラケット内側の左右マージン（カードが枠の縁に張り付かないように）
  const bracketSidePad = 28;
  const bracketW = maxRound * matchW + (maxRound - 1) * roundGap;
  // tableW はブラケット幅 + 左右パディングを確保
  const tableW = Math.max(bracketW + bracketSidePad * 2, 760);

  // ---- TCTA横長ロゴのサイズ計算（大きめに表示） ----
  const tctaMaxH = 96;
  const tctaMaxW = Math.min(440, tableW * 0.5);
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

  // 下部パディング: 最後のマッチ下端～ブラケット枠下端の余白（最小限）
  // ロゴはブラケットの空きスペース（右下）にオーバーラップ配置する
  const bracketContentH = r1Count * gridUnit; // マッチ本体の高さ
  const bracketBottomPad = 14; // 枠線まで最小余白
  const bracketH = bracketContentH + bracketTopPad + bracketBottomPad;

  const totalW = tableW + paddingX * 2;
  const paddingYBottom = 12; // 下部は最小限
  const totalH = paddingY + paddingYBottom + headerH + bracketH;

  // ---- カラーパレット ----
  const COL = {
    white: '#ffffff',
    sky50: '#f0f9ff',
    sky100: '#e0f2fe',
    sky200: '#bae6fd',
    sky300: '#7dd3fc',
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
  };

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景（白）
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- 上端アクセントバー（水色ベース） ----
  const topBarH = 5;
  const topBarGrad = ctx.createLinearGradient(0, 0, totalW, 0);
  topBarGrad.addColorStop(0,   COL.sky300);
  topBarGrad.addColorStop(0.5, COL.sky500);
  topBarGrad.addColorStop(1,   COL.sky300);
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
  ) => {
    const weightMap = { normal: '500', medium: '600', bold: '700', black: '900' };
    ctx.fillStyle = color;
    ctx.font = `${weightMap[weight]} ${size}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
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
  };

  // ---- ヘッダー ----
  // 左: "◯位トーナメント" を一体化した横長バッジ
  const catColor = CATEGORY_COLORS[bracket.category];
  const catText = resolveBracketLabel(bracket.category, customLabels);

  // バッジサイズをテキスト幅に合わせて決定
  const badgeFontSize = 30;
  const badgeH = 62;
  ctx.font = `900 ${badgeFontSize}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
  const badgeTextW = ctx.measureText(catText).width;
  const badgePadX = 28;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeX = paddingX;
  const badgeY = paddingY + (headerH - badgeH) / 2 - 8;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
  badgeGrad.addColorStop(0, catColor.c1);
  badgeGrad.addColorStop(0.55, catColor.c2);
  badgeGrad.addColorStop(1, catColor.c3);
  drawRoundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeGrad);
  ctx.restore();

  // 内側ハイライト
  const innerHL = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH * 0.55);
  innerHL.addColorStop(0, 'rgba(255,255,255,0.32)');
  innerHL.addColorStop(1, 'rgba(255,255,255,0)');
  drawRoundRect(badgeX + 2, badgeY + 2, badgeW - 4, badgeH * 0.55, badgeH / 2 - 2, innerHL);

  // 内側ボーダー
  drawRoundRect(badgeX + 1.5, badgeY + 1.5, badgeW - 3, badgeH - 3, badgeH / 2 - 1.5, undefined, 'rgba(255,255,255,0.45)', 1);

  // バッジ内テキスト
  ctx.fillStyle = COL.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${badgeFontSize}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
  ctx.fillText(catText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 2);

  // 右: 大会名 + 会場ロゴ
  const headerRightX = paddingX + tableW;
  if (tournamentName) {
    drawText(tournamentName, headerRightX, paddingY + 34, 22, 'right', COL.slate800, 'bold', tableW - badgeW - 40);
  }
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

  // ---- ヘッダーと表の間のアクセントライン ----
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

  // ---- ブラケット本体エリア ----
  // 横方向は常にブラケットをフレーム内にセンタリング（左右に最低 bracketSidePad のマージン）
  const bracketAreaX = paddingX + Math.max(bracketSidePad, (tableW - bracketW) / 2);
  const bracketAreaY = paddingY + headerH;

  // 背景カード（白 + 水色ボーダー）
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  drawRoundRect(paddingX, bracketAreaY, tableW, bracketH, 18, COL.white);
  ctx.restore();
  drawRoundRect(paddingX, bracketAreaY, tableW, bracketH, 18, undefined, COL.sky200, 1.5);

  // 試合の中心Y座標
  const getMatchY = (ri: number, mi: number) => {
    const spacing = Math.pow(2, ri);
    const offset = (spacing - 1) * gridUnit / 2;
    return bracketAreaY + bracketTopPad + mi * spacing * gridUnit + offset + matchH / 2;
  };
  const getRoundX = (ri: number) => bracketAreaX + ri * (matchW + roundGap);

  const getRoundName = (round: number) => {
    if (round === maxRound) return '決勝';
    if (round === maxRound - 1) return '準決勝';
    if (round === maxRound - 2) return '準々決勝';
    return `${round}回戦`;
  };

  // ---- 接続線（水色ベースで統一） ----
  const lineColor = COL.sky300;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  for (let ri = 0; ri < roundMatches.length - 1; ri++) {
    const x1 = getRoundX(ri) + matchW;
    const x2 = getRoundX(ri + 1);
    const xMid = (x1 + x2) / 2;
    const rMatches = roundMatches[ri];
    for (let i = 0; i + 1 < rMatches.length; i += 2) {
      const y1 = getMatchY(ri, i);
      const y2 = getMatchY(ri, i + 1);
      const yNext = getMatchY(ri + 1, Math.floor(i / 2));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xMid, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(xMid, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xMid, y1); ctx.lineTo(xMid, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xMid, yNext); ctx.lineTo(x2, yNext); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ---- ラウンドラベル ----
  for (let ri = 0; ri < roundMatches.length; ri++) {
    const round = ri + 1;
    const roundName = getRoundName(round);
    const labelX = getRoundX(ri) + matchW / 2;
    const labelY = bracketAreaY + 26;

    const isFinal = round === maxRound;
    ctx.font = '900 12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    const labelW = ctx.measureText(roundName).width + 24;
    const labelH = 22;
    const labelBoxX = labelX - labelW / 2;
    const labelBoxY = labelY - labelH / 2;

    if (isFinal) {
      const grad = ctx.createLinearGradient(labelBoxX, 0, labelBoxX + labelW, 0);
      grad.addColorStop(0, COL.sky500);
      grad.addColorStop(1, COL.sky600);
      drawRoundRect(labelBoxX, labelBoxY, labelW, labelH, 11, grad);
      ctx.fillStyle = COL.white;
    } else {
      drawRoundRect(labelBoxX, labelBoxY, labelW, labelH, 11, COL.sky100, COL.sky200, 1);
      ctx.fillStyle = COL.sky700;
    }
    ctx.font = '900 12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roundName, labelX, labelY + 1);
  }

  // ---- マッチカード描画 ----
  const drawMatchCard = (ri: number, mi: number, match: TeamBracketMatch) => {
    const cx = getRoundX(ri);
    const cyCenter = getMatchY(ri, mi);
    const cy = cyCenter - matchH / 2;
    const isFinished = match.status === 'finished';

    // BYEマッチ: 「BYE」の文字は表示せず、通常のチーム行と同じスタイル（リーグ色バッジ + チーム名）で描画する
    if (match.isBye) {
      const byeName = match.team1Name || match.team2Name || '';
      const byeLeague = match.team1League || match.team2League || '';
      const byeH = 44;
      const byeY = cyCenter - byeH / 2;

      // カード背景（影付き、白 + 水色ボーダー）
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      drawRoundRect(cx, byeY, matchW, byeH, 12, COL.white);
      ctx.restore();
      drawRoundRect(cx, byeY, matchW, byeH, 12, undefined, COL.sky200, 1.5);

      // リーグ色バッジ（通常のチーム行と統一）
      const bgBadgeX = cx + 10;
      const bgBadgeW = 22;
      const bgBadgeH = 20;
      const bgBadgeY = byeY + (byeH - bgBadgeH) / 2;
      drawRoundRect(bgBadgeX, bgBadgeY, bgBadgeW, bgBadgeH, 5, COL.sky100, COL.sky200, 1);
      drawText(byeLeague || '-', bgBadgeX + bgBadgeW / 2, bgBadgeY + bgBadgeH / 2 + 0.5, 11, 'center', COL.sky700, 'black');

      // チーム名（中央寄せ風、badgeの右から右端まで）
      const nameX = bgBadgeX + bgBadgeW + 8;
      const nameMaxW = matchW - (nameX - cx) - 14;
      drawText(
        byeName || '---',
        nameX,
        byeY + byeH / 2,
        13,
        'left',
        COL.slate700,
        'bold',
        nameMaxW,
      );
      return;
    }

    // カード背景（影付き、白 + 水色ボーダー）
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    drawRoundRect(cx, cy, matchW, matchH, 12, COL.white);
    ctx.restore();

    const borderColor = isFinished ? COL.sky300 : COL.sky200;
    drawRoundRect(cx, cy, matchW, matchH, 12, undefined, borderColor, 1.5);

    // 上部: チーム名 × 2段
    const teamRowH = 28;
    const teamAreaY = cy + 6;

    const drawTeamRow = (idx: 0 | 1) => {
      const teamId = idx === 0 ? match.team1Id : match.team2Id;
      const teamName = idx === 0 ? match.team1Name : match.team2Name;
      const teamLeague = idx === 0 ? match.team1League : match.team2League;
      const wins = idx === 0 ? match.winsTeam1 : match.winsTeam2;
      const isWinner = isFinished && match.winnerId === teamId;

      const rowY = teamAreaY + idx * teamRowH;

      // 勝者の背景ハイライト（水色ベース）
      if (isWinner) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
        ctx.fillRect(cx + 6, rowY + 2, matchW - 12, teamRowH - 2);
      }

      // リーグバッジ
      const badgeX2 = cx + 10;
      const badgeY2 = rowY + (teamRowH - 20) / 2;
      const bgW = 22;
      const bgH = 20;
      drawRoundRect(badgeX2, badgeY2, bgW, bgH, 5, COL.sky100, COL.sky200, 1);
      drawText(teamLeague || '-', badgeX2 + bgW / 2, badgeY2 + bgH / 2 + 0.5, 11, 'center', COL.sky700, 'black');

      // チーム名
      const nameX = badgeX2 + bgW + 8;
      const scoreBoxW = 30;
      const nameMaxW = matchW - (nameX - cx) - scoreBoxW - 14;
      drawText(
        teamName || '---',
        nameX,
        rowY + teamRowH / 2,
        13,
        'left',
        isWinner ? COL.sky700 : COL.slate700,
        isWinner ? 'black' : 'bold',
        nameMaxW,
      );

      // 勝利数表示（マッチ勝者=色付き）
      if (isFinished) {
        drawText(
          String(wins),
          cx + matchW - 16,
          rowY + teamRowH / 2,
          17,
          'right',
          isWinner ? COL.sky600 : COL.slate300,
          'black',
        );
      }
    };
    drawTeamRow(0);
    // チーム間のセパレータ
    drawLine(cx + 8, teamAreaY + teamRowH, cx + matchW - 8, teamAreaY + teamRowH, COL.slate100, 1);
    drawTeamRow(1);

    // サブマッチエリア
    const subAreaY = teamAreaY + teamRowH * 2 + 6;
    const subAreaH2 = matchH - (subAreaY - cy) - 10;
    drawLine(cx + 8, subAreaY, cx + matchW - 8, subAreaY, COL.slate200, 1);

    const subRowH = subAreaH2 / 3;
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      const sub = match.subMatches.find(s => s.type === mt);
      const subY = subAreaY + i * subRowH + subRowH / 2;

      // 種目バッジ
      const tc = TYPE_COLORS[mt];
      const tagW = 30;
      const tagH = 15;
      const tagX = cx + 10;
      const tagY = subY - tagH / 2;
      drawRoundRect(tagX, tagY, tagW, tagH, 4, tc.bg, tc.accent, 1);
      ctx.fillStyle = tc.fg;
      ctx.font = 'bold 9px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], tagX + tagW / 2, tagY + tagH / 2 + 0.5);

      if (!sub || sub.score1 === null || sub.score2 === null) {
        drawText('—', cx + matchW / 2, subY, 11, 'center', COL.slate300);
        continue;
      }

      // スコア + 選手名
      const won1 = sub.winnerId === match.team1Id;
      const won2 = sub.winnerId === match.team2Id;
      const p1 = (sub.players1 || []).join('/') || '';
      const p2 = (sub.players2 || []).join('/') || '';

      // 中央にスコア、両サイドに選手名
      const scoreText = `${sub.score1} - ${sub.score2}`;
      ctx.font = 'bold 13px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      const scoreWid = ctx.measureText(scoreText).width;
      const scoreColor = won1 ? COL.sky700 : won2 ? '#be185d' : COL.slate500;

      const scoreCx = cx + matchW / 2 + 6;
      ctx.fillStyle = scoreColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(scoreText, scoreCx, subY);

      // 左選手名
      const leftX = tagX + tagW + 6;
      const leftMaxW = scoreCx - scoreWid / 2 - leftX - 6;
      if (p1 && leftMaxW > 10) {
        ctx.font = `${won1 ? 'bold' : '500'} 10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = COL.slate600;
        ctx.textAlign = 'right';
        ctx.fillText(p1, scoreCx - scoreWid / 2 - 5, subY, leftMaxW);
      }
      // 右選手名
      const rightX = scoreCx + scoreWid / 2 + 5;
      const rightMaxW = cx + matchW - 10 - rightX;
      if (p2 && rightMaxW > 10) {
        ctx.font = `${won2 ? 'bold' : '500'} 10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = COL.slate600;
        ctx.textAlign = 'left';
        ctx.fillText(p2, rightX, subY, rightMaxW);
      }
    }
  };

  // 全マッチ描画（接続線の後に描画することでカードが前面に出る）
  for (let ri = 0; ri < roundMatches.length; ri++) {
    for (let mi = 0; mi < roundMatches[ri].length; mi++) {
      drawMatchCard(ri, mi, roundMatches[ri][mi]);
    }
  }

  // ---- TCTAロゴ: ブラケット枠内の右下空きスペースに配置 ----
  // ブラケット枠の下ラインより上にロゴの下端が来るように配置
  if (tctaLogo) {
    const logoMarginX = 16;
    const logoMarginBottom = 6;
    const logoX = paddingX + tableW - tctaW - logoMarginX;
    const logoY = bracketAreaY + bracketH - tctaH - logoMarginBottom;
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

/** 団体戦決勝トーナメント結果をJPEGダウンロード */
export async function exportTeamBracketResultJpeg(
  bracket: TeamPlacementBracket,
  allTeams: TeamEntry[],
  tournamentName: string,
  customLabels?: Partial<Record<PlacementCategory, string>>,
  matchFormat?: MatchFormat,
) {
  const dataUrl = await generateTeamBracketResultDataUrl(bracket, allTeams, tournamentName, customLabels, matchFormat);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${resolveBracketLabel(bracket.category, customLabels)}_結果_団体戦.jpg`;
  a.click();
}
