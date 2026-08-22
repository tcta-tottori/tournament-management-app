// =============================================
// ミックス大会 決勝トーナメントの結果画像
//
// 意匠は団体戦の結果画像（exportTeamBracketResultJpeg）に合わせ、
// ヘッダー（赤い四角＋種目名 + 大会名 + 会場ロゴ）と
// 協会ロゴはシングルス大会と共通の resultCanvasKit を使う。
// =============================================

import type { BracketMatch, MixedTeam, PlacementBracket } from './types';
import {
  COL, drawLine, drawResultHeader, drawText, drawTopAccentBar, fontOf,
  fitLogo, getAssociationLogoEnabled, loadResultLogos, roundRect,
} from '../draw/resultCanvasKit';

/** 順位カテゴリの表示名 */
export const MIXED_CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

export interface MixedBracketResultOptions {
  bracket: PlacementBracket;
  allTeams: MixedTeam[];
  tournamentName: string;
  /** 会場名（大会名の下にロゴ／名称を表示する） */
  venue?: string;
  /** 協会ロゴを入れるか（未指定なら保存済みの設定に従う） */
  showAssociationLogo?: boolean;
}

/** 姓だけを取り出す（2回戦以降の表示に使う） */
function familyName(name: string): string {
  const t = name.trim();
  const sp = t.split(/[\s\u3000]+/);
  if (sp.length > 1) return sp[0];
  return t.length >= 4 ? t.slice(0, 2) : t;
}

/** 空白を詰めた氏名 */
function compactName(name: string): string {
  return name.replace(/[\s\u3000]+/g, '');
}

