import type { DrawSlotData, MatchResult } from '../../features/draw/DrawBoard';

interface ScoreboardLeagueProps {
  slots: DrawSlotData[];
  matchResults: MatchResult[];
  onMatchSelect: (player1EntryId: string, player2EntryId: string) => void;
  selectedMatchKey?: string | null; // "entryId1-entryId2" format
}

export default function ScoreboardLeague({
  slots,
  matchResults,
  onMatchSelect,
  selectedMatchKey,
}: ScoreboardLeagueProps) {
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

  // 選択中のマッチキーを正規化して比較するヘルパー
  const isMatchSelected = (entryId1: string, entryId2: string): boolean => {
    if (!selectedMatchKey) return false;
    const key1 = `${entryId1}-${entryId2}`;
    const key2 = `${entryId2}-${entryId1}`;
    return selectedMatchKey === key1 || selectedMatchKey === key2;
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

  // セル内容とスタイルの決定
  const getCellInfo = (rowIdx: number, colIdx: number) => {
    const p1 = players[rowIdx];
    const p2 = players[colIdx];
    const match = findMatchBetween(p1, p2);
    const entryId1 = p1.entryId;
    const entryId2 = p2.entryId;
    const selected = entryId1 && entryId2 ? isMatchSelected(entryId1, entryId2) : false;

    if (!match) {
      return {
        text: '',
        className: 'hover:bg-primary-50 cursor-pointer',
        selected,
        entryId1,
        entryId2,
      };
    }

    if (match.status === 'walkover') {
      return {
        text: 'W/O',
        className: 'text-gray-500 cursor-pointer hover:bg-primary-50',
        selected,
        entryId1,
        entryId2,
      };
    }

    if (match.status === 'playing') {
      return {
        text: '試合中',
        className: 'bg-green-100 animate-pulse cursor-pointer',
        selected,
        entryId1,
        entryId2,
      };
    }

    if (match.status === 'finished' && match.winnerEntryId) {
      const isWin = match.winnerEntryId === p1.entryId;
      // スコアの表示: 勝者側から見たスコアか、シンボル
      const scoreText = match.score || (isWin ? '○' : '●');
      return {
        text: scoreText,
        className: isWin
          ? 'text-red-600 font-bold cursor-pointer hover:bg-red-50'
          : 'text-blue-600 cursor-pointer hover:bg-blue-50',
        selected,
        entryId1,
        entryId2,
      };
    }

    // ready / waiting その他
    return {
      text: '',
      className: 'hover:bg-primary-50 cursor-pointer',
      selected,
      entryId1,
      entryId2,
    };
  };

  const handleCellClick = (entryId1: string | null, entryId2: string | null) => {
    if (entryId1 && entryId2) {
      onMatchSelect(entryId1, entryId2);
    }
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

                  if (isSelf) {
                    return (
                      <td
                        key={`cell-${rowIdx}-${colIdx}`}
                        className="border-2 border-gray-900 bg-gray-200 relative min-w-[100px]"
                      >
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                          <line x1="0" y1="0" x2="100%" y2="100%" stroke="#374151" strokeWidth="1.5" />
                        </svg>
                      </td>
                    );
                  }

                  const cell = getCellInfo(rowIdx, colIdx);

                  return (
                    <td
                      key={`cell-${rowIdx}-${colIdx}`}
                      className={`border-2 border-gray-900 px-2 py-3 text-center min-w-[100px] ${cell.className} ${
                        cell.selected ? 'ring-2 ring-primary-500 ring-inset' : ''
                      }`}
                      onClick={() => handleCellClick(cell.entryId1, cell.entryId2)}
                    >
                      {cell.text}
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
