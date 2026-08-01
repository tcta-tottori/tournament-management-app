/**
 * 大会結果をトーナメント表（JPEG）およびExcel形式でエクスポートする
 *
 * トーナメント形式: 左右2山のブラケット図（選手名・所属・スコア・優勝者を描画）
 * リーグ形式: 対戦マトリクス表（勝敗・順位付き）
 *
 * 見た目は団体戦の結果画像（exportTeamBracketResultJpeg）と揃えている。
 *   - ヘッダー左: 種目名バッジ
 *   - ヘッダー右: 大会名 ＋ 会場（団体戦と同じ表示ルール）
 *   - 右下: 協会（TCTA）ロゴ
 */
import * as XLSX from 'xlsx';
import type { Draw, Match, Entry, Player, Event, Tournament } from '../../db/database';
import {
  COL,
  clamp,
  drawLine,
  drawResultHeader,
  drawText,
  drawTopAccentBar,
  fitLogo,
  fontOf,
  loadResultLogos,
  roundRect,
  wrapItems,
} from './resultCanvasKit';

export interface ResultExportOptions {
  tournament: Tournament;
  event: Event;
  draw: Draw;
  matches: Match[];
  entries: Entry[];
  players: Player[];
}

// ===== 共通ヘルパー =====

type SlotInfo = {
  position: number;
  name: string;
  affiliation: string;
  seed: number;
  isBye: boolean;
  entryId: string | null;
};

function buildSlotMap(draw: Draw, entries: Entry[], players: Player[]): Map<number, SlotInfo> {
  const map = new Map<number, SlotInfo>();
  for (const s of draw.slots) {
    let name = 'bye';
    let affiliation = '';
    if (!s.isBye && s.entryId) {
      const entry = entries.find(e => e.entryId === s.entryId);
      if (entry) {
        const p1 = players.find(p => p.playerId === entry.playerId);
        const isDoubles = !!entry.partnerId;
        const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
        name = isDoubles && p1 && p2 ? `${p1.name}・${p2.name}` : (p1?.name || '(不明)');
        affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
          ? `${p1.affiliation}/${p2.affiliation}`
          : (p1?.affiliation || '');
      }
    }
    map.set(s.position, { position: s.position, name, affiliation, seed: s.seed, isBye: s.isBye, entryId: s.entryId });
  }
  return map;
}

function buildMatchMap(matches: Match[]): Map<string, Match> {
  const map = new Map<string, Match>();
  for (const m of matches) map.set(`${m.round}-${m.position}`, m);
  return map;
}


function getWinnerAtRound(
  round: number, index: number,
  slotMap: Map<number, SlotInfo>,
  matchMap: Map<string, Match>,
  totalRounds: number,
): { name: string; entryId: string | null; isBye: boolean } | null {
  if (round === 0) {
    const s = slotMap.get(index + 1);
    return s ? { name: s.name, entryId: s.entryId, isBye: s.isBye } : null;
  }
  const match = matchMap.get(`${round}-${index + 1}`);
  if (match?.winnerEntryId) {
    const isP1 = match.winnerEntryId === match.player1EntryId;
    return { name: isP1 ? match.player1Name : match.player2Name, entryId: match.winnerEntryId, isBye: false };
  }
  if (match?.status === 'walkover') {
    const topSlot = getWinnerAtRound(round - 1, index * 2, slotMap, matchMap, totalRounds);
    const botSlot = getWinnerAtRound(round - 1, index * 2 + 1, slotMap, matchMap, totalRounds);
    if (topSlot?.isBye && botSlot && !botSlot.isBye) return botSlot;
    if (botSlot?.isBye && topSlot && !topSlot.isBye) return topSlot;
  }
  // BYE自動進出
  const topSlot = getWinnerAtRound(round - 1, index * 2, slotMap, matchMap, totalRounds);
  const botSlot = getWinnerAtRound(round - 1, index * 2 + 1, slotMap, matchMap, totalRounds);
  if (topSlot?.isBye && botSlot && !botSlot.isBye) return botSlot;
  if (botSlot?.isBye && topSlot && !topSlot.isBye) return topSlot;
  return null;
}

// スロット中心行
function getSlotRow(round: number, index: number): number {
  if (round === 0) return index * 2;
  return (getSlotRow(round - 1, index * 2) + getSlotRow(round - 1, index * 2 + 1)) / 2;
}

// ===== Canvas トーナメント描画 (JPEG) =====

