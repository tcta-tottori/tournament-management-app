import * as XLSX from 'xlsx';
import type {
  TeamEntry, TeamLeague, TeamLeagueMatch, TeamMember, TeamTournamentInfo,
  MatchOrderEntry,
} from './types';
import { MATCH_TYPE_ORDER_CLUB } from './teamLogic';

/** 3チームリーグの対戦順 */
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
  { matchNumber: 5, team1Index: 4, team2Index: 5 },
  { matchNumber: 6, team1Index: 1, team2Index: 3 },
  { matchNumber: 7, team1Index: 2, team2Index: 4 },
  { matchNumber: 8, team1Index: 3, team2Index: 5 },
  { matchNumber: 9, team1Index: 1, team2Index: 4 },
  { matchNumber: 10, team1Index: 2, team2Index: 5 },
];

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒';

function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

function colLetter(n: number): string {
  let s = '';
  n++;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function cellStr(ws: XLSX.WorkSheet, ref: string): string {
  const cell = ws[ref];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

interface ParseResult {
  info: TeamTournamentInfo;
  leagues: TeamLeague[];
  matches: TeamLeagueMatch[];
}

/** 部の見出しか? (例: "男子1部", "女子２部") */
function divisionFromText(raw: string): { gender: 'M' | 'F'; rank: number; label: string } | null {
  const cleaned = raw.replace(/\s+/g, '');
  const m = toHalf(cleaned).match(/(男子|女子)([1-9])部/);
  if (!m) return null;
  const gender: 'M' | 'F' = m[1] === '男子' ? 'M' : 'F';
  return { gender, rank: parseInt(m[2], 10), label: `${m[1]}${m[2]}部` };
}

/** チーム名らしいかを判定（数字のみ・日付・ラベル等を除外） */
function looksLikeTeamName(raw: string): boolean {
  if (!raw) return false;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (s.length > 30) return false;
  // 純数字・小数
  if (/^[\d０-９]+(\.[\d０-９]+)?$/.test(s)) return false;
  // 丸数字単独
  if (s.length === 1 && CIRCLED_NUMBERS.includes(s)) return false;
  // 日付・時刻
  if (/^\d{1,4}[\/\-\.年]\d{1,2}[\/\-\.月]\d{0,2}日?$/.test(toHalf(s))) return false;
  if (/^\d{1,2}[:：]\d{2}/.test(toHalf(s))) return false;
  // 既知のラベル
  if (/^(コート|対戦|順位|勝|敗|引分|総当り|総当たり|備考|開催日|会場|大会|代表者|電話|ＴＥＬ|TEL|住所|男子|女子|[1-9１-９]部|得失|勝率|順位決定|シード|BYE|bye)$/i.test(s)) return false;
  // 区切り文字単独
  if (/^[・･、。\.,:;!?\-―ー\s]+$/.test(s)) return false;
  // 日付ラベルや日時表記・大会説明文に頻出する語
  if (/(令和|平成|年度|予備日|日程|開催|練習)/.test(s)) return false;
  // テニス用語
  if (/(タイブレーク|ノーアド|ゲーム先取|ゲームマッチ|ダブルス|シングルス|MIX|WD|MD)/i.test(s)) return false;
  return true;
}

/** 大会情報（タイトル・日付・会場）を抽出 */
function extractTournamentInfo(wb: XLSX.WorkBook, fileName: string): TeamTournamentInfo {
  const info: TeamTournamentInfo = {
    name: '',
    date: '',
    venue: 'ヤマタスポーツパーク',
    rules: [],
    matchFormat: 'club',
  };

  let titleText = '';
  let yearText = '';

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= Math.min(range.e.r, 60); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = cellStr(ws, colLetter(c) + (r + 1));
        if (!v) continue;
        const clean = v.replace(/\s+/g, ' ').trim();

        // 年度（"令和8年度" の部分のみ抽出。大会名と重複しないよう）
        const yearMatch = clean.match(/令和\s*[\d０-９]+\s*年度/);
        if (yearMatch) {
          const y = yearMatch[0];
          if (!yearText || y.length < yearText.length) yearText = y;
        }
        // タイトル候補（"クラブ対抗" を含む短めの文字列）。年度部分は除外して比較
        if (/クラブ対抗/.test(clean) && clean.length <= 40 && !/方法|ルール|タイブレーク|ノーアド/.test(clean)) {
          const stripped = clean.replace(/令和\s*[\d０-９]+\s*年度\s*/, '').trim();
          if (stripped && (!titleText || stripped.length < titleText.length)) titleText = stripped;
        }

        // 日付
        if (!info.date) {
          const half = toHalf(clean);
          const d = half.match(/(?:令和|R)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/);
          if (d && !/(方法|ルール|ゲームマッチ)/.test(clean)) info.date = d[0];
        }

        // 会場（"スポーツパーク" 等を含む明確な施設名のみ採用）
        if (!info.venue || info.venue === 'ヤマタスポーツパーク') {
          const venueMatch = clean.match(/[ぁ-んァ-ヶー一-龥a-zA-Zａ-ｚＡ-Ｚ]+(?:スポーツパーク|テニスパーク|体育館)(?:[・･][ぁ-んァ-ヶー一-龥a-zA-Zａ-ｚＡ-Ｚ]+(?:コート|テニスコート)?)?/);
          if (venueMatch) info.venue = venueMatch[0].replace(/･/g, '・');
        }
      }
    }
  }

  if (!titleText) {
    titleText = fileName.replace(/\.(xlsx?|xls)$/i, '');
  }
  info.name = [yearText, titleText].filter(Boolean).join(' ').trim();
  return info;
}

