import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedDrawPlayer {
  position: number;
  name: string;
  affiliation: string;
  isBye: boolean;
  seed: number;
  partnerName?: string;
  partnerAffiliation?: string;
  /** 抽出元のシート行インデックス（試合開始時刻の抽出に使用） */
  row?: number;
}

import type { MatchFormatType } from '../../db/database';

/** 回戦ごとのゲームルール */
export interface RoundGameRule {
  /** 適用ラウンド範囲の説明（例: "１～２回戦", "準々決勝以降"） */
  roundLabel: string;
  /** ルールテキスト（例: "8ゲームマッチ（8-8タイブレーク）"） */
  ruleText: string;
  /** ゲーム数 */
  games: number;
  /** 試合方式 */
  matchFormat?: MatchFormatType;
  // --- 熱中症警戒アラート時のパターン（ドロー表に「※熱中症〜」の記載がある場合） ---
  /** 熱中症時のルール文 */
  heatRuleText?: string;
  /** 熱中症時のゲーム数 */
  heatGames?: number;
  /** 熱中症時の試合方式 */
  heatMatchFormat?: MatchFormatType;
}

export interface ParsedDrawEvent {
  eventName: string;
  matchFormat: string;
  type: 'Singles' | 'Doubles';
  drawSize: number;
  players: ParsedDrawPlayer[];
  isRoundRobin: boolean;
  /** 回戦別ゲームルール（複数ルールがある場合） */
  roundGameRules: RoundGameRule[];
  /**
   * 1回戦の各試合の開始時刻（'HH:MM'）。キーはそのペアの上側（小さい方）の
   * ブラケット位置。ドロー表に記載された時刻をそのまま配置に使う。
   */
  matchTimes: Record<number, string>;
  /**
   * 2回戦以降の各試合の開始時刻（'HH:MM'）。キーは "R{round}-{matchNumInRound}"
   * （round・matchNumInRound は extractMatchesFromDraw と同じ採番＝左山→右山、上→下）。
   * ドロー表に後続ラウンドの開始時刻が明記されている場合に抽出する。時間割の
   * 自動生成時にこの時刻を優先配置する。
   */
  roundMatchTimes: Record<string, string>;
  /**
   * 種目全体の開始時刻（'HH:MM'）。ドロー表に「決勝リーグ 11：00開始予定」のように
   * 文章で開始時刻が書かれている場合に抽出する（主にリーグ戦）。
   */
  eventStartTime?: string;
}

export interface ParsedDrawFile {
  fileName: string;
  sheetName: string;
  events: ParsedDrawEvent[];
  tournamentName: string;
  date: string;
  venue: string;
  reserveDate: string;
  reserveVenue: string;
  /** ドロー表に記載された最早の試合開始時刻（'HH:MM'）。無ければ空文字。 */
  earliestStartTime: string;
  /** 最早時刻に開始する試合数（＝同時進行できるコート数の目安）。 */
  suggestedCourtCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 全角数字→半角数字に変換 */
function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
}

const EVENT_KEYWORDS = [
  'シングルス',
  'ダブルス',
  'Ａ級',
  'Ｂ級',
  'Ｃ級',
  '以上',
  '女子',
  '男子',
];

const BYE_RE = /^[Ｂbｂ][Ｙyｙ][Ｅeｅ]$/i;

/** Normalise full-width spaces to half-width and trim. */
function normalizeName(raw: unknown): string {
  if (raw == null) return '';
  return String(raw)
    .replace(/\u3000/g, ' ')
    .trim();
}

function cellStr(row: unknown[] | undefined, col: number): string {
  if (!row) return '';
  const v = row[col];
  if (v == null) return '';
  return String(v).trim();
}

function cellNum(row: unknown[] | undefined, col: number): number | null {
  if (!row) return null;
  const v = row[col];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isBye(name: string): boolean {
  return name === '' || BYE_RE.test(name);
}

function nextPowerOf2(n: number): number {
  if (n <= 0) return 2;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ---------------------------------------------------------------------------
// R1ペアリング検出 & ブラケット位置マッピング
// ---------------------------------------------------------------------------

/** セル値が日時（時刻）かどうかを判定 */
function isTimeValue(v: unknown): boolean {
  if (v == null) return false;
  // SheetJS cellDates:true → Date object for time cells
  if (v instanceof Date) return true;
  // Some XLSX libraries return time as fractional number (0-1)
  if (typeof v === 'number' && v > 0 && v < 1) return true;
  // Check for time-like string "H:MM" or "HH:MM"
  if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) return true;
  return false;
}

/** 時刻セルを 'HH:MM' 文字列に変換（時刻でなければ null） */
function timeValueToHM(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    // SheetJS(xlsx 0.18.x) の cellDates:true は「ローカル時刻の各要素がセルの表示値に
    // 一致する」Dateを返す（例: 9:00 → Sat Dec 30 1899 09:00:00 GMT+0900）。
    // ここで getUTCHours() を使うと日本時間(UTC+9)のブラウザでは9時間ずれ、
    // 9:00 が 0:00 として取り込まれてしまうため、必ずローカル時刻で読む。
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 0 && v < 1) {
    const total = Math.round(v * 24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return null;
}

/** 左山・右山それぞれの「ブラケット線が描かれる列範囲」 */
interface HalfColRanges {
  /** 左山と右山を分ける列 */
  boundary: number;
  left: { start: number; end: number };
  right: { start: number; end: number };
}

/**
 * 検出済みの列レイアウトから、左山・右山のブラケット領域（試合時刻が書かれる列）を
 * 求める。左山はエントリー欄の右側、右山はエントリー欄の左側に線と時刻が描かれる。
 *
 * 固定列（左=F〜M, 右=N〜S）を前提にすると、氏名や所属が結合セルで幅広に置かれた
 * ドロー表では時刻を1つも拾えず、1回戦のペアリングを誤判定してしまう。
 */
function computeHalfColRanges(left: ColumnLayout, right: ColumnLayout): HalfColRanges {
  const leftEntryEnd =
    left.closeParenCol >= 0 ? left.closeParenCol
      : left.nameCol >= 0 ? left.nameCol + 3
        : 4;
  const rightEntryStart =
    right.numCol >= 0 ? right.numCol : leftEntryEnd + 16;
  // 端数は右山側に寄せる（従来の固定列 左=F〜M / 右=N〜S と同じ分割になる）
  const boundary = Math.ceil((leftEntryEnd + rightEntryStart) / 2);
  return {
    boundary,
    left: { start: leftEntryEnd, end: boundary },
    right: { start: boundary + 1, end: rightEntryStart },
  };
}

/**
 * ドロー表の試合開始時刻から、最早時刻と「同時進行できる試合数」を求める。
 *
 * 最早時刻（例: 9:00）に開始する試合数がコート数の目安になる。ただし複数種目が
 * 別々のコート帯で同時進行するため単純合計は過大になりやすい。実運用では最大の
 * 種目の同時試合数がコート帯サイズを決めるため、「単一種目内で最早時刻に開始する
 * 試合数の最大値」を採用する（例: A級が9:00に12試合 → 12面）。
 *
 * @param rows シート全行
 * @param sectionBoundaries 各種目ヘッダーの行インデックス（区間分割用）
 */
function analyzeStartTimes(
  rows: unknown[][],
  sectionBoundaries: number[],
): { earliestStartTime: string; suggestedCourtCount: number } {
  const times: { r: number; hm: string }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (const cell of row) {
      const hm = timeValueToHM(cell);
      if (hm) times.push({ r, hm });
    }
  }
  if (times.length === 0) return { earliestStartTime: '', suggestedCourtCount: 0 };

  // 最早時刻（文字列昇順＝時刻昇順）
  let earliest = '';
  for (const t of times) {
    if (earliest === '' || t.hm < earliest) earliest = t.hm;
  }

  // 種目区間ごとに最早時刻の試合数を数え、その最大値を採用
  const bounds = [...sectionBoundaries].sort((a, b) => a - b);
  let maxCount = 0;
  if (bounds.length > 0) {
    for (let i = 0; i < bounds.length; i++) {
      const start = bounds[i];
      const end = i + 1 < bounds.length ? bounds[i + 1] : rows.length;
      let c = 0;
      for (const t of times) {
        if (t.hm === earliest && t.r >= start && t.r < end) c++;
      }
      if (c > maxCount) maxCount = c;
    }
  }
  // フォールバック: 区間情報が無い/取れない場合は全体カウント
  if (maxCount === 0) {
    for (const t of times) if (t.hm === earliest) maxCount++;
  }

  return { earliestStartTime: earliest, suggestedCourtCount: maxCount };
}

/**
 * 1回戦の各試合の開始時刻を抽出する。
 * ペア（ブラケット位置 2k-1, 2k）の2選手の行の間に書かれた時刻セルを、その試合の
 * 開始時刻とみなす。BYE側は試合が無いのでスキップ。
 * キーはペアの上側（小さい方）の位置。
 */
function extractR1MatchTimes(
  rows: unknown[][],
  players: ParsedDrawPlayer[],
  drawSize: number,
  leftLayout: ColumnLayout,
  rightLayout: ColumnLayout,
): Record<number, string> {
  const rowByPos = new Map<number, number>();
  for (const p of players) {
    if (!p.isBye && p.row != null) rowByPos.set(p.position, p.row);
  }
  const half = drawSize / 2;
  // 左右の時刻列を中央で分ける。左山ペアは左側の列、右山ペアは右側の列の時刻を使う。
  // （同じ行に左山・右山両方の時刻が書かれるため、半分で絞らないと誤取得する）
  const ranges = computeHalfColRanges(leftLayout, rightLayout);

  const result: Record<number, string> = {};
  for (let a = 1; a < drawSize; a += 2) {
    const ra = rowByPos.get(a);
    const rb = rowByPos.get(a + 1);
    if (ra == null || rb == null) continue; // どちらかがBYE → 試合なし
    const lo = Math.min(ra, rb);
    const hi = Math.max(ra, rb);
    // 位置が離れすぎている場合は隣接ペアでない可能性が高く誤取得を避ける
    if (hi - lo > 4) continue;
    // この試合が属する半分の列範囲だけ走査する
    const isLeft = a <= half;
    const cStart = isLeft ? ranges.left.start : ranges.right.start;
    const cEnd = isLeft ? ranges.left.end : ranges.right.end;
    // 行帯の中に後続ラウンドの時刻が紛れることがあるため、最も外側の列
    // （左山=小さい列 / 右山=大きい列）にある時刻を1回戦の時刻として採る。
    let time = '';
    let bestCol = -1;
    for (let r = lo; r <= hi; r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = Math.max(0, cStart); c <= cEnd && c < row.length; c++) {
        const hm = timeValueToHM(row[c]);
        if (!hm) continue;
        const better = bestCol < 0 || (isLeft ? c < bestCol : c > bestCol);
        if (better) { bestCol = c; time = hm; }
      }
    }
    if (time) result[a] = time;
  }
  return result;
}

