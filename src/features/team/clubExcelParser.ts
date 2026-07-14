import * as XLSX from 'xlsx';
import type {
  TeamEntry, TeamLeague, TeamLeagueMatch, TeamMember, TeamTournamentInfo,
  MatchOrderEntry, MatchFormat, MatchType,
} from './types';
import { MATCH_TYPE_ORDER_CLUB, getMatchTypeOrder } from './teamLogic';

/** 3チームリーグの対戦順 */
const MATCH_ORDER_3: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 2 },
  { matchNumber: 2, team1Index: 2, team2Index: 3 },
  { matchNumber: 3, team1Index: 1, team2Index: 3 },
];

/** 4チームリーグの対戦順（後期規定: ①－④ ②－③ ①－③ ②－④ ①－② ③－④） */
const MATCH_ORDER_4_KOUKI: MatchOrderEntry[] = [
  { matchNumber: 1, team1Index: 1, team2Index: 4 },
  { matchNumber: 2, team1Index: 2, team2Index: 3 },
  { matchNumber: 3, team1Index: 1, team2Index: 3 },
  { matchNumber: 4, team1Index: 2, team2Index: 4 },
  { matchNumber: 5, team1Index: 1, team2Index: 2 },
  { matchNumber: 6, team1Index: 3, team2Index: 4 },
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

/** 会場（男女）別のセクション。後期形式など1ファイルに複数会場が含まれる場合に使用 */
export interface ClubVenueSection {
  key: string;           // 'F' | 'M'
  label: string;         // '女子（1部〜4部・予選会）' 等
  info: TeamTournamentInfo;
  leagues: TeamLeague[];
  matches: TeamLeagueMatch[];
}

export interface ParseResult {
  info: TeamTournamentInfo;
  leagues: TeamLeague[];
  matches: TeamLeagueMatch[];
  /** 男女で会場が分かれるファイルの場合、会場別セクションが入る（先頭がデフォルト） */
  sections?: ClubVenueSection[];
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
    .replace(/[．]/g, '.')
    .replace(/[，]/g, ',')
    .replace(/[・･]/g, '')
    .replace(/[\s\u3000]+/g, '')
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

// ============================================================
// 複数会場（男女別）形式のパース
// 「大会規定」シートが2枚以上ある場合、男女で会場が分かれる後期形式とみなし、
// 会場（性別）ごとに独立したセクション（リーグ・試合・大会情報）を構築する。
// ============================================================

/** 全空白（改行・全角スペース含む）を除去してチーム名として整形 */
function stripAllSpaces(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

/** 選手名の空白を半角1つに正規化 */
function normalizePlayerName(s: string): string {
  return s.replace(/[\s\u3000]+/g, ' ').trim();
}

/** セル文字列を取得（行・列番号指定） */
function cellAt(ws: XLSX.WorkSheet, r: number, c: number): string {
  return cellStr(ws, colLetter(c) + (r + 1));
}

/** 大会規定シートから抽出した情報 */
interface RegulationInfo {
  title: string;        // '令和８年度 鳥取市テニス協会クラブ対抗戦'
  date: string;         // '令和8年7月12日（日）'
  venue: string;        // 'ヤマタスポーツパーク'
  gameRule: string;     // '6ゲームマッチ（ノーアドバンテージ）'
  matchFormat: MatchFormat; // 3試合制→club3 / 5試合制→club
}

/** 大会規定シートを解析 */
function parseRegulationSheet(ws: XLSX.WorkSheet): RegulationInfo {
  const info: RegulationInfo = { title: '', date: '', venue: '', gameRule: '', matchFormat: 'club' };
  const ref = ws['!ref'];
  if (!ref) return info;
  const range = XLSX.utils.decode_range(ref);
  let formatFound = false;

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellAt(ws, r, c);
      if (!v) continue;
      const clean = v.replace(/\n/g, ' ').replace(/[\s\u3000]+/g, ' ').trim();
      const half = toHalf(clean);

      // タイトル（"クラブ対抗戦" を含む短い行）
      if (!info.title && /クラブ対抗/.test(clean) && clean.length <= 40 && !/規定|要項|リーグ表|メンバー/.test(clean)) {
        info.title = clean;
      }
      // 日時
      if (!info.date && /日\s*時/.test(clean)) {
        const m = half.match(/令和\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日\s*（[^）]*）?/);
        if (m) info.date = m[0].replace(/\s+/g, '');
      }
      // 会場（"※予備日" 以降は除外）
      if (!info.venue && /会\s*場/.test(clean)) {
        const after = clean.split(/[:：]/).slice(1).join('：');
        const main = after.split(/[※（(]/)[0].replace(/[\s\u3000]+/g, '');
        if (main) info.venue = main;
      }
      // ゲームルール（"６ゲームマッチ（ノーアドバンテージ）" 等）
      if (!info.gameRule) {
        const m = half.match(/(\d+)\s*ゲーム\s*(先取|マッチ)\s*(（[^）]*）)?/);
        if (m) info.gameRule = `${m[1]}ゲーム${m[2]}${m[3] ? m[3].replace(/\s+/g, '') : ''}`;
      }
      // 試合数（"○試合制" の明記で判定。最初に見つかったものを採用）
      if (!formatFound) {
        if (/3\s*試合制/.test(half)) {
          info.matchFormat = 'club3';
          formatFound = true;
        } else if (/5\s*試合制/.test(half)) {
          info.matchFormat = 'club';
          formatFound = true;
        }
      }
    }
  }
  return info;
}

/** コート割シートの部・予選会リーグ見出し */
interface VenueLeagueHeader {
  row: number;
  col: number;
  leagueId: string;
  courtName: string;
}

/**
 * コート割シートから見出し行ベースのリーグを抽出する（女子会場形式）。
 * 見出しセル（例: "女子１部\n5・6 ｺｰﾄ" / "予選会Ａリーグ\n13・14 ｺｰﾄ"）と
 * 同じ行の右側に並ぶチーム名を読む。
 */
function parseHeaderLeagues(
  ws: XLSX.WorkSheet,
  genderLabel: string,
): { header: VenueLeagueHeader; teamNames: string[] }[] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const results: { header: VenueLeagueHeader; teamNames: string[] }[] = [];
  const seenLeagueIds = new Set<string>();

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellAt(ws, r, c);
      if (!v) continue;
      const clean = v.replace(/\n/g, ' ').replace(/[\s\u3000]+/g, ' ').trim();
      if (/決定戦|順位/.test(clean)) continue;
      const half = toHalf(clean).replace(/ｺｰﾄ/g, 'コート');

      let leagueId = '';
      const divM = half.match(/^(男子|女子)?\s*([1-9])\s*部/);
      const qualM = half.match(/^予選会\s*([A-Za-z]?)\s*リーグ/);
      if (divM) {
        leagueId = `${divM[1] || genderLabel}${divM[2]}部`;
      } else if (qualM) {
        leagueId = `${genderLabel}予選会${(qualM[1] || '').toUpperCase()}`;
      } else {
        continue;
      }
      if (seenLeagueIds.has(leagueId)) continue;

      // コート名（"5・6 コート" → "5・6コート"）
      const courtM = half.match(/(\d+(?:\s*[・･,、]\s*\d+)*)\s*コート/);
      const courtName = courtM ? `${courtM[1].replace(/[\s,、･]+/g, '・').replace(/\s+/g, '')}コート` : '';

      // 同じ行の右側からチーム名を収集
      const teamNames: string[] = [];
      for (let tc = c + 1; tc <= range.e.c; tc++) {
        const tv = cellAt(ws, r, tc);
        if (!tv) continue;
        const name = stripAllSpaces(tv);
        if (!name || !looksLikeTeamName(name)) continue;
        if (teamNames.includes(name)) continue;
        teamNames.push(name);
      }
      if (teamNames.length < 2) continue;

      seenLeagueIds.add(leagueId);
      results.push({ header: { row: r, col: c, leagueId, courtName }, teamNames });
    }
  }
  return results;
}

