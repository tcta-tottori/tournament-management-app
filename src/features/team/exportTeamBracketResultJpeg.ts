import type { TeamPlacementBracket, TeamBracketMatch, TeamEntry, MatchType, PlacementCategory, MatchFormat } from './types';
import { resolveBracketLabel, getMatchTypeOrder } from './teamLogic';
import { buildResultFileName } from './resultFileName';
import { COL, drawResultHeader, drawScorePair } from '../draw/resultCanvasKit';

const TYPE_LABEL: Record<MatchType, string> = {
  MIX: 'Mix', WD: 'WD', MD: 'MD',
  D1: 'D1', D2: 'D2', D3: 'D3', S1: 'S1', S2: 'S2',
};

/**
 * リーグバッジ用の短縮ラベル。長いリーグ名（例:「女子予選会A」）が
 * チーム名と重ならないよう、コンパクトな表記にする。
 *   「女子予選会A」→「予A」 / 「男子1部」→「1部」 / 「A」→「A」
 */
function shortLeagueBadge(league: string): string {
  const s = (league || '').trim();
  if (!s) return '-';
  const bu = s.match(/(\d+)\s*部/);
  if (bu) return `${bu[1]}部`;
  const yo = s.match(/予選会\s*([0-9A-Za-z]+)/);
  if (yo) return `予${yo[1]}`;
  const tail = s.match(/([0-9A-Za-z]+)\s*$/);
  if (tail && tail[1].length <= 3) return tail[1];
  return s.slice(0, 3);
}

/**
 * 種目バッジの配色。
 * 白ベース＋赤の差し色というトンマナに合わせ、種目は色分けせず
 * 無彩色のタグで統一する（種目は D1 / S1 などのラベルで判別できる）。
 */
