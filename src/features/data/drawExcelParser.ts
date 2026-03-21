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

function extractPlayersFromHalf(
  rows: unknown[][],
  startRow: number,
  endRow: number,
  layout: ColumnLayout,
  isDoubles: boolean,
  positionOffset: number,
): ParsedDrawPlayer[] {
  const players: ParsedDrawPlayer[] = [];

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
  }

  return players;
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
    const leftPlayers = extractPlayersFromHalf(
      rows,
      startRow,
      endRow,
      leftLayout,
      isDoubles,
      0, // positions are as-is from the draw numbers
    );

    // Extract players from right half
    const rightPlayers = extractPlayersFromHalf(
      rows,
      startRow,
      endRow,
      rightLayout,
      isDoubles,
      0, // right half draw numbers already account for offset in the Excel
    );

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

    // ------------------------------------------------------------------
    // Calculate draw size
    // ------------------------------------------------------------------
    let maxPosition = 0;
    for (const p of allPlayers) {
      if (p.position > maxPosition) maxPosition = p.position;
    }
    const drawSize = isRoundRobin
      ? allPlayers.length
      : nextPowerOf2(maxPosition || allPlayers.length);

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
