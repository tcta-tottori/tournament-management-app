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

// 右山チーム描画（左から: ペア番号, 名前, 所属 — 左山と同じ配置）
function drawTeamRight(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) return;
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  // 左山と同じレイアウト: 番号(左) → 名前 → 所属
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

  // スコア（縦線の横、中央寄せ、線から余裕を持たせる）
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    const mid = (t1cy + t2cy) / 2;
    const s1y = mid - 9;
    const s2y = mid + 9;
    const tb = m.tiebreakScore;
    const t1isLoser = m.winnerId != null && m.winnerId !== m.team1Id;
    const t2isLoser = m.winnerId != null && m.winnerId !== m.team2Id;
    const xOff = isLeft ? jx + 4 : jx - 4;
    const align: CanvasTextAlign = isLeft ? 'left' : 'right';

    txt(ctx, String(m.score1), xOff, s1y, SCORE_SIZE, { color: SCORE_COLOR, bold: true, align });
    if (t1isLoser && tb != null) {
      txt(ctx, `(${tb})`, xOff, s1y - 12, 10, { color: SCORE_COLOR, align });
    }

    txt(ctx, String(m.score2), xOff, s2y, SCORE_SIZE, { color: SCORE_COLOR, bold: true, align });
    if (t2isLoser && tb != null) {
      txt(ctx, `(${tb})`, xOff, s2y + 12, 10, { color: SCORE_COLOR, align });
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
  // 背景（角丸）
  const bgR = 12;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(bgR, 0); ctx.arcTo(totalW, 0, totalW, totalH, bgR);
  ctx.arcTo(totalW, totalH, 0, totalH, bgR);
  ctx.arcTo(0, totalH, 0, 0, bgR);
  ctx.arcTo(0, 0, totalW, 0, bgR);
  ctx.closePath(); ctx.fill();
  // 外枠（角丸、薄いグレー）
  ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
  ctx.stroke();

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

  // BYE選手が次ラウンドで勝ったかチェック（赤線判定用）
  const byeWinnerAdvanced = (m: BracketMatch): boolean => {
    if (!m.winnerId || !m.nextMatchId) return false;
    const nextMatch = matches.find(nm => nm.matchId === m.nextMatchId);
    return nextMatch?.winnerId === m.winnerId;
  };

  // R1描画ヘルパー
  const drawR1 = (r1Arr: BracketMatch[], isLeft: boolean) => {
    for (let i = 0; i < r1Arr.length; i++) {
      const m = r1Arr[i];
      const p = getPos(i);
      const bye1 = !m.team1Id && m.team1Name === 'BYE';
      const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
      const bye = isByeMatch(m);
      const t1cy = top + p.t1y + SLOT_H / 2;
      const t2cy = top + p.t2y + SLOT_H / 2;
      const cy = (t1cy + t2cy) / 2; // BYEでも通常マッチと同じcy

      if (isLeft) {
        drawTeamLeft(ctx, PADDING_X, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
        drawTeamLeft(ctx, PADDING_X, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);
        const slotR = PADDING_X + SLOT_W;
        const exitX = slotR + gapX;
        if (bye) {
          const teamCy = bye2 ? t1cy : t2cy;
          // BYE: 次ラウンドで勝った場合のみ赤線
          const adv = byeWinnerAdvanced(m);
          ln(ctx, slotR, teamCy, slotR + gapX * 0.3, teamCy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          // cyに向かって縦に移動し、cyからexitへ水平に
          ln(ctx, slotR + gapX * 0.3, teamCy, slotR + gapX * 0.3, cy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          ln(ctx, slotR + gapX * 0.3, cy, exitX, cy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          jp.set(m.matchId, { x: exitX, y: cy });
        } else {
          const jx = slotR + gapX * 0.42;
          drawBracketLines(ctx, t1cy, t2cy, cy, slotR, jx, exitX, m, true);
          jp.set(m.matchId, { x: exitX, y: cy });
        }
      } else {
        const rx = totalW - PADDING_X - SLOT_W;
        drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
        drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);
        const slotL = rx;
        const exitX = slotL - gapX;
        if (bye) {
          const teamCy = bye2 ? t1cy : t2cy;
          const adv = byeWinnerAdvanced(m);
          ln(ctx, slotL, teamCy, slotL - gapX * 0.3, teamCy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          ln(ctx, slotL - gapX * 0.3, teamCy, slotL - gapX * 0.3, cy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          ln(ctx, slotL - gapX * 0.3, cy, exitX, cy, adv ? WIN_COLOR : LINE_COLOR, adv ? WIN_W : LOSE_W);
          jp.set(m.matchId, { x: exitX, y: cy });
        } else {
          const jx = slotL - gapX * 0.42;
          drawBracketLines(ctx, t1cy, t2cy, cy, slotL, jx, exitX, m, false);
          jp.set(m.matchId, { x: exitX, y: cy });
        }
      }
    }
  };

  drawR1(leftR1, true);
  drawR1(rightR1, false);

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

  // 決勝: drawBracketLinesと同じ構造で中央に描画
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
        const t1cy = leftP.y;  // 左山の出力Y
        const t2cy = rightP.y; // 右山の出力Y
        const cy = (t1cy + t2cy) / 2;

        const w1 = fm.winnerId === fm.team1Id && fm.winnerId != null;
        const w2 = fm.winnerId === fm.team2Id && fm.winnerId != null;
        const hasW = w1 || w2;

        // 左山→中央縦線位置
        ln(ctx, leftP.x, t1cy, jx, t1cy, w1 ? WIN_COLOR : LINE_COLOR, w1 ? WIN_W : LOSE_W);
        // 右山→中央縦線位置
        ln(ctx, rightP.x, t2cy, jx, t2cy, w2 ? WIN_COLOR : LINE_COLOR, w2 ? WIN_W : LOSE_W);
        // 縦線（勝者側のみ赤）
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

        // スコア（中央寄せ）
        if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
          txt(ctx, String(fm.score1), jx + 4, cy - 9, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
          txt(ctx, String(fm.score2), jx + 4, cy + 9, SCORE_SIZE, { color: SCORE_COLOR, bold: true });
        }

        // 優勝者: 中央から上に線→名前+スコア
        const winnerTeam = fm.winnerId ? allTeams.find(t => t.teamId === fm.winnerId) : null;
        const defaultWinnerName = winnerTeam ? `${familyName(winnerTeam.male.name)}・${familyName(winnerTeam.female.name)}` : '';
        const displayName = winnerOverride ?? defaultWinnerName;

        if (displayName) {
          const lineTop = cy - 25;
          ln(ctx, jx, cy, jx, lineTop, WIN_COLOR, WIN_W);
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

function _rlabel(r: number, mx: number): string {
  if (r === mx) return '決勝';
  if (r === mx - 1) return '準決勝';
  if (r === mx - 2) return '準々決勝';
  return `${r}回戦`;
}

function _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function generateResultDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const SC = 2;
  const MW = 340;      // マッチ幅（広め）
  const SH = 56;       // スロット高さ（大きめ）
  const MH = SH * 2;   // マッチ高さ
  const MGAP = 10;     // マッチ間隔（狭く）
  const RGAP = 40;     // ラウンド間隔（狭く）
  const PX = 16;       // 横パディング（狭く）
  const PY = 12;       // 縦パディング（狭く）
  const HDR = 52;      // ヘッダー高さ
  const RLBL = 26;     // ラウンドラベル

  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!roundMap.has(m.round)) roundMap.set(m.round, []); roundMap.get(m.round)!.push(m); }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const GRID = MH + MGAP;
  const r1Count = (roundMap.get(1) || []).length;
  const TOP = PY + HDR + RLBL;

  const mY = (ri: number, mi: number) => {
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
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, totalW, totalH);

  // ==== ヘッダー ====
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  // ヘッダー背景
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, totalW, PY + HDR);
  // 下線（太め）
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, PY + HDR); ctx.lineTo(totalW, PY + HDR); ctx.stroke();

  // トーナメント名（枠付き、太枠）
  setFont(ctx, 22, true);
  const catTW = ctx.measureText(catLabel).width;
  const cbW = catTW + 32;
  const cbH = 38;
  const cbX = PX + 4;
  const cbY = PY + (HDR - cbH) / 2;
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.5;
  ctx.strokeRect(cbX, cbY, cbW, cbH);
  ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(catLabel, cbX + cbW / 2, cbY + cbH / 2);

  // 大会名（やや小さめ）
  setFont(ctx, 16, true);
  ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
  ctx.fillText(tournamentName || '', cbX + cbW + 18, cbY + cbH / 2);

  const mbr: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) mbr.push(roundMap.get(r) || []);

  // ==== ラウンドラベル ====
  for (let ri = 0; ri < mbr.length; ri++) {
    const cx = PX + ri * (MW + RGAP) + MW / 2;
    setFont(ctx, 12, true);
    ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(_rlabel(ri + 1, maxRound), cx, PY + HDR + RLBL / 2);
  }

  // ==== 接続線 ====
  for (let ri = 0; ri < mbr.length - 1; ri++) {
    const x1 = PX + ri * (MW + RGAP) + MW;
    const x2 = PX + (ri + 1) * (MW + RGAP);
    const xm = (x1 + x2) / 2;
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    for (let i = 0; i + 1 < mbr[ri].length; i += 2) {
      const y1 = mY(ri, i) + MH / 2;
      const y2 = mY(ri, i + 1) + MH / 2;
      const yn = mY(ri + 1, Math.floor(i / 2)) + MH / 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xm, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(xm, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xm, y1); ctx.lineTo(xm, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xm, yn); ctx.lineTo(x2, yn); ctx.stroke();
    }
  }

  // ==== スロット描画 ====
  const drawTeam = (bx: number, by: number, bw: number,
    teamId: string | null, name: string, score: number | null,
    isWin: boolean, tb: number | null, isLose: boolean) => {

    if (isWin) {
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(bx + 2, by + 1, bw - 4, SH - 2);
    }

    if (!teamId) {
      if (name && name !== 'BYE') {
        setFont(ctx, 11, false);
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(name, bx + 10, by + SH / 2);
      }
      return;
    }
    const t = allTeams.find(tm => tm.teamId === teamId);
    if (!t) return;

    const tc = isWin ? '#065f46' : '#111827';
    const sc2 = isWin ? '#059669' : '#374151';
    const ac = isWin ? '#047857' : '#64748b'; // 所属: 勝者は濃い緑、敗者は濃いグレー
    const numC = isWin ? '#6ee7b7' : '#94a3b8';

    // ペア番号
    setFont(ctx, 12, true);
    ctx.fillStyle = numC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.pairNumber), bx + 18, by + SH / 2);

    // 名前（太字、2行）
    const nx = bx + 34;
    const ny1 = by + SH * 0.33;
    const ny2 = by + SH * 0.70;
    setFont(ctx, 15, true);
    ctx.fillStyle = tc; ctx.textAlign = 'left';
    ctx.fillText(t.male.name.replace(/[\s\u3000]+/g, ''), nx, ny1, 105);
    ctx.fillText(t.female.name.replace(/[\s\u3000]+/g, ''), nx, ny2, 105);

    // 所属（太字、名前のすぐ右に配置）
    setFont(ctx, 15, true);
    const maleNW = ctx.measureText(t.male.name.replace(/[\s\u3000]+/g, '')).width;
    const femaleNW = ctx.measureText(t.female.name.replace(/[\s\u3000]+/g, '')).width;
    const maleAfX = nx + Math.min(maleNW, 105) + 6;
    const femaleAfX = nx + Math.min(femaleNW, 105) + 6;
    // スコアの幅を確保（約40px）
    const scoreReserve = score !== null ? 40 : 8;
    const maleAfW = bw - (maleAfX - bx) - scoreReserve;
    const femaleAfW = bw - (femaleAfX - bx) - scoreReserve;
    setFont(ctx, 11, true);
    ctx.fillStyle = ac;
    if (maleAfW > 10) ctx.fillText(t.male.affiliation, maleAfX, ny1, maleAfW);
    if (femaleAfW > 10) ctx.fillText(t.female.affiliation, femaleAfX, ny2, femaleAfW);

    // スコア
    if (score !== null) {
      if (isLose && tb != null) {
        const ss = `${score}`;
        const ts = `(${tb})`;
        setFont(ctx, 22, true);
        const sw2 = ctx.measureText(ss).width;
        setFont(ctx, 12, true);
        const tw2 = ctx.measureText(ts).width;
        const totalSW = sw2 + tw2 + 1;
        const sRight = bx + bw - 8;
        const sLeft = sRight - totalSW;
        setFont(ctx, 22, true);
        ctx.fillStyle = sc2; ctx.textAlign = 'left';
        ctx.fillText(ss, sLeft, by + SH / 2);
        setFont(ctx, 12, true);
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(ts, sLeft + sw2 + 1, by + SH * 0.28);
      } else {
        setFont(ctx, 22, true);
        ctx.fillStyle = sc2; ctx.textAlign = 'right';
        ctx.fillText(String(score), bx + bw - 8, by + SH / 2);
      }
    }
  };

  // ==== マッチ描画 ====
  for (let ri = 0; ri < mbr.length; ri++) {
    const cx = PX + ri * (MW + RGAP);
    for (let mi = 0; mi < mbr[ri].length; mi++) {
      const m = mbr[ri][mi];
      const my2 = mY(ri, mi);

      if (m.isBye) {
        // BYE: 1ペア分のみ、通常マッチと同じ枠で表示
        const wId = m.winnerId;
        if (wId) {
          const byeH = SH;
          const byeY = my2 + (MH - byeH) / 2;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.08)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          _roundRect(ctx, cx, byeY, MW, byeH, 10);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.restore();
          _roundRect(ctx, cx, byeY, MW, byeH, 10);
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();
          drawTeam(cx, byeY, MW, wId, '', null, false, null, false);
        }
        continue;
      }

      // 通常マッチ: 影 + 太枠
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      _roundRect(ctx, cx, my2, MW, MH, 10);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
      _roundRect(ctx, cx, my2, MW, MH, 10);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();

      // 中央区切り
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 6, my2 + SH); ctx.lineTo(cx + MW - 6, my2 + SH); ctx.stroke();

      const w1 = m.winnerId === m.team1Id && m.winnerId != null;
      const w2 = m.winnerId === m.team2Id && m.winnerId != null;

      drawTeam(cx, my2, MW, m.team1Id, m.team1Name, m.score1, w1, m.tiebreakScore, m.winnerId != null && !w1);
      drawTeam(cx, my2 + SH, MW, m.team2Id, m.team2Name, m.score2, w2, m.tiebreakScore, m.winnerId != null && !w2);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
