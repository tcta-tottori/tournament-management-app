import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding, MatchType } from './types';

/** 種目表示順 */
const TYPE_ORDER: MatchType[] = ['MIX', 'WD', 'MD'];
const TYPE_LABEL: Record<MatchType, string> = { MIX: 'Mix', WD: 'WD', MD: 'MD' };

/** 種目別カラー（画面側と統一） */
const TYPE_COLORS: Record<MatchType, { bg: string; fg: string; accent: string }> = {
  MIX: { bg: '#ede9fe', fg: '#6d28d9', accent: '#8b5cf6' }, // violet
  WD:  { bg: '#fce7f3', fg: '#be185d', accent: '#ec4899' }, // pink
  MD:  { bg: '#e0f2fe', fg: '#0369a1', accent: '#0ea5e9' }, // sky
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

/** 団体戦リーグ結果を表形式で描画したCanvasからData URL (JPEG) を生成する */
export async function generateTeamLeagueResultDataUrl(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  matches: TeamLeagueMatch[],
  _allTeams: TeamEntry[],
  tournamentName: string,
): Promise<string> {
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
  const NAME_FONT = '500 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const SCORE_FONT = 'bold 18px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';

  // ---- 対戦テキストの最大幅を事前計測して scoreColW を最適化 ----
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  let maxTextW = 160;
  for (const m of matches) {
    if (m.leagueId !== league.leagueId) continue;
    for (const sub of m.subMatches) {
      if (sub.score1 === null || sub.score2 === null) continue;
      const p1 = (sub.players1 || []).join('/') || '　';
      const p2 = (sub.players2 || []).join('/') || '　';

      mctx.font = NAME_FONT;
      const p1W = mctx.measureText(p1).width;
      const p2W = mctx.measureText(p2).width;

      mctx.font = SCORE_FONT;
      const scoreW = mctx.measureText(`${sub.score1}-${sub.score2}`).width;

      const total = p1W + 10 + scoreW + 10 + p2W;
      if (total > maxTextW) maxTextW = total;
    }
  }
  const scoreColW = Math.min(300, Math.max(190, Math.ceil(maxTextW) + 30));

  // ---- レイアウト定数 ----
  const scale = 2;
  const paddingX = 56;
  const paddingY = 48;
  const headerH = 124; // 大きな角丸バッジ + 大会名 + 会場ロゴ
  const colHeaderH = 44;
  const rowH = 146;
  const nameColW = 190;
  const typeColW = 54;
  const recordColW = 96;
  const rankColW = 82;
  const tableW = nameColW + typeColW + scoreColW * teamCount + recordColW + rankColW;
  const tableH = colHeaderH + rowH * teamCount;

  // ---- フッター（TCTA横長ロゴ） ----
  const tctaMaxH = 100;
  const tctaMaxW = Math.min(400, tableW * 0.4);
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
  const footerH = Math.max(tctaH + 42, 70);

  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH + footerH;

  // ---- カラーパレット（refined sky palette） ----
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
  };

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景: 上部にごく薄い sky グラデを乗せて上質な印象に
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);
  const bgGrad = ctx.createLinearGradient(0, 0, 0, paddingY + headerH);
  bgGrad.addColorStop(0, '#f0f9ff');
  bgGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, totalW, paddingY + headerH);

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

  // 左: 大きな角丸バッジ（アルファベット1文字のみ）
  const badgeSize = 90;
  const badgeX = paddingX;
  const badgeY = paddingY + 14;

  // 外側影
  ctx.save();
  ctx.shadowColor = 'rgba(3, 105, 161, 0.32)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeSize);
  badgeGrad.addColorStop(0, COL.sky500);
  badgeGrad.addColorStop(0.55, COL.sky600);
  badgeGrad.addColorStop(1, COL.sky800);
  drawRoundRect(badgeX, badgeY, badgeSize, badgeSize, 20, badgeGrad);
  ctx.restore();

  // 内側ハイライト（上半分に微妙な明るさ）
  const innerHL = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeSize * 0.55);
  innerHL.addColorStop(0, 'rgba(255,255,255,0.22)');
  innerHL.addColorStop(1, 'rgba(255,255,255,0)');
  drawRoundRect(badgeX + 2, badgeY + 2, badgeSize - 4, badgeSize * 0.55, 18, innerHL);

  // 内側ボーダー
  drawRoundRect(badgeX + 1.5, badgeY + 1.5, badgeSize - 3, badgeSize - 3, 18.5, undefined, 'rgba(255,255,255,0.35)', 1);

  // バッジ内の文字（大きく中央）
  ctx.fillStyle = COL.white;
  ctx.font = '900 62px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(leagueId, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 3);

  // バッジ横の小さなラベル
  drawText('リーグ', badgeX + badgeSize + 16, badgeY + 38, 15, 'left', COL.slate600, 'bold');
  ctx.save();
  ctx.font = 'bold 10px "Inter", sans-serif';
  ctx.fillStyle = COL.sky500;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRELIMINARY', badgeX + badgeSize + 16, badgeY + 58);
  ctx.restore();

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

  // ---- 表全体枠（影付け） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  drawRoundRect(tableX, tableY, tableW, tableH, 16, COL.white);
  ctx.restore();

  // 列ヘッダー背景（角丸マスク）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tableX + 16, tableY);
  ctx.arcTo(tableX + tableW, tableY, tableX + tableW, tableY + colHeaderH, 16);
  ctx.arcTo(tableX + tableW, tableY + colHeaderH, tableX, tableY + colHeaderH, 0);
  ctx.arcTo(tableX, tableY + colHeaderH, tableX, tableY, 0);
  ctx.arcTo(tableX, tableY, tableX + tableW, tableY, 16);
  ctx.clip();
  const headGrad = ctx.createLinearGradient(tableX, tableY, tableX, tableY + colHeaderH);
  headGrad.addColorStop(0, '#f8fafc');
  headGrad.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  ctx.restore();

  // 列ヘッダー下の強めのライン
  drawLine(tableX, tableY + colHeaderH, tableX + tableW, tableY + colHeaderH, COL.sky500, 1.5);

  // ---- 列ヘッダー テキスト ----
  const thColor = COL.sky800;
  drawText('チーム', tableX + nameColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');
  drawText('種目', tableX + nameColW + typeColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, 'black');

  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const x = tableX + nameColW + typeColW + scoreColW * i + scoreColW / 2;
    const shortName = team.teamName.split(/[\s\u3000]+/)[0] || team.teamName;
    drawText(shortName, x, tableY + colHeaderH / 2, 12, 'center', thColor, 'black', scoreColW - 14);
  }
  let colCursor = tableX + nameColW + typeColW + scoreColW * teamCount;
  drawText('勝敗', colCursor + recordColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');
  colCursor += recordColW;
  drawText('順位', colCursor + rankColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, 'black');

  // 各行レイアウト: 上部の総合勝敗 + 3サブ行
  const overallAreaH = 38;
  const subAreaH = rowH - overallAreaH;
  const subH = subAreaH / 3;

  // ---- 各行の描画 ----
  for (let rowIdx = 0; rowIdx < teamCount; rowIdx++) {
    const team = teams[rowIdx];
    const standing = standings.find(s => s.teamId === team.teamId);
    const rowTop = tableY + colHeaderH + rowH * rowIdx;

    if (rowIdx > 0) {
      drawLine(tableX, rowTop, tableX + tableW, rowTop, COL.slate200, 1);
    }

    const subAreaTop = rowTop + overallAreaH;
    const subCenters = [0, 1, 2].map(i => subAreaTop + subH * i + subH / 2);

    // --- チーム名列 ---
    // チーム番号バッジ（小）
    drawRoundRect(tableX + 12, rowTop + rowH / 2 - 16, 32, 32, 8, COL.sky50, COL.sky400, 1.5);
    drawText(String(team.numberInLeague), tableX + 28, rowTop + rowH / 2, 16, 'center', COL.sky700, 'black');
    drawText(team.teamName, tableX + 52, rowTop + rowH / 2, 16, 'left', COL.slate900, 'bold', nameColW - 60);

    // --- 種目列 ---
    const typeColX = tableX + nameColW;
    drawLine(typeColX, tableY + colHeaderH, typeColX, tableY + tableH, COL.slate200, 1);

    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      const tc = TYPE_COLORS[mt];
      const tagW = 40;
      const tagH = 22;
      const tagX = typeColX + (typeColW - tagW) / 2;
      const tagY = subCenters[i] - tagH / 2;
      // 背景 + 細い縁取り
      drawRoundRect(tagX, tagY, tagW, tagH, 6, tc.bg, tc.accent, 1);
      ctx.fillStyle = tc.fg;
      ctx.font = 'bold 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], tagX + tagW / 2, tagY + tagH / 2 + 0.5);
    }

    // サブ行の境界線
    const subRowRightEdge = tableX + nameColW + typeColW + scoreColW * teamCount;
    drawLine(typeColX, subAreaTop, subRowRightEdge, subAreaTop, COL.slate200, 0.8);
    for (let i = 1; i < 3; i++) {
      const y = subAreaTop + subH * i;
      drawLine(typeColX, y, subRowRightEdge, y, COL.slate100, 0.6);
    }

    // --- 対戦スコア列 ---
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + nameColW + typeColW + scoreColW * colIdx;

      drawLine(x, tableY + colHeaderH, x, tableY + tableH, COL.slate200, 1);

      if (colIdx === rowIdx) {
        ctx.fillStyle = COL.slate50;
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        drawLine(x + 8, rowTop + 8, x + scoreColW - 8, rowTop + rowH - 8, COL.slate200, 1);
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

      // 総合勝敗（各対戦セル上部）— 目立つ大きな数字
      const overallY = rowTop + overallAreaH / 2;
      ctx.font = '900 22px "Inter", "Helvetica Neue", sans-serif';
      ctx.fillStyle = won ? COL.sky700 : COL.slate400;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${myWins}-${oppWins}`, x + scoreColW / 2, overallY);

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
        const myP = myPlayers.join('/') || '　';
        const oppP = oppPlayers.join('/') || '　';
        const scoreText = `${myScore}-${oppScore}`;

        // 計測
        ctx.font = NAME_FONT;
        const myNameW = ctx.measureText(myP).width;
        const oppNameW = ctx.measureText(oppP).width;

        ctx.font = SCORE_FONT;
        const scoreW = ctx.measureText(scoreText).width;

        const gap = 9;
        const totalW = myNameW + gap + scoreW + gap + oppNameW;
        const cellCx = x + scoreColW / 2;
        const startX = cellCx - totalW / 2;

        const nameColor = subWon ? COL.slate700 : COL.slate500;
        const scoreColor = subWon ? tc.fg : COL.slate400;

        // 左選手名（小）
        ctx.font = NAME_FONT;
        ctx.fillStyle = nameColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(myP, startX, subY);

        // スコア（大・目立つ・種目色）
        ctx.font = SCORE_FONT;
        ctx.fillStyle = scoreColor;
        ctx.fillText(scoreText, startX + myNameW + gap, subY);

        // 右選手名（小）
        ctx.font = NAME_FONT;
        ctx.fillStyle = nameColor;
        ctx.fillText(oppP, startX + myNameW + gap + scoreW + gap, subY);
      }
    }

    // --- 勝敗列 ---
    const wins = standing?.wins ?? 0;
    const losses = standing?.losses ?? 0;
    const recL = tableX + nameColW + typeColW + scoreColW * teamCount;
    drawLine(recL, tableY + colHeaderH, recL, tableY + tableH, COL.slate200, 1);
    drawText(`${wins}勝${losses}敗`, recL + recordColW / 2, rowTop + rowH / 2, 15, 'center', COL.slate800, 'bold');

    // --- 順位列 ---
    const rkL = recL + recordColW;
    drawLine(rkL, tableY + colHeaderH, rkL, tableY + tableH, COL.slate200, 1);
    const rank = standing?.rank ?? 0;
    if (rank > 0) {
      drawText(`${rank}位`, rkL + rankColW / 2, rowTop + rowH / 2, 20, 'center', COL.slate800, 'black');
    } else {
      drawText('-', rkL + rankColW / 2, rowTop + rowH / 2, 16, 'center', COL.slate300, 'normal');
    }
  }

  // 表の外枠
  drawRoundRect(tableX, tableY, tableW, tableH, 16, undefined, COL.sky200, 1.5);

  // ---- フッター: TCTA公式ロゴを左下に配置（添付 logo-tcta.png） ----
  if (tctaLogo) {
    const logoX = paddingX;
    const logoY = tableY + tableH + 24;
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
) {
  const dataUrl = await generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${league.leagueId.trim()}リーグ結果_団体戦.jpg`;
  a.click();
}
