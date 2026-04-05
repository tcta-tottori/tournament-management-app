import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント',
  '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

// レイアウト定数
const SCALE = 2;
const SLOT_W = 195;
const SLOT_H = 46;
const NUM_W = 28;
const PADDING_X = 30;
const PADDING_Y = 24;
const HEADER_H = 36;

// 描画ヘルパー
function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
}
function txt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts?: { align?: CanvasTextAlign; color?: string; bold?: boolean; maxW?: number }) {
  const { align = 'left', color = '#1a1a1a', bold = false, maxW } = opts || {};
  ctx.fillStyle = color; setFont(ctx, size, bold);
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(text, x, y, maxW); else ctx.fillText(text, x, y);
}
function ln(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = '#333', w = 1.2) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function rRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, sw = 1) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}
function approxW(t: string, fs: number): number {
  let w = 0; for (const c of t) w += c.charCodeAt(0) > 0x2fff ? fs : c === ' ' ? fs * 0.3 : fs * 0.6; return w;
}

// チーム描画（番号+名前+所属、バッジなし）
function drawTeamText(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  teamId: string | null, teamName: string, isBye: boolean,
  allTeams: MixedTeam[], side: 'left' | 'right'
) {
  // BYEは何も描画しない
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) {
    if (teamName) txt(ctx, teamName, x + SLOT_W / 2, y + SLOT_H / 2, 10, { align: 'center', color: '#999', maxW: SLOT_W - 8 });
    return;
  }
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) { txt(ctx, teamName || '?', x + SLOT_W / 2, y + SLOT_H / 2, 10, { align: 'center', color: '#999' }); return; }

  const maleY = y + 13;
  const femaleY = y + 33;

  if (side === 'left') {
    // [pair#] [name affil]
    txt(ctx, String(team.pairNumber), x + NUM_W / 2, y + SLOT_H / 2, 13, { align: 'center', bold: true });
    const nx = x + NUM_W + 5;
    const nameAreaW = SLOT_W - NUM_W - 8;
    txt(ctx, team.male.name, nx, maleY, 11, { bold: true, maxW: nameAreaW * 0.55 });
    const mnw = Math.min(approxW(team.male.name, 11), nameAreaW * 0.55);
    if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 3, maleY, 8, { color: '#777', maxW: nameAreaW - mnw - 6 });
    txt(ctx, team.female.name, nx, femaleY, 11, { bold: true, maxW: nameAreaW * 0.55 });
    const fnw = Math.min(approxW(team.female.name, 11), nameAreaW * 0.55);
    if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 3, femaleY, 8, { color: '#777', maxW: nameAreaW - fnw - 6 });
  } else {
    // [pair#] [name affil] (右側も左寄せ、ただし番号は右端に)
    txt(ctx, String(team.pairNumber), x + SLOT_W - NUM_W / 2, y + SLOT_H / 2, 13, { align: 'center', bold: true });
    const nx = x + 4;
    const nameAreaW = SLOT_W - NUM_W - 8;
    txt(ctx, team.male.name, nx, maleY, 11, { bold: true, maxW: nameAreaW * 0.55 });
    const mnw = Math.min(approxW(team.male.name, 11), nameAreaW * 0.55);
    if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 3, maleY, 8, { color: '#777', maxW: nameAreaW - mnw - 6 });
    txt(ctx, team.female.name, nx, femaleY, 11, { bold: true, maxW: nameAreaW * 0.55 });
    const fnw = Math.min(approxW(team.female.name, 11), nameAreaW * 0.55);
    if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 3, femaleY, 8, { color: '#777', maxW: nameAreaW - fnw - 6 });
  }
}

function familyName(name: string): string { return name.trim().split(/[\s　]+/)[0] || name; }

// スコアの色と太さ
const SCORE_COLOR = '#cc0000';
const SCORE_SIZE = 13;
const WIN_LINE_W = 2.5;
const LOSE_LINE_W = 1;
const WIN_COLOR = '#cc0000';
const DEFAULT_COLOR = '#444';

// ---------------------------------------------------------------------------
interface JunctionPoint { x: number; y: number }