/** Canvas を JPEG としてダウンロードさせる */
function downloadCanvasAsJpeg(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

/** 結果画像のファイル名（ダウンロード用） */
export function buildEventResultFileName(opts: ResultExportOptions): string {
  return `${opts.tournament.name}_${opts.event.name}_結果.jpg`;
}

export async function exportTournamentResultAsJpeg(opts: ResultExportOptions): Promise<void> {
  const canvas = await renderTournamentResultCanvas(opts);
  downloadCanvasAsJpeg(canvas, buildEventResultFileName(opts));
}

/** ブラケットの左右どちら側の山か */
type Side = 'L' | 'R';

/** 線分（勝ち上がりかどうかで色分けする） */
interface Seg { x1: number; y1: number; x2: number; y2: number; win: boolean; dim?: boolean }

/** スコアなどのラベル */
interface Tag { x: number; y: number; text: string; align: CanvasTextAlign; win: boolean }

/**
 * トーナメント表の結果を Canvas に描画して返す。
 *
 * ドローを上半分（左の山）と下半分（右の山）に分け、中央で決勝を突き合わせる
 * 「左右2山」のレイアウトで描画する。縦長になりすぎず、紙のトーナメント表と
 * 同じ感覚で結果を追える。
 */
export async function renderTournamentResultCanvas(opts: ResultExportOptions): Promise<HTMLCanvasElement> {
  const { tournament, event, draw, entries, players, matches } = opts;
  const logos = await loadResultLogos();

  const slotMap = buildSlotMap(draw, entries, players);
  const matchMap = buildMatchMap(matches);

  // ドローサイズは 2 のべき乗として扱う
  const totalRounds = Math.max(1, Math.round(Math.log2(Math.max(2, draw.drawSize))));
  const drawSize = 2 ** totalRounds;
  const halfSlots = drawSize / 2;   // 片側の選手行数
  const halfRounds = totalRounds - 1; // 片側のブラケット列数（決勝は中央）
  const isDoubles = event.type === 'Doubles';

  // ---- 各ノードの進出者（BYE自動進出も解決する） ----
  type Node = { name: string; entryId: string | null; isBye: boolean } | null;
  const winnerCache = new Map<string, Node>();
  const resolve = (round: number, index: number): Node => {
    const key = `${round}-${index}`;
    if (!winnerCache.has(key)) {
      winnerCache.set(key, getWinnerAtRound(round, index, slotMap, matchMap, totalRounds));
    }
    return winnerCache.get(key)!;
  };

  // entryId → 所属 の逆引き（優勝者の所属表示用）
  const affById = new Map<string, string>();
  for (const s of slotMap.values()) {
    if (s.entryId) affById.set(s.entryId, s.affiliation);
  }

  const hasSeed = draw.slots.some(s => s.seed > 0);

  // ---- 事前計測（選手名の最大幅からネーム列の幅を決める） ----
  const meas = document.createElement('canvas').getContext('2d')!;
  const NAME_PX = 14;
  const AFF_PX = 11.5;
  let maxNameW = 0;
  for (let p = 1; p <= drawSize; p++) {
    const s = slotMap.get(p);
    if (!s) continue;
    meas.font = fontOf('bold', NAME_PX);
    let w = meas.measureText(s.isBye ? 'bye' : s.name).width;
    if (!s.isBye && s.affiliation) {
      meas.font = fontOf('normal', AFF_PX);
      w += 5 + meas.measureText(`（${s.affiliation}）`).width;
    }
    if (w > maxNameW) maxNameW = w;
  }
  const NUM_W = hasSeed ? 46 : 26;         // 番号（＋シードバッジ）の幅
  const NAME_W = clamp(maxNameW + NUM_W + 16, 210, isDoubles ? 470 : 380);

  // 行の高さはドローサイズに応じて調整（大きいドローでも縦に伸びすぎないように）
  const ROW_H = halfSlots >= 24 ? 34 : halfSlots >= 16 ? 38 : 44;
  const COL_W = 74;        // 1ラウンド分の横幅
  const CENTER_GAP = 16;   // 優勝カードとブラケットの隙間

  // ---- 優勝カードのサイズ ----
  const champNode = resolve(totalRounds, 0);
  const finalMatch = matchMap.get(`${totalRounds}-1`);
  const champAff = champNode?.entryId ? (affById.get(champNode.entryId) || '') : '';
  const champName = champNode && !champNode.isBye ? champNode.name : '—';
  meas.font = fontOf('black', 17);
  let champTextW = meas.measureText(champName).width;
  if (champAff) {
    meas.font = fontOf('normal', AFF_PX);
    champTextW = Math.max(champTextW, meas.measureText(`（${champAff}）`).width);
  }
  const CARD_W = clamp(champTextW + 46, 200, 360);
  const CARD_H = 100;

  // ---- 全体レイアウト ----
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110;
  const sidePad = 22;

  const contentW = NAME_W * 2 + halfRounds * COL_W * 2 + CENTER_GAP * 2 + CARD_W;
  const tableW = Math.max(contentW + sidePad * 2, 820);

  const bracketTopPad = 52;    // ラウンドラベル用
  const bracketBottomPad = 16;
  const bracketBodyH = halfSlots * ROW_H;
  const bracketH = bracketTopPad + bracketBodyH + bracketBottomPad;

  // ---- フッター（左: シード一覧 / 右: 協会ロゴ） ----
  const seedItems = draw.slots
    .filter(s => s.seed > 0)
    .sort((a, b) => a.seed - b.seed)
    .map(s => `${s.seed}.${slotMap.get(s.position)?.name ?? ''}`)
    .filter(t => !t.endsWith('.'));
  const tcta = fitLogo(logos.tcta, Math.min(360, tableW * 0.4), 80);
  const seedPx = 12;
  const seedMaxW = tableW - tcta.w - 34;
  const seedLines = wrapItems(meas, 'シード　', seedItems, seedMaxW, seedPx, 2);
  const seedBlockH = seedLines.length * (seedPx + 6);
  const footerH = Math.max(tcta.h, seedBlockH) + 10;

  const totalW = tableW + paddingX * 2;
  const totalH = paddingY + headerH + bracketH + footerH + 14;

  // ---- Canvas 準備 ----
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);
  drawTopAccentBar(ctx, totalW);

  // ---- ヘッダー（団体戦と同じ体裁） ----
  drawResultHeader(ctx, {
    title: event.name,
    tournamentName: tournament.name,
    venue: tournament.venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos,
  });

  // ---- ブラケット枠 ----
  const bracketAreaY = paddingY + headerH;
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, paddingX, bracketAreaY, tableW, bracketH, 18, COL.white);
  ctx.restore();
  roundRect(ctx, paddingX, bracketAreaY, tableW, bracketH, 18, undefined, COL.sky200, 1.5);

  // ---- 座標計算 ----
  const contentX = paddingX + (tableW - contentW) / 2;
  const leftNameX = contentX;
  const leftNameEndX = leftNameX + NAME_W;
  const cardLeftX = leftNameEndX + halfRounds * COL_W + CENTER_GAP;
  const cardRightX = cardLeftX + CARD_W;
  const rightNameEndX = cardRightX + CENTER_GAP + halfRounds * COL_W;

  const rowsTopY = bracketAreaY + bracketTopPad;
  /** ラウンド r（片側基準）・インデックス m のノード中心 Y */
  const nodeY = (r: number, m: number): number => {
    const span = 2 ** r;
    return rowsTopY + (m * span + (span - 1) / 2) * ROW_H + ROW_H / 2;
  };
  /** ラウンド r の合流点 X（r=0 はネーム列の端） */
  const joinX = (side: Side, r: number): number =>
    side === 'L' ? leftNameEndX + r * COL_W : rightNameEndX - r * COL_W;
  const finalY = rowsTopY + bracketBodyH / 2;

  // ---- ラウンドラベル ----
  const roundName = (r: number): string => {
    if (r === totalRounds) return '決勝';
    if (r === totalRounds - 1) return '準決勝';
    if (r === totalRounds - 2) return '準々決勝';
    return `${r}回戦`;
  };
  const labelY = bracketAreaY + 26;
  const drawRoundLabel = (cx: number, name: string, isFinal: boolean) => {
    ctx.font = fontOf('black', 12);
    const w = ctx.measureText(name).width + 20;
    const h = 22;
    const bx = cx - w / 2;
    const by = labelY - h / 2;
    if (isFinal) {
      const grad = ctx.createLinearGradient(bx, 0, bx + w, 0);
      grad.addColorStop(0, COL.sky500);
      grad.addColorStop(1, COL.sky600);
      roundRect(ctx, bx, by, w, h, 11, grad);
      drawText(ctx, name, cx, labelY + 1, 12, 'center', COL.white, 'black');
    } else {
      roundRect(ctx, bx, by, w, h, 11, COL.sky100, COL.sky200, 1);
      drawText(ctx, name, cx, labelY + 1, 12, 'center', COL.sky700, 'black');
    }
  };
  for (const side of ['L', 'R'] as Side[]) {
    for (let r = 1; r <= halfRounds; r++) {
      const cx = side === 'L' ? joinX('L', r) - COL_W / 2 : joinX('R', r) + COL_W / 2;
      drawRoundLabel(cx, roundName(r), false);
    }
  }
  drawRoundLabel((cardLeftX + cardRightX) / 2, '決勝', true);

  // ---- 選手行の背景（縞）----
  for (let i = 0; i < halfSlots; i++) {
    if (i % 2 === 0) continue;
    const y = nodeY(0, i) - ROW_H / 2;
    ctx.fillStyle = COL.slate50;
    ctx.fillRect(leftNameX, y, NAME_W, ROW_H);
    ctx.fillRect(rightNameEndX, y, NAME_W, ROW_H);
  }

  // ---- ブラケット線・スコアの組み立て ----
  const segs: Seg[] = [];
  const tags: Tag[] = [];

  /** スコア文字列を上側／下側に割り当てる（player1 が上とは限らないので entryId で判定） */
  const parseScore = (
    match: Match | undefined,
    topId: string | null,
    botId: string | null,
  ): { top: string; bot: string } | null => {
    if (!match || !match.score) return null;
    const parts = match.score.split('-');
    if (parts.length !== 2) return null;
    const a = parts[0].replace(/\(.*?\)/g, '').trim();
    const b = parts[1].replace(/\(.*?\)/g, '').trim();
    if (!a && !b) return null;
    const p1IsBot = !!match.player1EntryId && match.player1EntryId === botId;
    const p1IsTop = !!match.player1EntryId && match.player1EntryId === topId;
    if (p1IsBot && !p1IsTop) return { top: b, bot: a };
    return { top: a, bot: b };
  };

  for (const side of ['L', 'R'] as Side[]) {
    for (let r = 1; r <= halfRounds; r++) {
      const half = halfSlots / 2 ** r;           // 片側のこのラウンドの試合数
      for (let m = 0; m < half; m++) {
        const gIdx = side === 'L' ? m : half + m; // ドロー全体でのインデックス
        const xChild = joinX(side, r - 1);
        const xJoin = joinX(side, r);
        const yTop = nodeY(r - 1, 2 * m);
        const yBot = nodeY(r - 1, 2 * m + 1);
        const yMid = nodeY(r, m);

        const parent = resolve(r, gIdx);
        const top = resolve(r - 1, 2 * gIdx);
        const bot = resolve(r - 1, 2 * gIdx + 1);
        const winTop = !!parent?.entryId && parent.entryId === top?.entryId;
        const winBot = !!parent?.entryId && parent.entryId === bot?.entryId;

        // BYE（不戦）側の枝は薄くしてブラケットの流れを読みやすくする
        const dimTop = !top || top.isBye;
        const dimBot = !bot || bot.isBye;
        segs.push({ x1: xChild, y1: yTop, x2: xJoin, y2: yTop, win: winTop, dim: dimTop });
        segs.push({ x1: xChild, y1: yBot, x2: xJoin, y2: yBot, win: winBot, dim: dimBot });
        segs.push({ x1: xJoin, y1: yTop, x2: xJoin, y2: yMid, win: winTop, dim: dimTop });
        segs.push({ x1: xJoin, y1: yMid, x2: xJoin, y2: yBot, win: winBot, dim: dimBot });

        // スコア
        const match = matchMap.get(`${r}-${gIdx + 1}`);
        const align: CanvasTextAlign = side === 'L' ? 'left' : 'right';
        const sx = side === 'L' ? xJoin + 5 : xJoin - 5;
        const sc = parseScore(match, top?.entryId ?? null, bot?.entryId ?? null);
        if (sc) {
          if (sc.top) tags.push({ x: sx, y: yTop - 8, text: sc.top, align, win: winTop });
          if (sc.bot) tags.push({ x: sx, y: yBot - 8, text: sc.bot, align, win: winBot });
        } else if (match?.status === 'walkover') {
          tags.push({ x: sx, y: yMid - 9, text: 'W.O', align, win: false });
        }
      }
    }
  }

  // 決勝への接続（左右の山 → 中央の優勝カード）
  const finL = resolve(totalRounds - 1, 0);
  const finR = resolve(totalRounds - 1, 1);
  const winL = !!champNode?.entryId && champNode.entryId === finL?.entryId;
  const winR = !!champNode?.entryId && champNode.entryId === finR?.entryId;
  segs.push({ x1: joinX('L', halfRounds), y1: finalY, x2: cardLeftX, y2: finalY, win: winL });
  segs.push({ x1: joinX('R', halfRounds), y1: finalY, x2: cardRightX, y2: finalY, win: winR });

  // 通常線 → 勝ち上がり線 の順に描画して、赤いラインが必ず前面に出るようにする
  ctx.lineCap = 'round';
  for (const s of segs) {
    if (s.win) continue;
    drawLine(ctx, s.x1, s.y1, s.x2, s.y2, s.dim ? COL.slate200 : COL.slate300, s.dim ? 1 : 1.4);
  }
  for (const s of segs) {
    if (!s.win) continue;
    drawLine(ctx, s.x1, s.y1, s.x2, s.y2, COL.win, 2.6);
  }
  ctx.lineCap = 'butt';

  // スコア
  for (const t of tags) {
    drawText(ctx, t.text, t.x, t.y, t.win ? 12 : 11, t.align, t.win ? COL.win : COL.slate400, t.win ? 'bold' : 'medium');
  }

  // ---- 選手行 ----
  const champEntryId = champNode?.entryId ?? null;
  const drawSlotRow = (side: Side, i: number) => {
    const pos = side === 'L' ? i + 1 : halfSlots + i + 1;
    const slot = slotMap.get(pos);
    const cy = nodeY(0, i);
    const x0 = side === 'L' ? leftNameX : rightNameEndX;

    // 番号
    drawText(ctx, String(pos), x0 + 20, cy, 11, 'right', COL.slate400, 'medium');

    if (!slot) return;

    // シードバッジ
    if (hasSeed && slot.seed > 0) {
      const d = 18;
      const sx = x0 + 24;
      const sy = cy - d / 2;
      const g = ctx.createLinearGradient(sx, sy, sx, sy + d);
      g.addColorStop(0, COL.gold1);
      g.addColorStop(1, COL.gold3);
      roundRect(ctx, sx, sy, d, d, d / 2, g);
      drawText(ctx, String(slot.seed), sx + d / 2, sy + d / 2 + 0.5, 10.5, 'center', COL.white, 'black');
    }

    const nameX = x0 + NUM_W;
    const nameMaxW = NAME_W - NUM_W - 12;

    if (slot.isBye) {
      drawText(ctx, 'bye', nameX, cy, 12.5, 'left', COL.slate300, 'medium', nameMaxW);
      return;
    }

    const isChamp = !!champEntryId && slot.entryId === champEntryId;
    ctx.font = fontOf(isChamp ? 'black' : 'bold', NAME_PX);
    const nameW = Math.min(ctx.measureText(slot.name).width, nameMaxW);
    drawText(ctx, slot.name, nameX, cy, NAME_PX, 'left', isChamp ? COL.win : COL.slate800, isChamp ? 'black' : 'bold', nameMaxW);

    if (slot.affiliation) {
      const affX = nameX + nameW + 5;
      const affMaxW = x0 + NAME_W - 10 - affX;
      if (affMaxW > 16) {
        drawText(ctx, `（${slot.affiliation}）`, affX, cy + 0.5, AFF_PX, 'left', COL.slate500, 'normal', affMaxW);
      }
    }
  };
  for (let i = 0; i < halfSlots; i++) {
    drawSlotRow('L', i);
    drawSlotRow('R', i);
  }

  // ---- 中央: 優勝カード ----
  const cardY = finalY - CARD_H / 2;
  const hasChamp = !!champEntryId;
  ctx.save();
  ctx.shadowColor = hasChamp ? 'rgba(180, 83, 9, 0.26)' : 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, cardLeftX, cardY, CARD_W, CARD_H, 14, COL.white);
  ctx.restore();
  const cardGrad = ctx.createLinearGradient(cardLeftX, cardY, cardLeftX, cardY + CARD_H);
  if (hasChamp) {
    cardGrad.addColorStop(0, '#fffbeb');
    cardGrad.addColorStop(1, '#fff7ed');
  } else {
    cardGrad.addColorStop(0, COL.slate50);
    cardGrad.addColorStop(1, COL.white);
  }
  roundRect(ctx, cardLeftX, cardY, CARD_W, CARD_H, 14, cardGrad, hasChamp ? COL.gold2 : COL.slate200, 1.8);

  // 「優勝」ピル
  const pillW = 64;
  const pillH = 22;
  const pillX = cardLeftX + (CARD_W - pillW) / 2;
  const pillY = cardY + 11;
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
  if (hasChamp) {
    pillGrad.addColorStop(0, COL.gold1);
    pillGrad.addColorStop(1, COL.gold3);
  } else {
    pillGrad.addColorStop(0, COL.slate300);
    pillGrad.addColorStop(1, COL.slate400);
  }
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2, pillGrad);
  drawText(ctx, '優勝', pillX + pillW / 2, pillY + pillH / 2 + 0.5, 12, 'center', COL.white, 'black');

  const champNameY = champAff ? cardY + 55 : cardY + 60;
  drawText(ctx, champName, cardLeftX + CARD_W / 2, champNameY, 17, 'center',
    hasChamp ? COL.goldText : COL.slate400, 'black', CARD_W - 20);
  if (champAff) {
    drawText(ctx, `（${champAff}）`, cardLeftX + CARD_W / 2, cardY + 73, AFF_PX, 'center', COL.slate500, 'normal', CARD_W - 20);
  }
  // 決勝スコアは優勝者から見た向き（例:「8-2」）に揃える
  const finalScoreText = (() => {
    if (!finalMatch) return '';
    if (!finalMatch.score) return finalMatch.status === 'walkover' ? 'W.O' : '';
    const parts = finalMatch.score.split('-');
    const loserIsP1 = !!champEntryId
      && !!finalMatch.player1EntryId
      && finalMatch.player1EntryId !== champEntryId;
    if (loserIsP1 && parts.length === 2) {
      return `${parts[1].trim()}-${parts[0].trim()}`;
    }
    return finalMatch.score;
  })();
  if (finalScoreText) {
    drawText(ctx, finalScoreText, cardLeftX + CARD_W / 2, cardY + CARD_H - 13, 13, 'center', COL.win, 'bold', CARD_W - 20);
  }

  // ---- フッター（左: シード一覧 / 右: 協会ロゴ） ----
  const footerY = bracketAreaY + bracketH + 8;
  if (seedLines.length > 0) {
    let y = footerY + seedPx / 2 + 4;
    for (const line of seedLines) {
      drawText(ctx, line, paddingX + 4, y, seedPx, 'left', COL.slate500, 'medium');
      y += seedPx + 6;
    }
  }
  if (logos.tcta && tcta.w > 0) {
    ctx.drawImage(logos.tcta, paddingX + tableW - tcta.w, footerY, tcta.w, tcta.h);
  }

  return canvas;
}

