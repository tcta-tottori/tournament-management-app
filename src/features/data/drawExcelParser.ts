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

export interface ParsedDrawEvent {
  eventName: string;
  matchFormat: string;
  type: 'Singles' | 'Doubles';
  drawSize: number;
  players: ParsedDrawPlayer[];
  isRoundRobin: boolean;
}

export interface ParsedDrawFile {
  fileName: string;
  sheetName: string;
  events: ParsedDrawEvent[];
  tournamentName: string;
  date: string;
  venue: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const wb = XLSX.read(data, { type: 'array' });

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

    events.push({
      eventName: section.eventName,
      matchFormat: section.matchFormat,
      type,
      drawSize,
      players: allPlayers,
      isRoundRobin,
    });
  }

  // ------------------------------------------------------------------
  // Step 3: Extract tournament info (name, date, venue) from header rows
  // ------------------------------------------------------------------
  let tournamentName = '';
  let date = '';
  let venue = '';

  // ヘッダー行（最初のイベントヘッダーより前）を探索
  const headerEnd = sections.length > 0 ? sections[0].headerRow : Math.min(rows.length, 10);
  for (let r = 0; r < headerEnd; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = cellStr(row, c);
      if (!val) continue;

      // 大会名（「第○回」「○○大会」「○○選手権」を含む行）
      if (!tournamentName && /第\d+回|大会|選手権|オープン/.test(val)) {
        tournamentName = val;
      }

      // 日程（「月」「日」を含む日付パターン、または「/」区切り）
      if (!date) {
        const dateMatch = val.match(
          /(\d{4}[年\/\-\.]\s*\d{1,2}[月\/\-\.]\s*\d{1,2}日?)|(\d{1,2}[月\/]\s*\d{1,2}日?(?:\s*[（(][日月火水木金土][）)])?)/
        );
        if (dateMatch) {
          date = dateMatch[0];
        }
      }

      // 会場（「コート」「パーク」「体育館」「テニス場」等を含む）
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
  };
}