/** 丸数字1つを含むセルからチーム番号を抽出（見つからなければ0） */
function circledNumberIn(s: string): number {
  for (let i = 0; i < CIRCLED_NUMBERS.length; i++) {
    if (s.includes(CIRCLED_NUMBERS[i])) return i + 1;
  }
  return 0;
}

/**
 * コート割シートから丸数字＋チーム名ペア（例: "①" の右隣に " プラセール"）を抽出。
 * 男子予選会（10チーム単独リーグ）形式で使用。
 */
function parseNumberedTeams(ws: XLSX.WorkSheet): Map<number, string> {
  const teams = new Map<number, string>();
  const ref = ws['!ref'];
  if (!ref) return teams;
  const range = XLSX.utils.decode_range(ref);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellAt(ws, r, c);
      if (!v) continue;
      const trimmed = v.trim();
      // セルが丸数字1文字のみ
      if (trimmed.length !== 1 || !CIRCLED_NUMBERS.includes(trimmed)) continue;
      const num = CIRCLED_NUMBERS.indexOf(trimmed) + 1;
      if (teams.has(num)) continue;
      // 右側の近傍セルからチーム名を探す
      for (let tc = c + 1; tc <= Math.min(c + 8, range.e.c); tc++) {
        const tv = cellAt(ws, r, tc);
        if (!tv) continue;
        const name = stripAllSpaces(tv);
        if (name && looksLikeTeamName(name)) {
          teams.set(num, name);
        }
        break; // 最初の非空セルのみ判定
      }
    }
  }
  return teams;
}

