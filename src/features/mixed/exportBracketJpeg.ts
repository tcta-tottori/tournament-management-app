import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント',
  '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

const SCALE = 2;
const SLOT_W = 195;
const SLOT_H = 44;
const NUM_W = 30;
const PADDING_X = 32;
const PADDING_Y = 30;
const HEADER_H = 50;

const WIN_COLOR = '#cc0000';
const LINE_COLOR = '#222';
const WIN_W = 2.8;
const LOSE_W = 0.8;
const SCORE_COLOR = '#cc0000';
const SCORE_SIZE = 14;

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

function drawTeam(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[], side: 'left' | 'right') {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) { if (teamName) txt(ctx, teamName, x + SLOT_W / 2, y + SLOT_H / 2, 10, { align: 'center', color: '#999' }); return; }
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  const my = y + 12, fy = y + 32;
  if (side === 'left') {
    txt(ctx, String(team.pairNumber), x, y + SLOT_H / 2, 14, { bold: true });
    const nx = x + NUM_W;
    const mw = SLOT_W - NUM_W;
    txt(ctx, team.male.name, nx, my, 11, { bold: true, maxW: mw * 0.52 });
    const mnw = Math.min(approxW(team.male.name, 11), mw * 0.52);
    if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 3, my, 8, { color: '#666', maxW: mw - mnw - 6 });
    txt(ctx, team.female.name, nx, fy, 11, { bold: true, maxW: mw * 0.52 });
    const fnw = Math.min(approxW(team.female.name, 11), mw * 0.52);
    if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 3, fy, 8, { color: '#666', maxW: mw - fnw - 6 });
  } else {
    txt(ctx, String(team.pairNumber), x + SLOT_W, y + SLOT_H / 2, 14, { align: 'right', bold: true });
    const nx = x;
    const mw = SLOT_W - NUM_W;
    txt(ctx, team.male.name, nx, my, 11, { bold: true, maxW: mw * 0.52 });
    const mnw = Math.min(approxW(team.male.name, 11), mw * 0.52);
    if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 3, my, 8, { color: '#666', maxW: mw - mnw - 6 });
    txt(ctx, team.female.name, nx, fy, 11, { bold: true, maxW: mw * 0.52 });
    const fnw = Math.min(approxW(team.female.name, 11), mw * 0.52);
    if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 3, fy, 8, { color: '#666', maxW: mw - fnw - 6 });
  }
}

function familyName(name: string): string { return name.trim().split(/[\s　]+/)[0] || name; }

/**
 * ブラケット線描画（赤線ロジック修正版）
 * - 勝者の水平線: 赤太線
 * - 敗者の水平線: 黒細線
 * - 縦線: 勝者の中心(cy)から勝者チーム側が赤、敗者チーム側は黒
 * - 出力水平線: 勝者確定なら赤
 */
