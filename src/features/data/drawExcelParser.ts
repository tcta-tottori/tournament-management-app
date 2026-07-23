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
    // cellDates:true の時刻セルはUTC基準で格納される
    return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
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
  const leftNameCol = leftLayout.nameCol >= 0 ? leftLayout.nameCol : 1;
  const rightNumCol = rightLayout.numCol >= 0 ? rightLayout.numCol : leftNameCol + 18;
  const centerCol = Math.round((leftNameCol + rightNumCol) / 2);

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
    const cStart = isLeft ? 0 : centerCol + 1;
    const cEnd = isLeft ? centerCol - 1 : rightNumCol - 1;
    let time = '';
    for (let r = lo; r <= hi && !time; r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = cStart; c <= cEnd && c < row.length; c++) {
        const hm = timeValueToHM(row[c]);
        if (hm) { time = hm; break; }
      }
    }
    if (time) result[a] = time;
  }
  return result;
}

/**
 * Excelブラケットエリアのギャップ行（エントリー間の行）に
 * 試合時刻があるかどうかを調べ、R1ペアリングを検出する。
 *
 * @param rows - シートの全行データ
 * @param entryRows - 各エントリーの行インデックス（0-based, rows配列のインデックス）
 * @param side - 'left' | 'right'
 * @returns R1で対戦するエントリーのインデックスペア配列 (entryRows内のインデックス)
 */
function detectR1Pairings(
  rows: unknown[][],
  entryRows: number[],
  side: 'left' | 'right',
): number[] {
  if (entryRows.length < 2) return [];

  // ブラケットエリアの列範囲 (0-indexed)
  const colRange = side === 'left'
    ? { start: 5, end: 12 }  // cols F(5) to M(12)
    : { start: 13, end: 18 }; // cols N(13) to S(18)

  // 各ギャップ行で時刻セルを探し、最も外側の列（R1列）を特定
  interface GapInfo {
    entryIdx: number; // entryRows内のインデックス（上側エントリー）
    gapRow: number;
    timeCols: number[];
  }

  const gaps: GapInfo[] = [];
  let allTimeCols = new Set<number>();

  for (let i = 0; i < entryRows.length - 1; i++) {
    // エントリー間の全行をスキャン（ダブルスではパートナー行があるため+1だけでは不十分）
    const scanStart = entryRows[i] + 1;
    const scanEnd = entryRows[i + 1];

    for (let gapRow = scanStart; gapRow < scanEnd; gapRow++) {
      const row = rows[gapRow];
      if (!row) continue;

      const timeCols: number[] = [];
      for (let c = colRange.start; c <= colRange.end; c++) {
        if (isTimeValue(row[c])) {
          timeCols.push(c);
          allTimeCols.add(c);
        }
      }

      if (timeCols.length > 0) {
        gaps.push({ entryIdx: i, gapRow, timeCols });
        break; // このエントリーペア間で最初の時刻行を採用
      }
    }
  }

  if (allTimeCols.size === 0) return [];

  // R1列 = 左側は最小列、右側は最大列（ブラケットの最外側）
  const r1Col = side === 'left'
    ? Math.min(...allTimeCols)
    : Math.max(...allTimeCols);

  // R1列に時刻があるギャップ → そのエントリーペアがR1で対戦
  const r1PairIndices: number[] = [];
  for (const gap of gaps) {
    if (gap.timeCols.includes(r1Col)) {
      r1PairIndices.push(gap.entryIdx);
    }
  }

  return r1PairIndices;
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
  _halfSize: number,
  halfOffset: number,
  rows: unknown[][],
  side: 'left' | 'right',
): void {
  if (players.length === 0) return;

  const r1PairIndices = detectR1Pairings(rows, entryRows, side);
  const r1Set = new Set(r1PairIndices);

  // ブラケット位置を順番に割り当て
  let pos = halfOffset + 1; // 1-indexed
  let i = 0;

  while (i < players.length) {
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
 * イベントヘッダー周辺からゲームルールをパースする。
 * パターン:
 *   1) 同行の後方カラムにルール ("8ゲームマッチ（8-8タイブレーク）")
 *   2) 次行にルール ("8ゲームマッチ（8-8タイブレーク）")
 *   3) 同行または次行に回戦別ルール ("１～２回戦　8ゲームマッチ...") + その次行にも別ルール
 */
