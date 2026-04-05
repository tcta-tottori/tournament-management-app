import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------
const SCALE = 2;
const SLOT_W = 200;   // チーム枠の幅
const SLOT_H = 48;    // チーム枠の高さ
const NUM_W = 28;     // ペア番号の幅
const MATCH_GAP = 16; // 同一試合の2チーム間の隙間
const ROUND_GAP_X = 70; // ラウンド間の水平距離（接続線の長さ）
const PADDING_X = 30;
const PADDING_Y = 30;
const HEADER_H = 85;
const ROUND_LABEL_H = 30;
const CENTER_GAP = 80; // 決勝の中央スペース

// ---------------------------------------------------------------------------
// Canvas描画ヘルパー
// ---------------------------------------------------------------------------
function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
}

function fillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts?: { align?: CanvasTextAlign; color?: string; bold?: boolean; maxW?: number }) {
  const { align = 'left', color = '#1a1a1a', bold = false, maxW } = opts || {};
  ctx.fillStyle = color;
  setFont(ctx, size, bold);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(text, x, y, maxW);
  else ctx.fillText(text, x, y);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = '#333', w = 1.2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, sw = 1) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}

function approxW(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0x2fff ? fontSize : ch === ' ' ? fontSize * 0.3 : fontSize * 0.6;
  }
  return w;
}

// ---------------------------------------------------------------------------
// チーム枠の描画
// ---------------------------------------------------------------------------
function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, teamId: string | null, teamName: string, isBye: boolean, allTeams: MixedTeam[]) {
  roundRect(ctx, x, y, SLOT_W, SLOT_H, 3, '#fafafa', '#b0b0b0', 1);

  if (isBye || (!teamId && teamName === 'BYE')) {
    fillText(ctx, 'BYE', x + SLOT_W / 2, y + SLOT_H / 2, 13, { align: 'center', color: '#bbb' });
    return;
  }
  if (!teamId) {
    if (teamName) fillText(ctx, teamName, x + SLOT_W / 2, y + SLOT_H / 2, 11, { align: 'center', color: '#999', maxW: SLOT_W - 8 });
    return;
  }

  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) { fillText(ctx, teamName || '?', x + SLOT_W / 2, y + SLOT_H / 2, 11, { align: 'center', color: '#999' }); return; }

  // ペア番号
  ctx.fillStyle = '#eee';
  ctx.fillRect(x + 0.5, y + 0.5, NUM_W, SLOT_H - 1);
  line(ctx, x + NUM_W, y, x + NUM_W, y + SLOT_H, '#b0b0b0', 1);
  fillText(ctx, String(team.pairNumber), x + NUM_W / 2, y + SLOT_H / 2, 13, { align: 'center', color: '#333', bold: true });

  // 名前と所属
  const nx = x + NUM_W + 5;
  const mw = SLOT_W - NUM_W - 10;
  fillText(ctx, team.male.name, nx, y + 14, 12, { bold: true, maxW: mw * 0.62 });
  const maleNameW = Math.min(approxW(team.male.name, 12), mw * 0.62);
  if (team.male.affiliation) fillText(ctx, team.male.affiliation, nx + maleNameW + 3, y + 14, 9, { color: '#888', maxW: mw - maleNameW - 6 });

  fillText(ctx, team.female.name, nx, y + 34, 12, { bold: true, maxW: mw * 0.62 });
  const femaleNameW = Math.min(approxW(team.female.name, 12), mw * 0.62);
  if (team.female.affiliation) fillText(ctx, team.female.affiliation, nx + femaleNameW + 3, y + 34, 9, { color: '#888', maxW: mw - femaleNameW - 6 });
}

// ---------------------------------------------------------------------------
// ラウンドラベル
// ---------------------------------------------------------------------------
function roundLabel(round: number, maxRound: number): string {
  if (round === maxRound) return '決勝';
  if (round === maxRound - 1) return '準決勝';
  if (round === maxRound - 2) return '準々決勝';
  return `${round}回戦`;
}

// ---------------------------------------------------------------------------
// メイン描画
// ---------------------------------------------------------------------------
interface MatchLayout {
  match: BracketMatch;
  x: number;          // チーム枠のx座標
  t1y: number;        // team1の枠y座標
  t2y: number;        // team2の枠y座標
  cy: number;         // マッチの中心y
  isLeft: boolean;    // 左側か
}

