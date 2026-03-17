import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { ClipboardList, ListOrdered, Printer, RefreshCw, Trash2 } from 'lucide-react';
import type { Match } from '../../db/database';

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
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

  const round1Matches = useMemo(() => sortedMatches.filter(m => m.round === 1), [sortedMatches]);
  const laterMatches = useMemo(() => sortedMatches.filter(m => m.round > 1), [sortedMatches]);

  const handleGenerateMatches = async () => {
    if (!drawData || !selectedEventId) return;
    setIsGenerating(true);

    try {
      const slots = drawData.slots;
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

  const handleDeleteAll = async () => {
    if (!confirm('この種目の試合データをすべて削除しますか？')) return;
    const ids = matches.map(m => m.id).filter((id): id is number => id !== undefined);
    if (ids.length > 0) await db.matches.bulkDelete(ids);
  };

  const courts = useLiveQuery(() => db.courts.toArray()) || [];

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
    const gameMethod = `${games}ゲームマッチ \n（${games}-${games}タイブレーク）`;

    const roundName = (round: number) => getRoundName(round, totalRounds);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>審判用紙 - ${eventName}</title>
<style>
  @page { size: A4 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'MS Gothic', 'ＭＳ ゴシック', 'Yu Gothic', 'Hiragino Sans', sans-serif; color: #000; }
  .sheet {
    page-break-after: always;
    width: 287mm;
    height: 190mm;
    padding: 0;
    position: relative;
  }
  .sheet:last-child { page-break-after: auto; }

  /* メインテーブル - Excel構造を忠実に再現 */
  .ref-table {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .ref-table td, .ref-table th {
    vertical-align: middle;
    padding: 0;
  }

  /* Row 1-2: タイトル「審　判　用　紙」 */
  .title-cell {
    text-align: center;
    font-size: 32px;
    font-weight: bold;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    height: 37px;
    letter-spacing: 0.5em;
  }

  /* Row 3: 大会名 + 日付 */
  .tourney-name {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border-bottom: 2px solid #000;
    height: 22px;
  }
  .tourney-date {
    text-align: right;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border-bottom: 2px solid #000;
    padding-right: 4px;
    height: 22px;
  }

  /* Row 4-7: 種目/回戦 */
  .label-cell {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
    border-top: 2px solid #000;
  }
  .event-cell {
    text-align: center;
    font-size: 19px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-top: 2px solid #000;
  }
  .round-label-cell {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-top: 2px solid #000;
  }
  .round-value-cell {
    text-align: center;
    font-size: 24px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-top: 2px solid #000;
    border-right: 2px solid #000;
  }

  /* Row 8-9: コートNo/試合方法/開始時間 */
  .court-label {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
    border-bottom: 2px solid #000;
  }
  .court-value {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-bottom: 2px solid #000;
  }
  .method-label {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-bottom: 2px solid #000;
  }
  .method-value {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-bottom: 2px solid #000;
    white-space: pre-line;
    line-height: 1.3;
  }
  .time-label {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-bottom: 2px solid #000;
  }
  .time-value {
    text-align: center;
    font-size: 16px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-bottom: 2px solid #000;
    border-right: 2px solid #000;
  }

  /* Row 10: 空行 */
  .spacer-row td { height: 7px; }

  /* Row 11-12: エントリーNo */
  .entry-label {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
    border-top: 2px solid #000;
  }
  .entry-no-label {
    text-align: right;
    font-size: 20px;
    font-family: 'Times New Roman', serif;
    border-top: 2px solid #000;
    border-bottom: 1px solid #000;
    border-left: 1px solid #000;
    padding-right: 2px;
  }
  .entry-no-value {
    text-align: center;
    font-size: 26px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border: 1px solid #000;
    border-top: 2px solid #000;
  }
  .entry-no-value-right {
    text-align: center;
    font-size: 26px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border: 1px solid #000;
    border-top: 2px solid #000;
    border-right: 2px solid #000;
  }

  /* Row 13-18: 選手氏名 + 所属 */
  .name-label {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
  }
  .player-name-cell {
    text-align: center;
    font-size: 28px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border: 1px solid #000;
    white-space: nowrap;
  }
  .player-name-right {
    text-align: center;
    font-size: 28px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border: 1px solid #000;
    border-right: 2px solid #000;
    white-space: nowrap;
  }
  .aff-open {
    text-align: right;
    font-size: 20px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border-left: 1px solid #000;
    border-bottom: 1px solid #000;
    padding-top: 0;
  }
  .aff-name {
    text-align: center;
    font-size: 20px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border-bottom: 1px solid #000;
    padding-top: 0;
  }
  .aff-close {
    text-align: left;
    font-size: 20px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    padding-top: 0;
  }
  .aff-close-right {
    text-align: left;
    font-size: 20px;
    font-family: 'MS PGothic', 'ＭＳ Ｐゴシック', sans-serif;
    border-right: 2px solid #000;
    border-bottom: 1px solid #000;
    padding-top: 0;
  }

  /* Row 19-21: スコア + TB */
  .score-label {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
  }
  .score-area {
    border: 1px solid #000;
    height: 80px;
    font-size: 24px;
    text-align: center;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
  }
  .score-dash {
    text-align: center;
    font-size: 24px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border-top: 1px solid #000;
  }
  .score-area-right {
    border: 1px solid #000;
    border-right: 2px solid #000;
    height: 80px;
  }
  .tb-label {
    text-align: center;
    font-size: 14px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border: 1px solid #000;
    border-left: 2px solid #000;
    border-bottom: 2px solid #000;
    height: 40px;
  }
  .tb-area {
    border: 1px solid #000;
    border-bottom: 2px solid #000;
    height: 40px;
  }
  .tb-paren {
    text-align: center;
    font-size: 12px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border-bottom: 2px solid #000;
    height: 40px;
  }
  .tb-area-right {
    border: 1px solid #000;
    border-bottom: 2px solid #000;
    border-right: 2px solid #000;
    height: 40px;
  }

  /* Row 22: フッター */
  .footer-cell {
    text-align: right;
    font-size: 12px;
    font-family: 'MS Gothic', 'ＭＳ ゴシック', monospace;
    border-top: 2px solid #000;
    padding-right: 4px;
    height: 25px;
  }
</style></head><body>
${printableMatches.map(m => {
      const rName = roundName(m.round);
      const courtObj = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      const courtDisplay = courtObj?.name || '';

      return `
<div class="sheet">
  <table class="ref-table">
    <!-- Row 1-2: タイトル -->
    <colgroup>
      <col style="width:8.7%"><!-- A-F (6cols/38 ≈ 15.8% but A is narrow) -->
      <col style="width:2.3%">
      <col style="width:2.3%">
      <col style="width:2.3%">
      <col style="width:2.3%">
      <col style="width:2.3%">
      <col style="width:41.2%"><!-- G-S merged for event name -->
      <col style="width:15.8%"><!-- T-Y for round label -->
      <col style="width:22.6%"><!-- Z-AL for round value -->
    </colgroup>
    <tr>
      <td colspan="9" class="title-cell" style="height:37px;">審　判　用　紙</td>
    </tr>
    <!-- Row 3: 大会名 + 日付 -->
    <tr>
      <td style="width:18.4%;height:22px;"></td>
      <td colspan="6" class="tourney-name">(${tournamentName})</td>
      <td colspan="2" class="tourney-date">${tournamentDate}</td>
    </tr>
    <!-- Row 4-7: 種目 / 回戦 -->
    <tr>
      <td rowspan="4" class="label-cell" style="height:75px;">種　目</td>
      <td rowspan="4" colspan="5" style="display:none;"></td>
      <td rowspan="4" class="event-cell">${eventName}</td>
      <td rowspan="4" class="round-label-cell">回　戦</td>
      <td rowspan="4" class="round-value-cell">${rName}</td>
    </tr>
    <tr></tr><tr></tr><tr></tr>
    <!-- Row 8-9: コートNo / 試合方法 / 開始時間 -->
    <tr>
      <td rowspan="2" class="court-label" style="height:75px;">コート№</td>
      <td rowspan="2" colspan="1" class="court-value">${courtDisplay}</td>
      <td rowspan="2" colspan="1" class="method-label">試合方法</td>
      <td rowspan="2" colspan="2" class="method-value">${gameMethod}</td>
      <td rowspan="2" colspan="1" class="time-label">開始時間</td>
      <td rowspan="2" colspan="2" class="time-value">${m.scheduledTime || ''}</td>
    </tr>
    <tr></tr>
    <!-- Row 10: 空行 -->
    <tr class="spacer-row"><td colspan="9"></td></tr>
    <!-- Row 11-12: エントリーNo -->
    <tr>
      <td rowspan="2" class="entry-label" style="height:37px;">エントリー№</td>
      <td rowspan="2" class="entry-no-label">No.</td>
      <td rowspan="2" colspan="2" class="entry-no-value">${m.matchOrder}</td>
      <td rowspan="2" style="border-top:2px solid #000;border-bottom:1px solid #000;"></td>
      <td rowspan="2" class="entry-no-label">No.</td>
      <td rowspan="2" class="entry-no-value" style="border-right:0;">&nbsp;</td>
      <td rowspan="2" colspan="2" class="entry-no-value-right">&nbsp;</td>
    </tr>
    <tr></tr>
    <!-- Row 13-16: 選手氏名 -->
    <tr>
      <td rowspan="6" class="name-label">選 手 氏 名</td>
      <td rowspan="4" colspan="4" class="player-name-cell">${m.player1Name}</td>
      <td rowspan="4" colspan="4" class="player-name-right">${m.player2Name}</td>
    </tr>
    <tr></tr><tr></tr><tr></tr>
    <!-- Row 17-18: 所属 -->
    <tr>
      <td class="aff-open">（</td>
      <td colspan="2" class="aff-name">${m.player1Affiliation || ''}</td>
      <td class="aff-close">）</td>
      <td class="aff-open">（</td>
      <td colspan="2" class="aff-name">${m.player2Affiliation || ''}</td>
      <td class="aff-close-right">）</td>
    </tr>
    <tr></tr>
    <!-- Row 19-20: スコア -->
    <tr>
      <td rowspan="2" class="score-label" style="height:80px;">ス　コ　ア</td>
      <td rowspan="2" colspan="3" class="score-area"></td>
      <td rowspan="2" class="score-dash">―</td>
      <td rowspan="2" colspan="4" class="score-area-right"></td>
    </tr>
    <tr></tr>
    <!-- Row 21: TB -->
    <tr>
      <td class="tb-label">（ＴＢ）</td>
      <td colspan="2" class="tb-area"></td>
      <td colspan="2" class="tb-paren">（　　　）</td>
      <td colspan="4" class="tb-area-right"></td>
    </tr>
    <!-- Row 22: フッター -->
    <tr>
      <td colspan="5"></td>
      <td colspan="4" class="footer-cell">鳥取市テニス協会</td>
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

  const statusLabels: Record<string, { text: string; color: string }> = {
    waiting: { text: '待機', color: 'bg-gray-100 text-[#6b7280]' },
    ready: { text: '準備完了', color: 'bg-[#e8f5e9] text-[#2e7d32]' },
    playing: { text: '試合中', color: 'bg-green-100 text-[#16a34a]' },
    finished: { text: '終了', color: 'bg-[#e8f5e9] text-[#1b5e20]' },
    walkover: { text: '不戦勝', color: 'bg-amber-100 text-[#d97706]' },
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#2e7d32]" />
            対戦順・審判用紙
          </h1>
          <p className="text-sm text-[#6b7280] mt-1">
            ドローから試合一覧を自動生成し、対戦順の管理と審判用紙の印刷を行います。
          </p>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <label className="text-sm font-semibold text-[#111827] whitespace-nowrap">対象種目:</label>
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full sm:w-64 border-[#cbd5e1] rounded-[6px] shadow-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
            ))}
          </select>
        </div>
      </header>

      {selectedEventId ? (
        <div className="flex-1 flex flex-col gap-4">
          {/* コントロール */}
          <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#e8f5e9] text-[#2e7d32] px-3 py-1.5 rounded-full text-sm font-medium border border-[#2e7d32]/20">
                <ListOrdered className="w-4 h-4 inline mr-1" />
                {matches.length} 試合
              </div>
              {!drawData && (
                <span className="text-sm text-[#d97706]">
                  先にS-04でドローを作成・保存してください
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateMatches}
                disabled={!drawData || isGenerating}
                className="flex items-center gap-2 bg-[#2e7d32] text-white px-4 py-2 rounded-md font-medium hover:bg-[#256b28] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                {matches.length > 0 ? '再生成' : '試合生成'}
              </button>
              <button
                onClick={handlePrint}
                disabled={matches.length === 0}
                className="flex items-center gap-2 bg-[#2e7d32] text-white px-4 py-2 rounded-md font-medium hover:bg-[#256b28] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-sm"
              >
                <Printer className="w-4 h-4" />
                審判用紙印刷
              </button>
              {matches.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="flex items-center gap-2 bg-[#dc2626] text-white px-4 py-2 rounded-md font-medium hover:bg-[#b91c1c] shadow-sm transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  全削除
                </button>
              )}
            </div>
          </div>

          {/* 試合一覧 */}
          {matches.length > 0 ? (
            <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] flex-1 overflow-hidden flex flex-col">
              <div className="overflow-auto flex-1">
                {round1Matches.length > 0 && (
                  <>
                    <div className="px-4 py-3 bg-[#f1f8e9] border-b-2 border-[#e0e7ef] font-bold text-[#111827] text-sm sticky top-0">
                      1回戦
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#f1f8e9] text-xs font-semibold text-[#111827] sticky top-10">
                        <tr>
                          <th className="py-2 px-3 w-12 text-center border-b-2 border-[#e0e7ef]">#</th>
                          <th className="py-2 px-3 border-b-2 border-[#e0e7ef]">選手1</th>
                          <th className="py-2 px-3 w-10 text-center border-b-2 border-[#e0e7ef]">vs</th>
                          <th className="py-2 px-3 border-b-2 border-[#e0e7ef]">選手2</th>
                          <th className="py-2 px-3 w-20 text-center border-b-2 border-[#e0e7ef]">状態</th>
                          <th className="py-2 px-3 w-20 text-center border-b-2 border-[#e0e7ef]">スコア</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {round1Matches.map((m, idx) => {
                          const st = statusLabels[m.status] || statusLabels.waiting;
                          return (
                            <tr key={m.matchId} className={`border-b border-[#e0e7ef] hover:bg-[#e8f5e9] transition-colors ${idx % 2 === 1 ? 'bg-[#f6f9fc]' : ''}`}>
                              <td className="py-2.5 px-3 text-center font-mono text-[#6b7280]">{m.matchOrder}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-medium whitespace-nowrap">{m.player1Name}</span>
                                {m.player1Affiliation && <span className="text-xs text-[#6b7280] ml-1">({m.player1Affiliation})</span>}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[#6b7280] text-xs">vs</td>
                              <td className="py-2.5 px-3">
                                <span className="font-medium whitespace-nowrap">{m.player2Name}</span>
                                {m.player2Affiliation && <span className="text-xs text-[#6b7280] ml-1">({m.player2Affiliation})</span>}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.text}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-sm">{m.score || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
                {laterMatches.length > 0 && (
                  <>
                    <div className="px-4 py-3 bg-[#f1f8e9] border-b border-t-2 border-[#e0e7ef] font-bold text-[#111827] text-sm">
                      2回戦以降
                    </div>
                    <table className="w-full text-left border-collapse">
                      <tbody className="text-sm text-[#6b7280]">
                        {laterMatches.map(m => {
                          const st = statusLabels[m.status] || statusLabels.waiting;
                          const roundLabel = getRoundName(m.round, totalRounds);
                          return (
                            <tr key={m.matchId} className="border-b border-[#e0e7ef]">
                              <td className="py-2 px-3 w-12 text-center font-mono">{m.matchOrder}</td>
                              <td className="py-2 px-3">{roundLabel} #{m.position}</td>
                              <td className="py-2 px-3 whitespace-nowrap">{m.player1Name || '(未定)'} vs {m.player2Name || '(未定)'}</td>
                              <td className="py-2 px-3 w-20 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.text}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-[10px] border border-dashed border-[#e0e7ef] shadow-sm">
              <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-[#111827] mb-2">試合データがありません</h3>
              <p className="text-[#6b7280] max-w-md">
                ドローを作成・保存した後、「試合生成」ボタンを押すと1回戦の対戦カードと後続ラウンドの空枠が自動生成されます。
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 text-center bg-white rounded-[10px] border border-[#e0e7ef] shadow-sm h-64">
          <p className="font-semibold text-[#6b7280]">上部のドロップダウンから対象種目を選択してください</p>
        </div>
      )}
    </div>
  );
}