/** 結果画像のファイル名 */
export function buildMixedBracketResultFileName(o: MixedBracketResultOptions): string {
  const cat = MIXED_CATEGORY_LABELS[o.bracket.category] || o.bracket.category;
  const name = (o.tournamentName || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${[name, cat, '結果'].filter(Boolean).join('_')}.jpg`;
}

/** ミックス大会の決勝トーナメント結果画像を生成する */
export async function generateMixedBracketResultDataUrl(
  o: MixedBracketResultOptions,
): Promise<string> {
  const { bracket, allTeams, tournamentName, venue } = o;
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const logos = await loadResultLogos();
  const showLogo = (o.showAssociationLogo ?? getAssociationLogoEnabled()) && !!logos.tcta;

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMatches: BracketMatch[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    roundMatches.push(matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
  }

  // ---- レイアウト定数（団体戦の結果画像に合わせる） ----
  const scale = 2;
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110;
  const matchW = 300;
  /** 2回戦以降は姓のみの表示なので、カード幅を詰めて余白を減らす */
  const matchWLater = 200;
  const rowH = 48;
  const matchH = rowH * 2;
  const roundGap = 44;
  /** 2回戦以降の列間も合わせて詰める */
  const roundGapLater = 32;
  const matchGap = 22;
  /**
   * 2回戦以降の縦の間隔をどれだけ詰めるか（1回戦は変えない）。
   * ラウンドが進むごとに ROUND_COMPRESS 倍ずつ間隔が縮み、
   * 後半の列が上下に間延びして見えるのを防ぐ。
   */
  const ROUND_COMPRESS = 0.68;

  const gridUnit = matchH + matchGap;
  const r1Count = roundMatches[0]?.length || 0;

  const bracketTopPad = 56;   // ラウンドラベル用
  const bracketSidePad = 28;
  /** 各ラウンドのカード幅 */
  const roundW = (ri: number) => (ri === 0 ? matchW : matchWLater);
  /** ブラケット左端からの各ラウンドの相対X座標 */
  const roundOffsets: number[] = [];
  {
    let x = 0;
    for (let ri = 0; ri < maxRound; ri++) {
      roundOffsets.push(x);
      x += roundW(ri) + (ri === 0 ? roundGap : roundGapLater);
    }
  }
  const bracketW = roundOffsets[maxRound - 1] + roundW(maxRound - 1);
  const tableW = Math.max(bracketW + bracketSidePad * 2, 760);

  // 協会ロゴ（ブラケット枠内の右下に配置）
  const tcta = showLogo ? fitLogo(logos.tcta, Math.min(440, tableW * 0.5), 96) : { w: 0, h: 0 };

  const bracketH = r1Count * gridUnit + bracketTopPad + 14;
  const totalW = tableW + paddingX * 2;
  const totalH = paddingY + 12 + headerH + bracketH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);
  drawTopAccentBar(ctx, totalW);

  // ---- ヘッダー（赤い四角＋墨の見出し。白ベース＋赤の差し色） ----
  drawResultHeader(ctx, {
    title: MIXED_CATEGORY_LABELS[bracket.category] || bracket.category,
    tournamentName,
    venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos,
  });

  // ---- ブラケット本体エリア ----
  const bracketAreaX = paddingX + Math.max(bracketSidePad, (tableW - bracketW) / 2);
  const bracketAreaY = paddingY + headerH;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, paddingX, bracketAreaY, tableW, bracketH, 18, COL.white);
  ctx.restore();
  roundRect(ctx, paddingX, bracketAreaY, tableW, bracketH, 18, undefined, COL.gray200, 1.5);

  // 1回戦の並びの中心。2回戦以降はこの線に向かって間隔を詰める
  const bracketCenterY =
    bracketAreaY + bracketTopPad + matchH / 2 + Math.max(0, r1Count - 1) * gridUnit / 2;

  const getMatchY = (ri: number, mi: number) => {
    const spacing = Math.pow(2, ri);
    const offset = (spacing - 1) * gridUnit / 2;
    const y = bracketAreaY + bracketTopPad + mi * spacing * gridUnit + offset + matchH / 2;
    if (ri === 0) return y;
    // 中心からの距離を縮めることで、並び順を保ったまま縦の余白だけを詰める
    return bracketCenterY + (y - bracketCenterY) * Math.pow(ROUND_COMPRESS, ri);
  };
  const getRoundX = (ri: number) => bracketAreaX + roundOffsets[ri];

  const getRoundName = (round: number) => {
    if (round === maxRound) return '決勝';
    if (round === maxRound - 1) return '準決勝';
    if (round === maxRound - 2) return '準々決勝';
    return `${round}回戦`;
  };

  // ---- 接続線 ----
  ctx.strokeStyle = COL.gray300;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  for (let ri = 0; ri < roundMatches.length - 1; ri++) {
    const x1 = getRoundX(ri) + roundW(ri);
    const x2 = getRoundX(ri + 1);
    const xMid = (x1 + x2) / 2;
    const rMatches = roundMatches[ri];
    for (let i = 0; i + 1 < rMatches.length; i += 2) {
      const y1 = getMatchY(ri, i);
      const y2 = getMatchY(ri, i + 1);
      const yNext = getMatchY(ri + 1, Math.floor(i / 2));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xMid, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(xMid, y2); ctx.stroke();
      // 縦線は次戦の位置まで伸ばす。間隔を詰めた分だけ次戦は2試合の中点から
      // ずれるため、中点だけを結ぶと横線が縦線から浮いてしまう。
      ctx.beginPath();
      ctx.moveTo(xMid, Math.min(y1, y2, yNext));
      ctx.lineTo(xMid, Math.max(y1, y2, yNext));
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xMid, yNext); ctx.lineTo(x2, yNext); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ---- ラウンドラベル ----
  for (let ri = 0; ri < roundMatches.length; ri++) {
    const round = ri + 1;
    const roundName = getRoundName(round);
    const labelX = getRoundX(ri) + roundW(ri) / 2;
    const labelY = bracketAreaY + 26;
    const isFinal = round === maxRound;

    ctx.font = fontOf('bold', 12);
    const labelW = ctx.measureText(roundName).width + 24;
    const labelH = 22;
    const labelBoxX = labelX - labelW / 2;
    const labelBoxY = labelY - labelH / 2;

    if (isFinal) {
      const grad = ctx.createLinearGradient(labelBoxX, 0, labelBoxX + labelW, 0);
      grad.addColorStop(0, COL.champ2);
      grad.addColorStop(1, COL.champ3);
      roundRect(ctx, labelBoxX, labelBoxY, labelW, labelH, 11, grad);
      ctx.fillStyle = COL.white;
    } else {
      roundRect(ctx, labelBoxX, labelBoxY, labelW, labelH, 11, COL.white, COL.gray300, 1);
      ctx.fillStyle = COL.gray700;
    }
    ctx.font = fontOf('bold', 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roundName, labelX, labelY + 1);
  }

  /** ペア1組分の行を描く */
  const drawPairRow = (
    cx: number, rowY: number, round: number, cardW: number,
    teamId: string | null, league: string, score: number | null,
    isWinner: boolean, tiebreak: number | null, defLabel?: string,
  ) => {
    if (isWinner) {
      ctx.fillStyle = COL.winRow;
      ctx.fillRect(cx + 6, rowY + 2, cardW - 12, rowH - 4);
    }
    const t = teamId ? allTeams.find(tm => tm.teamId === teamId) : null;
    if (!t) return;

    // リーグバッジ
    const badgeLabel = (league || t.leagueId || '').trim() || '-';
    ctx.font = fontOf('bold', 11);
    const bgW = Math.max(22, ctx.measureText(badgeLabel).width + 12);
    const bgH = 20;
    const bgX = cx + 10;
    const bgY = rowY + (rowH - bgH) / 2;
    roundRect(ctx, bgX, bgY, bgW, bgH, 5, COL.gray100, COL.gray200, 1);
    drawText(ctx, badgeLabel, bgX + bgW / 2, bgY + bgH / 2 + 0.5, 11, 'center', COL.gray700, 'bold', bgW - 6);

    // ペア番号
    const numX = bgX + bgW + 8;
    drawText(ctx, String(t.pairNumber), numX + 8, rowY + rowH / 2, 11, 'center', isWinner ? COL.gray700 : COL.gray400, 'medium');

    // 勝者は黒文字で強調する（敗者はグレー）。
    // 太いウェイトは漢字がつぶれて読みにくいため、太字は使わず色で差をつける。
    const nameColor = isWinner ? COL.gray900 : COL.gray700;
    const nameX = numX + 20;
    const y1 = rowY + rowH * 0.32;
    const y2 = rowY + rowH * 0.70;
    const scoreW = 34;

    if (round === 1) {
      // 1回戦: フルネーム + 所属
      const nameW = 96;
      drawText(ctx, compactName(t.male.name), nameX, y1, 14, 'left', nameColor, 'normal', nameW);
      drawText(ctx, compactName(t.female.name), nameX, y2, 14, 'left', nameColor, 'normal', nameW);
      const affX = nameX + nameW + 8;
      const affW = cardW - (affX - cx) - scoreW - 10;
      if (affW > 16) {
        drawText(ctx, t.male.affiliation, affX, y1, 10, 'left', COL.gray400, 'medium', affW);
        drawText(ctx, t.female.affiliation, affX, y2, 10, 'left', COL.gray400, 'medium', affW);
      }
    } else {
      // 2回戦以降: 姓のみ（横に長くならないように）
      const parts = t.teamName.split('・');
      const f1 = parts[0] && parts[0] !== t.male.name ? parts[0] : familyName(t.male.name);
      const f2 = parts[1] && parts[1] !== t.female.name ? parts[1] : familyName(t.female.name);
      const nameW = cardW - (nameX - cx) - scoreW - 10;
      drawText(ctx, f1, nameX, y1, 14, 'left', nameColor, 'normal', nameW);
      drawText(ctx, f2, nameX, y2, 14, 'left', nameColor, 'normal', nameW);
    }

    // スコア（棄権時はラベル）
    const scoreX = cx + cardW - 12;
    if (defLabel) {
      drawText(ctx, defLabel, scoreX, rowY + rowH / 2, 12, 'right', defLabel === 'W.O' ? COL.gray400 : COL.win, 'medium');
    } else if (score !== null) {
      // 勝者側のスコアは赤文字で目立たせる
      drawText(ctx, String(score), scoreX, rowY + rowH / 2, 20, 'right', isWinner ? COL.win : COL.gray300, 'medium');
      if (!isWinner && tiebreak != null) {
        ctx.font = fontOf('medium', 20);
        const sw = ctx.measureText(String(score)).width;
        drawText(ctx, `(${tiebreak})`, scoreX - sw - 3, rowY + rowH / 2, 10, 'right', COL.gray400, 'normal');
      }
    }
  };

  // ---- マッチカード ----
  const drawMatchCard = (ri: number, mi: number, match: BracketMatch) => {
    const cx = getRoundX(ri);
    const cardW = roundW(ri);
    const cyCenter = getMatchY(ri, mi);
    const round = ri + 1;

    // BYE: 勝ち上がったペアだけを1行で表示する
    if (match.isBye) {
      const winnerId = match.winnerId || match.team1Id || match.team2Id;
      if (!winnerId) return;
      const byeY = cyCenter - rowH / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      roundRect(ctx, cx, byeY, cardW, rowH, 12, COL.white);
      ctx.restore();
      roundRect(ctx, cx, byeY, cardW, rowH, 12, undefined, COL.gray200, 1.5);
      const league = winnerId === match.team1Id ? match.team1League : match.team2League;
      drawPairRow(cx, byeY, round, cardW, winnerId, league || '', null, false, null);
      return;
    }

    const cy = cyCenter - matchH / 2;
    const isFinished = match.status === 'finished';

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, cx, cy, cardW, matchH, 12, COL.white);
    ctx.restore();
    roundRect(ctx, cx, cy, cardW, matchH, 12, undefined, isFinished ? COL.gray300 : COL.gray200, 1.5);

    const win1 = !!match.winnerId && match.winnerId === match.team1Id;
    const win2 = !!match.winnerId && match.winnerId === match.team2Id;

    // 棄権表示: W.O（0-0で勝者あり）/ Ret（スコアの低い側が勝者＝途中棄権）
    let def1 = '';
    let def2 = '';
    if (match.winnerId && isFinished) {
      const s1 = match.score1 ?? 0;
      const s2 = match.score2 ?? 0;
      if (s1 === 0 && s2 === 0) {
        if (win1) def2 = 'W.O'; else if (win2) def1 = 'W.O';
      } else if ((win1 && s1 < s2) || (win2 && s2 < s1)) {
        if (win1) def2 = 'Ret'; else if (win2) def1 = 'Ret';
      }
    }
    const isWO = def1 === 'W.O' || def2 === 'W.O';

    drawPairRow(cx, cy, round, cardW, match.team1Id, match.team1League || '',
      isWO && win1 ? null : match.score1, win1, match.tiebreakScore, def1 || undefined);
    drawLine(ctx, cx + 8, cy + rowH, cx + cardW - 8, cy + rowH, COL.gray100, 1);
    drawPairRow(cx, cy + rowH, round, cardW, match.team2Id, match.team2League || '',
      isWO && win2 ? null : match.score2, win2, match.tiebreakScore, def2 || undefined);
  };

  for (let ri = 0; ri < roundMatches.length; ri++) {
    for (let mi = 0; mi < roundMatches[ri].length; mi++) {
      drawMatchCard(ri, mi, roundMatches[ri][mi]);
    }
  }

  // ---- 協会ロゴ（ブラケット枠内の右下） ----
  if (showLogo && logos.tcta && tcta.w > 0) {
    const logoX = paddingX + tableW - tcta.w - 16;
    const logoY = bracketAreaY + bracketH - tcta.h - 6;
    ctx.drawImage(logos.tcta, logoX, logoY, tcta.w, tcta.h);
  }

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Canvas to Blob failed')); return; }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.95);
  });
}
