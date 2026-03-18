import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { ClipboardList, ListOrdered, Printer, RefreshCw, Trash2, Trophy, Edit3, Check, X, Zap, SlidersHorizontal } from 'lucide-react';
import type { Match } from '../../db/database';

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

type DrawSlot = { position: number; entryId: string | null; seed: number; isBye: boolean };

/**
 * BYEが末尾に集中している場合、標準的なトーナメント位置に再配置する。
 * シード選手の対戦相手位置にBYEを優先配置。
 */
function redistributeByeSlots(slots: DrawSlot[], drawSize: number): DrawSlot[] {
  const sorted = [...slots].sort((a, b) => a.position - b.position);
  const byeSlots = sorted.filter(s => s.isBye);
  const entrySlots = sorted.filter(s => !s.isBye);
  const numByes = drawSize - entrySlots.length;

  if (numByes <= 0) return sorted;

  // BYEが既に分散しているかチェック（前半にBYEがあれば分散済み）
  const halfPos = drawSize / 2;
  const hasByeInFirstHalf = byeSlots.some(s => s.position <= halfPos);
  if (hasByeInFirstHalf && sorted.length >= drawSize) return sorted;

  // 不足分のBYEスロットを補完（slots.lengthがdrawSize未満の場合）
  if (hasByeInFirstHalf) {
    const existingPos = new Set(sorted.map(s => s.position));
    const result = [...sorted];
    for (let p = 1; p <= drawSize; p++) {
      if (!existingPos.has(p)) {
        result.push({ position: p, entryId: null, seed: 0, isBye: true });
      }
    }
    return result.sort((a, b) => a.position - b.position);
  }

  // BYEを標準位置に再配置
  // シード選手の対戦相手位置にBYEを優先配置
  const seedPositions: number[] = [1, drawSize];
  let count = 2;
  let sectionSize = drawSize;
  while (count < drawSize) {
    sectionSize /= 2;
    if (sectionSize < 2) break;
    const newPositions: number[] = [];
    for (let i = 0; i < count; i++) {
      const pos = seedPositions[i];
      const secIdx = Math.floor((pos - 1) / sectionSize);
      const secStart = secIdx * sectionSize + 1;
      const secEnd = secStart + sectionSize - 1;
      newPositions.push(secStart + secEnd - pos);
    }
    seedPositions.push(...newPositions);
    count *= 2;
  }

  const byePositions: number[] = [];
  for (let i = 0; i < numByes && i < seedPositions.length; i++) {
    const p = seedPositions[i];
    byePositions.push(p % 2 === 1 ? p + 1 : p - 1);
  }
  const byePosSet = new Set(byePositions);

  // エントリースロットをBYE以外の位置に配置
  const nonByePositions: number[] = [];
  for (let p = 1; p <= drawSize; p++) {
    if (!byePosSet.has(p)) nonByePositions.push(p);
  }

  const sortedEntries = entrySlots.sort((a, b) => a.position - b.position);
  const result: DrawSlot[] = [];
  for (let i = 0; i < nonByePositions.length && i < sortedEntries.length; i++) {
    result.push({ ...sortedEntries[i], position: nonByePositions[i] });
  }
  for (const bp of byePositions) {
    result.push({ position: bp, entryId: null, seed: 0, isBye: true });
  }

  return result.sort((a, b) => a.position - b.position);
}