// ===== Canvas リーグ表描画 (JPEG) =====

export async function exportRoundRobinResultAsJpeg(opts: ResultExportOptions): Promise<void> {
  const canvas = await renderRoundRobinResultCanvas(opts);
  if (!canvas) return;
  downloadCanvasAsJpeg(canvas, buildEventResultFileName(opts));
}

/**
 * 種目の結果画像をデータURLとして生成する（プレビュー用）。
 * ドロー形式に応じてトーナメント表／リーグ表を描き分ける。
 */
export async function generateEventResultDataUrl(opts: ResultExportOptions): Promise<string | null> {
  const canvas = opts.draw.drawType === 'roundRobin'
    ? await renderRoundRobinResultCanvas(opts)
    : await renderTournamentResultCanvas(opts);
  if (!canvas) return null;
  return canvas.toDataURL('image/jpeg', 0.95);
}

/** リーグ表の結果を Canvas に描画して返す（選手が2人未満なら null） */
export async function renderRoundRobinResultCanvas(opts: ResultExportOptions): Promise<HTMLCanvasElement | null> {
  const { tournament, event, draw, matches, entries, players } = opts;
  const logos = await loadResultLogos();
  const slotMap = buildSlotMap(draw, entries, players);

  // BYE以外の選手
  const playerSlots = draw.slots
    .filter(s => !s.isBye)
    .sort((a, b) => a.position - b.position)
    .map(s => slotMap.get(s.position)!)
    .filter(Boolean);
  const n = playerSlots.length;
  if (n < 2) return null;

  // 対戦結果マトリクス
  const findMatch = (p1: SlotInfo, p2: SlotInfo): Match | undefined => {
    return matches.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  const getScore = (rowPlayer: SlotInfo, colPlayer: SlotInfo): { text: string; isWin: boolean; played: boolean } => {
    const m = findMatch(rowPlayer, colPlayer);
    if (!m || !m.winnerEntryId) return { text: '', isWin: false, played: false };
    const isWin = m.winnerEntryId === rowPlayer.entryId;
    // スコアを行プレイヤー視点で表示
    if (m.score) {
      if (m.player1EntryId === rowPlayer.entryId) {
        return { text: m.score, isWin, played: true };
      }
      // スコアを反転 "8-2" → "2-8"
      const parts = m.score.split('-');
      if (parts.length === 2) {
        return { text: `${parts[1].trim()}-${parts[0].trim()}`, isWin, played: true };
      }
      return { text: m.score, isWin, played: true };
    }
    return { text: isWin ? '○' : '●', isWin, played: true };
  };

  // 勝敗集計
  const stats = playerSlots.map(p => {
    let wins = 0, losses = 0;
    for (const other of playerSlots) {
      if (other.entryId === p.entryId) continue;
      const m = findMatch(p, other);
      if (m?.winnerEntryId) {
        if (m.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
    }
    return { wins, losses };
  });

  // 順位
  const rankings = playerSlots.map((_, i) => i);
  rankings.sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    return stats[a].losses - stats[b].losses;
  });
  const rankMap = new Map<number, number>();
  rankings.forEach((pi, ri) => rankMap.set(pi, ri + 1));

  // ---- レイアウト ----
  const meas = document.createElement('canvas').getContext('2d')!;
  let maxNameW = 0;
  for (const p of playerSlots) {
    meas.font = fontOf('bold', 14);
    let w = meas.measureText(p.name).width;
    if (p.affiliation) {
      meas.font = fontOf('normal', 11.5);
      w += 5 + meas.measureText(`（${p.affiliation}）`).width;
    }
    if (w > maxNameW) maxNameW = w;
  }

  const CELL_W = 96;
  const NAME_W = clamp(maxNameW + 46, 220, 420);
  const ROW_H = 46;
  const HDR_H = 44;
  const STAT_W = 88;
  const RANK_W = 72;

  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110;
  const sidePad = 22;

  const gridW = NAME_W + n * CELL_W + STAT_W + RANK_W;
  const gridH = HDR_H + n * ROW_H;
  const tableW = Math.max(gridW + sidePad * 2, 820);

  const cardTopPad = 18;
  const cardBottomPad = 18;
  const cardH = gridH + cardTopPad + cardBottomPad;

  const tcta = fitLogo(logos.tcta, Math.min(360, tableW * 0.4), 80);
  const footerH = tcta.h + 10;

  const totalW = tableW + paddingX * 2;
  const totalH = paddingY + headerH + cardH + footerH + 14;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, totalW, totalH);
  drawTopAccentBar(ctx, totalW);

  // ---- ヘッダー（トーナメント表と共通） ----
  drawResultHeader(ctx, {
    title: event.name,
    tournamentName: tournament.name,
    venue: tournament.venue,
    paddingX,
    paddingY,
    tableW,
    headerH,
    logos,
  });

  // ---- カード ----
  const cardY = paddingY + headerH;
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, paddingX, cardY, tableW, cardH, 18, COL.white);
  ctx.restore();
  roundRect(ctx, paddingX, cardY, tableW, cardH, 18, undefined, COL.sky200, 1.5);

  const gridX = paddingX + (tableW - gridW) / 2;
  const gridY = cardY + cardTopPad;

  // ヘッダー行の背景
  const hdrGrad = ctx.createLinearGradient(gridX, gridY, gridX, gridY + HDR_H);
  hdrGrad.addColorStop(0, COL.sky100);
  hdrGrad.addColorStop(1, COL.sky50);
  roundRect(ctx, gridX, gridY, gridW, HDR_H, 10, hdrGrad);
  // ヘッダー下部は角丸にしない
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(gridX, gridY + HDR_H - 10, gridW, 10);

  const statX = gridX + NAME_W + n * CELL_W;
  const rankX = statX + STAT_W;

  // 行の縞
  for (let row = 0; row < n; row++) {
    if (row % 2 === 0) continue;
    ctx.fillStyle = COL.slate50;
    ctx.fillRect(gridX, gridY + HDR_H + row * ROW_H, gridW, ROW_H);
  }

  // ヘッダーテキスト（列名 = 選手名）
  for (let i = 0; i < n; i++) {
    const cx = gridX + NAME_W + i * CELL_W + CELL_W / 2;
    drawText(ctx, playerSlots[i].name, cx, gridY + HDR_H / 2, 12, 'center', COL.sky800, 'bold', CELL_W - 8);
  }
  drawText(ctx, '勝敗', statX + STAT_W / 2, gridY + HDR_H / 2, 12, 'center', COL.sky800, 'black');
  drawText(ctx, '順位', rankX + RANK_W / 2, gridY + HDR_H / 2, 12, 'center', COL.sky800, 'black');

  // 罫線（縦）
  for (let i = 0; i <= n; i++) {
    const x = gridX + NAME_W + i * CELL_W;
    drawLine(ctx, x, gridY, x, gridY + gridH, COL.slate200, 1);
  }
  drawLine(ctx, statX + STAT_W, gridY, statX + STAT_W, gridY + gridH, COL.slate200, 1);
  // 罫線（横）
  drawLine(ctx, gridX, gridY + HDR_H, gridX + gridW, gridY + HDR_H, COL.sky200, 1.5);
  for (let row = 1; row < n; row++) {
    const y = gridY + HDR_H + row * ROW_H;
    drawLine(ctx, gridX, y, gridX + gridW, y, COL.slate200, 1);
  }
  roundRect(ctx, gridX, gridY, gridW, gridH, 10, undefined, COL.sky200, 1.5);

  // データ行
  for (let row = 0; row < n; row++) {
    const y = gridY + HDR_H + row * ROW_H;
    const cy = y + ROW_H / 2;
    const p = playerSlots[row];
    const rank = rankMap.get(row);
    const s = stats[row];
    const played = s.wins > 0 || s.losses > 0;

    // 番号
    drawText(ctx, String(row + 1), gridX + 20, cy, 11, 'right', COL.slate400, 'medium');
    // 選手名 + 所属
    const nameX = gridX + 28;
    ctx.font = fontOf('bold', 14);
    const nameW = Math.min(ctx.measureText(p.name).width, NAME_W - 40);
    drawText(ctx, p.name, nameX, cy, 14, 'left', COL.slate800, 'bold', NAME_W - 40);
    if (p.affiliation) {
      const affX = nameX + nameW + 5;
      const affMaxW = gridX + NAME_W - 10 - affX;
      if (affMaxW > 16) {
        drawText(ctx, `（${p.affiliation}）`, affX, cy + 0.5, 11.5, 'left', COL.slate500, 'normal', affMaxW);
      }
    }

    // 対戦結果セル
    for (let col = 0; col < n; col++) {
      const cellX = gridX + NAME_W + col * CELL_W;
      const cx = cellX + CELL_W / 2;
      if (row === col) {
        ctx.fillStyle = COL.slate100;
        ctx.fillRect(cellX + 1, y + 1, CELL_W - 2, ROW_H - 2);
        drawLine(ctx, cellX + 1, y + 1, cellX + CELL_W - 1, y + ROW_H - 1, COL.slate300, 1.2);
        continue;
      }
      const result = getScore(p, playerSlots[col]);
      if (!result.played) {
        drawText(ctx, '—', cx, cy, 12, 'center', COL.slate300, 'normal');
        continue;
      }
      if (result.isWin) {
        const pw = Math.min(CELL_W - 20, 56);
        roundRect(ctx, cx - pw / 2, cy - 12, pw, 24, 12, COL.sky100, COL.sky200, 1);
      }
      drawText(ctx, result.text, cx, cy, 13, 'center', result.isWin ? COL.sky700 : COL.slate500, result.isWin ? 'black' : 'medium');
    }

    // 勝敗
    if (played) {
      drawText(ctx, `${s.wins}-${s.losses}`, statX + STAT_W / 2, cy, 14, 'center', COL.slate700, 'bold');
    }

    // 順位
    if (rank && played) {
      const isTop = rank === 1;
      if (isTop) {
        const bw = 44;
        const bh = 24;
        const bx = rankX + (RANK_W - bw) / 2;
        const by = cy - bh / 2;
        const g = ctx.createLinearGradient(bx, by, bx, by + bh);
        g.addColorStop(0, COL.gold1);
        g.addColorStop(1, COL.gold3);
        roundRect(ctx, bx, by, bw, bh, bh / 2, g);
        drawText(ctx, '1位', rankX + RANK_W / 2, cy + 0.5, 13, 'center', COL.white, 'black');
      } else {
        drawText(ctx, `${rank}位`, rankX + RANK_W / 2, cy, 14, 'center', COL.slate600, 'bold');
      }
    }
  }

  // ---- フッター（右下に協会ロゴ） ----
  if (logos.tcta && tcta.w > 0) {
    ctx.drawImage(logos.tcta, paddingX + tableW - tcta.w, cardY + cardH + 8, tcta.w, tcta.h);
  }

  return canvas;
}