export async function generateBracketDataUrl(
  bracket: PlacementBracket,
  allTeams: MixedTeam[],
  tournamentName: string,
): Promise<string> {
  const matches = bracket.matches;
  if (matches.length === 0) throw new Error('No matches');

  const maxRound = Math.max(...matches.map(m => m.round));
  const roundMap = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    if (!roundMap.has(m.round)) roundMap.set(m.round, []);
    roundMap.get(m.round)!.push(m);
  }
  for (const [, arr] of roundMap) arr.sort((a, b) => a.position - b.position);

  const r1 = roundMap.get(1) || [];
  const halfCount = Math.ceil(r1.length / 2);
  const leftR1 = r1.slice(0, halfCount);
  const rightR1 = r1.slice(halfCount);
  const sideRounds = maxRound >= 2 ? maxRound - 1 : maxRound;

  // 片側の1回戦マッチ間の縦方向スペーシング
  const matchH = SLOT_H * 2 + MATCH_GAP; // 1マッチ分の高さ
  const r1Spacing = matchH * 1.4;        // 1回戦マッチ間の間隔
  const maxR1 = Math.max(leftR1.length, rightR1.length);
  const bracketAreaH = maxR1 * r1Spacing;

  // 全体サイズ
  const sideW = SLOT_W + (sideRounds > 1 ? (sideRounds - 1) * (SLOT_W + ROUND_GAP_X) : 0);
  const totalW = PADDING_X * 2 + sideW * 2 + CENTER_GAP;
  const totalH = PADDING_Y * 2 + HEADER_H + ROUND_LABEL_H + bracketAreaH + 30;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * SCALE;
  canvas.height = totalH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー ----
  const year = new Date().getFullYear();
  const era = year >= 2019 ? `令和${year - 2018}年度` : '';
  fillText(ctx, `${year}${era} ${tournamentName}`, totalW / 2, PADDING_Y + 22, 20, { align: 'center', bold: true });
  const catLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const catW = approxW(catLabel, 16) + 30;
  roundRect(ctx, (totalW - catW) / 2, PADDING_Y + 42, catW, 30, 3, '#fff', '#333', 1.5);
  fillText(ctx, catLabel, totalW / 2, PADDING_Y + 57, 16, { align: 'center', bold: true });

  // ---- ラウンドラベル ----
  const labelY = PADDING_Y + HEADER_H + ROUND_LABEL_H / 2;
  for (let r = 1; r <= sideRounds; r++) {
    const lx = PADDING_X + (r - 1) * (SLOT_W + ROUND_GAP_X) + SLOT_W / 2;
    fillText(ctx, roundLabel(r, maxRound), lx, labelY, 11, { align: 'center', color: '#555', bold: true });
    const rx = totalW - PADDING_X - (r - 1) * (SLOT_W + ROUND_GAP_X) - SLOT_W / 2;
    fillText(ctx, roundLabel(r, maxRound), rx, labelY, 11, { align: 'center', color: '#555', bold: true });
  }
  if (maxRound >= 2) {
    fillText(ctx, '決勝', totalW / 2, labelY, 13, { align: 'center', color: '#cc0000', bold: true });
  }

  // ---- レイアウト計算 ----
  const bracketTop = PADDING_Y + HEADER_H + ROUND_LABEL_H + 10;
  const layoutMap = new Map<string, MatchLayout>();

  // 左側 Round 1
  for (let i = 0; i < leftR1.length; i++) {
    const m = leftR1[i];
    const x = PADDING_X;
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + MATCH_GAP;
    layoutMap.set(m.matchId, { match: m, x, t1y, t2y, cy: (t1y + t2y + SLOT_H) / 2, isLeft: true });
  }

  // 右側 Round 1
  for (let i = 0; i < rightR1.length; i++) {
    const m = rightR1[i];
    const x = totalW - PADDING_X - SLOT_W;
    const t1y = bracketTop + i * r1Spacing;
    const t2y = t1y + SLOT_H + MATCH_GAP;
    layoutMap.set(m.matchId, { match: m, x, t1y, t2y, cy: (t1y + t2y + SLOT_H) / 2, isLeft: false });
  }

  // 左側 Round 2 ~ sideRounds
  for (let r = 2; r <= sideRounds; r++) {
    const roundMatches = (roundMap.get(r) || []);
    const totalInRound = roundMatches.length;
    const halfInRound = Math.ceil(totalInRound / 2);
    const leftMatches = roundMatches.filter(m => m.position <= halfInRound);

    for (const m of leftMatches) {
      const x = PADDING_X + (r - 1) * (SLOT_W + ROUND_GAP_X);
      const parents = (roundMap.get(r - 1) || [])
        .filter(pm => pm.nextMatchId === m.matchId)
        .map(pm => layoutMap.get(pm.matchId))
        .filter(Boolean) as MatchLayout[];

      let cy: number;
      if (parents.length >= 2) cy = (parents[0].cy + parents[1].cy) / 2;
      else if (parents.length === 1) cy = parents[0].cy;
      else cy = bracketTop + bracketAreaH / 2;

      const t1y = cy - SLOT_H - MATCH_GAP / 2;
      const t2y = cy + MATCH_GAP / 2;
      layoutMap.set(m.matchId, { match: m, x, t1y, t2y, cy, isLeft: true });
    }
  }

  // 右側 Round 2 ~ sideRounds
  for (let r = 2; r <= sideRounds; r++) {
    const roundMatches = (roundMap.get(r) || []);
    const totalInRound = roundMatches.length;
    const halfInRound = Math.ceil(totalInRound / 2);
    const rightMatches = roundMatches.filter(m => m.position > halfInRound);

    for (const m of rightMatches) {
      const x = totalW - PADDING_X - SLOT_W - (r - 1) * (SLOT_W + ROUND_GAP_X);
      const parents = (roundMap.get(r - 1) || [])
        .filter(pm => pm.nextMatchId === m.matchId)
        .map(pm => layoutMap.get(pm.matchId))
        .filter(Boolean) as MatchLayout[];

      let cy: number;
      if (parents.length >= 2) cy = (parents[0].cy + parents[1].cy) / 2;
      else if (parents.length === 1) cy = parents[0].cy;
      else cy = bracketTop + bracketAreaH / 2;

      const t1y = cy - SLOT_H - MATCH_GAP / 2;
      const t2y = cy + MATCH_GAP / 2;
      layoutMap.set(m.matchId, { match: m, x, t1y, t2y, cy, isLeft: false });
    }
  }

  // 決勝
  if (maxRound >= 2) {
    const finals = roundMap.get(maxRound) || [];
    if (finals.length > 0) {
      const fm = finals[0];
      const x = (totalW - SLOT_W) / 2;
      const prevLayouts = [...layoutMap.values()].filter(l => l.match.round === maxRound - 1);
      let cy: number;
      if (prevLayouts.length >= 2) cy = (prevLayouts[0].cy + prevLayouts[prevLayouts.length - 1].cy) / 2;
      else cy = bracketTop + bracketAreaH / 2;
      const t1y = cy - SLOT_H - MATCH_GAP / 2;
      const t2y = cy + MATCH_GAP / 2;
      layoutMap.set(fm.matchId, { match: fm, x, t1y, t2y, cy, isLeft: true });
    }
  }

  // ---- ブラケット線とスコアの描画 ----
  for (const [, layout] of layoutMap) {
    const m = layout.match;
    const isFinal = m.round === maxRound && maxRound >= 2;
    const t1cy = layout.t1y + SLOT_H / 2;
    const t2cy = layout.t2y + SLOT_H / 2;
    const isWinner1 = m.winnerId === m.team1Id && m.winnerId != null;
    const isWinner2 = m.winnerId === m.team2Id && m.winnerId != null;

    if (isFinal) {
      // 決勝: 左右からの接続線のみ、内部のチーム間接続線は不要
      // スコアはチーム枠の横に表示
      if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
        fillText(ctx, String(m.score1), layout.x + SLOT_W + 8, t1cy, 13, { color: '#cc0000', bold: true });
        fillText(ctx, String(m.score2), layout.x + SLOT_W + 8, t2cy, 13, { color: '#cc0000', bold: true });
      }
    } else if (layout.isLeft) {
      // 左側: チーム枠の右側にブラケット線
      const jx = layout.x + SLOT_W + ROUND_GAP_X / 2; // 接合点のx
      // team1 → 接合点
      line(ctx, layout.x + SLOT_W, t1cy, jx, t1cy, isWinner1 ? '#cc0000' : '#333', isWinner1 ? 2 : 1.2);
      // team2 → 接合点
      line(ctx, layout.x + SLOT_W, t2cy, jx, t2cy, isWinner2 ? '#cc0000' : '#333', isWinner2 ? 2 : 1.2);
      // 縦線（接合）
      line(ctx, jx, t1cy, jx, t2cy, '#333', 1.2);
      // 接合点 → 右（次ラウンドへ）
      const exitY = layout.cy;
      const exitColor = (isWinner1 || isWinner2) ? '#cc0000' : '#333';
      const exitW = (isWinner1 || isWinner2) ? 2 : 1.2;
      line(ctx, jx, exitY, layout.x + SLOT_W + ROUND_GAP_X, exitY, exitColor, exitW);

      // スコア表示（接合点の横、各チームのライン上）
      if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
        fillText(ctx, String(m.score1), jx + 4, t1cy - 1, 12, { color: '#cc0000', bold: true });
        fillText(ctx, String(m.score2), jx + 4, t2cy - 1, 12, { color: '#cc0000', bold: true });
      }
    } else {
      // 右側: チーム枠の左側にブラケット線（ミラー）
      const jx = layout.x - ROUND_GAP_X / 2;
      line(ctx, layout.x, t1cy, jx, t1cy, isWinner1 ? '#cc0000' : '#333', isWinner1 ? 2 : 1.2);
      line(ctx, layout.x, t2cy, jx, t2cy, isWinner2 ? '#cc0000' : '#333', isWinner2 ? 2 : 1.2);
      line(ctx, jx, t1cy, jx, t2cy, '#333', 1.2);
      const exitY = layout.cy;
      const exitColor = (isWinner1 || isWinner2) ? '#cc0000' : '#333';
      const exitW = (isWinner1 || isWinner2) ? 2 : 1.2;
      line(ctx, jx, exitY, layout.x - ROUND_GAP_X, exitY, exitColor, exitW);

      if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
        fillText(ctx, String(m.score1), jx - 4, t1cy - 1, 12, { align: 'right', color: '#cc0000', bold: true });
        fillText(ctx, String(m.score2), jx - 4, t2cy - 1, 12, { align: 'right', color: '#cc0000', bold: true });
      }
    }
  }

  // 決勝への接続線（準決勝→決勝）
  if (maxRound >= 2) {
    const finalLayout = [...layoutMap.values()].find(l => l.match.round === maxRound);
    if (finalLayout) {
      const prevLayouts = [...layoutMap.values()].filter(l => l.match.round === maxRound - 1);
      for (const prev of prevLayouts) {
        const exitY = prev.cy;
        if (prev.isLeft) {
          // 左側準決勝 → 決勝team1
          const fromX = prev.x + SLOT_W + ROUND_GAP_X;
          const toX = finalLayout.x;
          const toY = finalLayout.t1y + SLOT_H / 2;
          const isWin = prev.match.winnerId != null;
          const c = isWin ? '#cc0000' : '#333';
          const w = isWin ? 2 : 1.2;
          line(ctx, fromX, exitY, fromX + (toX - fromX) / 2, exitY, c, w);
          line(ctx, fromX + (toX - fromX) / 2, exitY, fromX + (toX - fromX) / 2, toY, c, w);
          line(ctx, fromX + (toX - fromX) / 2, toY, toX, toY, c, w);
        } else {
          // 右側準決勝 → 決勝team2
          const fromX = prev.x - ROUND_GAP_X;
          const toX = finalLayout.x + SLOT_W;
          const toY = finalLayout.t2y + SLOT_H / 2;
          const isWin = prev.match.winnerId != null;
          const c = isWin ? '#cc0000' : '#333';
          const w = isWin ? 2 : 1.2;
          line(ctx, fromX, exitY, fromX - (fromX - toX) / 2, exitY, c, w);
          line(ctx, fromX - (fromX - toX) / 2, exitY, fromX - (fromX - toX) / 2, toY, c, w);
          line(ctx, fromX - (fromX - toX) / 2, toY, toX, toY, c, w);
        }
      }
    }
  }

  // ---- チーム枠の描画（線の上に重ねる）----
  for (const [, layout] of layoutMap) {
    const m = layout.match;
    const isBye1 = !m.team1Id && m.team1Name === 'BYE';
    const isBye2 = m.isBye || (!m.team2Id && m.team2Name === 'BYE');
    drawSlot(ctx, layout.x, layout.t1y, m.team1Id, m.team1Name, isBye1, allTeams);
    drawSlot(ctx, layout.x, layout.t2y, m.team2Id, m.team2Name, isBye2, allTeams);
  }

  // ---- フッター ----
  const totalSlots = r1.length * 2;
  fillText(ctx, `${totalSlots}ドロー`, totalW / 2, totalH - PADDING_Y + 5, 10, { align: 'center', color: '#999' });

  return canvas.toDataURL('image/jpeg', 0.92);
}

/** JPEG ダウンロード */
export async function exportBracketJpeg(bracket: PlacementBracket, allTeams: MixedTeam[], tournamentName: string) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName);
  const label = CATEGORY_LABELS[bracket.category] || bracket.category;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${label}.jpg`;
  a.click();
}
