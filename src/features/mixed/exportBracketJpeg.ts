import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント',
  '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

// レイアウト定数
const SCALE = 2;
const SLOT_W = 190;
const SLOT_H = 46;
const NUM_W = 26;
const PADDING_X = 28;
const PADDING_Y = 28;
const HEADER_H = 40;
const ROUND_LABEL_H = 28;

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

// チーム枠（1回戦のみ使用）
function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  rRect(ctx, x, y, SLOT_W, SLOT_H, 3, '#fafafa', '#aaa', 1);
  if (isBye || (!teamId && teamName === 'BYE')) { txt(ctx, 'BYE', x + SLOT_W / 2, y + SLOT_H / 2, 12, { align: 'center', color: '#bbb' }); return; }
  if (!teamId) { if (teamName) txt(ctx, teamName, x + SLOT_W / 2, y + SLOT_H / 2, 10, { align: 'center', color: '#999', maxW: SLOT_W - 8 }); return; }
  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) { txt(ctx, teamName || '?', x + SLOT_W / 2, y + SLOT_H / 2, 10, { align: 'center', color: '#999' }); return; }
  ctx.fillStyle = '#eee'; ctx.fillRect(x + 0.5, y + 0.5, NUM_W, SLOT_H - 1);
  ln(ctx, x + NUM_W, y, x + NUM_W, y + SLOT_H, '#aaa', 1);
  txt(ctx, String(team.pairNumber), x + NUM_W / 2, y + SLOT_H / 2, 12, { align: 'center', bold: true });
  const nx = x + NUM_W + 4, mw = SLOT_W - NUM_W - 8;
  txt(ctx, team.male.name, nx, y + 13, 11, { bold: true, maxW: mw * 0.6 });
  const mnw = Math.min(approxW(team.male.name, 11), mw * 0.6);
  if (team.male.affiliation) txt(ctx, team.male.affiliation, nx + mnw + 2, y + 13, 8, { color: '#888', maxW: mw - mnw - 4 });
  txt(ctx, team.female.name, nx, y + 33, 11, { bold: true, maxW: mw * 0.6 });
  const fnw = Math.min(approxW(team.female.name, 11), mw * 0.6);
  if (team.female.affiliation) txt(ctx, team.female.affiliation, nx + fnw + 2, y + 33, 8, { color: '#888', maxW: mw - fnw - 4 });
}

function getRoundLabel(round: number, maxRound: number): string {
  if (round === maxRound) return '決勝';
  if (round === maxRound - 1) return '準決勝';
  if (round === maxRound - 2) return '準々決勝';
  return `${round}回戦`;
}

