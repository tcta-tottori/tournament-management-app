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

// 名前の固定列幅（所属の開始位置を統一）
const NAME_COL_W = 80; // 名前列の固定幅
const AFF_OFFSET = NAME_COL_W + 4; // 所属の開始オフセット
const NAME_SIZE = 12; // 名前の文字サイズ
const AFF_SIZE = 9;  // 所属の文字サイズ

// 共通チーム描画（番号→名前→所属の均一レイアウト）
function drawTeamEntry(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  if (isBye || (!teamId && teamName === 'BYE')) return;
  if (!teamId) return;
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) return;
  // 番号（固定列）
  txt(ctx, String(team.pairNumber), x, y + SLOT_H / 2, 15, { bold: true });
  // 名前（固定開始列、固定幅）
  const nx = x + NUM_W;
  txt(ctx, team.male.name, nx, y + 12, NAME_SIZE, { bold: true, maxW: NAME_COL_W });
  txt(ctx, team.female.name, nx, y + 33, NAME_SIZE, { bold: true, maxW: NAME_COL_W });
  // 所属（固定開始列）
  const ax = nx + AFF_OFFSET;
  const aw = SLOT_W - NUM_W - AFF_OFFSET - 4;
  if (team.male.affiliation) txt(ctx, team.male.affiliation, ax, y + 12, AFF_SIZE, { color: '#555', maxW: aw });
  if (team.female.affiliation) txt(ctx, team.female.affiliation, ax, y + 33, AFF_SIZE, { color: '#555', maxW: aw });
}

// 左山・右山で同じ関数を使用
const drawTeamLeft = drawTeamEntry;
const drawTeamRight = drawTeamEntry;

function familyName(name: string): string { return name.trim().split(/[\s　]+/)[0] || name; }

function isByeMatch(m: BracketMatch): boolean {
  return m.isBye || (!m.team1Id && m.team1Name === 'BYE') || (!m.team2Id && m.team2Name === 'BYE');
}

// lineOverrides: 'auto' | 't1red' | 't2red' | 'black'
type LineOvValue = 't1red' | 't2red' | 'black';
type LineOverrides = Record<string, LineOvValue>;

