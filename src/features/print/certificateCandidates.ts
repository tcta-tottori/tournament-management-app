// =============================================================================
// 賞状の「選択式」で並べる候補を集める
//
// 賞状は表彰式の直前に慌てて作ることが多く、決勝がまだ終わっていない段階でも
// 先に刷っておきたい（名前だけ後から手書き、優勝候補を両方刷っておく等）。
// そのため「試合が確定しているか」に関係なく、エントリーしている選手・チームを
// すべて候補として出す。結果が既に出ている場合は賞位のヒント(rankHint)を添える。
// =============================================================================

import type { Match, Event } from '../../db/database';
import type { MixedTeam, PlacementBracket } from '../mixed/types';
import type { TeamEntry, TeamPlacementBracket } from '../team/types';

/** 賞状候補1件 */
export interface CertCandidate {
  /** 一覧のキー */
  key: string;
  /** クラス・種目名 */
  category: string;
  /** 氏名 or チーム名 */
  name: string;
  /** 所属（分かる場合） */
  affiliation: string;
  /** 候補のまとまり（リーグ名・種目名など。UIの見出しに使う） */
  group: string;
  /** 既に結果が出ている場合の賞位（優勝・準優勝・第3位） */
  rankHint?: string;
}

/** 「田中 太郎」→「田中」 */
export function familyName(name: string): string {
  return name.trim().split(/[\s　]+/)[0] || name.trim();
}

/** ミックスのペア表記「田中・山本　組」 */
export function mixedPairName(t: MixedTeam): string {
  return `${familyName(t.male.name)}・${familyName(t.female.name)}　組`;
}

const MIXED_CATEGORY_LABEL: Record<string, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

/**
 * トーナメントの確定した入賞者を賞位つきで返す（汎用）。
 * 決勝が終わっていないブラケットは単に飛ばす（＝候補一覧の rankHint が付かないだけ）。
 */
function bracketRankHints<M extends { round: number; status: string; winnerId: string | null; team1Id: string | null; team2Id: string | null }>(
  matches: M[],
): Map<string, string> {
  const hints = new Map<string, string>();
  if (matches.length === 0) return hints;
  const maxRound = Math.max(...matches.map(m => m.round));
  const final = matches.find(m => m.round === maxRound);
  if (!final || final.status !== 'finished' || !final.winnerId) return hints;

  hints.set(final.winnerId, '優勝');
  const runnerUpId = final.winnerId === final.team1Id ? final.team2Id : final.team1Id;
  if (runnerUpId) hints.set(runnerUpId, '準優勝');

  for (const sf of matches.filter(m => m.round === maxRound - 1 && m.status === 'finished' && m.winnerId)) {
    const loserId = sf.winnerId === sf.team1Id ? sf.team2Id : sf.team1Id;
    if (loserId && !hints.has(loserId)) hints.set(loserId, '第3位');
  }
  return hints;
}

/** ミックス大会の候補（ペア単位） */
export function collectMixedCandidates(
  allTeams: MixedTeam[],
  brackets: PlacementBracket[],
): CertCandidate[] {
  // ブラケットごとの賞位ヒントと、そのチームが属するクラス名
  const hintByTeam = new Map<string, { rank: string; category: string }>();
  for (const b of brackets) {
    const label = b.label || MIXED_CATEGORY_LABEL[b.category] || b.category;
    for (const [teamId, rank] of bracketRankHints(b.matches)) {
      hintByTeam.set(teamId, { rank, category: label });
    }
  }
  // 決勝トーナメントに入っているチームのクラス（未確定でもクラス名は出す）
  const categoryByTeam = new Map<string, string>();
  for (const b of brackets) {
    const label = b.label || MIXED_CATEGORY_LABEL[b.category] || b.category;
    for (const t of b.teams) if (!categoryByTeam.has(t.teamId)) categoryByTeam.set(t.teamId, label);
  }

  return allTeams
    .filter(t => t.status !== 'def')
    .map(t => {
      const hint = hintByTeam.get(t.teamId);
      return {
        key: `mixed-${t.teamId}`,
        category: hint?.category || categoryByTeam.get(t.teamId) || '',
        name: mixedPairName(t),
        affiliation: t.male.affiliation || t.female.affiliation || '',
        group: `${t.leagueId.trim()}リーグ`,
        rankHint: hint?.rank,
      };
    });
}

