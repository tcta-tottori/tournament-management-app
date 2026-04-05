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
const PADDING_Y = 24;
const HEADER_H = 36;
const RIGHT_MARGIN = 10; // 右山のチーム情報と線の間

const WIN_COLOR = '#cc0000';
const LINE_COLOR = '#222';
const WIN_W = 2.8;
const LOSE_W = 0.8;
const SCORE_COLOR = '#222';
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

// 共通チーム描画（番号は常に左）
function drawTeamEntry(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
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

  // スコア（横線を挟んですぐ上/すぐ下）
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    const so = 1; // 横線のすぐ下/すぐ上
    if (isLeft) {
      txt(ctx, String(m.score1), jx + 2, t1cy + so, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx + 2, t2cy - so, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
    } else {
      txt(ctx, String(m.score1), jx - 2, t1cy + so, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
      txt(ctx, String(m.score2), jx - 2, t2cy - so, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
    }
  }
}

interface JP { x: number; y: number }

export async function generateBracketDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
  winnerOverride?: string, // 優勝者名の手動上書き
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

  const normalGap = 14;

  // 左右統一: BYE有無に関係なく全マッチ同じ高さで配置
  const maxSide = Math.max(leftR1.length, rightR1.length);
  const matchBlockH = SLOT_H * 2 + normalGap; // 1マッチの高さ
  const r1Spacing = matchBlockH + 28;          // マッチ間隔

  function getPos(i: number) {
    const t1y = i * r1Spacing;
    const t2y = t1y + SLOT_H + normalGap;
    return { t1y, t2y };
  }

  const areaH = maxSide * r1Spacing;

  const gapX = 75;
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * gapX : 0);
  const centerGap = 160;
  const totalW = PADDING_X * 2 + sideW * 2 + centerGap;
  const winnerAreaH = 35; // 切り詰め
  const totalH = PADDING_Y * 2 + HEADER_H + winnerAreaH + areaH;

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
  ln(ctx, PADDING_X, PADDING_Y + 34, totalW - PADDING_X, PADDING_Y + 34, '#ddd', 0.5);

  const top = PADDING_Y + HEADER_H + winnerAreaH;
  const jp = new Map<string, JP>();

  // 左R1
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const p = getPos(i);
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    const bye = isByeMatch(m);
    const t1cy = top + p.t1y + SLOT_H / 2;
    const t2cy = top + p.t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    drawTeamEntry(ctx, PADDING_X, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamEntry(ctx, PADDING_X, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);

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

  // 右R1（番号は左、線から間隔を取る）
  for (let i = 0; i < rightR1.length; i++) {
    const m = rightR1[i];
    const p = getPos(i);
    const bye1 = !m.team1Id && m.team1Name === 'BYE';
    const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    const bye = isByeMatch(m);
    const t1cy = top + p.t1y + SLOT_H / 2;
    const t2cy = top + p.t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    // 右山: 線から RIGHT_MARGIN 離してチーム情報を配置（番号は左）
    const rx = totalW - PADDING_X - SLOT_W;
    drawTeamEntry(ctx, rx + RIGHT_MARGIN, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamEntry(ctx, rx + RIGHT_MARGIN, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);

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
        const meetY = (leftP.y + rightP.y) / 2;

        const w1 = fm.winnerId === fm.team1Id && fm.winnerId != null;
        const w2 = fm.winnerId === fm.team2Id && fm.winnerId != null;

        // 左山→中央: 水平→縦
        ln(ctx, leftP.x, leftP.y, jx, leftP.y, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
        ln(ctx, jx, leftP.y, jx, meetY, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
        // 右山→中央: 水平→縦
        ln(ctx, rightP.x, rightP.y, jx, rightP.y, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);
        ln(ctx, jx, rightP.y, jx, meetY, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);

        // 優勝者表示
        const winnerTeam = fm.winnerId ? allTeams.find(t => t.teamId === fm.winnerId) : null;
        const defaultWinnerName = winnerTeam ? `${familyName(winnerTeam.male.name)}・${familyName(winnerTeam.female.name)}` : '';
        const displayName = winnerOverride ?? defaultWinnerName;

        if (displayName) {
          const lineTop = meetY - 25;
          ln(ctx, jx, meetY, jx, lineTop, WIN_COLOR, WIN_W);
          txt(ctx, displayName, jx, lineTop - 14, 13, { align: 'center', bold: true });
          if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
            txt(ctx, `${fm.score1}−${fm.score2}`, jx, lineTop - 30, 11, { align: 'center', color: '#555' });
          }
        }
      }
    }
  }

  txt(ctx, `${r1.length * 2}ドロー`, totalW / 2, totalH - 8, 9, { align: 'center', color: '#bbb' });
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string, winnerOverride?: string) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName, winnerOverride);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${CATEGORY_LABELS[bracket.category] || bracket.category}.jpg`;
  a.click();
}

// ---------------------------------------------------------------------------
// 結果画像（Web UI風：左→右ラウンド、ボックス型マッチ）
// ---------------------------------------------------------------------------
const R_SCALE = 2;
const R_MATCH_W = 280;
const R_SLOT_H = 42;
const R_MATCH_H = R_SLOT_H * 2;
const R_MATCH_GAP = 18;
const R_ROUND_GAP = 48;
const R_HEADER_H = 56;
const R_PAD_X = 24;
const R_PAD_Y = 20;
const R_LINE_COLOR = '#c9cdd3'; // 接続線: 統一グレー
const R_BORDER_COLOR = '#d1d5db'; // 枠線: gray-300
const R_WIN_BG = '#ecfdf5'; // 勝者背景: emerald-50
const R_WIN_TEXT = '#065f46'; // 勝者テキスト
const R_WIN_SCORE = '#059669'; // 勝者スコア

function rTxt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts?: { align?: CanvasTextAlign; color?: string; bold?: boolean; maxW?: number }) {
  const { align = 'left', color = '#1a1a1a', bold = false, maxW } = opts || {};
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(text, x, y, maxW); else ctx.fillText(text, x, y);
}

function rLn(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, w: number) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function rRect2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string, sw: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke();
}

/** 1スロット分のチーム情報を描画（通常マッチ・BYEマッチ共通） */
function drawResultSlot(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number,
  teamId: string | null, teamName: string, score: number | null,
  isWinner: boolean, isBye: boolean, allTeams: MixedTeam[],
  tiebreakScore: number | null, isLoser: boolean
) {
  // 勝者背景
  if (isWinner) {
    ctx.fillStyle = R_WIN_BG;
    ctx.fillRect(x + 1, y + 1, w - 2, R_SLOT_H - 1);
  }

  if (isBye || (!teamId && teamName === 'BYE')) {
    rTxt(ctx, 'BYE', x + w / 2, y + R_SLOT_H / 2, 11, { align: 'center', color: '#d1d5db' });
    return;
  }
  if (!teamId) {
    if (teamName) rTxt(ctx, teamName, x + 8, y + R_SLOT_H / 2, 9, { color: '#aaa', maxW: w - 16 });
    return;
  }
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) {
    rTxt(ctx, teamName || '―', x + 8, y + R_SLOT_H / 2, 9, { color: '#aaa' });
    return;
  }

  const textColor = isWinner ? R_WIN_TEXT : '#1f2937';
  const subColor = isWinner ? '#6ee7b7' : '#9ca3af';
  const scoreColor = isWinner ? R_WIN_SCORE : '#6b7280';

  // ペア番号（縦中央、やや太め）
  rTxt(ctx, String(team.pairNumber), x + 16, y + R_SLOT_H / 2, 10, { align: 'center', color: subColor, bold: true });

  // 名前（2行、大きめ太字）
  const nx = x + 32;
  const nameW = 90;
  const maleY = y + 14;
  const femaleY = y + 29;
  rTxt(ctx, team.male.name.replace(/[\s\u3000]+/g, ''), nx, maleY, 12, { bold: true, color: textColor, maxW: nameW });
  rTxt(ctx, team.female.name.replace(/[\s\u3000]+/g, ''), nx, femaleY, 12, { bold: true, color: textColor, maxW: nameW });

  // 所属（名前の右側）
  const ax = nx + nameW + 6;
  const aw = w - (ax - x) - 40;
  if (aw > 15) {
    rTxt(ctx, team.male.affiliation, ax, maleY, 8, { color: subColor, maxW: aw });
    rTxt(ctx, team.female.affiliation, ax, femaleY, 8, { color: subColor, maxW: aw });
  }

  // スコア（右端、大きく太字）
  if (score !== null) {
    rTxt(ctx, String(score), x + w - 12, y + R_SLOT_H / 2, 18, { align: 'right', color: scoreColor, bold: true });
    if (isLoser && tiebreakScore != null) {
      rTxt(ctx, `(${tiebreakScore})`, x + w - 5, y + 8, 8, { align: 'right', color: '#3b82f6' });
    }
  }
}

function getRoundLabelResult(round: number, maxRound: number): string {
  if (round === maxRound) return '決勝';
  if (round === maxRound - 1) return '準決勝';
  if (round === maxRound - 2) return '準々決勝';
  return `${round}回戦`;
}

export async function generateResultDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!roundMap.has(m.round)) roundMap.set(m.round, []); roundMap.get(m.round)!.push(m); }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const GRID_UNIT = R_MATCH_H + R_MATCH_GAP;
  const r1Count = (roundMap.get(1) || []).length;
  const ROUND_LABEL_H = 28; // ラウンドラベル用スペース
  const contentTop = R_PAD_Y + R_HEADER_H + ROUND_LABEL_H;

  const getMatchY = (roundIdx: number, matchIdx: number) => {
    const spacing = Math.pow(2, roundIdx);
    const offset = (spacing - 1) * GRID_UNIT / 2;
    return contentTop + matchIdx * spacing * GRID_UNIT + offset;
  };

  const totalRounds = maxRound;
  const svgW = totalRounds * (R_MATCH_W + R_ROUND_GAP) - R_ROUND_GAP;
  const svgH = r1Count * GRID_UNIT;
  const totalW = R_PAD_X * 2 + svgW;
  const totalH = contentTop + svgH + R_PAD_Y;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * R_SCALE; canvas.height = totalH * R_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(R_SCALE, R_SCALE);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー: 大会名（左）＋トーナメント名（右） ----
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  rTxt(ctx, tournamentName, R_PAD_X, R_PAD_Y + 18, 17, { bold: true, color: '#111' });
  rTxt(ctx, catLabel, totalW - R_PAD_X, R_PAD_Y + 18, 17, { align: 'right', bold: true, color: '#111' });
  rLn(ctx, R_PAD_X, R_PAD_Y + 38, totalW - R_PAD_X, R_PAD_Y + 38, '#d1d5db', 1);

  const matchesByRound: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    matchesByRound.push(roundMap.get(r) || []);
  }

  // 接続線を描画（全てグレーで統一）
  for (let roundIdx = 0; roundIdx < matchesByRound.length - 1; roundIdx++) {
    const roundMatches = matchesByRound[roundIdx];
    const x1 = R_PAD_X + roundIdx * (R_MATCH_W + R_ROUND_GAP) + R_MATCH_W;
    const x2 = R_PAD_X + (roundIdx + 1) * (R_MATCH_W + R_ROUND_GAP);
    const xMid = (x1 + x2) / 2;

    for (let i = 0; i < roundMatches.length; i += 2) {
      if (i + 1 >= roundMatches.length) break;
      const y1 = getMatchY(roundIdx, i) + R_MATCH_H / 2;
      const y2 = getMatchY(roundIdx, i + 1) + R_MATCH_H / 2;
      const yNext = getMatchY(roundIdx + 1, Math.floor(i / 2)) + R_MATCH_H / 2;

      rLn(ctx, x1, y1, xMid, y1, R_LINE_COLOR, 1.5);
      rLn(ctx, x1, y2, xMid, y2, R_LINE_COLOR, 1.5);
      rLn(ctx, xMid, y1, xMid, y2, R_LINE_COLOR, 1.5);
      rLn(ctx, xMid, yNext, x2, yNext, R_LINE_COLOR, 1.5);
    }
  }

  // 各マッチのボックスを描画
  for (let roundIdx = 0; roundIdx < matchesByRound.length; roundIdx++) {
    const round = roundIdx + 1;
    const colX = R_PAD_X + roundIdx * (R_MATCH_W + R_ROUND_GAP);

    // ラウンドラベル
    rTxt(ctx, getRoundLabelResult(round, maxRound), colX + R_MATCH_W / 2, R_PAD_Y + R_HEADER_H + ROUND_LABEL_H / 2, 11, { align: 'center', color: '#6b7280', bold: true });

    for (let matchIdx = 0; matchIdx < matchesByRound[roundIdx].length; matchIdx++) {
      const match = matchesByRound[roundIdx][matchIdx];
      const matchY = getMatchY(roundIdx, matchIdx);

      // 全マッチ共通の統一枠線
      rRect2(ctx, colX, matchY, R_MATCH_W, R_MATCH_H, 6, '#fff', R_BORDER_COLOR, 1.5);
      rLn(ctx, colX + 1, matchY + R_SLOT_H, colX + R_MATCH_W - 1, matchY + R_SLOT_H, '#e5e7eb', 0.5);

      if (match.isBye) {
        // BYE（シード）: 上スロットにチーム、下スロットにBYE
        const winnerId = match.winnerId;
        drawResultSlot(ctx, colX, matchY, R_MATCH_W,
          winnerId, match.team1Id ? match.team1Name : match.team2Name, null,
          false, false, allTeams, null, false);
        rTxt(ctx, 'BYE', colX + R_MATCH_W / 2, matchY + R_SLOT_H + R_SLOT_H / 2, 11, { align: 'center', color: '#d1d5db' });
        continue;
      }

      // 通常マッチ
      const isBye1 = !match.team1Id && match.team1Name === 'BYE';
      const isBye2 = !match.team2Id && match.team2Name === 'BYE';
      const isW1 = match.winnerId === match.team1Id && match.winnerId != null;
      const isW2 = match.winnerId === match.team2Id && match.winnerId != null;

      drawResultSlot(ctx, colX, matchY, R_MATCH_W,
        match.team1Id, match.team1Name, match.score1,
        isW1, isBye1, allTeams, match.tiebreakScore, match.winnerId != null && !isW1);
      drawResultSlot(ctx, colX, matchY + R_SLOT_H, R_MATCH_W,
        match.team2Id, match.team2Name, match.score2,
        isW2, isBye2, allTeams, match.tiebreakScore, match.winnerId != null && !isW2);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
