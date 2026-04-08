import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding, MatchType } from './types';

/** 種目表示順 */
const TYPE_ORDER: MatchType[] = ['MIX', 'WD', 'MD'];
const TYPE_LABEL: Record<MatchType, string> = { MIX: 'Mix', WD: 'WD', MD: 'MD' };

/** 団体戦リーグ結果を表形式で描画したCanvasからData URL (JPEG) を生成する */
export async function generateTeamLeagueResultDataUrl(
  league: TeamLeague,
  standings: TeamLeagueStanding[],
  matches: TeamLeagueMatch[],
  _allTeams: TeamEntry[],
  tournamentName: string,
): Promise<string> {
  // チーム番号順に並べ替え
  const teams = [...league.teams].sort((a, b) => a.numberInLeague - b.numberInLeague);
  const teamCount = teams.length;

  // ---- レイアウト定数 ----
  const scale = 2; // 高解像度
  const paddingX = 44;
  const paddingY = 44;
  const headerH = 74;
  const colHeaderH = 40;
  const rowH = 110;           // 3種目 + 勝数を縦に収める
  const nameColW = 220;
  const scoreColW = 230;      // 選手名入りスコア用にやや広め
  const recordColW = 86;
  const pointColW = 86;
  const ratioColW = 90;
  const rankColW = 66;
  const tableW = nameColW + scoreColW * teamCount + recordColW + pointColW + ratioColW + rankColW;
  const tableH = colHeaderH + rowH * teamCount;
  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH + 34; // フッター分

  // ---- 水色カラーパレット (TCTAロゴ準拠) ----
  const COL = {
    bgWhite: '#ffffff',
    sky50: '#f0f9ff',
    sky100: '#e0f2fe',
    sky200: '#bae6fd',
    sky400: '#38bdf8',
    sky500: '#0ea5e9',
    sky600: '#0284c7',
    sky700: '#0369a1',
    sky900: '#0c4a6e',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate300: '#cbd5e1',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    slate800: '#1e293b',
    rose500: '#f43f5e',
    rose600: '#e11d48',
  };

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景（白）
  ctx.fillStyle = COL.bgWhite;
  ctx.fillRect(0, 0, totalW, totalH);

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
    bold = false,
    maxWidth?: number,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : '500 '}${size}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
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
    fill?: string,
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
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  };

  // ---- ページヘッダー ----
  const pLId = league.leagueId.trim();

  // リーグバッジ（水色グラデ風）
  const badgeGrad = ctx.createLinearGradient(paddingX, paddingY - 12, paddingX + 60, paddingY + 48);
  badgeGrad.addColorStop(0, COL.sky400);
  badgeGrad.addColorStop(1, COL.sky600);
  ctx.save();
  ctx.shadowColor = 'rgba(14, 165, 233, 0.25)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  drawRoundRect(paddingX, paddingY - 12, 60, 60, 14, undefined);
  ctx.fillStyle = badgeGrad;
  ctx.fill();
  ctx.restore();
  drawText(pLId, paddingX + 30, paddingY + 18, 34, 'center', '#ffffff', true);

  // タイトル
  drawText('リーグ', paddingX + 74, paddingY + 6, 14, 'left', COL.sky600, true);
  drawText('団体戦 予選リーグ結果', paddingX + 74, paddingY + 26, 22, 'left', COL.sky900, true);
  if (league.courtName) {
    drawText(league.courtName, paddingX + 74, paddingY + 46, 12, 'left', COL.slate500, false);
  }

  // 大会名（右寄せ）
  drawText(tournamentName, paddingX + tableW, paddingY + 30, 18, 'right', COL.slate700, true);

  // ---- 表全体枠（影付け） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(14, 165, 233, 0.12)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  drawRoundRect(tableX, tableY, tableW, tableH, 14, COL.bgWhite);
  ctx.restore();

  // 列ヘッダー背景（角丸マスク）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tableX + 14, tableY);
  ctx.arcTo(tableX + tableW, tableY, tableX + tableW, tableY + colHeaderH, 14);
  ctx.arcTo(tableX + tableW, tableY + colHeaderH, tableX, tableY + colHeaderH, 0);
  ctx.arcTo(tableX, tableY + colHeaderH, tableX, tableY, 0);
  ctx.arcTo(tableX, tableY, tableX + tableW, tableY, 14);
  ctx.clip();
  const headGrad = ctx.createLinearGradient(tableX, tableY, tableX, tableY + colHeaderH);
  headGrad.addColorStop(0, COL.sky50);
  headGrad.addColorStop(1, COL.sky100);
  ctx.fillStyle = headGrad;
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  ctx.restore();

  drawLine(tableX, tableY + colHeaderH, tableX + tableW, tableY + colHeaderH, COL.sky400, 1.5);

  // ---- 列ヘッダー テキスト ----
  const thColor = COL.sky700;
  drawText('チーム', tableX + nameColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);

  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const x = tableX + nameColW + scoreColW * i + scoreColW / 2;
    const shortName = team.teamName.split(/[\s\u3000]+/)[0] || team.teamName;
    drawText(shortName, x, tableY + colHeaderH / 2, 12, 'center', thColor, true, scoreColW - 12);
  }
  let colCursor = tableX + nameColW + scoreColW * teamCount;
  drawText('勝敗', colCursor + recordColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);
  colCursor += recordColW;
  drawText('ポイント', colCursor + pointColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, true);
  colCursor += pointColW;
  drawText('ゲーム率', colCursor + ratioColW / 2, tableY + colHeaderH / 2, 12, 'center', thColor, true);
  colCursor += ratioColW;
  drawText('順位', colCursor + rankColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);

  // ---- 各行の描画 ----
  for (let rowIdx = 0; rowIdx < teamCount; rowIdx++) {
    const team = teams[rowIdx];
    const standing = standings.find(s => s.teamId === team.teamId);
    const rowTop = tableY + colHeaderH + rowH * rowIdx;

    // 行交互背景
    if (rowIdx % 2 === 1) {
      ctx.fillStyle = COL.sky50;
      ctx.fillRect(tableX + 0.5, rowTop + 0.5, tableW - 1, rowH - 1);
    }

    if (rowIdx > 0) {
      drawLine(tableX, rowTop, tableX + tableW, rowTop, COL.slate200, 1);
    }

    // --- チーム名列 ---
    // チーム番号バッジ
    drawRoundRect(tableX + 10, rowTop + rowH / 2 - 13, 26, 26, 7, COL.sky100, COL.sky400, 1);
    drawText(String(team.numberInLeague), tableX + 23, rowTop + rowH / 2, 14, 'center', COL.sky700, true);

    // チーム名本体
    drawText(team.teamName, tableX + 44, rowTop + rowH / 2 - 6, 15, 'left', COL.slate800, true, nameColW - 52);

    // メンバー一覧 (苗字のみ、最大4名まで)
    const familyOf = (n: string) => n.trim().split(/[\s\u3000]+/)[0] || n;
    const members = team.members.map(m => familyOf(m.player.name));
    const memberStr = members.slice(0, 6).join('・') + (members.length > 6 ? '…' : '');
    ctx.font = '10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = COL.slate500;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(memberStr, tableX + 44, rowTop + rowH / 2 + 12, nameColW - 52);

    // --- 対戦スコア列 ---
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + nameColW + scoreColW * colIdx;

      // 縦線
      drawLine(x, tableY, x, tableY + tableH, COL.slate200, 1);

      if (colIdx === rowIdx) {
        // 自分同士: 薄い灰色 & 斜線
        ctx.fillStyle = COL.slate100;
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        drawLine(x + 6, rowTop + 6, x + scoreColW - 6, rowTop + rowH - 6, COL.slate300, 1);
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

      // 勝利側は淡水色背景でハイライト
      if (won) {
        ctx.fillStyle = COL.sky100;
        ctx.fillRect(x + 1, rowTop + 1, scoreColW - 2, rowH - 2);
      }

      // 総合スコア (2-1 など) 右上
      drawText(
        `${myWins}-${oppWins}`,
        x + scoreColW - 10,
        rowTop + 14,
        13,
        'right',
        won ? COL.sky700 : COL.slate500,
        true,
      );

      // 種目ごとのスコア行 (選手名入り)
      const subRowGap = 2;
      const subRowH = (rowH - 26 - subRowGap * 2) / 3; // 残り高さを3等分
      const subStartY = rowTop + 24;

      for (let i = 0; i < TYPE_ORDER.length; i++) {
        const mt = TYPE_ORDER[i];
        const sub = match.subMatches.find(s => s.type === mt);
        const subY = subStartY + i * (subRowH + subRowGap) + subRowH / 2;

        // 種目タグ
        const tagW = 28;
        const tagH = 14;
        const tagX = x + 8;
        const tagY = subY - tagH / 2;
        drawRoundRect(tagX, tagY, tagW, tagH, 4, COL.sky200);
        ctx.fillStyle = COL.sky700;
        ctx.font = 'bold 9px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TYPE_LABEL[mt], tagX + tagW / 2, tagY + tagH / 2 + 0.5);

        if (!sub || sub.score1 === null || sub.score2 === null) {
          drawText('—', x + scoreColW / 2 + 10, subY, 11, 'center', COL.slate300, false);
          continue;
        }

        const myScore = isTeam1 ? sub.score1 : sub.score2;
        const oppScore = isTeam1 ? sub.score2 : sub.score1;
        const subWon = sub.winnerId === team.teamId;
        const myPlayers = (isTeam1 ? sub.players1 : sub.players2) || [];
        const oppPlayers = (isTeam1 ? sub.players2 : sub.players1) || [];
        const myP = myPlayers.join('/');
        const oppP = oppPlayers.join('/');

        // 選手名入りスコア: 田中/山本 6-1 山口/田中
        // 中心揃えで1行にまとめて描画
        const textColor = subWon ? COL.sky900 : COL.slate600;
        const contentX = tagX + tagW + 6;
        const contentW = scoreColW - (tagW + 14) - 8;
        const contentCx = contentX + contentW / 2;

        // 選手名＋スコアを一行で（幅に収まるよう maxWidth 指定）
        const text = `${myP || '　'} ${myScore}-${oppScore} ${oppP || '　'}`;
        ctx.font = `${subWon ? 'bold ' : '600 '}11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, contentCx, subY, contentW);
      }
    }

    // --- 勝敗列 ---
    const wins = standing?.wins ?? 0;
    const losses = standing?.losses ?? 0;
    const recL = tableX + nameColW + scoreColW * teamCount;
    drawLine(recL, tableY, recL, tableY + tableH, COL.slate200, 1);
    drawText(`${wins}勝${losses}敗`, recL + recordColW / 2, rowTop + rowH / 2, 14, 'center', COL.slate700, true);

    // --- ポイント列 ---
    const ptL = recL + recordColW;
    drawLine(ptL, tableY, ptL, tableY + tableH, COL.slate200, 1);
    const pointsWon = standing?.pointsWon ?? 0;
    const pointsLost = standing?.pointsLost ?? 0;
    drawText(`${pointsWon}-${pointsLost}`, ptL + pointColW / 2, rowTop + rowH / 2, 14, 'center', COL.slate700, true);

    // --- ゲーム率列 ---
    const grL = ptL + pointColW;
    drawLine(grL, tableY, grL, tableY + tableH, COL.slate200, 1);
    const gamesWon = standing?.gamesWon ?? 0;
    const gamesLost = standing?.gamesLost ?? 0;
    const total = gamesWon + gamesLost;
    const ratio = total === 0 ? 0 : gamesWon / total;
    drawText(ratio.toFixed(3), grL + ratioColW / 2, rowTop + rowH / 2 - 8, 14, 'center', COL.slate700, true);
    drawText(`${gamesWon}/${total}`, grL + ratioColW / 2, rowTop + rowH / 2 + 10, 10, 'center', COL.slate400, false);

    // --- 順位列 ---
    const rkL = grL + ratioColW;
    drawLine(rkL, tableY, rkL, tableY + tableH, COL.slate200, 1);
    const rank = standing?.rank ?? 0;
    if (rank > 0) {
      // 1位は水色の丸バッジ
      if (rank === 1) {
        ctx.save();
        ctx.shadowColor = 'rgba(14, 165, 233, 0.35)';
        ctx.shadowBlur = 8;
        drawRoundRect(rkL + rankColW / 2 - 18, rowTop + rowH / 2 - 16, 36, 32, 10, COL.sky500);
        ctx.restore();
        drawText(`${rank}位`, rkL + rankColW / 2, rowTop + rowH / 2, 16, 'center', '#ffffff', true);
      } else {
        drawText(`${rank}位`, rkL + rankColW / 2, rowTop + rowH / 2, 18, 'center', COL.slate700, true);
      }
    } else {
      drawText('-', rkL + rankColW / 2, rowTop + rowH / 2, 16, 'center', COL.slate300, false);
    }
  }

  // 表の外枠を後から重ね描き
  drawRoundRect(tableX, tableY, tableW, tableH, 14, undefined, COL.sky200, 1.5);

  // ---- フッター ----
  const footerY = tableY + tableH + 20;
  ctx.fillStyle = COL.slate400;
  ctx.font = '10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('※ 各セル内 Mix / WD / MD の3種目スコア。対戦者名付き。', paddingX, footerY);
  ctx.textAlign = 'right';
  ctx.fillText('Tottori City Tennis Association', paddingX + tableW, footerY);

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
