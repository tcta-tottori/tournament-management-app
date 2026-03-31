import * as XLSX from 'xlsx';
import type { MixedLeague, MixedTeam, MixedPlayer, LeagueMatchScore, MatchOrderEntry, TournamentInfo } from './types';

/** 4チームリーグの対戦順 */
const MATCH_ORDER_4: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 3, team2Index: 4 },
  { matchNumber: 3, team1Index: 1, team2Index: 3 },
  { matchNumber: 4, team1Index: 2, team2Index: 4 },
  { matchNumber: 5, team1Index: 1, team2Index: 4 },
  { matchNumber: 6, team1Index: 2, team2Index: 3 },
];

/** 5チームリーグの対戦順 */
const MATCH_ORDER_5: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 3, team2Index: 4 },
  { matchNumber: 3, team1Index: 1, team2Index: 5 },
  { matchNumber: 4, team1Index: 2, team2Index: 3 },
  { matchNumber: 5, team1Index: 1, team2Index: 4 },
  { matchNumber: 6, team1Index: 2, team2Index: 5 },
  { matchNumber: 7, team1Index: 3, team2Index: 5 },
  { matchNumber: 8, team1Index: 2, team2Index: 4 },
  { matchNumber: 9, team1Index: 4, team2Index: 5 },
  { matchNumber: 10, team1Index: 1, team2Index: 3 },
];