// ===== Excel トーナメント結果出力 =====

export function exportTournamentResultAsExcel(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);
  const matchMap = buildMatchMap(matches);
  const drawSize = draw.drawSize;
  const totalRounds = Math.log2(drawSize);

  const data: (string | null)[][] = [];
  const bodyHeight = drawSize * 2 - 1;

  // ヘッダー
  data.push([event.name, null, null, null, null, tournament.name]);
  data.push([]);

  // 本体グリッド
  // 列: No | 選手名 | 所属 | R1ブラケット | R1スコア | ... | 勝者
  const numCols = 3 + totalRounds * 2 + 1;
  const grid: (string | null)[][] = [];
  for (let row = 0; row < bodyHeight; row++) {
    const r: (string | null)[] = [];
    for (let col = 0; col < numCols; col++) r.push(null);
    grid.push(r);
  }

  // 1回戦スロット
  for (let i = 0; i < drawSize; i++) {
    const row = Math.round(getSlotRow(0, i));
    const slot = slotMap.get(i + 1);
    if (slot) {
      grid[row][0] = String(i + 1);
      grid[row][1] = slot.isBye ? 'bye' : slot.name;
      grid[row][2] = slot.isBye ? '' : (slot.affiliation ? `（${slot.affiliation}）` : '');
    }
  }

  // 各ラウンド
  for (let round = 1; round <= totalRounds; round++) {
    const numMatches = drawSize / Math.pow(2, round);
    const bracketCol = 3 + (round - 1) * 2;
    const scoreCol = bracketCol + 1;

    for (let m = 0; m < numMatches; m++) {
      const topRow = Math.round(getSlotRow(round - 1, m * 2));
      const botRow = Math.round(getSlotRow(round - 1, m * 2 + 1));
      const midRow = Math.round(getSlotRow(round, m));

      const match = matchMap.get(`${round}-${m + 1}`);

      // ブラケット文字
      grid[topRow][bracketCol] = '─┐';
      grid[botRow][bracketCol] = '─┘';
      for (let r = topRow + 1; r < botRow; r++) {
        grid[r][bracketCol] = r === midRow ? ' ├─' : ' │';
      }

      // スコア・勝者
      if (match) {
        if ((match.status === 'finished' || match.status === 'walkover') && match.winnerEntryId) {
          const winnerName = match.winnerEntryId === match.player1EntryId
            ? match.player1Name : match.player2Name;
          const score = match.score || 'W.O';

          // スコアを中間行に
          grid[midRow][scoreCol] = `${winnerName}  ${score}`;

          if (round === totalRounds) {
            grid[midRow][numCols - 1] = `優勝: ${winnerName}`;
          }
        }
      } else {
        // BYE処理
        const top = getWinnerAtRound(round - 1, m * 2, slotMap, matchMap, totalRounds);
        const bot = getWinnerAtRound(round - 1, m * 2 + 1, slotMap, matchMap, totalRounds);
        if (top?.isBye && bot && !bot.isBye) {
          grid[midRow][scoreCol] = bot.name;
        } else if (bot?.isBye && top && !top.isBye) {
          grid[midRow][scoreCol] = top.name;
        }
      }
    }
  }

  for (const row of grid) data.push(row.map(c => c ?? ''));

  const ws = XLSX.utils.aoa_to_sheet(data);
  const isDoubles = event.type === 'Doubles';
  ws['!cols'] = [
    { wch: 5 },
    { wch: isDoubles ? 32 : 22 },
    { wch: 14 },
    ...Array.from({ length: totalRounds }, () => [
      { wch: 6 },
      { wch: isDoubles ? 28 : 20 },
    ]).flat(),
    { wch: isDoubles ? 28 : 22 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: numCols - 1 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));
  XLSX.writeFile(wb, `${tournament.name}_${event.name}_結果.xlsx`);
}

