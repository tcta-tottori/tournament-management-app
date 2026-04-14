import * as XLSX from 'xlsx';
import type {
  TeamEntry, TeamLeague, TeamLeagueMatch, TeamTournamentInfo,
  MatchOrderEntry, TeamMember, SubMatchScore, MatchType
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

/** 全角→半角 */
function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}


/** セル値を文字列に変換 */
function cellStr(ws: XLSX.WorkSheet, ref: string): string {
  const cell = ws[ref];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

/** セル値を数値に変換 */
function cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const cell = ws[ref];
  if (!cell || cell.v === null || cell.v === undefined) return null;
  const n = Number(cell.v);
  return isNaN(n) ? null : n;
}

/** XLSX列番号→文字 (0-based) */
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

interface ParseResult {
  info: TeamTournamentInfo;
  leagues: TeamLeague[];
  matches: TeamLeagueMatch[];
}

/**
 * Excelのセルフォント色を取得するためのマッピングを構築する。
 * XLSX.CFB を使って xlsx 内部の worksheet XML から各セルの style index を取得し、
 * wb.Styles.CellXf → wb.Styles.Fonts で font color を解決する。
 */
function buildCellFontColorMap(
  buffer: ArrayBuffer,
  wb: XLSX.WorkBook,
  sheetPath: string,
): Map<string, string> {
  const colorMap = new Map<string, string>();
  try {
    const CFB = (XLSX as any).CFB;
    if (!CFB) return colorMap;
    const cfb = CFB.read(new Uint8Array(buffer), { type: 'array' });
    const entry = CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) return colorMap;
    const xml = typeof entry.content === 'string'
      ? entry.content
      : new TextDecoder().decode(entry.content);
    const cellRegex = /<c r="([A-Z]+\d+)"[^>]*s="(\d+)"[^>]*>/g;
    let match: RegExpExecArray | null;
    while ((match = cellRegex.exec(xml)) !== null) {
      const ref = match[1];
      const styleIdx = parseInt(match[2]);
      const xf = wb.Styles?.CellXf?.[styleIdx];
      if (!xf) continue;
      const font = wb.Styles?.Fonts?.[xf.fontId];
      if (!font?.color?.rgb) continue;
      colorMap.set(ref, font.color.rgb);
    }
  } catch {
    // CFBが使えない場合はフォールバック（色情報なし）
  }
  return colorMap;
}

/** フォント色から性別を判定 */
function genderFromFontColor(color: string | undefined): 'M' | 'F' {
  if (!color) return 'F'; // デフォルトは女性
  if (color === '0070C0' || color === 'FF0070C0') return 'M'; // 青 = 男性
  if (color === 'FF0000' || color === 'FFFF0000') return 'F'; // 赤 = 女性
  return 'F'; // デフォルト
}

/**
 * 団体戦Excelパーサー
 */
