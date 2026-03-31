import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DrawSlotData, MatchResult } from '../../features/draw/DrawBoard';
import { Maximize2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreboardLeagueProps {
  slots: DrawSlotData[];
  matchResults: MatchResult[];
  onMatchSelect: (player1EntryId: string, player2EntryId: string) => void;
  selectedMatchKey?: string | null;
  leagueName?: string;
  gameRuleText?: string;
}

// ---------------------------------------------------------------------------
// Optimized match order (same as mixedLogic.ts)
// ---------------------------------------------------------------------------

const MATCH_ORDER_4: [number, number][] = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];
const MATCH_ORDER_5: [number, number][] = [[0,1],[2,3],[0,4],[1,2],[0,3],[1,4],[2,4],[1,3],[3,4],[0,2]];

function generateMatchOrder(n: number): [number, number][] {
  if (n === 4) return MATCH_ORDER_4;
  if (n === 5) return MATCH_ORDER_5;
  const order: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      order.push([i, j]);
    }
  }
  return order;
}

function toCircledNum(n: number): string {
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯';
  return n >= 1 && n <= 16 ? circled[n - 1] : String(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreboardLeague({
  slots,
  matchResults,
  onMatchSelect,
  selectedMatchKey,
  leagueName = 'リーグ',
  gameRuleText,
}: ScoreboardLeagueProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // BYEを除いた実選手のみ
  const players = useMemo(() => slots.filter(s => !s.isBye), [slots]);
  const n = players.length;

  // 対戦順
  const matchOrder = useMemo(() => (n >= 2 ? generateMatchOrder(n) : []), [n]);

  // 試合結果検索
  const findMatch = useCallback(
    (p1Idx: number, p2Idx: number): MatchResult | undefined => {
      if (p1Idx >= players.length || p2Idx >= players.length) return undefined;
      const p1 = players[p1Idx];
      const p2 = players[p2Idx];
      return matchResults.find(
        m =>
          (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
          (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId),
      );
    },
    [players, matchResults],
  );

  // 現在の対戦（対戦順で最初の未完了試合）
  const currentMatchIdx = useMemo(() => {
    for (let i = 0; i < matchOrder.length; i++) {
      const [a, b] = matchOrder[i];
      const match = findMatch(a, b);
      if (!match || (match.status !== 'finished' && match.status !== 'walkover')) {
        return i;
      }
    }
    return -1; // 全試合完了
  }, [matchOrder, findMatch]);

  const allMatchesDone = currentMatchIdx === -1;

  // 勝敗集計
  const stats = useMemo(
    () =>
      players.map(p => {
        let wins = 0,
          losses = 0;
        for (const other of players) {
          if (other.entryId === p.entryId) continue;
          const match = matchResults.find(
            m =>
              (m.player1EntryId === p.entryId && m.player2EntryId === other.entryId) ||
              (m.player1EntryId === other.entryId && m.player2EntryId === p.entryId),
          );
          if (match && match.winnerEntryId) {
            if (match.winnerEntryId === p.entryId) wins++;
            else losses++;
          }
        }
        return { wins, losses };
      }),
    [players, matchResults],
  );

  // 順位計算
  const rankMap = useMemo(() => {
    const rankings = players.map((_, i) => i);
    rankings.sort((a, b) => {
      if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
      return stats[a].losses - stats[b].losses;
    });
    const map = new Map<number, number>();
    rankings.forEach((playerIdx, rankIdx) => {
      map.set(playerIdx, rankIdx + 1);
    });
    return map;
  }, [players, stats]);

  // フルスクリーン同期
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [isFullscreen]);

  // --- Early return ---
  if (n < 2) {
    return (
      <div className="p-8 text-center text-gray-500">
        リーグ表示には2人以上の選手が必要です
      </div>
    );
  }

  // --- Helpers ---
  const isCurrentMatch = (rowIdx: number, colIdx: number): boolean => {
    if (currentMatchIdx < 0) return false;
    const [a, b] = matchOrder[currentMatchIdx];
    return (rowIdx === a && colIdx === b) || (rowIdx === b && colIdx === a);
  };

  const isMatchSelected = (entryId1: string, entryId2: string): boolean => {
    if (!selectedMatchKey) return false;
    const key1 = `${entryId1}-${entryId2}`;
    const key2 = `${entryId2}-${entryId1}`;
    return selectedMatchKey === key1 || selectedMatchKey === key2;
  };

  const getCellInfo = (rowIdx: number, colIdx: number) => {
    const p1 = players[rowIdx];
    const p2 = players[colIdx];
    const match = matchResults.find(
      m =>
        (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
        (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId),
    );
    const entryId1 = p1.entryId;
    const entryId2 = p2.entryId;
    const selected = entryId1 && entryId2 ? isMatchSelected(entryId1, entryId2) : false;
    const isCurrent = isCurrentMatch(rowIdx, colIdx);

    if (!match || (match.status !== 'finished' && match.status !== 'walkover' && match.status !== 'playing')) {
      return {
        text: '',
        className: `hover:bg-primary-50 cursor-pointer ${isCurrent ? 'league-match-blink' : ''}`,
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
        className: `bg-green-100 animate-pulse cursor-pointer ${isCurrent ? 'ring-2 ring-yellow-400 ring-inset' : ''}`,
        selected,
        entryId1,
        entryId2,
      };
    }

    if (match.status === 'finished' && match.winnerEntryId) {
      const isWin = match.winnerEntryId === p1.entryId;
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

    return {
      text: '',
      className: `hover:bg-primary-50 cursor-pointer ${isCurrent ? 'league-match-blink' : ''}`,
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

  // --- Fullscreen ---
  const handleFullscreen = async () => {
    setIsFullscreen(true);
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as any)?.lock?.('landscape');
    } catch {
      /* orientation lock may not be available */
    }
  };

  const handleExitFullscreen = async () => {
    setIsFullscreen(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      (screen.orientation as any)?.unlock?.();
    } catch {
      /* ignore */
    }
  };

  // --- Render helpers ---
  const renderTable = (isFS = false) => {
    const textSize = isFS ? 'text-sm' : 'text-xs sm:text-sm';
    const cellPad = isFS ? 'px-3 py-2' : 'px-1.5 sm:px-2 py-2';
    const headerPad = isFS ? 'px-3 py-2' : 'px-1.5 sm:px-2 py-2';
    // 固定幅: 選手名列 + 対戦セル × n + 勝敗 + 順位
    const nameColW = isFS ? 'w-[180px]' : 'w-[140px] sm:w-[200px]';
    const matchColW = isFS ? 'w-[90px]' : 'w-[80px] sm:w-[100px]';
    const statColW = isFS ? 'w-[60px]' : 'w-[50px] sm:w-[65px]';
    const rankColW = isFS ? 'w-[50px]' : 'w-[40px] sm:w-[55px]';

    return (
      <table className={`border-collapse border-2 border-gray-900 table-fixed ${textSize}`}>
        <thead>
          <tr>
            <th className={`border-2 border-gray-900 bg-gray-50 ${headerPad} text-center font-bold ${nameColW}`}>
              {leagueName}
            </th>
            {players.map((p, i) => (
              <th key={`col-${i}`} className={`border-2 border-gray-900 bg-gray-50 ${headerPad} text-center ${matchColW}`}>
                <div className="font-bold truncate">{p.name}</div>
                {p.affiliation && (
                  <>
                    <div className="border-t border-gray-300 my-0.5" />
                    <div className="text-[10px] text-gray-400 font-normal truncate">{p.affiliation}</div>
                  </>
                )}
              </th>
            ))}
            <th className={`border-2 border-gray-900 bg-gray-50 ${headerPad} text-center font-bold ${statColW}`}>
              勝敗
            </th>
            <th className={`border-2 border-gray-900 bg-gray-50 ${headerPad} text-center font-bold ${rankColW}`}>
              順位
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, rowIdx) => (
            <tr key={`row-${rowIdx}`}>
              {/* 選手名セル: 番号＋名前 | 区切り線 | 所属 */}
              <td className={`border-2 border-gray-900 ${cellPad} ${nameColW}`}>
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <span className="text-gray-400 shrink-0">{toCircledNum(rowIdx + 1)}</span>
                  <span className="truncate">{player.name}</span>
                </div>
                {player.affiliation && (
                  <>
                    <div className="border-t border-gray-300 my-0.5" />
                    <div className="text-[10px] text-gray-400 truncate">{player.affiliation}</div>
                  </>
                )}
              </td>
              {/* 対戦結果セル */}
              {players.map((_, colIdx) => {
                const isSelf = rowIdx === colIdx;

                if (isSelf) {
                  return (
                    <td key={`cell-${rowIdx}-${colIdx}`} className={`border-2 border-gray-900 bg-gray-200 relative ${matchColW} h-12`}>
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
                    className={`border-2 border-gray-900 ${cellPad} text-center ${matchColW} ${cell.className} ${
                      cell.selected ? 'ring-2 ring-primary-500 ring-inset' : ''
                    }`}
                    onClick={() => handleCellClick(cell.entryId1, cell.entryId2)}
                  >
                    {cell.text}
                  </td>
                );
              })}
              {/* 勝敗 */}
              <td className={`border-2 border-gray-900 ${cellPad} text-center font-medium whitespace-nowrap ${statColW}`}>
                {allMatchesDone || stats[rowIdx].wins > 0 || stats[rowIdx].losses > 0
                  ? `${stats[rowIdx].wins}-${stats[rowIdx].losses}`
                  : ''}
              </td>
              {/* 順位 */}
              <td className={`border-2 border-gray-900 ${cellPad} text-center font-bold ${isFS ? 'text-xl' : 'text-lg'} ${rankColW}`}>
                {allMatchesDone || stats[rowIdx].wins > 0 || stats[rowIdx].losses > 0
                  ? rankMap.get(rowIdx)
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderMatchProgress = () => (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-gray-600 mr-1">対戦順:</span>
        {matchOrder.map(([a, b], idx) => {
          const match = findMatch(a, b);
          const isDone =
            match && (match.status === 'finished' || match.status === 'walkover');
          const isPlaying = match?.status === 'playing';
          const isCurrent = idx === currentMatchIdx;

          return (
            <span
              key={idx}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                isDone
                  ? 'bg-primary-100 text-primary-700'
                  : isPlaying
                    ? 'bg-green-100 text-green-700 animate-pulse'
                    : isCurrent
                      ? 'bg-yellow-200 text-yellow-800 font-bold league-match-blink'
                      : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isCurrent && <span className="text-yellow-600 mr-0.5">▶</span>}
              <span className={isDone ? 'line-through' : ''}>
                {toCircledNum(a + 1)}-{toCircledNum(b + 1)}
              </span>
              {isDone && <span className="ml-0.5 text-primary-500">✓</span>}
            </span>
          );
        })}
      </div>
      {allMatchesDone && (
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-bold">
            🏆 全試合完了
          </span>
        </div>
      )}
      {!allMatchesDone && currentMatchIdx >= 0 && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">
            現在: 第{currentMatchIdx + 1}試合（
            {toCircledNum(matchOrder[currentMatchIdx][0] + 1)}{players[matchOrder[currentMatchIdx][0]].name}
            {' vs '}
            {toCircledNum(matchOrder[currentMatchIdx][1] + 1)}{players[matchOrder[currentMatchIdx][1]].name}
            ）
          </span>
          <span className="ml-2 text-gray-400">
            {currentMatchIdx}/{matchOrder.length} 完了
          </span>
        </div>
      )}
    </div>
  );

  // --- Render ---
  return (
    <div className="overflow-auto p-2 sm:p-4 md:p-6" style={{ width: '100%', height: '100%' }}>
      <style>{`
        @keyframes league-match-highlight {
          0%, 100% { background-color: rgba(253, 224, 71, 0.25); }
          50% { background-color: rgba(253, 224, 71, 0.65); }
        }
        .league-match-blink {
          animation: league-match-highlight 1.5s ease-in-out infinite;
        }
      `}</style>

      <div className="inline-block min-w-full">
        {/* スマホ用 全試合モードボタン */}
        <div className="flex items-center justify-end mb-2 sm:hidden">
          <button
            onClick={handleFullscreen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:scale-95 transition-all shadow-sm"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            全試合モード
          </button>
        </div>

        {/* リーグ表 */}
        {renderTable()}

        {/* 対戦順・進行状況 */}
        {renderMatchProgress()}
      </div>

      {/* フルスクリーンモード（ポータル） */}
      {isFullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[90] bg-white flex flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white shrink-0">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                {leagueName} - 全試合モード
              </h2>
              {gameRuleText && (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded hidden sm:inline">
                  {gameRuleText}
                </span>
              )}
              <button
                onClick={handleExitFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* テーブル */}
            <div className="flex-1 overflow-auto p-3">
              <div className="inline-block min-w-full">
                {renderTable(true)}
                {renderMatchProgress()}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
