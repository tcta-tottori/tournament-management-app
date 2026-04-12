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

// ---------------------------------------------------------------------------
// 結果画像
// ---------------------------------------------------------------------------

/** 名前から名字を抽出。スペースがあれば分割、なければ全体の半分（2〜3文字）を名字とみなす */
function extractFamily(name: string): string {
  const n = name.replace(/\u3000/g, ' ').trim();
  if (n.includes(' ')) return n.split(/\s+/)[0];
  // スペースなし: 漢字のみなら2文字、それ以外は3文字を名字とする
  if (n.length <= 2) return n;
  // 3文字以上: 一般的な日本の名字は2文字が多い
  return n.substring(0, 2);
}

function _rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export async function generateResultDataUrl(
  bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string,
): Promise<string> {
  const SC = 2;
  const R1W = 290;     // 1回戦幅（フルネーム+所属）
  const R2W = 150;     // 2回戦以降幅（名字のみ、切り詰め）
  const SH = 56;
  const MH = SH * 2;
  const MGAP = 10;
  const RGAP = 40;
  const PX = 16;
  const PY = 12;
  const HDR = 58;

  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) { if (!roundMap.has(m.round)) roundMap.set(m.round, []); roundMap.get(m.round)!.push(m); }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const GRID = MH + MGAP;
  const r1Count = (roundMap.get(1) || []).length;
  const TOP = PY + HDR + 8;

  const roundW = (ri: number) => ri === 0 ? R1W : R2W;
  const roundX = (ri: number) => {
    let x = PX;
    for (let i = 0; i < ri; i++) x += roundW(i) + RGAP;
    return x;
  };

  const mY = (ri: number, mi: number) => {
    const sp = Math.pow(2, ri);
    return TOP + mi * sp * GRID + (sp - 1) * GRID / 2;
  };

  const totalRounds = maxRound;
  const totalW = roundX(totalRounds - 1) + roundW(totalRounds - 1) + PX;
  const totalH = TOP + r1Count * GRID + PY;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SC; canvas.height = totalH * SC;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SC, SC);

  // 背景（白）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ==== ヘッダー ====
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  // ヘッダー背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, PY + HDR);
  // 下線（太め、水色ベース）
  ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, PY + HDR); ctx.lineTo(totalW, PY + HDR); ctx.stroke();

  // トーナメント名（緑背景+白文字の角丸バッジ）
  setFont(ctx, 28, true);
  const catTW = ctx.measureText(catLabel).width;
  const cbW = catTW + 44;
  const cbH = 46;
  const cbX = PX + 4;
  const cbY = PY + (HDR - cbH) / 2;
  _rr(ctx, cbX, cbY, cbW, cbH, 10);
  ctx.fillStyle = '#059669'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(catLabel, cbX + cbW / 2, cbY + cbH / 2);

  // 大会名（右揃え、大きめ）
  setFont(ctx, 18, true);
  ctx.fillStyle = '#374151'; ctx.textAlign = 'right';
  ctx.fillText(tournamentName || '', totalW - PX, cbY + cbH / 2);

  const mbr: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) mbr.push(roundMap.get(r) || []);

  // ==== 接続線（水色ベース） ====
  for (let ri = 0; ri < mbr.length - 1; ri++) {
    const x1 = roundX(ri) + roundW(ri);
    const x2 = roundX(ri + 1);
    const xm = (x1 + x2) / 2;
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 1.5;
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
  const drawTeam = (bx: number, by: number, bw: number, round: number,
    teamId: string | null, _name: string, score: number | null,
    isWin: boolean, tb: number | null, isLose: boolean, defLabel?: string) => {

    if (isWin) {
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(bx + 2, by + 1, bw - 4, SH - 2);
    }
    if (!teamId) return;
    const t = allTeams.find(tm => tm.teamId === teamId);
    if (!t) return;

    const tc = isWin ? '#065f46' : '#111827';
    const sc2 = isWin ? '#cc0000' : '#374151'; // 勝者スコア: 赤
    const ac = isWin ? '#047857' : '#64748b';
    const numC = isWin ? '#065f46' : '#94a3b8'; // 勝者番号: 濃い緑
    const isR1 = round === 1;

    // ペア番号
    setFont(ctx, 12, true);
    ctx.fillStyle = numC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.pairNumber), bx + 18, by + SH / 2);

    const nx = bx + 34;
    const ny1 = by + SH * 0.33;
    const ny2 = by + SH * 0.70;

    if (isR1) {
      // 1回戦: フルネーム + 所属
      setFont(ctx, 15, true);
      ctx.fillStyle = tc; ctx.textAlign = 'left';
      ctx.fillText(t.male.name.replace(/[\s\u3000]+/g, ''), nx, ny1, 105);
      ctx.fillText(t.female.name.replace(/[\s\u3000]+/g, ''), nx, ny2, 105);
      const afX = nx + 108;
      const sr = score !== null ? 34 : 6;
      const afW = bw - (afX - bx) - sr;
      if (afW > 10) {
        setFont(ctx, 11, true);
        ctx.fillStyle = ac;
        ctx.fillText(t.male.affiliation, afX, ny1, afW);
        ctx.fillText(t.female.affiliation, afX, ny2, afW);
      }
    } else {
      // 2回戦以降: 名字のみ（teamName "姓・姓" を優先、fallback: extractFamily）
      const parts = t.teamName.split('・');
      const fn1 = (parts[0] && parts[0] !== t.male.name) ? parts[0] : extractFamily(t.male.name);
      const fn2 = (parts[1] && parts[1] !== t.female.name) ? parts[1] : extractFamily(t.female.name);
      setFont(ctx, 15, true);
      ctx.fillStyle = tc; ctx.textAlign = 'left';
      ctx.fillText(fn1, nx, ny1);
      ctx.fillText(fn2, nx, ny2);
    }

    // スコア or 棄権ラベル
    const scoreX = bx + bw - 8;
    if (defLabel) {
      setFont(ctx, 14, true);
      ctx.fillStyle = defLabel === 'W.O' ? '#9ca3af' : '#dc2626'; // W.O=グレー, Ret=赤
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(defLabel, scoreX, by + SH / 2);
    } else if (score !== null) {
      setFont(ctx, 22, true);
      ctx.fillStyle = sc2; ctx.textAlign = 'right';
      ctx.fillText(String(score), scoreX, by + SH / 2);
      if (isLose && tb != null) {
        const sw3 = ctx.measureText(String(score)).width;
        setFont(ctx, 11, true);
        ctx.fillStyle = '#3b82f6'; ctx.textAlign = 'right';
        ctx.fillText(`(${tb})`, scoreX - sw3 - 2, by + SH / 2);
      }
    }
  };

  // ==== マッチ描画 ====
  for (let ri = 0; ri < mbr.length; ri++) {
    const cx = roundX(ri);
    const mw = roundW(ri);
    const round = ri + 1;

    for (let mi = 0; mi < mbr[ri].length; mi++) {
      const m = mbr[ri][mi];
      const my2 = mY(ri, mi);

      if (m.isBye) {
        const wId = m.winnerId;
        if (wId) {
          const byeH = SH;
          const byeY = my2 + (MH - byeH) / 2;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
          _rr(ctx, cx, byeY, mw, byeH, 10);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
          _rr(ctx, cx, byeY, mw, byeH, 10);
          ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.stroke();
          drawTeam(cx, byeY, mw, round, wId, '', null, false, null, false);
        }
        continue;
      }

      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      _rr(ctx, cx, my2, mw, MH, 10);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      _rr(ctx, cx, my2, mw, MH, 10);
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.stroke();

      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 6, my2 + SH); ctx.lineTo(cx + mw - 6, my2 + SH); ctx.stroke();

      const w1 = m.winnerId === m.team1Id && m.winnerId != null;
      const w2 = m.winnerId === m.team2Id && m.winnerId != null;

      // 棄権判定: W.O(0-0で棄権) / Ret(途中棄権=スコアの低い方が勝者)
      let def1 = ''; // team1側のラベル
      let def2 = ''; // team2側のラベル
      if (m.winnerId && m.status === 'finished') {
        const s1 = m.score1 ?? 0;
        const s2 = m.score2 ?? 0;
        if (s1 === 0 && s2 === 0) {
          // 0-0で勝者あり → W.O（棄権側に表示）
          if (w1) def2 = 'W.O';
          else if (w2) def1 = 'W.O';
        } else if ((w1 && s1 < s2) || (w2 && s2 < s1)) {
          // スコア的に負けている方が勝者 → 途中棄権（敗者=棄権側にRet表示）
          if (w1) def2 = 'Ret';
          else if (w2) def1 = 'Ret';
        }
      }

      // W.O.の場合、勝者側のスコアは表示しない
      const isWO = def1 === 'W.O' || def2 === 'W.O';
      const s1Display = (isWO && w1) ? null : m.score1;
      const s2Display = (isWO && w2) ? null : m.score2;
      drawTeam(cx, my2, mw, round, m.team1Id, m.team1Name, s1Display, w1, m.tiebreakScore, m.winnerId != null && !w1, def1 || undefined);
      drawTeam(cx, my2 + SH, mw, round, m.team2Id, m.team2Name, s2Display, w2, m.tiebreakScore, m.winnerId != null && !w2, def2 || undefined);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