export function parseTeamExcel(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellStyles: true });

  // 大会情報を表紙シートから取得
  const info = parseTournamentInfo(wb);

  // 予選リーグシートからリーグ・チーム情報を取得
  const leagueSheetName = wb.SheetNames.find(n => n.includes('予選リーグ'));
  // 選手名簿シートからメンバー情報を取得
  const rosterSheetName = wb.SheetNames.find(n => n.includes('選手名簿'));
  // 成績表シートからスコアを取得
  const resultSheet4Name = wb.SheetNames.find(n => n.includes('成績表') && n.includes('4'));
  const resultSheet5Name = wb.SheetNames.find(n => n.includes('成績表') && n.includes('5'));

  if (!leagueSheetName) {
    throw new Error('予選リーグシートが見つかりません');
  }

  const leagueWs = wb.Sheets[leagueSheetName];
  const rosterWs = rosterSheetName ? wb.Sheets[rosterSheetName] : null;

  // 選手名簿シートのフォント色マップを構築（性別判定用）
  const rosterSheetIndex = rosterSheetName
    ? wb.SheetNames.indexOf(rosterSheetName)
    : -1;
  const rosterColorMap = rosterSheetIndex >= 0
    ? buildCellFontColorMap(buffer, wb, `/xl/worksheets/sheet${rosterSheetIndex + 1}.xml`)
    : new Map<string, string>();

  // リーグ・チーム情報をパース
  const { leagues, teamNumberMap } = parseLeagues(leagueWs);

  // 選手名簿からメンバー情報を取得（色による性別判定付き）
  if (rosterWs) {
    parseRoster(rosterWs, leagues, teamNumberMap, rosterColorMap);
  }

  // 予選リーグシートから決勝トーナメントのブラケット順を取得
  parseBracketOrders(leagueWs, info);

  // 試合データ生成
  const matches: TeamLeagueMatch[] = [];
  for (const league of leagues) {
    const matchOrder = league.teams.length <= 3
      ? MATCH_ORDER_3
      : league.teams.length <= 4
        ? MATCH_ORDER_4
        : MATCH_ORDER_5;
    league.matchOrder = matchOrder;
    for (const mo of matchOrder) {
      const team1 = league.teams[mo.team1Index - 1];
      const team2 = league.teams[mo.team2Index - 1];
      if (!team1 || !team2) continue;
      matches.push({
        matchId: `league-${league.leagueId}-${mo.matchNumber}`,
        leagueId: league.leagueId,
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

  // 成績表からスコアを読み取り
  if (resultSheet4Name) {
    const ws4 = wb.Sheets[resultSheet4Name];
    parseResultSheet(ws4, leagues, matches);
  }
  if (resultSheet5Name) {
    const ws5 = wb.Sheets[resultSheet5Name];
    parseResultSheet(ws5, leagues, matches);
  }

  return { info, leagues, matches };
}

/** 表紙から大会情報をパース */
function parseTournamentInfo(wb: XLSX.WorkBook): TeamTournamentInfo {
  const coverSheetName = wb.SheetNames.find(n => n.includes('表紙'));
  const info: TeamTournamentInfo = {
    name: '',
    date: '',
    venue: '',
    rules: [],
  };

  if (!coverSheetName) return info;
  const ws = wb.Sheets[coverSheetName];

  // 候補を収集
  let yearText = '';
  let titleText = '';

  // タイトルらしからぬ文字列（ルール説明・順位決定方法など）を除外
  const isRuleLike = (s: string) =>
    /(方法|ルール|マッチ|ノーアド|タイブレ|ゲーム先取|ゲームマッチ|行います|ダブルス|男子|女子|先取|リーグ戦|特別|順位|決定)/.test(s);

  const pickTitle = (clean: string) => {
    if (!/(会長杯|テニス大会|選手権|カップ|杯)/.test(clean)) return;
    if (/令和/.test(clean)) return;
    if (isRuleLike(clean)) return;
    if (clean.length > 40) return;
    // より短く端的なタイトルを優先（ルール説明より大会名は短い）
    if (!titleText || clean.length < titleText.length) titleText = clean;
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z50');
  for (let r = range.s.r; r <= Math.min(range.e.r, 50); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = colLetter(c) + (r + 1);
      const val = cellStr(ws, ref);
      if (!val) continue;
      const clean = val.replace(/\s+/g, ' ').trim();

      // 年度行（令和〜年度）— 最も短いものを採用（純粋な "令和7年度" が望ましい）
      if (/令和\s*[\d０-９]+\s*年度/.test(clean) && !isRuleLike(clean)) {
        if (!yearText || clean.length < yearText.length) yearText = clean;
      }
      pickTitle(clean);

      // 日付検出: "3/15" "3月15日" "2026/4/8" "R7.4.8" "令和８年４月29日" 等
      // ※ 全角数字にも対応
      if (!info.date) {
        const halfClean = toHalf(clean);
        const dateMatch = halfClean.match(/(?:令和|R|平成|H)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/) ||
                          halfClean.match(/^\d{1,2}\/\d{1,2}$/);
        if (dateMatch && !isRuleLike(clean) && !/令和\s*[\d０-９]+\s*年度/.test(clean)) {
          info.date = dateMatch[0];
        }
      }

      // "日　時" "日 時" "日時" "開催日" ラベルの検出（全角スペースや複数スペースに対応）
      if (!info.date && (/日[\s\u3000]*時/.test(val) || val.includes('開催日'))) {
        // ラベル部分を除去して日付を抽出
        const stripped = val.replace(/^日[\s\u3000]*時[\s\u3000]*[：:]?\s*/, '').trim();
        if (stripped && stripped !== val.trim()) {
          // "令和８年４月29日（祝）　予備日　..." → "令和8年4月29日" を抽出
          const halfStripped = toHalf(stripped);
          const dateInStr = halfStripped.match(/(?:令和|R|平成|H)?\s*\d{1,4}年\s*\d{1,2}月\s*\d{1,2}日/);
          info.date = dateInStr ? dateInStr[0] : stripped.split(/予備日/)[0].replace(/[（(].*/g, '').trim();
        } else {
          // ラベルのみ → 右・下の隣接セルから値を取得
          for (const adj of [colLetter(c + 1) + (r + 1), colLetter(c + 2) + (r + 1), colLetter(c) + (r + 2)]) {
            const v = cellStr(ws, adj);
            if (v && !/^(日[\s\u3000]*時|開催日|会[\s\u3000]*場|会場)/.test(v)) { info.date = v.trim(); break; }
          }
        }
      }
      if (!info.venue && /会[\s\u3000]*場/.test(val)) {
        const stripped = val.replace(/^会[\s\u3000]*場[\s\u3000]*[：:]?\s*/, '').trim();
        if (stripped && stripped !== val.trim()) {
          // "ヤマタスポーツパークテニスコート（予備日：千代コート）" → メイン会場名を抽出
          info.venue = stripped.split(/[（(]予備日/)[0].replace(/[（(].*$/, '').trim() || stripped;
        } else {
          for (const adj of [colLetter(c + 1) + (r + 1), colLetter(c + 2) + (r + 1), colLetter(c) + (r + 2)]) {
            const v = cellStr(ws, adj);
            if (v && !/^(日[\s\u3000]*時|開催日|会[\s\u3000]*場|会場)/.test(v)) { info.venue = v.trim(); break; }
          }
        }
      }
      // ルール文
      if (/ゲームマッチ|ノーアド|タイブレ|ゲーム先取|リーグ戦/.test(val)) {
        info.rules.push(val.trim());
      }
    }
  }

  // 他の表紙シート（例: 表紙（HP））からも補完
  {
    const otherCovers = wb.SheetNames.filter(n => n.includes('表紙') && n !== coverSheetName);
    for (const sn of otherCovers) {
      const sws = wb.Sheets[sn];
      const srange = XLSX.utils.decode_range(sws['!ref'] || 'A1:Z50');
      for (let r = srange.s.r; r <= Math.min(srange.e.r, 50); r++) {
        for (let c = srange.s.c; c <= srange.e.c; c++) {
          const v = cellStr(sws, colLetter(c) + (r + 1));
          if (!v) continue;
          const clean = v.replace(/\s+/g, ' ').trim();
          if (/令和\s*[\d０-９]+\s*年度/.test(clean) && !isRuleLike(clean)) {
            if (!yearText || clean.length < yearText.length) yearText = clean;
          }
          pickTitle(clean);
          if (!info.date) {
            const halfClean2 = toHalf(clean);
            const dateMatch = halfClean2.match(/(?:令和|R|平成|H)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/) ||
                              halfClean2.match(/^\d{1,2}\/\d{1,2}$/);
            if (dateMatch && !isRuleLike(clean) && !/令和\s*[\d０-９]+\s*年度/.test(clean)) {
              info.date = dateMatch[0];
            }
          }
        }
      }
    }
  }

  // 年度 + 大会タイトルを連結
  info.name = [yearText, titleText].filter(Boolean).join(' ').trim();

  // ゲームルール解析
  info.gameRules = {};
  for (const r of info.rules) {
    const halfR = toHalf(r);
    if (/[34].*チーム.*ゲーム|3チームリーグ/i.test(halfR)) {
      if (!info.gameRules[3]) info.gameRules[3] = r;
    }
    if (/[4].*チーム.*ゲーム|4チームリーグ/i.test(halfR)) {
      if (!info.gameRules[4]) info.gameRules[4] = r;
    }
    if (/[5].*チーム.*ゲーム|5チームリーグ/i.test(halfR)) {
      info.gameRules[5] = r;
    }
  }
  // デフォルト値の設定
  if (!info.gameRules[3]) {
    info.gameRules[3] = info.gameRules[4] || '6ゲームマッチ（6-6タイブレーク・ノーアド）';
  }
  if (!info.gameRules[4]) {
    info.gameRules[4] = '6ゲーム先取（ノーアド）';
  }
  if (!info.gameRules[5]) {
    info.gameRules[5] = '6ゲーム先取（ノーアド）';
  }

  info.bracketGameRule = '6ゲームマッチ（6-6タイブレーク・ノーアド）';

  return info;
}

/** 予選リーグシートからリーグ・チーム情報をパース */
function parseLeagues(ws: XLSX.WorkSheet): {
  leagues: TeamLeague[];
  teamNumberMap: Map<number, TeamEntry>;
} {
  const leagues: TeamLeague[] = [];
  const teamNumberMap = new Map<number, TeamEntry>();

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:CZ30');

  // リーグヘッダーを検出（行を走査）
  const leagueRows: { row: number; leagueId: string; courtName: string }[] = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
    const aVal = cellStr(ws, 'A' + (r + 1));
    if (!aVal) continue;

    // "Aリーグ", "Bリーグ" ... "Gリーグ" などを検出
    const m = aVal.match(/([A-ZＡ-Ｚ])\s*リーグ/);
    if (m) {
      const leagueId = toHalf(m[1]).trim();
      // コート名を取得（同じセル内の改行後テキスト or 括弧内テキスト）
      let courtName = '';
      const courtMatch = aVal.match(/[（(]([^)）]+)[)）]/);
      if (courtMatch) courtName = courtMatch[1];
      else {
        const lines = aVal.split('\n');
        if (lines.length > 1) courtName = lines[1].trim();
      }
      leagueRows.push({ row: r, leagueId, courtName });
    }
  }

  // 各リーグのチームを検出
  for (const lr of leagueRows) {
    const row = lr.row + 1; // 1-based
    const teams: TeamEntry[] = [];

    // チーム情報のセルをスキャン（全列を対象とする）
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = colLetter(c) + row;
      const val = cellStr(ws, ref);
      if (!val) continue;

      // チーム番号を検出
      const circledNumbers = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒';
      const numIdx = circledNumbers.indexOf(val.charAt(0));
      if (numIdx >= 0 && numIdx % 1 === 0) {
        const teamNum = Math.floor(numIdx / 1) + 1;
        // 次のセルがチーム名
        const nameRef = colLetter(c + 2) + row;
        let teamName = cellStr(ws, nameRef);
        if (!teamName) {
          const nameRef2 = colLetter(c + 1) + row;
          teamName = cellStr(ws, nameRef2);
        }
        if (teamName) {
          teamName = teamName.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          const teamId = `${lr.leagueId}-${teams.length + 1}`;
          const team: TeamEntry = {
            teamId,
            leagueId: lr.leagueId,
            numberInLeague: teams.length + 1,
            teamNumber: teamNum,
            teamName,
            members: [],
            status: 'none',
          };
          teams.push(team);
          teamNumberMap.set(teamNum, team);
        }
      }
    }

    if (teams.length > 0) {
      const matchOrder = teams.length <= 3 ? MATCH_ORDER_3 : teams.length <= 4 ? MATCH_ORDER_4 : MATCH_ORDER_5;
      leagues.push({
        leagueId: lr.leagueId,
        courtName: lr.courtName,
        teams,
        matchOrder,
      });
    }
  }

  return { leagues, teamNumberMap };
}

/** 選手名簿からメンバー情報をパース（フォント色による性別判定付き） */
function parseRoster(
  ws: XLSX.WorkSheet,
  leagues: TeamLeague[],
  teamNumberMap: Map<number, TeamEntry>,
  colorMap: Map<string, string> = new Map(),
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AO40');
  const circledNumbers = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒';

  // 1) 全チーム番号セルの位置を収集
  type Header = { teamNum: number; r: number; c: number };
  const headers: Header[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = cellStr(ws, colLetter(c) + (r + 1));
      if (!val) continue;
      // セル内に含まれる最初の丸数字を検出（"① プラセール ルナ" のような結合セル対応）
      let numIdx = -1;
      for (let i = 0; i < val.length; i++) {
        const idx = circledNumbers.indexOf(val.charAt(i));
        if (idx >= 0) { numIdx = idx; break; }
      }
      if (numIdx < 0) continue;
      headers.push({ teamNum: numIdx + 1, r, c });
    }
  }

  // 重複排除（同じチーム番号が複数回現れた場合は最初のものを採用）
  const seenTeams = new Set<number>();
  const uniqHeaders = headers.filter(h => {
    if (seenTeams.has(h.teamNum)) return false;
    seenTeams.add(h.teamNum);
    return true;
  });

  // 2) 各チームの列範囲（同じ行の次のチームまで）・行範囲（次のチーム行まで）を決定
  const rowsWithHeaders = Array.from(new Set(uniqHeaders.map(h => h.r))).sort((a, b) => a - b);
  const nextHeaderRow = (r: number) => {
    const idx = rowsWithHeaders.indexOf(r);
    return idx >= 0 && idx < rowsWithHeaders.length - 1 ? rowsWithHeaders[idx + 1] : range.e.r + 1;
  };

  for (const h of uniqHeaders) {
    const team = teamNumberMap.get(h.teamNum);
    if (!team) continue;

    // 同じ行のヘッダーを列順にソート
    const sameRowHeaders = uniqHeaders.filter(x => x.r === h.r).sort((a, b) => a.c - b.c);
    const myIdx = sameRowHeaders.findIndex(x => x.c === h.c && x.teamNum === h.teamNum);
    const colStart = h.c;
    const colEnd = myIdx + 1 < sameRowHeaders.length ? sameRowHeaders[myIdx + 1].c - 1 : range.e.c;

    const rowStart = h.r + 1;
    const rowEnd = Math.min(range.e.r, nextHeaderRow(h.r) - 1, h.r + 20);

    // チーム名: ヘッダー行内の列範囲を走査して丸数字以外の最初の文字列を採用
    let teamName = '';
    for (let cc = colStart; cc <= colEnd; cc++) {
      const v = cellStr(ws, colLetter(cc) + (h.r + 1));
      if (!v) continue;
      // 丸数字を除去
      const cleaned = v.replace(new RegExp(`[${circledNumbers}]`, 'g'), '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned) { teamName = cleaned; break; }
    }
    if (teamName) {
      team.teamName = teamName;
      for (const league of leagues) {
        const lt = league.teams.find(t => t.teamId === team.teamId);
        if (lt) lt.teamName = teamName;
      }
    }

    // 3) 列範囲 × 行範囲の矩形からメンバー名を収集
    team.members = [];
    const seenNames = new Set<string>();
    for (let mr = rowStart; mr <= rowEnd; mr++) {
      for (let cc = colStart; cc <= colEnd; cc++) {
        const cellRef = colLetter(cc) + (mr + 1);
        const v = cellStr(ws, cellRef);
        if (!v) continue;
        // 丸数字セルはスキップ
        if ([...v].some(ch => circledNumbers.includes(ch))) continue;
        const cleaned = v.replace(/\n/g, ' ').replace(/\s+/g, '\u3000').trim();
        if (!cleaned || seenNames.has(cleaned)) continue;
        // 明らかに人名ではない文字列はスキップ（長すぎる・記号のみ）
        if (cleaned.length > 20) continue;
        seenNames.add(cleaned);

        // フォント色から性別を判定（赤=女性、青=男性）
        const fontColor = colorMap.get(cellRef);
        const gender = genderFromFontColor(fontColor);

        team.members.push({
          player: { name: cleaned, affiliation: '' },
          gender,
        });
      }
    }
  }
}

/** 成績表からスコアを読み取り */
function parseResultSheet(
  ws: XLSX.WorkSheet,
  leagues: TeamLeague[],
  matches: TeamLeagueMatch[]
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z60');

  // "Xリーグ 成績表" を検出して成績表ブロックを特定
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = cellStr(ws, colLetter(c) + (r + 1));
      if (!val) continue;

      const m = val.match(/([A-ZＡ-Ｚ])\s*リーグ\s*成績表/);
      if (!m) continue;
      const leagueId = toHalf(m[1]).trim();
      const league = leagues.find(l => l.leagueId === leagueId);
      if (!league) continue;

      // 成績表の構造を解析
      // ヘッダー行（チーム名行）を見つける
      const headerRow = r + 2; // "チーム名" 行は通常2行下
      const teamCount = league.teams.length;

      // 各チーム行のスコアを読み取り
      for (let ti = 0; ti < teamCount; ti++) {
        const baseRow = headerRow + 1 + ti * 3; // 各チーム3行（MIX, WD, MD）

        for (let tj = 0; tj < teamCount; tj++) {
          if (ti === tj) continue;

          // 対戦相手のスコア列を計算
          const scoreColBase = c + 2 + tj * 3; // 各チーム3列

          for (let si = 0; si < 3; si++) {
            const scoreRow = baseRow + si;
            const s1Ref = colLetter(scoreColBase) + (scoreRow + 1);
            const s2Ref = colLetter(scoreColBase + 2) + (scoreRow + 1);
            const s1 = cellNum(ws, s1Ref);
            const s2 = cellNum(ws, s2Ref);

            if (s1 !== null && s2 !== null) {
              // 対応する試合を見つけてスコアを設定
              const team1 = league.teams[ti];
              const team2 = league.teams[tj];
              const match = matches.find(m =>
                m.leagueId === leagueId &&
                ((m.team1Id === team1.teamId && m.team2Id === team2.teamId) ||
                 (m.team1Id === team2.teamId && m.team2Id === team1.teamId))
              );
              if (match) {
                const matchType = MATCH_TYPE_ORDER[si];
                const sub = match.subMatches.find(sm => sm.type === matchType);
                if (sub) {
                  const isTeam1 = match.team1Id === team1.teamId;
                  if (isTeam1) {
                    sub.score1 = s1;
                    sub.score2 = s2;
                  } else {
                    // スコアが既に設定されていれば一致確認のためスキップ
                    if (sub.score1 === null) {
                      sub.score1 = s2;
                      sub.score2 = s1;
                    }
                  }
                  sub.winnerId = (sub.score1 ?? 0) > (sub.score2 ?? 0) ? match.team1Id :
                    (sub.score2 ?? 0) > (sub.score1 ?? 0) ? match.team2Id : null;
                }
              }
            }
          }
        }
      }

      // 試合のチーム勝敗を再計算
      const leagueMatches = matches.filter(m => m.leagueId === leagueId);
      for (const match of leagueMatches) {
        const allScored = match.subMatches.every(sm => sm.score1 !== null && sm.score2 !== null);
        if (allScored) {
          let w1 = 0, w2 = 0;
          for (const sm of match.subMatches) {
            if (sm.winnerId === match.team1Id) w1++;
            else if (sm.winnerId === match.team2Id) w2++;
          }
          match.winsTeam1 = w1;
          match.winsTeam2 = w2;
          match.winnerId = w1 > w2 ? match.team1Id : w2 > w1 ? match.team2Id : null;
          match.status = 'finished';
        }
      }
    }
  }
}

/**
 * 予選リーグシートから決勝トーナメントのブラケット順をパース
 *
 * シートの下部に以下のような構造がある:
 *   "■決勝トーナメント" ラベル
 *   "１位トーナメント" → 組合せは抽選
 *   "２位トーナメント"
 *   "３位・４位トーナメント"
 *   ブラケット位置に "A2", "E2", "G4" などのリーグ+順位コードが配置
 */
function parseBracketOrders(ws: XLSX.WorkSheet, info: TeamTournamentInfo) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AY60');

  // "決勝トーナメント" ラベルを探す
  let bracketStartRow = -1;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = cellStr(ws, colLetter(c) + (r + 1));
      if (val.includes('決勝トーナメント')) {
        bracketStartRow = r;
        break;
      }
    }
    if (bracketStartRow >= 0) break;
  }
  if (bracketStartRow < 0) return;

  // ２位トーナメント、３位・４位トーナメント のラベル位置とセル範囲を検出
  type BracketSection = { label: string; key: '2nd' | '3rd'; col: number; row: number };
  const sections: BracketSection[] = [];
  for (let r = bracketStartRow; r <= Math.min(range.e.r, bracketStartRow + 20); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const val = cellStr(ws, colLetter(c) + (r + 1));
      if (!val) continue;
      if (/２位トーナメント|2位トーナメント/.test(val)) {
        sections.push({ label: val, key: '2nd', col: c, row: r });
      }
      if (/[３3]位.*[４4]位|[３3]位トーナメント/.test(val)) {
        sections.push({ label: val, key: '3rd', col: c, row: r });
      }
    }
  }

  // セクションを列順にソートし、各セクションの列範囲を決定
  sections.sort((a, b) => a.col - b.col);

  // 各セクションのブラケット順を検出
  // パターン: "[A-G][1-5]" 形式のセル値をスキャン
  const bracketCodeRe = /^([A-ZＡ-Ｚ])([1-5１-５])$/;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const entries: string[] = [];
    // 次のセクションの開始列 - 1 を境界として使用
    const nextSectionCol = si + 1 < sections.length ? sections[si + 1].col - 1 : range.e.c;
    // セクション位置の下方を走査
    for (let r = section.row; r <= Math.min(range.e.r, section.row + 15); r++) {
      const startCol = Math.max(section.col - 2, 0);
      const endCol = Math.min(range.e.c, nextSectionCol);
      for (let c = startCol; c <= endCol; c++) {
        const val = cellStr(ws, colLetter(c) + (r + 1));
        if (!val) continue;
        const m = val.match(bracketCodeRe);
        if (m) {
          const league = toHalf(m[1]);
          const rank = toHalf(m[2]);
          entries.push(league + rank);
        }
      }
    }
    if (entries.length > 0) {
      if (!info.bracketOrders) info.bracketOrders = {};
      info.bracketOrders[section.key] = entries;
    }
  }
}