/** セルの値を安全に取得 */
function cellVal(ws: XLSX.WorkSheet, ref: string): string {
  const cell = ws[ref];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

/** 列番号→列名 (0=A, 1=B, ...) */
function colName(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** 姓を抽出 */
function extractLastName(fullName: string): string {
  const parts = fullName.replace(/\u3000/g, ' ').trim().split(/\s+/);
  return parts[0] || fullName;
}

// ============================================================
// 予選リーグシートから直接パース（リストシート不要）
// ============================================================

/** リーグ行を検出 */
interface LeagueRow {
  leagueId: string;
  row: number;       // リーグヘッダー行 (男子名がある行)
  courtRow: number;  // コート行 (女子名がある行)
  courtName: string;
}

function detectLeagueRows(ws: XLSX.WorkSheet): LeagueRow[] {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const results: LeagueRow[] = [];

  for (let r = 0; r <= range.e.r; r++) {
    const bVal = cellVal(ws, `B${r + 1}`);
    if (!bVal) continue;
    // "A リーグ", "Aリーグ", "I  リーグ" etc.
    const m = bVal.match(/^([A-Z])\s*リーグ$/);
    if (m) {
      const courtRow = r + 2; // 次の行
      // コート名を探す: 次の行、または数行先まで探索
      let courtName = '';
      for (let cr = courtRow; cr <= Math.min(courtRow + 2, range.e.r + 1); cr++) {
        const cv = cellVal(ws, `B${cr}`);
        if (cv && cv.replace(/[\r\n]/g, '').includes('コート')) {
          courtName = cv.replace(/[\r\n]/g, '').trim();
          break;
        }
        if (cv && !cv.includes('リーグ') && !cv.includes('■')) {
          courtName = cv.replace(/[\r\n]/g, '').trim();
          break;
        }
      }
      results.push({
        leagueId: m[1],
        row: r + 1,       // 1-based
        courtRow,
        courtName,
      });
    }
  }

  return results;
}

/** 行の中から番号付きチームデータを検出し、列位置パターンを自動検出 */
interface DetectedTeam {
  pairNumber: number;
  maleName: string;
  maleAffiliation: string;
  femaleName: string;
  femaleAffiliation: string;
}

function extractTeamsFromRows(ws: XLSX.WorkSheet, maleRow: number, femaleRow: number): DetectedTeam[] {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const teams: DetectedTeam[] = [];

  // 行をスキャンして、数値セルの位置を見つける → その右が名前、さらに右が所属
  for (let c = 0; c <= range.e.c; c++) {
    const ref = colName(c) + maleRow;
    const cell = ws[ref];
    if (!cell) continue;
    const val = cell.v;
    // 数値セルがチーム番号
    if (typeof val === 'number' && val >= 1 && val <= 200) {
      const pairNumber = val;
      // 番号の次の列から名前・所属を探す
      let maleName = '';
      let maleAffiliation = '';
      let femaleName = '';
      let femaleAffiliation = '';

      // 名前を探す: 番号の右側の列を順にチェック
      for (let nc = c + 1; nc <= Math.min(c + 5, range.e.c); nc++) {
        const nVal = cellVal(ws, colName(nc) + maleRow);
        if (nVal && !maleName) {
          maleName = nVal;
        } else if (nVal && maleName && !maleAffiliation) {
          maleAffiliation = nVal;
          break;
        }
      }

      // 女子名（次の行の同じ列付近）
      for (let nc = c + 1; nc <= Math.min(c + 5, range.e.c); nc++) {
        const nVal = cellVal(ws, colName(nc) + femaleRow);
        if (nVal && !femaleName) {
          femaleName = nVal;
        } else if (nVal && femaleName && !femaleAffiliation) {
          femaleAffiliation = nVal;
          break;
        }
      }

      if (maleName) {
        teams.push({ pairNumber, maleName, maleAffiliation, femaleName, femaleAffiliation });
      }
    }
  }

  return teams;
}

/** 5チームリーグの5チーム目を検出（リーグヘッダーの後方にあるケース） */
function extractFifthTeam(ws: XLSX.WorkSheet, startRow: number, nextLeagueRow: number | null): DetectedTeam | null {
  // courtRow+1 から次のリーグヘッダーまでの間に追加チームがないか探す
  // ※5チーム目はコート名と同じ行(courtRow+1)に配置されていることがある
  const endRow = nextLeagueRow ? nextLeagueRow - 1 : startRow + 6;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  for (let r = startRow + 1; r <= Math.min(endRow, range.e.r + 1); r++) {
    const bVal = cellVal(ws, `B${r}`);
    if ((bVal && bVal.match(/^[A-Z]\s*リーグ$/)) || (bVal && bVal.includes('■'))) break;

    const teams = extractTeamsFromRows(ws, r, r + 1);
    if (teams.length >= 1) {
      return teams[0];
    }
  }
  return null;
}

// ============================================================
// 大会情報パース
// ============================================================

function parseTournamentInfo(wb: XLSX.WorkBook, leagueSheetName: string): TournamentInfo {
  // まず表紙シートを試す
  const coverSheet = wb.Sheets['表紙'];
  if (coverSheet) {
    let name = '';
    // B3-B5あたりから大会名を取得
    for (let r = 1; r <= 10; r++) {
      const v = cellVal(coverSheet, `B${r}`);
      if (v && v.length > 2 && !v.includes('令和') && !v.includes('平成')) {
        name = v;
        break;
      }
    }
    // 令和の年度を探す
    for (let r = 1; r <= 5; r++) {
      const v = cellVal(coverSheet, `B${r}`);
      if (v && (v.includes('令和') || v.includes('平成'))) {
        name = v + ' ' + name;
        break;
      }
    }

    let date = '';
    let venue = '';
    // 日程・会場を探す
    for (let r = 5; r <= 20; r++) {
      for (const col of ['G', 'F', 'J']) {
        const label = cellVal(coverSheet, `${col}${r}`);
        if (label.includes('日程')) {
          date = cellVal(coverSheet, `M${r}`) || cellVal(coverSheet, `O${r}`);
        }
        if (label.includes('会場')) {
          venue = cellVal(coverSheet, `M${r}`) || cellVal(coverSheet, `O${r}`);
        }
      }
    }

    const rules: string[] = [];
    for (let r = 20; r <= 40; r++) {
      const v = cellVal(coverSheet, `F${r}`);
      if (v && v.startsWith('（')) rules.push(v);
    }

    if (name) return { name: name.trim(), date, venue, rules };
  }

  // 表紙がない場合、リーグシートから取得
  const ws = wb.Sheets[leagueSheetName];
  if (!ws) return { name: 'ミックスダブルス大会', date: '', venue: '', rules: [] };

  const name = cellVal(ws, 'A1').replace(/\s+/g, ' ').trim() || 'ミックスダブルス大会';
  const date = cellVal(ws, 'O2') || cellVal(ws, 'M9');
  const venue = cellVal(ws, 'O3') || cellVal(ws, 'M10');
  const rules: string[] = [];
  for (let r = 5; r <= 15; r++) {
    const v = cellVal(ws, `F${r}`);
    if (v) rules.push(v);
  }

  return { name, date, venue, rules };
}

// ============================================================
// リストシートからのパース (旧フォーマット用)
// ============================================================

function parseListSheet(wb: XLSX.WorkBook): Map<string, { league: string; number: string; name: string; affiliation: string }[]> {
  const ws = wb.Sheets['リスト'];
  if (!ws) return new Map();

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: ['league', 'number', 'name', 'affiliation', 'leagueRank', 'num', 'rank'] });

  const byLeague = new Map<string, { league: string; number: string; name: string; affiliation: string }[]>();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const league = String(row.league || '').trim();
    const name = String(row.name || '').trim();
    const number = String(row.number || '').trim();
    const affiliation = String(row.affiliation || '').trim();
    if (!league || !name) continue;

    if (!byLeague.has(league)) byLeague.set(league, []);
    byLeague.get(league)!.push({ league, number, name, affiliation });
  }

  return byLeague;
}

