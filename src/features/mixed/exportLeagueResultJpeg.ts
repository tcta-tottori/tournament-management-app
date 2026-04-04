import type { MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding } from './types';

/**
 * リーグ結果を表形式で描画したCanvasからData URL (JPEG) を生成する
 */
export async function generateLeagueResultDataUrl(
  league: MixedLeague,
  standings: LeagueStanding[],
  matches: LeagueMatchScore[],
  allTeams: MixedTeam[],
  tournamentName: string,
): Promise<string> {
  // ペア番号順に並べ替え
  const teams = [...league.teams].sort((a, b) => a.pairNumber - b.pairNumber);
  const teamCount = teams.length;

  // レイアウト定数
  const scale = 2; // 高解像度
  const paddingX = 40;
  const paddingY = 40;
  const headerH = 65;
  const colHeaderH = 34;
  const rowH = 76;
  const nameColW = 260;
  const scoreColW = 95;
  const recordColW = 90;
  const rankColW = 60;
  const tableW = nameColW + scoreColW * teamCount + recordColW + rankColW;
  const tableH = colHeaderH + rowH * teamCount;
  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ヘルパー
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color = '#cbd5e1', w = 1.5) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawText = (text: string, x: number, y: number, size: number, align: CanvasTextAlign = 'center', color = '#1e293b', bold = false) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : '500 '}${size}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  };

  const drawRoundRect = (x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, strokeW = 1.5) => {
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
  // リーグバッジ風
  drawRoundRect(paddingX, paddingY - 10, 52, 52, 12, '#10b981');
  drawText(pLId, paddingX + 26, paddingY + 16, 32, 'center', '#ffffff', true);
  drawText('リーグ', paddingX + 65, paddingY + 28, 16, 'left', '#64748b', true);
  
  // 大会名
  drawText(tournamentName, paddingX + tableW, paddingY + 24, 20, 'right', '#334155', true);

  // ---- 表全体枠（影付け） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;
  
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundRect(tableX, tableY, tableW, tableH, 12, '#ffffff'); // 白背景と影
  ctx.restore();

  // 列ヘッダー背景部分だけ先に塗る（角丸マスク）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tableX + 12, tableY);
  ctx.arcTo(tableX + tableW, tableY, tableX + tableW, tableY + colHeaderH, 12);
  ctx.arcTo(tableX + tableW, tableY + colHeaderH, tableX, tableY + colHeaderH, 0); // 右下と左下は丸めない
  ctx.arcTo(tableX, tableY + colHeaderH, tableX, tableY, 0);
  ctx.arcTo(tableX, tableY, tableX + tableW, tableY, 12);
  ctx.clip();
  ctx.fillStyle = '#f0fdf4'; // 薄いグリーン
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  ctx.restore();

  // ---- 列ヘッダー区切り線 ----
  drawLine(tableX, tableY + colHeaderH, tableX + tableW, tableY + colHeaderH, '#10b981', 1.5);

  // 列ヘッダーテキスト
  const thColor = '#166534';
  drawText('選手名', tableX + nameColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);
  
  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const sei = (n: string) => n.trim().split(/[\s　]+/)[0] || n;
    const x = tableX + nameColW + scoreColW * i + scoreColW / 2;
    drawText(`${sei(team.male.name)}・${sei(team.female.name)}`, x, tableY + colHeaderH / 2, 11, 'center', thColor, true);
  }
  const recordX = tableX + nameColW + scoreColW * teamCount + recordColW / 2;
  drawText('勝敗', recordX, tableY + colHeaderH / 2, 13, 'center', thColor, true);
  const rankX = tableX + nameColW + scoreColW * teamCount + recordColW + rankColW / 2;
  drawText('順位', rankX, tableY + colHeaderH / 2, 13, 'center', thColor, true);

  // ---- 各行の描画 ----
  for (let rowIdx = 0; rowIdx < teamCount; rowIdx++) {
    const team = teams[rowIdx];
    const standing = standings.find(s => s.teamId === team.teamId) || { wins: 0, losses: 0, rank: 0 };
    const rowTop = tableY + colHeaderH + rowH * rowIdx;

    if (rowIdx > 0) {
      drawLine(tableX, rowTop, tableX + tableW, rowTop, '#e2e8f0', 1);
    }

    // ペア番号
    drawText(String(team.pairNumber), tableX + 22, rowTop + rowH / 2, 18, 'center', '#64748b', true);

    // 男子名 + 所属
    const nameStartX = tableX + 46;
    
    ctx.font = 'bold 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    const maleNameW = ctx.measureText(team.male.name).width;
    drawText(team.male.name, nameStartX, rowTop + 22, 15, 'left', '#0f172a', true);
    
    ctx.font = '11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(team.male.affiliation, nameStartX + maleNameW + 12, rowTop + 23);

    // 女子名 + 所属
    ctx.font = 'bold 15px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    const femaleNameW = ctx.measureText(team.female.name).width;
    drawText(team.female.name, nameStartX, rowTop + 50, 15, 'left', '#0f172a', true);
    
    ctx.font = '11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(team.female.affiliation, nameStartX + femaleNameW + 12, rowTop + 51);

    // 対戦スコア
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + nameColW + scoreColW * colIdx;

      // 縦線
      drawLine(x, tableY, x, tableY + tableH, '#e2e8f0', 1);

      if (colIdx === rowIdx) {
        // 自分同士: 灰色背景 & 斜線
        ctx.fillStyle = '#f8fafc';
        // 左上が角のマスなら角丸を考慮する等の細かい処理は clipping されている表全体枠でカバーする
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        drawLine(x, rowTop, x + scoreColW, rowTop + rowH, '#cbd5e1', 1);
        continue;
      }

      const oppTeam = teams[colIdx];
      const match = matches.find(m =>
        m.leagueId === league.leagueId &&
        ((m.team1Id === team.teamId && m.team2Id === oppTeam.teamId) ||
         (m.team1Id === oppTeam.teamId && m.team2Id === team.teamId))
      );

      if (match && match.status === 'finished') {
        const isTeam1 = match.team1Id === team.teamId;
        const myScore = isTeam1 ? match.score1 : match.score2;
        const oppScore = isTeam1 ? match.score2 : match.score1;
        const won = match.winnerId === team.teamId;

        let scoreText = `${myScore} - ${oppScore}`;
        if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
          scoreText = `${myScore} - ${oppScore}`;
        }

        const cx = x + scoreColW / 2;
        drawText(scoreText, cx, rowTop + rowH / 2, won ? 18 : 16, 'center', won ? '#0f172a' : '#64748b', won);
      }
    }

    // 勝敗列
    const recL = tableX + nameColW + scoreColW * teamCount;
    drawLine(recL, tableY, recL, tableY + tableH, '#e2e8f0', 1);
    drawText(`${standing.wins}勝${standing.losses}敗`, recL + recordColW / 2, rowTop + rowH / 2, 14, 'center', '#334155', false);

    // 順位列
    const rkL = recL + recordColW;
    drawLine(rkL, tableY, rkL, tableY + tableH, '#e2e8f0', 1);
    drawText(standing.rank ? `${standing.rank}位` : '-', rkL + rankColW / 2, rowTop + rowH / 2, 18, 'center', '#0f172a', true);
  }

  // 表の外枠を後から重ね描きして綺麗にする
  drawRoundRect(tableX, tableY, tableW, tableH, 12, undefined, '#94a3b8', 2);

  // PromiseでエンコードしてData URLを返す
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Canvas to Blob failed'));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.95);
  });
}

/**
 * リーグ結果を添付画像の形式でCanvas描画しJPEGダウンロード
 */
export async function exportLeagueResultJpeg(
  league: MixedLeague,
  standings: LeagueStanding[],
  matches: LeagueMatchScore[],
  allTeams: MixedTeam[],
  tournamentName: string,
) {
  const dataUrl = await generateLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${league.leagueId.trim()}リーグ結果.jpg`;
  a.click();
}

