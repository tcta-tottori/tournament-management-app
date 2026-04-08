import * as XLSX from 'xlsx';
import type {
  TeamEntry, TeamLeague, TeamLeagueMatch, TeamTournamentInfo,
  MatchOrderEntry, TeamMember, SubMatchScore, MatchType
} from './types';
import { MATCH_TYPE_ORDER } from './teamLogic';

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
 * 団体戦Excelパーサー
 */
export function parseTeamExcel(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });

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

  // リーグ・チーム情報をパース
  const { leagues, teamNumberMap } = parseLeagues(leagueWs);

  // 選手名簿からメンバー情報を取得
  if (rosterWs) {
    parseRoster(rosterWs, leagues, teamNumberMap);
  }

  // 試合データ生成
  const matches: TeamLeagueMatch[] = [];
  for (const league of leagues) {
    const matchOrder = league.teams.length <= 4 ? MATCH_ORDER_4 : MATCH_ORDER_5;
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

      // 日付検出: "3/15" "3月15日" "2026/4/8" "R7.4.8" 等
      if (!info.date) {
        const dateMatch = clean.match(/(?:令和|R|平成|H)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/) ||
                          clean.match(/^\d{1,2}\/\d{1,2}$/);
        if (dateMatch && !isRuleLike(clean) && !/令和\s*\d+\s*年度/.test(clean)) {
          info.date = dateMatch[0];
        }
      }

      if (!info.date && (val.includes('日　時') || val.includes('日 時') || val.includes('日時') || val.includes('開催日'))) {
        const stripped = val.replace(/^(日\s*時|開催日)\s*[：:]?\s*/, '').trim();
        if (stripped && stripped !== val.trim()) {
          info.date = stripped;
        } else {
          // ラベルのみ → 右・下の隣接セルから値を取得
          for (const adj of [colLetter(c + 1) + (r + 1), colLetter(c + 2) + (r + 1), colLetter(c) + (r + 2)]) {
            const v = cellStr(ws, adj);
            if (v && !/^(日\s*時|開催日|会\s*場|会場)/.test(v)) { info.date = v.trim(); break; }
          }
        }
      }
      if (!info.venue && (val.includes('会　場') || val.includes('会 場') || val.includes('会場'))) {
        const stripped = val.replace(/^会\s*場\s*[：:]?\s*/, '').trim();
        if (stripped && stripped !== val.trim()) {
          info.venue = stripped;
        } else {
          for (const adj of [colLetter(c + 1) + (r + 1), colLetter(c + 2) + (r + 1), colLetter(c) + (r + 2)]) {
            const v = cellStr(ws, adj);
            if (v && !/^(日\s*時|開催日|会\s*場|会場)/.test(v)) { info.venue = v.trim(); break; }
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
            const dateMatch = clean.match(/(?:令和|R|平成|H)?\s*\d{0,4}[\/\.年]\s*\d{1,2}[\/\.月]\s*\d{1,2}日?/) ||
                              clean.match(/^\d{1,2}\/\d{1,2}$/);
            if (dateMatch && !isRuleLike(clean) && !/令和\s*\d+\s*年度/.test(clean)) {
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
    if (r.includes('4') && r.includes('チーム') && /ゲーム/.test(r)) {
      info.gameRules[4] = r;
    }
    if (r.includes('5') && r.includes('チーム') && /ゲーム/.test(r)) {
      info.gameRules[5] = r;
    }
  }
  if (!info.gameRules[4]) {
    info.gameRules[4] = '6ゲームマッチ（6-6タイブレーク・ノーアド）';
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

    // "Aリーグ", "Bリーグ" などを検出
    const m = aVal.match(/([A-EＡ-Ｅ])\s*リーグ/);
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

    // 左半分（予選リーグ部分）のみスキャン
    // 右側（BB列=column 53以降）は別セクションなので除外
    for (let c = range.s.c; c <= Math.min(range.e.c, 50); c++) {
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
      const matchOrder = teams.length <= 4 ? MATCH_ORDER_4 : MATCH_ORDER_5;
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

/** 選手名簿からメンバー情報をパース */
function parseRoster(
  ws: XLSX.WorkSheet,
  leagues: TeamLeague[],
  teamNumberMap: Map<number, TeamEntry>
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
        const v = cellStr(ws, colLetter(cc) + (mr + 1));
        if (!v) continue;
        // 丸数字セルはスキップ
        if ([...v].some(ch => circledNumbers.includes(ch))) continue;
        const cleaned = v.replace(/\n/g, ' ').replace(/\s+/g, '\u3000').trim();
        if (!cleaned || seenNames.has(cleaned)) continue;
        // 明らかに人名ではない文字列はスキップ（長すぎる・記号のみ）
        if (cleaned.length > 20) continue;
        seenNames.add(cleaned);
        team.members.push({
          player: { name: cleaned, affiliation: '' },
          gender: 'F',
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

      const m = val.match(/([A-EＡ-Ｅ])\s*リーグ\s*成績表/);
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