/**
 * OP（オーダー・オブ・プレー）シートから対戦順を抽出する。
 * - コート見出し行（"№１" 等）で使用コートを把握
 * - "１R"〜"５R" 行の丸数字入りチームセルをペアにして対戦を作る
 */
function parseOpMatches(ws: XLSX.WorkSheet): MatchOrderEntry[] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);

  type RawMatch = { round: number; courtKey: number; courts: string[]; t1: number; t2: number };
  const raw: RawMatch[] = [];
  let courtHeader: { col: number; no: string }[] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    // 行内セルを収集
    const teamCells: { col: number; num: number }[] = [];
    const courtCells: { col: number; no: string }[] = [];
    let round = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellAt(ws, r, c);
      if (!v) continue;
      const half = toHalf(v.replace(/\n/g, ' ')).trim();
      const courtM = half.match(/№\s*(\d+)/);
      if (courtM) {
        courtCells.push({ col: c, no: courtM[1] });
        continue;
      }
      const roundM = half.match(/^(\d)\s*R$/i);
      if (roundM) {
        round = parseInt(roundM[1], 10);
        continue;
      }
      const num = circledNumberIn(v);
      if (num > 0 && stripAllSpaces(v).length > 1) {
        teamCells.push({ col: c, num });
      }
    }
    if (courtCells.length > 0) {
      courtHeader = courtCells;
      continue;
    }
    if (round === 0 || teamCells.length < 2) continue;

    teamCells.sort((a, b) => a.col - b.col);
    for (let i = 0; i + 1 < teamCells.length; i += 2) {
      const t1 = teamCells[i];
      const t2 = teamCells[i + 1];
      const courts = courtHeader
        .filter(h => h.col >= t1.col && h.col < t2.col + 1)
        .map(h => h.no);
      raw.push({
        round,
        courtKey: courts.length > 0 ? parseInt(courts[0], 10) : t1.col,
        courts,
        t1: t1.num,
        t2: t2.num,
      });
    }
  }

  raw.sort((a, b) => a.round - b.round || a.courtKey - b.courtKey);
  return raw.map((m, i) => ({
    matchNumber: i + 1,
    team1Index: m.t1,
    team2Index: m.t2,
    round: m.round,
    courts: m.courts,
  }));
}

/** 10チーム変則リーグ（奇数番×偶数番の5試合制）の対戦順を生成するフォールバック */
function generateBipartiteOrder(teamCount: number): MatchOrderEntry[] {
  const odds: number[] = [];
  const evens: number[] = [];
  for (let i = 1; i <= teamCount; i++) (i % 2 === 1 ? odds : evens).push(i);
  const order: MatchOrderEntry[] = [];
  let num = 1;
  const rounds = Math.max(odds.length, evens.length);
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < odds.length && i < evens.length; i++) {
      order.push({
        matchNumber: num++,
        team1Index: odds[i],
        team2Index: evens[(i + r) % evens.length],
        round: r + 1,
      });
    }
  }
  return order;
}

/** 2つの文字列の先頭一致文字数 */
function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * チーム名から選手名簿（メンバー）を実行時に復元するフォールバック。
 * インポート後にチーム名を変更したり、コート割と名簿でチーム名の表記が
 * 食い違っていて取り込み時に紐付かなかった場合でも、正規化名の
 * 「完全一致 → 共通接頭辞が十分長く一意な候補」の順でメンバーを引き当てる。
 *
 * @param teamName 対象チーム名（変更後の表示名でも可）
 * @param candidates メンバーを持つ可能性のあるチーム一覧
 * @returns 引き当てたメンバー配列（見つからなければ空配列）
 */
