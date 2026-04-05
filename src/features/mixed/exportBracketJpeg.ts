import type { PlacementBracket, BracketMatch, MixedTeam } from './types';

// カテゴリ表示ラベル
const CATEGORY_LABELS: Record<string, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

// ラウンド名
function roundLabel(round: number, maxRound: number): string {
  if (round === maxRound) return '決勝';
  if (round === maxRound - 1) return '準決勝';
  if (round === maxRound - 2) return '準々決勝';
  return `${round}回戦`;
}

// ---------------------------------------------------------------------------
// Canvas描画ヘルパー
// ---------------------------------------------------------------------------

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign = 'left',
  color = '#1e293b',
  bold = false,
  maxWidth?: number,
) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxWidth) {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = '#555555',
  width = 1.5,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: string,
  stroke?: string,
  strokeW = 1,
) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.strokeRect(x, y, w, h);
  }
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  strokeW = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
}

// ---------------------------------------------------------------------------
// Team slot (entry box) 描画
// ---------------------------------------------------------------------------

interface SlotPos { x: number; y: number }

const SLOT_W = 210;
const SLOT_H = 52;

function drawTeamSlot(
  ctx: CanvasRenderingContext2D,
  pos: SlotPos,
  teamId: string | null,
  teamName: string,
  isBye: boolean,
  allTeams: MixedTeam[],
) {
  const { x, y } = pos;

  // Background & border
  drawRoundRect(ctx, x, y, SLOT_W, SLOT_H, 3, '#fafafa', '#c0c0c0', 1);

  if (isBye || (!teamId && teamName === 'BYE')) {
    drawText(ctx, 'BYE', x + SLOT_W / 2, y + SLOT_H / 2, 14, 'center', '#c0c0c0', false);
    return;
  }

  if (!teamId) {
    // Waiting / empty
    if (teamName) {
      drawText(ctx, teamName, x + SLOT_W / 2, y + SLOT_H / 2, 12, 'center', '#999999', false, SLOT_W - 8);
    }
    return;
  }

  const team = allTeams.find(t => t.teamId === teamId);
  if (!team) {
    drawText(ctx, teamName || '???', x + SLOT_W / 2, y + SLOT_H / 2, 12, 'center', '#999999', false, SLOT_W - 8);
    return;
  }

  // Pair number box
  const numW = 30;
  drawRect(ctx, x, y, numW, SLOT_H, '#f0f0f0', '#c0c0c0', 1);
  drawText(ctx, String(team.pairNumber), x + numW / 2, y + SLOT_H / 2, 14, 'center', '#333333', true);

  // Male name + affiliation
  const nameX = x + numW + 6;
  const nameMaxW = SLOT_W - numW - 12;
  const maleAff = team.male.affiliation ? ` ${team.male.affiliation}` : '';
  const femaleAff = team.female.affiliation ? ` ${team.female.affiliation}` : '';

  drawText(ctx, team.male.name, nameX, y + 15, 12, 'left', '#1a1a1a', true, nameMaxW - 50);
  drawText(ctx, maleAff, nameX + measureTextApprox(team.male.name, 12, true), y + 15, 10, 'left', '#888888', false, 60);

  drawText(ctx, team.female.name, nameX, y + 37, 12, 'left', '#1a1a1a', true, nameMaxW - 50);
  drawText(ctx, femaleAff, nameX + measureTextApprox(team.female.name, 12, true), y + 37, 10, 'left', '#888888', false, 60);
}

/** テキスト幅の近似計算（Canvas measureText が使えないコンテキストのためのフォールバック） */
function measureTextApprox(text: string, fontSize: number, _bold = false): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code > 0x2fff) {
      // CJK文字は全角幅
      width += fontSize;
    } else if (ch === ' ') {
      width += fontSize * 0.3;
    } else {
      width += fontSize * 0.6;
    }
  }
  return width;
}

// ---------------------------------------------------------------------------
// メイン描画
// ---------------------------------------------------------------------------