export async function generateBracketDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!roundMap.has(m.round)) roundMap.set(m.round, []); roundMap.get(m.round)!.push(m); }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const r1 = roundMap.get(1) || [];
  const halfCount = Math.ceil(r1.length / 2);
  const leftR1 = r1.slice(0, halfCount);
  const rightR1 = r1.slice(halfCount);
  const sideRounds = maxRound >= 2 ? maxRound - 1 : maxRound;

  const matchBlockH = SLOT_H * 2 + 12;
  const r1Spacing = matchBlockH * 1.35;
  const maxR1 = Math.max(leftR1.length, rightR1.length, 1);
  const bracketAreaH = maxR1 * r1Spacing;

  const gapX = 75;
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * gapX : 0);
  const centerGap = 110;
  const totalW = PADDING_X * 2 + sideW * 2 + centerGap;
  const totalH = PADDING_Y * 2 + HEADER_H + bracketAreaH + 20;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SCALE; canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー: カテゴリ左上、大会名右上 ----
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const catW2 = approxW(catLabel, 15) + 28;
  rRect(ctx, PADDING_X, PADDING_Y, catW2, 28, 4, '#fff', '#222', 1.5);
  txt(ctx, catLabel, PADDING_X + catW2 / 2, PADDING_Y + 14, 15, { align: 'center', bold: true });
  txt(ctx, tournamentName, totalW - PADDING_X, PADDING_Y + 14, 14, { align: 'right', bold: true, color: '#333' });

  // ---- ブラケット描画 ----
  const bracketTop = PADDING_Y + HEADER_H + 8;
  const junctions = new Map<string, JunctionPoint>();

  // 左側R1
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + 12;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    const isBye1 = !m.team1Id && m.team1Name === 'BYE';
    const isBye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');

    // チーム描画
    drawTeamText(ctx, PADDING_X, t1y, m.team1Id, m.team1Name, isBye1, allTeams, 'left');
    drawTeamText(ctx, PADDING_X, t2y, m.team2Id, m.team2Name, isBye2, allTeams, 'left');

    // BYEの場合は線を簡略化
    if (isBye1 || isBye2) {
      // BYE試合: 片方のチームの線だけ次へ延長
      const exitX = PADDING_X + SLOT_W + gapX;
      const teamCy = isBye2 ? t1cy : t2cy;
      const isW = m.winnerId != null;
      ln(ctx, PADDING_X + SLOT_W, teamCy, exitX, teamCy, isW ? WIN_COLOR : DEFAULT_COLOR, isW ? WIN_LINE_W : LOSE_LINE_W);
      junctions.set(m.matchId, { x: exitX, y: teamCy });
      continue;
    }

    // ブラケット線
    const slotRight = PADDING_X + SLOT_W;
    const jx = slotRight + gapX / 2;
    const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
    const isW2 = m.winnerId === m.team2Id && m.winnerId != null;
    const hasWinner = isW1 || isW2;

    // 水平線（各チーム→接合点）
    ln(ctx, slotRight, t1cy, jx, t1cy, isW1 ? WIN_COLOR : DEFAULT_COLOR, isW1 ? WIN_LINE_W : LOSE_LINE_W);
    ln(ctx, slotRight, t2cy, jx, t2cy, isW2 ? WIN_COLOR : DEFAULT_COLOR, isW2 ? WIN_LINE_W : LOSE_LINE_W);
    // 縦線（勝者側のみ赤）
    ln(ctx, jx, t1cy, jx, t2cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
    // 出力水平線
    const exitX = slotRight + gapX;
    ln(ctx, jx, cy, exitX, cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);

    // スコア
    if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
      txt(ctx, String(m.score1), jx + 5, t1cy, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx + 5, t2cy, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
    }

    junctions.set(m.matchId, { x: exitX, y: cy });
  }

  // 右側R1
  for (let i = 0; i < rightR1.length; i++) {
    const m = rightR1[i];
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + 12;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    const isBye1 = !m.team1Id && m.team1Name === 'BYE';
    const isBye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');

    drawTeamText(ctx, totalW - PADDING_X - SLOT_W, t1y, m.team1Id, m.team1Name, isBye1, allTeams, 'right');
    drawTeamText(ctx, totalW - PADDING_X - SLOT_W, t2y, m.team2Id, m.team2Name, isBye2, allTeams, 'right');

    if (isBye1 || isBye2) {
      const exitX = totalW - PADDING_X - SLOT_W - gapX;
      const teamCy = isBye2 ? t1cy : t2cy;
      const isW = m.winnerId != null;
      ln(ctx, totalW - PADDING_X - SLOT_W, teamCy, exitX, teamCy, isW ? WIN_COLOR : DEFAULT_COLOR, isW ? WIN_LINE_W : LOSE_LINE_W);
      junctions.set(m.matchId, { x: exitX, y: teamCy });
      continue;
    }

    const slotLeft = totalW - PADDING_X - SLOT_W;
    const jx = slotLeft - gapX / 2;
    const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
    const isW2 = m.winnerId === m.team2Id && m.winnerId != null;
    const hasWinner = isW1 || isW2;

    ln(ctx, slotLeft, t1cy, jx, t1cy, isW1 ? WIN_COLOR : DEFAULT_COLOR, isW1 ? WIN_LINE_W : LOSE_LINE_W);
    ln(ctx, slotLeft, t2cy, jx, t2cy, isW2 ? WIN_COLOR : DEFAULT_COLOR, isW2 ? WIN_LINE_W : LOSE_LINE_W);
    ln(ctx, jx, t1cy, jx, t2cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
    const exitX = slotLeft - gapX;
    ln(ctx, jx, cy, exitX, cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);

    if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
      txt(ctx, String(m.score1), jx - 5, t1cy, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx - 5, t2cy, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
    }

    junctions.set(m.matchId, { x: exitX, y: cy });
  }

  // ---- Round 2以降（決勝除く）----
  for (let r = 2; r <= sideRounds; r++) {
    const roundMatches = roundMap.get(r) || [];
    const totalInRound = roundMatches.length;
    const halfInRound = Math.ceil(totalInRound / 2);

    for (const m of roundMatches) {
      const isLeft = m.position <= halfInRound;
      const parents = (roundMap.get(r - 1) || [])
        .filter(pm => pm.nextMatchId === m.matchId)
        .map(pm => junctions.get(pm.matchId))
        .filter(Boolean) as JunctionPoint[];

      if (parents.length < 2) {
        if (parents.length === 1) {
          const p = parents[0];
          const hasW = m.winnerId != null;
          const dir = isLeft ? 1 : -1;
          const exitX = p.x + dir * gapX;
          ln(ctx, p.x, p.y, exitX, p.y, hasW ? WIN_COLOR : DEFAULT_COLOR, hasW ? WIN_LINE_W : LOSE_LINE_W);
          junctions.set(m.matchId, { x: exitX, y: p.y });
        }
        continue;
      }

      const p1 = parents[0];
      const p2 = parents[1];
      const upperY = Math.min(p1.y, p2.y);
      const lowerY = Math.max(p1.y, p2.y);
      const cy = (upperY + lowerY) / 2;

      const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
      const isW2 = m.winnerId === m.team2Id && m.winnerId != null;
      const hasWinner = isW1 || isW2;

      if (isLeft) {
        const jx = p1.x + gapX / 2;
        ln(ctx, p1.x, upperY, jx, upperY, isW1 ? WIN_COLOR : DEFAULT_COLOR, isW1 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, p2.x, lowerY, jx, lowerY, isW2 ? WIN_COLOR : DEFAULT_COLOR, isW2 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, jx, upperY, jx, lowerY, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          txt(ctx, String(m.score1), jx + 5, upperY, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
          txt(ctx, String(m.score2), jx + 5, lowerY, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
        }
        const exitX = p1.x + gapX;
        ln(ctx, jx, cy, exitX, cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
        junctions.set(m.matchId, { x: exitX, y: cy });
      } else {
        const jx = p1.x - gapX / 2;
        ln(ctx, p1.x, upperY, jx, upperY, isW1 ? WIN_COLOR : DEFAULT_COLOR, isW1 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, p2.x, lowerY, jx, lowerY, isW2 ? WIN_COLOR : DEFAULT_COLOR, isW2 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, jx, upperY, jx, lowerY, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          txt(ctx, String(m.score1), jx - 5, upperY, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
          txt(ctx, String(m.score2), jx - 5, lowerY, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
        }
        const exitX = p1.x - gapX;
        ln(ctx, jx, cy, exitX, cy, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);
        junctions.set(m.matchId, { x: exitX, y: cy });
      }
    }
  }

  // ---- 決勝 ----
  if (maxRound >= 2) {
    const finals = roundMap.get(maxRound) || [];
    if (finals.length > 0) {
      const fm = finals[0];
      const parents = (roundMap.get(maxRound - 1) || [])
        .filter(pm => pm.nextMatchId === fm.matchId)
        .map(pm => junctions.get(pm.matchId))
        .filter(Boolean) as JunctionPoint[];

      if (parents.length >= 2) {
        const leftP = parents.find(p => p.x < totalW / 2) || parents[0];
        const rightP = parents.find(p => p.x >= totalW / 2) || parents[1];
        const upperY = leftP.y;
        const lowerY = rightP.y;
        const cy = (upperY + lowerY) / 2;
        const jx = totalW / 2;

        const isW1 = fm.winnerId === fm.team1Id && fm.winnerId != null;
        const isW2 = fm.winnerId === fm.team2Id && fm.winnerId != null;
        const hasWinner = isW1 || isW2;

        ln(ctx, leftP.x, upperY, jx, upperY, isW1 ? WIN_COLOR : DEFAULT_COLOR, isW1 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, rightP.x, lowerY, jx, lowerY, isW2 ? WIN_COLOR : DEFAULT_COLOR, isW2 ? WIN_LINE_W : LOSE_LINE_W);
        ln(ctx, jx, upperY, jx, lowerY, hasWinner ? WIN_COLOR : DEFAULT_COLOR, hasWinner ? WIN_LINE_W : LOSE_LINE_W);

        if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
          txt(ctx, String(fm.score1), jx + 6, upperY, SCORE_SIZE + 1, { color: SCORE_COLOR, bold: true });
          txt(ctx, String(fm.score2), jx + 6, lowerY, SCORE_SIZE + 1, { color: SCORE_COLOR, bold: true });
        }

        // 優勝者表示
        if (fm.winnerId) {
          const winner = allTeams.find(t => t.teamId === fm.winnerId);
          if (winner) {
            txt(ctx, `優勝: ${familyName(winner.male.name)}・${familyName(winner.female.name)}`, jx, cy, 12, { align: 'center', bold: true, color: WIN_COLOR });
          }
        }
      }
    }
  }

  // フッター
  txt(ctx, `${r1.length * 2}ドロー`, totalW / 2, totalH - 10, 9, { align: 'center', color: '#aaa' });

  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${CATEGORY_LABELS[bracket.category] || bracket.category}.jpg`;
  a.click();
}