/** 'HH:MM' → 分。不正なら null。 */
function hmToMinutes(hm: string): number | null {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * 2回戦以降の各試合の開始時刻をドロー表から抽出する。
 *
 * ドロー表には後続ラウンドの開始時刻も記載されることがある（例: 2回戦を11:00開始）。
 * これらはトーナメントツリー上、より中央寄りの列に、その試合が束ねる範囲の中央の
 * 行付近に書かれる。各試合の「担当行帯（構成選手の行範囲）」の中央に最も近い時刻セルを
 * 割り当てる。誤取得を防ぐため、以下を満たすもののみ採用する:
 *   1. セル行がその試合の行帯内
 *   2. セル列が同じ山の1回戦列より中央寄り
 *   3. 直前ラウンド（フィーダー）の時刻より後
 *   4. その種目の下位ラウンド時刻すべてより後（階段状の単調増加）
 *
 * @returns "R{round}-{matchNumInRound}"（round≥2）をキーとした 'HH:MM' の辞書
 */
function extractLaterRoundMatchTimes(
  rows: unknown[][],
  players: ParsedDrawPlayer[],
  drawSize: number,
  matchTimes: Record<number, string>,
  leftLayout: ColumnLayout,
  rightLayout: ColumnLayout,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (drawSize < 4) return result;
  const totalRounds = Math.log2(drawSize);
  if (!Number.isInteger(totalRounds)) return result;

  const real = players.filter((p) => !p.isBye && p.row != null);
  if (real.length === 0) return result;
  const rowByPos = new Map<number, number>();
  for (const p of real) rowByPos.set(p.position, p.row!);

  const half = drawSize / 2;
  const centerCol = computeHalfColRanges(leftLayout, rightLayout).boundary;

  // ドロー領域内の全時刻セルを収集
  const rowVals = real.map((p) => p.row!);
  const minRow = Math.min(...rowVals) - 2;
  const maxRow = Math.max(...rowVals) + 3;
  interface Cell { r: number; c: number; hm: string; used: boolean; }
  const cells: Cell[] = [];
  for (let r = Math.max(0, minRow); r <= maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const hm = timeValueToHM(row[c]);
      if (hm) cells.push({ r, c, hm, used: false });
    }
  }
  if (cells.length === 0) return result;

  // 全ラウンドの試合を構築（担当行帯・中央行・フィーダー）
  interface MatchNode {
    round: number; mnr: number; side: 'L' | 'R';
    bandMin: number; bandMax: number; center: number;
    feeders: string[]; id: string; time?: string;
  }
  const matches: MatchNode[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = drawSize / Math.pow(2, round);
    const blockSize = Math.pow(2, round);
    for (let j = 0; j < matchesInRound; j++) {
      const lo = j * blockSize + 1;
      const hi = (j + 1) * blockSize;
      const prows: number[] = [];
      for (let p = lo; p <= hi; p++) {
        const rr = rowByPos.get(p);
        if (rr != null) prows.push(rr);
      }
      if (prows.length === 0) continue; // 全員BYE → 試合なし
      const bandMin = Math.min(...prows);
      const bandMax = Math.max(...prows);
      matches.push({
        round, mnr: j + 1, side: lo <= half ? 'L' : 'R',
        bandMin, bandMax, center: (bandMin + bandMax) / 2,
        feeders: round === 1 ? [] : [`R${round - 1}-${2 * j + 1}`, `R${round - 1}-${2 * j + 2}`],
        id: `R${round}-${j + 1}`,
      });
    }
  }
  const byId = new Map(matches.map((m) => [m.id, m]));

  // 1回戦の時刻を matchTimes から反映（キー = ペア上側位置 = 2*mnr-1）
  for (const m of matches) {
    if (m.round === 1) {
      const t = matchTimes[2 * m.mnr - 1];
      if (t) m.time = t;
    }
  }

  // 各山の1回戦列を推定（1回戦の中央行に最も近い、同時刻のセルの列の中央値）
  const r1ColBySide: { L?: number; R?: number } = {};
  for (const side of ['L', 'R'] as const) {
    const inHalf = (c: number) => (side === 'L' ? c < centerCol : c >= centerCol);
    const cols: number[] = [];
    for (const m of matches) {
      if (m.round !== 1 || m.side !== side || !m.time) continue;
      let bestIdx = -1, bestDist = Infinity;
      cells.forEach((cell, i) => {
        if (cell.hm !== m.time || !inHalf(cell.c)) return;
        const d = Math.abs(cell.r - m.center);
        if (d < bestDist && d <= 6) { bestDist = d; bestIdx = i; }
      });
      if (bestIdx >= 0) cols.push(cells[bestIdx].c);
    }
    if (cols.length > 0) {
      cols.sort((a, b) => a - b);
      r1ColBySide[side] = cols[Math.floor(cols.length / 2)];
    }
  }

  // 1回戦に割り当てたセルを消費（後続ラウンドで再利用しない）
  for (const m of matches) {
    if (m.round !== 1 || !m.time) continue;
    let bestIdx = -1, bestDist = Infinity;
    cells.forEach((cell, i) => {
      if (cell.used || cell.hm !== m.time) return;
      const d = Math.abs(cell.r - m.center);
      if (d < bestDist && d <= 6) { bestDist = d; bestIdx = i; }
    });
    if (bestIdx >= 0) cells[bestIdx].used = true;
  }

  // 実際に対戦が発生する1回戦の中央行（＝1回戦の時刻が書かれうる行）。
  // 1回戦と同じ列に書かれた後続ラウンドの時刻（BYE不戦勝側の次戦など）を拾う際に、
  // 1回戦の時刻セルを誤って奪わないためのガードに使う。
  const r1CenterRowsBySide: { L: number[]; R: number[] } = { L: [], R: [] };
  for (const m of matches) {
    if (m.round !== 1) continue;
    const lo = 2 * m.mnr - 1;
    if (rowByPos.has(lo) && rowByPos.has(lo + 1)) {
      r1CenterRowsBySide[m.side].push(m.center);
    }
  }

  // 左右の山を分ける列の境界。1回戦列が両側とも分かればその中点、
  // 分からなければ氏名列とドロー番号列から求めた中央列を使う。
  // （左右の山は同じ行帯を共有するため、列で分けないと反対側の時刻を拾ってしまう）
  const sideBoundary =
    r1ColBySide.L != null && r1ColBySide.R != null
      ? (r1ColBySide.L + r1ColBySide.R) / 2
      : centerCol;

  // 2回戦以降を、ラウンド昇順で割り当てる
  const later = matches.filter((m) => m.round >= 2).sort((a, b) => a.round - b.round);
  for (const m of later) {
    const r1col = r1ColBySide[m.side];
    // 決勝は左右の山の中央に書かれるため、山による列の絞り込みを行わない
    const isFinal = m.round === totalRounds;
    let bestIdx = -1, bestDist = Infinity;
    cells.forEach((cell, i) => {
      if (cell.used) return;
      if (cell.r < m.bandMin - 1 || cell.r > m.bandMax + 1) return;
      if (!isFinal) {
        // 自分の山（列の左右）のセルのみ
        if (m.side === 'L' && cell.c > sideBoundary) return;
        if (m.side === 'R' && cell.c < sideBoundary) return;
      } else {
        // 決勝は両山の1回戦列より内側のセルのみ
        if (r1ColBySide.L != null && cell.c < r1ColBySide.L) return;
        if (r1ColBySide.R != null && cell.c > r1ColBySide.R) return;
      }
      // 1回戦列より中央寄りのセルのみ（外側の1回戦時刻の誤取得を防ぐ）
      if (!isFinal && r1col != null) {
        if (m.side === 'L' && cell.c < r1col) return;
        if (m.side === 'R' && cell.c > r1col) return;
        // 1回戦と同じ列のセルは、1回戦の対戦行から離れている場合のみ採用する。
        // BYEで不戦勝になった側の次戦時刻は1回戦列に書かれることがあるため。
        if (cell.c === r1col &&
            r1CenterRowsBySide[m.side].some((cr) => Math.abs(cr - cell.r) <= 1)) return;
      }
      const d = Math.abs(cell.r - m.center);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    if (bestIdx < 0) continue;
    const cand = cells[bestIdx];
    const candMin = hmToMinutes(cand.hm);
    if (candMin == null) continue;
    // フィーダー（直前ラウンド）の時刻より後
    let feederMax = 0;
    for (const f of m.feeders) {
      const fm = byId.get(f);
      if (fm?.time) {
        const t = hmToMinutes(fm.time);
        if (t != null) feederMax = Math.max(feederMax, t);
      }
    }
    // 種目内の全下位ラウンド時刻より後（階段状の単調増加）
    let lowerMax = 0;
    for (const mm of matches) {
      if (mm.time && mm.round < m.round) {
        const t = hmToMinutes(mm.time);
        if (t != null) lowerMax = Math.max(lowerMax, t);
      }
    }
    if (candMin > feederMax && candMin > lowerMax) {
      m.time = cand.hm;
      cand.used = true;
      result[m.id] = cand.hm;
    }
  }

  return result;
}

/**
 * 種目区間の文章から開始時刻を抽出する。
 * 例: 「決勝リーグ 11：00開始予定」「10:30開始」→ '11:00' / '10:30'
 * リーグ戦のようにブラケット線が無く、時刻がテキストで書かれる種目に使う。
 */
function extractEventStartTimeText(
  rows: unknown[][],
  startRow: number,
  endRow: number,
): string {
  for (let r = startRow; r < endRow; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < Math.min(row.length, 30); c++) {
      const raw = row[c];
      if (raw == null || raw instanceof Date) continue;
      const val = String(raw);
      if (!val.includes('開始')) continue;
      const norm = normalizeDigits(val).replace(/[：]/g, ':');
      const m = norm.match(/(\d{1,2}):(\d{2})/);
      if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
      // 「11時開始」形式
      const hOnly = norm.match(/(\d{1,2})\s*時\s*(?:(\d{1,2})\s*分)?/);
      if (hOnly) {
        return `${hOnly[1].padStart(2, '0')}:${(hOnly[2] ?? '0').padStart(2, '0')}`;
      }
    }
  }
  return '';
}

/**
 * Excelブラケットエリアのギャップ行（エントリー間の行）に
 * 試合時刻があるかどうかを調べ、R1ペアリングを検出する。
 *
 * 時刻はその試合の縦線（ブラケットの結合線）の列に書かれるため、外側の列にある
 * ものほど早い回戦を表す。ただし「その山で1回戦が何試合あるか」はエントリー数から
 * 一意に決まる（残りはBYEとの不戦勝枠）ので、外側から expectedPairs 件だけ採用する。
 * 山によっては1回戦が0試合（全員シード）のこともあり、その山の最外側の時刻を
 * 無条件にR1とみなすと回戦がひとつずつズレてしまう。
 *
 * @param rows - シートの全行データ
 * @param entryRows - 各エントリーの行インデックス（0-based, rows配列のインデックス）
 * @param side - 'left' | 'right'
 * @param colRange - その山のブラケット領域の列範囲
 * @param expectedPairs - その山で1回戦が成立する試合数
 * @returns R1で対戦するエントリーのインデックスペア配列 (entryRows内のインデックス)
 */
function detectR1Pairings(
  rows: unknown[][],
  entryRows: number[],
  side: 'left' | 'right',
  colRange: { start: number; end: number },
  expectedPairs: number,
): number[] {
  if (entryRows.length < 2 || expectedPairs <= 0) return [];

  // 各ギャップ行で時刻セルを探し、最も外側の列を記録する
  const gaps: { entryIdx: number; outerCol: number }[] = [];

  for (let i = 0; i < entryRows.length - 1; i++) {
    // エントリー間の全行をスキャン（ダブルスではパートナー行があるため+1だけでは不十分）
    const scanStart = entryRows[i] + 1;
    const scanEnd = entryRows[i + 1];

    for (let gapRow = scanStart; gapRow < scanEnd; gapRow++) {
      const row = rows[gapRow];
      if (!row) continue;

      const timeCols: number[] = [];
      for (let c = Math.max(0, colRange.start); c <= colRange.end; c++) {
        if (isTimeValue(row[c])) timeCols.push(c);
      }

      if (timeCols.length > 0) {
        gaps.push({
          entryIdx: i,
          outerCol: side === 'left' ? Math.min(...timeCols) : Math.max(...timeCols),
        });
        break; // このエントリーペア間で最初の時刻行を採用
      }
    }
  }

  // 外側（左山=小さい列 / 右山=大きい列）から順に、エントリーが重複しないよう採用
  gaps.sort((a, b) =>
    side === 'left'
      ? a.outerCol - b.outerCol || a.entryIdx - b.entryIdx
      : b.outerCol - a.outerCol || a.entryIdx - b.entryIdx,
  );

  const used = new Set<number>();
  const picked: number[] = [];
  for (const gap of gaps) {
    if (picked.length >= expectedPairs) break;
    if (used.has(gap.entryIdx) || used.has(gap.entryIdx + 1)) continue;
    picked.push(gap.entryIdx);
    used.add(gap.entryIdx);
    used.add(gap.entryIdx + 1);
  }

  // 時刻が読み取れずペアが足りない場合は、下側のエントリーから順に埋める
  // （ドロー番号の若い＝シード側にBYEを寄せるのが一般的なため）
  for (let i = entryRows.length - 2; i >= 0 && picked.length < expectedPairs; i -= 2) {
    if (used.has(i) || used.has(i + 1)) continue;
    picked.push(i);
    used.add(i);
    used.add(i + 1);
  }

  return picked.sort((a, b) => a - b);
}

/**
 * R1ペアリング情報からブラケット位置を割り当てる。
 *
 * R1で対戦するペア → 同じペア枠（連続2ポジション）に配置
 * walkovers（R1なし） → エントリー + BYEのペア枠に配置
 *
 * @param players - ドロー番号順にソートされたエントリー配列
 * @param entryRows - 各エントリーの行インデックス
 * @param halfSize - 半分のブラケットサイズ
 * @param halfOffset - ポジションオフセット（左半分=0, 右半分=halfSize）
 * @param rows - シートの全行データ
 * @param side - 'left' | 'right'
 */
function assignPositionsFromR1Pairings(
  players: ParsedDrawPlayer[],
  entryRows: number[],
  halfSize: number,
  halfOffset: number,
  rows: unknown[][],
  side: 'left' | 'right',
  colRange: { start: number; end: number },
): void {
  if (players.length === 0) return;

  // ペア枠（連続2ポジション）は halfSize/2 個。そのうち「エントリー同士が対戦する枠」の
  // 数はエントリー数から一意に決まる（残りはBYEとの枠＝不戦勝）。
  const slotPairs = Math.max(1, Math.floor(halfSize / 2));
  const expectedPairs = Math.max(0, Math.min(slotPairs, players.length - slotPairs));

  const r1PairIndices = detectR1Pairings(rows, entryRows, side, colRange, expectedPairs);
  const r1Set = new Set(r1PairIndices);

  // ブラケット位置を順番に割り当て
  const maxPos = halfOffset + halfSize;
  let pos = halfOffset + 1; // 1-indexed
  let i = 0;

  while (i < players.length && pos <= maxPos) {
    if (r1Set.has(i) && i + 1 < players.length) {
      // R1ペア: 2エントリーが同じペア枠
      players[i].position = pos;
      players[i + 1].position = pos + 1;
      pos += 2;
      i += 2;
    } else {
      // Walkover: エントリー + BYE
      players[i].position = pos;
      // BYE is at pos + 1 (implicit, not stored)
      pos += 2;
      i += 1;
    }
  }

  // ペア化が足りず枠から溢れた場合は、空いているスロットへ順に詰める
  if (i < players.length) {
    const taken = new Set(players.slice(0, i).map((p) => p.position));
    let free = halfOffset + 1;
    for (; i < players.length; i++) {
      while (free <= maxPos && taken.has(free)) free++;
      if (free > maxPos) break;
      players[i].position = free;
      taken.add(free);
    }
  }
}

function isEventHeader(text: string): boolean {
  if (!text) return false;
  // Must contain at least one event keyword and not be a seed line
  if (text.startsWith('シード')) return false;
  if (!EVENT_KEYWORDS.some((kw) => text.includes(kw))) return false;
  // 大会タイトル（例: 「気高カップ･サマーシングルス大会」）は種目ヘッダーではない。
  // 種目名に「大会/カップ/選手権/オープン」等は含まれないため除外する。
  // これを弾かないと空の種目が作られ、日付・会場の抽出領域も潰れてしまう。
  if (/大会|カップ|選手権|オープン|ｵｰﾌﾟﾝ/.test(text)) return false;
  return true;
}

function detectType(eventName: string): 'Singles' | 'Doubles' {
  return eventName.includes('ダブルス') ? 'Doubles' : 'Singles';
}

// ---------------------------------------------------------------------------
// Game rule parsing
// ---------------------------------------------------------------------------

/** "8ゲームマッチ（8-8タイブレーク）" → 8 */
function extractGamesFromRuleText(text: string): number {
  const norm = normalizeDigits(text);
  const m = norm.match(/(\d+)\s*ゲーム/);
  return m ? parseInt(m[1], 10) : 6; // デフォルト6ゲーム
}

/**
 * 1つのセルに複数のルールが書かれている場合に分割する。
 * 例: "１･2回戦８ゲームマッチ（8-8タイブレ）準々決勝以降６ゲームマッチ（6-6タイブレ）"
 *     → ["１･2回戦８ゲームマッチ（8-8タイブレ）", "準々決勝以降６ゲームマッチ（6-6タイブレ）"]
 */
function splitRuleChunks(text: string): string[] {
  // 全角→半角変換は1文字1文字の置換なので、元テキストと文字位置が一致する
  const norm = normalizeDigits(text);
  const re = /[^（）()]*?\d+\s*ゲームマッチ(?:\s*[（(][^）)]*[）)])?/g;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const chunk = text.slice(m.index, m.index + m[0].length).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks.length > 0 ? chunks : [text.trim()];
}

