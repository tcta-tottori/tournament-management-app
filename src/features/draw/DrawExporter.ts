import * as XLSX from 'xlsx';
import type { Draw, Match, Entry, Player, Event, Tournament } from '../../db/database';

export interface ExportDrawOptions {
  tournament: Tournament;
  event: Event;
  draw: Draw;
  matches: Match[];
  entries: Entry[];
  players: Player[];
}

/**
 * ドロー表をExcel形式で出力する
 * xlsx Community Edition はスタイリング非対応のため、
 * 文字ベースのブラケット表現（罫線文字）でトーナメント表を表現する
 */
export function exportDrawToExcel(options: ExportDrawOptions): void {
  const { tournament, event, draw, matches, entries, players } = options;

  const wb = XLSX.utils.book_new();
  const drawSize = draw.drawSize;
  const totalRounds = Math.log2(drawSize);

  // --- スロットデータの構築 ---
  type SlotInfo = {
    position: number;
    name: string;
    affiliation: string;
    seed: number;
    isBye: boolean;
    entryId: string | null;
  };

  const slotMap = new Map<number, SlotInfo>();
  for (const s of draw.slots) {
    let name = 'BYE';
    let affiliation = '';
    if (!s.isBye && s.entryId) {
      const entry = entries.find(e => e.entryId === s.entryId);
      if (entry) {
        const p1 = players.find(p => p.playerId === entry.playerId);
        const isDoubles = !!entry.partnerId;
        const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
        name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
        affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
          ? `${p1.affiliation} / ${p2.affiliation}`
          : (p1?.affiliation || '');
      }
    }
    slotMap.set(s.position, {
      position: s.position,
      name: s.seed > 0 ? `[${s.seed}] ${name}` : name,
      affiliation,
      seed: s.seed,
      isBye: s.isBye,
      entryId: s.entryId,
    });
  }

  // --- マッチデータをラウンド/ポジション別に整理 ---
  const matchMap = new Map<string, Match>();
  for (const m of matches) {
    matchMap.set(`${m.round}-${m.position}`, m);
  }

  // --- Excelシートデータの構築 ---
  const data: (string | number | null)[][] = [];

  // ヘッダー部分 (行0-5)
  data.push([tournament.name]);
  data.push([event.name + ' (' + event.type + ')']);
  data.push(['日程: ' + tournament.date]);
  data.push(['会場: ' + tournament.venue]);
  data.push([]); // 空行
  data.push([]); // 空行

  // ラウンド名ヘッダー (行6)
  const roundNames = getRoundNames(totalRounds);
  const headerRow: (string | null)[] = ['No.', '選手名', '所属'];
  for (let r = 1; r <= totalRounds; r++) {
    headerRow.push(''); // ブラケット列
    headerRow.push(roundNames[r - 1] || `${r}回戦`); // スコア/勝者列
  }
  headerRow.push('優勝');
  data.push(headerRow);

  // --- トーナメント表本体 ---
  // 1回戦のスロットを2行ごとに配置し、ラウンドが進むごとに
  // 罫線文字でブラケットを描画する
  //
  // 行の計算:
  //   1回戦: 各スロットは行 i*2 (0-indexed from body start)
  //   つまり全体の高さは drawSize*2 - 1 行
  const bodyHeight = drawSize * 2 - 1;

  // グリッドを初期化 (列数 = 3 + totalRounds*2 + 1)
  const numCols = 3 + totalRounds * 2 + 1;
  const grid: (string | null)[][] = [];
  for (let row = 0; row < bodyHeight; row++) {
    const r: (string | null)[] = [];
    for (let col = 0; col < numCols; col++) {
      r.push(null);
    }
    grid.push(r);
  }

  // 各ラウンドのスロット中心行を計算する関数
  function getSlotRow(round: number, index: number): number {
    if (round === 0) return index * 2;
    const top = getSlotRow(round - 1, index * 2);
    const bottom = getSlotRow(round - 1, index * 2 + 1);
    return Math.floor((top + bottom) / 2);
  }

  // 1回戦スロット配置 (列0=No, 1=選手名, 2=所属)
  for (let i = 0; i < drawSize; i++) {
    const row = getSlotRow(0, i);
    const slot = slotMap.get(i + 1); // 1-indexed
    if (slot) {
      grid[row][0] = String(slot.position);
      grid[row][1] = slot.name;
      grid[row][2] = slot.affiliation || '';
    }
  }

  // 各ラウンドのブラケットとスコア/勝者を配置
  for (let round = 1; round <= totalRounds; round++) {
    const numMatches = drawSize / Math.pow(2, round);
    const bracketCol = 3 + (round - 1) * 2;     // ブラケット描画列
    const scoreCol = bracketCol + 1;              // スコア/勝者列

    for (let m = 0; m < numMatches; m++) {
      const topRow = getSlotRow(round - 1, m * 2);
      const bottomRow = getSlotRow(round - 1, m * 2 + 1);
      const midRow = getSlotRow(round, m);

      // マッチデータ検索
      const match = matchMap.get(`${round}-${m + 1}`);

      // ブラケット描画
      // 上端: ┐
      grid[topRow][bracketCol] = '─┐';
      // 下端: ┘
      grid[bottomRow][bracketCol] = '─┘';
      // 中間の縦線
      for (let r = topRow + 1; r < bottomRow; r++) {
        if (r === midRow) {
          grid[r][bracketCol] = ' ├─';
        } else {
          grid[r][bracketCol] = ' │';
        }
      }

      // スコアと勝者情報
      if (match) {
        if (match.status === 'finished' && match.score) {
          grid[midRow][scoreCol] = match.score;
        }
        // 勝者名を表示（最終ラウンドの場合は優勝列にも）
        if (match.winnerEntryId) {
          const winnerName = match.winnerEntryId === match.player1EntryId
            ? match.player1Name
            : match.player2Name;

          if (round === totalRounds) {
            // 優勝列
            grid[midRow][numCols - 1] = '🏆 ' + winnerName;
          }
          // 次のラウンドの選手名としてscoreColに記載
          if (match.score) {
            grid[midRow][scoreCol] = `${match.score} (${winnerName})`;
          } else {
            grid[midRow][scoreCol] = winnerName;
          }
        }
      } else {
        // マッチデータなし：BYE判定
        const topSlot = getSlotAtRound(round - 1, m * 2, draw, slotMap, matchMap);
        const bottomSlot = getSlotAtRound(round - 1, m * 2 + 1, draw, slotMap, matchMap);

        if (topSlot?.isBye && bottomSlot?.isBye) {
          grid[midRow][scoreCol] = '(BYE)';
        } else if (topSlot?.isBye) {
          // 下側が自動勝ち上がり
          grid[midRow][scoreCol] = bottomSlot?.name || '';
        } else if (bottomSlot?.isBye) {
          // 上側が自動勝ち上がり
          grid[midRow][scoreCol] = topSlot?.name || '';
        }
      }
    }
  }

  // gridをdataに追加
  for (const row of grid) {
    data.push(row.map(cell => cell ?? ''));
  }

  // --- ワークシート作成 ---
  const ws = XLSX.utils.aoa_to_sheet(data);

  // 列幅設定
  const isDoubles = event.type === 'Doubles';
  const colWidths: XLSX.ColInfo[] = [
    { wch: 5 },                          // A: No.
    { wch: isDoubles ? 32 : 22 },        // B: 選手名
    { wch: 14 },                         // C: 所属
  ];
  for (let r = 0; r < totalRounds; r++) {
    colWidths.push({ wch: 6 });                          // ブラケット列
    colWidths.push({ wch: isDoubles ? 28 : 20 });        // スコア/勝者列
  }
  colWidths.push({ wch: isDoubles ? 28 : 22 });          // 優勝列
  ws['!cols'] = colWidths;

  // ヘッダーセルのマージ（大会名を幅広に）
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }, // 大会名
    { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } }, // 種目名
    { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } }, // 日程
    { s: { r: 3, c: 0 }, e: { r: 3, c: numCols - 1 } }, // 会場
  ];

  XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));

  // --- ダウンロード ---
  const fileName = `${tournament.name}_${event.name}_ドロー表.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * 指定ラウンド/インデックスのスロット情報を取得するヘルパー
 */
function getSlotAtRound(
  round: number,
  index: number,
  _draw: Draw,
  slotMap: Map<number, { position: number; name: string; affiliation: string; seed: number; isBye: boolean; entryId: string | null }>,
  _matchMap: Map<string, Match>
): { name: string; isBye: boolean } | null {
  if (round === 0) {
    const slot = slotMap.get(index + 1);
    return slot ? { name: slot.name, isBye: slot.isBye } : null;
  }
  return null;
}

/**
 * ラウンド名を生成
 */
function getRoundNames(totalRounds: number): string[] {
  const names: string[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    if (r === totalRounds) {
      names.push('決勝');
    } else if (r === totalRounds - 1) {
      names.push('準決勝');
    } else if (r === totalRounds - 2) {
      names.push('準々決勝');
    } else {
      names.push(`${r}回戦`);
    }
  }
  return names;
}