export function findMembersByTeamName<T extends { teamName: string; members?: { player: unknown }[] }>(
  teamName: string,
  candidates: T[],
): NonNullable<T['members']> {
  const empty = [] as unknown as NonNullable<T['members']>;
  const target = normalizeTeamName(teamName);
  if (!target) return empty;
  const withMembers = candidates.filter(c => (c.members?.length ?? 0) > 0);
  if (withMembers.length === 0) return empty;

  // 1) 正規化名の完全一致
  const exact = withMembers.find(c => normalizeTeamName(c.teamName) === target);
  if (exact) return exact.members as NonNullable<T['members']>;

  // 2) 共通接頭辞が十分長く、かつ一意な候補へフォールバック
  const MIN_PREFIX = 3;
  let best: T | null = null;
  let bestLen = 0;
  let tie = false;
  for (const c of withMembers) {
    const norm = normalizeTeamName(c.teamName);
    const cpl = commonPrefixLen(target, norm);
    const need = Math.max(MIN_PREFIX, Math.ceil(Math.min(target.length, norm.length) / 2));
    if (cpl >= need) {
      if (cpl > bestLen) { bestLen = cpl; best = c; tie = false; }
      else if (cpl === bestLen) { tie = true; }
    }
  }
  return (best && !tie) ? best.members as NonNullable<T['members']> : empty;
}

/**
 * 名簿シートからチーム名→メンバーを抽出する（セクション用）。
 * 直下に連番（1始まり）が続くチーム名セルを「見出しブロック」として全て収集し、
 * コート割由来のチーム名へ割り当てる。
 * - まず正規化名の完全一致で割り当て
 * - 一致しなかったチームは、共通接頭辞が十分長く一意なブロックへフォールバック割当。
 *   コート割と名簿でチーム名の表記が食い違う場合（例: "湖山池ＴＣ２" ↔ "湖山池東"、
 *   "鳥取市立病院⅖" ↔ "鳥取市立病院⅗"）でも選手名簿を取りこぼさないための救済。
 * 前年度参考列（K列以降）は対象外。
 */
function parseSectionRoster(
  ws: XLSX.WorkSheet | undefined,
  gender: 'M' | 'F',
  teamNames: string[],
): Map<string, TeamMember[]> {
  const result = new Map<string, TeamMember[]>();
  if (!ws) return result;
  const ref = ws['!ref'];
  if (!ref) return result;
  const range = XLSX.utils.decode_range(ref);
  const PLAYER_COL_LIMIT = 9; // A〜J列（0-9）を当年度分とみなす

  // 1) 名簿シート内のチーム見出しブロックを全収集
  //    （見出し = チーム名らしいセルで、直下の同列セルが連番になっているもの）
  interface RosterBlock { norm: string; members: { name: string }[]; }
  const blocks: RosterBlock[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, PLAYER_COL_LIMIT); c++) {
      const v = cellAt(ws, r, c);
      if (!v || !looksLikeTeamName(v)) continue;
      // 直下セルが連番でなければチーム見出しとみなさない
      if (!/^\d+$/.test(toHalf(cellAt(ws, r + 1, c)).trim())) continue;
      const norm = normalizeTeamName(stripAllSpaces(v));
      if (!norm) continue;

      const members: { name: string }[] = [];
      for (let row = r + 1; row <= range.e.r; row++) {
        const numCell = toHalf(cellAt(ws, row, c)).trim();
        if (!/^\d+$/.test(numCell)) break;
        const nameCell = normalizePlayerName(cellAt(ws, row, c + 1));
        if (!nameCell || /^\d+$/.test(toHalf(nameCell))) continue;
        members.push({ name: nameCell });
      }
      if (members.length > 0) blocks.push({ norm, members });
    }
  }
  if (blocks.length === 0) return result;

  const used = new Array(blocks.length).fill(false);
  const reqNorms = teamNames.map(n => normalizeTeamName(n));
  const assign = (reqNorm: string, teamName: string, blockIdx: number) => {
    if (result.has(reqNorm)) return;
    result.set(
      reqNorm,
      blocks[blockIdx].members.map(m => ({
        player: { name: m.name, affiliation: teamName },
        gender,
      })),
    );
    used[blockIdx] = true;
  };

  // 2) 完全一致（正規化）を優先
  reqNorms.forEach((rn, i) => {
    if (!rn || result.has(rn)) return;
    const idx = blocks.findIndex((b, bi) => !used[bi] && b.norm === rn);
    if (idx >= 0) assign(rn, teamNames[i], idx);
  });

  // 3) フォールバック: 未一致チームを共通接頭辞が十分長く一意なブロックへ割当
  const MIN_PREFIX = 3;
  reqNorms.forEach((rn, i) => {
    if (!rn || result.has(rn)) return;
    let best = -1, bestLen = 0, tie = false;
    blocks.forEach((b, bi) => {
      if (used[bi]) return;
      const cpl = commonPrefixLen(rn, b.norm);
      // 短い方の半分以上、かつ最低3文字の一致を要求
      const need = Math.max(MIN_PREFIX, Math.ceil(Math.min(rn.length, b.norm.length) / 2));
      if (cpl >= need) {
        if (cpl > bestLen) { bestLen = cpl; best = bi; tie = false; }
        else if (cpl === bestLen) { tie = true; }
      }
    });
    if (best >= 0 && !tie) assign(rn, teamNames[i], best);
  });

  return result;
}

