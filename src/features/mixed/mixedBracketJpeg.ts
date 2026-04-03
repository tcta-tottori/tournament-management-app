/**
 * ミックス大会 トーナメント表のCanvas描画 (JPEG出力)
 * 添付画像のような左右対称ブラケット形式のトーナメント表を生成する
 */
import type { PlacementBracket, BracketMatch, MixedTeam, PlacementCategory } from './types';

const FONT_BASE = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

/** 苗字を取得 */
function familyName(name: string): string {
  return name.trim().split(/[\s　]+/)[0] || name;
}

export interface BracketJpegOptions {
  bracket: PlacementBracket;
  allTeams: MixedTeam[];
  tournamentName: string;
}

/**
 * トーナメント表をCanvasに描画して返す
 * 左半分と右半分に分けて中央に決勝を配置する形式
 */
export function renderBracketToCanvas(opts: BracketJpegOptions): HTMLCanvasElement {
  const { bracket, allTeams, tournamentName } = opts;
  const drawSize = bracket.drawSize;
  const totalRounds = Math.log2(drawSize);
  const halfSize = drawSize / 2;

  const SCALE = 2;

  // レイアウト定数
  const SLOT_H = 50;        // 1スロットの高さ
  const SLOT_W = 250;       // 選手名スロット幅
  const BRACKET_W = 50;     // ブラケット線幅
  const SCORE_W = 35;       // スコア表示幅
  const ROUND_W = BRACKET_W + SCORE_W;
  const MARGIN_TOP = 60;
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 40;
  const MARGIN_BOTTOM = 30;
  const CENTER_GAP = 120;    // 中央の決勝表示スペース

  const bodyHeight = halfSize * 2; // 左右それぞれのスロット数分
  const halfH = bodyHeight * SLOT_H;

  // 左半分: スロット + (totalRounds-1)ラウンド分のブラケット
  // 右半分: 同じ構造を反転
  const halfRounds = totalRounds - 1; // 決勝を除くラウンド数
  const sideW = SLOT_W + halfRounds * ROUND_W;

  const canvasW = MARGIN_LEFT + sideW + CENTER_GAP + sideW + MARGIN_RIGHT;
  const canvasH = MARGIN_TOP + halfH + MARGIN_BOTTOM;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.textBaseline = 'middle';

  // タイトル (枠付き)
  const title = CATEGORY_LABELS[bracket.category] || bracket.label;
  ctx.font = `bold 18px ${FONT_BASE}`;
  ctx.fillStyle = '#000';
  const titleW = ctx.measureText(title).width + 24;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN_LEFT, 12, titleW, 32);
  ctx.textAlign = 'left';
  ctx.fillText(title, MARGIN_LEFT + 12, 28);

  // 1回戦の試合を左半分(上半分のドロー)と右半分(下半分のドロー)に分ける
  const r1Matches = bracket.matches.filter(m => m.round === 1).sort((a, b) => a.position - b.position);
  const leftMatches = r1Matches.slice(0, r1Matches.length / 2);
  const rightMatches = r1Matches.slice(r1Matches.length / 2);

  // スロット中心Y座標を計算
  function getSlotY(round: number, indexInHalf: number, totalInHalf: number): number {
    if (round === 0) {
      // 1回戦前のスロット: 等間隔配置
      const spacing = halfH / totalInHalf;
      return MARGIN_TOP + spacing * indexInHalf + spacing / 2;
    }
    // 上位ラウンド: 2つの子スロットの中間
    const childCount = totalInHalf / Math.pow(2, round);
    const child1 = getSlotY(round - 1, indexInHalf * 2, totalInHalf);
    const child2 = getSlotY(round - 1, indexInHalf * 2 + 1, totalInHalf);
    return (child1 + child2) / 2;
  }

  // 全ラウンドの試合マップ
  const matchMap = new Map<string, BracketMatch>();
  for (const m of bracket.matches) {
    matchMap.set(`${m.round}-${m.position}`, m);
  }

  // --- 左半分を描画 ---
  const leftStartX = MARGIN_LEFT;
  const leftSlotCount = halfSize; // 左半分のスロット数

  // 左側1回戦スロット描画
  for (let i = 0; i < leftMatches.length; i++) {
    const match = leftMatches[i];
    const t1Y = getSlotY(0, i * 2, leftSlotCount);
    const t2Y = getSlotY(0, i * 2 + 1, leftSlotCount);

    drawSlotLeft(ctx, leftStartX, t1Y, match.team1Id, match.team1Name, match.team1League, allTeams, SLOT_W);
    drawSlotLeft(ctx, leftStartX, t2Y, match.team2Id, match.team2Name, match.team2League, allTeams, SLOT_W);
  }

  // 左側ブラケット線とスコア描画
  for (let round = 1; round <= halfRounds; round++) {
    const matchesInRound = leftSlotCount / Math.pow(2, round);
    const bracketX = leftStartX + SLOT_W + (round - 1) * ROUND_W;

    for (let m = 0; m < matchesInRound; m++) {
      // マッチは全体のpositionで管理されている
      const globalPos = m + 1;
      // 左半分のラウンドでの試合位置
      let actualMatch: BracketMatch | undefined;
      if (round === 1) {
        actualMatch = leftMatches[m];
      } else {
        // 上位ラウンドの左半分のマッチを探す
        const posInFullBracket = m + 1;
        actualMatch = matchMap.get(`${round}-${posInFullBracket}`);
      }

      const topY = getSlotY(round - 1, m * 2, leftSlotCount);
      const botY = getSlotY(round - 1, m * 2 + 1, leftSlotCount);
      const midY = getSlotY(round, m, leftSlotCount);

      const isFinished = actualMatch && (actualMatch.status === 'finished' || actualMatch.status === 'bye');
      const winnerIsT1 = isFinished && actualMatch.winnerId === actualMatch.team1Id;
      const winnerIsT2 = isFinished && actualMatch.winnerId === actualMatch.team2Id;

      // 上ブラケット線
      ctx.strokeStyle = winnerIsT1 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsT1 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, topY);
      ctx.lineTo(bracketX + BRACKET_W / 2, topY);
      ctx.lineTo(bracketX + BRACKET_W / 2, midY);
      ctx.stroke();

      // 下ブラケット線
      ctx.strokeStyle = winnerIsT2 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsT2 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, botY);
      ctx.lineTo(bracketX + BRACKET_W / 2, botY);
      ctx.lineTo(bracketX + BRACKET_W / 2, midY);
      ctx.stroke();

      // 接続線
      const hasWinner = winnerIsT1 || winnerIsT2;
      ctx.strokeStyle = hasWinner ? '#cc0000' : '#333';
      ctx.lineWidth = hasWinner ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX + BRACKET_W / 2, midY);
      ctx.lineTo(bracketX + BRACKET_W, midY);
      ctx.stroke();

      // スコア
      if (actualMatch && isFinished && !actualMatch.isBye) {
        ctx.fillStyle = '#000';
        ctx.font = `12px ${FONT_BASE}`;
        ctx.textAlign = 'left';
        if (actualMatch.score1 !== null && actualMatch.score2 !== null) {
          ctx.fillText(`${actualMatch.score1}`, bracketX + BRACKET_W / 2 + 4, topY - 1);
          ctx.fillText(`${actualMatch.score2}`, bracketX + BRACKET_W / 2 + 4, botY - 1);
        }
      }
    }
  }

  // --- 右半分を描画 (ミラー) ---
  const rightStartX = MARGIN_LEFT + sideW + CENTER_GAP + sideW; // 右端から描画

  // 右側1回戦スロット
  for (let i = 0; i < rightMatches.length; i++) {
    const match = rightMatches[i];
    const t1Y = getSlotY(0, i * 2, leftSlotCount);
    const t2Y = getSlotY(0, i * 2 + 1, leftSlotCount);

    drawSlotRight(ctx, rightStartX, t1Y, match.team1Id, match.team1Name, match.team1League, allTeams, SLOT_W);
    drawSlotRight(ctx, rightStartX, t2Y, match.team2Id, match.team2Name, match.team2League, allTeams, SLOT_W);
  }

  // 右側ブラケット線とスコア描画 (ミラー)
  for (let round = 1; round <= halfRounds; round++) {
    const matchesInRound = leftSlotCount / Math.pow(2, round);
    const bracketX = rightStartX - SLOT_W - (round - 1) * ROUND_W;

    for (let m = 0; m < matchesInRound; m++) {
      // 右半分の試合位置: 全体のposition offset
      const leftCount = leftSlotCount / Math.pow(2, round);
      const posInFullBracket = leftCount + m + 1;
      let actualMatch: BracketMatch | undefined;
      if (round === 1) {
        actualMatch = rightMatches[m];
      } else {
        actualMatch = matchMap.get(`${round}-${posInFullBracket}`);
      }

      const topY = getSlotY(round - 1, m * 2, leftSlotCount);
      const botY = getSlotY(round - 1, m * 2 + 1, leftSlotCount);
      const midY = getSlotY(round, m, leftSlotCount);

      const isFinished = actualMatch && (actualMatch.status === 'finished' || actualMatch.status === 'bye');
      const winnerIsT1 = isFinished && actualMatch.winnerId === actualMatch.team1Id;
      const winnerIsT2 = isFinished && actualMatch.winnerId === actualMatch.team2Id;

      // 上ブラケット線 (右向き→左向き)
      ctx.strokeStyle = winnerIsT1 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsT1 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, topY);
      ctx.lineTo(bracketX - BRACKET_W / 2, topY);
      ctx.lineTo(bracketX - BRACKET_W / 2, midY);
      ctx.stroke();

      // 下ブラケット線
      ctx.strokeStyle = winnerIsT2 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsT2 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, botY);
      ctx.lineTo(bracketX - BRACKET_W / 2, botY);
      ctx.lineTo(bracketX - BRACKET_W / 2, midY);
      ctx.stroke();

      // 接続線
      const hasWinner = winnerIsT1 || winnerIsT2;
      ctx.strokeStyle = hasWinner ? '#cc0000' : '#333';
      ctx.lineWidth = hasWinner ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX - BRACKET_W / 2, midY);
      ctx.lineTo(bracketX - BRACKET_W, midY);
      ctx.stroke();

      // スコア
      if (actualMatch && isFinished && !actualMatch.isBye) {
        ctx.fillStyle = '#000';
        ctx.font = `12px ${FONT_BASE}`;
        ctx.textAlign = 'right';
        if (actualMatch.score1 !== null && actualMatch.score2 !== null) {
          ctx.fillText(`${actualMatch.score1}`, bracketX - BRACKET_W / 2 - 4, topY - 1);
          ctx.fillText(`${actualMatch.score2}`, bracketX - BRACKET_W / 2 - 4, botY - 1);
        }
      }
    }
  }

  // --- 決勝 (中央) ---
  const finalMatch = matchMap.get(`${totalRounds}-1`);
  const centerX = MARGIN_LEFT + sideW + CENTER_GAP / 2;
  const centerY = MARGIN_TOP + halfH / 2;

  // 左半分の準決勝勝者→決勝の左側
  const leftSemiY = getSlotY(halfRounds, 0, leftSlotCount);
  const leftBracketEndX = leftStartX + SLOT_W + halfRounds * ROUND_W;

  // 右半分の準決勝勝者→決勝の右側
  const rightSemiY = getSlotY(halfRounds, 0, leftSlotCount);
  const rightBracketEndX = rightStartX - SLOT_W - halfRounds * ROUND_W;

  if (finalMatch) {
    const isFinished = finalMatch.status === 'finished';
    const winnerIsT1 = isFinished && finalMatch.winnerId === finalMatch.team1Id;
    const winnerIsT2 = isFinished && finalMatch.winnerId === finalMatch.team2Id;

    // 左からの線
    ctx.strokeStyle = winnerIsT1 ? '#cc0000' : '#333';
    ctx.lineWidth = winnerIsT1 ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(leftBracketEndX, leftSemiY);
    ctx.lineTo(centerX, leftSemiY);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();

    // 右からの線
    ctx.strokeStyle = winnerIsT2 ? '#cc0000' : '#333';
    ctx.lineWidth = winnerIsT2 ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(rightBracketEndX, rightSemiY);
    ctx.lineTo(centerX, rightSemiY);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();

    // 決勝スコアと勝者
    if (isFinished) {
      const winner = allTeams.find(t => t.teamId === finalMatch.winnerId);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      if (winner) {
        ctx.font = `bold 14px ${FONT_BASE}`;
        ctx.fillText(`${familyName(winner.male.name)}・${familyName(winner.female.name)}`, centerX, centerY - 10);
      }
      if (finalMatch.score1 !== null && finalMatch.score2 !== null) {
        ctx.font = `bold 14px ${FONT_BASE}`;
        ctx.fillText(`${finalMatch.score1}-${finalMatch.score2}`, centerX, centerY + 10);
      }
    }
  }

  return canvas;
}

