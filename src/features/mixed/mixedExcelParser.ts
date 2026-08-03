import * as XLSX from 'xlsx';
import type { MixedLeague, MixedTeam, MixedPlayer, LeagueMatchScore, MatchOrderEntry, TournamentInfo } from './types';

/** 全角英数字を半角に、全角スペースを半角スペースに変換 */
function toHalfWidth(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

/** 連続する空白・改行を1つの半角スペースにまとめる */
function normalizeSpace(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 日付文字列から「予備日」以降を除去して本戦日のみ返す */
function stripReserveDate(dateStr: string): string {
  if (!dateStr) return '';
  // 「予備日」「予備日：」「予備日:」以降を除去
  return dateStr.split(/予備日[：:]?/)[0].trim();
}

/** 会場文字列から「予備日」「（予備日...）」を除去 */
function stripReserveVenue(venueStr: string): string {
  if (!venueStr) return '';
  // （予備日...）や (予備日...) のカッコごと除去
  let result = venueStr.replace(/[（(]予備日[^）)]*[）)]/g, '').trim();
  // カッコなしの「予備日...」以降を除去
  result = result.split(/予備日/)[0].trim();
  return result;
}

/** 試合形式らしいテキストかどうかの判定 */
const GAME_RULE_PATTERN = /ゲームマッチ|ゲーム先取|セットマッチ|タイブレ|ノーアド|先取/;

/** ルールテキストを「■」区切りの断片に分割 */
function splitRuleSegments(raw: string): string[] {
  return raw
    .split(/[■\r\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** 「試合方法：〜」「〜共」「〜は」などの前置きを落として試合形式本体を取り出す */
function cleanRuleText(seg: string): string {
  let t = seg
    .replace(/^[（(][０-９\d]+[）)]\s*/, '')   // 「（１）」
    .replace(/^[※・◆●○]\s*/, '')
    .trim();
  const m = t.match(/^(.{0,30}?)(?:とも|共に|共|[はを：:])\s*(.+)$/);
  if (m && GAME_RULE_PATTERN.test(m[2])) t = m[2];
  // 「※5チームリーグ別記」のような注記は落とす
  const withoutNote = t.replace(/\s*※.*$/, '').trim();
  if (withoutNote && GAME_RULE_PATTERN.test(withoutNote)) t = withoutNote;
  return t.trim();
}

/** ゲームルール抽出結果 */
interface ExtractedGameRules {
  /** リーグのチーム数別ルール（例: {4: "...", 5: "..."}） */
  bySize: Record<number, string>;
  /** 決勝／順位別トーナメントのルール */
  tournament: string;
  /** チーム数の指定がない汎用ルール */
  generic: string;
}

/** 「①-② ②-③ ①-③」のような対戦順表記から最大の丸数字（＝チーム数）を求める */
function maxCircledNumber(text: string): number {
  let max = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x2460 && code <= 0x2473) max = Math.max(max, code - 0x2460 + 1); // ①〜⑳
  }
  return max;
}

/** ルールテキスト配列から構造化ゲームルールを自動抽出 */
function extractGameRules(rules: string[]): ExtractedGameRules {
  const bySize: Record<number, string> = {};
  let tournament = '';
  let generic = '';

  for (const raw of rules) {
    const segments = splitRuleSegments(raw);
    // 同じセル内に「試合順：①-② ②-③ ①-③」があれば、その丸数字の最大値を
    // そのルールが対象とするリーグのチーム数とみなす
    let sizeHint = 0;
    for (const seg of segments) {
      if (/試合順|対戦順/.test(seg)) sizeHint = Math.max(sizeHint, maxCircledNumber(seg));
    }

    for (const seg of segments) {
      const half = toHalfWidth(seg);
      if (!GAME_RULE_PATTERN.test(half)) continue;
      const body = cleanRuleText(half);
      if (!body) continue;

      // 「予選4チームリーグは…」のようにチーム数が明記されている場合
      // （「※5チームリーグ別記」のような参照書きは対象外）
      const sizeMatch = /別記|別途/.test(half) ? null : half.match(/([2-9])\s*(?:チーム|ペア)/);
      const size = sizeMatch ? Number(sizeMatch[1]) : sizeHint;
      if (size >= 2) {
        if (!bySize[size]) bySize[size] = body;
      } else if (/決勝|順位別|トーナメント|コンソレ/.test(half)) {
        if (!tournament) tournament = body;
      }
      if (!generic) generic = body;
    }
  }

  return { bySize, tournament, generic };
}

/** 抽出結果とリーグ構成から gameRules（キー0=決勝T）を組み立てる */
function buildGameRules(extracted: ExtractedGameRules, leagueSizes: number[]): Record<number, string> {
  const gameRules: Record<number, string> = {};
  const fallback = extracted.generic || extracted.tournament || 'ノーアド・6ゲームマッチ（6-6タイブレーク）';

  for (const [size, rule] of Object.entries(extracted.bySize)) {
    gameRules[Number(size)] = rule;
  }
  for (const size of leagueSizes) {
    if (gameRules[size]) continue;
    gameRules[size] = extracted.generic || (size >= 5 ? '6ゲーム先取（ノーアド）' : fallback);
  }
  gameRules[0] = extracted.tournament || fallback;
  return gameRules;
}

/** 3チームリーグの対戦順（①-② ②-③ ①-③） */
const MATCH_ORDER_3: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 2, team2Index: 3 },
  { matchNumber: 3, team1Index: 1, team2Index: 3 },
];

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