function drawBracketLines(
  ctx: CanvasRenderingContext2D,
  t1cy: number, t2cy: number, cy: number,
  fromX: number, jx: number, exitX: number,
  m: BracketMatch, isLeft: boolean,
  lineOv?: LineOverrides,
  exitBlack?: boolean, // 準決勝用: 出力線を強制黒にする
) {
  const ov = lineOv?.[m.matchId];
  let w1 = m.winnerId === m.team1Id && m.winnerId != null;
  let w2 = m.winnerId === m.team2Id && m.winnerId != null;
  if (ov === 'black') { w1 = false; w2 = false; }
  if (ov === 't1red') { w1 = true; w2 = false; }
  if (ov === 't2red') { w1 = false; w2 = true; }
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

  // 出力水平線（exitBlack=trueなら強制黒）
  if (exitBlack) {
    ln(ctx, jx, cy, exitX, cy, LINE_COLOR, LOSE_W);
  } else {
    ln(ctx, jx, cy, exitX, cy, hasW ? WIN_COLOR : LINE_COLOR, hasW ? WIN_W : LOSE_W);
  }

  // スコア（縦線の横、中央寄せ、線から余裕を持たせる）
  if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
    const s1 = m.score1 ?? 0;
    const s2 = m.score2 ?? 0;
    const isWO = s1 === 0 && s2 === 0 && m.winnerId != null;

    if (isWO) {
      // W.O.: 敗者側にW.O.を表示、勝者側はスコアなし
      const mid = (t1cy + t2cy) / 2;
      const xOff = isLeft ? jx + 4 : jx - 4;
      const align: CanvasTextAlign = isLeft ? 'left' : 'right';
      const loserY = w1 ? mid + 9 : mid - 9;
      txt(ctx, 'W.O', xOff, loserY, 10, { color: '#999', align });
    } else {
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
}

interface JP { x: number; y: number }

export async function generateBracketDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
  winnerOverride?: string,
  lineOverrides?: LineOverrides,
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

  // R1描画
  const drawR1 = (r1Arr: BracketMatch[], isLeft: boolean) => {
    for (let i = 0; i < r1Arr.length; i++) {
      const m = r1Arr[i];
      const p = getPos(i);
      const bye1 = !m.team1Id && m.team1Name === 'BYE';
      const bye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
      const bye = isByeMatch(m);
      const t1cy = top + p.t1y + SLOT_H / 2;
      const t2cy = top + p.t2y + SLOT_H / 2;
      const cy = (t1cy + t2cy) / 2;

      if (isLeft) {
        if (bye) {
          // BYE: 勝者チームをcy位置に描画
          const teamY = cy - SLOT_H / 2;
          const wId = m.winnerId || (bye2 ? m.team1Id : m.team2Id);
          if (wId) drawTeamLeft(ctx, PADDING_X, teamY, wId, '', false, allTeams);
          const slotR = PADDING_X + SLOT_W;
          const exitX = slotR + gapX;
          const ov = lineOverrides?.[m.matchId];
          const isRed = ov === 't1red' || ov === 't2red' ? true : ov === 'black' ? false : byeWinnerAdvanced(m);
          ln(ctx, slotR, cy, exitX, cy, isRed ? WIN_COLOR : LINE_COLOR, isRed ? WIN_W : LOSE_W);
        } else {
          drawTeamLeft(ctx, PADDING_X, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
          drawTeamLeft(ctx, PADDING_X, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);
          const slotR = PADDING_X + SLOT_W;
          const exitX = slotR + gapX;
          const jx = slotR + gapX * 0.42;
          drawBracketLines(ctx, t1cy, t2cy, cy, slotR, jx, exitX, m, true, lineOverrides);
        }
        jp.set(m.matchId, { x: PADDING_X + SLOT_W + gapX, y: cy });
      } else {
        const rx = totalW - PADDING_X - SLOT_W;
        if (bye) {
          const teamY = cy - SLOT_H / 2;
          const wId = m.winnerId || (bye2 ? m.team1Id : m.team2Id);
          if (wId) drawTeamRight(ctx, rx + RIGHT_MARGIN, teamY, wId, '', false, allTeams);
          const exitX = rx - gapX;
          const ov2 = lineOverrides?.[m.matchId];
          const isRed2 = ov2 === 't1red' || ov2 === 't2red' ? true : ov2 === 'black' ? false : byeWinnerAdvanced(m);
          ln(ctx, rx, cy, exitX, cy, isRed2 ? WIN_COLOR : LINE_COLOR, isRed2 ? WIN_W : LOSE_W);
        } else {
          drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t1y, m.team1Id, m.team1Name, bye1, allTeams);
          drawTeamRight(ctx, rx + RIGHT_MARGIN, top + p.t2y, m.team2Id, m.team2Name, bye2, allTeams);
          const exitX = rx - gapX;
          const jx = rx - gapX * 0.42;
          drawBracketLines(ctx, t1cy, t2cy, cy, rx, jx, exitX, m, false, lineOverrides);
        }
        jp.set(m.matchId, { x: rx - gapX, y: cy });
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
          const isSF1p = r === sideRounds && maxRound >= 2;
          const ov1p = lineOverrides?.[m.matchId];
          // 準決勝の出力線は常に黒
          const hasW = isSF1p ? false : (ov1p === 't1red' || ov1p === 't2red' ? true : ov1p === 'black' ? false : m.winnerId != null);
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
      // 準決勝の出力線は常に黒（決勝の赤線は後で上書き）
      const isSemiFinal = r === sideRounds && maxRound >= 2;

      if (isLeft) {
        const jx = baseX + gapX * 0.42;
        const exitX = baseX + gapX;
        drawBracketLines(ctx, upperY, lowerY, cy, baseX, jx, exitX, m, true, lineOverrides, isSemiFinal);
        jp.set(m.matchId, { x: exitX, y: cy });
      } else {
        const jx = baseX - gapX * 0.42;
        const exitX = baseX - gapX;
        drawBracketLines(ctx, upperY, lowerY, cy, baseX, jx, exitX, m, false, lineOverrides, isSemiFinal);
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
        const topY = leftP.y;   // 左山の出力Y（上側）
        const botY = rightP.y;  // 右山の出力Y（下側）
        const cy = (topY + botY) / 2;

        // 左山のparentマッチのnextSlotから、左山がteam1/team2のどちらかを判定
        const leftParentMatch = (rm.get(maxRound - 1) || []).find(pm => {
          const p = jp.get(pm.matchId);
          return p && p.x < totalW / 2;
        });
        const leftIsTeam1 = !leftParentMatch || leftParentMatch.nextSlot === 'team1';

        // lineOverrides対応
        const finalOv = lineOverrides?.[fm.matchId];
        let leftWon: boolean;
        let rightWon: boolean;
        if (finalOv === 't1red') { leftWon = true; rightWon = false; }
        else if (finalOv === 't2red') { leftWon = false; rightWon = true; }
        else if (finalOv === 'black') { leftWon = false; rightWon = false; }
        else {
          leftWon = fm.winnerId != null && (
            leftIsTeam1 ? fm.winnerId === fm.team1Id : fm.winnerId === fm.team2Id
          );
          rightWon = fm.winnerId != null && !leftWon;
        }

        // 準決勝の出力線を決勝勝者側のみ赤で上書き描画
        // （準決勝のdrawBracketLinesではexitBlack=trueで黒で描画済み）
        if (leftWon) {
          // 左山勝者: 準決勝出力線を赤で上書き
          ln(ctx, leftP.x - gapX * 0.58, topY, leftP.x, topY, WIN_COLOR, WIN_W);
        }
        if (rightWon) {
          // 右山勝者: 準決勝出力線を赤で上書き
          ln(ctx, rightP.x + gapX * 0.58, botY, rightP.x, botY, WIN_COLOR, WIN_W);
        }

        // 左山→中央（勝者なら赤、敗者なら黒）
        ln(ctx, leftP.x, topY, jx, topY, leftWon ? WIN_COLOR : LINE_COLOR, leftWon ? WIN_W : LOSE_W);
        // 右山→中央
        ln(ctx, rightP.x, botY, jx, botY, rightWon ? WIN_COLOR : LINE_COLOR, rightWon ? WIN_W : LOSE_W);
        // 縦線（勝者側のみ赤）
        if (fm.winnerId) {
          if (leftWon) {
            ln(ctx, jx, topY, jx, cy, WIN_COLOR, WIN_W);
            ln(ctx, jx, cy, jx, botY, LINE_COLOR, LOSE_W);
          } else {
            ln(ctx, jx, topY, jx, cy, LINE_COLOR, LOSE_W);
            ln(ctx, jx, cy, jx, botY, WIN_COLOR, WIN_W);
          }
        } else {
          ln(ctx, jx, topY, jx, botY, LINE_COLOR, LOSE_W);
        }

        // 優勝者: 中央から上に線→スコア→名前（スコアは優勝者名の上のみ）
        const winnerTeam = fm.winnerId ? allTeams.find(t => t.teamId === fm.winnerId) : null;
        const defaultWinnerName = winnerTeam ? `${familyName(winnerTeam.male.name)}・${familyName(winnerTeam.female.name)}` : '';
        const displayName = winnerOverride ?? defaultWinnerName;

        if (displayName) {
          const lineTop = cy - 25;
          ln(ctx, jx, cy, jx, lineTop, WIN_COLOR, WIN_W);
          // スコアを優勝者名の上に表示
          if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
            txt(ctx, `${fm.score1}−${fm.score2}`, jx, lineTop - 28, 11, { align: 'center', color: '#555' });
          }
          txt(ctx, displayName, jx, lineTop - 12, 13, { align: 'center', bold: true });
        }
      }
    }
  }

  txt(ctx, `${r1.length * 2}ドロー`, totalW / 2, totalH - 8, 9, { align: 'center', color: '#bbb' });
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string, winnerOverride?: string, lineOverrides?: LineOverrides) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName, winnerOverride, lineOverrides);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${CATEGORY_LABELS[bracket.category] || bracket.category}.jpg`;
  a.click();
}