/** 左側のスロットを描画 */
function drawSlotLeft(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  teamId: string | null, teamName: string, leagueId: string,
  allTeams: MixedTeam[], slotW: number
): void {
  if (!teamId || teamName === 'BYE') {
    // BYEは何も描画しない
    return;
  }

  const team = allTeams.find(t => t.teamId === teamId);
  ctx.fillStyle = '#000';

  // ペア番号
  ctx.font = `12px ${FONT_BASE}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${team?.pairNumber || ''}`, x + 22, y);

  // 選手名 (男子 + 女子)
  ctx.textAlign = 'left';
  if (team) {
    ctx.font = `bold 12px ${FONT_BASE}`;
    ctx.fillText(`${team.male.name}`, x + 30, y - 8);
    ctx.fillText(`${team.female.name}`, x + 30, y + 8);

    // 所属 (括弧付き)
    ctx.font = `10px ${FONT_BASE}`;
    ctx.fillStyle = '#333';
    const maleNameW = ctx.measureText(team.male.name).width;
    const femaleNameW = ctx.measureText(team.female.name).width;
    ctx.font = `10px ${FONT_BASE}`;
    ctx.fillText(`（${team.male.affiliation}）`, x + 30 + maleNameW + 4, y - 8);
    ctx.fillText(`（${team.female.affiliation}）`, x + 30 + femaleNameW + 4, y + 8);
  } else {
    ctx.font = `bold 12px ${FONT_BASE}`;
    ctx.fillText(teamName, x + 30, y);
  }

  // 水平線
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + slotW - 10, y);
  ctx.lineTo(x + slotW, y);
  ctx.stroke();
}