/** 苗字のみ取得 */
function familyName(name: string): string { return name.trim().split(/[\s　]+/)[0] || name; }

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
interface JunctionPoint { x: number; y: number; matchId: string }

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

  // R1マッチの配置計算
  const matchBlockH = SLOT_H * 2 + 10; // 1マッチ（2チーム枠+隙間）
  const r1Spacing = matchBlockH * 1.35;
  const maxR1 = Math.max(leftR1.length, rightR1.length, 1);
  const bracketAreaH = maxR1 * r1Spacing;

  // ラウンド間の水平距離
  const gapX = 70;
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * gapX : 0);
  const centerGap = 100;
  const totalW = PADDING_X * 2 + sideW * 2 + centerGap;
  const totalH = PADDING_Y * 2 + HEADER_H + ROUND_LABEL_H + bracketAreaH + 30;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SCALE; canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー（カテゴリ左上、大会名右上）----
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const catW2 = approxW(catLabel, 14) + 24;
  rRect(ctx, PADDING_X, PADDING_Y, catW2, 26, 3, '#fff', '#333', 1.5);
  txt(ctx, catLabel, PADDING_X + catW2 / 2, PADDING_Y + 13, 14, { align: 'center', bold: true });
  txt(ctx, tournamentName, totalW - PADDING_X, PADDING_Y + 13, 14, { align: 'right', bold: true, color: '#333' });

  // ---- ラウンドラベル ----
  const rlY = PADDING_Y + HEADER_H + ROUND_LABEL_H / 2;
  // 左側ラウンドラベル: Round1=チーム枠の中央, Round2以降=接合点の上
  for (let r = 1; r <= sideRounds; r++) {
    const lx = r === 1 ? PADDING_X + SLOT_W / 2 : PADDING_X + SLOT_W + (r - 1) * gapX - gapX / 2;
    txt(ctx, getRoundLabel(r, maxRound), lx, rlY, 10, { align: 'center', color: '#555', bold: true });
  }
  // 右側ラウンドラベル
  for (let r = 1; r <= sideRounds; r++) {
    const rx = r === 1 ? totalW - PADDING_X - SLOT_W / 2 : totalW - PADDING_X - SLOT_W - (r - 1) * gapX + gapX / 2;
    txt(ctx, getRoundLabel(r, maxRound), rx, rlY, 10, { align: 'center', color: '#555', bold: true });
  }
  // 決勝ラベル
  if (maxRound >= 2) txt(ctx, '決勝', totalW / 2, rlY, 12, { align: 'center', color: '#cc0000', bold: true });

  // ---- 各R1マッチの位置を計算 ----
  const bracketTop = PADDING_Y + HEADER_H + ROUND_LABEL_H + 8;

  // junctionPoints[matchId] = { x, y } — 各マッチの出力接合点（次ラウンドへの接続点）
  const junctions = new Map<string, JunctionPoint>();

  // 左側R1の描画＋接合点計算
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + 10;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    // チーム枠
    const isBye1 = !m.team1Id && m.team1Name === 'BYE';
    const isBye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    drawSlot(ctx, PADDING_X, t1y, m.team1Id, m.team1Name, isBye1, allTeams);
    drawSlot(ctx, PADDING_X, t2y, m.team2Id, m.team2Name, isBye2, allTeams);

    // ブラケット線（チーム枠右端 → 接合点）
    const slotRight = PADDING_X + SLOT_W;
    const jx = slotRight + gapX / 2;
    const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
    const isW2 = m.winnerId === m.team2Id && m.winnerId != null;
    ln(ctx, slotRight, t1cy, jx, t1cy, isW1 ? '#cc0000' : '#333', isW1 ? 2 : 1.2);
    ln(ctx, slotRight, t2cy, jx, t2cy, isW2 ? '#cc0000' : '#333', isW2 ? 2 : 1.2);
    ln(ctx, jx, t1cy, jx, t2cy, '#333', 1.2);

    // スコア
    if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
      txt(ctx, String(m.score1), jx + 4, t1cy, 11, { color: '#cc0000', bold: true });
      txt(ctx, String(m.score2), jx + 4, t2cy, 11, { color: '#cc0000', bold: true });
    }

    // 接合点から右への出力線
    const exitX = slotRight + gapX;
    const winColor = (isW1 || isW2) ? '#cc0000' : '#333';
    const winW = (isW1 || isW2) ? 2 : 1.2;
    ln(ctx, jx, cy, exitX, cy, winColor, winW);

    junctions.set(m.matchId, { x: exitX, y: cy, matchId: m.matchId });
  }

  // 右側R1の描画
  for (let i = 0; i < rightR1.length; i++) {
    const m = rightR1[i];
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + 10;
    const t1cy = t1y + SLOT_H / 2;
    const t2cy = t2y + SLOT_H / 2;
    const cy = (t1cy + t2cy) / 2;

    const isBye1 = !m.team1Id && m.team1Name === 'BYE';
    const isBye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    drawSlot(ctx, totalW - PADDING_X - SLOT_W, t1y, m.team1Id, m.team1Name, isBye1, allTeams);
    drawSlot(ctx, totalW - PADDING_X - SLOT_W, t2y, m.team2Id, m.team2Name, isBye2, allTeams);

    const slotLeft = totalW - PADDING_X - SLOT_W;
    const jx = slotLeft - gapX / 2;
    const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
    const isW2 = m.winnerId === m.team2Id && m.winnerId != null;
    ln(ctx, slotLeft, t1cy, jx, t1cy, isW1 ? '#cc0000' : '#333', isW1 ? 2 : 1.2);
    ln(ctx, slotLeft, t2cy, jx, t2cy, isW2 ? '#cc0000' : '#333', isW2 ? 2 : 1.2);
    ln(ctx, jx, t1cy, jx, t2cy, '#333', 1.2);

    if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
      txt(ctx, String(m.score1), jx - 4, t1cy, 11, { align: 'right', color: '#cc0000', bold: true });
      txt(ctx, String(m.score2), jx - 4, t2cy, 11, { align: 'right', color: '#cc0000', bold: true });
    }

    const exitX = slotLeft - gapX;
    const winColor = (isW1 || isW2) ? '#cc0000' : '#333';
    const winW = (isW1 || isW2) ? 2 : 1.2;
    ln(ctx, jx, cy, exitX, cy, winColor, winW);

    junctions.set(m.matchId, { x: exitX, y: cy, matchId: m.matchId });
  }

  // ---- Round 2以降（決勝除く）: 線のみ ----
  for (let r = 2; r <= sideRounds; r++) {
    const roundMatches = roundMap.get(r) || [];
    const totalInRound = roundMatches.length;
    const halfInRound = Math.ceil(totalInRound / 2);

    for (const m of roundMatches) {
      const isLeft = m.position <= halfInRound;
      // 親マッチの接合点を取得
      const parents = (roundMap.get(r - 1) || [])
        .filter(pm => pm.nextMatchId === m.matchId)
        .map(pm => junctions.get(pm.matchId))
        .filter(Boolean) as JunctionPoint[];

      if (parents.length < 2) {
        // 親が1つの場合（BYEなど）: そのまま延長
        if (parents.length === 1) {
          const p = parents[0];
          const isW = m.winnerId != null;
          if (isLeft) {
            const exitX = p.x + gapX;
            ln(ctx, p.x, p.y, exitX, p.y, isW ? '#cc0000' : '#333', isW ? 2 : 1.2);
            junctions.set(m.matchId, { x: exitX, y: p.y, matchId: m.matchId });
          } else {
            const exitX = p.x - gapX;
            ln(ctx, p.x, p.y, exitX, p.y, isW ? '#cc0000' : '#333', isW ? 2 : 1.2);
            junctions.set(m.matchId, { x: exitX, y: p.y, matchId: m.matchId });
          }
        }
        continue;
      }

      const p1 = parents[0]; // 上のマッチ
      const p2 = parents[1]; // 下のマッチ
      const upperY = Math.min(p1.y, p2.y);
      const lowerY = Math.max(p1.y, p2.y);
      const cy = (upperY + lowerY) / 2;

      const isW1 = m.winnerId === m.team1Id && m.winnerId != null;
      const isW2 = m.winnerId === m.team2Id && m.winnerId != null;

      if (isLeft) {
        const jx = p1.x + gapX / 2;
        // 上の水平線（p1→接合点）
        ln(ctx, p1.x, upperY, jx, upperY, isW1 ? '#cc0000' : '#333', isW1 ? 2 : 1.2);
        // 下の水平線（p2→接合点）
        ln(ctx, p2.x, lowerY, jx, lowerY, isW2 ? '#cc0000' : '#333', isW2 ? 2 : 1.2);
        // 縦線
        ln(ctx, jx, upperY, jx, lowerY, '#333', 1.2);
        // スコア
        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          txt(ctx, String(m.score1), jx + 4, upperY, 11, { color: '#cc0000', bold: true });
          txt(ctx, String(m.score2), jx + 4, lowerY, 11, { color: '#cc0000', bold: true });
        }
        // 出力線
        const exitX = p1.x + gapX;
        const winColor = (isW1 || isW2) ? '#cc0000' : '#333';
        ln(ctx, jx, cy, exitX, cy, winColor, (isW1 || isW2) ? 2 : 1.2);
        junctions.set(m.matchId, { x: exitX, y: cy, matchId: m.matchId });
      } else {
        const jx = p1.x - gapX / 2;
        ln(ctx, p1.x, upperY, jx, upperY, isW1 ? '#cc0000' : '#333', isW1 ? 2 : 1.2);
        ln(ctx, p2.x, lowerY, jx, lowerY, isW2 ? '#cc0000' : '#333', isW2 ? 2 : 1.2);
        ln(ctx, jx, upperY, jx, lowerY, '#333', 1.2);
        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          txt(ctx, String(m.score1), jx - 4, upperY, 11, { align: 'right', color: '#cc0000', bold: true });
          txt(ctx, String(m.score2), jx - 4, lowerY, 11, { align: 'right', color: '#cc0000', bold: true });
        }
        const exitX = p1.x - gapX;
        const winColor = (isW1 || isW2) ? '#cc0000' : '#333';
        ln(ctx, jx, cy, exitX, cy, winColor, (isW1 || isW2) ? 2 : 1.2);
        junctions.set(m.matchId, { x: exitX, y: cy, matchId: m.matchId });
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

        // 左側→中央
        ln(ctx, leftP.x, upperY, jx, upperY, isW1 ? '#cc0000' : '#333', isW1 ? 2 : 1.2);
        // 右側→中央
        ln(ctx, rightP.x, lowerY, jx, lowerY, isW2 ? '#cc0000' : '#333', isW2 ? 2 : 1.2);
        // 縦線
        ln(ctx, jx, upperY, jx, lowerY, '#333', 1.2);

        // スコア
        if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
          txt(ctx, String(fm.score1), jx + 5, upperY, 12, { color: '#cc0000', bold: true });
          txt(ctx, String(fm.score2), jx + 5, lowerY, 12, { color: '#cc0000', bold: true });
        }

        // 優勝者表示
        if (fm.winnerId) {
          const winner = allTeams.find(t => t.teamId === fm.winnerId);
          if (winner) {
            const winnerLabel = `優勝: ${familyName(winner.male.name)}・${familyName(winner.female.name)}`;
            // 中央の上に表示
            txt(ctx, winnerLabel, jx, cy - 4, 13, { align: 'center', color: '#cc0000', bold: true });
          }
        }

        // ドローサイズ表示（中央接合点の近く）
        const totalSlots = r1.length * 2;
        rRect(ctx, jx - 14, cy + 8, 28, 20, 3, '#fff', '#333', 1);
        txt(ctx, String(totalSlots), jx, cy + 18, 11, { align: 'center', bold: true });
      }
    }
  }

  // ---- フッター ----
  const totalSlots = r1.length * 2;
  txt(ctx, `${totalSlots}ドロー`, totalW / 2, totalH - PADDING_Y + 5, 9, { align: 'center', color: '#999' });

  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${CATEGORY_LABELS[bracket.category] || bracket.category}.jpg`;
  a.click();
}
