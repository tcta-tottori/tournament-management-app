import * as XLSX from 'xlsx';
import type {
  TeamEntry, TeamLeague, TeamLeagueMatch, TeamTournamentInfo,
  MatchOrderEntry,
} from './types';
import { MATCH_TYPE_ORDER } from './teamLogic';

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
  // 日付ラベルや日時表記
  if (/(令和|平成|年度|予備日)/.test(s)) return false;
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

        // 年度
        if (/令和\s*[\d０-９]+\s*年度/.test(clean)) {
          if (!yearText || clean.length < yearText.length) yearText = clean;
        }
        // タイトル候補（"クラブ対抗" を含む短めの文字列）
        if (/クラブ対抗/.test(clean) && clean.length <= 40 && !/方法|ルール|タイブレーク|ノーアド/.test(clean)) {
          if (!titleText || clean.length < titleText.length) titleText = clean;
        }

        // 日付
        if (!info.date) {
          const half = toHalf(clean);
          const d = half.match(/(?:令和|R)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/);
          if (d && !/(方法|ルール|ゲームマッチ)/.test(clean)) info.date = d[0];
        }

        if (!info.venue || info.venue === 'ヤマタスポーツパーク') {
          if (/(会\s*場|コート|テニスパーク|スポーツパーク)/.test(clean) && /[（(]?[ぁ-んァ-ヶー一-龥a-zA-Z]/.test(clean) && clean.length <= 40 && !/会場$/.test(clean.trim())) {
            // 会場名らしき行をピックアップ（簡易）
            if (/(コート|スポーツパーク|テニスパーク|体育館)/.test(clean)) {
              info.venue = clean.replace(/^会\s*場\s*[:：]?\s*/, '').split(/[（(]予備日/)[0].trim();
            }
          }
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

  // 最もデータが多いシートを選ぶ
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
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:CZ100');

  // 部見出しの位置を全て収集
  type Header = { row: number; col: number; gender: 'M' | 'F'; rank: number; label: string };
  const headers: Header[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellStr(ws, colLetter(c) + (r + 1));
      if (!v) continue;
      const div = divisionFromText(v);
      if (div) {
        headers.push({ row: r, col: c, ...div });
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
  // 同じ列内に複数見出しがある（縦並び）想定をベースに、行範囲を区切る
  const sortedByRow = [...uniqHeaders].sort((a, b) => a.row - b.row || a.col - b.col);

  const leagues: TeamLeague[] = [];
  const matches: TeamLeagueMatch[] = [];

  for (let i = 0; i < uniqHeaders.length; i++) {
    const h = uniqHeaders[i];
    const idxInRow = sortedByRow.findIndex(x => x.row === h.row && x.col === h.col && x.label === h.label);
    const next = sortedByRow[idxInRow + 1];

    // 行範囲: ヘッダー行〜次ヘッダーの直前（同列または近い列）
    const rowStart = h.row;
    const rowEnd = next ? next.row - 1 : Math.min(range.e.r, h.row + 25);

    // 列範囲: 同じ行に他の見出しがあれば、その直前まで。なければ列全体
    const sameRowOthers = uniqHeaders.filter(x => x.row === h.row && x.col !== h.col).sort((a, b) => a.col - b.col);
    const rightSibling = sameRowOthers.find(x => x.col > h.col);
    const colStart = h.col;
    const colEnd = rightSibling ? rightSibling.col - 1 : range.e.c;

    const teamNames = extractTeamsInRegion(ws, rowStart + 1, rowEnd, colStart, colEnd);

    if (teamNames.length < 2) continue; // 最低2チーム必要

    // リーグID: 連番のアルファベットだと混乱するので "男子1部" などの部名をそのまま使用
    const leagueId = h.label;

    const teams: TeamEntry[] = teamNames.slice(0, 5).map((name, idx) => ({
      teamId: `${leagueId}-${idx + 1}`,
      leagueId,
      numberInLeague: idx + 1,
      teamNumber: idx + 1,
      teamName: name,
      members: [],
      status: 'none',
    }));

    const matchOrder = teams.length <= 3
      ? MATCH_ORDER_3
      : teams.length <= 4
        ? MATCH_ORDER_4
        : MATCH_ORDER_5;

    leagues.push({
      leagueId,
      courtName: '',
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
        subMatches: MATCH_TYPE_ORDER.map(type => ({
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

  // ゲームルールのデフォルト
  info.gameRules = info.gameRules || {};
  if (!info.gameRules[3]) info.gameRules[3] = '6ゲームマッチ（6-6タイブレーク・ノーアド）';
  if (!info.gameRules[4]) info.gameRules[4] = '6ゲーム先取（ノーアド）';
  if (!info.gameRules[5]) info.gameRules[5] = '6ゲーム先取（ノーアド）';
  info.bracketGameRule = info.bracketGameRule || '6ゲームマッチ（6-6タイブレーク・ノーアド）';

  return { info, leagues, matches };
}
