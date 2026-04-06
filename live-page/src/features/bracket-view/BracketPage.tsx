/**
 * L-04 決勝トーナメントブラケット
 * SVG/CSSグリッドでブラケットを描画
 */
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import {
  useTournament,
  useEvents,
  useMatches,
  useDraw,
} from '../../lib/useFirestore';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LastUpdated from '../../components/ui/LastUpdated';

interface BracketNode {
  match: {
    matchId: string;
    round: number;
    position: number;
    player1Name: string;
    player2Name: string;
    player1Affiliation: string;
    player2Affiliation: string;
    score: string;
    status: string;
    winnerEntryId: string | null;
    player1EntryId: string | null;
    player2EntryId: string | null;
  } | null;
  round: number;
  position: number;
}

export default function BracketPage() {
  const { id, eventId } = useParams<{ id: string; eventId: string }>();
  const { data: tournament } = useTournament(id);
  const { data: events } = useEvents(id);
  const { data: matches, loading: mLoading } = useMatches(eventId);
  const { data: draw, loading: dLoading } = useDraw(eventId);

  const event = events.find((e) => e.eventId === eventId);
  const loading = mLoading || dLoading;

  // ラウンド数を計算
  const maxRound = useMemo(() => {
    if (matches.length === 0) return 0;
    return Math.max(...matches.map((m) => m.round));
  }, [matches]);

  // ラウンド別にグループ化
  const roundGroups = useMemo(() => {
    const groups = new Map<number, typeof matches>();
    for (const m of matches) {
      if (!groups.has(m.round)) groups.set(m.round, []);
      groups.get(m.round)!.push(m);
    }
    // 各ラウンド内をposition順にソート
    for (const [, arr] of groups) {
      arr.sort((a, b) => a.position - b.position);
    }
    return groups;
  }, [matches]);

  // ラウンドラベル
  function roundLabel(round: number): string {
    if (round === maxRound) return '決勝';
    if (round === maxRound - 1) return '準決勝';
    if (round === maxRound - 2) return '準々決勝';
    return `${round}回戦`;
  }

  if (loading) return <LoadingSpinner />;

  const drawSize = draw?.drawSize || 0;
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  return (
    <div className="max-w-full mx-auto px-4 py-6">
      <Link to={`/live/tournament/${id}`} className="text-xs text-gray-500 hover:text-gray-300">
        &larr; {tournament?.name || '大会'} に戻る
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          {event?.name || 'トーナメント'}
        </h1>
        <div className="flex items-center gap-3">
          {drawSize > 0 && (
            <span className="text-xs text-gray-400">ドローサイズ: {drawSize}</span>
          )}
          <LastUpdated />
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="text-center text-gray-500 py-10">トーナメントデータがありません</p>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div
            className="flex gap-4"
            style={{ minWidth: `${rounds.length * 220}px` }}
          >
            {rounds.map((round) => {
              const roundMatches = roundGroups.get(round) || [];
              return (
                <div key={round} className="flex-1 min-w-[200px]">
                  {/* ラウンドヘッダー */}
                  <div className="text-center mb-3">
                    <span className="text-xs font-medium text-gray-400 bg-white/5 px-3 py-1 rounded-full">
                      {roundLabel(round)}
                    </span>
                  </div>

                  {/* 試合カード */}
                  <div
                    className="flex flex-col justify-around h-full gap-2"
                    style={{
                      paddingTop: `${Math.pow(2, round - 1) * 8 - 8}px`,
                      gap: `${Math.pow(2, round - 1) * 16}px`,
                    }}
                  >
                    {roundMatches.map((match) => {
                      const isPlaying = match.status === 'playing';
                      const isFinished =
                        match.status === 'finished' || match.status === 'walkover';
                      const p1Won = match.winnerEntryId === match.player1EntryId;
                      const p2Won = match.winnerEntryId === match.player2EntryId;

                      return (
                        <div
                          key={match.matchId}
                          className={`rounded-lg border overflow-hidden text-xs ${
                            isPlaying
                              ? 'match-playing border-orange-500/50'
                              : isFinished
                                ? 'border-white/10 opacity-80'
                                : 'border-white/10'
                          }`}
                        >
                          {/* Player 1 */}
                          <div
                            className={`flex items-center justify-between px-2 py-1.5 ${
                              isFinished && p1Won
                                ? 'bg-emerald-500/10'
                                : isFinished && !p1Won
                                  ? 'bg-white/3 text-gray-500'
                                  : 'bg-white/5'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className={`truncate block ${p1Won ? 'font-semibold text-emerald-300' : ''}`}>
                                {match.player1Name || 'TBD'}
                              </span>
                            </div>
                            {isFinished && match.score && (
                              <span className="font-mono text-amber-300 ml-2 shrink-0">
                                {match.score.split(/\s+/).map((s) => s.split('-')[0]).join(' ')}
                              </span>
                            )}
                          </div>

                          {/* 区切り線 */}
                          <div className="border-t border-white/10 flex items-center justify-between px-2">
                            {isPlaying && (
                              <span className="text-[9px] text-orange-400 py-0.5">LIVE</span>
                            )}
                            {isFinished && match.score && (
                              <span className="text-[9px] text-gray-500 py-0.5 mx-auto">
                                {match.score}
                              </span>
                            )}
                          </div>

                          {/* Player 2 */}
                          <div
                            className={`flex items-center justify-between px-2 py-1.5 ${
                              isFinished && p2Won
                                ? 'bg-emerald-500/10'
                                : isFinished && !p2Won
                                  ? 'bg-white/3 text-gray-500'
                                  : 'bg-white/5'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className={`truncate block ${p2Won ? 'font-semibold text-emerald-300' : ''}`}>
                                {match.player2Name || 'TBD'}
                              </span>
                            </div>
                            {isFinished && match.score && (
                              <span className="font-mono text-amber-300 ml-2 shrink-0">
                                {match.score.split(/\s+/).map((s) => s.split('-')[1]?.replace(/[()]/, '') || '').join(' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