/** 部の見出しの矩形範囲（行・列）の領域内からチーム名を抽出 */
function extractTeamsInRegion(
  ws: XLSX.WorkSheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): string[] {
  const teams: string[] = [];
  const seen = new Set<string>();

  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const ref = colLetter(c) + (r + 1);
      const v = cellStr(ws, ref);
      if (!v) continue;
      const cleaned = v.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;

      // 部見出しセル（"男子１部 ５･６ コート" 等）はスキップ
      if (divisionFromText(cleaned)) continue;

      // 丸数字付きセル: "① プラセール" → 丸数字を除去して判定
      const stripped = cleaned.replace(new RegExp(`[${CIRCLED_NUMBERS}]`, 'g'), '').trim();
      const candidate = stripped || cleaned;

      if (!looksLikeTeamName(candidate)) continue;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      teams.push(candidate);
    }
  }

  return teams;
}

/** チーム名を比較用に正規化（全角→半角、括弧統一、空白除去、小文字化） */
function normalizeTeamName(s: string): string {
  return toHalf(s)
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[～〜]/g, '~')
    .replace(/[\s　]+/g, '')
    .toLowerCase();
}

/** 選手名簿シートからチーム→メンバーのマップを構築 */
function parseRoster(wb: XLSX.WorkBook): Map<string, TeamMember[]> {
  // Key: `${gender}:${rank}:${normalizedTeamName}` → TeamMember[]
  const result = new Map<string, TeamMember[]>();

  // 名簿シートを検索
  let rosterSheet: string | null = null;
  for (const name of wb.SheetNames) {
    if (/名簿|メンバー/.test(name)) {
      rosterSheet = name;
      break;
    }
  }
  if (!rosterSheet) return result;

  const ws = wb.Sheets[rosterSheet];
  const ref = ws['!ref'];
  if (!ref) return result;
  const range = XLSX.utils.decode_range(ref);

  // 列0に部見出しがある行を集める（前年度参考列の見出しは別列に出るので除外される）
  type DivBlock = { row: number; gender: 'M' | 'F'; rank: number };
  const divRows: DivBlock[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const v = cellStr(ws, 'A' + (r + 1));
    if (!v) continue;
    const div = divisionFromText(v);
    if (div) divRows.push({ row: r, gender: div.gender, rank: div.rank });
  }

  // 前年度比較セクションの開始列を検出（列0に "令和N年度...メンバー" があり、
  // 別列にも同様の見出しが出る。当年度セクションはおおむね列0〜10を使う）
  const PLAYER_COL_LIMIT = 10;

  for (let i = 0; i < divRows.length; i++) {
    const block = divRows[i];
    const nextRow = i + 1 < divRows.length ? divRows[i + 1].row : range.e.r + 1;

    // 部見出しの行から、当年度範囲のチーム名セルを拾う
    const teams: Array<{ col: number; name: string }> = [];
    for (let c = 1; c <= Math.min(range.e.c, PLAYER_COL_LIMIT); c++) {
      const cell = cellStr(ws, colLetter(c) + (block.row + 1));
      if (!cell) continue;
      const cleaned = cell.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      if (divisionFromText(cleaned)) continue;
      if (!looksLikeTeamName(cleaned)) continue;
      teams.push({ col: c, name: cleaned });
    }
    if (teams.length === 0) continue;

    // 各チームの選手名を取得（チーム名列の右隣がプレイヤー名列）
    for (const team of teams) {
      const members: TeamMember[] = [];
      for (let r = block.row + 1; r < nextRow; r++) {
        const nameCell = cellStr(ws, colLetter(team.col + 1) + (r + 1));
        if (!nameCell) continue;
        const playerName = nameCell.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (!playerName) continue;
        // 番号セル・空白を除外
        if (/^[\d０-９]+$/.test(playerName)) continue;
        if (!looksLikeTeamName(playerName)) continue;
        members.push({
          player: { name: playerName, affiliation: team.name },
          gender: block.gender,
        });
      }
      if (members.length > 0) {
        const key = `${block.gender}:${block.rank}:${normalizeTeamName(team.name)}`;
        result.set(key, members);
      }
    }
  }

  return result;
}