/** リーグとその対戦から TeamLeague / TeamLeagueMatch を構築 */
function buildLeague(
  leagueId: string,
  courtName: string,
  teamNames: string[],
  matchOrder: MatchOrderEntry[],
  rosterMap: Map<string, TeamMember[]>,
  matchTypeOrder: MatchType[],
): { league: TeamLeague; matches: TeamLeagueMatch[] } {
  const teams: TeamEntry[] = teamNames.map((name, idx) => ({
    teamId: `${leagueId}-${idx + 1}`,
    leagueId,
    numberInLeague: idx + 1,
    teamNumber: idx + 1,
    teamName: name,
    members: rosterMap.get(normalizeTeamName(name)) || [],
    status: 'none',
  }));

  const matches: TeamLeagueMatch[] = [];
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
      subMatches: matchTypeOrder.map(type => ({
        type, score1: null, score2: null, tiebreakScore: null, winnerId: null,
      })),
      winnerId: null,
      winsTeam1: 0,
      winsTeam2: 0,
      status: 'waiting',
    });
  }
  return { league: { leagueId, courtName, teams, matchOrder }, matches };
}

/**
 * 複数会場（男女別）形式のパースを試みる。
 * 「大会規定」シートが2枚以上ある場合のみセクション配列を返し、それ以外は null。
 */