/** チーム数に応じた対戦順を返す */
function matchOrderFor(teamCount: number): MatchOrderEntry[] {
  if (teamCount <= 3) return MATCH_ORDER_3;
  if (teamCount === 4) return MATCH_ORDER_4;
  if (teamCount === 5) return MATCH_ORDER_5;
  // 6チーム以上は総当たりを機械的に生成
  const order: MatchOrderEntry[] = [];
  let num = 1;
  for (let i = 1; i <= teamCount; i++) {
    for (let j = i + 1; j <= teamCount; j++) {
      order.push({ matchNumber: num++, team1Index: i, team2Index: j });
    }
  }
  return order;
}

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
  const n = fullName.replace(/\u3000/g, ' ').trim();
  if (!n) return fullName;
  if (/\s/.test(n)) return n.split(/\s+/)[0];
  // \u533a\u5207\u308a\u306e\u306a\u3044\u300c\u5c71\u6839\u76f4\u5203\u300d\u5f62\u5f0f\u306f\u5148\u982d2\u6587\u5b57\u3092\u59d3\u3068\u307f\u306a\u3059
  // \uff08exportBracketJpeg \u306e extractFamily \u3068\u540c\u3058\u6271\u3044\uff09
  if (n.length <= 2) return n;
  return n.substring(0, 2);
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

