import type { Draw, Match } from '../../db/database';
import { isThirdPlaceMatch } from '../draw/thirdPlace';

/** 試合が決着済み（通常終了 or 不戦勝）か */
function isSettled(m: Match): boolean {
  return m.status === 'finished' || m.status === 'walkover';
}

/**
 * その種目（クラス）の試合がすべて終わっているか。
 *
 * - トーナメント: 決勝の勝者が確定していること
 * - リーグ戦: 両者が入っている対戦がすべて決着していること
 *
 * 結果画像プレビューを出すかどうかの判定に使う。
 */
export function isEventComplete(draw: Draw | undefined, matches: Match[]): boolean {
  if (!draw || matches.length === 0) return false;

  if (draw.drawType === 'roundRobin') {
    const real = matches.filter(m => m.player1EntryId && m.player2EntryId);
    return real.length > 0 && real.every(isSettled);
  }

  const totalRounds = Math.log2(draw.drawSize);
  if (!Number.isFinite(totalRounds) || totalRounds < 1) return false;
  const finalMatch = matches.find(m => m.round === totalRounds && !isThirdPlaceMatch(m));
  if (!finalMatch || !isSettled(finalMatch) || !finalMatch.winnerEntryId) return false;

  // 3位決定戦がある種目は、そちらも終わってから結果を出す
  const thirdPlace = matches.find(isThirdPlaceMatch);
  if (thirdPlace && !(isSettled(thirdPlace) && thirdPlace.winnerEntryId)) return false;
  return true;
}