export async function generateBracketDataUrl(
  bracket: PlacementBracket,
  allTeams: MixedTeam[],
  tournamentName: string,
): Promise<string> {
  const matches = bracket.matches;
  if (matches.length === 0) {
    throw new Error('No matches in bracket');
  }

  // ラウンド情報を解析
  const maxRound = Math.max(...matches.map(m => m.round));
  const rounds: Map<number, BracketMatch[]> = new Map();
  for (const m of matches) {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round)!.push(m);
  }
  // 各ラウンドをposition順にソート
  for (const [, arr] of rounds) {
    arr.sort((a, b) => a.position - b.position);
  }

  const round1Matches = rounds.get(1) || [];
  const totalSlots = round1Matches.length * 2; // 1回戦のスロット数
  const halfSlots = Math.ceil(round1Matches.length / 2); // 片側の試合数

  // レイアウト定数
  const scale = 2;
  const headerH = 90;
  const roundLabelH = 36;
  const slotGapY = 12; // スロット間の隙間
  const matchGapY = SLOT_H * 2 + slotGapY; // 1マッチ分の高さ
  const connectorW = 50; // 接続線の水平長さ
  const roundGapX = connectorW + 20; // ラウンド間の水平間隔
  const paddingX = 30;
  const paddingY = 30;
  const centerGap = 60; // 左右ブロック間のギャップ（決勝用）

  // 片側のラウンド数（決勝を除く）
  const sideRounds = maxRound >= 2 ? maxRound - 1 : maxRound;

  // 片側の幅 = (SLOT_W + roundGapX) * sideRounds
  const sideWidth = SLOT_W + (sideRounds > 1 ? (SLOT_W + roundGapX) * (sideRounds - 1) : 0);

  // 高さ計算: 片側の1回戦試合数に基づく
  const leftR1Count = halfSlots;
  const rightR1Count = round1Matches.length - halfSlots;
  const maxR1Count = Math.max(leftR1Count, rightR1Count);
  const bracketAreaH = maxR1Count * matchGapY + SLOT_H;

  // 全体サイズ
  const totalW = paddingX * 2 + sideWidth * 2 + centerGap;
  const totalH = paddingY * 2 + headerH + roundLabelH + bracketAreaH + 20;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // ---- ヘッダー ----
  const currentYear = new Date().getFullYear();
  const titleText = `${currentYear}${tournamentName}`;
  drawText(ctx, titleText, totalW / 2, paddingY + 22, 22, 'center', '#1a1a1a', true);

  const categoryLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const labelW = measureTextApprox(categoryLabel, 18, true) + 30;
  const labelX = (totalW - labelW) / 2;
  const labelY = paddingY + 44;
  drawRoundRect(ctx, labelX, labelY, labelW, 32, 4, '#f5f5f5', '#333333', 1.5);
  drawText(ctx, categoryLabel, totalW / 2, labelY + 16, 18, 'center', '#1a1a1a', true);

  // ---- ラウンドラベル描画 ----
  const topY = paddingY + headerH;

  // 左側ラウンドラベル
  for (let r = 1; r <= sideRounds; r++) {
    const rx = paddingX + (r - 1) * (SLOT_W + roundGapX) + SLOT_W / 2;
    const label = roundLabel(r, maxRound);
    drawText(ctx, label, rx, topY + roundLabelH / 2, 12, 'center', '#666666', true);
  }
  // 右側ラウンドラベル（右から左へ）
  for (let r = 1; r <= sideRounds; r++) {
    const rx = totalW - paddingX - (r - 1) * (SLOT_W + roundGapX) - SLOT_W / 2;
    const label = roundLabel(r, maxRound);
    drawText(ctx, label, rx, topY + roundLabelH / 2, 12, 'center', '#666666', true);
  }
  // 決勝ラベル
  if (maxRound >= 2) {
    drawText(ctx, '決勝', totalW / 2, topY + roundLabelH / 2, 14, 'center', '#cc0000', true);
  }

  // ---- ブラケット描画 ----
  const bracketTopY = topY + roundLabelH + 10;

  // マッチを左右に分割
  // 左側: round1の前半, 右側: round1の後半
  const leftR1 = round1Matches.slice(0, halfSlots);
  const rightR1 = round1Matches.slice(halfSlots);

  // 各マッチのスロット中心Y座標を計算する関数
  // マッチの位置（position）から、そのラウンド・サイドでの表示位置を求める
  interface MatchLayout {
    match: BracketMatch;
    x: number;
    team1SlotY: number;
    team2SlotY: number;
    centerY: number;
  }

  const layoutMap = new Map<string, MatchLayout>();

  // 左側の描画 (Round 1から外側→内側)
  function layoutLeftSide() {
    // Round 1 - 左側
    for (let i = 0; i < leftR1.length; i++) {
      const m = leftR1[i];
      const x = paddingX;
      const t1y = bracketTopY + i * matchGapY;
      const t2y = t1y + SLOT_H + slotGapY;
      layoutMap.set(m.matchId, {
        match: m,
        x,
        team1SlotY: t1y,
        team2SlotY: t2y,
        centerY: (t1y + SLOT_H / 2 + t2y + SLOT_H / 2) / 2,
      });
    }

    // 後続ラウンド（左側）
    for (let r = 2; r <= sideRounds; r++) {
      const roundMatches = (rounds.get(r) || []).filter(m => {
        // 左側のマッチを判定: positionが前半
        const totalInRound = (rounds.get(r) || []).length;
        const halfInRound = Math.ceil(totalInRound / 2);
        return m.position <= halfInRound;
      });

      for (const m of roundMatches) {
        const x = paddingX + (r - 1) * (SLOT_W + roundGapX);
        // このマッチに接続する前ラウンドのマッチを探す
        const prevRoundMatches = (rounds.get(r - 1) || [])
          .filter(pm => pm.nextMatchId === m.matchId)
          .map(pm => layoutMap.get(pm.matchId))
          .filter(Boolean) as MatchLayout[];

        let centerY: number;
        if (prevRoundMatches.length === 2) {
          centerY = (prevRoundMatches[0].centerY + prevRoundMatches[1].centerY) / 2;
        } else if (prevRoundMatches.length === 1) {
          centerY = prevRoundMatches[0].centerY;
        } else {
          // フォールバック: 均等配置
          const idx = roundMatches.indexOf(m);
          const spacing = matchGapY * Math.pow(2, r - 1);
          centerY = bracketTopY + SLOT_H / 2 + slotGapY / 2 + idx * spacing + spacing / 2;
        }

        const t1y = centerY - SLOT_H - slotGapY / 2;
        const t2y = centerY + slotGapY / 2;
        layoutMap.set(m.matchId, {
          match: m,
          x,
          team1SlotY: t1y,
          team2SlotY: t2y,
          centerY,
        });
      }
    }
  }

  // 右側の描画 (Round 1から外側→内側、ただしX座標は右から)
  function layoutRightSide() {
    for (let i = 0; i < rightR1.length; i++) {
      const m = rightR1[i];
      const x = totalW - paddingX - SLOT_W;
      const t1y = bracketTopY + i * matchGapY;
      const t2y = t1y + SLOT_H + slotGapY;
      layoutMap.set(m.matchId, {
        match: m,
        x,
        team1SlotY: t1y,
        team2SlotY: t2y,
        centerY: (t1y + SLOT_H / 2 + t2y + SLOT_H / 2) / 2,
      });
    }

    for (let r = 2; r <= sideRounds; r++) {
      const roundMatches = (rounds.get(r) || []).filter(m => {
        const totalInRound = (rounds.get(r) || []).length;
        const halfInRound = Math.ceil(totalInRound / 2);
        return m.position > halfInRound;
      });

      for (const m of roundMatches) {
        const x = totalW - paddingX - SLOT_W - (r - 1) * (SLOT_W + roundGapX);
        const prevRoundMatches = (rounds.get(r - 1) || [])
          .filter(pm => pm.nextMatchId === m.matchId)
          .map(pm => layoutMap.get(pm.matchId))
          .filter(Boolean) as MatchLayout[];

        let centerY: number;
        if (prevRoundMatches.length === 2) {
          centerY = (prevRoundMatches[0].centerY + prevRoundMatches[1].centerY) / 2;
        } else if (prevRoundMatches.length === 1) {
          centerY = prevRoundMatches[0].centerY;
        } else {
          const idx = roundMatches.indexOf(m);
          const spacing = matchGapY * Math.pow(2, r - 1);
          centerY = bracketTopY + SLOT_H / 2 + slotGapY / 2 + idx * spacing + spacing / 2;
        }

        const t1y = centerY - SLOT_H - slotGapY / 2;
        const t2y = centerY + slotGapY / 2;
        layoutMap.set(m.matchId, {
          match: m,
          x,
          team1SlotY: t1y,
          team2SlotY: t2y,
          centerY,
        });
      }
    }
  }

  // 決勝のレイアウト
  function layoutFinal() {
    const finalMatches = rounds.get(maxRound) || [];
    if (finalMatches.length === 0) return;

    const fm = finalMatches[0];
    const x = (totalW - SLOT_W) / 2;
    // 左右の準決勝マッチの中間Y
    const prevMatches = [...layoutMap.values()].filter(
      l => l.match.round === maxRound - 1
    );
    let centerY: number;
    if (prevMatches.length >= 2) {
      centerY = (prevMatches[0].centerY + prevMatches[prevMatches.length - 1].centerY) / 2;
    } else if (prevMatches.length === 1) {
      centerY = prevMatches[0].centerY;
    } else {
      centerY = bracketTopY + bracketAreaH / 2;
    }

    const t1y = centerY - SLOT_H - slotGapY / 2;
    const t2y = centerY + slotGapY / 2;
    layoutMap.set(fm.matchId, {
      match: fm,
      x,
      team1SlotY: t1y,
      team2SlotY: t2y,
      centerY,
    });
  }

  layoutLeftSide();
  layoutRightSide();
  if (maxRound >= 2) {
    layoutFinal();
  }

  // ---- 接続線を描画 ----
  for (const [, layout] of layoutMap) {
    const m = layout.match;
    const isLeftSide = layout.x < totalW / 2;
    const isFinal = m.round === maxRound && maxRound >= 2;

    // 前ラウンドのマッチからの接続線
    const prevMatches = (rounds.get(m.round - 1) || [])
      .filter(pm => pm.nextMatchId === m.matchId)
      .map(pm => layoutMap.get(pm.matchId))
      .filter(Boolean) as MatchLayout[];

    if (prevMatches.length > 0) {
      for (const prev of prevMatches) {
        const prevIsLeft = prev.x < totalW / 2;

        if (prevIsLeft) {
          // 左側: 前マッチの右端 → 現マッチの左端
          const fromX = prev.x + SLOT_W;
          const fromY = prev.centerY;
          const toX = layout.x;
          const toY = isFinal
            ? (prev.match.nextSlot === 'team1' ? layout.team1SlotY + SLOT_H / 2 : layout.team2SlotY + SLOT_H / 2)
            : layout.centerY;

          // 横線(前マッチから)
          const midX = (fromX + toX) / 2;
          drawLine(ctx, fromX, fromY, midX, fromY, '#555555', 1.5);
          // 縦線
          drawLine(ctx, midX, fromY, midX, toY, '#555555', 1.5);
          // 横線(現マッチへ)
          drawLine(ctx, midX, toY, toX, toY, '#555555', 1.5);

          // スコア表示（前マッチが完了している場合）
          if (prev.match.status === 'finished' && prev.match.score1 != null && prev.match.score2 != null) {
            const score1Y = prev.team1SlotY + SLOT_H / 2;
            const score2Y = prev.team2SlotY + SLOT_H / 2;
            drawText(ctx, String(prev.match.score1), fromX + 8, score1Y, 13, 'left', '#cc0000', true);
            drawText(ctx, String(prev.match.score2), fromX + 8, score2Y, 13, 'left', '#cc0000', true);
          }
        } else {
          // 右側: 前マッチの左端 → 現マッチの右端
          const fromX = prev.x;
          const fromY = prev.centerY;
          const toX = layout.x + SLOT_W;
          const toY = isFinal
            ? (prev.match.nextSlot === 'team2' ? layout.team2SlotY + SLOT_H / 2 : layout.team1SlotY + SLOT_H / 2)
            : layout.centerY;

          const midX = (fromX + toX) / 2;
          drawLine(ctx, fromX, fromY, midX, fromY, '#555555', 1.5);
          drawLine(ctx, midX, fromY, midX, toY, '#555555', 1.5);
          drawLine(ctx, midX, toY, toX, toY, '#555555', 1.5);

          if (prev.match.status === 'finished' && prev.match.score1 != null && prev.match.score2 != null) {
            const score1Y = prev.team1SlotY + SLOT_H / 2;
            const score2Y = prev.team2SlotY + SLOT_H / 2;
            drawText(ctx, String(prev.match.score1), fromX - 8, score1Y, 13, 'right', '#cc0000', true);
            drawText(ctx, String(prev.match.score2), fromX - 8, score2Y, 13, 'right', '#cc0000', true);
          }
        }
      }
    }

    // Round 1のマッチで、team1 と team2 の間に接続線
    if (m.round === 1) {
      if (isLeftSide) {
        // 左側: team1スロット右端→team2スロット右端を縦線で接続
        const lineX = layout.x + SLOT_W + 8;
        const t1cy = layout.team1SlotY + SLOT_H / 2;
        const t2cy = layout.team2SlotY + SLOT_H / 2;
        drawLine(ctx, layout.x + SLOT_W, t1cy, lineX, t1cy, '#555555', 1.5);
        drawLine(ctx, layout.x + SLOT_W, t2cy, lineX, t2cy, '#555555', 1.5);
        drawLine(ctx, lineX, t1cy, lineX, t2cy, '#555555', 1.5);

        // スコア
        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          drawText(ctx, String(m.score1), lineX + 6, t1cy, 13, 'left', '#cc0000', true);
          drawText(ctx, String(m.score2), lineX + 6, t2cy, 13, 'left', '#cc0000', true);
        }
      } else {
        // 右側: team1スロット左端→team2スロット左端を縦線で接続
        const lineX = layout.x - 8;
        const t1cy = layout.team1SlotY + SLOT_H / 2;
        const t2cy = layout.team2SlotY + SLOT_H / 2;
        drawLine(ctx, layout.x, t1cy, lineX, t1cy, '#555555', 1.5);
        drawLine(ctx, layout.x, t2cy, lineX, t2cy, '#555555', 1.5);
        drawLine(ctx, lineX, t1cy, lineX, t2cy, '#555555', 1.5);

        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          drawText(ctx, String(m.score1), lineX - 6, t1cy, 13, 'right', '#cc0000', true);
          drawText(ctx, String(m.score2), lineX - 6, t2cy, 13, 'right', '#cc0000', true);
        }
      }
    } else if (m.round > 1 && m.round < maxRound) {
      // 中間ラウンドのマッチ内接続線
      if (isLeftSide) {
        const lineX = layout.x + SLOT_W + 8;
        const t1cy = layout.team1SlotY + SLOT_H / 2;
        const t2cy = layout.team2SlotY + SLOT_H / 2;
        drawLine(ctx, layout.x + SLOT_W, t1cy, lineX, t1cy, '#555555', 1.5);
        drawLine(ctx, layout.x + SLOT_W, t2cy, lineX, t2cy, '#555555', 1.5);
        drawLine(ctx, lineX, t1cy, lineX, t2cy, '#555555', 1.5);

        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          drawText(ctx, String(m.score1), lineX + 6, t1cy, 13, 'left', '#cc0000', true);
          drawText(ctx, String(m.score2), lineX + 6, t2cy, 13, 'left', '#cc0000', true);
        }
      } else {
        const lineX = layout.x - 8;
        const t1cy = layout.team1SlotY + SLOT_H / 2;
        const t2cy = layout.team2SlotY + SLOT_H / 2;
        drawLine(ctx, layout.x, t1cy, lineX, t1cy, '#555555', 1.5);
        drawLine(ctx, layout.x, t2cy, lineX, t2cy, '#555555', 1.5);
        drawLine(ctx, lineX, t1cy, lineX, t2cy, '#555555', 1.5);

        if (m.status === 'finished' && m.score1 != null && m.score2 != null) {
          drawText(ctx, String(m.score1), lineX - 6, t1cy, 13, 'right', '#cc0000', true);
          drawText(ctx, String(m.score2), lineX - 6, t2cy, 13, 'right', '#cc0000', true);
        }
      }
    }
  }

  // 決勝のスコア表示（マッチ内接続線）
  const finalLayout = [...layoutMap.values()].find(l => l.match.round === maxRound && maxRound >= 2);
  if (finalLayout) {
    const fm = finalLayout.match;
    // 決勝は中央配置なので、左右からの線はprevMatchesで処理済み
    // team1/team2スロットの間に縦線を追加
    const cx = finalLayout.x + SLOT_W / 2;
    const t1cy = finalLayout.team1SlotY + SLOT_H;
    const t2cy = finalLayout.team2SlotY;
    drawLine(ctx, cx - 30, t1cy, cx - 30, t2cy, '#555555', 0); // invisible spacer

    if (fm.status === 'finished' && fm.score1 != null && fm.score2 != null) {
      // スコアをスロットの右横に
      drawText(ctx, String(fm.score1), finalLayout.x + SLOT_W + 10, finalLayout.team1SlotY + SLOT_H / 2, 14, 'left', '#cc0000', true);
      drawText(ctx, String(fm.score2), finalLayout.x + SLOT_W + 10, finalLayout.team2SlotY + SLOT_H / 2, 14, 'left', '#cc0000', true);
    }

    // 勝者表示
    if (fm.winnerId) {
      const winner = allTeams.find(t => t.teamId === fm.winnerId);
      if (winner) {
        drawText(ctx, '優勝', finalLayout.x + SLOT_W / 2, finalLayout.team1SlotY - 20, 14, 'center', '#cc0000', true);
        drawText(ctx, `${winner.teamName} (No.${winner.pairNumber})`, finalLayout.x + SLOT_W / 2, finalLayout.team1SlotY - 6, 11, 'center', '#cc0000', false);
      }
    }
  }

  // ---- チームスロット描画（線の上に重ねる）----
  for (const [, layout] of layoutMap) {
    const m = layout.match;
    drawTeamSlot(ctx, { x: layout.x, y: layout.team1SlotY }, m.team1Id, m.team1Name, false, allTeams);

    if (m.isBye) {
      drawTeamSlot(ctx, { x: layout.x, y: layout.team2SlotY }, null, 'BYE', true, allTeams);
    } else {
      drawTeamSlot(ctx, { x: layout.x, y: layout.team2SlotY }, m.team2Id, m.team2Name, false, allTeams);
    }
  }

  // ---- ドローサイズ表示 ----
  drawText(
    ctx,
    `${totalSlots}ドロー`,
    totalW / 2,
    totalH - paddingY + 4,
    11,
    'center',
    '#999999',
    false,
  );

  // JPEG Data URL を返す
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * トーナメント表をJPEGダウンロード
 */
export async function exportBracketJpeg(
  bracket: PlacementBracket,
  allTeams: MixedTeam[],
  tournamentName: string,
) {
  const dataUrl = await generateBracketDataUrl(bracket, allTeams, tournamentName);
  const categoryLabel = CATEGORY_LABELS[bracket.category] || bracket.category;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${categoryLabel}.jpg`;
  a.click();
}
