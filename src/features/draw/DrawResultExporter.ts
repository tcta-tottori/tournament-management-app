/**
 * 大会結果をトーナメント表（JPEG）およびExcel形式でエクスポートする
 *
 * トーナメント形式: ブラケット図（選手名・所属・スコア・勝者を描画）
 * リーグ形式: 対戦マトリクス表（勝敗・順位付き）
 */
import * as XLSX from 'xlsx';
import type { Draw, Match, Entry, Player, Event, Tournament } from '../../db/database';

export interface ResultExportOptions {
  tournament: Tournament;
  event: Event;
  draw: Draw;
  matches: Match[];
  entries: Entry[];
  players: Player[];
}

// ===== 共通ヘルパー =====

type SlotInfo = {
  position: number;
  name: string;
  affiliation: string;
  seed: number;
  isBye: boolean;
  entryId: string | null;
};

function buildSlotMap(draw: Draw, entries: Entry[], players: Player[]): Map<number, SlotInfo> {
  const map = new Map<number, SlotInfo>();
  for (const s of draw.slots) {
    let name = 'bye';
    let affiliation = '';
    if (!s.isBye && s.entryId) {
      const entry = entries.find(e => e.entryId === s.entryId);
      if (entry) {
        const p1 = players.find(p => p.playerId === entry.playerId);
        const isDoubles = !!entry.partnerId;
        const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
        name = isDoubles && p1 && p2 ? `${p1.name}・${p2.name}` : (p1?.name || '(不明)');
        affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
          ? `${p1.affiliation}/${p2.affiliation}`
          : (p1?.affiliation || '');
      }
    }
    map.set(s.position, { position: s.position, name, affiliation, seed: s.seed, isBye: s.isBye, entryId: s.entryId });
  }
  return map;
}

function buildMatchMap(matches: Match[]): Map<string, Match> {
  const map = new Map<string, Match>();
  for (const m of matches) map.set(`${m.round}-${m.position}`, m);
  return map;
}


function getWinnerAtRound(
  round: number, index: number,
  slotMap: Map<number, SlotInfo>,
  matchMap: Map<string, Match>,
  totalRounds: number,
): { name: string; entryId: string | null; isBye: boolean } | null {
  if (round === 0) {
    const s = slotMap.get(index + 1);
    return s ? { name: s.name, entryId: s.entryId, isBye: s.isBye } : null;
  }
  const match = matchMap.get(`${round}-${index + 1}`);
  if (match?.winnerEntryId) {
    const isP1 = match.winnerEntryId === match.player1EntryId;
    return { name: isP1 ? match.player1Name : match.player2Name, entryId: match.winnerEntryId, isBye: false };
  }
  if (match?.status === 'walkover') {
    const topSlot = getWinnerAtRound(round - 1, index * 2, slotMap, matchMap, totalRounds);
    const botSlot = getWinnerAtRound(round - 1, index * 2 + 1, slotMap, matchMap, totalRounds);
    if (topSlot?.isBye && botSlot && !botSlot.isBye) return botSlot;
    if (botSlot?.isBye && topSlot && !topSlot.isBye) return topSlot;
  }
  // BYE自動進出
  const topSlot = getWinnerAtRound(round - 1, index * 2, slotMap, matchMap, totalRounds);
  const botSlot = getWinnerAtRound(round - 1, index * 2 + 1, slotMap, matchMap, totalRounds);
  if (topSlot?.isBye && botSlot && !botSlot.isBye) return botSlot;
  if (botSlot?.isBye && topSlot && !topSlot.isBye) return topSlot;
  return null;
}

// スロット中心行
function getSlotRow(round: number, index: number): number {
  if (round === 0) return index * 2;
  return (getSlotRow(round - 1, index * 2) + getSlotRow(round - 1, index * 2 + 1)) / 2;
}

// ===== Canvas トーナメント描画 (JPEG) =====