/** コート名の表記ゆれを整える ("№ ５コート" → "5コート") */
function cleanCourtName(raw: string): string {
  return toHalfWidth(raw.replace(/[\r\n]/g, ' '))
    .replace(/^\s*(?:No\.?|NO\.?|no\.?|[#№])\s*/i, '')
    .replace(/\s+/g, '')
    .trim();
}

function detectLeagueRows(ws: XLSX.WorkSheet | undefined): LeagueRow[] {
  if (!ws) return [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const results: LeagueRow[] = [];

  for (let r = 0; r <= range.e.r; r++) {
    const bVal = cellVal(ws, `B${r + 1}`);
    if (!bVal) continue;
    // "A リーグ", "Aリーグ", "Ａリーグ", "I  リーグ" etc.（全角英字にも対応）
    const m = toHalfWidth(bVal).trim().match(/^([A-Z])\s*リーグ$/);
    if (m) {
      const courtRow = r + 2; // 次の行
      // コート名を探す: 次の行、または数行先まで探索
      let courtName = '';
      for (let cr = courtRow; cr <= Math.min(courtRow + 2, range.e.r + 1); cr++) {
        const cv = cellVal(ws, `B${cr}`);
        if (cv && cv.replace(/[\r\n]/g, '').includes('コート')) {
          courtName = cv;
          break;
        }
        if (cv && !toHalfWidth(cv).match(/^[A-Z]\s*リーグ$/) && !cv.includes('■')) {
          courtName = cv;
          break;
        }
      }
      results.push({
        leagueId: m[1],
        row: r + 1,       // 1-based
        courtRow,
        courtName: cleanCourtName(courtName),
      });
    }
  }

  return results;
}

/**
 * リーグ表が載っているシートを探す。
 * 「予選」を含むシートを優先し、見つからなければ全シートから
 * 「Aリーグ」のような行を含むシート（表紙に直接リーグ表がある形式）を探す。
 */
function findLeagueSheet(wb: XLSX.WorkBook): { name: string; leagueRows: LeagueRow[] } | null {
  const exact: string[] = wb.SheetNames.filter(n => n === '予選' || n === '予選リーグ');
  const preferred = wb.SheetNames.filter(n => n.includes('予選') && !exact.includes(n));
  const rest = wb.SheetNames.filter(n => !n.includes('予選'));

  let best: { name: string; leagueRows: LeagueRow[] } | null = null;
  for (const name of [...exact, ...preferred, ...rest]) {
    const rows = detectLeagueRows(wb.Sheets[name]);
    if (rows.length === 0) continue;
    if (!best || rows.length > best.leagueRows.length) {
      best = { name, leagueRows: rows };
    }
    // 「予選」シートでリーグが取れたらそれを採用
    if (name.includes('予選')) return best;
  }
  return best;
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

/** ラベルセルの右隣にある値セル（「：」はスキップ）を取得 */
function valueRightOf(ws: XLSX.WorkSheet, row: number, labelCol: number, lastCol: number): string {
  for (let c = labelCol + 1; c <= lastCol; c++) {
    const v = cellVal(ws, colName(c) + row);
    if (!v) continue;
    if (/^[：:]+$/.test(v)) continue;
    return v;
  }
  return '';
}

/** シート全体から「日程」「会場」ラベルを探して値を取得 */
function findLabeledValues(ws: XLSX.WorkSheet, maxRow: number): { date: string; venue: string } {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const lastCol = Math.min(range.e.c, 40);
  let date = '';
  let venue = '';

  for (let r = 1; r <= Math.min(maxRow, range.e.r + 1); r++) {
    for (let c = 0; c <= lastCol; c++) {
      const label = cellVal(ws, colName(c) + r).replace(/\s|　/g, '');
      if (!label || label.length > 8) continue;
      if (!date && label.includes('日程')) date = valueRightOf(ws, r, c, lastCol);
      if (!venue && label.includes('会場')) venue = valueRightOf(ws, r, c, lastCol);
    }
    if (date && venue) break;
  }
  return { date, venue };
}

/** シートから「■…」「（１）…」形式のルール行を収集 */
function collectRuleTexts(ws: XLSX.WorkSheet | undefined, maxRow: number, maxCol: number): string[] {
  if (!ws) return [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const lastCol = Math.min(range.e.c, maxCol);
  const rules: string[] = [];

  for (let r = 1; r <= Math.min(maxRow, range.e.r + 1); r++) {
    for (let c = 0; c <= lastCol; c++) {
      const v = cellVal(ws, colName(c) + r);
      if (!v || v.length < 6) continue;
      if (!/^[■（(]/.test(v)) continue;
      if (/^■\s*予選リーグ/.test(v)) continue;   // 表のセクション見出し
      const text = normalizeSpace(v);
      if (!rules.includes(text)) rules.push(text);
    }
  }
  return rules;
}

function parseTournamentInfo(
  wb: XLSX.WorkBook,
  leagueSheetName: string,
  bracketSheetName?: string,
): { info: TournamentInfo; extracted: ExtractedGameRules } {
  const coverSheet = wb.Sheets['表紙'];
  const leagueSheet = wb.Sheets[leagueSheetName];
  // 大会情報の探索対象（表紙があれば優先、なければリーグシート）
  const infoSheets = [coverSheet, leagueSheet].filter((s): s is XLSX.WorkSheet => !!s);

  let name = '';
  let date = '';
  let venue = '';

  for (const ws of infoSheets) {
    if (!name) {
      // A1 に大会名があるのが基本形
      name = normalizeSpace(cellVal(ws, 'A1'));
      if (!name) {
        // A1 が空の場合は B列上部から探す
        for (let r = 1; r <= 10; r++) {
          const v = normalizeSpace(cellVal(ws, `B${r}`));
          if (v && v.length > 2 && !v.includes('令和') && !v.includes('平成') && !v.startsWith('■') && !v.startsWith('※')) {
            name = v;
            break;
          }
        }
        // 令和の年度が別セルにある場合は前置き
        for (let r = 1; r <= 5; r++) {
          const v = normalizeSpace(cellVal(ws, `B${r}`));
          if (v && (v.includes('令和') || v.includes('平成'))) {
            name = `${v} ${name}`.trim();
            break;
          }
        }
      }
    }
    if (!date || !venue) {
      const found = findLabeledValues(ws, 25);
      if (!date) date = found.date;
      if (!venue) venue = found.venue;
    }
    if (name && date && venue) break;
  }

  // 予備日を除去して本戦日・本会場のみ
  date = stripReserveDate(date);
  venue = stripReserveVenue(venue);

  // ルールは 表紙／リーグシート／順位別トーナメントシート から収集
  const rules: string[] = [];
  for (const sheetName of [coverSheet ? '表紙' : '', leagueSheetName, bracketSheetName || '']) {
    if (!sheetName) continue;
    for (const rule of collectRuleTexts(wb.Sheets[sheetName], 60, 30)) {
      if (!rules.includes(rule)) rules.push(rule);
    }
  }

  return {
    info: { name: name || 'ミックスダブルス大会', date, venue, rules },
    extracted: extractGameRules(rules),
  };
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
    const matchOrder = matchOrderFor(teams.length);

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

    const matchOrder = matchOrderFor(teams.length);
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

/** 決勝Tシートからトーナメント並び順を解析 */
function parseBracketOrders(rows: unknown[][]): TournamentInfo['bracketOrders'] {
  const result: TournamentInfo['bracketOrders'] = {};

  // 各トーナメントセクションを検出
  // "2位トーナメント" の後の行にリーグIDが並ぶ (例: G2 E2 L2 ...)
  // "3位トーナメント" の後の行にリーグIDが並ぶ (例: D3 H3 M3 ...)
  const sections: { key: '2nd' | '3rd' | '4th'; pattern: RegExp }[] = [
    { key: '2nd', pattern: /[２2]位トーナメント/ },
    { key: '3rd', pattern: /[３3]位トーナメント/ },
    { key: '4th', pattern: /[４4].*[５5]?位トーナメント/ },
  ];

  for (const { key, pattern } of sections) {
    // セクションヘッダー行を探す
    let headerRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      for (const cell of row) {
        if (cell != null && pattern.test(String(cell))) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx >= 0) break;
    }
    if (headerRowIdx < 0) continue;

    // ヘッダーの後の行からリーグIDを抽出
    for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 10, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      const leagueIds: string[] = [];
      for (const cell of row) {
        if (cell == null) continue;
        const s = String(cell).trim()
          .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41))
          .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
        // "G2", "E2", "L2" → リーグID "G", "E", "L"
        const m = s.match(/^([A-Z])\s*[2-5]$/i);
        if (m) leagueIds.push(m[1].toUpperCase());
      }
      if (leagueIds.length >= 3) {
        result[key] = leagueIds;
        break;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseMixedExcel(file: ArrayBuffer): {
  info: TournamentInfo;
  leagues: MixedLeague[];
  matches: LeagueMatchScore[];
} {
  const wb = XLSX.read(file, { type: 'array' });

  // リーグ表のあるシートを検出（「予選」シート優先、なければ表紙などから探す）
  const leagueSheet = findLeagueSheet(wb);
  if (!leagueSheet) {
    throw new Error('リーグデータが見つかりません。「Aリーグ」のような行があるシートが必要です。');
  }
  const { name: leagueSheetName, leagueRows } = leagueSheet;
  const ws = wb.Sheets[leagueSheetName];

  // 決勝T／順位別トーナメントシート
  const bracketSheetName = wb.SheetNames.find(n => /決勝|順位別|順位T/.test(n));

  const { info, extracted } = parseTournamentInfo(wb, leagueSheetName, bracketSheetName);

  // トーナメント表から順位別トーナメントの並び順を解析
  if (bracketSheetName) {
    const bws = wb.Sheets[bracketSheetName];
    const bdata = XLSX.utils.sheet_to_json<unknown[]>(bws, { header: 1 });
    info.bracketOrders = parseBracketOrders(bdata);
  }

  // リストシートがあるか判定
  const listData = parseListSheet(wb);
  let leagues: MixedLeague[];

  if (listData.size > 0) {
    // フォーマットA: リストシートベース
    leagues = buildLeaguesFromList(listData, leagueRows);
  } else {
    // フォーマットB: リーグ表シートから直接
    leagues = buildLeaguesFromSheet(ws, leagueRows);
  }

  // 空のリーグを除外
  leagues = leagues.filter(l => l.teams.length >= 2);
  if (leagues.length === 0) {
    throw new Error('ペアデータが読み取れませんでした。リーグ行の並び（番号・氏名・所属）をご確認ください。');
  }

  const matches = generateLeagueMatches(leagues);

  // 実際のリーグ構成に合わせてチーム数別ゲームルールを補完
  info.gameRules = buildGameRules(extracted, [...new Set(leagues.map(l => l.teams.length))]);

  return { info, leagues, matches };
}