function tryParseMultiVenue(wb: XLSX.WorkBook, fileName: string): ClubVenueSection[] | null {
  const regSheetNames = wb.SheetNames.filter(n => /大会規定/.test(n));
  if (regSheetNames.length < 2) return null;

  const termLabel = /後期/.test(fileName) ? '後期' : /前期/.test(fileName) ? '前期' : '';
  const sections: ClubVenueSection[] = [];

  for (const regName of regSheetNames) {
    const isWomen = /女子/.test(regName);
    const gender: 'M' | 'F' = isWomen ? 'F' : 'M';
    const genderLabel = isWomen ? '女子' : '男子';
    const matchesGender = (n: string) => (isWomen ? /女子/.test(n) : !/女子/.test(n));

    const courtSheetName = wb.SheetNames.find(n => /コート割/.test(n) && matchesGender(n));
    if (!courtSheetName) continue;
    const courtWs = wb.Sheets[courtSheetName];
    const opSheetName = wb.SheetNames.find(n => /^OP/i.test(n.trim()) && matchesGender(n));
    const rosterSheetName = wb.SheetNames.find(n => /名簿|メンバー/.test(n) && matchesGender(n));

    const reg = parseRegulationSheet(wb.Sheets[regName]);

    const leagues: TeamLeague[] = [];
    const matches: TeamLeagueMatch[] = [];
    let bracketOrders: TeamTournamentInfo['bracketOrders'] | undefined;
    let bracketLabels: TeamTournamentInfo['bracketLabels'] | undefined;
    const gameRules: Record<number, string> = {};

    // 1) 見出し行ベース（女子会場形式: N部＋予選会リーグ）
    const headerLeagues = parseHeaderLeagues(courtWs, genderLabel);

    if (headerLeagues.length > 0) {
      const allTeamNames = headerLeagues.flatMap(h => h.teamNames);
      const rosterMap = parseSectionRoster(
        rosterSheetName ? wb.Sheets[rosterSheetName] : undefined, gender, allTeamNames,
      );
      const matchTypeOrder = getMatchTypeOrder(reg.matchFormat);

      for (const { header, teamNames } of headerLeagues) {
        const names = teamNames.slice(0, 5);
        const order = names.length <= 3
          ? MATCH_ORDER_3
          : names.length === 4
            ? MATCH_ORDER_4_KOUKI
            : generateBipartiteOrder(names.length); // 想定外サイズは総当りにしない安全側
        const built = buildLeague(header.leagueId, header.courtName, names, order, rosterMap, matchTypeOrder);
        leagues.push(built.league);
        matches.push(...built.matches);
        if (reg.gameRule) gameRules[names.length] = reg.gameRule;
      }

      // 予選会A/Bがあれば順位決定戦（A n位 vs B n位）を生成
      const qualLeagues = leagues.filter(l => /予選会/.test(l.leagueId)).sort((a, b) => a.leagueId.localeCompare(b.leagueId));
      if (qualLeagues.length === 2) {
        const [a, b] = qualLeagues;
        const maxRank = Math.min(a.teams.length, b.teams.length, 3);
        const orders: NonNullable<TeamTournamentInfo['bracketOrders']> = {};
        const labels: NonNullable<TeamTournamentInfo['bracketLabels']> = {};
        const cats = ['1st', '2nd', '3rd'] as const;
        for (let rank = 1; rank <= maxRank; rank++) {
          const cat = cats[rank - 1];
          orders[cat] = [`${a.leagueId}${rank}`, `${b.leagueId}${rank}`];
          labels[cat] = `予選会 ${rank * 2 - 1}位・${rank * 2}位決定戦`;
        }
        bracketOrders = orders;
        bracketLabels = labels;
      }
    } else {
      // 2) 丸数字ベース（男子予選会形式: 1リーグ変則対戦）
      const numbered = parseNumberedTeams(courtWs);
      if (numbered.size < 2) continue;
      const teamCount = Math.max(...numbered.keys());
      const teamNames: string[] = [];
      for (let i = 1; i <= teamCount; i++) {
        teamNames.push(numbered.get(i) || `チーム${i}`);
      }

      const leagueId = `${genderLabel}予選会`;
      const rosterMap = parseSectionRoster(
        rosterSheetName ? wb.Sheets[rosterSheetName] : undefined, gender, teamNames,
      );
      const matchTypeOrder = getMatchTypeOrder(reg.matchFormat);

      let order = opSheetName ? parseOpMatches(wb.Sheets[opSheetName]) : [];
      // OPから十分な対戦が取れない場合は変則（奇数×偶数）対戦を生成
      if (order.length < teamCount / 2) {
        order = generateBipartiteOrder(teamCount);
      }
      // 範囲外のチーム番号を除去
      order = order.filter(mo => mo.team1Index >= 1 && mo.team1Index <= teamCount && mo.team2Index >= 1 && mo.team2Index <= teamCount);

      const built = buildLeague(leagueId, '', teamNames, order, rosterMap, matchTypeOrder);
      leagues.push(built.league);
      matches.push(...built.matches);
      if (reg.gameRule) gameRules[teamCount] = reg.gameRule;
    }

    if (leagues.length === 0) continue;

    const sectionLabel = isWomen
      ? `女子（${leagues.map(l => l.leagueId.replace(/^女子/, '')).join('・')}）`
      : leagues.length === 1 && /予選会/.test(leagues[0].leagueId)
        ? '男子予選会'
        : `男子（${leagues.map(l => l.leagueId.replace(/^男子/, '')).join('・')}）`;

    const nameSuffix = [termLabel, isWomen ? '女子' : '男子予選会'].filter(Boolean).join('・');
    const baseTitle = reg.title || fileName.replace(/\.(xlsx?|xls)$/i, '');

    const info: TeamTournamentInfo = {
      name: `${baseTitle}（${nameSuffix}）`,
      date: reg.date,
      venue: reg.venue || 'ヤマタスポーツパーク',
      rules: [],
      matchFormat: reg.matchFormat,
      gameRules,
      bracketGameRule: reg.gameRule || undefined,
      bracketOrders,
      bracketLabels,
    };

    sections.push({ key: gender, label: sectionLabel, info, leagues, matches });
  }

  return sections.length > 0 ? sections : null;
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
export function parseClubExcel(buffer: ArrayBuffer, fileNameRaw: string): ParseResult {
  // macOS等でファイル名がNFD正規化されている場合に「後期」「クラブ対抗」等の判定が外れないようNFCへ統一
  const fileName = fileNameRaw.normalize('NFC');
  const wb = XLSX.read(buffer, { type: 'array' });

  // 男女別会場（大会規定シートが複数）の形式を優先的に試す
  const sections = tryParseMultiVenue(wb, fileName);
  if (sections) {
    const first = sections[0];
    return { info: first.info, leagues: first.leagues, matches: first.matches, sections };
  }

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
