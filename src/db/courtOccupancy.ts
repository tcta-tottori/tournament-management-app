// =============================================================================
// コートの使用状況ガード
//
// 1つのコートで同時に進行できる試合は1つだけ。
// 複数の画面（対戦順・コート別ドロー・スコア入力・一斉コール）から試合開始
// できるため、開始前に必ずここでコートの空きを確認する。
// =============================================================================

import { db, type Match } from './database';

/**
 * 指定コートで進行中の「別の」試合を返す（無ければ null）。
 *
 * @param courtId 対象コートのID（null/未設定なら常に null を返す）
 * @param selfDbId 自分自身の matches.id（自分は除外して判定する）
 */
export async function findOccupyingMatch(
  courtId: string | null | undefined,
  selfDbId?: number,
): Promise<Match | null> {
  if (!courtId) return null;
  const found = await db.matches
    .where('courtId').equals(courtId)
    .filter(m => m.status === 'playing' && m.id !== selfDbId)
    .first();
  return found ?? null;
}

/** 進行中の試合があるコートで開始しようとしたときの警告文 */
export function occupiedMessage(courtName: string, occupying: Match): string {
  const vs = `${occupying.player1Name} vs ${occupying.player2Name}`;
  return `${courtName ? `${courtName}番コート` : 'このコート'}は「${vs}」が試合中です。\n試合終了後に開始してください。`;
}