/** 回戦ラベルらしさの判定（"準々決勝以降" "１～２回戦" "決勝・３位決定戦" 等） */
const ROUND_LABEL_RE = /回戦|決勝|以降|以上/;

/** ルール文の先頭に付いた回戦ラベルを切り出す */
function splitRoundLabel(chunk: string): { roundLabel: string; ruleText: string } {
  const norm = normalizeDigits(chunk);
  const m = norm.match(/^([\s\S]*?)\d+\s*ゲームマッチ/);
  if (m) {
    const label = chunk.slice(0, m[1].length).trim();
    if (label && ROUND_LABEL_RE.test(label)) {
      return { roundLabel: label, ruleText: chunk.slice(m[1].length).trim() };
    }
  }
  return { roundLabel: '全回戦', ruleText: chunk.trim() };
}

/**
 * イベントヘッダー周辺からゲームルールをパースする。
 * パターン:
 *   1) 同行の後方カラムにルール ("8ゲームマッチ（8-8タイブレーク）")
 *   2) 次行にルール ("8ゲームマッチ（8-8タイブレーク）")
 *   3) 同行または次行に回戦別ルール ("１～２回戦　8ゲームマッチ...") + その次行にも別ルール
 *   4) 1セルに回戦別ルールが2つ ("１･2回戦8ゲームマッチ...準々決勝以降6ゲームマッチ...")
 *   5) "※熱中症特別警報等発令時：6ゲームマッチ..." → 通常ルールではなく熱中症時パターン
 */
