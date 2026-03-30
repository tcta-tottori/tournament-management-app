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

function _cellNum(ws: XLSX.WorkSheet, ref: string): number | null {
  const cell = ws[ref];
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const n = Number(cell.v);
  return isNaN(n) ? null : n;
}
void _cellNum; // reserved for future use

/** 姓を抽出 */
function extractLastName(fullName: string): string {
  const parts = fullName.replace(/\u3000/g, ' ').trim().split(/\s+/);
  return parts[0] || fullName;
}

/** リストシートからチーム情報をパース */
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

/** 予選シートからリーグ情報をパース */
function parseYosenSheet(wb: XLSX.WorkBook, listData: Map<string, { league: string; number: string; name: string; affiliation: string }[]>): {
  info: TournamentInfo;
  leagues: MixedLeague[];
} {
  const ws = wb.Sheets['予選'];
  if (!ws) throw new Error('「予選」シートが見つかりません');

  // 大会情報
  const name = cellVal(ws, 'A1').replace(/\s+/g, ' ').trim() || 'ミックスダブルス大会';
  const date = cellVal(ws, 'O2');
  const venue = cellVal(ws, 'O3');
  const rules: string[] = [];
  for (let r = 5; r <= 12; r++) {
    const rule = cellVal(ws, `F${r}`);
    if (rule) rules.push(rule);
  }
  const info: TournamentInfo = { name, date, venue, rules };

  // リーグ解析 - リストシートから構築
  const leagues: MixedLeague[] = [];
  // 予選シートからリーグの行位置とコート名を検出
  const leagueRowMap: { leagueId: string; row: number; courtName: string }[] = [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  for (let r = 14; r <= Math.min(50, range.e.r); r++) {
    const bVal = cellVal(ws, `B${r}`);
    if (bVal && bVal.includes('リーグ')) {
      const lid = bVal.replace('リーグ', '').trim();
      const courtName = cellVal(ws, `B${r + 1}`);
      leagueRowMap.push({ leagueId: lid, row: r, courtName });
    }
  }

  // リストシートベースでチーム構築
  const normalizedLeagueIds = Array.from(listData.keys());

  for (const rawLid of normalizedLeagueIds) {
    const lid = rawLid.trim();
    const players = listData.get(rawLid);
    if (!players) continue;

    // ペアを構築 (2行ずつ = 1チーム: male -1, female -2)
    const teams: MixedTeam[] = [];
    let pairNum = 1;

    for (let i = 0; i < players.length; i += 2) {
      const maleEntry = players[i];
      const femaleEntry = i + 1 < players.length ? players[i + 1] : null;

      if (!maleEntry) continue;

      // 通し番号を取得
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
        male,
        female,
        teamName,
      });
      pairNum++;
    }

    // コート名を検索
    const leagueRow = leagueRowMap.find(l => l.leagueId === lid);
    const courtName = leagueRow?.courtName || '';

    const matchOrder = teams.length >= 5 ? MATCH_ORDER_5 : MATCH_ORDER_4;

    leagues.push({
      leagueId: lid,
      courtName,
      teams,
      matchOrder,
    });
  }

  return { info, leagues };
}

/** リーグ試合データ生成 */
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
        winnerId: null,
        status: 'waiting',
      });
    }
  }

  return matches;
}

/**
 * Excelファイルをパースしてミックス大会データを生成
 */
export function parseMixedExcel(file: ArrayBuffer): {
  info: TournamentInfo;
  leagues: MixedLeague[];
  matches: LeagueMatchScore[];
} {
  const wb = XLSX.read(file, { type: 'array' });

  const listData = parseListSheet(wb);
  const { info, leagues } = parseYosenSheet(wb, listData);
  const matches = generateLeagueMatches(leagues);

  return { info, leagues, matches };
}
