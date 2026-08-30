// =============================================================================
// 3位決定戦
//
// 準決勝で負けた2組が戦う「3位決定戦」を、通常のトーナメントと同じ試合として扱う。
// 決勝と同じ回戦（round = 最終回戦）に position=2 の枠を1つ足す形で持たせるため、
// 勝ち上がりの計算（次の回戦へ送る処理）には影響しない。
//
// 対戦カードは準決勝の結果から自動で決まるので、準決勝が終わる／やり直される
// たびに syncThirdPlaceMatch() で組み直す。
// =============================================================================

import { db, type Event, type Match } from '../../db/database';

/** 3位決定戦の matchId（種目内で一意） */
export const THIRD_PLACE_MATCH_ID = 'M-3RD';

/** 表示に使う回戦名 */
export const THIRD_PLACE_LABEL = '3位決定戦';

/** その試合が3位決定戦か */
export function isThirdPlaceMatch(m: { matchId: string }): boolean {
  return m.matchId === THIRD_PLACE_MATCH_ID;
}

/**
 * 種目のゲームルールに「3位決定戦」が書かれているか。
 * ドロー表に「決勝・３位決定戦 8ゲームマッチ」のように書かれている大会を、
 * 取り込んだだけで3位決定戦ありとして扱うために使う。
 */
export function hasThirdPlaceRule(evt: Event | undefined): boolean {
  if (!evt) return false;
  const texts = (evt.roundGameRules || []).flatMap(r => [r.roundLabel, r.ruleText]);
  return texts.some(t => /[3３]位決定/.test(t || ''));
}

/** その種目で3位決定戦を行うか（ドローの設定 → 無ければルール文から判定） */
export function wantsThirdPlace(
  draw: { hasThirdPlace?: boolean } | undefined,
  evt: Event | undefined,
): boolean {
  if (draw?.hasThirdPlace !== undefined) return draw.hasThirdPlace;
  return hasThirdPlaceRule(evt);
}

/** 準決勝の敗者（不戦勝・未決着なら null） */
function loserOf(sf: Match | undefined): { entryId: string; name: string; affiliation: string } | null {
  if (!sf?.winnerEntryId) return null;
  if (!sf.player1EntryId || !sf.player2EntryId) return null; // 不戦勝は敗者なし
  const winnerIsP1 = sf.winnerEntryId === sf.player1EntryId;
  return {
    entryId: (winnerIsP1 ? sf.player2EntryId : sf.player1EntryId) as string,
    name: winnerIsP1 ? sf.player2Name : sf.player1Name,
    affiliation: winnerIsP1 ? sf.player2Affiliation : sf.player1Affiliation,
  };
}

/**
 * 準決勝の結果に合わせて3位決定戦の対戦カードを組み直す。
 * 準決勝をやり直して顔ぶれが変わった場合は、入力済みの結果を白紙に戻す。
 * 3位決定戦を行わない種目では何もしない。
 */
export async function syncThirdPlaceMatch(eventId: string): Promise<void> {
  const draw = await db.draws.where('eventId').equals(eventId).first();
  if (!draw || draw.drawType === 'roundRobin') return;

  const matches = await db.matches.where('eventId').equals(eventId).toArray();
  const third = matches.find(isThirdPlaceMatch);
  if (!third?.id) return;

  const totalRounds = Math.round(Math.log2(Math.max(2, draw.drawSize)));
  const sfRound = totalRounds - 1;
  if (sfRound < 1) return;

  const l1 = loserOf(matches.find(m => m.round === sfRound && m.position === 1));
  const l2 = loserOf(matches.find(m => m.round === sfRound && m.position === 2));

  const next = {
    player1EntryId: l1?.entryId ?? null,
    player1Name: l1?.name ?? '',
    player1Affiliation: l1?.affiliation ?? '',
    player2EntryId: l2?.entryId ?? null,
    player2Name: l2?.name ?? '',
    player2Affiliation: l2?.affiliation ?? '',
  };

  // 顔ぶれが変わっていなければ触らない（試合中・入力済みの結果を守る）
  if (next.player1EntryId === third.player1EntryId && next.player2EntryId === third.player2EntryId) {
    return;
  }

  await db.matches.update(third.id, {
    ...next,
    // 対戦カードが変わったら、入力済みの結果は無効なので白紙に戻す
    score: '',
    winnerEntryId: null,
    status: 'waiting',
    updatedAt: Date.now(),
  });
}