export default function MatchManager() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const matches = useLiveQuery(
    () => selectedEventId ? db.matches.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  const drawData = useLiveQuery(
    () => selectedEventId ? db.draws.where('eventId').equals(selectedEventId).first() : undefined,
    [selectedEventId]
  );

  const tournament = useLiveQuery(
    () => currentTournamentId ? db.tournaments.where('tournamentId').equals(currentTournamentId).first() : undefined,
    [currentTournamentId]
  );

  const currentEvent = useMemo(() => events.find(e => e.eventId === selectedEventId), [events, selectedEventId]);

  const totalRounds = useMemo(() => {
    if (!drawData) return 1;
    return Math.log2(drawData.drawSize);
  }, [drawData]);

  const sortedMatches = useMemo(() =>
    [...matches].sort((a, b) => a.round - b.round || a.matchOrder - b.matchOrder),
    [matches]
  );


  const handleGenerateMatches = async () => {
    if (!drawData || !selectedEventId) return;
    setIsGenerating(true);

    try {
      // BYEが末尾に集中している場合は標準位置に再配置してからペアリング
      const slots = redistributeByeSlots(drawData.slots, drawData.drawSize);
      const newMatches: Omit<Match, 'id'>[] = [];
      let matchOrder = 1;

      for (let i = 0; i < slots.length; i += 2) {
        const s1 = slots[i];
        const s2 = slots[i + 1];
        if (!s1 || !s2) continue;

        if (s1.isBye && s2.isBye) continue;
        const isWalkover = s1.isBye || s2.isBye;

        const resolvePlayer = (slot: typeof s1) => {
          if (slot.isBye) return { name: 'BYE', affiliation: '', entryId: null };
          const entry = entries.find(e => e.entryId === slot.entryId);
          if (!entry) return { name: '(不明)', affiliation: '', entryId: slot.entryId };
          const p1 = players.find(p => p.playerId === entry.playerId);
          const isDoubles = !!entry.partnerId;
          const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
          const name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
          let affiliation = p1?.affiliation || '';
          if (isDoubles && p2 && p2.affiliation !== p1?.affiliation) {
            affiliation = `${p1?.affiliation} / ${p2.affiliation}`;
          }
          return { name, affiliation, entryId: slot.entryId };
        };

        const p1Info = resolvePlayer(s1);
        const p2Info = resolvePlayer(s2);

        newMatches.push({
          eventId: selectedEventId,
          matchId: `M-R1-${matchOrder}`,
          round: 1,
          matchOrder: matchOrder,
          position: Math.floor(i / 2) + 1,
          player1EntryId: p1Info.entryId,
          player2EntryId: p2Info.entryId,
          player1Name: p1Info.name,
          player2Name: p2Info.name,
          player1Affiliation: p1Info.affiliation,
          player2Affiliation: p2Info.affiliation,
          score: '',
          winnerEntryId: isWalkover ? (s1.isBye ? p2Info.entryId : p1Info.entryId) : null,
          courtId: null,
          scheduledTime: null,
          status: isWalkover ? 'walkover' : 'waiting',
          refereeId: null,
          refereeName: '',
          updatedAt: Date.now()
        });
        matchOrder++;
      }

      const drawSize = drawData.drawSize;
      const totalRounds = Math.log2(drawSize);

      for (let round = 2; round <= totalRounds; round++) {
        const matchesInRound = drawSize / Math.pow(2, round);
        for (let m = 0; m < matchesInRound; m++) {
          newMatches.push({
            eventId: selectedEventId,
            matchId: `M-R${round}-${m + 1}`,
            round,
            matchOrder: matchOrder++,
            position: m + 1,
            player1EntryId: null,
            player2EntryId: null,
            player1Name: '',
            player2Name: '',
            player1Affiliation: '',
            player2Affiliation: '',
            score: '',
            winnerEntryId: null,
            courtId: null,
            scheduledTime: null,
            status: 'waiting',
            refereeId: null,
            refereeName: '',
            updatedAt: Date.now()
          });
        }
      }

      const existingIds = matches.map(m => m.id).filter((id): id is number => id !== undefined);
      await db.transaction('rw', db.matches, async () => {
        if (existingIds.length > 0) {
          await db.matches.bulkDelete(existingIds);
        }
        await db.matches.bulkAdd(newMatches);
      });

      const walkoverMatches = newMatches.filter(m => m.status === 'walkover');
      for (const wm of walkoverMatches) {
        const nextRound = wm.round + 1;
        const nextPosition = Math.ceil(wm.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(selectedEventId)
          .filter(m => m.round === nextRound && m.position === nextPosition)
          .first();

        if (nextMatch?.id && wm.winnerEntryId) {
          const isWinnerP1 = wm.winnerEntryId === wm.player1EntryId;
          const winnerName = isWinnerP1 ? wm.player1Name : wm.player2Name;
          const winnerAff = isWinnerP1 ? wm.player1Affiliation : wm.player2Affiliation;
          const isUpper = wm.position % 2 === 1;

          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: wm.winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
              : { player2EntryId: wm.winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
            ),
            updatedAt: Date.now()
          });
        }
      }
      alert(`${newMatches.length} 試合を生成しました`);
    } catch (err) {
      console.error(err);
      alert('試合生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAllMatches = async () => {
    if (!currentTournamentId) return;
    if (!confirm('全種目の試合を一括生成します。既存の試合データは上書きされます。よろしいですか？')) return;
    setIsGenerating(true);

    try {
      const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      const allPlayers = await db.players.toArray();
      let totalGenerated = 0;
      let generatedEvents = 0;

      for (const event of allEvents) {
        const eventDraw = await db.draws.where('eventId').equals(event.eventId).first();
        if (!eventDraw) continue;

        const eventEntries = await db.entries.where('eventId').equals(event.eventId).toArray();
        const slots = redistributeByeSlots(eventDraw.slots, eventDraw.drawSize);
        const newMatches: Omit<Match, 'id'>[] = [];
        let matchOrder = 1;

        for (let i = 0; i < slots.length; i += 2) {
          const s1 = slots[i];
          const s2 = slots[i + 1];
          if (!s1 || !s2) continue;
          if (s1.isBye && s2.isBye) continue;
          const isWalkover = s1.isBye || s2.isBye;

          const resolvePlayer = (slot: typeof s1) => {
            if (slot.isBye) return { name: 'BYE', affiliation: '', entryId: null };
            const entry = eventEntries.find(e => e.entryId === slot.entryId);
            if (!entry) return { name: '(不明)', affiliation: '', entryId: slot.entryId };
            const p1 = allPlayers.find(p => p.playerId === entry.playerId);
            const isDoubles = !!entry.partnerId;
            const p2 = isDoubles ? allPlayers.find(p => p.playerId === entry.partnerId) : null;
            const name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
            let affiliation = p1?.affiliation || '';
            if (isDoubles && p2 && p2.affiliation !== p1?.affiliation) {
              affiliation = `${p1?.affiliation} / ${p2.affiliation}`;
            }
            return { name, affiliation, entryId: slot.entryId };
          };

          const p1Info = resolvePlayer(s1);
          const p2Info = resolvePlayer(s2);

          newMatches.push({
            eventId: event.eventId,
            matchId: `M-R1-${matchOrder}`,
            round: 1,
            matchOrder,
            position: Math.floor(i / 2) + 1,
            player1EntryId: p1Info.entryId,
            player2EntryId: p2Info.entryId,
            player1Name: p1Info.name,
            player2Name: p2Info.name,
            player1Affiliation: p1Info.affiliation,
            player2Affiliation: p2Info.affiliation,
            score: '',
            winnerEntryId: isWalkover ? (s1.isBye ? p2Info.entryId : p1Info.entryId) : null,
            courtId: null,
            scheduledTime: null,
            status: isWalkover ? 'walkover' : 'waiting',
            refereeId: null,
            refereeName: '',
            updatedAt: Date.now()
          });
          matchOrder++;
        }

        const drawSize = eventDraw.drawSize;
        const rounds = Math.log2(drawSize);
        for (let round = 2; round <= rounds; round++) {
          const matchesInRound = drawSize / Math.pow(2, round);
          for (let m = 0; m < matchesInRound; m++) {
            newMatches.push({
              eventId: event.eventId,
              matchId: `M-R${round}-${m + 1}`,
              round,
              matchOrder: matchOrder++,
              position: m + 1,
              player1EntryId: null,
              player2EntryId: null,
              player1Name: '',
              player2Name: '',
              player1Affiliation: '',
              player2Affiliation: '',
              score: '',
              winnerEntryId: null,
              courtId: null,
              scheduledTime: null,
              status: 'waiting',
              refereeId: null,
              refereeName: '',
              updatedAt: Date.now()
            });
          }
        }

        // 既存の試合を削除してから新しい試合を追加
        await db.transaction('rw', db.matches, async () => {
          const existingMatches = await db.matches.where('eventId').equals(event.eventId).toArray();
          const existingIds = existingMatches.map(m => m.id).filter((id): id is number => id !== undefined);
          if (existingIds.length > 0) {
            await db.matches.bulkDelete(existingIds);
          }
          await db.matches.bulkAdd(newMatches);
        });

        // 不戦勝の自動進出処理
        const walkoverMatches = newMatches.filter(m => m.status === 'walkover');
        for (const wm of walkoverMatches) {
          const nextRound = wm.round + 1;
          const nextPosition = Math.ceil(wm.position / 2);
          const nextMatch = await db.matches
            .where('eventId').equals(event.eventId)
            .filter(m => m.round === nextRound && m.position === nextPosition)
            .first();

          if (nextMatch?.id && wm.winnerEntryId) {
            const isWinnerP1 = wm.winnerEntryId === wm.player1EntryId;
            const winnerName = isWinnerP1 ? wm.player1Name : wm.player2Name;
            const winnerAff = isWinnerP1 ? wm.player1Affiliation : wm.player2Affiliation;
            const isUpper = wm.position % 2 === 1;

            await db.matches.update(nextMatch.id, {
              ...(isUpper
                ? { player1EntryId: wm.winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
                : { player2EntryId: wm.winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
              ),
              updatedAt: Date.now()
            });
          }
        }

        totalGenerated += newMatches.length;
        generatedEvents++;
      }

      alert(`${generatedEvents} 種目、合計 ${totalGenerated} 試合を生成しました`);
    } catch (err) {
      console.error(err);
      alert('一括試合生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('この種目の試合データをすべて削除しますか？')) return;
    const ids = matches.map(m => m.id).filter((id): id is number => id !== undefined);
    if (ids.length > 0) await db.matches.bulkDelete(ids);
  };

  const courts = useLiveQuery(() => db.courts.toArray()) || [];

  // --- 結果入力 ---
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [editTiebreak, setEditTiebreak] = useState('');

  // ゲーム数からタイブレークかどうか判定
  const games = currentEvent?.gameRules?.games ?? 6;
  const isTiebreakScore = useMemo(() => {
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) return false;
    // タイブレーク: 両者がgames数で並んだ場合（6-6→7-6など）
    // 勝者はgames+1、敗者はgames
    return (s1 === games + 1 && s2 === games) || (s2 === games + 1 && s1 === games);
  }, [editScore1, editScore2, games]);

  // スコアから勝者を自動判定
  const autoWinner = useMemo((): 1 | 2 | null => {
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) return null;
    if (s1 > s2) return 1;
    if (s2 > s1) return 2;
    return null;
  }, [editScore1, editScore2]);

  // タイブレーク敗者側の判定（1=P1が敗者, 2=P2が敗者）
  const tiebreakLoserSide = useMemo((): 1 | 2 | null => {
    if (!isTiebreakScore || !autoWinner) return null;
    return autoWinner === 1 ? 2 : 1;
  }, [isTiebreakScore, autoWinner]);

  const startEdit = useCallback((m: Match) => {
    setEditingMatchId(m.matchId);
    // 既存スコアをパース ("8-6" or "7-6(4)")
    const scoreMatch = (m.score || '').match(/^(\d+)\s*[-–―]\s*(\d+)(?:\((\d+)\))?$/);
    if (scoreMatch) {
      setEditScore1(scoreMatch[1]);
      setEditScore2(scoreMatch[2]);
      setEditTiebreak(scoreMatch[3] || '');
    } else {
      setEditScore1('');
      setEditScore2('');
      setEditTiebreak('');
    }
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMatchId(null);
    setEditScore1('');
    setEditScore2('');
    setEditTiebreak('');
  }, []);

  const saveResult = useCallback(async (m: Match) => {
    if (!m.id) return;
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    if (isNaN(s1) || isNaN(s2)) {
      alert('スコアを入力してください');
      return;
    }
    if (s1 === s2) {
      alert('同点のスコアは入力できません');
      return;
    }

    const winner: 1 | 2 = s1 > s2 ? 1 : 2;
    const winnerEntryId = winner === 1 ? m.player1EntryId : m.player2EntryId;
    const winnerName = winner === 1 ? m.player1Name : m.player2Name;
    const winnerAff = winner === 1 ? m.player1Affiliation : m.player2Affiliation;

    // スコア文字列を生成
    let scoreStr = `${s1}-${s2}`;
    if (isTiebreakScore && editTiebreak) {
      scoreStr += `(${editTiebreak})`;
    }

    // スコアと勝者を更新
    await db.matches.update(m.id, {
      score: scoreStr,
      winnerEntryId,
      status: winnerEntryId ? 'finished' : 'waiting',
      updatedAt: Date.now(),
    });

    // 次ラウンドへの自動進出
    if (selectedEventId) {
      const nextRound = m.round + 1;
      const nextPosition = Math.ceil(m.position / 2);
      const nextMatch = await db.matches
        .where('eventId').equals(selectedEventId)
        .filter(nm => nm.round === nextRound && nm.position === nextPosition)
        .first();

      if (nextMatch?.id) {
        const isUpper = m.position % 2 === 1;
        if (winnerEntryId) {
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
              : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
            ),
            updatedAt: Date.now(),
          });
        } else {
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
              : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
            ),
            ...(nextMatch.winnerEntryId ? { winnerEntryId: null, score: '', status: 'waiting' } : {}),
            updatedAt: Date.now(),
          });
        }
      }
    }

    cancelEdit();
  }, [editScore1, editScore2, editTiebreak, isTiebreakScore, selectedEventId, cancelEdit]);

  const handlePrint = () => {
    const printableMatches = sortedMatches.filter(m => m.status !== 'walkover');
    if (printableMatches.length === 0) {
      alert('印刷対象の試合がありません');
      return;
    }

    const eventName = currentEvent?.name || '';
    const tournamentName = tournament?.name || '';
    const tournamentDate = tournament?.date || '';
    const games = currentEvent?.gameRules?.games ?? 6;
    const gameMethod = `${games}ゲームマッチ\n（${games}-${games}タイブレーク）`;

    const roundName = (round: number) => getRoundName(round, totalRounds);

    // Excel column structure: 38 columns (A-AL)
    // Col A = 3.29 width, Cols B-AL = 8.43 width each (37 cols)
    // Total = 3.29 + 37*8.43 = 315.20
    // Percentage: A = 1.044%, each B-AL = 2.674%
    // We define 38 <col> elements matching the Excel columns exactly.
    const colA = (3.29 / 315.20 * 100).toFixed(3); // ~1.044%
    const colN = (8.43 / 315.20 * 100).toFixed(3); // ~2.674%

    const colgroup = `<colgroup>
      <col style="width:${colA}%">` + /* col A (1) */
      Array.from({length: 37}, () => `<col style="width:${colN}%">`).join('') + /* cols B-AL (2-38) */
      `</colgroup>`;

    // Row heights from Excel (in points, converted proportionally).
    // Total: 16.5+21+22.5+18.75*4+37.5*2+7.5+18.75*2+16.5*6+39.75*3+25.5 = 418.5pt
    // We'll use these as fixed heights summing to 190mm.
    // Scale factor: 190mm / 418.5pt
    const rowHeights = [16.5, 21, 22.5, 18.75, 18.75, 18.75, 18.75, 37.5, 37.5, 7.5, 18.75, 18.75, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 39.75, 39.75, 39.75, 25.5];
    const totalPt = rowHeights.reduce((a, b) => a + b, 0);
    const rh = rowHeights.map(h => (h / totalPt * 190).toFixed(2) + 'mm');
    // rh[0]=R1, rh[1]=R2, ... rh[21]=R22

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>審判用紙 - ${eventName}</title>
<style>
  @page { size: A4 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', 'Hiragino Sans', monospace;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    width: 287mm;
    height: 190mm;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .sheet:last-child { page-break-after: auto; }

  .ref-table {
    width: 100%;
    height: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .ref-table td {
    padding: 0;
    margin: 0;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ====== Shared font families ====== */
  .fg { font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', monospace; }
  .fp { font-family: 'MS PGothic', 'MS Pゴシック', 'Yu Gothic', sans-serif; }
  .ft { font-family: 'Times New Roman', serif; }

  /* ====== Border helpers ====== */
  .bt  { border-top: 1px solid #000; }
  .bb  { border-bottom: 1px solid #000; }
  .bl  { border-left: 1px solid #000; }
  .br  { border-right: 1px solid #000; }
  .bt2 { border-top: 2px solid #000; }
  .bb2 { border-bottom: 2px solid #000; }
  .bl2 { border-left: 2px solid #000; }
  .br2 { border-right: 2px solid #000; }
  .ba  { border: 1px solid #000; }
</style></head><body>
${printableMatches.map(m => {
      const rName = roundName(m.round);
      const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      const courtDisplay = courtObj?.name || '';

      // Find entry numbers: extract numeric part from entryId (e.g. "EN-001" -> 1)
      // or use draw slot position if available
      const getEntryNo = (entryId: string | null): string => {
        if (!entryId) return '';
        // Try to find position from draw slots
        if (drawData) {
          const slot = drawData.slots.find(s => s.entryId === entryId);
          if (slot) return String(slot.position);
        }
        // Fallback: extract number from entryId
        const numMatch = entryId.match(/(\d+)/);
        return numMatch ? String(parseInt(numMatch[1], 10)) : '';
      };
      const entryNo1 = getEntryNo(m.player1EntryId);
      const entryNo2 = getEntryNo(m.player2EntryId);

      return `
<div class="sheet">
  <table class="ref-table">
    ${colgroup}

    <!-- Row 1: Title top half (A1:AL2 merged, spans rows 1-2) -->
    <tr style="height:${rh[0]};">
      <td colspan="38" rowspan="2"
          class="fg" style="text-align:center; font-size:32px; font-weight:bold; letter-spacing:0.5em; height:calc(${rh[0]} + ${rh[1]});">
        審　判　用　紙
      </td>
    </tr>

    <!-- Row 2: consumed by rowspan -->
    <tr style="height:${rh[1]};"></tr>

    <!-- Row 3: Tournament name (H3:AD3) + Date (AE3:AL3) -->
    <tr style="height:${rh[2]};">
      <td colspan="7" style="height:${rh[2]};"></td>
      <td colspan="23" class="fg bb2" style="text-align:center; font-size:14px;">
        (${tournamentName})
      </td>
      <td colspan="8" class="fg bb2" style="text-align:right; font-size:14px; padding-right:4px;">
        ${tournamentDate}
      </td>
    </tr>

    <!-- Row 4: 種目/Event/回戦/Round (rows 4-7 merged) -->
    <tr style="height:${rh[3]};">
      <td colspan="6" rowspan="4"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:16px; height:calc(${rh[3]} + ${rh[4]} + ${rh[5]} + ${rh[6]});">
        種　目
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:24px; white-space:nowrap;">
        ${eventName}
      </td>
      <td colspan="6" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:18px;">
        回　戦
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br2 bb"
          style="text-align:center; font-size:28px; font-weight:bold;">
        ${rName}
      </td>
    </tr>
    <tr style="height:${rh[4]};"></tr>
    <tr style="height:${rh[5]};"></tr>
    <tr style="height:${rh[6]};"></tr>

    <!-- Row 8: Court/Method/Time (rows 8-9 merged) -->
    <tr style="height:${rh[7]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt br bb2"
          style="text-align:center; font-size:16px; height:calc(${rh[7]} + ${rh[8]});">
        コート№
      </td>
      <td colspan="6" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:36px; font-weight:bold;">
        ${courtDisplay}
      </td>
      <td colspan="5" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        試合方法
      </td>
      <td colspan="9" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:18px; white-space:pre-line; line-height:1.3;">
        ${gameMethod}
      </td>
      <td colspan="5" rowspan="2"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        開始時間
      </td>
      <td colspan="7" rowspan="2"
          class="fg bt br2 bb2"
          style="text-align:center; font-size:22px; font-weight:bold;">
        ${m.scheduledTime || ''}
      </td>
    </tr>
    <tr style="height:${rh[8]};"></tr>

    <!-- Row 10: Spacer -->
    <tr style="height:${rh[9]};">
      <td colspan="38" style="height:${rh[9]};"></td>
    </tr>

    <!-- Row 11: Entry numbers (rows 11-12 merged) -->
    <tr style="height:${rh[10]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[10]} + ${rh[11]});">
        エントリー№
      </td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb"
          style="text-align:right; font-size:20px; padding-right:2px; border-left:1px solid #000;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br"
          style="text-align:center; font-size:26px;">
        ${entryNo1}
      </td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb"
          style="text-align:right; font-size:20px; padding-right:2px; border-left:1px solid #000;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br2"
          style="text-align:center; font-size:26px;">
        ${entryNo2}
      </td>
    </tr>
    <tr style="height:${rh[11]};"></tr>

    <!-- Row 13: Player names (rows 13-18, label spans all 6) -->
    <tr style="height:${rh[12]};">
      <td colspan="6" rowspan="6"
          class="fg bl2 bt br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[12]} + ${rh[13]} + ${rh[14]} + ${rh[15]} + ${rh[16]} + ${rh[17]});">
        選 手 氏 名
      </td>
      <!-- Player 1 name: G13:V16 (cols 7-22, rows 13-16) -->
      <td colspan="16" rowspan="4"
          class="fp bt br"
          style="text-align:center; font-size:28px; white-space:nowrap; height:calc(${rh[12]} + ${rh[13]} + ${rh[14]} + ${rh[15]});">
        ${m.player1Name}
      </td>
      <!-- Player 2 name: W13:AL16 (cols 23-38, rows 13-16) -->
      <td colspan="16" rowspan="4"
          class="fp bt br2"
          style="text-align:center; font-size:28px; white-space:nowrap;">
        ${m.player2Name}
      </td>
    </tr>
    <tr style="height:${rh[13]};"></tr>
    <tr style="height:${rh[14]};"></tr>
    <tr style="height:${rh[15]};"></tr>

    <!-- Row 17: Affiliations (rows 17-18) -->
    <tr style="height:${rh[16]};">
      <!-- Player 1 affiliation: （ G17:H18, name I17:T18, ） U17:V18 -->
      <td colspan="2" rowspan="2"
          class="fp bl bb"
          style="text-align:right; font-size:20px; vertical-align:top;">
        （
      </td>
      <td colspan="12" rowspan="2"
          class="fp bb"
          style="text-align:center; font-size:20px; vertical-align:top; white-space:nowrap;">
        ${m.player1Affiliation || ''}
      </td>
      <td colspan="2" rowspan="2"
          class="fp br bb"
          style="text-align:left; font-size:20px; vertical-align:top;">
        ）
      </td>
      <!-- Player 2 affiliation: （ W17:X18, name Y17:AJ18, ） AK17:AL18 -->
      <td colspan="2" rowspan="2"
          class="fp bl bb"
          style="text-align:right; font-size:20px; vertical-align:top;">
        （
      </td>
      <td colspan="12" rowspan="2"
          class="fp bb"
          style="text-align:center; font-size:20px; vertical-align:top; white-space:nowrap;">
        ${m.player2Affiliation || ''}
      </td>
      <td colspan="2" rowspan="2"
          class="fp br2 bb"
          style="text-align:left; font-size:20px; vertical-align:top;">
        ）
      </td>
    </tr>
    <tr style="height:${rh[17]};"></tr>

    <!-- Row 19: Score (rows 19-20 merged) -->
    <tr style="height:${rh[18]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[18]} + ${rh[19]});">
        ス　コ　ア
      </td>
      <!-- Score area left: G19:U20 (cols 7-21, 15 cols) -->
      <td colspan="15" rowspan="2"
          class="fg bt bl br bb"
          style="text-align:center; font-size:24px;">
      </td>
      <!-- Dash: V19:W20 (cols 22-23, 2 cols) -->
      <td colspan="2" rowspan="2"
          class="fg bt bb"
          style="text-align:center; font-size:24px;">
        ―
      </td>
      <!-- Score area right: X19:AL20 (cols 24-38, 15 cols) -->
      <td colspan="15" rowspan="2"
          class="fg bt bl br2 bb"
          style="text-align:center; font-size:24px;">
      </td>
    </tr>
    <tr style="height:${rh[19]};"></tr>

    <!-- Row 21: Tiebreak (colspans match score row: 15+2+15) -->
    <tr style="height:${rh[20]};">
      <td colspan="6"
          class="fg bl2 bt br bb2"
          style="text-align:center; font-size:14px; height:${rh[20]};">
        （ＴＢ）
      </td>
      <!-- TB area left: cols 7-21 (15 cols) -->
      <td colspan="15"
          class="fg bt bl br bb2"
          style="height:${rh[20]};">
      </td>
      <!-- TB paren area: cols 22-23 (2 cols) -->
      <td colspan="2"
          class="fg bt bb2"
          style="text-align:center; font-size:12px;">
        （　）
      </td>
      <!-- TB area right: cols 24-38 (15 cols) -->
      <td colspan="15"
          class="fg bt bl br2 bb2"
          style="height:${rh[20]};">
      </td>
    </tr>

    <!-- Row 22: Footer -->
    <tr style="height:${rh[21]};">
      <td colspan="25" style="height:${rh[21]};"></td>
      <td colspan="13"
          class="fg bt2"
          style="text-align:right; font-size:12px; padding-right:4px;">
        鳥取市テニス協会
      </td>
    </tr>
  </table>
</div>`;
    }).join('')}
</body></html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 500);
    }
  };

  // モバイルでスクロール時にサイドバーを自動非表示 + FAB自動消去
  const [mobileHeaderVisible, setMobileHeaderVisible] = useState(true);
  const [showFab, setShowFab] = useState(false);
  const matchContentRef = useRef<HTMLDivElement>(null);
  const fabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = matchContentRef.current;
    if (!el) return;
    let lastScrollY = 0;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > 30 && y > lastScrollY) {
        setMobileHeaderVisible(false);
        setShowFab(true);
        if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
        fabTimerRef.current = setTimeout(() => setShowFab(false), 1000);
      } else if (y < 30) {
        setMobileHeaderVisible(true);
        setShowFab(false);
        if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
      }
      lastScrollY = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
    };
  }, []);

  const statusLabels: Record<string, { text: string; color: string }> = {
    waiting: { text: '待機', color: 'bg-gray-100 text-gray-500' },
    ready: { text: '準備完了', color: 'bg-primary-50 text-primary-500' },
    playing: { text: '試合中', color: 'bg-green-100 text-primary-500' },
    finished: { text: '終了', color: 'bg-primary-50 text-primary-600' },
    walkover: { text: '不戦勝', color: 'bg-amber-100 text-warning' },
  };

  return (
    <div className="h-full flex flex-col lg:flex-row lg:gap-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Sidebar — モバイルではスクロールで自動非表示 */}
      <div className={`lg:w-[320px] shrink-0 order-1 lg:order-2 lg:sticky lg:top-0 lg:self-start lg:max-h-full lg:overflow-y-auto space-y-4 mb-4 lg:mb-0 transition-all duration-300 lg:!max-h-none lg:!opacity-100 lg:!overflow-visible ${mobileHeaderVisible ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden mb-0 lg:max-h-none'}`}>
        <header className="flex flex-col gap-3 bg-white p-4 rounded-xl shadow-sm border border-border-main">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary-500" />
              対戦順・審判用紙
            </h1>
            <p className="text-sm text-gray-500 mt-1 hidden sm:block">
              ドローから試合一覧を自動生成し、対戦順の管理と審判用紙の印刷を行います。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-900 whitespace-nowrap">対象種目:</label>
            <select
              value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}
              className="w-full border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
            >
              <option value="">-- 種目を選択 --</option>
              {events.map(e => (
                <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
              ))}
            </select>
            <button
              onClick={handleGenerateAllMatches}
              disabled={isGenerating || events.length === 0}
              className="flex items-center justify-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-md font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm whitespace-nowrap"
            >
              <Zap className={`w-4 h-4 ${isGenerating ? 'animate-pulse' : ''}`} />
              全種目一括生成
            </button>
          </div>
        </header>

        {selectedEventId && (
          <div className="bg-white rounded-xl shadow-sm border border-border-main p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-primary-50 text-primary-500 px-3 py-1.5 rounded-full text-sm font-medium border border-primary-500/20">
                <ListOrdered className="w-4 h-4 inline mr-1" />
                {matches.length} 試合
              </div>
              {!drawData && (
                <span className="text-sm text-warning">
                  先にS-04でドローを作成・保存してください
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleGenerateMatches}
                disabled={!drawData || isGenerating}
                className="flex items-center justify-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                {matches.length > 0 ? '再生成' : '試合生成'}
              </button>
              <button
                onClick={handlePrint}
                disabled={matches.length === 0}
                className="flex items-center justify-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
              >
                <Printer className="w-4 h-4" />
                審判用紙印刷
              </button>
              {matches.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="flex items-center justify-center gap-2 bg-danger text-white px-4 py-2 rounded-md font-medium hover:bg-red-800 shadow-sm transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  全削除
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile FAB to show sidebar */}
      {!mobileHeaderVisible && showFab && (
        <button
          onClick={() => { setMobileHeaderVisible(true); setShowFab(false); matchContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="lg:hidden fixed bottom-20 right-4 z-50 w-11 h-11 bg-primary-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 active:scale-95 transition-all"
          title="メニューを表示"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      )}

      {/* Main content */}
      <div ref={matchContentRef} className="flex-1 min-w-0 order-2 lg:order-1 overflow-hidden flex flex-col">
        {selectedEventId ? (
          matches.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-border-main flex-1 overflow-hidden flex flex-col">
              <div className="overflow-auto flex-1">
                {(() => {
                  // ラウンド別にグループ化
                  const roundGroups = new Map<number, Match[]>();
                  for (const m of sortedMatches) {
                    if (!roundGroups.has(m.round)) roundGroups.set(m.round, []);
                    roundGroups.get(m.round)!.push(m);
                  }
                  return Array.from(roundGroups.entries()).map(([round, roundMatches]) => {
                    const roundLabel = getRoundName(round, totalRounds);
                    const finishedCount = roundMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
                    return (
                      <div key={round}>
                        <div className="px-4 py-2.5 bg-primary-50 border-b-2 border-border-main font-bold text-gray-900 text-sm sticky top-0 flex items-center justify-between">
                          <span>{roundLabel}</span>
                          <span className="text-xs font-normal text-gray-500">
                            {finishedCount}/{roundMatches.length} 完了
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                            <tr>
                              <th className="py-1.5 px-2 w-10 text-center border-b border-border-main">#</th>
                              <th className="py-1.5 px-2 border-b border-border-main">選手1</th>
                              <th className="py-1.5 px-2 w-8 text-center border-b border-border-main"></th>
                              <th className="py-1.5 px-2 border-b border-border-main">選手2</th>
                              <th className="py-1.5 px-2 w-28 text-center border-b border-border-main">スコア</th>
                              <th className="py-1.5 px-2 w-16 text-center border-b border-border-main">状態</th>
                              <th className="py-1.5 px-2 w-14 text-center border-b border-border-main">操作</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {roundMatches.map((m, idx) => {
                              const st = statusLabels[m.status] || statusLabels.waiting;
                              const isEditing = editingMatchId === m.matchId;
                              const isWinner1 = m.winnerEntryId && m.winnerEntryId === m.player1EntryId;
                              const isWinner2 = m.winnerEntryId && m.winnerEntryId === m.player2EntryId;
                              const hasPlayers = !!m.player1Name && !!m.player2Name;
                              const isWalkover = m.status === 'walkover';

                              if (isEditing) {
                                return (
                                  <tr key={m.matchId} className="border-b border-border-main bg-blue-50">
                                    <td className="py-2 px-2 text-center font-mono text-gray-400 text-xs">{m.matchOrder}</td>
                                    <td className="py-2 px-2">
                                      <div className="flex items-center gap-1">
                                        {autoWinner === 1 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`whitespace-nowrap text-sm ${autoWinner === 1 ? 'font-bold text-amber-800' : autoWinner === 2 ? 'text-gray-400' : 'font-medium'}`}>
                                          {m.player1Name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-1 text-center text-gray-400 text-xs">vs</td>
                                    <td className="py-2 px-2">
                                      <div className="flex items-center gap-1">
                                        {autoWinner === 2 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                        <span className={`whitespace-nowrap text-sm ${autoWinner === 2 ? 'font-bold text-amber-800' : autoWinner === 1 ? 'text-gray-400' : 'font-medium'}`}>
                                          {m.player2Name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max="99"
                                            value={editScore1}
                                            onChange={e => { setEditScore1(e.target.value); setEditTiebreak(''); }}
                                            placeholder="0"
                                            className="w-12 border border-gray-300 rounded px-1 py-1 text-sm text-center font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') saveResult(m);
                                              if (e.key === 'Escape') cancelEdit();
                                            }}
                                            autoFocus
                                          />
                                          <span className="text-gray-500 font-bold">―</span>
                                          <input
                                            type="number"
                                            min="0"
                                            max="99"
                                            value={editScore2}
                                            onChange={e => { setEditScore2(e.target.value); setEditTiebreak(''); }}
                                            placeholder="0"
                                            className="w-12 border border-gray-300 rounded px-1 py-1 text-sm text-center font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') saveResult(m);
                                              if (e.key === 'Escape') cancelEdit();
                                            }}
                                          />
                                        </div>
                                        {isTiebreakScore && (
                                          <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <span>TB</span>
                                            {tiebreakLoserSide === 1 && (
                                              <>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="99"
                                                  value={editTiebreak}
                                                  onChange={e => setEditTiebreak(e.target.value)}
                                                  placeholder="0"
                                                  className="w-10 border border-amber-300 rounded px-1 py-0.5 text-xs text-center font-mono bg-amber-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') saveResult(m);
                                                    if (e.key === 'Escape') cancelEdit();
                                                  }}
                                                />
                                                <span className="text-gray-300">―</span>
                                                <span className="text-gray-400 w-10 text-center">-</span>
                                              </>
                                            )}
                                            {tiebreakLoserSide === 2 && (
                                              <>
                                                <span className="text-gray-400 w-10 text-center">-</span>
                                                <span className="text-gray-300">―</span>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max="99"
                                                  value={editTiebreak}
                                                  onChange={e => setEditTiebreak(e.target.value)}
                                                  placeholder="0"
                                                  className="w-10 border border-amber-300 rounded px-1 py-0.5 text-xs text-center font-mono bg-amber-50 focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') saveResult(m);
                                                    if (e.key === 'Escape') cancelEdit();
                                                  }}
                                                />
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      {autoWinner ? (
                                        <span className="text-xs text-amber-600 font-medium">
                                          {autoWinner === 1 ? 'P1' : 'P2'}勝利
                                        </span>
                                      ) : (
                                        <span className="text-xs text-blue-600 font-medium">入力中</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <div className="flex items-center gap-1 justify-center">
                                        <button
                                          onClick={() => saveResult(m)}
                                          disabled={!autoWinner}
                                          className="p-2 text-green-600 hover:bg-green-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                          title="保存"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button onClick={cancelEdit} className="p-2 text-gray-400 hover:bg-gray-100 rounded" title="キャンセル">
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={m.matchId} className={`border-b border-border-main hover:bg-primary-50/50 transition-colors ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                                  <td className="py-2 px-2 text-center font-mono text-gray-400 text-xs">{m.matchOrder}</td>
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1">
                                      {isWinner1 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                      <span className={`whitespace-nowrap ${isWinner1 ? 'font-bold text-amber-800' : isWinner2 ? 'text-gray-400' : 'font-medium'}`}>
                                        {m.player1Name || '(未定)'}
                                      </span>
                                      {m.player1Affiliation && <span className="text-xs text-gray-400 ml-1">({m.player1Affiliation})</span>}
                                    </div>
                                  </td>
                                  <td className="py-2 px-1 text-center text-gray-300 text-xs">vs</td>
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1">
                                      {isWinner2 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                      <span className={`whitespace-nowrap ${isWinner2 ? 'font-bold text-amber-800' : isWinner1 ? 'text-gray-400' : 'font-medium'}`}>
                                        {m.player2Name || '(未定)'}
                                      </span>
                                      {m.player2Affiliation && <span className="text-xs text-gray-400 ml-1">({m.player2Affiliation})</span>}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono text-sm">
                                    {m.score || (isWalkover ? 'W.O' : '-')}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${st.color}`}>{st.text}</span>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {hasPlayers && !isWalkover && (
                                      <button
                                        onClick={() => startEdit(m)}
                                        className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded transition-colors"
                                        title="結果入力"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-border-main shadow-sm">
              <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">試合データがありません</h3>
              <p className="text-gray-500 max-w-md">
                ドローを作成・保存した後、「試合生成」ボタンを押すと1回戦の対戦カードと後続ラウンドの空枠が自動生成されます。
              </p>
            </div>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center bg-white rounded-xl border border-border-main shadow-sm h-64">
            <p className="font-semibold text-gray-500">上部のドロップダウンから対象種目を選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