/** 右側のスロットを描画 (ミラー) */
function drawSlotRight(
  ctx: CanvasRenderingContext2D,
  rightEdgeX: number, y: number,
  teamId: string | null, teamName: string, leagueId: string,
  allTeams: MixedTeam[], slotW: number
): void {
  if (!teamId || teamName === 'BYE') return;

  const team = allTeams.find(t => t.teamId === teamId);
  const x = rightEdgeX - slotW;
  ctx.fillStyle = '#000';

  // ペア番号 (右端)
  ctx.font = `12px ${FONT_BASE}`;
  ctx.textAlign = 'left';
  ctx.fillText(`${team?.pairNumber || ''}`, rightEdgeX - 22, y);

  // 選手名 (右寄せ)
  ctx.textAlign = 'right';
  if (team) {
    ctx.font = `bold 12px ${FONT_BASE}`;
    const nameEndX = rightEdgeX - 30;
    // 所属 + 名前を右から描画
    ctx.font = `10px ${FONT_BASE}`;
    ctx.fillStyle = '#333';
    const maleAff = `（${team.male.affiliation}）`;
    const femaleAff = `（${team.female.affiliation}）`;
    ctx.fillText(maleAff, nameEndX, y - 8);
    ctx.fillText(femaleAff, nameEndX, y + 8);

    const maleAffW = ctx.measureText(maleAff).width;
    const femaleAffW = ctx.measureText(femaleAff).width;

    ctx.fillStyle = '#000';
    ctx.font = `bold 12px ${FONT_BASE}`;
    ctx.fillText(team.male.name, nameEndX - maleAffW - 4, y - 8);
    ctx.fillText(team.female.name, nameEndX - femaleAffW - 4, y + 8);
  } else {
    ctx.font = `bold 12px ${FONT_BASE}`;
    ctx.fillText(teamName, rightEdgeX - 30, y);
  }

  // 水平線
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y);
  ctx.stroke();
}

/**
 * トーナメント表のCanvasをJPEGとしてダウンロード
 */
export function downloadBracketAsJpeg(canvas: HTMLCanvasElement, category: PlacementCategory, tournamentName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournamentName}_${CATEGORY_LABELS[category]}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}