/** 団体戦の候補（チーム単位） */
export function collectTeamCandidates(
  allTeams: TeamEntry[],
  brackets: TeamPlacementBracket[],
  bracketLabels?: Partial<Record<string, string>>,
): CertCandidate[] {
  const hintByTeam = new Map<string, { rank: string; category: string }>();
  for (const b of brackets) {
    const label = bracketLabels?.[b.category] || b.label || b.category;
    for (const [teamId, rank] of bracketRankHints(b.matches)) {
      hintByTeam.set(teamId, { rank, category: label });
    }
  }
  const categoryByTeam = new Map<string, string>();
  for (const b of brackets) {
    const label = bracketLabels?.[b.category] || b.label || b.category;
    for (const t of b.teams) if (!categoryByTeam.has(t.teamId)) categoryByTeam.set(t.teamId, label);
  }

  return allTeams
    .filter(t => t.status !== 'def')
    .map(t => {
      const hint = hintByTeam.get(t.teamId);
      return {
        key: `team-${t.teamId}`,
        category: hint?.category || categoryByTeam.get(t.teamId) || '',
        name: t.teamName,
        affiliation: '',
        group: `${t.leagueId.trim()}リーグ`,
        rankHint: hint?.rank,
      };
    });
}

/** 個人戦（通常モード）の候補。試合データに出てくる選手・ペアを種目ごとに集める */
export function collectIndividualCandidates(
  events: Event[],
  matches: Match[],
): CertCandidate[] {
  const out: CertCandidate[] = [];
  const eventName = new Map(events.map(e => [e.eventId, e.name]));

  // 種目ごとにまとめる
  const byEvent = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byEvent.get(m.eventId);
    if (list) list.push(m); else byEvent.set(m.eventId, [m]);
  }

  for (const [eventId, evMatches] of byEvent) {
    const evName = eventName.get(eventId) || eventId;

    // 賞位のヒント: 決勝が終わっていれば優勝・準優勝、準決勝の敗者は第3位
    const rounds = evMatches.map(m => m.round).filter(r => r > 0);
    const hints = new Map<string, string>();
    if (rounds.length > 0) {
      const maxRound = Math.max(...rounds);
      const final = evMatches.find(m => m.round === maxRound && m.status === 'finished' && m.winnerEntryId);
      if (final) {
        const winnerName = final.winnerEntryId === final.player1EntryId ? final.player1Name : final.player2Name;
        const loserName = final.winnerEntryId === final.player1EntryId ? final.player2Name : final.player1Name;
        if (winnerName) hints.set(winnerName, '優勝');
        if (loserName) hints.set(loserName, '準優勝');
        for (const sf of evMatches.filter(m => m.round === maxRound - 1 && m.status === 'finished' && m.winnerEntryId)) {
          const l = sf.winnerEntryId === sf.player1EntryId ? sf.player2Name : sf.player1Name;
          if (l && !hints.has(l)) hints.set(l, '第3位');
        }
      }
    }

    const seen = new Set<string>();
    for (const m of evMatches) {
      for (const side of [
        { name: m.player1Name, aff: m.player1Affiliation },
        { name: m.player2Name, aff: m.player2Affiliation },
      ]) {
        const nm = (side.name || '').trim();
        if (!nm || seen.has(nm)) continue;
        if (/^(BYE|bye|不戦|未定|\(未定\)|-)$/.test(nm)) continue;
        seen.add(nm);
        out.push({
          key: `ind-${eventId}-${nm}`,
          category: evName,
          name: nm,
          affiliation: (side.aff || '').trim(),
          group: evName,
          rankHint: hints.get(nm),
        });
      }
    }
  }
  return out;
}

/** 賞位の並び順（優勝→準優勝→第3位→その他） */
const RANK_ORDER = ['優勝', '準優勝', '第3位'];

/** 入賞者（rankHintがある候補）だけを賞位順に返す */
export function winnersOnly(candidates: CertCandidate[]): CertCandidate[] {
  return candidates
    .filter(c => !!c.rankHint)
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category, 'ja');
      return RANK_ORDER.indexOf(a.rankHint!) - RANK_ORDER.indexOf(b.rankHint!);
    });
}
