import type { MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding } from './types';
import { drawVenueBadge, isTottoriUniv } from '../team/venueBadge';
import { splitBigSmall, measureMixed, drawMixed } from '../team/mixedSizeText';
import { COL, drawHeaderAccent, drawHeadingGhost, drawHeadingMark, headingEnglish } from '../draw/resultCanvasKit';

/** 会場ロゴの表示倍率（表が小さいので既定より控えめにする） */
const VENUE_LOGO_SCALE = 2 / 3;

/** 白ベース＋赤の差し色（協会サイトのトンマナ／他大会の結果画像と統一） */
const TH = {
  headerBg: COL.gray50,    // 列ヘッダー背景（ごく淡いグレー）
  headerLine: COL.red500,  // 列ヘッダー下線（差し色の赤）
  headerText: COL.gray800, // 列ヘッダー文字（墨）
};

/** 画像の読み込みに失敗しても描画を止めないローダー */
function tryLoadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * リーグ結果を表形式で描画したCanvasからData URL (JPEG) を生成する
 */
export async function generateLeagueResultDataUrl(
  league: MixedLeague,
  standings: LeagueStanding[],
  matches: LeagueMatchScore[],
  _allTeams: MixedTeam[],
  tournamentName: string,
  venue?: string,
): Promise<string> {
  // ペア番号順に並べ替え
  const teams = [...league.teams].sort((a, b) => a.pairNumber - b.pairNumber);
  const teamCount = teams.length;

  // 会場ロゴ（大会名の下に表示）
  const base = import.meta.env.BASE_URL;
  const [venueLogo, tottoriLogo, tctaLogo] = await Promise.all([
    tryLoadImage(`${base}logo-venue.png`),
    tryLoadImage(`${base}logo-tottori-univ.png`),
    tryLoadImage(`${base}logo-tcta.png`),
  ]);

  // レイアウト定数
  const scale = 2; // 高解像度
  const paddingX = 40;
  const paddingY = 40;
  // 会場表示の高さ（鳥取大学=ロゴ+テキスト、それ以外=会場ロゴ）
  const venueTopY = paddingY + 42;
  let venueH = 0;
  if (isTottoriUniv(venue)) {
    venueH = 30 * VENUE_LOGO_SCALE;
  } else if (venueLogo) {
    const vRatio = venueLogo.width / venueLogo.height;
    let vH = 48 * VENUE_LOGO_SCALE;
    let vW = vH * vRatio;
    if (vW > 230 * VENUE_LOGO_SCALE) { vW = 230 * VENUE_LOGO_SCALE; vH = vW / vRatio; }
    venueH = vH;
  }
  // 列見出しは協会ロゴを入れるぶん少し高くする
  const colHeaderH = tctaLogo ? 54 : 34;
  const rowH = 76;
  const nameColW = 260;
  const scoreColW = 95;
  const recordColW = 90;
  const rankColW = 60;
  const tableW = nameColW + scoreColW * teamCount + recordColW + rankColW;

  // ---- タイトル「◯リーグ」の文字サイズ ----
  // 見出しとして大会名・会場ロゴに負けない大きさにする。
  // ヘッダーの高さに影響するので、Canvas を作る前に決めておく。
  const title = `${league.leagueId.trim()}リーグ`;
  const runs = splitBigSmall(title);
  const measureCtx = document.createElement('canvas').getContext('2d')!;
  let bigPx = 68;
  let smallPx = 40;
  // 見出しの左に置く赤い四角（サイトのセクション見出しと同じ記号）
  const markSize = 30;
  const markGap = 16;
  const maxTitleW = Math.max(160, tableW * 0.42) - markSize - markGap;
  let titleW = measureMixed(measureCtx, runs, bigPx, smallPx, '900', '800');
  if (titleW > maxTitleW) {
    const k = maxTitleW / titleW;
    bigPx = Math.floor(bigPx * k);
    smallPx = Math.floor(smallPx * k);
    titleW = measureMixed(measureCtx, runs, bigPx, smallPx, '900', '800');
  }
  // タイトルは会場ロゴの下端に下端をそろえて描くので、
  // その上端（≒ベースライン - 大文字の高さ）が余白に収まる高さを確保する
  const titleCapH = bigPx * 0.78;
  // 末尾の +16 は、見出しの下に入れるアクセント（赤ベタ＋ストライプ）の分
  const headerH = Math.max(
    65,
    (venueTopY - paddingY) + venueH + 14,
    titleCapH + 26,
  ) + 16;
  const tableH = colHeaderH + rowH * teamCount;
  const totalW = tableW + paddingX * 2;
  const totalH = paddingY * 2 + headerH + tableH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);

  // ヘルパー
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string = COL.gray300, w = 1.5) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawText = (text: string, x: number, y: number, size: number, align: CanvasTextAlign = 'center', color: string = COL.gray800, bold = false, maxWidth?: number) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : '500 '}${size}px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (maxWidth) {
      ctx.fillText(text, x, y, maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
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
  // 「Aリーグ」は赤い四角 + 墨の文字（サイトのセクション見出しと同じ組み方）
  // 会場ロゴの下端とタイトルの下端をそろえる
  // （会場表示が無い場合は、タイトルの上端が余白に収まる位置に置く）
  const venueBottomY = venueH > 0 ? venueTopY + venueH : paddingY + 8 + titleCapH;
  const titleCenterY = venueBottomY - titleCapH / 2;
  const markRight = drawHeadingMark(ctx, paddingX, titleCenterY, markSize);
  const titleX = markRight + markGap;
  // 日本語見出しの右側に薄いグレーの英字（サイトと同じ意匠）
  drawHeadingGhost(ctx, headingEnglish(title, 'LEAGUE'), paddingX + tableW * 0.66,
    titleCenterY - bigPx * 0.1, bigPx, Math.max(160, tableW * 0.66 - markSize - markGap + titleW * 0.35),
    'right');
  ctx.fillStyle = COL.gray900;
  drawMixed(ctx, runs, titleX, venueBottomY, bigPx, smallPx, '900', '800');
  const headingW = markSize + markGap + titleW;

  // 大会名（右揃え。タイトルと重ならない幅に収める）
  drawText(tournamentName, paddingX + tableW, paddingY + 24, 22, 'right', COL.gray800, true,
    Math.max(180, tableW - headingW - 40));

  // 大会名の下に会場表示（他大会の結果画像と同じ意匠・2/3サイズ）
  drawVenueBadge(ctx, {
    venue, rightX: paddingX + tableW, topY: venueTopY, venueLogo, tottoriLogo,
    scale: VENUE_LOGO_SCALE,
  });

  // ---- 表全体枠（影付け） ----
  const tableX = paddingX;
  const tableY = paddingY + headerH;

  // 見出し下のアクセント（他の結果画像と同じ赤ベタ＋斜めストライプ）
  drawHeaderAccent(ctx, paddingX, tableY - 12, tableW);
  
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundRect(tableX, tableY, tableW, tableH, 12, COL.white); // 白背景と影
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
  ctx.fillStyle = TH.headerBg; // ごく淡いグレー
  ctx.fillRect(tableX, tableY, tableW, colHeaderH);
  // 左上のセル（協会ロゴを置く枠）だけ白にする。
  // ロゴ画像の背景が白なので、地色のままだとロゴが浮いて見えてしまう。
  ctx.fillStyle = COL.white;
  ctx.fillRect(tableX, tableY, nameColW, colHeaderH);
  ctx.restore();

  // ---- 列ヘッダー区切り線 ----
  drawLine(tableX, tableY + colHeaderH, tableX + tableW, tableY + colHeaderH, TH.headerLine, 1.5);

  // 列ヘッダーテキスト
  const thColor = TH.headerText;
  // 選手名の列見出しは協会ロゴにする（読み込めない場合は従来の文字）
  if (tctaLogo) {
    const maxLogoW = nameColW - 40;
    const maxLogoH = colHeaderH - 8;
    const ratio = tctaLogo.width / tctaLogo.height;
    let lh = maxLogoH;
    let lw = lh * ratio;
    if (lw > maxLogoW) { lw = maxLogoW; lh = lw / ratio; }
    ctx.drawImage(tctaLogo, tableX + (nameColW - lw) / 2, tableY + (colHeaderH - lh) / 2, lw, lh);
  } else {
    drawText('選手名', tableX + nameColW / 2, tableY + colHeaderH / 2, 13, 'center', thColor, true);
  }
  
  for (let i = 0; i < teamCount; i++) {
    const team = teams[i];
    const extractSei = (n: string) => {
      const trimmed = n.trim();
      if (trimmed.includes(' ') || trimmed.includes('　')) return trimmed.split(/[\s　]+/)[0];
      if (trimmed.length >= 4) return trimmed.substring(0, 2); // 例: 細川善貴 -> 細川
      return trimmed;
    };
    const x = tableX + nameColW + scoreColW * i + scoreColW / 2;
    drawText(`${extractSei(team.male.name)}・${extractSei(team.female.name)}`, x, tableY + colHeaderH / 2, 11, 'center', thColor, true, scoreColW - 8);
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

    // 行のストライプ（1行おきにごく淡いグレーを敷く）
    if (rowIdx % 2 === 1) {
      ctx.fillStyle = COL.gray50;
      ctx.fillRect(tableX + 1, rowTop, tableW - 2, rowH);
    }
    if (rowIdx > 0) {
      drawLine(tableX, rowTop, tableX + tableW, rowTop, COL.gray200, 1);
    }

    // ペア番号
    drawText(String(team.pairNumber), tableX + 22, rowTop + rowH / 2, 18, 'center', COL.gray500, true);

    // 男子名 + 所属
    const nameStartX = tableX + 46;
    const affiliationStartX = tableX + 160; // 所属の開始位置を揃える
    
    // 名前の幅を考慮して描画 (最大幅を設定)
    drawText(team.male.name, nameStartX, rowTop + 22, 15, 'left', COL.gray900, true, affiliationStartX - nameStartX - 10);
    
    ctx.font = '11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = COL.gray500;
    ctx.textAlign = 'left';
    ctx.fillText(team.male.affiliation, affiliationStartX, rowTop + 23, nameColW - (affiliationStartX - tableX) - 10);

    // 女子名 + 所属
    drawText(team.female.name, nameStartX, rowTop + 50, 15, 'left', COL.gray900, true, affiliationStartX - nameStartX - 10);
    
    ctx.font = '11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = COL.gray500;
    ctx.textAlign = 'left';
    ctx.fillText(team.female.affiliation, affiliationStartX, rowTop + 51, nameColW - (affiliationStartX - tableX) - 10);

    // 対戦スコア
    for (let colIdx = 0; colIdx < teamCount; colIdx++) {
      const x = tableX + nameColW + scoreColW * colIdx;

      // 縦線
      drawLine(x, tableY, x, tableY + tableH, COL.gray200, 1);

      if (colIdx === rowIdx) {
        // 自分同士: 灰色背景 & 斜線
        ctx.fillStyle = COL.gray50;
        // 左上が角のマスなら角丸を考慮する等の細かい処理は clipping されている表全体枠でカバーする
        ctx.fillRect(x + 0.5, rowTop + 0.5, scoreColW - 1, rowH - 1);
        drawLine(x, rowTop, x + scoreColW, rowTop + rowH, COL.gray300, 1);
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
        // 勝った側のスコアだけ赤で強調する（差し色）
        drawText(scoreText, cx, rowTop + rowH / 2, won ? 18 : 16, 'center', won ? COL.win : COL.gray500, won);
      }
    }

    // 勝敗列
    const recL = tableX + nameColW + scoreColW * teamCount;
    drawLine(recL, tableY, recL, tableY + tableH, COL.gray200, 1);
    drawText(`${standing.wins}勝${standing.losses}敗`, recL + recordColW / 2, rowTop + rowH / 2, 14, 'center', COL.gray700, false);

    // 順位列
    const rkL = recL + recordColW;
    drawLine(rkL, tableY, rkL, tableY + tableH, COL.gray200, 1);
    drawText(standing.rank ? `${standing.rank}位` : '-', rkL + rankColW / 2, rowTop + rowH / 2, 18, 'center', COL.gray900, true);
  }

  // 表の外枠を後から重ね描きして綺麗にする
  drawRoundRect(tableX, tableY, tableW, tableH, 12, undefined, COL.gray300, 2);

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
  venue?: string,
) {
  const dataUrl = await generateLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, venue);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${league.leagueId.trim()}リーグ結果.jpg`;
  a.click();
}

