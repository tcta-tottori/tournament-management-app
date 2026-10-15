import * as XLSX from 'xlsx';
import type { BracketLayout, ConsolationDef, ConsolationSource, PlacementCategory } from './types';

// =============================================
// 順位別トーナメント表（Excel）からトーナメントの形を読み取る
//
// 要項のトーナメント表は、1回戦の並び（①〜⑪ や G2・F2 …）の上に
// 試合番号（❶〜❼）が「2つの枠の真ん中」に置かれている。
// 枠の下には「❶敗者-❷敗者」のようなコンソレーションの組み方が書かれている。
// 罫線は読めないため、番号の位置（結合セルの中心列）から木を組み立てる。
// =============================================

interface CellInfo {
  row: number;      // 0始まり（結合セルは上端）
  center: number;   // 列の中心（結合セルは左右の中央）
  text: string;
}

interface Node {
  center: number;
  /** 葉: スロットのコード / 試合: 子ノード */
  code?: string;
  children?: [Node, Node];
  /** 要項の試合番号（番号のない上位の試合は undefined） */
  number?: number;
}

/** 全角英数字を半角に */
function toHalfWidth(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

/** 黒丸数字（❶〜❿・➊〜➓・⓫〜⓴・⓵〜⓾）の値。該当しなければ 0 */
function blackCircledValue(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x2776 && code <= 0x277F) return code - 0x2776 + 1;
  if (code >= 0x278A && code <= 0x2793) return code - 0x278A + 1;
  if (code >= 0x24EB && code <= 0x24F4) return code - 0x24EB + 11;
  if (code >= 0x24F5 && code <= 0x24FE) return code - 0x24F5 + 1;
  return 0;
}

/** 白丸数字（①〜⑳）の値。該当しなければ 0 */
function whiteCircledValue(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x2460 && code <= 0x2473) return code - 0x2460 + 1;
  return 0;
}

const BLACK_NUM = '[\\u2776-\\u277F\\u278A-\\u2793\\u24EB-\\u24FE]';
const CONSOLATION_RE = new RegExp(
  `(${BLACK_NUM})\\s*(勝者|敗者)\\s*[-－ー―‐−〜~]\\s*(${BLACK_NUM})\\s*(勝者|敗者)`,
);

/** スロット欄の文字列を読む。①→''（抽選）、G2→'G'、それ以外は null */
function slotCode(text: string): string | null {
  const t = toHalfWidth(text).replace(/\s+/g, '');
  if (t.length === 1 && whiteCircledValue(t) > 0) return '';
  const m = t.match(/^([A-Z])[1-5]$/i);
  return m ? m[1].toUpperCase() : null;
}

/** シートのセルを結合セルの中心列つきで列挙する */
function collectCells(ws: XLSX.WorkSheet): CellInfo[] {
  const merges = ws['!merges'] || [];
  const mergeAt = new Map<string, XLSX.Range>();
  for (const m of merges) mergeAt.set(`${m.s.r}:${m.s.c}`, m);

  const cells: CellInfo[] = [];
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const cell = ws[key] as XLSX.CellObject;
    if (cell.v == null) continue;
    const text = String(cell.v).trim();
    if (!text) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    const mg = mergeAt.get(`${r}:${c}`);
    cells.push({ row: r, center: mg ? (mg.s.c + mg.e.c) / 2 : c, text });
  }
  return cells.sort((a, b) => a.row - b.row || a.center - b.center);
}

const SECTION_RE = /([1-4])位(?:・[1-9]位)?トーナメント/;
const CATEGORY_BY_RANK: Record<string, PlacementCategory> = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };

/** 隣り合うノードの組で、真ん中が label の位置に一番近いものを探す */
function bestPair(nodes: Node[], used: Set<number>, center: number): number {
  let best = -1;
  let bestErr = Infinity;
  for (let i = 0; i + 1 < nodes.length; i++) {
    if (used.has(i) || used.has(i + 1)) continue;
    const err = Math.abs((nodes[i].center + nodes[i + 1].center) / 2 - center);
    if (err < bestErr) { bestErr = err; best = i; }
  }
  // 枠の間隔より大きくずれているものは別の表の番号とみなす
  const gap = nodes.length >= 2 ? Math.abs(nodes[1].center - nodes[0].center) : 0;
  return bestErr <= Math.max(3, gap) ? best : -1;
}

function height(node: Node): number {
  if (!node.children) return 0;
  return 1 + Math.max(height(node.children[0]), height(node.children[1]));
}

