import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント',
  '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

const SCALE = 2;
const SLOT_W = 170;
const SLOT_H = 44;
const NUM_W = 28;
const PADDING_X = 32;
const PADDING_Y = 30;
const HEADER_H = 44;

const WIN_COLOR = '#cc0000';
const LINE_COLOR = '#222';
const WIN_W = 2.8;
const LOSE_W = 0.8;
const SCORE_COLOR = '#222'; // 黒
const SCORE_SIZE = 12;

function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
}
function txt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts?: { align?: CanvasTextAlign; color?: string; bold?: boolean; maxW?: number }) {
  const { align = 'left', color = '#1a1a1a', bold = false, maxW } = opts || {};
  ctx.fillStyle = color; setFont(ctx, size, bold);
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(text, x, y, maxW); else ctx.fillText(text, x, y);
}
function ln(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, w: number) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function approxW(t: string, fs: number): number {
  let w = 0; for (const c of t) w += c.charCodeAt(0) > 0x2fff ? fs : c === ' ' ? fs * 0.3 : fs * 0.6; return w;
}

function drawTeamLeft(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) return;
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  txt(ctx, String(team.pairNumber), x, y + SLOT_H / 2, 14, { bold: true });
  const nx = x + NUM_W;
  const mw = SLOT_W - NUM_W;
  txt(ctx, team.male.name, nx, y + 12, 11, { bold: true, maxW: mw * 0.52 });
  const mnw = Math.min(approxW(team.male.name, 11), mw * 0.52);
  if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 3, y + 12, 8, { color: '#666', maxW: mw - mnw - 6 });
  txt(ctx, team.female.name, nx, y + 32, 11, { bold: true, maxW: mw * 0.52 });
  const fnw = Math.min(approxW(team.female.name, 11), mw * 0.52);
  if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 3, y + 32, 8, { color: '#666', maxW: mw - fnw - 6 });
}

function drawTeamRight(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) return;
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  // 名前+所属を左側、番号を右端（線から離す）
  const mw = SLOT_W - NUM_W - 8;
  txt(ctx, team.male.name, x, y + 12, 11, { bold: true, maxW: mw * 0.52 });
  const mnw = Math.min(approxW(team.male.name, 11), mw * 0.52);
  if (team.male.affiliation) txt(ctx, team.male.affiliation, x + mnw + 3, y + 12, 8, { color: '#666', maxW: mw - mnw - 6 });
  txt(ctx, team.female.name, x, y + 32, 11, { bold: true, maxW: mw * 0.52 });
  const fnw = Math.min(approxW(team.female.name, 11), mw * 0.52);
  if (team.female.affiliation) txt(ctx, team.female.affiliation, x + fnw + 3, y + 32, 8, { color: '#666', maxW: mw - fnw - 6 });
  // 番号は右端に配置（線と被らないよう）
  txt(ctx, String(team.pairNumber), x + SLOT_W - 2, y + SLOT_H / 2, 14, { align: 'right', bold: true });
}

function familyName(name: string): string { return name.trim().split(/[\s　]+/)[0] || name; }

function isByeMatch(m: BracketMatch): boolean {
  return m.isBye || (!m.team1Id && m.team1Name === 'BYE') || (!m.team2Id && m.team2Name === 'BYE');
}

