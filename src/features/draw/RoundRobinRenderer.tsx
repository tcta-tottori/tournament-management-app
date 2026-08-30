import type { DrawSlotData, MatchResult } from './DrawBoard';
import { sideScoreText } from '../score/scoreDisplay';

interface RoundRobinRendererProps {
  slots: DrawSlotData[];
  matchResults?: MatchResult[];
  /** 星取表のセルをタップしたときに、その対戦のスコア入力を開く（指定時のみセルがタップ可能） */
  onCellSelect?: (round: number, position: number) => void;
  /** 選手名をタップしたときに名前の修正を開く（名前修正モード時のみ指定する） */
  onPlayerSelect?: (entryId: string) => void;
}

/** "8-4" 形式のスコアを [自分のゲーム, 相手のゲーム] に分解（取得できなければ null） */
function parseScore(score: string | undefined | null): [number, number] | null {
  if (!score) return null;
  const m = score.match(/(\d+)\s*[-−]\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

export default function RoundRobinRenderer({ slots, matchResults = [], onCellSelect, onPlayerSelect }: RoundRobinRendererProps) {
  // BYEを除いた実選手のみ
  const players = slots.filter(s => !s.isBye);
  const n = players.length;

  if (n < 2) {
    return <div className="p-8 text-center text-gray-500">リーグ表示には2人以上の選手が必要です</div>;
  }

  // 対戦順を計算（ラウンドロビンの標準対戦順）
  const matchOrder: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchOrder.push([i, j]);
    }
  }

  // 試合結果を選手ペアで検索
  const findMatchBetween = (p1: DrawSlotData, p2: DrawSlotData): MatchResult | undefined => {
    return matchResults.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  // 勝敗・ゲーム数集計（勝率＝取得ゲーム率の算出に使用）
  const stats = players.map((p) => {
    let wins = 0, losses = 0, gamesWon = 0, gamesLost = 0;
    for (const other of players) {
      if (other.entryId === p.entryId) continue;
      const match = findMatchBetween(p, other);
      if (!match) continue;
      if (match.winnerEntryId) {
        if (match.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
      // ゲーム数（自分視点）を加算
      const sc = parseScore(match.score);
      if (sc) {
        const mine = match.player1EntryId === p.entryId ? sc[0] : sc[1];
        const theirs = match.player1EntryId === p.entryId ? sc[1] : sc[0];
        gamesWon += mine;
        gamesLost += theirs;
      }
    }
    const played = wins + losses;
    const totalGames = gamesWon + gamesLost;
    return {
      wins, losses, gamesWon, gamesLost, played,
      // 勝率＝取得ゲーム率（同勝数の並び替えに使用。試合未消化でも算出可能）
      gameRate: totalGames > 0 ? gamesWon / totalGames : 0,
    };
  });

  // 全対戦が終了しているか（順位は全結果が揃うまで非表示）
  const allFinished = matchOrder.every(([a, b]) => {
    const match = findMatchBetween(players[a], players[b]);
    return !!(match && match.winnerEntryId);
  });

  // 直接対戦（2者同率時の優先）: a が b に勝っていれば a を上位
  const headToHead = (aIdx: number, bIdx: number): number => {
    const match = findMatchBetween(players[aIdx], players[bIdx]);
    if (match?.winnerEntryId) {
      if (match.winnerEntryId === players[aIdx].entryId) return -1;
      if (match.winnerEntryId === players[bIdx].entryId) return 1;
    }
    return 0;
  };

  // 順位計算: 勝数降順 → 取得ゲーム率降順 → 得失ゲーム差降順。
  // 同勝数がちょうど2人なら直接対戦を最優先。
  const rankings = players.map((_, i) => i);
  rankings.sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    // 同勝数がこの2人だけ（同勝数グループが2人）なら直接対戦
    const sameWinCount = players.filter((_, i) => stats[i].wins === stats[a].wins).length;
    if (sameWinCount === 2) {
      const h = headToHead(a, b);
      if (h !== 0) return h;
    }
    if (stats[b].gameRate !== stats[a].gameRate) return stats[b].gameRate - stats[a].gameRate;
    const diffA = stats[a].gamesWon - stats[a].gamesLost;
    const diffB = stats[b].gamesWon - stats[b].gamesLost;
    return diffB - diffA;
  });
  const rankMap = new Map<number, number>();
  rankings.forEach((playerIdx, rankIdx) => {
    rankMap.set(playerIdx, rankIdx + 1);
  });

  // セル内のスコア表示（行選手視点にそろえる）
  const getCellContent = (rowIdx: number, colIdx: number): { text: string; isWin: boolean; isLoss: boolean; match?: MatchResult } => {
    if (rowIdx === colIdx) return { text: '', isWin: false, isLoss: false };
    const p1 = players[rowIdx];
    const p2 = players[colIdx];
    const match = findMatchBetween(p1, p2);
    if (!match) return { text: '', isWin: false, isLoss: false };
    if (!match.winnerEntryId) return { text: '', isWin: false, isLoss: false, match };
    const isWin = match.winnerEntryId === p1.entryId;
    // スコアを行選手視点にそろえる（タイブレークの得点・Ret / W.O も残す）
    const aligned = sideScoreText(match.score, match.player1EntryId === p1.entryId);
    const scoreText = aligned || match.score || (isWin ? '○' : '●');
    return { text: scoreText, isWin, isLoss: !isWin, match };
  };

  return (
    <div className="overflow-auto p-4 sm:p-6" style={{ width: '100%', height: '100%' }}>
      <div className="inline-block min-w-full">
        <table className="border-collapse border-2 border-gray-900 text-sm">
          <thead>
            <tr>
              {/* ヘッダー左上: "決勝リーグ" */}
              <th className="border-2 border-gray-900 bg-gray-50 px-3 py-2 text-center font-bold min-w-[200px]">
                決勝リーグ
              </th>
              {/* 各選手の列ヘッダー */}
              {players.map((p, i) => (
                <th
                  key={`col-${i}`}
                  className="border-2 border-gray-900 bg-gray-50 px-3 py-2 text-center font-bold whitespace-nowrap min-w-[100px]"
                >
                  {p.name}
                </th>
              ))}
              <th className="border-2 border-gray-900 bg-gray-50 px-3 py-2 text-center font-bold min-w-[80px]">
                勝　敗
              </th>
              <th className="border-2 border-gray-900 bg-gray-50 px-2 py-2 text-center font-bold min-w-[70px]">
                勝率
              </th>
              <th className="border-2 border-gray-900 bg-gray-50 px-3 py-2 text-center font-bold min-w-[70px]">
                順　位
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, rowIdx) => (
              <tr key={`row-${rowIdx}`}>
                {/* 選手名セル（名前修正モードではタップで修正） */}
                <td
                  onClick={onPlayerSelect && player.entryId ? () => onPlayerSelect(player.entryId!) : undefined}
                  className={`border-2 border-gray-900 px-3 py-3 font-medium whitespace-nowrap ${
                    onPlayerSelect && player.entryId ? 'cursor-pointer hover:bg-amber-50' : ''
                  }`}
                >
                  <span className="text-gray-500 mr-2">{rowIdx + 1}</span>
                  {player.name}
                  {player.affiliation && (
                    <span className="text-gray-400 ml-1 text-xs">（{player.affiliation}）</span>
                  )}
                </td>
                {/* 対戦結果セル */}
                {players.map((_, colIdx) => {
                  const isSelf = rowIdx === colIdx;
                  const cell = getCellContent(rowIdx, colIdx);
                  const clickable = !isSelf && !!onCellSelect && !!cell.match;
                  return (
                    <td
                      key={`cell-${rowIdx}-${colIdx}`}
                      onClick={clickable ? () => onCellSelect!(cell.match!.round, cell.match!.position) : undefined}
                      className={`border-2 border-gray-900 px-2 py-3 text-center relative ${
                        isSelf ? 'bg-gray-200' : ''
                      } ${cell.isWin ? 'text-red-600 font-bold' : ''} ${cell.isLoss ? 'text-blue-600' : ''} ${
                        clickable ? 'cursor-pointer hover:bg-primary-50' : ''
                      }`}
                    >
                      {isSelf ? (
                        /* 対角線（自分 vs 自分） */
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                          <line x1="0" y1="0" x2="100%" y2="100%" stroke="#374151" strokeWidth="1.5" />
                        </svg>
                      ) : cell.text ? (
                        cell.text
                      ) : clickable ? (
                        <span className="text-[10px] text-gray-300">入力</span>
                      ) : ''}
                    </td>
                  );
                })}
                {/* 勝敗 */}
                <td className="border-2 border-gray-900 px-2 py-3 text-center font-medium whitespace-nowrap">
                  {stats[rowIdx].played > 0
                    ? `${stats[rowIdx].wins} - ${stats[rowIdx].losses}`
                    : ''}
                </td>
                {/* 勝率（取得ゲーム率） */}
                <td className="border-2 border-gray-900 px-2 py-3 text-center text-gray-700 tabular-nums whitespace-nowrap">
                  {stats[rowIdx].gamesWon + stats[rowIdx].gamesLost > 0
                    ? stats[rowIdx].gameRate.toFixed(3)
                    : ''}
                </td>
                {/* 順位（全結果が揃うまで非表示） */}
                <td className="border-2 border-gray-900 px-2 py-3 text-center font-bold text-lg">
                  {allFinished ? rankMap.get(rowIdx) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 補足: 順位表示条件・並び替えルール */}
        <div className="mt-2 text-[11px] text-gray-500">
          {!allFinished && <span className="text-amber-600 font-medium">※順位は全対戦終了後に表示されます。</span>}
          <span className="block mt-0.5">勝率＝取得ゲーム率。同勝数は「直接対戦（2者同率時）→ 勝率 → 得失ゲーム差」で順位を決定します。</span>
        </div>

        {/* 対戦順 */}
        <div className="mt-3 text-sm text-gray-600">
          <span className="font-medium">※対戦順　</span>
          {matchOrder.map(([a, b], idx) => (
            <span key={idx} className="mr-2">
              {toCircledNum(a + 1)}-{toCircledNum(b + 1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function toCircledNum(n: number): string {
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯';
  return n >= 1 && n <= 16 ? circled[n - 1] : String(n);
}
