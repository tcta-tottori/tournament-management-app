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
  const teams = standings.map(s => allTeams.find(t => t.teamId === s.teamId)!).filter(Boolean);
  const teamCount = teams.length;

  // レイアウト定数
  const scale = 2; // 高解像度
  const headerH = 60;
  const colHeaderH = 30;
  const rowH = 70;
  const nameColW = 250;
  const scoreColW = 90;
  const recordColW = 80;
  const rankColW = 50;
  const totalW = nameColW + scoreColW * teamCount + recordColW + rankColW;
  const totalH = headerH + colHeaderH + rowH * teamCount;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ヘルパー
  const drawLine = (x1: number, y1: number, x2: number, y2: number, w = 1) => {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawText = (text: string, x: number, y: number, size: number, align: CanvasTextAlign = 'center', bold = false) => {
    ctx.fillStyle = '#000';
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "MS Gothic", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  };

  // ---- ヘッダー ----
  // リーグ名（大きく左）
  drawText(`${league.leagueId.trim()}`, 30, 25, 36, 'left', true);
  drawText('リーグ', 55, 35, 14, 'left', false);
  // 大会名（右寄せ）
  drawText(tournamentName, totalW - 10, 25, 16, 'right', false);

  // ---- 列ヘッダー ----
  const tableTop = headerH;
  const tableLeft = 0;

  // ヘッダー行の線
  drawLine(tableLeft, tableTop, totalW, tableTop, 1.5);
  drawLine(tableLeft, tableTop + colHeaderH, totalW, tableTop + colHeaderH, 1);

  // 列ヘッダーテキスト
  drawText('選手名', nameColW / 2, tableTop + colHeaderH / 2, 11, 'center', true);
  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const sei = (n: string) => n.trim().split(/[\s　]+/)[0] || n;
    const x = nameColW + scoreColW * i + scoreColW / 2;
    drawText(`${sei(team.male.name)}・${sei(team.female.name)}`, x, tableTop + colHeaderH / 2, 9, 'center', false);
  }
  const recordX = nameColW + scoreColW * teamCount + recordColW / 2;
  drawText('勝敗', recordX, tableTop + colHeaderH / 2, 11, 'center', true);
  const rankX = nameColW + scoreColW * teamCount + recordColW + rankColW / 2;
  drawText('順位', rankX, tableTop + colHeaderH / 2, 11, 'center', true);

  // ---- 各行 ----
  for (let rowIdx = 0; rowIdx < teamCount; rowIdx++) {
    const team = teams[rowIdx];
    const standing = standings[rowIdx];
    const rowTop = tableTop + colHeaderH + rowH * rowIdx;

    // 行の線
    drawLine(tableLeft, rowTop, totalW, rowTop, 1);

    // ペア番号
    drawText(String(team.pairNumber), 18, rowTop + rowH / 2, 16, 'center', false);

    // 男子名 + 所属
    const nameX = 40;
    drawText(team.male.name, nameX, rowTop + 18, 14, 'left', true);
    ctx.font = '9px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    ctx.fillText(team.male.affiliation, nameX + ctx.measureText(team.male.name).width + 8, rowTop + 18);

    // 女子名 + 所属
    ctx.fillStyle = '#000';
    drawText(team.female.name, nameX, rowTop + 45, 14, 'left', true);
    ctx.font = '9px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    ctx.fillText(team.female.affiliation, nameX + ctx.measureText(team.female.name).width + 8, rowTop + 45);

    // 対戦スコア
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = nameColW + scoreColW * colIdx;

      // 縦線
      drawLine(x, rowTop, x, rowTop + rowH, 1);

      if (colIdx === rowIdx) {
        // 自分同士: 灰色背景
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
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

        let scoreText = `${myScore}-${oppScore}`;
        // タイブレーク表示
        if (match.tiebreakScore != null &&
            ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
          // 勝者は (TB) を右側、敗者は (TB) を左側に表示しない - シンプルにスコアのみ
          scoreText = `${myScore}-${oppScore}`;
        }

        const cx = x + scoreColW / 2;
        ctx.fillStyle = '#000';
        drawText(scoreText, cx, rowTop + rowH / 2, won ? 16 : 14, 'center', won);
      }
    }

    // 勝敗列
    const recX = nameColW + scoreColW * teamCount;
    drawLine(recX, rowTop, recX, rowTop + rowH, 1);
    drawText(`${standing.wins}勝${standing.losses}敗`, recX + recordColW / 2, rowTop + rowH / 2, 12, 'center', false);

    // 順位列
    const rkX = recX + recordColW;
    drawLine(rkX, rowTop, rkX, rowTop + rowH, 1);
    drawText(`${standing.rank}位`, rkX + rankColW / 2, rowTop + rowH / 2, 16, 'center', true);
  }

  // 最下線
  const bottomY = tableTop + colHeaderH + rowH * teamCount;
  drawLine(tableLeft, bottomY, totalW, bottomY, 1.5);

  // 左右枠線
  drawLine(tableLeft, tableTop, tableLeft, bottomY, 1.5);
  drawLine(totalW, tableTop, totalW, bottomY, 1.5);

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