/** リストシートベースでリーグ構築 */
function buildLeaguesFromList(
  listData: Map<string, { league: string; number: string; name: string; affiliation: string }[]>,
  leagueRows: LeagueRow[]
): MixedLeague[] {
  const leagues: MixedLeague[] = [];

  for (const [rawLid, players] of listData) {
    const lid = rawLid.trim();
    const teams: MixedTeam[] = [];
    let pairNum = 1;

    for (let i = 0; i < players.length; i += 2) {
      const maleEntry = players[i];
      const femaleEntry = i + 1 < players.length ? players[i + 1] : null;
      if (!maleEntry) continue;

      const numParts = maleEntry.number.split('-');
      const globalNum = parseInt(numParts[0]) || pairNum;

      const male: MixedPlayer = { name: maleEntry.name, affiliation: maleEntry.affiliation };
      const female: MixedPlayer = { name: femaleEntry?.name || '', affiliation: femaleEntry?.affiliation || '' };
      const teamName = extractLastName(male.name) + '・' + extractLastName(female.name);

      teams.push({
        teamId: `${lid}-${pairNum}`,
        leagueId: lid,
        numberInLeague: pairNum,
        pairNumber: globalNum,
        male, female, teamName,
        status: 'none',
      });
      pairNum++;
    }

    const leagueRow = leagueRows.find(l => l.leagueId === lid);
    const courtName = leagueRow?.courtName || '';
    const matchOrder = teams.length >= 5 ? MATCH_ORDER_5 : MATCH_ORDER_4;

    leagues.push({ leagueId: lid, courtName, teams, matchOrder });
  }

  return leagues;
}