function drawBracketLines(
  ctx: CanvasRenderingContext2D,
  t1cy: number, t2cy: number, cy: number,
  fromX: number, jx: number, exitX: number,
  m: BracketMatch, isLeft: boolean
) {
  const w1 = m.winnerId === m.team1Id && m.winnerId != null;
  const w2 = m.winnerId === m.team2Id && m.winnerId != null;
  const hasW = w1 || w2;

  // 水平線: team1 → junction
  ln(ctx, fromX, t1cy, jx, t1cy, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
  // 水平線: team2 → junction
  ln(ctx, fromX, t2cy, jx, t2cy, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);

  // 縦線: 2分割 — 勝者側は赤、敗者側は黒
  if (hasW) {
    if (w1) {
      // team1が勝者: t1cy→cy が赤、cy→t2cy が黒
      ln(ctx, jx, t1cy, jx, cy, WIN_COLOR, WIN_W);
      ln(ctx, jx, cy, jx, t2cy, LINE_COLOR, LOSE_W);
    } else {
      // team2が勝者: cy→t2cy が赤、t1cy→cy が黒
      ln(ctx, jx, t1cy, jx, cy, LINE_COLOR, LOSE_W);
      ln(ctx, jx, cy, jx, t2cy, WIN_COLOR, WIN_W);
    }
  } else {
    ln(ctx, jx, t1cy, jx, t2cy, LINE_COLOR, LOSE_W);
  }

  // 出力水平線
  ln(ctx, jx, cy, exitX, cy, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);

  // スコア
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    if (isLeft) {
      txt(ctx, String(m.score1), jx + 5, t1cy, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx + 5, t2cy, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
    } else {
      txt(ctx, String(m.score1), jx - 5, t1cy, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx - 5, t2cy, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
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

  const slotGap = 14;
  const matchBlock = SLOT_H * 2 + slotGap;
  const r1Space = matchBlock * 1.4;
  const maxR1 = Math.max(leftR1.length, rightR1.length, 1);
  const areaH = maxR1 * r1Space;

  const gapX = 80;
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * gapX : 0);
  const centerGap = 160; // 優勝者表示用に広く
  const totalW = PADDING_X * 2 + sideW * 2 + centerGap;
  const totalH = PADDING_Y * 2 + HEADER_H + areaH + 16;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SCALE; canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);

  // ヘッダー
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const cw = approxW(catLabel, 16) + 30;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.strokeRect(PADDING_X, PADDING_Y, cw, 30);
  txt(ctx, catLabel, PADDING_X + cw / 2, PADDING_Y + 15, 16, { align: 'center', bold: true });
  txt(ctx, tournamentName, totalW - PADDING_X, PADDING_Y + 15, 14, { align: 'right', bold: true, color: '#333' });

  // ヘッダー下線
  ln(ctx, PADDING_X, PADDING_Y + HEADER_H - 4, totalW - PADDING_X, PADDING_Y + HEADER_H - 4, '#ccc', 0.5);

  const top = PADDING_Y + HEADER_H;
  const jp = new Map<string, JP>();

  // 左R1
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const t1y = top + i * r1Space;
    const t2y = t1y + SLOT_H + slotGap;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');

    drawTeam(ctx, PADDING_X, t1y, m.team1Id, m.team1Name, bye1, allTeams, 'left');
    drawTeam(ctx, PADDING_X, t2y, m.team2Id, m.team2Name, bye2, allTeams, 'left');

    const slotR = PADDING_X + SLOT_W;
    const exitX = slotR + gapX;

    if (bye1 || bye2) {
      const teamCy = bye2 ? t1cy : t2cy;
      const hasW = m.winnerId != null;
      ln(ctx, slotR, teamCy, exitX, teamCy, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);
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
    const t1y = top + i * r1Space;
    const t2y = t1y + SLOT_H + slotGap;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');

    drawTeam(ctx, totalW - PADDING_X - SLOT_W, t1y, m.team1Id, m.team1Name, bye1, allTeams, 'right');
    drawTeam(ctx, totalW - PADDING_X - SLOT_W, t2y, m.team2Id, m.team2Name, bye2, allTeams, 'right');

    const slotL = totalW - PADDING_X - SLOT_W;
    const exitX = slotL - gapX;

    if (bye1 || bye2) {
      const teamCy = bye2 ? t1cy : t2cy;
      const hasW = m.winnerId != null;
      ln(ctx, slotL, teamCy, exitX, teamCy, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);
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
          const hasW = m.winnerId != null;
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
        const upperY = leftP.y;
        const lowerY = rightP.y;
        const cy = (upperY + lowerY) / 2;
        const jx = totalW / 2;

        const w1 = fm.winnerId === fm.team1Id && fm.winnerId != null;
        const w2 = fm.winnerId === fm.team2Id && fm.winnerId != null;
        const hasW = w1 || w2;

        // 水平線
        ln(ctx, leftP.x, upperY, jx, upperY, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
        ln(ctx, rightP.x, lowerY, jx, lowerY, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);
        // 縦線（勝者側のみ赤）
        if (hasW) {
          if (w1) {
            ln(ctx, jx, upperY, jx, cy, WIN_COLOR, WIN_W);
            ln(ctx, jx, cy, jx, lowerY, LINE_COLOR, LOSE_W);
          } else {
            ln(ctx, jx, upperY, jx, cy, LINE_COLOR, LOSE_W);
            ln(ctx, jx, cy, jx, lowerY, WIN_COLOR, WIN_W);
          }
        } else {
          ln(ctx, jx, upperY, jx, lowerY, LINE_COLOR, LOSE_W);
        }

        // スコア
        if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
          txt(ctx, String(fm.score1), jx + 6, upperY, SCORE_SIZE + 1, { color: SCORE_COLOR, bold: true });
          txt(ctx, String(fm.score2), jx + 6, lowerY, SCORE_SIZE + 1, { color: SCORE_COLOR, bold: true });
        }

        // 優勝者（苗字のみ）
        if (fm.winnerId) {
          const w = allTeams.find(t => t.teamId === fm.winnerId);
          if (w) {
            txt(ctx, `${familyName(w.male.name)}・${familyName(w.female.name)}`, jx, cy - 6, 13, { align: 'center', bold: true });
            if (fm.score1 != null && fm.score2 != null) {
              txt(ctx, `${fm.score1}−${fm.score2}`, jx, cy + 10, 11, { align: 'center', color: '#555' });
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