/** 1つのトーナメント表（セクション）を解析する */
function parseSection(cells: CellInfo[], category: PlacementCategory): BracketLayout | null {
  // 1回戦の並びの行（スロットが一番多く並ぶ行）
  const slotRows = new Map<number, CellInfo[]>();
  for (const c of cells) {
    if (slotCode(c.text) === null) continue;
    if (!slotRows.has(c.row)) slotRows.set(c.row, []);
    slotRows.get(c.row)!.push(c);
  }
  let slotRow = -1;
  let slotCells: CellInfo[] = [];
  for (const [row, list] of slotRows) {
    if (list.length > slotCells.length) { slotRow = row; slotCells = list; }
  }
  if (slotCells.length < 3) return null;

  const numberLabel = (c: CellInfo) => (c.text.length === 1 ? blackCircledValue(c.text) : 0);
  const mainLabels = cells.filter(c => c.row < slotRow && numberLabel(c) > 0);
  const consLabels = cells.filter(c => c.row > slotRow && numberLabel(c) > 0);
  const consTexts = cells.filter(c => c.row > slotRow && CONSOLATION_RE.test(c.text));
  if (mainLabels.length === 0) return null;

  // --- 本戦の木を組み立てる（枠に近い段の番号から順に、2つの枠をまとめていく） ---
  let nodes: Node[] = slotCells
    .sort((a, b) => a.center - b.center)
    .map(c => ({ center: c.center, code: slotCode(c.text) ?? '' }));
  const labelRows = [...new Set(mainLabels.map(c => c.row))].sort((a, b) => b - a);
  for (const row of labelRows) {
    const labels = mainLabels.filter(c => c.row === row).sort((a, b) => a.center - b.center);
    const used = new Set<number>();
    const merges = new Map<number, Node>();
    for (const label of labels) {
      const i = bestPair(nodes, used, label.center);
      if (i < 0) return null;
      used.add(i); used.add(i + 1);
      merges.set(i, { center: label.center, children: [nodes[i], nodes[i + 1]], number: numberLabel(label) });
    }
    const next: Node[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const merged = merges.get(i);
      if (merged) { next.push(merged); i++; continue; }
      next.push(nodes[i]);
    }
    nodes = next;
  }
  // 番号のない上位（準決勝・決勝）は隣どうしで組む
  while (nodes.length > 1) {
    const next: Node[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      if (i + 1 < nodes.length) {
        next.push({ center: (nodes[i].center + nodes[i + 1].center) / 2, children: [nodes[i], nodes[i + 1]] });
      } else {
        next.push(nodes[i]);
      }
    }
    nodes = next;
  }

  const root = nodes[0];
  const rounds = height(root);
  if (rounds < 2 || rounds > 6) return null;
  const drawSize = 2 ** rounds;
  const slots: (string | null)[] = Array(drawSize).fill(null);
  const matchNumbers: Record<string, number> = {};

  // 木を drawSize のドローに当てはめる（届かない段は BYE で埋める）
  const place = (node: Node, h: number, offset: number) => {
    if (!node.children) { slots[offset] = node.code ?? ''; return; }
    if (node.number) matchNumbers[`bracket-${category}-R${h}-${offset / 2 ** h + 1}`] = node.number;
    const half = 2 ** (h - 1);
    place(node.children[0], h - 1, offset);
    place(node.children[1], h - 1, offset + half);
  };
  place(root, rounds, 0);

  // --- コンソレーション ---
  const parseSource = (num: string, res: string): ConsolationSource => ({
    number: blackCircledValue(num),
    result: res === '勝者' ? 'winner' : 'loser',
  });
  const texts = consTexts.map(c => {
    const m = c.text.match(CONSOLATION_RE)!;
    return { cell: c, source1: parseSource(m[1], m[2]), source2: parseSource(m[3], m[4]), number: 0 };
  });
  // 番号つきの試合（❽ など）は、真下にある一番近い組み合わせに対応させる
  for (const label of consLabels.sort((a, b) => a.row - b.row || a.center - b.center)) {
    const target = texts
      .filter(t => t.number === 0 && t.cell.row > label.row && Math.abs(t.cell.center - label.center) <= 1.5)
      .sort((a, b) => a.cell.row - b.cell.row)[0];
    if (target) target.number = numberLabel(label);
  }
  // 番号の無い試合には通し番号を補う
  const allNumbers = [...Object.values(matchNumbers), ...texts.map(t => t.number)];
  let nextNumber = Math.max(0, ...allNumbers) + 1;
  for (const t of texts) {
    if (t.number === 0) t.number = nextNumber++;
  }
  // 勝者を受ける試合が後ろに来るよう並べる
  const consolation: ConsolationDef[] = [];
  const pending = texts.map(t => ({ number: t.number, source1: t.source1, source2: t.source2 }));
  const consNumbers = new Set(pending.map(p => p.number));
  const done = new Set<number>();
  while (pending.length > 0) {
    const idx = pending.findIndex(p =>
      [p.source1, p.source2].every(s => !consNumbers.has(s.number) || done.has(s.number)));
    const [def] = pending.splice(idx >= 0 ? idx : 0, 1);
    consolation.push(def);
    done.add(def.number);
  }

  return { slots, matchNumbers, consolation };
}

/** 順位別トーナメントシートから各トーナメントの形を読み取る */
export function parseBracketLayouts(ws: XLSX.WorkSheet | undefined): Partial<Record<PlacementCategory, BracketLayout>> | undefined {
  if (!ws) return undefined;
  const cells = collectCells(ws);
  const headers = cells
    .map(c => ({ cell: c, m: toHalfWidth(c.text).replace(/\s+/g, '').match(SECTION_RE) }))
    .filter((h): h is { cell: CellInfo; m: RegExpMatchArray } => !!h.m)
    .sort((a, b) => a.cell.row - b.cell.row);

  const result: Partial<Record<PlacementCategory, BracketLayout>> = {};
  for (let i = 0; i < headers.length; i++) {
    const category = CATEGORY_BY_RANK[headers[i].m[1]];
    if (!category || result[category]) continue;
    const startRow = headers[i].cell.row;
    const endRow = i + 1 < headers.length ? headers[i + 1].cell.row : Infinity;
    const section = cells.filter(c => c.row > startRow && c.row < endRow);
    const layout = parseSection(section, category);
    if (!layout) continue;
    // 2位以下の表に抽選の丸数字が入っている場合、並びが分からないので使わない
    if (category !== '1st' && layout.slots.some(s => s === '')) continue;
    result[category] = layout;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
