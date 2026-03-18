import type { DrawSlotData, MatchResult } from './DrawBoard';

interface RoundRobinRendererProps {
  slots: DrawSlotData[];
  matchResults?: MatchResult[];
}

export default function RoundRobinRenderer({ slots, matchResults = [] }: RoundRobinRendererProps) {
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

  // 勝敗集計
  const stats = players.map((p) => {
    let wins = 0;
    let losses = 0;
    for (const other of players) {
      if (other.entryId === p.entryId) continue;
      const match = findMatchBetween(p, other);
      if (match && match.winnerEntryId) {
        if (match.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
    }
    return { wins, losses };
  });

  // 順位計算（勝数降順、同勝数なら敗数昇順）
  const rankings = players.map((_, i) => i);
  rankings.sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    return stats[a].losses - stats[b].losses;
  });
  const rankMap = new Map<number, number>();
  rankings.forEach((playerIdx, rankIdx) => {
    rankMap.set(playerIdx, rankIdx + 1);
  });

  // セル内のスコア表示
  const getCellContent = (rowIdx: number, colIdx: number): { text: string; isWin: boolean; isLoss: boolean } => {
    if (rowIdx === colIdx) return { text: '', isWin: false, isLoss: false };
    const p1 = players[rowIdx];
    const p2 = players[colIdx];
    const match = findMatchBetween(p1, p2);
    if (!match || !match.winnerEntryId) return { text: '', isWin: false, isLoss: false };
    const isWin = match.winnerEntryId === p1.entryId;
    return {
      text: match.score || (isWin ? '○' : '●'),
      isWin,
      isLoss: !isWin,
    };
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
              <th className="border-2 border-gray-900 bg-gray-50 px-3 py-2 text-center font-bold min-w-[70px]">
                順　位
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, rowIdx) => (
              <tr key={`row-${rowIdx}`}>
                {/* 選手名セル */}
                <td className="border-2 border-gray-900 px-3 py-3 font-medium whitespace-nowrap">
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
                  return (
                    <td
                      key={`cell-${rowIdx}-${colIdx}`}
                      className={`border-2 border-gray-900 px-2 py-3 text-center relative ${
                        isSelf ? 'bg-gray-200' : ''
                      } ${cell.isWin ? 'text-red-600 font-bold' : ''} ${cell.isLoss ? 'text-blue-600' : ''}`}
                    >
                      {isSelf ? (
                        /* 対角線（自分 vs 自分） */
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                          <line x1="0" y1="0" x2="100%" y2="100%" stroke="#374151" strokeWidth="1.5" />
                        </svg>
                      ) : (
                        cell.text
                      )}
                    </td>
                  );
                })}
                {/* 勝敗 */}
                <td className="border-2 border-gray-900 px-2 py-3 text-center font-medium whitespace-nowrap">
                  {stats[rowIdx].wins > 0 || stats[rowIdx].losses > 0
                    ? `${stats[rowIdx].wins} - ${stats[rowIdx].losses}`
                    : ''}
                </td>
                {/* 順位 */}
                <td className="border-2 border-gray-900 px-2 py-3 text-center font-bold text-lg">
                  {(stats[rowIdx].wins > 0 || stats[rowIdx].losses > 0) ? rankMap.get(rowIdx) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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
