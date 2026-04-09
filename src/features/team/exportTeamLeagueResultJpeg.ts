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
  _tournamentName: string,
): Promise<string> {
  // チーム番号順に並べ替え
  const teams = [...league.teams].sort((a, b) => a.numberInLeague - b.numberInLeague);
  const teamCount = teams.length;

  // ---- レイアウト定数 ----
  const scale = 2; // 高解像度
  const paddingX = 48;
  const paddingY = 44;
  const headerH = 78;
  const colHeaderH = 40;
  const rowH = 116;
  const nameColW = 210;
  const typeColW = 46;
  const scoreColW = 230;   // 選手名入りスコア用
  const recordColW = 90;
  const rankColW = 74;
  const tableW = nameColW + typeColW + scoreColW * teamCount + recordColW + rankColW;
  const tableH = colHeaderH + rowH * teamCount;
  const footerH = 108; // TCTAロゴ領域
  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH + footerH;

  // ---- 水色カラーパレット (TCTAロゴ準拠) ----
  const COL = {
    white: '#ffffff',
    sky50: '#f0f9ff',
    sky100: '#e0f2fe',
    sky200: '#bae6fd',
    sky400: '#38bdf8',
    sky500: '#0ea5e9',
    sky600: '#0284c7',
    sky700: '#0369a1',
    sky800: '#075985',
    sky900: '#0c4a6e',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate300: '#cbd5e1',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    slate800: '#1e293b',
    black: '#0a0a0a',
    red: '#dc2626',
  };

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景（白）
  ctx.fillStyle = COL.white;
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
  // 左上: サブタイトル
  drawText('団体戦 予選リーグ結果', paddingX, paddingY + 26, 18, 'left', COL.slate600, true);
  if (league.courtName) {
    drawText(league.courtName, paddingX, paddingY + 50, 12, 'left', COL.slate400, false);
  }

  // 右上: リーグ名だけ（大きく）
  const leagueId = league.leagueId.trim();
  drawText(leagueId, paddingX + tableW, paddingY + 34, 44, 'right', COL.sky700, true);
  // 「リーグ」の添え字
  ctx.font = 'bold 16px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
  const leagueIdW = ctx.measureText(leagueId).width;
  drawText('リーグ', paddingX + tableW - leagueIdW - 34, paddingY + 42, 16, 'right', COL.sky500, true);

  // ---- 表全体枠（影付け） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(14, 165, 233, 0.12)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  drawRoundRect(tableX, tableY, tableW, tableH, 14, COL.white);
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
  drawText('種目', tableX + nameColW + typeColW / 2, tableY + colHeaderH / 2, 11, 'center', thColor, true);

  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const x = tableX + nameColW + typeColW + scoreColW * i + scoreColW / 2;
    const shortName = team.teamName.split(/[\s\u3000]+/)[0] || team.teamName;
    drawText(shortName, x, tableY + colHeaderH / 2, 12, 'center', thColor, true, scoreColW - 12);
  }
  let colCursor = tableX + nameColW + typeColW + scoreColW * teamCount;
  drawText('勝敗', colCursor + recordColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);
  colCursor += recordColW;
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

    // サブ行（Mix/WD/MD）の中心Y座標
    const innerTop = rowTop + 10;
    const innerH = rowH - 20;
    const subH = innerH / 3;
    const subCenters = [0, 1, 2].map(i => innerTop + subH * i + subH / 2);

    // --- チーム名列 ---
    drawRoundRect(tableX + 10, rowTop + rowH / 2 - 14, 28, 28, 7, COL.sky100, COL.sky400, 1);
    drawText(String(team.numberInLeague), tableX + 24, rowTop + rowH / 2, 14, 'center', COL.sky700, true);

    drawText(team.teamName, tableX + 46, rowTop + rowH / 2 - 8, 15, 'left', COL.slate800, true, nameColW - 54);

    // メンバー（苗字のみ、最大6名）
    const familyOf = (n: string) => n.trim().split(/[\s\u3000]+/)[0] || n;
    const members = team.members.map(m => familyOf(m.player.name));
    const memberStr = members.slice(0, 6).join('・') + (members.length > 6 ? '…' : '');
    ctx.font = '10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = COL.slate500;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(memberStr, tableX + 46, rowTop + rowH / 2 + 10, nameColW - 54);

    // --- 種目列（Mix / WD / MD タグを縦に並べる） ---
    const typeColX = tableX + nameColW;
    drawLine(typeColX, tableY, typeColX, tableY + tableH, COL.slate200, 1);

    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      const tagW = 32;
      const tagH = 18;
      const tagX = typeColX + (typeColW - tagW) / 2;
      const tagY = subCenters[i] - tagH / 2;
      drawRoundRect(tagX, tagY, tagW, tagH, 5, COL.sky200);
      ctx.fillStyle = COL.sky700;
      ctx.font = 'bold 10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], tagX + tagW / 2, tagY + tagH / 2 + 0.5);
    }

    // サブ行間の水平ガイド（種目〜最終対戦列まで）
    const subRowRightEdge = tableX + nameColW + typeColW + scoreColW * teamCount;
    for (let i = 1; i < 3; i++) {
      const y = innerTop + subH * i;
      drawLine(typeColX, y, subRowRightEdge, y, COL.slate100, 0.5);
    }

    // --- 対戦スコア列 ---
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + nameColW + typeColW + scoreColW * colIdx;

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

      // 勝利側セル全体に淡水色ハイライト
      if (won) {
        ctx.fillStyle = COL.sky100;
        ctx.fillRect(x + 1, rowTop + 1, scoreColW - 2, rowH - 2);
      }

      // 種目ごとの対戦結果行（選手名＋スコア）
      for (let i = 0; i < TYPE_ORDER.length; i++) {
        const mt = TYPE_ORDER[i];
        const sub = match.subMatches.find(s => s.type === mt);
        const subY = subCenters[i];

        if (!sub || sub.score1 === null || sub.score2 === null) {
          drawText('—', x + scoreColW / 2, subY, 12, 'center', COL.slate300, false);
          continue;
        }

        const myScore = isTeam1 ? sub.score1 : sub.score2;
        const oppScore = isTeam1 ? sub.score2 : sub.score1;
        const subWon = sub.winnerId === team.teamId;
        const myPlayers = (isTeam1 ? sub.players1 : sub.players2) || [];
        const oppPlayers = (isTeam1 ? sub.players2 : sub.players1) || [];
        const myP = myPlayers.join('/');
        const oppP = oppPlayers.join('/');

        const textColor = subWon ? COL.sky900 : COL.slate600;
        // 例: 田中/山本 6-1 山口/田中
        const text = `${myP || '　'}  ${myScore}-${oppScore}  ${oppP || '　'}`;
        ctx.font = `${subWon ? 'bold ' : '600 '}12px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + scoreColW / 2, subY, scoreColW - 16);
      }
    }

    // --- 勝敗列 ---
    const wins = standing?.wins ?? 0;
    const losses = standing?.losses ?? 0;
    const recL = tableX + nameColW + typeColW + scoreColW * teamCount;
    drawLine(recL, tableY, recL, tableY + tableH, COL.slate200, 1);
    drawText(`${wins}勝${losses}敗`, recL + recordColW / 2, rowTop + rowH / 2, 14, 'center', COL.slate700, true);

    // --- 順位列 ---
    const rkL = recL + recordColW;
    drawLine(rkL, tableY, rkL, tableY + tableH, COL.slate200, 1);
    const rank = standing?.rank ?? 0;
    if (rank > 0) {
      if (rank === 1) {
        // 1位は水色の強調バッジ
        ctx.save();
        ctx.shadowColor = 'rgba(14, 165, 233, 0.35)';
        ctx.shadowBlur = 8;
        drawRoundRect(rkL + rankColW / 2 - 20, rowTop + rowH / 2 - 18, 40, 36, 10, COL.sky500);
        ctx.restore();
        drawText(`${rank}位`, rkL + rankColW / 2, rowTop + rowH / 2, 16, 'center', COL.white, true);
      } else {
        drawText(`${rank}位`, rkL + rankColW / 2, rowTop + rowH / 2, 18, 'center', COL.slate700, true);
      }
    } else {
      drawText('-', rkL + rankColW / 2, rowTop + rowH / 2, 16, 'center', COL.slate300, false);
    }
  }

  // 表の外枠
  drawRoundRect(tableX, tableY, tableW, tableH, 14, undefined, COL.sky200, 1.5);

  // ---- フッター：TCTA ロゴ（左下・黒文字＋赤い四角） ----
  const logoBaseY = tableY + tableH + 34;
  const logoX = paddingX;

  // 鳥取市テニス協会（上段・小）
  ctx.font = 'bold 12px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
  ctx.fillStyle = COL.black;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('鳥取市テニス協会', logoX + 4, logoBaseY);

  // TCTA（大きく・黒・ウルトラボールド）
  const tctaFontSize = 42;
  ctx.font = `900 ${tctaFontSize}px "Inter", "Arial Black", "Helvetica Neue", sans-serif`;
  ctx.fillStyle = COL.black;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const tctaY = logoBaseY + 44;
  ctx.fillText('TCTA', logoX, tctaY);

  // 赤い四角（ロゴ中の赤いアクセントを再現）
  // 文字幅から位置を算出
  const wTC = ctx.measureText('TC').width;
  const wTCT = ctx.measureText('TCT').width;
  const sq = 10;
  ctx.fillStyle = COL.red;
  // 1個目: 最初のTの下左に配置
  ctx.fillRect(logoX + 2, tctaY - sq + 2, sq, sq);
  // 2個目: 3文字目Tの下左に配置
  ctx.fillRect(logoX + wTC + 4, tctaY - sq + 2, sq, sq);

  // TOTTORI-CITY TENNIS ASSOCIATION（下段・小）
  ctx.font = 'bold 11px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillStyle = COL.black;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const engText = 'TOTTORI-CITY TENNIS ASSOCIATION';
  ctx.fillText(engText, logoX, tctaY + 18);

  // 文字幅チェックでレイアウト崩れを防ぐ（デバッグ用に使ってない）
  void wTCT;

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
