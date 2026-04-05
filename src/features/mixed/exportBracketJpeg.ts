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

// 左山チーム描画（番号左、名前+所属が右へ）
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

// 右山チーム描画（名前+所属 → 番号の順、左から: 名前 所属 番号）
function drawTeamRight(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) return;
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  const mw = SLOT_W - NUM_W;
  // 名前+所属（左寄せ）
  txt(ctx, team.male.name, x, y + 12, 11, { bold: true, maxW: mw * 0.52 });
  const mnw = Math.min(approxW(team.male.name, 11), mw * 0.52);
  if (team.male.affiliation) txt(ctx, team.male.affiliation, x + mnw + 3, y + 12, 8, { color: '#666', maxW: mw - mnw - 6 });
  txt(ctx, team.female.name, x, y + 32, 11, { bold: true, maxW: mw * 0.52 });
  const fnw = Math.min(approxW(team.female.name, 11), mw * 0.52);
  if (team.female.affiliation) txt(ctx, team.female.affiliation, x + fnw + 3, y + 32, 8, { color: '#666', maxW: mw - fnw - 6 });
  // 番号は右端（線の近く）
  txt(ctx, String(team.pairNumber), x + SLOT_W, y + SLOT_H / 2, 14, { align: 'right', bold: true });
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

  // スコア（縦線の横、横線のすぐ内側に中央寄せ）
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    const mid = (t1cy + t2cy) / 2;
    const s1y = mid - 8; // 上スコア: 中央の少し上
    const s2y = mid + 8; // 下スコア: 中央の少し下
    // タイブレーク表示
    const tb = m.tiebreakScore;
    const loserScore = tb != null ? (m.winnerId === m.team1Id ? `${m.score2}(${tb})` : `${m.score1}(${tb})`) : null;
    const s1text = (m.winnerId !== m.team1Id && loserScore) ? loserScore : String(m.score1);
    const s2text = (m.winnerId !== m.team2Id && loserScore) ? loserScore : String(m.score2);
    if (isLeft) {
      txt(ctx, s1text, jx + 2, s1y, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
      txt(ctx, s2text, jx + 2, s2y, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
    } else {
      txt(ctx, s1text, jx - 2, s1y, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
      txt(ctx, s2text, jx - 2, s2y, SCORE_SIZE, { align: 'right', color: SCORE_COLOR, bold: true });
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

  const normalGap = 10; // チーム間の隙間を詰める

  // 左右統一: BYE有無に関係なく全マッチ同じ高さで配置
  const maxSide = Math.max(leftR1.length, rightR1.length);
  const matchBlockH = SLOT_H * 2 + normalGap;
  const r1Spacing = matchBlockH + 18;          // マッチ間隔を詰める

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

    drawTeamLeft(ctx, PADDING_X, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamLeft(ctx, PADDING_X, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);

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

    // 右山: 線から間隔を取って右揃えで配置
    const rx = totalW - PADDING_X - SLOT_W;
    drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
    drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);

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
// 結果画像
// ---------------------------------------------------------------------------

function getRoundLabelR(round: number, maxRound: number): string {
  if (round === maxRound) return '決勝';
  if (round === maxRound - 1) return '準決勝';
  if (round === maxRound - 2) return '準々決勝';
  return `${round}回戦`;
}

export async function generateResultDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const SC = 2;
  const MW = 300;       // マッチ幅
  const SH = 48;        // スロット高さ
  const MH = SH * 2;    // マッチ高さ
  const MGAP = 20;      // マッチ間隔
  const RGAP = 52;      // ラウンド間隔
  const PX = 28;        // 横パディング
  const PY = 24;        // 縦パディング
  const HDR = 60;       // ヘッダー高さ
  const RLBL = 30;      // ラウンドラベル高さ
  const LINE_C = '#c9cdd3';
  const BORDER_C = '#d1d5db';

  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!roundMap.has(m.round)) roundMap.set(m.round, []); roundMap.get(m.round)!.push(m); }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const GRID = MH + MGAP;
  const r1Count = (roundMap.get(1) || []).length;
  const TOP = PY + HDR + RLBL; // コンテンツ開始Y

  const matchY = (ri: number, mi: number) => {
    const sp = Math.pow(2, ri);
    return TOP + mi * sp * GRID + (sp - 1) * GRID / 2;
  };

  const totalRounds = maxRound;
  const totalW = PX * 2 + totalRounds * (MW + RGAP) - RGAP;
  const totalH = TOP + r1Count * GRID + PY;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SC; canvas.height = totalH * SC;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SC, SC);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ==== ヘッダー（確実に描画） ====
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  // ヘッダー背景帯
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, totalW, PY + HDR);
  // 大会名（左）
  setFont(ctx, 18, true);
  ctx.fillStyle = '#111827'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tournamentName || '大会名', PX, PY + HDR / 2);
  // トーナメント名（右）
  ctx.textAlign = 'right';
  ctx.fillText(catLabel, totalW - PX, PY + HDR / 2);
  // 区切り線
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PX, PY + HDR); ctx.lineTo(totalW - PX, PY + HDR); ctx.stroke();

  const mbr: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) mbr.push(roundMap.get(r) || []);

  // ==== ラウンドラベル ====
  for (let ri = 0; ri < mbr.length; ri++) {
    const cx = PX + ri * (MW + RGAP) + MW / 2;
    setFont(ctx, 12, true);
    ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(getRoundLabelR(ri + 1, maxRound), cx, PY + HDR + RLBL / 2);
  }

  // ==== 接続線（グレー統一） ====
  ctx.strokeStyle = LINE_C; ctx.lineWidth = 1.5;
  for (let ri = 0; ri < mbr.length - 1; ri++) {
    const x1 = PX + ri * (MW + RGAP) + MW;
    const x2 = PX + (ri + 1) * (MW + RGAP);
    const xm = (x1 + x2) / 2;
    for (let i = 0; i + 1 < mbr[ri].length; i += 2) {
      const y1 = matchY(ri, i) + MH / 2;
      const y2 = matchY(ri, i + 1) + MH / 2;
      const yn = matchY(ri + 1, Math.floor(i / 2)) + MH / 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xm, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(xm, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xm, y1); ctx.lineTo(xm, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xm, yn); ctx.lineTo(x2, yn); ctx.stroke();
    }
  }

  // ==== マッチボックス描画 ====
  const drawSlot = (bx: number, by: number, bw: number,
    teamId: string | null, name: string, score: number | null,
    isWin: boolean, isByeSlot: boolean, tb: number | null, isLose: boolean) => {

    if (isWin) {
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(bx + 1, by + 1, bw - 2, SH - 2);
    }
    if (isByeSlot || (!teamId && name === 'BYE')) return;
    if (!teamId) return;
    const t = allTeams.find(tm => tm.teamId === teamId);
    if (!t) return;

    const tc = isWin ? '#065f46' : '#1f2937';
    const sc = isWin ? '#059669' : '#6b7280';
    const ac = isWin ? '#34d399' : '#9ca3af';

    // ペア番号
    setFont(ctx, 11, true);
    ctx.fillStyle = ac; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.pairNumber), bx + 18, by + SH / 2);

    // 名前（2行、大きめ）
    const nx = bx + 36;
    const my = by + SH * 0.33;
    const fy = by + SH * 0.7;
    setFont(ctx, 13, true);
    ctx.fillStyle = tc; ctx.textAlign = 'left';
    ctx.fillText(t.male.name.replace(/[\s\u3000]+/g, ''), nx, my, 95);
    ctx.fillText(t.female.name.replace(/[\s\u3000]+/g, ''), nx, fy, 95);

    // 所属
    const ax = nx + 100;
    const aw = bw - (ax - bx) - 44;
    if (aw > 10) {
      setFont(ctx, 10, false);
      ctx.fillStyle = ac;
      ctx.fillText(t.male.affiliation, ax, my, aw);
      ctx.fillText(t.female.affiliation, ax, fy, aw);
    }

    // スコア
    if (score !== null) {
      setFont(ctx, 20, true);
      ctx.fillStyle = sc; ctx.textAlign = 'right';
      ctx.fillText(String(score), bx + bw - 14, by + SH / 2);
      if (isLose && tb != null) {
        setFont(ctx, 9, false);
        ctx.fillStyle = '#3b82f6'; ctx.textAlign = 'right';
        ctx.fillText(`(${tb})`, bx + bw - 6, by + 10);
      }
    }
  };

  for (let ri = 0; ri < mbr.length; ri++) {
    const cx = PX + ri * (MW + RGAP);
    for (let mi = 0; mi < mbr[ri].length; mi++) {
      const m = mbr[ri][mi];
      const my = matchY(ri, mi);

      // BYEマッチはボックスを描画しない
      if (m.isBye) continue;

      // 枠（角丸）
      ctx.beginPath();
      const r = 8;
      ctx.moveTo(cx + r, my); ctx.arcTo(cx + MW, my, cx + MW, my + MH, r);
      ctx.arcTo(cx + MW, my + MH, cx, my + MH, r);
      ctx.arcTo(cx, my + MH, cx, my, r);
      ctx.arcTo(cx, my, cx + MW, my, r); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = BORDER_C; ctx.lineWidth = 1.5; ctx.stroke();

      // 中央区切り線
      ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx + 2, my + SH); ctx.lineTo(cx + MW - 2, my + SH); ctx.stroke();

      const w1 = m.winnerId === m.team1Id && m.winnerId != null;
      const w2 = m.winnerId === m.team2Id && m.winnerId != null;
      const b1 = !m.team1Id && m.team1Name === 'BYE';
      const b2 = !m.team2Id && m.team2Name === 'BYE';

      drawSlot(cx, my, MW, m.team1Id, m.team1Name, m.score1, w1, b1, m.tiebreakScore, m.winnerId != null && !w1);
      drawSlot(cx, my + SH, MW, m.team2Id, m.team2Name, m.score2, w2, b2, m.tiebreakScore, m.winnerId != null && !w2);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