function parseGameRules(
  rows: unknown[][],
  headerRow: number,
  endRow: number,
  headerMatchFormat: string,
): RoundGameRule[] {
  const rules: RoundGameRule[] = [];
  const ruleRe = /(\d+)\s*ゲームマッチ/;
  const setRe = /タイブレークセット|セットマッチ/;
  const superTbRe = /ファイナル.*タイブレーク|10\s*ポイント/;
  const roundPrefixRe = /^(.*(?:回戦|決勝|以降))\s+/;

  // ヘッダー行の matchFormat に含まれるルール
  if (headerMatchFormat) {
    const normHdr = normalizeDigits(headerMatchFormat);
    if (ruleRe.test(normHdr)) {
      const roundMatch = roundPrefixRe.exec(headerMatchFormat);
      rules.push({
        roundLabel: roundMatch ? roundMatch[1] : '全回戦',
        ruleText: headerMatchFormat,
        games: extractGamesFromRuleText(headerMatchFormat),
      });
    } else if (setRe.test(normHdr)) {
      // セットマッチ形式（ヘッダー行に含まれるケース）
      rules.push({
        roundLabel: '全回戦',
        ruleText: headerMatchFormat,
        games: extractGamesFromRuleText(headerMatchFormat) || 6,
        matchFormat: 'twoSetsSuper10',
      });
    }
  }

  // ヘッダー行の後続行をスキャン（最大5行）
  let pendingSetRule: RoundGameRule | null = null;
  for (let r = headerRow + 1; r < Math.min(headerRow + 6, endRow); r++) {
    const row = rows[r];
    if (!row) continue;

    // 全カラムを結合してルールテキストを探す
    for (let c = 0; c < Math.min(row.length, 30); c++) {
      const val = cellStr(row, c);
      if (!val) continue;
      const norm = normalizeDigits(val);

      // "ファイナルセット10ポイントマッチタイブレーク" — 直前のセットルールに付加
      if (superTbRe.test(norm)) {
        if (pendingSetRule) {
          pendingSetRule.ruleText += ' / ' + val;
          pendingSetRule.matchFormat = 'twoSetsSuper10';
        }
        continue;
      }

      // "２タイブレークセット（6-6タイブレークデュース有）" — セットマッチ
      if (setRe.test(norm)) {
        const roundMatch = roundPrefixRe.exec(val);
        const ruleText = roundMatch ? val.replace(roundMatch[1], '').trim() : val;
        const rule: RoundGameRule = {
          roundLabel: roundMatch ? roundMatch[1] : '全回戦',
          ruleText: ruleText,
          games: extractGamesFromRuleText(val) || 6,
          matchFormat: 'twoSetsSuper10', // デフォルト、ファイナル行で確定
        };
        rules.push(rule);
        pendingSetRule = rule;
        continue;
      }

      // 通常のゲームマッチ
      if (ruleRe.test(norm)) {
        const roundMatch = roundPrefixRe.exec(val);
        const ruleText = roundMatch ? val.replace(roundMatch[1], '').trim() : val;
        rules.push({
          roundLabel: roundMatch ? roundMatch[1] : '全回戦',
          ruleText: ruleText,
          games: extractGamesFromRuleText(val),
        });
        pendingSetRule = null;
      }
    }

    // ドロー番号行に到達したら終了（選手データが始まった）
    const drawNum = cellNum(row, 0) ?? cellNum(row, 1);
    if (drawNum != null && drawNum >= 1 && Number.isInteger(drawNum)) break;
    // シード行に到達したら終了
    if (cellStr(row, 0).startsWith('シード')) break;
  }

  // 重複除去（同じruleTextは除く）
  const seen = new Set<string>();
  return rules.filter(r => {
    const key = `${r.roundLabel}::${r.ruleText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Seed parsing
// ---------------------------------------------------------------------------

/**
 * Parse seed text like "シード　1.PlayerA 2.PlayerB 3.PlayerC"
 * Returns a Map<name, seedNumber>.
 */
function parseSeedText(text: string): Map<string, number> {
  const seeds = new Map<string, number>();
  // Match patterns like "1.Name" or "１．Name"
  const re = /(\d+)[.．]([^\s\d.．]+(?:\s+[^\s\d.．]+)?)/g;
  // Normalise full-width digits to half-width
  const normalised = text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalised)) !== null) {
    const seedNum = parseInt(m[1], 10);
    const name = normalizeName(m[2]);
    if (name) seeds.set(name, seedNum);
  }
  return seeds;
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

/** 氏名列の次以降から所属列を検出（括弧のみのセルは除外して実テキストが最多の列） */
function detectAffiliationCol(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  numCol: number,
): number {
  let best = numCol + 3;
  let bestScore = -1;
  for (const c of [numCol + 2, numCol + 3, numCol + 4]) {
    let score = 0;
    for (let r = startRow; r < endRow; r++) {
      const v = cellStr(rows[r], c);
      if (!v) continue;
      if (/^[（）()]$/.test(v)) continue; // 括弧のみのセルは所属ではない
      score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
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
  const MAX_COL = 40;
  const intCounts: number[] = new Array(MAX_COL).fill(0);
  for (let r = startRow; r < endRow; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < MAX_COL; c++) {
      if (asDrawNumber(row[c]) != null) intCounts[c]++;
    }
  }

  // 整数が3個以上入っている列を候補とする
  const candidates: number[] = [];
  for (let c = 0; c < MAX_COL; c++) {
    if (intCounts[c] >= 3) candidates.push(c);
  }
  if (candidates.length === 0) return { left: null, right: null };

  // 整数の多い上位2列を左右のドロー番号列とみなす（列インデックス昇順で左→右）
  candidates.sort((a, b) => intCounts[b] - intCounts[a]);
  const top = candidates.slice(0, 2).sort((a, b) => a - b);
  const leftNumCol = top[0];
  const rightNumCol = top.length > 1 ? top[1] : null;

  const makeLayout = (numCol: number): ColumnLayout => ({
    numCol,
    nameCol: numCol + 1,
    openParenCol: numCol + 2,
    affiliationCol: detectAffiliationCol(rows, startRow, endRow, numCol),
    closeParenCol: numCol + 4,
  });

  return {
    left: makeLayout(leftNumCol),
    right: rightNumCol != null ? makeLayout(rightNumCol) : null,
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
    const leftEntryRows = leftResult.entryRows;

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
    const rightEntryRows = rightResult.entryRows;

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
      const leftReal = leftPlayers.filter(p => !p.isBye);
      const leftRealRows = leftEntryRows.filter((_, idx) => !leftPlayers[idx]?.isBye);
      const rightReal = rightPlayers.filter(p => !p.isBye);
      const rightRealRows = rightEntryRows.filter((_, idx) => !rightPlayers[idx]?.isBye);

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
          leftReal, leftRealRows, halfSize, 0, rows, 'left',
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
          rightReal, rightRealRows, halfSize, halfSize, rows, 'right',
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
    const seedMap = new Map<string, number>();
    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      if (!row) continue;
      // Seeds can appear in column A or concatenated across multiple cells
      for (let c = 0; c < Math.min(row.length, 30); c++) {
        const val = cellStr(row, c);
        if (val.startsWith('シード')) {
          // Combine all cells on this row for the full seed text
          const fullText = row.map((cell) => (cell != null ? String(cell) : '')).join(' ');
          const parsed = parseSeedText(fullText);
          for (const [name, num] of parsed) {
            seedMap.set(name, num);
          }
          break;
        }
      }
    }

    // Apply seeds to players
    for (const player of allPlayers) {
      if (player.name && seedMap.has(player.name)) {
        player.seed = seedMap.get(player.name)!;
      }
      // Also check for doubles first player name
      if (player.partnerName && seedMap.has(player.partnerName)) {
        // In doubles, seeds apply to the pair; use the draw entry player
      }
    }

    // ゲームルール解析
    const roundGameRules = parseGameRules(rows, section.headerRow, endRow, section.matchFormat);

    // 実選手が1人もいない種目（誤検出したタイトル行など）は取り込まない
    if (!allPlayers.some((p) => !p.isBye)) continue;

    // 1回戦の各試合の開始時刻をドロー表から抽出
    const matchTimes = extractR1MatchTimes(rows, allPlayers, drawSize, leftLayout, rightLayout);

    events.push({
      eventName: section.eventName,
      matchFormat: section.matchFormat,
      type,
      drawSize,
      players: allPlayers,
      isRoundRobin,
      roundGameRules,
      matchTimes,
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
      const venueParts = rowValue.split(/予備日[：:]?\s*/);
      if (!venue) venue = venueParts[0].replace(/\n/g, ' ').trim();
      if (!reserveVenue && venueParts[1]) reserveVenue = venueParts[1].replace(/\n/g, ' ').trim();
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

  // ドロー表の開始時刻から、最早時刻と同時進行試合数（＝コート数の目安）を算出
  const { earliestStartTime, suggestedCourtCount } = analyzeStartTimes(
    rows,
    sections.map((s) => s.headerRow),
  );

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