/** 予選リーグシートから直接リーグ構築（リストシートなし） */
function buildLeaguesFromSheet(ws: XLSX.WorkSheet, leagueRows: LeagueRow[]): MixedLeague[] {
  const leagues: MixedLeague[] = [];

  for (let i = 0; i < leagueRows.length; i++) {
    const lr = leagueRows[i];
    const nextLr = i + 1 < leagueRows.length ? leagueRows[i + 1] : null;

    // メイン行（4チーム分）
    const mainTeams = extractTeamsFromRows(ws, lr.row, lr.courtRow);

    // 5チーム目を探す（M リーグ等）
    // courtRow以降、次のリーグヘッダーまでの間に追加チームがないか常にチェック
    let extraTeam: DetectedTeam | null = null;
    extraTeam = extractFifthTeam(ws, lr.courtRow, nextLr ? nextLr.row : null);

    const allDetected = [...mainTeams];
    if (extraTeam) allDetected.push(extraTeam);

    const teams: MixedTeam[] = allDetected.map((dt, idx) => {
      const male: MixedPlayer = { name: dt.maleName, affiliation: dt.maleAffiliation };
      const female: MixedPlayer = { name: dt.femaleName, affiliation: dt.femaleAffiliation };
      const teamName = extractLastName(dt.maleName) + '・' + extractLastName(dt.femaleName);
      return {
        teamId: `${lr.leagueId}-${idx + 1}`,
        leagueId: lr.leagueId,
        numberInLeague: idx + 1,
        pairNumber: dt.pairNumber,
        male, female, teamName,
        status: 'none' as const,
      };
    });

    const matchOrder = teams.length >= 5 ? MATCH_ORDER_5 : MATCH_ORDER_4;
    leagues.push({
      leagueId: lr.leagueId,
      courtName: lr.courtName,
      teams,
      matchOrder,
    });
  }

  return leagues;
}

// ============================================================
// リーグ試合データ生成
// ============================================================

function generateLeagueMatches(leagues: MixedLeague[]): LeagueMatchScore[] {
  const matches: LeagueMatchScore[] = [];

  for (const league of leagues) {
    for (const mo of league.matchOrder) {
      const team1 = league.teams[mo.team1Index - 1];
      const team2 = league.teams[mo.team2Index - 1];
      if (!team1 || !team2) continue;

      matches.push({
        matchId: `league-${league.leagueId}-${mo.matchNumber}`,
        leagueId: league.leagueId,
        matchNumber: mo.matchNumber,
        team1Id: team1.teamId,
        team2Id: team2.teamId,
        score1: null,
        score2: null,
        tiebreakScore: null,
        winnerId: null,
        status: 'waiting',
      });
    }
  }

  return matches;
}

// ============================================================
// メインエントリーポイント
// ============================================================

/**
 * Excelファイルをパースしてミックス大会データを生成
 * 2つのフォーマットに対応:
 *   A) 「リスト」シートあり → リストシートからチーム構築
 *   B) 「リスト」シートなし → 予選リーグシートから直接解析
 */
/** Excelの全シートを2D配列に変換（ビューア用） */
export function extractExcelSheets(file: ArrayBuffer): { name: string; data: string[][] }[] {
  const wb = XLSX.read(file, { type: 'array' });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    // 文字列に統一
    const data = rows.map(row => row.map(cell => cell == null ? '' : String(cell)));
    return { name, data };
  });
}

export function parseMixedExcel(file: ArrayBuffer): {
  info: TournamentInfo;
  leagues: MixedLeague[];
  matches: LeagueMatchScore[];
} {
  const wb = XLSX.read(file, { type: 'array' });

  // リーグシート名を検出
  const leagueSheetName = wb.SheetNames.find(n =>
    n === '予選' || n === '予選リーグ' || n.includes('予選')
  );
  if (!leagueSheetName) {
    throw new Error('予選リーグのシートが見つかりません。シート名に「予選」を含めてください。');
  }

  const ws = wb.Sheets[leagueSheetName];
  const info = parseTournamentInfo(wb, leagueSheetName);

  // リーグ行を検出
  const leagueRows = detectLeagueRows(ws);
  if (leagueRows.length === 0) {
    throw new Error('リーグデータが見つかりません。「A リーグ」のような行が必要です。');
  }

  // リストシートがあるか判定
  const listData = parseListSheet(wb);
  let leagues: MixedLeague[];

  if (listData.size > 0) {
    // フォーマットA: リストシートベース
    leagues = buildLeaguesFromList(listData, leagueRows);
  } else {
    // フォーマットB: 予選リーグシートから直接
    leagues = buildLeaguesFromSheet(ws, leagueRows);
  }

  // 空のリーグを除外
  leagues = leagues.filter(l => l.teams.length >= 2);

  const matches = generateLeagueMatches(leagues);

  return { info, leagues, matches };
}