/**
 * クラブ対抗戦Excelパーサー
 *
 * 想定するExcel構造:
 * - シート上に "男子1部" "男子2部" ... または "女子1部" 等の部見出しが配置される
 * - 各部見出しの近傍にチーム名（クラブ名）が3〜5個並ぶ
 * - リーグ線・対戦表は描かれていない
 *
 * 処理方針:
 * 1. 全セルから部見出しを検出
 * 2. 各部見出しの近隣セル領域からチーム名候補を抽出
 * 3. 抽出チーム数に応じて 3/4/5 チームリーグの対戦順を自動生成
 */
export function parseClubExcel(buffer: ArrayBuffer, fileName: string): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });

  const info = extractTournamentInfo(wb, fileName);

  // 選手名簿（あれば）からチーム名→メンバーのマップを作成
  const rosterMap = parseRoster(wb);

  // 編成表シートを優先（"編成" を含み "規定"/"名簿"/"練習" を含まない）
  let bestSheet: string | null = null;
  for (const name of wb.SheetNames) {
    if (/編成/.test(name) && !/規定|名簿|練習/.test(name)) {
      bestSheet = name;
      break;
    }
  }
  // 見つからない場合は、最もデータが多いシートにフォールバック
  if (!bestSheet) {
    let bestCells = 0;
    bestSheet = wb.SheetNames[0];
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
  }
  const ws = wb.Sheets[bestSheet];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:CZ100');

  // 部見出しの位置を全て収集
  type Header = { row: number; col: number; gender: 'M' | 'F'; rank: number; label: string; courtName: string };
  const headers: Header[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellStr(ws, colLetter(c) + (r + 1));
      if (!v) continue;
      const div = divisionFromText(v);
      if (div) {
        // ヘッダーセル内に併記されたコート情報（例: "５･６ コート"）を拾う
        const halfV = toHalf(v).replace(/\s+/g, ' ');
        const courtMatch = halfV.match(/(\d+(?:[\s･・,、][\s]*\d+)?)\s*コート/);
        const courtName = courtMatch ? courtMatch[0].replace(/\s+/g, '').replace(/･/g, '・') : '';
        headers.push({ row: r, col: c, ...div, courtName });
      }
    }
  }

  if (headers.length === 0) {
    throw new Error('クラブ対抗戦の部見出し（例: 男子1部）が見つかりませんでした');
  }

  // 同じ部が複数箇所に出ても、最初のものだけ採用
  const uniqHeaders: Header[] = [];
  const seenLabels = new Set<string>();
  for (const h of headers) {
    if (seenLabels.has(h.label)) continue;
    seenLabels.add(h.label);
    uniqHeaders.push(h);
  }

  // 性別→ランクの順でソート（男子1部→男子2部→…→女子1部→…）
  uniqHeaders.sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === 'M' ? -1 : 1;
    return a.rank - b.rank;
  });

  // 各部の領域（行・列範囲）を決定。次の見出しの直前までを領域とする
  // dedupする前の全見出しを使い、Day1→Day2 等で同じ部名が複数登場する場合でも
  // 領域がDay2範囲まで漏れ広がらないようにする
  const allHeadersByRow = [...headers].sort((a, b) => a.row - b.row || a.col - b.col);

  const leagues: TeamLeague[] = [];
  const matches: TeamLeagueMatch[] = [];

  for (let i = 0; i < uniqHeaders.length; i++) {
    const h = uniqHeaders[i];
    const idxInAll = allHeadersByRow.findIndex(x => x.row === h.row && x.col === h.col && x.label === h.label);
    const nextAll = allHeadersByRow[idxInAll + 1];

    // 行範囲: ヘッダー行から、次の見出し（label違いも含む）の直前まで。
    // ただし最大でも2行先まで（チーム名は通常ヘッダーと同じ行か直下にある）
    const rowStart = h.row;
    const rowCap = Math.min(range.e.r, h.row + 2);
    const rowEnd = nextAll ? Math.min(nextAll.row - 1, rowCap) : rowCap;

    // 列範囲: 同じ行に他の見出しがあれば、その直前まで。なければ列全体
    const sameRowOthers = uniqHeaders.filter(x => x.row === h.row && x.col !== h.col).sort((a, b) => a.col - b.col);
    const rightSibling = sameRowOthers.find(x => x.col > h.col);
    const colStart = h.col;
    const colEnd = rightSibling ? rightSibling.col - 1 : range.e.c;

    // Day1 はヘッダー行に直接チーム名が並ぶケースがあるため、ヘッダー行も走査
    const teamNames = extractTeamsInRegion(ws, rowStart, rowEnd, colStart, colEnd);

    if (teamNames.length < 2) continue; // 最低2チーム必要

    // リーグID: 連番のアルファベットだと混乱するので "男子1部" などの部名をそのまま使用
    const leagueId = h.label;

    const teams: TeamEntry[] = teamNames.slice(0, 5).map((name, idx) => {
      const rosterKey = `${h.gender}:${h.rank}:${normalizeTeamName(name)}`;
      const members = rosterMap.get(rosterKey) || [];
      return {
        teamId: `${leagueId}-${idx + 1}`,
        leagueId,
        numberInLeague: idx + 1,
        teamNumber: idx + 1,
        teamName: name,
        members,
        status: 'none',
      };
    });

    const matchOrder = teams.length <= 3
      ? MATCH_ORDER_3
      : teams.length <= 4
        ? MATCH_ORDER_4
        : MATCH_ORDER_5;

    leagues.push({
      leagueId,
      courtName: h.courtName || '',
      teams,
      matchOrder,
    });

    for (const mo of matchOrder) {
      const team1 = teams[mo.team1Index - 1];
      const team2 = teams[mo.team2Index - 1];
      if (!team1 || !team2) continue;
      matches.push({
        matchId: `league-${leagueId}-${mo.matchNumber}`,
        leagueId,
        matchNumber: mo.matchNumber,
        team1Id: team1.teamId,
        team2Id: team2.teamId,
        subMatches: MATCH_TYPE_ORDER_CLUB.map(type => ({
          type,
          score1: null, score2: null, tiebreakScore: null, winnerId: null,
        })),
        winnerId: null,
        winsTeam1: 0,
        winsTeam2: 0,
        status: 'waiting',
      });
    }
  }

  // ゲームルールのデフォルト（3チームリーグは8ゲーム、4・5チームリーグは6ゲーム）
  info.gameRules = info.gameRules || {};
  if (!info.gameRules[3]) info.gameRules[3] = '8ゲームマッチ（8-8タイブレーク・ノーアド）';
  if (!info.gameRules[4]) info.gameRules[4] = '6ゲーム先取（ノーアド）';
  if (!info.gameRules[5]) info.gameRules[5] = '6ゲーム先取（ノーアド）';
  info.bracketGameRule = info.bracketGameRule || '6ゲームマッチ（6-6タイブレーク・ノーアド）';

  return { info, leagues, matches };
}