// ===== Excel リーグ結果出力 =====

export function exportRoundRobinResultAsExcel(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);

  const playerSlots = draw.slots
    .filter(s => !s.isBye)
    .sort((a, b) => a.position - b.position)
    .map(s => slotMap.get(s.position)!)
    .filter(Boolean);
  const n = playerSlots.length;
  if (n < 2) return;

  const findMatch = (p1: SlotInfo, p2: SlotInfo): Match | undefined => {
    return matches.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  const getScore = (rowP: SlotInfo, colP: SlotInfo): string => {
    const m = findMatch(rowP, colP);
    if (!m || !m.winnerEntryId) return '';
    if (m.score) {
      if (m.player1EntryId === rowP.entryId) return m.score;
      const parts = m.score.split('-');
      if (parts.length === 2) return `${parts[1].trim()}-${parts[0].trim()}`;
      return m.score;
    }
    return m.winnerEntryId === rowP.entryId ? '○' : '●';
  };

  const stats = playerSlots.map(p => {
    let wins = 0, losses = 0;
    for (const other of playerSlots) {
      if (other.entryId === p.entryId) continue;
      const m = findMatch(p, other);
      if (m?.winnerEntryId) {
        if (m.winnerEntryId === p.entryId) wins++; else losses++;
      }
    }
    return { wins, losses };
  });

  const rankings = playerSlots.map((_, i) => i);
  rankings.sort((a, b) => stats[b].wins !== stats[a].wins ? stats[b].wins - stats[a].wins : stats[a].losses - stats[b].losses);
  const rankMap = new Map<number, number>();
  rankings.forEach((pi, ri) => rankMap.set(pi, ri + 1));

  const data: (string | null)[][] = [];

  // ヘッダー
  data.push([event.name, ...Array(n).fill(null), tournament.name]);
  data.push([]);

  // テーブルヘッダー
  const headerRow: (string | null)[] = [''];
  for (const p of playerSlots) headerRow.push(p.name);
  headerRow.push('勝　敗', '順　位');
  data.push(headerRow);

  // データ行
  for (let row = 0; row < n; row++) {
    const p = playerSlots[row];
    const cells: (string | null)[] = [`${row + 1}  ${p.name}${p.affiliation ? `（${p.affiliation}）` : ''}`];
    for (let col = 0; col < n; col++) {
      cells.push(row === col ? '' : getScore(p, playerSlots[col]));
    }
    const s = stats[row];
    cells.push(s.wins > 0 || s.losses > 0 ? `${s.wins}-${s.losses}` : '');
    const rank = rankMap.get(row);
    cells.push(rank && (s.wins > 0 || s.losses > 0) ? `${rank}位` : '');
    data.push(cells);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 },
    ...Array(n).fill({ wch: 12 }),
    { wch: 10 },
    { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));
  XLSX.writeFile(wb, `${tournament.name}_${event.name}_結果.xlsx`);
}