const TYPE_TAG = { bg: COL.gray50, fg: COL.gray700, border: COL.gray300 };

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
  venue?: string,
): Promise<string> {
  // 公式ロゴ・会場ロゴを事前に読み込む
  const base = import.meta.env.BASE_URL;
  const [tctaLogo, venueLogo, tottoriLogo] = await Promise.all([
    tryLoadImage(`${base}logo-tcta.png`),
    tryLoadImage(`${base}logo-venue.png`),
    tryLoadImage(`${base}logo-tottori-univ.png`),
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
  // 種目数（3 = ミックス大会, 5 = クラブ対抗戦）に応じて高さを調整
  // 158 = チーム名2段 + サブマッチ3行 + ステータス
  // 5行のときはサブマッチ分だけ拡張
  const _baseMatchH = 158;
  const matchH = _baseMatchH + Math.max(0, TYPE_ORDER.length - 3) * 22;
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

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景（白）
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

  // ---- ヘッダー（他の結果画像と共通の意匠）----
  drawResultHeader(ctx, {
    title: resolveBracketLabel(bracket.category, customLabels),
    tournamentName,
    venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos: { tcta: tctaLogo, venue: venueLogo, tottori: tottoriLogo },
  });

  // ---- ブラケット本体エリア ----
  // 横方向は常にブラケットをフレーム内にセンタリング（左右に最低 bracketSidePad のマージン）
  const bracketAreaX = paddingX + Math.max(bracketSidePad, (tableW - bracketW) / 2);
  const bracketAreaY = paddingY + headerH;

  // 背景カード（白 + 淡いグレーのボーダー）
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  drawRoundRect(paddingX, bracketAreaY, tableW, bracketH, 18, COL.white);
  ctx.restore();
  drawRoundRect(paddingX, bracketAreaY, tableW, bracketH, 18, undefined, COL.gray200, 1.5);

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

  // ---- 接続線（無彩色で統一） ----
  const lineColor = COL.gray300;
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
      grad.addColorStop(0, COL.champ2);
      grad.addColorStop(1, COL.champ3);
      drawRoundRect(labelBoxX, labelBoxY, labelW, labelH, 11, grad);
      ctx.fillStyle = COL.white;
    } else {
      drawRoundRect(labelBoxX, labelBoxY, labelW, labelH, 11, COL.white, COL.gray300, 1);
      ctx.fillStyle = COL.gray700;
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

      // カード背景（影付き、白 + 淡いグレーのボーダー）
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      drawRoundRect(cx, byeY, matchW, byeH, 12, COL.white);
      ctx.restore();
      drawRoundRect(cx, byeY, matchW, byeH, 12, undefined, COL.gray200, 1.5);

      // リーグ色バッジ（短縮ラベル＋自動幅で重なり防止）
      const bgBadgeX = cx + 10;
      const bgBadgeLabel = shortLeagueBadge(byeLeague || '');
      ctx.font = '900 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      const bgBadgeW = Math.max(22, ctx.measureText(bgBadgeLabel).width + 12);
      const bgBadgeH = 20;
      const bgBadgeY = byeY + (byeH - bgBadgeH) / 2;
      drawRoundRect(bgBadgeX, bgBadgeY, bgBadgeW, bgBadgeH, 5, COL.gray100, COL.gray200, 1);
      drawText(bgBadgeLabel, bgBadgeX + bgBadgeW / 2, bgBadgeY + bgBadgeH / 2 + 0.5, 11, 'center', COL.gray700, 'black', bgBadgeW - 6);

      // チーム名（中央寄せ風、badgeの右から右端まで）
      const nameX = bgBadgeX + bgBadgeW + 8;
      const nameMaxW = matchW - (nameX - cx) - 14;
      drawText(
        byeName || '---',
        nameX,
        byeY + byeH / 2,
        13,
        'left',
        COL.gray700,
        'bold',
        nameMaxW,
      );
      return;
    }

    // カード背景（影付き、白 + 淡いグレーのボーダー）
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    drawRoundRect(cx, cy, matchW, matchH, 12, COL.white);
    ctx.restore();

    const borderColor = isFinished ? COL.gray300 : COL.gray200;
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

      // 勝者の背景ハイライト（淡い赤）
      if (isWinner) {
        ctx.fillStyle = COL.winRow;
        ctx.fillRect(cx + 6, rowY + 2, matchW - 12, teamRowH - 2);
      }

      // リーグバッジ（短縮ラベル＋テキスト幅に合わせた自動幅で重なり防止）
      const badgeX2 = cx + 10;
      const badgeY2 = rowY + (teamRowH - 20) / 2;
      const badgeLabel = shortLeagueBadge(teamLeague || '');
      ctx.font = '900 11px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      const bgW = Math.max(22, ctx.measureText(badgeLabel).width + 12);
      const bgH = 20;
      drawRoundRect(badgeX2, badgeY2, bgW, bgH, 5, COL.gray100, COL.gray200, 1);
      drawText(badgeLabel, badgeX2 + bgW / 2, badgeY2 + bgH / 2 + 0.5, 11, 'center', COL.gray700, 'black', bgW - 6);

      // チーム名（バッジの右端から開始）
      const nameX = badgeX2 + bgW + 8;
      const scoreBoxW = 30;
      const nameMaxW = matchW - (nameX - cx) - scoreBoxW - 14;
      drawText(
        teamName || '---',
        nameX,
        rowY + teamRowH / 2,
        13,
        'left',
        isWinner ? COL.gray900 : COL.gray600,
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
          isWinner ? COL.win : COL.gray300,
          'black',
        );
      }
    };
    drawTeamRow(0);
    // チーム間のセパレータ
    drawLine(cx + 8, teamAreaY + teamRowH, cx + matchW - 8, teamAreaY + teamRowH, COL.gray100, 1);
    drawTeamRow(1);

    // サブマッチエリア
    const subAreaY = teamAreaY + teamRowH * 2 + 6;
    const subAreaH2 = matchH - (subAreaY - cy) - 10;
    drawLine(cx + 8, subAreaY, cx + matchW - 8, subAreaY, COL.gray200, 1);

    const subRowH = subAreaH2 / TYPE_ORDER.length;
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const mt = TYPE_ORDER[i];
      const sub = match.subMatches.find(s => s.type === mt);
      const subY = subAreaY + i * subRowH + subRowH / 2;

      // 種目バッジ
      const tagW = 30;
      const tagH = 15;
      const tagX = cx + 10;
      const tagY = subY - tagH / 2;
      drawRoundRect(tagX, tagY, tagW, tagH, 4, TYPE_TAG.bg, TYPE_TAG.border, 1);
      ctx.fillStyle = TYPE_TAG.fg;
      ctx.font = 'bold 9px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TYPE_LABEL[mt], tagX + tagW / 2, tagY + tagH / 2 + 0.5);

      if (!sub || sub.score1 === null || sub.score2 === null) {
        drawText('—', cx + matchW / 2, subY, 11, 'center', COL.gray300);
        continue;
      }

      // スコア + 選手名
      const won1 = sub.winnerId === match.team1Id;
      const won2 = sub.winnerId === match.team2Id;
      const p1 = (sub.players1 || []).join('/') || '';
      const p2 = (sub.players2 || []).join('/') || '';

      // 中央にスコア、両サイドに選手名。勝った側の数字だけ赤で強調する。
      const scoreCx = cx + matchW / 2 + 6;
      const scoreWid = drawScorePair(ctx, {
        left: sub.score1, right: sub.score2,
        centerX: scoreCx, centerY: subY, px: 13,
        leftWin: won1, rightWin: won2,
      });

      // 左選手名
      const leftX = tagX + tagW + 6;
      const leftMaxW = scoreCx - scoreWid / 2 - leftX - 6;
      if (p1 && leftMaxW > 10) {
        ctx.font = `${won1 ? 'bold' : '500'} 10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = COL.gray600;
        ctx.textAlign = 'right';
        ctx.fillText(p1, scoreCx - scoreWid / 2 - 5, subY, leftMaxW);
      }
      // 右選手名
      const rightX = scoreCx + scoreWid / 2 + 5;
      const rightMaxW = cx + matchW - 10 - rightX;
      if (p2 && rightMaxW > 10) {
        ctx.font = `${won2 ? 'bold' : '500'} 10px "Inter", "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.fillStyle = COL.gray600;
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
  venue?: string,
) {
  const dataUrl = await generateTeamBracketResultDataUrl(bracket, allTeams, tournamentName, customLabels, matchFormat, venue);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = buildResultFileName(tournamentName, `${resolveBracketLabel(bracket.category, customLabels)}_結果_団体戦`);
  a.click();
}
