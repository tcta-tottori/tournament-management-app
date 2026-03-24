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
    const gapRow = entryRows[i] + 1;
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
  return EVENT_KEYWORDS.some((kw) => text.includes(kw));
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
    const colA = cellStr(row, 0);
    if (isEventHeader(colA)) {
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
      sections.push({ headerRow: r, eventName: colA, matchFormat });
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

    const leftLayout = isDoubles ? DOUBLES_LEFT : SINGLES_LEFT;
    const rightLayout = isDoubles ? DOUBLES_RIGHT : SINGLES_RIGHT;

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

      // 各半分のBYE数を計算
      const leftByeCount = Math.max(0, halfSize - leftPlayers.length);
      const rightByeCount = Math.max(0, halfSize - rightPlayers.length);

      if (leftByeCount > 0 || rightByeCount > 0) {
        // Excelの試合時刻からR1ペアリングを検出してブラケット位置を割り当て
        assignPositionsFromR1Pairings(
          leftPlayers, leftEntryRows, halfSize, 0, rows, 'left',
        );
        assignPositionsFromR1Pairings(
          rightPlayers, rightEntryRows, halfSize, halfSize, rows, 'right',
        );
      } else {
        // BYE不要の場合: 連番でそのまま配置
        for (let i = 0; i < leftPlayers.length; i++) {
          leftPlayers[i].position = i + 1;
        }
        for (let i = 0; i < rightPlayers.length; i++) {
          rightPlayers[i].position = halfSize + i + 1;
        }
      }
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

    events.push({
      eventName: section.eventName,
      matchFormat: section.matchFormat,
      type,
      drawSize,
      players: allPlayers,
      isRoundRobin,
      roundGameRules,
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

  return {
    fileName,
    sheetName: bestSheet,
    events,
    tournamentName,
    date,
    venue,
    reserveDate,
    reserveVenue,
  };
}