function parseGameRules(
  rows: unknown[][],
  headerRow: number,
  endRow: number,
  headerMatchFormat: string,
): RoundGameRule[] {
  const rules: RoundGameRule[] = [];
  const ruleRe = /\d+\s*ゲームマッチ/;
  const setRe = /タイブレークセット|セットマッチ/;
  const superTbRe = /ファイナル.*タイブレーク|10\s*ポイント/;
  const heatRe = /熱中症/;

  let heat: { ruleText: string; games: number; matchFormat: MatchFormatType } | null = null;
  let pendingSetRule: RoundGameRule | null = null;

  /** 1セル分のテキストを解釈してルールへ反映する */
  const consume = (val: string): void => {
    if (!val) return;
    const norm = normalizeDigits(val);

    // "※熱中症特別警報等発令時：6ゲームマッチ（6-6タイブレ）"
    // 通常の回戦ルールではなく、警戒時に差し替える形式なので分けて保持する
    if (heatRe.test(norm)) {
      if (!ruleRe.test(norm) && !setRe.test(norm)) return;
      const body = val.split(/[：:]/).slice(1).join(':').trim() || val.trim();
      heat = {
        ruleText: body,
        games: extractGamesFromRuleText(body),
        matchFormat: setRe.test(normalizeDigits(body)) ? 'twoSetsSuper10' : 'game',
      };
      return;
    }

    // "ファイナルセット10ポイントマッチタイブレーク" — 直前のセットルールに付加
    if (superTbRe.test(norm)) {
      if (pendingSetRule) {
        pendingSetRule.ruleText += ' / ' + val;
        pendingSetRule.matchFormat = 'twoSetsSuper10';
      }
      return;
    }

    // "２タイブレークセット（6-6タイブレークデュース有）" — セットマッチ
    if (setRe.test(norm)) {
      const { roundLabel, ruleText } = splitRoundLabel(val);
      const rule: RoundGameRule = {
        roundLabel,
        ruleText,
        games: extractGamesFromRuleText(val) || 6,
        matchFormat: 'twoSetsSuper10', // デフォルト、ファイナル行で確定
      };
      rules.push(rule);
      pendingSetRule = rule;
      return;
    }

    // 通常のゲームマッチ（1セルに複数書かれている場合は分割する）
    if (ruleRe.test(norm)) {
      for (const chunk of splitRuleChunks(val)) {
        const { roundLabel, ruleText } = splitRoundLabel(chunk);
        rules.push({ roundLabel, ruleText, games: extractGamesFromRuleText(chunk) });
      }
      pendingSetRule = null;
    }
  };

  // ヘッダー行の matchFormat に含まれるルール
  consume(headerMatchFormat);

  // ヘッダー行の後続行をスキャン（最大5行）
  for (let r = headerRow + 1; r < Math.min(headerRow + 6, endRow); r++) {
    const row = rows[r];
    if (!row) continue;

    // 全カラムを結合してルールテキストを探す
    for (let c = 0; c < Math.min(row.length, 30); c++) {
      consume(cellStr(row, c));
    }

    // ドロー番号行に到達したら終了（選手データが始まった）
    const drawNum = cellNum(row, 0) ?? cellNum(row, 1);
    if (drawNum != null && drawNum >= 1 && Number.isInteger(drawNum)) break;
    // シード行に到達したら終了
    if (cellStr(row, 0).startsWith('シード')) break;
  }

  // 重複除去（同じruleTextは除く）
  const seen = new Set<string>();
  const deduped = rules.filter(r => {
    const key = `${r.roundLabel}::${r.ruleText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ドロー表に熱中症時の記載があれば全ルールへ付与する
  if (heat) {
    const h: { ruleText: string; games: number; matchFormat: MatchFormatType } = heat;
    for (const r of deduped) {
      r.heatRuleText = h.ruleText;
      r.heatGames = h.games;
      r.heatMatchFormat = h.matchFormat;
    }
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Seed parsing
// ---------------------------------------------------------------------------

/** シード表記1件（"1. 岸本・安田" → seed=1, tokens=["岸本","安田"]） */
interface SeedEntry {
  seed: number;
  tokens: string[];
}

/**
 * シード行を解析する。
 * 例: "シード 1.PlayerA 2.PlayerB"（シングルス）
 *     "シード 1. 岸本・安田 2. 小山・平木"（ダブルスは姓を「・」で連結）
 *     "シード 1.[全角スペース]森本・白石"（番号の後に全角スペースが入る書き方もある）
 */
function parseSeedText(text: string): SeedEntry[] {
  const entries: SeedEntry[] = [];
  // "1." の後の空白を許容し、次の番号（数字）の手前までを名前とみなす
  const re = /(\d+)\s*[.．]\s*([^\s\d.．][^\d.．]*)/g;
  const normalised = normalizeDigits(text);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalised)) !== null) {
    const seed = parseInt(m[1], 10);
    // 所属などの括弧書きは落とす
    const raw = normalizeName(m[2]).replace(/[（(][^）)]*[）)]?/g, '').trim();
    if (!raw) continue;
    const tokens = raw.split(/[・･／/]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length > 0) entries.push({ seed, tokens });
  }
  return entries;
}

/** シード表記のトークンが選手名と一致するか（"岸本" ↔ "岸本 健悟"） */
function seedTokenMatches(token: string, name: string): boolean {
  if (!token || !name) return false;
  const compactName = name.replace(/\s+/g, '');
  const compactToken = token.replace(/\s+/g, '');
  if (!compactToken) return false;
  if (compactName === compactToken) return true;
  // "岸本 健悟" に対して姓の "岸本" だけが書かれているケース
  if (name.split(/\s+/)[0] === compactToken) return true;
  // 姓名を区切らない表記（"吉識功太郎"）向けの前方一致。
  // 1文字だけの前方一致は誤判定しやすいので2文字以上に限る。
  return compactToken.length >= 2 && compactName.startsWith(compactToken);
}

// ---------------------------------------------------------------------------
// Column layouts
// ---------------------------------------------------------------------------

interface ColumnLayout {
  numCol: number;
  nameCol: number;
  openParenCol: number;
  affiliationCol: number;
  closeParenCol: number;
}

const SINGLES_LEFT: ColumnLayout = {
  numCol: 0,
  nameCol: 1,
  openParenCol: 2,
  affiliationCol: 3,
  closeParenCol: 4,
};

const SINGLES_RIGHT: ColumnLayout = {
  numCol: 19,
  nameCol: 20,
  openParenCol: 21,
  affiliationCol: 22,
  closeParenCol: 23,
};

const DOUBLES_LEFT: ColumnLayout = {
  numCol: 1,
  nameCol: 2,
  openParenCol: 3,
  affiliationCol: 4,
  closeParenCol: 5,
};

const DOUBLES_RIGHT: ColumnLayout = {
  numCol: 18,
  nameCol: 19,
  openParenCol: 20,
  affiliationCol: 21,
  closeParenCol: 22,
};

// ---------------------------------------------------------------------------
// 列レイアウトの動的検出
// ---------------------------------------------------------------------------
// 大会・種目によってドロー番号や氏名・所属の列位置が変わる（右山が17列始まり
// だったり19列始まりだったり、ダブルスで1列ずれたり）。固定列だと右山が丸ごと
// 読めない等の不具合が起きるため、実データからドロー番号の入った列を検出する。

/** セル値が1〜256の整数（ドロー番号らしき値）なら返す */
function asDrawNumber(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === 'number' && Number.isInteger(v)) n = v;
  else if (typeof v === 'string' && /^\d{1,3}$/.test(v.trim())) n = parseInt(v.trim(), 10);
  if (n != null && n >= 1 && n <= 256) return n;
  return null;
}

/**
 * 氏名列の次以降から「(」「所属」「)」の列を検出する。
 *
 * ドロー表によっては氏名・所属がセル結合で幅広に置かれ、所属がドロー番号列から
 * 8列も離れる（例: 番号=B, 氏名=C:H, "("=I, 所属=J:M, ")"=N）。番号列+2〜+4しか
 * 見ないと所属が全て空になるため、まず括弧だけが入った列を広めに探し、その直後の
 * 実テキスト列を所属列とみなす。括弧が無いドロー表では従来どおりの近傍探索に戻す。
 */
function detectEntryTextCols(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  numCol: number,
  limitCol: number,
): { openParenCol: number; affiliationCol: number; closeParenCol: number } {
  const searchEnd = Math.min(limitCol, numCol + 16);
  const openCount: Record<number, number> = {};
  const closeCount: Record<number, number> = {};
  const textCount: Record<number, number> = {};
  for (let c = numCol + 2; c < searchEnd; c++) {
    for (let r = startRow; r < endRow; r++) {
      const v = cellStr(rows[r], c);
      if (!v) continue;
      if (/^[（(]$/.test(v)) openCount[c] = (openCount[c] ?? 0) + 1;
      else if (/^[）)]$/.test(v)) closeCount[c] = (closeCount[c] ?? 0) + 1;
      else textCount[c] = (textCount[c] ?? 0) + 1;
    }
  }

  // 「(」だけが入った列が見つかれば、その直後の実テキスト列が所属列
  let openParenCol = -1;
  for (const key of Object.keys(openCount)) {
    const c = Number(key);
    if (openParenCol < 0 || openCount[c] > openCount[openParenCol]) openParenCol = c;
  }
  if (openParenCol >= 0) {
    let affiliationCol = -1;
    for (let c = openParenCol + 1; c < searchEnd; c++) {
      if ((textCount[c] ?? 0) > 0) { affiliationCol = c; break; }
    }
    if (affiliationCol < 0) affiliationCol = openParenCol + 1;
    let closeParenCol = -1;
    for (let c = affiliationCol + 1; c < searchEnd; c++) {
      if ((closeCount[c] ?? 0) > 0) { closeParenCol = c; break; }
    }
    if (closeParenCol < 0) closeParenCol = affiliationCol + 1;
    return { openParenCol, affiliationCol, closeParenCol };
  }

  // フォールバック: 氏名列の直後から実テキストが最多の列を所属とみなす
  let best = numCol + 3;
  let bestScore = -1;
  for (const c of [numCol + 2, numCol + 3, numCol + 4]) {
    const score = textCount[c] ?? 0;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return { openParenCol: numCol + 2, affiliationCol: best, closeParenCol: best + 1 };
}

/**
 * イベント区間からドロー番号の入った列（左山・右山）を検出してレイアウトを組む。
 * ドロー番号列 = 整数が多く入っている列。上位2列を左右の番号列とみなす。
 * 氏名は番号列+1、所属は括弧を避けて検出する。
 */
function detectDrawColumns(
  rows: unknown[][],
  startRow: number,
  endRow: number,
): { left: ColumnLayout | null; right: ColumnLayout | null } {
  const MAX_COL = 42;
  // ドロー番号列は必ず右隣（結合セルなら+2まで）に氏名が入る。この条件を課すことで
  // 勝敗数・順位などの数字列を拾わずに済み、番号が1個しか無い右山も検出できる。
  const numCounts: number[] = new Array(MAX_COL).fill(0);
  for (let r = startRow; r < endRow; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < MAX_COL; c++) {
      if (asDrawNumber(row[c]) == null) continue;
      const name = cellStr(row, c + 1) || cellStr(row, c + 2);
      if (!name || asDrawNumber(name) != null) continue;
      numCounts[c]++;
    }
  }

  const candidates: number[] = [];
  for (let c = 0; c < MAX_COL; c++) {
    if (numCounts[c] >= 1) candidates.push(c);
  }
  if (candidates.length === 0) return { left: null, right: null };

  // 左山 = 番号が最も多い列（同数なら左端）。
  // 右山 = 左山から十分離れた列のうち番号が最も多い列。
  // 「3個以上」で足切りすると、右山が2ペアしか無い種目（決勝のみ等）を丸ごと
  // 取りこぼすため、氏名を伴う番号が1個でもあれば候補とする。
  let leftNumCol = candidates[0];
  for (const c of candidates) {
    if (numCounts[c] > numCounts[leftNumCol]) leftNumCol = c;
  }
  const MIN_HALF_GAP = 6;
  let rightNumCol: number | null = null;
  for (const c of candidates) {
    if (c < leftNumCol + MIN_HALF_GAP) continue;
    if (rightNumCol == null || numCounts[c] > numCounts[rightNumCol]) rightNumCol = c;
  }

  const makeLayout = (numCol: number, limitCol: number): ColumnLayout => {
    const cols = detectEntryTextCols(rows, startRow, endRow, numCol, limitCol);
    return { numCol, nameCol: numCol + 1, ...cols };
  };

  return {
    left: makeLayout(leftNumCol, rightNumCol ?? MAX_COL),
    right: rightNumCol != null ? makeLayout(rightNumCol, MAX_COL) : null,
  };
}

/** 選手を検出しない空レイアウト（右山が存在しない種目用） */
const EMPTY_LAYOUT: ColumnLayout = {
  numCol: -1,
  nameCol: -1,
  openParenCol: -1,
  affiliationCol: -1,
  closeParenCol: -1,
};

// ---------------------------------------------------------------------------
// Player extraction
// ---------------------------------------------------------------------------

interface ExtractionResult {
  players: ParsedDrawPlayer[];
  entryRows: number[]; // 各エントリーの行インデックス（rows配列の0-basedインデックス）
}

function extractPlayersFromHalf(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  layout: ColumnLayout,
  isDoubles: boolean,
  positionOffset: number,
): ExtractionResult {
  const players: ParsedDrawPlayer[] = [];
  const entryRows: number[] = [];

  for (let r = startRow; r < endRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const drawNum = cellNum(row, layout.numCol);
    if (drawNum == null || drawNum < 1) continue;
    // Verify it looks like a sequential draw number (integer)
    if (!Number.isInteger(drawNum)) continue;

    const rawName = normalizeName(cellStr(row, layout.nameCol));
    const affiliation = cellStr(row, layout.affiliationCol);
    const bye = isBye(rawName);
    const name = bye ? '' : rawName;

    const player: ParsedDrawPlayer = {
      position: drawNum + positionOffset,
      name,
      affiliation: bye ? '' : affiliation,
      isBye: bye,
      seed: 0,
      row: r,
    };

    if (isDoubles && !bye) {
      // Partner is on the next row, same columns (name and affiliation only)
      const nextRow = rows[r + 1];
      if (nextRow) {
        const partnerName = normalizeName(cellStr(nextRow, layout.nameCol));
        const partnerAff = cellStr(nextRow, layout.affiliationCol);
        if (partnerName && !isBye(partnerName)) {
          player.partnerName = partnerName;
          player.partnerAffiliation = partnerAff;
        }
      }
    }

    players.push(player);
    entryRows.push(r);
  }

  return { players, entryRows };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseDrawExcel(
  data: ArrayBuffer,
  fileName: string,
): ParsedDrawFile {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });

  // Pick the sheet with the most data (or first)
  let bestSheet = wb.SheetNames[0];
  let bestCells = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const cells = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cells > bestCells) {
      bestCells = cells;
      bestSheet = name;
    }
  }

  const ws = wb.Sheets[bestSheet];
  const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
  });

  // ------------------------------------------------------------------
  // Step 1: Find event header rows
  // ------------------------------------------------------------------
  interface EventSection {
    headerRow: number;
    eventName: string;
    matchFormat: string;
  }

  const sections: EventSection[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    // イベントヘッダーは列Aまたは列Bにある（シングルス=A、ダブルス=B）
    const colA = cellStr(row, 0);
    const colB = cellStr(row, 1);
    const headerText = isEventHeader(colA) ? colA : isEventHeader(colB) ? colB : '';
    if (headerText) {
      // Look for match format in later columns on the same row
      let matchFormat = '';
      for (let c = 1; c < row.length; c++) {
        const val = cellStr(row, c);
        if (
          val &&
          (val.includes('ゲーム') ||
            val.includes('マッチ') ||
            val.includes('タイブレーク') ||
            val.includes('セット'))
        ) {
          matchFormat = val;
          break;
        }
      }
      sections.push({ headerRow: r, eventName: headerText, matchFormat });
    }
  }

  // ------------------------------------------------------------------
  // Step 2: Parse each event section
  // ------------------------------------------------------------------
  const events: ParsedDrawEvent[] = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const startRow = section.headerRow + 1;
    const endRow =
      si + 1 < sections.length ? sections[si + 1].headerRow : rows.length;

    const type = detectType(section.eventName);
    const isDoubles = type === 'Doubles';

    // Check for round-robin
    let isRoundRobin = false;
    for (let r = section.headerRow; r < Math.min(section.headerRow + 5, endRow); r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (cellStr(row, c).includes('決勝リーグ')) {
          isRoundRobin = true;
          break;
        }
      }
      if (isRoundRobin) break;
    }

    // 実データからドロー番号の入った列を検出（大会ごとの列ずれに対応）。
    // 検出できない場合のみ従来の固定レイアウトにフォールバックする。
    const detected = detectDrawColumns(rows, startRow, endRow);
    let leftLayout: ColumnLayout;
    let rightLayout: ColumnLayout;
    if (detected.left) {
      leftLayout = detected.left;
      rightLayout = detected.right ?? EMPTY_LAYOUT;
    } else {
      leftLayout = isDoubles ? DOUBLES_LEFT : SINGLES_LEFT;
      rightLayout = isDoubles ? DOUBLES_RIGHT : SINGLES_RIGHT;
    }

    // Extract players from left half
    const leftResult = extractPlayersFromHalf(
      rows,
      startRow,
      endRow,
      leftLayout,
      isDoubles,
      0,
    );
    const leftPlayers = leftResult.players;

    // Extract players from right half
    const rightResult = extractPlayersFromHalf(
      rows,
      startRow,
      endRow,
      rightLayout,
      isDoubles,
      0,
    );
    const rightPlayers = rightResult.players;

    // 左山・右山のブラケット領域（試合時刻が書かれる列範囲）
    const halfRanges = computeHalfColRanges(leftLayout, rightLayout);

    // 右山のドロー番号が左山と重複する（＝右山も1から振り直されている）ドロー表では、
    // 左山の最大番号だけずらして通し番号に揃える。
    if (leftPlayers.length > 0 && rightPlayers.length > 0) {
      const leftNums = new Set(leftPlayers.map((p) => p.position));
      if (rightPlayers.some((p) => leftNums.has(p.position))) {
        const leftMax = Math.max(...leftNums);
        for (const p of rightPlayers) p.position += leftMax;
      }
    }

    // ------------------------------------------------------------------
    // Calculate draw size and map entries to proper bracket positions
    // ------------------------------------------------------------------
    // Excelのブラケットエリアの試合時刻（ギャップ行）からR1ペアリングを
    // 検出し、エントリーを正しいブラケット位置にマッピングする。
    // R1で対戦するペアは同じペア枠に、walkoverはBYEとのペアに配置。
    let maxPosition = 0;
    for (const p of [...leftPlayers, ...rightPlayers]) {
      if (p.position > maxPosition) maxPosition = p.position;
    }
    const totalEntries = leftPlayers.length + rightPlayers.length;
    const drawSize = isRoundRobin
      ? totalEntries
      : nextPowerOf2(maxPosition || totalEntries);

    if (!isRoundRobin && drawSize > 2) {
      const halfSize = drawSize / 2;

      // エントリーをExcelドロー番号順にソート
      leftPlayers.sort((a, b) => a.position - b.position);
      rightPlayers.sort((a, b) => a.position - b.position);

      // 明示的BYEエントリー（"ｂｙｅ"等）を除外してからR1検出・位置割り当て
      // 除外しないとBYEがペア枠を消費してスロットが溢れる
      // 行番号は各エントリーが保持している row をそのまま使う（並べ替えても崩れない）
      const leftReal = leftPlayers.filter(p => !p.isBye);
      const leftRealRows = leftReal.map(p => p.row ?? 0);
      const rightReal = rightPlayers.filter(p => !p.isBye);
      const rightRealRows = rightReal.map(p => p.row ?? 0);

      // 各半分のBYE数を計算（実選手数ベース）
      const leftByeCount = Math.max(0, halfSize - leftReal.length);
      const rightByeCount = Math.max(0, halfSize - rightReal.length);

      // 各半分がブラケット全体を明示しているか判定。
      // シート上にBYE行を含めてhalfSize個ぶんのエントリが並んでいる場合、
      // ドロー番号がそのまま正しいブラケット位置を表す（手書きで完成したドロー）。
      // この場合はR1ペアリング再計算をせず、抽出済み位置をそのまま採用する。
      // 再計算すると、BYEで不戦勝の選手を次戦の相手とR1ペアと誤検出し、
      // BYEスロットが詰められて以降の選手が繰り上がってしまう。
      const leftPreFilled = leftPlayers.length === halfSize;
      const rightPreFilled = rightPlayers.length === halfSize;

      // --- 左半分 ---
      if (leftPreFilled) {
        // 抽出済み位置(1..halfSize)をそのまま使用。BYE行の位置は空きスロットになる。
      } else if (leftByeCount > 0) {
        // Excelの試合時刻からR1ペアリングを検出してブラケット位置を割り当て
        assignPositionsFromR1Pairings(
          leftReal, leftRealRows, halfSize, 0, rows, 'left', halfRanges.left,
        );
      } else {
        // BYE不要の場合: 連番でそのまま配置
        for (let i = 0; i < leftReal.length; i++) {
          leftReal[i].position = i + 1;
        }
      }

      // --- 右半分 ---
      if (rightPreFilled) {
        // 抽出済み位置(halfSize+1..drawSize)をそのまま使用。
      } else if (rightByeCount > 0) {
        assignPositionsFromR1Pairings(
          rightReal, rightRealRows, halfSize, halfSize, rows, 'right', halfRanges.right,
        );
      } else {
        for (let i = 0; i < rightReal.length; i++) {
          rightReal[i].position = halfSize + i + 1;
        }
      }

      // 明示的BYEエントリーを除外した実選手のみで構成
      leftPlayers.length = 0;
      leftPlayers.push(...leftReal);
      rightPlayers.length = 0;
      rightPlayers.push(...rightReal);
    }

    const allPlayers = [...leftPlayers, ...rightPlayers];

    // Sort by position
    allPlayers.sort((a, b) => a.position - b.position);

    // ------------------------------------------------------------------
    // Parse seeds
    // ------------------------------------------------------------------
    const seedEntries: SeedEntry[] = [];
    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      if (!row) continue;
      // Seeds can appear in column A or concatenated across multiple cells
      for (let c = 0; c < Math.min(row.length, 30); c++) {
        const val = cellStr(row, c);
        if (val.startsWith('シード')) {
          // Combine all cells on this row for the full seed text
          const fullText = row.map((cell) => (cell != null ? String(cell) : '')).join(' ');
          seedEntries.push(...parseSeedText(fullText));
          break;
        }
      }
    }

    // Apply seeds to players.
    // ダブルスのシード表記は「姓・姓」なので、ペアの2名の姓が両方一致したときだけ採用する。
    for (const player of allPlayers) {
      if (player.isBye || !player.name) continue;
      const names = [player.name, player.partnerName].filter(
        (n): n is string => !!n,
      );
      for (const entry of seedEntries) {
        if (entry.tokens.length >= 2 && names.length < 2) continue;
        const matched = entry.tokens.every((tok) =>
          names.some((n) => seedTokenMatches(tok, n)),
        );
        if (!matched) continue;
        player.seed = entry.seed;
        break;
      }
    }

    // ゲームルール解析
    const roundGameRules = parseGameRules(rows, section.headerRow, endRow, section.matchFormat);

    // 実選手が1人もいない種目（誤検出したタイトル行など）は取り込まない
    if (!allPlayers.some((p) => !p.isBye)) continue;

    // 1回戦の各試合の開始時刻をドロー表から抽出
    const matchTimes = extractR1MatchTimes(rows, allPlayers, drawSize, leftLayout, rightLayout);
    // 2回戦以降の開始時刻も抽出（ドロー表に記載がある場合）
    const roundMatchTimes = isRoundRobin
      ? {}
      : extractLaterRoundMatchTimes(rows, allPlayers, drawSize, matchTimes, leftLayout, rightLayout);

    // 「決勝リーグ 11：00開始予定」のような文章記載の開始時刻（主にリーグ戦）
    const eventStartTime = extractEventStartTimeText(rows, section.headerRow, endRow);

    events.push({
      eventName: section.eventName,
      matchFormat: section.matchFormat,
      type,
      drawSize,
      players: allPlayers,
      isRoundRobin,
      roundGameRules,
      matchTimes,
      roundMatchTimes,
      eventStartTime: eventStartTime || undefined,
    });
  }

  // ------------------------------------------------------------------
  // Step 3: Extract tournament info (name, date, venue) from header rows
  // ------------------------------------------------------------------
  let tournamentName = '';
  let date = '';
  let venue = '';
  let reserveDate = '';
  let reserveVenue = '';

  /** 日付文字列から M/D 形式を抽出（全角数字対応） */
  function extractDate(src: string): string {
    const s = normalizeDigits(src);
    // 令和・平成年号（例: 令和8年3月22日）
    const era = s.match(/[令平]和\d{1,2}年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (era) return `${era[1]}/${era[2]}`;
    // 西暦（例: 2026年3月22日, 2026/3/22）
    const full = s.match(/\d{4}[年\/\-\.]\s*(\d{1,2})[月\/\-\.]\s*(\d{1,2})日?/);
    if (full) return `${full[1]}/${full[2]}`;
    // 月日（例: 3月22日, 3/22）
    const md = s.match(/(\d{1,2})[月\/]\s*(\d{1,2})日?/);
    if (md) return `${md[1]}/${md[2]}`;
    return '';
  }

  // ヘッダー行（最初のイベントヘッダーより前）を探索
  const headerEnd = sections.length > 0 ? sections[0].headerRow : Math.min(rows.length, 15);
  for (let r = 0; r < headerEnd; r++) {
    const row = rows[r];
    if (!row) continue;

    // 行内のラベルセル（「期日」「会場」）を検出して値セルを読む
    let rowLabel = '';
    let rowValue = '';
    for (let c = 0; c < row.length; c++) {
      const rawVal = row[c];
      if (rawVal == null) continue;
      const s = String(rawVal).replace(/\s+/g, '').trim();
      if (/^期日$/.test(s)) rowLabel = 'date';
      else if (/^会場$/.test(s)) rowLabel = 'venue';
    }
    // ラベルの後ろにある最も長いセルを値とする
    if (rowLabel) {
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v == null) continue;
        const s = String(v).trim();
        if (s.length > rowValue.length && !/^(期\s*日|会\s*場|主\s*催|主\s*管|運\s*営)$/.test(s.replace(/\s+/g, ''))) {
          rowValue = s;
        }
      }
    }

    if (rowLabel === 'date' && rowValue) {
      // 日付と予備日が1セルにまとめて入っている場合を分割
      // 例: "令和８年３月22日（日）予備日：３月28日(土)"
      const parts = rowValue.split(/予備日[：:]?\s*/);
      if (!date) date = extractDate(parts[0]);
      if (!reserveDate && parts[1]) reserveDate = extractDate(parts[1]);
      continue;
    }

    if (rowLabel === 'venue' && rowValue) {
      // 会場と予備日会場が1セルの場合を分割
      // 例: "ヤマタスポーツパーク・テニスコート\n予備日:千代コート"
      // 例: "ヤマタ･スポーツパーク（予備日:千代コート）" のように括弧内に予備日会場が
      // 書かれる場合があるため、分割後に余った括弧を落とす
      const venueParts = rowValue.split(/予備日[：:]?\s*/);
      const cleanVenue = (v: string) =>
        v.replace(/\n/g, ' ').replace(/^[\s（(]+/, '').replace(/[\s（()）]+$/, '').trim();
      if (!venue) venue = cleanVenue(venueParts[0]);
      if (!reserveVenue && venueParts[1]) reserveVenue = cleanVenue(venueParts[1]);
      continue;
    }

    // ラベルなし行のフォールバック検出
    for (let c = 0; c < row.length; c++) {
      const rawVal = row[c];
      if (rawVal == null) continue;

      // Date型（Excelの日付セル）
      if (!date && rawVal instanceof Date && !isNaN(rawVal.getTime())) {
        date = `${rawVal.getMonth() + 1}/${rawVal.getDate()}`;
        continue;
      }

      // Excelシリアル値
      if (!date && typeof rawVal === 'number' && rawVal > 30000 && rawVal < 60000) {
        const epoch = new Date((rawVal - 25569) * 86400000);
        if (!isNaN(epoch.getTime())) {
          date = `${epoch.getMonth() + 1}/${epoch.getDate()}`;
          continue;
        }
      }

      const val = String(rawVal).trim();
      if (!val) continue;

      // 大会名
      const norm = normalizeDigits(val);
      if (!tournamentName && /第\d+回|大会|選手権|オープン/.test(norm)) {
        tournamentName = val;
      }

      // 日付（ラベルなし行）
      if (!date) {
        const d = extractDate(val);
        if (d) { date = d; continue; }
      }

      // 会場（ラベルなし行）
      if (!venue && /コート|パーク|体育館|テニス場|運動公園|市民|スポーツ|アリーナ|センター/.test(val)) {
        venue = val;
      }
    }
  }

  // ドロー表の開始時刻から、最早時刻と同時進行試合数（＝コート数の目安）を算出。
  // 種目ごとに抽出済みの試合時刻が使える場合は、そちらを数えたほうが正確。
  // （時刻セルを総当りで数えると、注意事項などに書かれた時刻まで拾ってしまう）
  let earliestStartTime = '';
  let suggestedCourtCount = 0;
  const allMatchTimes: string[] = [];
  for (const ev of events) {
    allMatchTimes.push(...Object.values(ev.matchTimes));
    allMatchTimes.push(...Object.values(ev.roundMatchTimes));
  }
  if (allMatchTimes.length > 0) {
    earliestStartTime = allMatchTimes.reduce((a, b) => (b < a ? b : a));
    // 全種目は同じ会場で並行して進むため、最早時刻に始まる試合数の合計が必要コート数
    suggestedCourtCount = allMatchTimes.filter((t) => t === earliestStartTime).length;
  } else {
    ({ earliestStartTime, suggestedCourtCount } = analyzeStartTimes(
      rows,
      sections.map((s) => s.headerRow),
    ));
  }

  return {
    fileName,
    sheetName: bestSheet,
    events,
    tournamentName,
    date,
    venue,
    reserveDate,
    reserveVenue,
    earliestStartTime,
    suggestedCourtCount,
  };
}