export function exportTournamentResultAsJpeg(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);
  const matchMap = buildMatchMap(matches);
  const drawSize = draw.drawSize;
  const totalRounds = Math.log2(drawSize);
  const isDoubles = event.type === 'Doubles';

  // レイアウト定数
  const ROW_H = 38;
  const SLOT_W = isDoubles ? 340 : 260;
  const BRACKET_W = 70;
  const SCORE_W = 50;
  const ROUND_W = BRACKET_W + SCORE_W;
  const MARGIN_TOP = 80;
  const MARGIN_LEFT = 30;
  const MARGIN_RIGHT = 30;
  const MARGIN_BOTTOM = 30;

  const bodyHeight = drawSize * 2 - 1;
  const canvasH = MARGIN_TOP + bodyHeight * ROW_H + MARGIN_BOTTOM;

  // トーナメントの左右半分を分ける（drawSize > 4 の場合）
  // 画像の参考形式: 左半分(上半分のドロー) と 右半分(下半分のドロー) を左右に配置し、中央に優勝者
  // 簡略化: 左から右への一方向ブラケットとして描画
  const canvasW = MARGIN_LEFT + SLOT_W + totalRounds * ROUND_W + SCORE_W + MARGIN_RIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * 2; // 高解像度
  canvas.height = canvasH * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // フォント設定
  const fontBase = '"Yu Gothic", "Hiragino Sans", sans-serif';
  ctx.textBaseline = 'middle';

  // ヘッダー: 種目名（左上、枠付き）
  ctx.font = `bold 22px ${fontBase}`;
  ctx.fillStyle = '#000';
  const eventNameW = ctx.measureText(event.name).width + 30;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(MARGIN_LEFT, 14, eventNameW, 38);
  ctx.fillText(event.name, MARGIN_LEFT + 15, 34);

  // ヘッダー: 大会名（右上）
  ctx.font = `bold 18px ${fontBase}`;
  const tournName = tournament.name;
  const tnW = ctx.measureText(tournName).width;
  ctx.fillText(tournName, canvasW - MARGIN_RIGHT - tnW, 34);

  // 各スロットのY座標
  const slotY = (round: number, index: number): number => {
    const row = getSlotRow(round, index);
    return MARGIN_TOP + row * ROW_H;
  };

  // 1回戦選手描画
  ctx.font = `14px ${fontBase}`;
  for (let i = 0; i < drawSize; i++) {
    const slot = slotMap.get(i + 1);
    if (!slot) continue;
    const y = slotY(0, i);
    const x = MARGIN_LEFT;

    // 番号
    ctx.fillStyle = '#000';
    ctx.font = `13px ${fontBase}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), x + 20, y + ROW_H / 2);

    // 選手名
    ctx.textAlign = 'left';
    if (slot.isBye) {
      ctx.font = `14px ${fontBase}`;
      ctx.fillText('bye', x + 35, y + ROW_H / 2);
    } else {
      ctx.font = `bold 14px ${fontBase}`;
      ctx.fillText(slot.name, x + 35, y + ROW_H / 2);
      // 所属
      if (slot.affiliation) {
        ctx.font = `12px ${fontBase}`;
        ctx.fillStyle = '#333';
        ctx.font = `bold 14px ${fontBase}`;
        const actualNameW = ctx.measureText(slot.name).width;
        ctx.font = `12px ${fontBase}`;
        ctx.fillText(`（${slot.affiliation}）`, x + 35 + actualNameW + 8, y + ROW_H / 2);
        ctx.fillStyle = '#000';
      }
    }

    // 水平線（スロットからブラケットへの線）
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + SLOT_W - 20, y + ROW_H / 2);
    ctx.lineTo(x + SLOT_W, y + ROW_H / 2);
    ctx.stroke();
  }

  // 各ラウンドのブラケット描画
  for (let round = 1; round <= totalRounds; round++) {
    const numMatches = drawSize / Math.pow(2, round);
    const bracketX = MARGIN_LEFT + SLOT_W + (round - 1) * ROUND_W;

    for (let m = 0; m < numMatches; m++) {
      const topY = slotY(round - 1, m * 2) + ROW_H / 2;
      const botY = slotY(round - 1, m * 2 + 1) + ROW_H / 2;
      const midY = slotY(round, m) + ROW_H / 2;

      const match = matchMap.get(`${round}-${m + 1}`);
      const isFinished = match && (match.status === 'finished' || match.status === 'walkover');
      const winnerIsP1 = isFinished && match.winnerEntryId === match.player1EntryId;
      const winnerIsP2 = isFinished && match.winnerEntryId === match.player2EntryId;

      // 上のブラケット線
      ctx.strokeStyle = winnerIsP1 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsP1 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, topY);
      ctx.lineTo(bracketX + BRACKET_W / 2, topY);
      ctx.lineTo(bracketX + BRACKET_W / 2, midY);
      ctx.stroke();

      // 下のブラケット線
      ctx.strokeStyle = winnerIsP2 ? '#cc0000' : '#333';
      ctx.lineWidth = winnerIsP2 ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, botY);
      ctx.lineTo(bracketX + BRACKET_W / 2, botY);
      ctx.lineTo(bracketX + BRACKET_W / 2, midY);
      ctx.stroke();

      // 接続線（中央→次のラウンドへ）
      const winnerExists = winnerIsP1 || winnerIsP2;
      ctx.strokeStyle = winnerExists ? '#cc0000' : '#333';
      ctx.lineWidth = winnerExists ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(bracketX + BRACKET_W / 2, midY);
      ctx.lineTo(bracketX + BRACKET_W, midY);
      ctx.stroke();

      // スコア表示
      if (match?.score && isFinished) {
        ctx.fillStyle = '#000';
        ctx.font = `12px ${fontBase}`;
        ctx.textAlign = 'left';

        // スコアを上・下のそれぞれの分岐点に表示
        const scores = match.score.split('-');
        if (scores.length === 2) {
          const s1 = scores[0].replace(/\(.*\)/, '').trim();
          const s2 = scores[1].replace(/\(.*\)/, '').trim();
          // 上側スコア (topYの右)
          ctx.fillText(s1, bracketX + BRACKET_W / 2 + 3, topY - 2);
          // 下側スコア (botYの右)
          ctx.fillText(s2, bracketX + BRACKET_W / 2 + 3, botY - 2);
        }
      } else if (match?.status === 'walkover') {
        ctx.fillStyle = '#000';
        ctx.font = `11px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText('W.O', bracketX + BRACKET_W / 2 + 3, topY - 2);
      }

      // 決勝の場合は勝者名とスコアを中央に表示
      if (round === totalRounds && isFinished && match.winnerEntryId) {
        const winnerName = winnerIsP1 ? match.player1Name : match.player2Name;
        const scoreX = bracketX + BRACKET_W + 10;
        ctx.fillStyle = '#000';
        ctx.font = `bold 16px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText(winnerName, scoreX, midY - 8);
        if (match.score) {
          ctx.font = `14px ${fontBase}`;
          ctx.fillText(match.score, scoreX, midY + 12);
        }
      }
    }
  }

  // JPEGダウンロード
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournament.name}_${event.name}_結果.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

// ===== Canvas リーグ表描画 (JPEG) =====

export function exportRoundRobinResultAsJpeg(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);

  // BYE以外の選手
  const playerSlots = draw.slots
    .filter(s => !s.isBye)
    .sort((a, b) => a.position - b.position)
    .map(s => slotMap.get(s.position)!)
    .filter(Boolean);
  const n = playerSlots.length;
  if (n < 2) return;

  // 対戦結果マトリクス
  const findMatch = (p1: SlotInfo, p2: SlotInfo): Match | undefined => {
    return matches.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  const getScore = (rowPlayer: SlotInfo, colPlayer: SlotInfo): { text: string; isWin: boolean } => {
    const m = findMatch(rowPlayer, colPlayer);
    if (!m || !m.winnerEntryId) return { text: '', isWin: false };
    const isWin = m.winnerEntryId === rowPlayer.entryId;
    // スコアを行プレイヤー視点で表示
    if (m.score) {
      if (m.player1EntryId === rowPlayer.entryId) {
        return { text: m.score, isWin };
      } else {
        // スコアを反転 "8-2" → "2-8"
        const parts = m.score.split('-');
        if (parts.length === 2) {
          return { text: `${parts[1].trim()}-${parts[0].trim()}`, isWin };
        }
        return { text: m.score, isWin };
      }
    }
    return { text: isWin ? '○' : '●', isWin };
  };

  // 勝敗集計
  const stats = playerSlots.map(p => {
    let wins = 0, losses = 0;
    for (const other of playerSlots) {
      if (other.entryId === p.entryId) continue;
      const m = findMatch(p, other);
      if (m?.winnerEntryId) {
        if (m.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
    }
    return { wins, losses };
  });

  // 順位
  const rankings = playerSlots.map((_, i) => i);
  rankings.sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    return stats[a].losses - stats[b].losses;
  });
  const rankMap = new Map<number, number>();
  rankings.forEach((pi, ri) => rankMap.set(pi, ri + 1));

  // レイアウト
  const fontBase = '"Yu Gothic", "Hiragino Sans", sans-serif';
  const CELL_W = 100;
  const NAME_W = 250;
  const ROW_H = 50;
  const HDR_H = 45;
  const MARGIN = 40;
  const STAT_W = 90;
  const RANK_W = 70;

  const tableW = NAME_W + n * CELL_W + STAT_W + RANK_W;
  const tableH = HDR_H + n * ROW_H;
  const canvasW = MARGIN * 2 + tableW;
  const canvasH = MARGIN + 70 + tableH + MARGIN;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * 2;
  canvas.height = canvasH * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ヘッダー
  ctx.fillStyle = '#000';
  ctx.font = `bold 22px ${fontBase}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const evNameW = ctx.measureText(event.name).width + 30;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(MARGIN, 14, evNameW, 38);
  ctx.fillText(event.name, MARGIN + 15, 34);

  ctx.font = `bold 18px ${fontBase}`;
  ctx.textAlign = 'right';
  ctx.fillText(tournament.name, canvasW - MARGIN, 34);

  const tableX = MARGIN;
  const tableY = MARGIN + 60;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;

  // テーブル外枠
  ctx.strokeRect(tableX, tableY, tableW, tableH);

  // ヘッダー行
  ctx.fillStyle = '#f9f9f9';
  ctx.fillRect(tableX, tableY, tableW, HDR_H);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tableX, tableY + HDR_H);
  ctx.lineTo(tableX + tableW, tableY + HDR_H);
  ctx.stroke();

  // ヘッダーテキスト (列名 = 選手名)
  ctx.fillStyle = '#000';
  ctx.font = `bold 13px ${fontBase}`;
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const cx = tableX + NAME_W + i * CELL_W + CELL_W / 2;
    ctx.fillText(playerSlots[i].name, cx, tableY + HDR_H / 2);
    // 縦線
    ctx.beginPath();
    ctx.moveTo(tableX + NAME_W + i * CELL_W, tableY);
    ctx.lineTo(tableX + NAME_W + i * CELL_W, tableY + tableH);
    ctx.stroke();
  }
  // 勝敗・順位列
  const statX = tableX + NAME_W + n * CELL_W;
  ctx.beginPath();
  ctx.moveTo(statX, tableY);
  ctx.lineTo(statX, tableY + tableH);
  ctx.stroke();
  ctx.fillText('勝　敗', statX + STAT_W / 2, tableY + HDR_H / 2);

  const rankX = statX + STAT_W;
  ctx.beginPath();
  ctx.moveTo(rankX, tableY);
  ctx.lineTo(rankX, tableY + tableH);
  ctx.stroke();
  ctx.fillText('順　位', rankX + RANK_W / 2, tableY + HDR_H / 2);

  // データ行
  for (let row = 0; row < n; row++) {
    const y = tableY + HDR_H + row * ROW_H;

    // 行区切り線
    if (row > 0) {
      ctx.beginPath();
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableW, y);
      ctx.stroke();
    }

    // 選手名セル
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.font = `13px ${fontBase}`;
    ctx.fillText(`${row + 1}`, tableX + 10, y + ROW_H / 2);
    ctx.font = `bold 14px ${fontBase}`;
    const pName = playerSlots[row].name;
    const pAff = playerSlots[row].affiliation;
    const dispName = pAff ? `${pName}（${pAff}）` : pName;
    ctx.fillText(dispName, tableX + 30, y + ROW_H / 2);

    // 対戦結果セル
    for (let col = 0; col < n; col++) {
      const cx = tableX + NAME_W + col * CELL_W + CELL_W / 2;
      if (row === col) {
        // 対角線
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        const x1 = tableX + NAME_W + col * CELL_W;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x1 + CELL_W, y + ROW_H);
        ctx.stroke();
        ctx.strokeStyle = '#000';
      } else {
        const result = getScore(playerSlots[row], playerSlots[col]);
        ctx.font = `14px ${fontBase}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(result.text, cx, y + ROW_H / 2);
      }
    }

    // 勝敗
    ctx.fillStyle = '#000';
    ctx.font = `14px ${fontBase}`;
    ctx.textAlign = 'center';
    const s = stats[row];
    if (s.wins > 0 || s.losses > 0) {
      ctx.fillText(`${s.wins}-${s.losses}`, statX + STAT_W / 2, y + ROW_H / 2);
    }

    // 順位
    const rank = rankMap.get(row);
    if (rank && (s.wins > 0 || s.losses > 0)) {
      ctx.font = `bold 16px ${fontBase}`;
      ctx.fillText(`${rank}位`, rankX + RANK_W / 2, y + ROW_H / 2);
    }
  }

  // NAME列の右縦線
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tableX + NAME_W, tableY);
  ctx.lineTo(tableX + NAME_W, tableY + tableH);
  ctx.stroke();

  // JPEG出力
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournament.name}_${event.name}_結果.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

// ===== Excel トーナメント結果出力 =====

export function exportTournamentResultAsExcel(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);
  const matchMap = buildMatchMap(matches);
  const drawSize = draw.drawSize;
  const totalRounds = Math.log2(drawSize);

  const data: (string | null)[][] = [];
  const bodyHeight = drawSize * 2 - 1;

  // ヘッダー
  data.push([event.name, null, null, null, null, tournament.name]);
  data.push([]);

  // 本体グリッド
  // 列: No | 選手名 | 所属 | R1ブラケット | R1スコア | ... | 勝者
  const numCols = 3 + totalRounds * 2 + 1;
  const grid: (string | null)[][] = [];
  for (let row = 0; row < bodyHeight; row++) {
    const r: (string | null)[] = [];
    for (let col = 0; col < numCols; col++) r.push(null);
    grid.push(r);
  }

  // 1回戦スロット
  for (let i = 0; i < drawSize; i++) {
    const row = Math.round(getSlotRow(0, i));
    const slot = slotMap.get(i + 1);
    if (slot) {
      grid[row][0] = String(i + 1);
      grid[row][1] = slot.isBye ? 'bye' : slot.name;
      grid[row][2] = slot.isBye ? '' : (slot.affiliation ? `（${slot.affiliation}）` : '');
    }
  }

  // 各ラウンド
  for (let round = 1; round <= totalRounds; round++) {
    const numMatches = drawSize / Math.pow(2, round);
    const bracketCol = 3 + (round - 1) * 2;
    const scoreCol = bracketCol + 1;

    for (let m = 0; m < numMatches; m++) {
      const topRow = Math.round(getSlotRow(round - 1, m * 2));
      const botRow = Math.round(getSlotRow(round - 1, m * 2 + 1));
      const midRow = Math.round(getSlotRow(round, m));

      const match = matchMap.get(`${round}-${m + 1}`);

      // ブラケット文字
      grid[topRow][bracketCol] = '─┐';
      grid[botRow][bracketCol] = '─┘';
      for (let r = topRow + 1; r < botRow; r++) {
        grid[r][bracketCol] = r === midRow ? ' ├─' : ' │';
      }

      // スコア・勝者
      if (match) {
        if ((match.status === 'finished' || match.status === 'walkover') && match.winnerEntryId) {
          const winnerName = match.winnerEntryId === match.player1EntryId
            ? match.player1Name : match.player2Name;
          const score = match.score || 'W.O';

          // スコアを中間行に
          grid[midRow][scoreCol] = `${winnerName}  ${score}`;

          if (round === totalRounds) {
            grid[midRow][numCols - 1] = `優勝: ${winnerName}`;
          }
        }
      } else {
        // BYE処理
        const top = getWinnerAtRound(round - 1, m * 2, slotMap, matchMap, totalRounds);
        const bot = getWinnerAtRound(round - 1, m * 2 + 1, slotMap, matchMap, totalRounds);
        if (top?.isBye && bot && !bot.isBye) {
          grid[midRow][scoreCol] = bot.name;
        } else if (bot?.isBye && top && !top.isBye) {
          grid[midRow][scoreCol] = top.name;
        }
      }
    }
  }

  for (const row of grid) data.push(row.map(c => c ?? ''));

  const ws = XLSX.utils.aoa_to_sheet(data);
  const isDoubles = event.type === 'Doubles';
  ws['!cols'] = [
    { wch: 5 },
    { wch: isDoubles ? 32 : 22 },
    { wch: 14 },
    ...Array.from({ length: totalRounds }, () => [
      { wch: 6 },
      { wch: isDoubles ? 28 : 20 },
    ]).flat(),
    { wch: isDoubles ? 28 : 22 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 0, c: numCols - 1 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));
  XLSX.writeFile(wb, `${tournament.name}_${event.name}_結果.xlsx`);
}

// ===== Excel リーグ結果出力 =====

export function exportRoundRobinResultAsExcel(opts: ResultExportOptions): void {
  const { tournament, event, draw, matches, entries, players } = opts;
  const slotMap = buildSlotMap(draw, entries, players);

  const playerSlots = draw.slots
    .filter(s => !s.isBye)
    .sort((a, b) => a.position - b.position)
    .map(s => slotMap.get(s.position)!)
    .filter(Boolean);
  const n = playerSlots.length;
  if (n < 2) return;

  const findMatch = (p1: SlotInfo, p2: SlotInfo): Match | undefined => {
    return matches.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  const getScore = (rowP: SlotInfo, colP: SlotInfo): string => {
    const m = findMatch(rowP, colP);
    if (!m || !m.winnerEntryId) return '';
    if (m.score) {
      if (m.player1EntryId === rowP.entryId) return m.score;
      const parts = m.score.split('-');
      if (parts.length === 2) return `${parts[1].trim()}-${parts[0].trim()}`;
      return m.score;
    }
    return m.winnerEntryId === rowP.entryId ? '○' : '●';
  };

  const stats = playerSlots.map(p => {
    let wins = 0, losses = 0;
    for (const other of playerSlots) {
      if (other.entryId === p.entryId) continue;
      const m = findMatch(p, other);
      if (m?.winnerEntryId) {
        if (m.winnerEntryId === p.entryId) wins++; else losses++;
      }
    }
    return { wins, losses };
  });

  const rankings = playerSlots.map((_, i) => i);
  rankings.sort((a, b) => stats[b].wins !== stats[a].wins ? stats[b].wins - stats[a].wins : stats[a].losses - stats[b].losses);
  const rankMap = new Map<number, number>();
  rankings.forEach((pi, ri) => rankMap.set(pi, ri + 1));

  const data: (string | null)[][] = [];

  // ヘッダー
  data.push([event.name, ...Array(n).fill(null), tournament.name]);
  data.push([]);

  // テーブルヘッダー
  const headerRow: (string | null)[] = [''];
  for (const p of playerSlots) headerRow.push(p.name);
  headerRow.push('勝　敗', '順　位');
  data.push(headerRow);

  // データ行
  for (let row = 0; row < n; row++) {
    const p = playerSlots[row];
    const cells: (string | null)[] = [`${row + 1}  ${p.name}${p.affiliation ? `（${p.affiliation}）` : ''}`];
    for (let col = 0; col < n; col++) {
      cells.push(row === col ? '' : getScore(p, playerSlots[col]));
    }
    const s = stats[row];
    cells.push(s.wins > 0 || s.losses > 0 ? `${s.wins}-${s.losses}` : '');
    const rank = rankMap.get(row);
    cells.push(rank && (s.wins > 0 || s.losses > 0) ? `${rank}位` : '');
    data.push(cells);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 },
    ...Array(n).fill({ wch: 12 }),
    { wch: 10 },
    { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));
  XLSX.writeFile(wb, `${tournament.name}_${event.name}_結果.xlsx`);
}