function drawBracketLines(
  ctx: CanvasRenderingContext2D,
  t1cy: number, t2cy: number, cy: number,
  fromX: number, jx: number, exitX: number,
  m: BracketMatch, isLeft: boolean
) {
  const w1 = m.winnerId === m.team1Id && m.winnerId != null;
  const w2 = m.winnerId === m.team2Id && m.winnerId != null;
  const hasW = w1 || w2;

  ln(ctx, fromX, t1cy, jx, t1cy, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
  ln(ctx, fromX, t2cy, jx, t2cy, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);

  if (hasW) {
    if (w1) {
      ln(ctx, jx, t1cy, jx, cy, WIN_COLOR, WIN_W);
      ln(ctx, jx, cy, jx, t2cy, LINE_COLOR, LOSE_W);
    } else {
      ln(ctx, jx, t1cy, jx, cy, LINE_COLOR, LOSE_W);
      ln(ctx, jx, cy, jx, t2cy, WIN_COLOR, WIN_W);
    }
  } else {
    ln(ctx, jx, t1cy, jx, t2cy, LINE_COLOR, LOSE_W);
  }

  ln(ctx, jx, cy, exitX, cy, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);

  // スコア（黒、横線のすぐそば）
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    if (isLeft) {
      txt(ctx, String(m.score1), jx + 2, t1cy - 1, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx + 2, t2cy - 1, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
    } else {
      txt(ctx, String(m.score1), jx - 2, t1cy - 1, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx - 2, t2cy - 1, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
    }
  }
}

interface JP { x: number; y: number }

export async function generateBracketDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const rm = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!rm.has(m.round)) rm.set(m.round, []); rm.get(m.round)!.push(m); }
  for (const [, a] of rm) a.sort((a, b) => a.position - b.position);

  const r1 = rm.get(1) || [];
  const half = Math.ceil(r1.length / 2);
  const leftR1 = r1.slice(0, half);
  const rightR1 = r1.slice(half);
  const sideRounds = maxRound >= 2 ? maxRound - 1 : maxRound;

  // BYEマッチはスペースを小さくする
  const normalSlotGap = 14;
  const byeSlotH = 16; // BYEスロットの高さを小さく

  // R1の各マッチのY位置を計算（BYEは小さく）
  function calcR1Positions(r1Matches: BracketMatch[]) {
    const positions: { t1y: number; t2y: number; cy: number }[] = [];
    let curY = 0;
    for (const m of r1Matches) {
      const bye = isByeMatch(m);
      const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
      const bye1 = !m.team1Id && m.team1Name === 'BYE';
      const h1 = (bye1 ? byeSlotH : SLOT_H);
      const h2 = (bye2 ? byeSlotH : SLOT_H);
      const gap = bye ? 4 : normalSlotGap;
      const t1y = curY;
      const t2y = t1y + h1 + gap;
      const t1cy = t1y + h1 / 2;
      const t2cy = t2y + h2 / 2;
      const cy = (t1cy + t2cy) / 2;
      positions.push({ t1y, t2y, cy });
      curY = t2y + h2 + 30; // マッチ間の間隔
    }
    return positions;
  }

  const leftPos = calcR1Positions(leftR1);
  const rightPos = calcR1Positions(rightR1);
  const areaH = Math.max(
    leftPos.length > 0 ? leftPos[leftPos.length - 1].t2y + SLOT_H + 10 : 200,
    rightPos.length > 0 ? rightPos[rightPos.length - 1].t2y + SLOT_H + 10 : 200,
  );

  const gapX = 75;
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * gapX : 0);
  const centerGap = 160;
  const totalW = PADDING_X * 2 + sideW * 2 + centerGap;
  const winnerAreaH = 50;
  const totalH = PADDING_Y * 2 + HEADER_H + winnerAreaH + areaH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SCALE; canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー: トーナメント名(左上) + 大会名(右上) ----
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const cw = approxW(catLabel, 16) + 30;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.strokeRect(PADDING_X, PADDING_Y, cw, 30);
  txt(ctx, catLabel, PADDING_X + cw / 2, PADDING_Y + 15, 16, { align: 'center', bold: true });
  txt(ctx, tournamentName, totalW - PADDING_X, PADDING_Y + 15, 14, { align: 'right', bold: true, color: '#333' });

  // ヘッダー下線
  ln(ctx, PADDING_X, PADDING_Y + 38, totalW - PADDING_X, PADDING_Y + 38, '#ddd', 0.5);

  const top = PADDING_Y + HEADER_H + winnerAreaH;
  const jp = new Map<string, JP>();

  // 左R1
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const pos = leftPos[i];
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    const bye = isByeMatch(m);
    const h1 = bye1 ? byeSlotH : SLOT_H;
    const h2 = bye2 ? byeSlotH : SLOT_H;
    const t1cy = top + pos.t1y + h1 / 2;
    const t2cy = top + pos.t2y + h2 / 2;
    const cy = (t1cy + t2cy) / 2;

    drawTeamLeft(ctx, PADDING_X, top + pos.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamLeft(ctx, PADDING_X, top + pos.t2y, m.team2Id, m.team2Name, bye2, allTeams);

    const slotR = PADDING_X + SLOT_W;
    const exitX = slotR + gapX;

    if (bye) {
      const teamCy = bye2 ? t1cy : t2cy;
      ln(ctx, slotR, teamCy, exitX, teamCy, LINE_COLOR, LOSE_W);
      jp.set(m.matchId, { x: exitX, y: teamCy });
    } else {
      const jx = slotR + gapX * 0.42;
      drawBracketLines(ctx, t1cy, t2cy, cy, slotR, jx, exitX, m, true);
      jp.set(m.matchId, { x: exitX, y: cy });
    }
  }

  // 右R1
  for (let i = 0; i < rightR1.length; i++) {
    const m = rightR1[i];
    const pos = rightPos[i];
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    const bye = isByeMatch(m);
    const h1 = bye1 ? byeSlotH : SLOT_H;
    const h2 = bye2 ? byeSlotH : SLOT_H;
    const t1cy = top + pos.t1y + h1 / 2;
    const t2cy = top + pos.t2y + h2 / 2;
    const cy = (t1cy + t2cy) / 2;

    const rx = totalW - PADDING_X - SLOT_W;
    drawTeamRight(ctx, rx, top + pos.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamRight(ctx, rx, top + pos.t2y, m.team2Id, m.team2Name, bye2, allTeams);

    const slotL = rx;
    const exitX = slotL - gapX;

    if (bye) {
      const teamCy = bye2 ? t1cy : t2cy;
      ln(ctx, slotL, teamCy, exitX, teamCy, LINE_COLOR, LOSE_W);
      jp.set(m.matchId, { x: exitX, y: teamCy });
    } else {
      const jx = slotL - gapX * 0.42;
      drawBracketLines(ctx, t1cy, t2cy, cy, slotL, jx, exitX, m, false);
      jp.set(m.matchId, { x: exitX, y: cy });
    }
  }

  // R2以降（決勝除く）
  for (let r = 2; r <= sideRounds; r++) {
    const rms = rm.get(r) || [];
    const total = rms.length;
    const halfR = Math.ceil(total / 2);
    for (const m of rms) {
      const isLeft = m.position <= halfR;
      const parents = (rm.get(r - 1) || [])
        .filter(pm => pm.nextMatchId === m.matchId)
        .map(pm => jp.get(pm.matchId))
        .filter(Boolean) as JP[];

      if (parents.length < 2) {
        if (parents.length === 1) {
          const p = parents[0];
          const hasW = m.winnerId != null && !isByeMatch(m);
          const exitX = p.x + (isLeft ? gapX : -gapX);
          ln(ctx, p.x, p.y, exitX, p.y, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);
          jp.set(m.matchId, { x: exitX, y: p.y });
        }
        continue;
      }

      const upperY = Math.min(parents[0].y, parents[1].y);
      const lowerY = Math.max(parents[0].y, parents[1].y);
      const cy = (upperY + lowerY) / 2;
      const baseX = parents[0].x;

      if (isLeft) {
        const jx = baseX + gapX * 0.42;
        const exitX = baseX + gapX;
        drawBracketLines(ctx, upperY, lowerY, cy, baseX, jx, exitX, m, true);
        jp.set(m.matchId, { x: exitX, y: cy });
      } else {
        const jx = baseX - gapX * 0.42;
        const exitX = baseX - gapX;
        drawBracketLines(ctx, upperY, lowerY, cy, baseX, jx, exitX, m, false);
        jp.set(m.matchId, { x: exitX, y: cy });
      }
    }
  }

  // 決勝
  if (maxRound >= 2) {
    const finals = rm.get(maxRound) || [];
    if (finals.length > 0) {
      const fm = finals[0];
      const parents = (rm.get(maxRound - 1) || [])
        .filter(pm => pm.nextMatchId === fm.matchId)
        .map(pm => jp.get(pm.matchId))
        .filter(Boolean) as JP[];

      if (parents.length >= 2) {
        const leftP = parents.find(p => p.x < totalW / 2) || parents[0];
        const rightP = parents.find(p => p.x >= totalW / 2) || parents[1];
        const jx = totalW / 2;

        const w1 = fm.winnerId === fm.team1Id && fm.winnerId != null;
        const w2 = fm.winnerId === fm.team2Id && fm.winnerId != null;

        // 左右の中間Y（ぴったり合わせる）
        const meetY = (leftP.y + rightP.y) / 2;

        // 左山 → 中央: まず水平に中央へ、次に縦にmeetYへ
        // 勝者側のみ赤線
        ln(ctx, leftP.x, leftP.y, jx, leftP.y, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
        ln(ctx, jx, leftP.y, jx, meetY, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);

        // 右山 → 中央
        ln(ctx, rightP.x, rightP.y, jx, rightP.y, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);
        ln(ctx, jx, rightP.y, jx, meetY, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);

        // 優勝者: meetYから上に線を伸ばし、その上に名前+スコア
        if (fm.winnerId) {
          const w = allTeams.find(t => t.teamId === fm.winnerId);
          if (w) {
            const lineTop = meetY - 30;
            ln(ctx, jx, meetY, jx, lineTop, WIN_COLOR, WIN_W);
            const nameStr = `${familyName(w.male.name)}・${familyName(w.female.name)}`;
            txt(ctx, nameStr, jx, lineTop - 14, 13, { align: 'center', bold: true });
            if (fm.score1 != null && fm.score2 != null) {
              txt(ctx, `${fm.score1}−${fm.score2}`, jx, lineTop - 30, 11, { align: 'center', color: '#555' });
            }
          }
        }
      }
    }
  }

  txt(ctx, `${r1.length * 2}ドロー`, totalW / 2, totalH - 8, 9, { align: 'center', color: '#bbb' });
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${CATEGORY_LABELS[bracket.category] || bracket.category}.jpg`;
  a.click();
}
