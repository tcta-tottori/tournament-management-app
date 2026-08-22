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
import type { FontWeight } from './resultCanvasKit';
import { sideScoreText } from '../score/scoreDisplay';
import {
  COL,
  clamp,
  drawLine,
  drawResultHeader,
  drawText,
  drawTopAccentBar,
  fitLogo,
  fontOf,
  getAssociationLogoEnabled,
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
  /**
   * 協会ロゴを結果画像に入れるかどうか。
   * 未指定なら保存済みの設定（getAssociationLogoEnabled）に従う。
   */
  showAssociationLogo?: boolean;
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

/** 結果画像のファイル名（ダウンロード用）。クラス（種目）名を先頭にする。 */
export function buildEventResultFileName(opts: ResultExportOptions): string {
  return `${opts.event.name}_${opts.tournament.name}_結果.jpg`;
}

export async function exportTournamentResultAsJpeg(opts: ResultExportOptions): Promise<void> {
  const canvas = await renderTournamentResultCanvas(opts);
  downloadCanvasAsJpeg(canvas, buildEventResultFileName(opts));
}

/** ブラケットの左右どちら側の山か */
type Side = 'L' | 'R';

/** 線分（勝ち上がりかどうかで色分けする） */
interface Seg { x1: number; y1: number; x2: number; y2: number; win: boolean }

/** スコアなどのラベル */
interface Tag { x: number; y: number; text: string; align: CanvasTextAlign; win: boolean; size?: number }

/**
 * トーナメント表の結果を Canvas に描画して返す。
 *
 * ドローを上半分（左の山）と下半分（右の山）に分け、中央で決勝を突き合わせる
 * 「左右2山」のレイアウトで描画する。縦長になりすぎず、紙のトーナメント表と
 * 同じ感覚で結果を追える。
 *
 * BYE（不戦勝）のスロットは紙のトーナメント表と同じく表示せず、
 * 相手選手のラインをそのまま次のラウンドへ通す。
 */
export async function renderTournamentResultCanvas(opts: ResultExportOptions): Promise<HTMLCanvasElement> {
  const { tournament, event, draw, entries, players, matches } = opts;
  const logos = await loadResultLogos();
  const showLogo = (opts.showAssociationLogo ?? getAssociationLogoEnabled()) && !!logos.tcta;

  const slotMap = buildSlotMap(draw, entries, players);
  const matchMap = buildMatchMap(matches);

  // ドローサイズは 2 のべき乗として扱う
  const totalRounds = Math.max(1, Math.round(Math.log2(Math.max(2, draw.drawSize))));
  const drawSize = 2 ** totalRounds;
  const halfSlots = drawSize / 2;   // 片側の選手行数
  const halfRounds = totalRounds - 1; // 片側のブラケット列数（決勝は中央）
  const isDoubles = event.type === 'Doubles';

  // ---- 各ノードの進出者（BYE自動進出も解決する） ----
  type BracketNode = { name: string; entryId: string | null; isBye: boolean } | null;
  const winnerCache = new Map<string, BracketNode>();
  const resolve = (round: number, index: number): BracketNode => {
    const key = `${round}-${index}`;
    if (!winnerCache.has(key)) {
      winnerCache.set(key, getWinnerAtRound(round, index, slotMap, matchMap, totalRounds));
    }
    return winnerCache.get(key)!;
  };

  /** 配下がすべて BYE のノード（＝線を引かない枝）か */
  const emptyCache = new Map<string, boolean>();
  const isEmptyNode = (round: number, index: number): boolean => {
    const key = `${round}-${index}`;
    const hit = emptyCache.get(key);
    if (hit !== undefined) return hit;
    const v = round === 0
      ? (slotMap.get(index + 1)?.isBye ?? true)
      : isEmptyNode(round - 1, index * 2) && isEmptyNode(round - 1, index * 2 + 1);
    emptyCache.set(key, v);
    return v;
  };

  /**
   * 実際の対戦に勝ったことがある選手。
   * BYE で勝ち上がっただけの枝に勝ち上がり線（赤）を引くと、
   * 一度も勝っていない選手にも赤線が付いてしまうため、
   * 「相手のいる試合に勝った」選手だけを赤線の対象にする。
   */
  const realWinnerIds = new Set<string>();
  for (const m of matches) {
    if (!m.winnerEntryId) continue;
    if (!m.player1EntryId || !m.player2EntryId) continue; // BYE 戦は勝ちに数えない
    realWinnerIds.add(m.winnerEntryId);
  }
  const hasRealWin = (node: { entryId: string | null } | null): boolean =>
    !!node?.entryId && realWinnerIds.has(node.entryId);

  // entryId → 所属 の逆引き（優勝者の所属表示用）
  const affById = new Map<string, string>();
  for (const s of slotMap.values()) {
    if (s.entryId) affById.set(s.entryId, s.affiliation);
  }

  const hasSeed = draw.slots.some(s => s.seed > 0 && !s.isBye);

  // ---- 事前計測（選手名の最大幅からネーム列の幅を決める） ----
  const meas = document.createElement('canvas').getContext('2d')!;
  const NAME_PX = 14;
  const AFF_PX = 11.5;
  let maxNameW = 0;
  for (let p = 1; p <= drawSize; p++) {
    const s = slotMap.get(p);
    if (!s || s.isBye) continue;
    meas.font = fontOf('bold', NAME_PX);
    let w = meas.measureText(s.name).width;
    if (s.affiliation) {
      meas.font = fontOf('normal', AFF_PX);
      w += 5 + meas.measureText(`（${s.affiliation}）`).width;
    }
    if (w > maxNameW) maxNameW = w;
  }
  const NUM_W = hasSeed ? 46 : 26;         // 番号（＋シードバッジ）の幅
  const NAME_W = clamp(maxNameW + NUM_W + 16, 210, isDoubles ? 470 : 380);

  // 行の高さはドローサイズに応じて調整（大きいドローでも縦に伸びすぎないように）
  const ROW_H = halfSlots >= 24 ? 36 : halfSlots >= 16 ? 42 : 46;
  // スコアは合流点（縦線の中央）を挟んで上下に置く。
  // 2回戦以降は上下のラインが大きく離れるため、それぞれのラインに寄せると
  // 上下のスコアが遠く離れて対戦結果として読み取りにくい。
  // どのラウンドでも 1回戦と同じ間隔で並ぶように、合流点からの
  // オフセットを固定する（1回戦のラインからの距離＝SCORE_LINE_GAP と一致する）。
  const SCORE_LINE_GAP = clamp(ROW_H / 2 - 8, 7, 13);
  // スコアの文字サイズ（大きめに出して結果を読み取りやすくする）
  const SCORE_PX = 16;
  // 上下のスコアが重ならないよう、文字サイズ分の間隔は必ず確保する
  const SCORE_OFFSET = Math.max(SCORE_PX * 0.62, ROW_H / 2 - SCORE_LINE_GAP);
  // タイブレーク得点・Ret / W.O の注記（負けた側のスコアの外側に添える）
  const NOTE_PX = 13;
  const NOTE_GAP = 15;

  // ---- 1ラウンド分の横幅 ----
  // 回戦ラベルを出さなくなったので、スコア（Ret / W.O・タイブレーク得点を含む）が
  // 次の列の線に被らない範囲まで詰める。
  const scoreTokenW = (() => {
    let w = 0;
    const put = (text: string, px: number, weight: FontWeight) => {
      if (!text) return;
      meas.font = fontOf(weight, px);
      w = Math.max(w, meas.measureText(text).width);
    };
    for (const m of matches) {
      const raw = (m.score || '').trim();
      if (!raw) {
        if (m.status === 'walkover') put('W.O', SCORE_PX, 'bold');
        continue;
      }
      const one = raw.match(/^(\d+)\s*-\s*(\d+)(?:\s*\((\d+)\))?(?:\s*(Ret\.?|W\.?O\.?))?$/i);
      if (one) {
        put(one[1], SCORE_PX, 'black');
        put(one[2], SCORE_PX, 'black');
        if (one[3]) put(`(${one[3]})`, NOTE_PX, 'medium');
        if (one[4]) put(one[4], NOTE_PX, 'medium');
      } else {
        for (const part of raw.split('-')) put(part.replace(/\(.*?\)/g, '').trim(), SCORE_PX, 'black');
      }
    }
    return w;
  })();
  const COL_W = clamp(Math.ceil(scoreTokenW) + 20, 44, 74);

  // ---- 選手行の割り当て（BYE の空きを詰める） ----
  // BYE のスロットにも1行ずつ確保すると、ドロー表どおりに並べたときに
  // 大きな空白ができてしまう。BYE だけの対戦枠は行を消費せず、
  // 片方だけ BYE の枠は相手選手の1行にまとめる。
  const slotRow: number[] = new Array(drawSize).fill(0);
  const halfRows = [0, 0];   // 左右それぞれで使った行数
  for (let side = 0; side < 2; side++) {
    const base = side * halfSlots;
    let row = 0;
    for (let m = 0; m < halfSlots / 2; m++) {
      const t = base + m * 2;
      const b = t + 1;
      const tb = slotMap.get(t + 1)?.isBye ?? true;
      const bb = slotMap.get(b + 1)?.isBye ?? true;
      if (tb && bb) {
        slotRow[t] = row; slotRow[b] = row;          // 行は使わない
      } else if (tb || bb) {
        slotRow[t] = row; slotRow[b] = row; row += 1; // 相手の1行にまとめる
      } else {
        slotRow[t] = row; slotRow[b] = row + 1; row += 2;
      }
    }
    halfRows[side] = row;
  }
  // 行数が少ない側は上下中央に寄せて、左右の山の高さを揃える
  const maxRows = Math.max(halfRows[0], halfRows[1], 1);
  const halfOffset = [
    ((maxRows - halfRows[0]) / 2) * ROW_H,
    ((maxRows - halfRows[1]) / 2) * ROW_H,
  ];

  // ---- 各ノードのY座標（rowsTopY からの相対値） ----
  // BYE だけの枝は「無いもの」として扱い、相手のラインをまっすぐ通す。
  const yCache = new Map<string, number>();
  const nodeYRel = (round: number, index: number): number => {
    const key = `${round}-${index}`;
    const hit = yCache.get(key);
    if (hit !== undefined) return hit;
    let v: number;
    if (round === 0) {
      const side = index < halfSlots ? 0 : 1;
      v = slotRow[index] * ROW_H + ROW_H / 2 + halfOffset[side];
    } else {
      const a = nodeYRel(round - 1, index * 2);
      const b = nodeYRel(round - 1, index * 2 + 1);
      const ea = isEmptyNode(round - 1, index * 2);
      const eb = isEmptyNode(round - 1, index * 2 + 1);
      v = ea && !eb ? b : eb && !ea ? a : (a + b) / 2;
    }
    yCache.set(key, v);
    return v;
  };

  // 決勝（左右の山の合流点）
  const champNode = resolve(totalRounds, 0);
  const champEntryId = champNode?.entryId ?? null;
  const finalMatch = matchMap.get(`${totalRounds}-1`);
  const finL = resolve(totalRounds - 1, 0);
  const finR = resolve(totalRounds - 1, 1);
  const yLRel = nodeYRel(totalRounds - 1, 0);
  const yRRel = nodeYRel(totalRounds - 1, 1);
  const emptyFinL = isEmptyNode(totalRounds - 1, 0);
  const emptyFinR = isEmptyNode(totalRounds - 1, 1);
  // 決勝の合流点は左右の山の中間に置く（他の回戦の合流点と同じ決め方）。
  // 高い方に合わせると、優勝者へ立ち上がる線がその山の線とそのまま繋がり、
  // もう一方の山の線だけがずれて見えてしまう。
  const apexRel = nodeYRel(totalRounds, 0);

  // ---- 中央の優勝表示（カードではなく、中央から立ち上がる線＋テキスト） ----
  const champName = champNode && !champNode.isBye ? champNode.name : '';
  const champAff = champEntryId ? (affById.get(champEntryId) || '') : '';
  const CHAMP_NAME_PX = 20;
  const CHAMP_SCORE_PX = 19;

  // 決勝スコアは「左山の獲得ゲーム − 右山の獲得ゲーム」の並びで表示する
  // （例: 右山の選手が 8-4 で勝った場合は「4-8」）
  // タイブレークの得点と Ret / W.O は負けた側のものなので、
  // 負けた側の外側（スコアの左端／右端）に小さく添える。
  const finalScore = (() => {
    const empty = { main: '', note: '', noteLeft: false };
    if (!finalMatch) return empty;
    if (!finalMatch.score) {
      return finalMatch.status === 'walkover' ? { ...empty, main: 'W.O' } : empty;
    }
    const raw = finalMatch.score.trim();
    const m = raw.match(/^(\d+)\s*-\s*(\d+)(?:\s*\((\d+)\))?(?:\s*(Ret\.?|W\.?O\.?))?$/i);
    if (!m) return { ...empty, main: raw };
    const [, p1Games, p2Games, tb, note] = m;
    // player1 が左山とは限らないので entryId で判定する
    const p1IsLeft = !!finalMatch.player1EntryId && finalMatch.player1EntryId === finL?.entryId;
    const leftGames = p1IsLeft ? p1Games : p2Games;
    const rightGames = p1IsLeft ? p2Games : p1Games;
    const parts = [
      tb ? `(${tb})` : '',
      note ? note.toUpperCase().replace('RET', 'Ret') : '',
    ].filter(Boolean);
    return {
      main: `${leftGames}-${rightGames}`,
      note: parts.join(' '),
      noteLeft: Number(leftGames) < Number(rightGames),  // 負けた側が左なら左端へ
    };
  })();
  const finalScoreText = finalScore.main;

  meas.font = fontOf('black', CHAMP_NAME_PX);
  let champTextW = meas.measureText(champName).width;
  if (champAff) {
    meas.font = fontOf('normal', 12);
    champTextW = Math.max(champTextW, meas.measureText(`（${champAff}）`).width);
  }
  // 優勝表示の左右幅。名前が収まる分だけにして、左右の山の間の余白を詰める。
  const CENTER_W = clamp(champTextW + 36, 196, 430);

  // 優勝表示ブロックの高さ（合流点から WINNER バッジ上端まで／描画側と同じ積み上げ）
  const CHAMP_TICK = 9;
  const CHAMP_CHIP_H = 20;
  const champBlockH = champName
    ? CHAMP_TICK + 2
      + (finalScoreText ? CHAMP_SCORE_PX + 4 : 0)
      + (champAff ? 15 : 0)
      + CHAMP_NAME_PX + 5 + CHAMP_CHIP_H
    : 0;

  // ---- 全体レイアウト ----
  const paddingX = 30;
  const paddingY = 26;
  const headerH = 110;
  const sidePad = 22;

  const contentW = NAME_W * 2 + halfRounds * COL_W * 2 + CENTER_W;
  const tableW = Math.max(contentW + sidePad * 2, 820);

  // ラウンドラベル（枠上端から 37px）と優勝表示が重ならないだけの上部余白を確保する
  // 回戦ラベルは表示しないので、上部は最小限の余白でよい
  const bracketTopPad = champBlockH > 0
    ? Math.max(18, Math.ceil(champBlockH + 18 - apexRel))
    : 18;
  const bracketBodyH = maxRows * ROW_H;   // BYE を詰めた実際の高さ

  // 中央下部（枠内）に置く協会ロゴ
  const centerLogo = showLogo
    ? fitLogo(logos.tcta, Math.min(CENTER_W - 24, 300), 76)
    : { w: 0, h: 0 };
  const spaceBelowApex = bracketBodyH - apexRel;
  const bracketBottomPad = Math.max(16, Math.ceil(centerLogo.h + 24 - spaceBelowApex));
  const bracketH = bracketTopPad + bracketBodyH + bracketBottomPad;

  // ---- フッター（シード一覧） ----
  const seedItems = draw.slots
    .filter(s => s.seed > 0 && !s.isBye)
    .sort((a, b) => a.seed - b.seed)
    .map(s => `${s.seed}.${slotMap.get(s.position)?.name ?? ''}`)
    .filter(t => !t.endsWith('.'));
  const seedPx = 12;
  const seedLines = wrapItems(meas, 'シード　', seedItems, tableW - 24, seedPx, 2);
  const footerH = seedLines.length > 0 ? seedLines.length * (seedPx + 6) + 8 : 4;

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
  roundRect(ctx, paddingX, bracketAreaY, tableW, bracketH, 18, undefined, COL.gray200, 1.5);

  // ---- 座標計算 ----
  const contentX = paddingX + (tableW - contentW) / 2;
  const leftNameX = contentX;
  const leftNameEndX = leftNameX + NAME_W;
  const apexLX = leftNameEndX + halfRounds * COL_W;
  const apexRX = apexLX + CENTER_W;
  const rightNameEndX = apexRX + halfRounds * COL_W;
  const centerX = (apexLX + apexRX) / 2;

  const rowsTopY = bracketAreaY + bracketTopPad;
  const nodeY = (round: number, index: number) => rowsTopY + nodeYRel(round, index);
  /** ラウンド r の合流点 X（r=0 はネーム列の端） */
  const joinX = (side: Side, r: number): number =>
    side === 'L' ? leftNameEndX + r * COL_W : rightNameEndX - r * COL_W;
  const apexY = rowsTopY + apexRel;

  // ---- 選手行の背景（縞）----
  // BYE を詰めたあとの実際の行で1行おきに敷く
  ctx.fillStyle = COL.gray50;
  for (let i = 0; i < drawSize; i++) {
    if (slotMap.get(i + 1)?.isBye ?? true) continue;
    if (slotRow[i] % 2 === 0) continue;
    const y = nodeY(0, i) - ROW_H / 2;
    ctx.fillRect(i < halfSlots ? leftNameX : rightNameEndX, y, NAME_W, ROW_H);
  }

  // ---- ブラケット線・スコアの組み立て ----
  const segs: Seg[] = [];
  const tags: Tag[] = [];

  /**
   * スコア文字列を上側／下側に割り当てる（player1 が上とは限らないので entryId で判定）。
   * タイブレークの得点と Ret / W.O は、負けた側に添える注記として別に返す。
   */
  const parseScore = (
    match: Match | undefined,
    topId: string | null,
    botId: string | null,
  ): { top: string; bot: string; tb?: string; note?: string } | null => {
    if (!match || !match.score) return null;
    const raw = match.score.trim();
    const p1IsBot = !!match.player1EntryId && match.player1EntryId === botId;
    const p1IsTop = !!match.player1EntryId && match.player1EntryId === topId;
    const swap = p1IsBot && !p1IsTop;

    // 1ゲームも行われていない棄権（"W.O" / "Ret" のみ）。ゲームスコアは無く注記だけ出す。
    const noteOnly = raw.match(/^(Ret\.?|W\.?\s?O\.?)$/i);
    if (noteOnly) return { top: '', bot: '', note: noteOnly[1] };

    // 「9-8(5)」「6-2 Ret」のような1セットのスコア
    const one = raw.match(/^(\d+)\s*-\s*(\d+)(?:\s*\((\d+)\))?(?:\s*(Ret\.?|W\.?O\.?))?$/i);
    if (one) {
      const [, g1, g2, tb, note] = one;
      return {
        top: swap ? g2 : g1,
        bot: swap ? g1 : g2,
        tb: tb || undefined,
        note: note || undefined,
      };
    }

    // それ以外（2セットマッチ等）は従来どおり数字だけを表示する
    const parts = raw.split('-');
    if (parts.length !== 2) return null;
    const a = parts[0].replace(/\(.*?\)/g, '').trim();
    const b = parts[1].replace(/\(.*?\)/g, '').trim();
    if (!a && !b) return null;
    return swap ? { top: b, bot: a } : { top: a, bot: b };
  };

  for (const side of ['L', 'R'] as Side[]) {
    for (let r = 1; r <= halfRounds; r++) {
      const half = halfSlots / 2 ** r;           // 片側のこのラウンドの試合数
      for (let m = 0; m < half; m++) {
        const gIdx = side === 'L' ? m : half + m; // ドロー全体でのインデックス
        if (isEmptyNode(r, gIdx)) continue;       // 中身が BYE だけの枝は描かない

        const xChild = joinX(side, r - 1);
        const xJoin = joinX(side, r);
        const emptyTop = isEmptyNode(r - 1, 2 * gIdx);
        const emptyBot = isEmptyNode(r - 1, 2 * gIdx + 1);
        const yTop = nodeY(r - 1, 2 * gIdx);
        const yBot = nodeY(r - 1, 2 * gIdx + 1);
        const yMid = nodeY(r, gIdx);

        const parent = resolve(r, gIdx);
        const top = resolve(r - 1, 2 * gIdx);
        const bot = resolve(r - 1, 2 * gIdx + 1);
        const winTop = !!parent?.entryId && parent.entryId === top?.entryId && hasRealWin(top);
        const winBot = !!parent?.entryId && parent.entryId === bot?.entryId && hasRealWin(bot);

        // BYE 側の枝は線を引かず、相手のラインをそのまま通す
        if (!emptyTop) segs.push({ x1: xChild, y1: yTop, x2: xJoin, y2: yTop, win: winTop });
        if (!emptyBot) segs.push({ x1: xChild, y1: yBot, x2: xJoin, y2: yBot, win: winBot });
        if (!emptyTop && !emptyBot) {
          segs.push({ x1: xJoin, y1: yTop, x2: xJoin, y2: yMid, win: winTop });
          segs.push({ x1: xJoin, y1: yMid, x2: xJoin, y2: yBot, win: winBot });
        }

        // 実際に対戦があった試合だけスコアを表示する（BYE の W.O は出さない）
        if (emptyTop || emptyBot) continue;
        const match = matchMap.get(`${r}-${gIdx + 1}`);
        const align: CanvasTextAlign = side === 'L' ? 'left' : 'right';
        const sx = side === 'L' ? xJoin + 6 : xJoin - 6;
        // 上下のスコアは合流点をはさんで並べる（回戦が進んでも間隔は一定）。
        // 決勝へ向かう最終列だけは、中央へ引く線の高さ（左右共通）を挟むように置く。
        const scoreCenterY = r === halfRounds ? apexY : yMid;
        const scoreTopY = scoreCenterY - SCORE_OFFSET;
        const scoreBotY = scoreCenterY + SCORE_OFFSET;
        const sc = parseScore(match, top?.entryId ?? null, bot?.entryId ?? null);
        if (sc) {
          if (sc.top) tags.push({ x: sx, y: scoreTopY, text: sc.top, align, win: winTop });
          if (sc.bot) tags.push({ x: sx, y: scoreBotY, text: sc.bot, align, win: winBot });

          // タイブレークの得点と Ret / W.O は「負けた側」に添える。
          // 中央線をはさんでスコアの外側（上側の敗者なら上、下側の敗者なら下）に置く。
          const notes = [sc.tb ? `(${sc.tb})` : '', sc.note ? sc.note.toUpperCase().replace('RET', 'Ret') : '']
            .filter(Boolean);
          const loserIsTop = winBot ? true : winTop ? false : null;
          if (notes.length > 0 && loserIsTop !== null) {
            const dir = loserIsTop ? -1 : 1;
            const baseY = (loserIsTop ? scoreTopY : scoreBotY) + dir * NOTE_GAP;
            notes.forEach((text, i) => {
              tags.push({ x: sx, y: baseY + dir * i * NOTE_GAP, text, align, win: false, size: NOTE_PX });
            });
          }
        } else if (match?.status === 'walkover') {
          // 棄権した側に W.O を表示する
          tags.push({ x: sx, y: winTop ? scoreBotY : scoreTopY, text: 'W.O', align, win: false });
        }
      }
    }
  }

  // ---- 決勝（中央で左右の山が合流し、上に立ち上がる） ----
  const winL = !!champEntryId && champEntryId === finL?.entryId && hasRealWin(finL);
  const winR = !!champEntryId && champEntryId === finR?.entryId && hasRealWin(finR);
  const yL = rowsTopY + yLRel;
  const yR = rowsTopY + yRRel;
  // 左右の山は「同じ高さ」で中央へ入れ、紙のトーナメント表と同じく
  // 決勝を1本の横線として見せる。
  // 準決勝の合流点の高さ（yL / yR）は BYE の有無で左右がずれるため、
  // それぞれの高さのまま中央へ引くと決勝の線が段違いになってしまう。
  // 高さの差は準決勝の合流線（縦線）の上で吸収する。
  const xFinL = joinX('L', halfRounds);
  const xFinR = joinX('R', halfRounds);
  // 片側がすべて BYE のときは、その山からの線は引かない
  if (!emptyFinL) {
    if (yL !== apexY) segs.push({ x1: xFinL, y1: yL, x2: xFinL, y2: apexY, win: winL });
    segs.push({ x1: xFinL, y1: apexY, x2: centerX, y2: apexY, win: winL });
  }
  if (!emptyFinR) {
    if (yR !== apexY) segs.push({ x1: xFinR, y1: yR, x2: xFinR, y2: apexY, win: winR });
    segs.push({ x1: xFinR, y1: apexY, x2: centerX, y2: apexY, win: winR });
  }
  // 優勝者へ立ち上がる縦線
  segs.push({ x1: centerX, y1: apexY, x2: centerX, y2: apexY - CHAMP_TICK, win: hasRealWin(champNode) });

  // 通常線 → 勝ち上がり線 の順に描画して、赤いラインが必ず前面に出るようにする
  ctx.lineCap = 'round';
  for (const s of segs) {
    if (s.win) continue;
    drawLine(ctx, s.x1, s.y1, s.x2, s.y2, COL.gray300, 1.4);
  }
  for (const s of segs) {
    if (!s.win) continue;
    drawLine(ctx, s.x1, s.y1, s.x2, s.y2, COL.win, 2.6);
  }
  ctx.lineCap = 'butt';

  // スコア
  for (const t of tags) {
    drawText(ctx, t.text, t.x, t.y, t.size ?? SCORE_PX, t.align, t.win ? COL.win : COL.gray500,
      t.win ? 'black' : t.size ? 'medium' : 'bold');
  }

  // ---- 選手行 ----
  const drawSlotRow = (side: Side, i: number) => {
    const pos = side === 'L' ? i + 1 : halfSlots + i + 1;
    const slot = slotMap.get(pos);
    // BYE は表示しない
    if (!slot || slot.isBye) return;

    const cy = nodeY(0, side === 'L' ? i : halfSlots + i);
    const x0 = side === 'L' ? leftNameX : rightNameEndX;

    // 番号
    drawText(ctx, String(pos), x0 + 20, cy, 11, 'right', COL.gray400, 'medium');

    // シードバッジ
    if (hasSeed && slot.seed > 0) {
      const d = 18;
      const sx = x0 + 24;
      const sy = cy - d / 2;
      const g = ctx.createLinearGradient(sx, sy, sx, sy + d);
      g.addColorStop(0, COL.champ1);
      g.addColorStop(1, COL.champ3);
      roundRect(ctx, sx, sy, d, d, d / 2, g);
      drawText(ctx, String(slot.seed), sx + d / 2, sy + d / 2 + 0.5, 10.5, 'center', COL.white, 'black');
    }

    const nameX = x0 + NUM_W;
    const nameMaxW = NAME_W - NUM_W - 12;
    const isChamp = !!champEntryId && slot.entryId === champEntryId;
    ctx.font = fontOf(isChamp ? 'black' : 'bold', NAME_PX);
    const nameW = Math.min(ctx.measureText(slot.name).width, nameMaxW);
    drawText(ctx, slot.name, nameX, cy, NAME_PX, 'left', isChamp ? COL.win : COL.gray800, isChamp ? 'black' : 'bold', nameMaxW);

    if (slot.affiliation) {
      const affX = nameX + nameW + 5;
      const affMaxW = x0 + NAME_W - 10 - affX;
      if (affMaxW > 16) {
        drawText(ctx, `（${slot.affiliation}）`, affX, cy + 0.5, AFF_PX, 'left', COL.gray500, 'normal', affMaxW);
      }
    }
  };
  for (let i = 0; i < halfSlots; i++) {
    drawSlotRow('L', i);
    drawSlotRow('R', i);
  }

  // ---- 中央上部: 優勝者名とスコア ----
  if (champName) {
    let cursor = apexY - CHAMP_TICK - 2;
    const scoreY = cursor - CHAMP_SCORE_PX / 2;
    if (finalScoreText) cursor = scoreY - CHAMP_SCORE_PX / 2 - 4;
    const affY = champAff ? cursor - 5 : cursor;
    if (champAff) cursor = affY - 5 - 5;
    const nameY = cursor - CHAMP_NAME_PX / 2;
    cursor = nameY - CHAMP_NAME_PX / 2 - 5;

    // 優勝バッジ（小さな日本語より読みやすいので英語表記にする）
    const chipLabel = 'WINNER';
    const chipPx = 12;
    meas.font = fontOf('black', chipPx);
    const chipW = Math.ceil(meas.measureText(chipLabel).width) + 26;
    const chipH = CHAMP_CHIP_H;
    const chipX = centerX - chipW / 2;
    const chipY = cursor - chipH;
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX, chipY + chipH);
    chipGrad.addColorStop(0, COL.champ1);
    chipGrad.addColorStop(1, COL.champ3);
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2, chipGrad);
    drawText(ctx, chipLabel, centerX, chipY + chipH / 2 + 0.5, chipPx, 'center', COL.white, 'black');

    drawText(ctx, champName, centerX, nameY, CHAMP_NAME_PX, 'center', COL.gray900, 'black', CENTER_W - 16);
    if (champAff) {
      drawText(ctx, `（${champAff}）`, centerX, affY, 12, 'center', COL.gray500, 'normal', CENTER_W - 16);
    }
    if (finalScoreText) {
      drawText(ctx, finalScoreText, centerX, scoreY, CHAMP_SCORE_PX, 'center', COL.win, 'black');
      // タイブレークの得点・Ret / W.O は負けた側の外側へ小さく添える
      if (finalScore.note) {
        meas.font = fontOf('black', CHAMP_SCORE_PX);
        const mainW = meas.measureText(finalScoreText).width;
        const nx = finalScore.noteLeft
          ? centerX - mainW / 2 - 5
          : centerX + mainW / 2 + 5;
        drawText(ctx, finalScore.note, nx, scoreY, NOTE_PX,
          finalScore.noteLeft ? 'right' : 'left', COL.gray500, 'medium');
      }
    }
  }

  // ---- 協会ロゴ: 左右2山の中央下部（枠内）----
  if (showLogo && centerLogo.w > 0) {
    ctx.drawImage(
      logos.tcta!,
      centerX - centerLogo.w / 2,
      bracketAreaY + bracketH - centerLogo.h - 12,
      centerLogo.w,
      centerLogo.h,
    );
  }

  // ---- フッター（シード一覧） ----
  if (seedLines.length > 0) {
    let y = bracketAreaY + bracketH + 8 + seedPx / 2 + 4;
    for (const line of seedLines) {
      drawText(ctx, line, paddingX + 4, y, seedPx, 'left', COL.gray500, 'medium');
      y += seedPx + 6;
    }
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
  const showLogo = (opts.showAssociationLogo ?? getAssociationLogoEnabled()) && !!logos.tcta;
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
    // スコアを行プレイヤー視点で表示（タイブレークの得点は落とした側に付き、Ret / W.O も残す）
    if (m.score) {
      const text = sideScoreText(m.score, m.player1EntryId === rowPlayer.entryId) || m.score;
      return { text, isWin, played: true };
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
  const STAT_W = 88;
  const RANK_W = 72;

  // 協会ロゴはリーグ表の左上（選手名列のヘッダー）の中に入れる。
  // ロゴが入る分だけヘッダー行を高くする。
  const cornerLogo = showLogo ? fitLogo(logos.tcta, NAME_W - 28, 46) : { w: 0, h: 0 };
  const HDR_H = Math.max(44, Math.ceil(cornerLogo.h + 12));

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

  // 協会ロゴは表の中（左上）へ移したので、下の余白は最小限にする
  const footerH = 4;

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
  roundRect(ctx, paddingX, cardY, tableW, cardH, 18, undefined, COL.gray200, 1.5);

  const gridX = paddingX + (tableW - gridW) / 2;
  const gridY = cardY + cardTopPad;

  // ヘッダー行の背景
  const hdrGrad = ctx.createLinearGradient(gridX, gridY, gridX, gridY + HDR_H);
  hdrGrad.addColorStop(0, COL.gray100);
  hdrGrad.addColorStop(1, COL.gray50);
  roundRect(ctx, gridX, gridY, gridW, HDR_H, 10, hdrGrad);
  // ヘッダー下部は角丸にしない
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(gridX, gridY + HDR_H - 10, gridW, 10);

  const statX = gridX + NAME_W + n * CELL_W;
  const rankX = statX + STAT_W;

  // 行の縞
  for (let row = 0; row < n; row++) {
    if (row % 2 === 0) continue;
    ctx.fillStyle = COL.gray50;
    ctx.fillRect(gridX, gridY + HDR_H + row * ROW_H, gridW, ROW_H);
  }

  // 左上（選手名列のヘッダー）に協会ロゴ
  if (showLogo && cornerLogo.w > 0) {
    ctx.drawImage(
      logos.tcta!,
      gridX + (NAME_W - cornerLogo.w) / 2,
      gridY + (HDR_H - cornerLogo.h) / 2,
      cornerLogo.w,
      cornerLogo.h,
    );
  }

  // ヘッダーテキスト（列名 = 選手名）
  for (let i = 0; i < n; i++) {
    const cx = gridX + NAME_W + i * CELL_W + CELL_W / 2;
    drawText(ctx, playerSlots[i].name, cx, gridY + HDR_H / 2, 12, 'center', COL.gray800, 'bold', CELL_W - 8);
  }
  drawText(ctx, '勝敗', statX + STAT_W / 2, gridY + HDR_H / 2, 12, 'center', COL.gray800, 'black');
  drawText(ctx, '順位', rankX + RANK_W / 2, gridY + HDR_H / 2, 12, 'center', COL.gray800, 'black');

  // 罫線（縦）
  for (let i = 0; i <= n; i++) {
    const x = gridX + NAME_W + i * CELL_W;
    drawLine(ctx, x, gridY, x, gridY + gridH, COL.gray200, 1);
  }
  drawLine(ctx, statX + STAT_W, gridY, statX + STAT_W, gridY + gridH, COL.gray200, 1);
  // 罫線（横）
  drawLine(ctx, gridX, gridY + HDR_H, gridX + gridW, gridY + HDR_H, COL.red500, 1.5);
  for (let row = 1; row < n; row++) {
    const y = gridY + HDR_H + row * ROW_H;
    drawLine(ctx, gridX, y, gridX + gridW, y, COL.gray200, 1);
  }
  roundRect(ctx, gridX, gridY, gridW, gridH, 10, undefined, COL.gray200, 1.5);

  // データ行
  for (let row = 0; row < n; row++) {
    const y = gridY + HDR_H + row * ROW_H;
    const cy = y + ROW_H / 2;
    const p = playerSlots[row];
    const rank = rankMap.get(row);
    const s = stats[row];
    const played = s.wins > 0 || s.losses > 0;

    // 番号
    drawText(ctx, String(row + 1), gridX + 20, cy, 11, 'right', COL.gray400, 'medium');
    // 選手名 + 所属
    const nameX = gridX + 28;
    ctx.font = fontOf('bold', 14);
    const nameW = Math.min(ctx.measureText(p.name).width, NAME_W - 40);
    drawText(ctx, p.name, nameX, cy, 14, 'left', COL.gray800, 'bold', NAME_W - 40);
    if (p.affiliation) {
      const affX = nameX + nameW + 5;
      const affMaxW = gridX + NAME_W - 10 - affX;
      if (affMaxW > 16) {
        drawText(ctx, `（${p.affiliation}）`, affX, cy + 0.5, 11.5, 'left', COL.gray500, 'normal', affMaxW);
      }
    }

    // 対戦結果セル
    for (let col = 0; col < n; col++) {
      const cellX = gridX + NAME_W + col * CELL_W;
      const cx = cellX + CELL_W / 2;
      if (row === col) {
        ctx.fillStyle = COL.gray100;
        ctx.fillRect(cellX + 1, y + 1, CELL_W - 2, ROW_H - 2);
        drawLine(ctx, cellX + 1, y + 1, cellX + CELL_W - 1, y + ROW_H - 1, COL.gray300, 1.2);
        continue;
      }
      const result = getScore(p, playerSlots[col]);
      if (!result.played) {
        drawText(ctx, '—', cx, cy, 12, 'center', COL.gray300, 'normal');
        continue;
      }
      if (result.isWin) {
        const pw = Math.min(CELL_W - 20, 56);
        roundRect(ctx, cx - pw / 2, cy - 12, pw, 24, 12, COL.red50, COL.red200, 1);
      }
      drawText(ctx, result.text, cx, cy, 13, 'center', result.isWin ? COL.red600 : COL.gray500, result.isWin ? 'black' : 'medium');
    }

    // 勝敗
    if (played) {
      drawText(ctx, `${s.wins}-${s.losses}`, statX + STAT_W / 2, cy, 14, 'center', COL.gray700, 'bold');
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
        g.addColorStop(0, COL.champ1);
        g.addColorStop(1, COL.champ3);
        roundRect(ctx, bx, by, bw, bh, bh / 2, g);
        drawText(ctx, '1位', rankX + RANK_W / 2, cy + 0.5, 13, 'center', COL.white, 'black');
      } else {
        drawText(ctx, `${rank}位`, rankX + RANK_W / 2, cy, 14, 'center', COL.gray600, 'bold');
      }
    }
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
