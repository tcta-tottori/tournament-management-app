// =============================================================================
// 選手名の修正（エントリー確定後）
//
// 対戦表（matches）は表示を速くするため選手名・所属を写して持っている。
// エントリー確定後に氏名の誤りを直す場合、選手マスタ（players）を直すだけでは
// 対戦表・ドロー表示に残ってしまうため、写した名前も更新する。
// =============================================================================

import { db, type Entry, type Player } from '../../db/database';

/** エントリー1件の表示名・所属（ダブルスは「A / B」）を組み立てる */
export function composeEntryLabel(
  entry: Entry | undefined,
  playerMap: Map<string, Player>,
): { name: string; affiliation: string } | null {
  if (!entry) return null;
  const p1 = playerMap.get(entry.playerId);
  const p2 = entry.partnerId ? playerMap.get(entry.partnerId) : null;
  if (!p1 && !p2) return null;
  const name = p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || p2?.name || '');
  let affiliation = p1?.affiliation || '';
  if (p2 && p2.affiliation !== p1?.affiliation) {
    affiliation = `${p1?.affiliation || ''} / ${p2.affiliation}`;
  }
  return { name, affiliation };
}

/** 種目の対戦表に写してある選手名・所属を、選手マスタの内容へ更新する */
export async function refreshMatchNames(eventId: string): Promise<void> {
  const [entries, players, matches] = await Promise.all([
    db.entries.where('eventId').equals(eventId).toArray(),
    db.players.toArray(),
    db.matches.where('eventId').equals(eventId).toArray(),
  ]);
  const entryMap = new Map(entries.map(e => [e.entryId, e]));
  const playerMap = new Map(players.map(p => [p.playerId, p]));

  for (const m of matches) {
    if (m.id == null) continue;
    const a = m.player1EntryId ? composeEntryLabel(entryMap.get(m.player1EntryId), playerMap) : null;
    const b = m.player2EntryId ? composeEntryLabel(entryMap.get(m.player2EntryId), playerMap) : null;
    const patch: Partial<typeof m> = {};
    if (a && (a.name !== m.player1Name || a.affiliation !== m.player1Affiliation)) {
      patch.player1Name = a.name;
      patch.player1Affiliation = a.affiliation;
    }
    if (b && (b.name !== m.player2Name || b.affiliation !== m.player2Affiliation)) {
      patch.player2Name = b.name;
      patch.player2Affiliation = b.affiliation;
    }
    if (Object.keys(patch).length > 0) {
      await db.matches.update(m.id, { ...patch, updatedAt: Date.now() });
    }
  }
}

/** その選手が出ている全種目の対戦表の名前を更新する */
export async function refreshMatchNamesForPlayers(playerIds: string[]): Promise<void> {
  const ids = new Set(playerIds.filter(Boolean));
  if (ids.size === 0) return;
  const entries = await db.entries
    .filter(e => ids.has(e.playerId) || (!!e.partnerId && ids.has(e.partnerId)))
    .toArray();
  const eventIds = [...new Set(entries.map(e => e.eventId))];
  for (const eventId of eventIds) await refreshMatchNames(eventId);
}

/**
 * 選手の氏名・ふりがな・所属を直す。
 * 選手マスタを更新したあと、対戦表に写した名前も合わせて更新する。
 */
export async function updatePlayerProfile(
  updates: { playerId: string; name: string; furigana: string; affiliation: string }[],
): Promise<void> {
  const players = await db.players.toArray();
  const changed: string[] = [];
  for (const u of updates) {
    const p = players.find(x => x.playerId === u.playerId);
    if (p?.id == null) continue;
    const name = u.name.trim();
    if (!name) continue;
    if (p.name === name && p.furigana === u.furigana.trim() && p.affiliation === u.affiliation.trim()) continue;
    await db.players.update(p.id, {
      name,
      furigana: u.furigana.trim(),
      affiliation: u.affiliation.trim(),
    });
    changed.push(u.playerId);
  }
  await refreshMatchNamesForPlayers(changed);
}
