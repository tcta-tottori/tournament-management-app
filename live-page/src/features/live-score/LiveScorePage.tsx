/**
 * L-05 ライブスコア（全コートダッシュボード）
 */
import { useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BarChart2, Timer } from 'lucide-react';
import { useTournamentSnapshot } from '../../lib/useFirestore';
import { elapsedMinutes } from '../../lib/utils';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LastUpdated from '../../components/ui/LastUpdated';

export default function LiveScorePage() {
  const { id } = useParams<{ id: string }>();
  const { snapshot, loading, lastUpdated } = useTournamentSnapshot(id);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const tournament = snapshot?.tournament;
  const events = snapshot?.events || [];
  const allMatches = snapshot?.matches || [];
  const courts = snapshot?.courts || [];

  const eventNameMap = useMemo(
    () => new Map(events.map((e) => [e.eventId, e.name])),
    [events],
  );

  const sortedCourts = useMemo(
    () => [...courts].sort((a, b) => a.order - b.order),
    [courts],
  );

  const courtMatches = useMemo(() => {
    const map = new Map<string, { match: typeof allMatches[0] | null }>();
    for (const court of sortedCourts) {
      const playing = allMatches.find((m) => m.courtId === court.courtId && m.status === 'playing');
      if (playing) { map.set(court.courtId, { match: playing }); continue; }
      const ready = allMatches.find((m) => m.courtId === court.courtId && m.status === 'ready');
      if (ready) { map.set(court.courtId, { match: ready }); continue; }
      const finished = allMatches
        .filter((m) => m.courtId === court.courtId && (m.status === 'finished' || m.status === 'walkover'))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      map.set(court.courtId, { match: finished || null });
    }
    return map;
  }, [sortedCourts, allMatches]);

  const stats = useMemo(() => ({
    playing: allMatches.filter((m) => m.status === 'playing').length,
    finished: allMatches.filter((m) => m.status === 'finished' || m.status === 'walkover').length,
    total: allMatches.length,
  }), [allMatches]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link to={`/live/tournament/${id}`} className="text-xs text-gray-500 hover:text-gray-300">
        &larr; {tournament?.name || '大会'} に戻る
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-orange-400" />
          ライブスコア
        </h1>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-gray-500">
              データ更新: {lastUpdated.toLocaleTimeString('ja-JP')}
            </span>
          )}
          <LastUpdated />
        </div>
      </div>

      {/* 進行サマリー */}
      <div className="flex gap-4 mb-6 text-sm">
        <div className="flex-1 rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">{stats.playing}</div>
          <div className="text-xs text-gray-400">試合中</div>
        </div>
        <div className="flex-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{stats.finished}</div>
          <div className="text-xs text-gray-400">完了</div>
        </div>
        <div className="flex-1 rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-400">全試合</div>
        </div>
      </div>

      {/* コートカード */}
      {sortedCourts.length === 0 ? (
        <p className="text-center text-gray-500 py-10">コートデータがありません</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sortedCourts.map((court) => {
            const cm = courtMatches.get(court.courtId);
            const match = cm?.match;
            const isPlaying = match?.status === 'playing';
            const isFinished = match?.status === 'finished' || match?.status === 'walkover';
            const elapsed = match?.updatedAt && isPlaying ? elapsedMinutes(match.updatedAt) : null;

            return (
              <div
                key={court.courtId}
                className={`rounded-xl border p-4 ${
                  isPlaying ? 'match-playing border-orange-500/50 bg-orange-500/5'
                    : isFinished ? 'border-white/10 bg-white/3 opacity-70' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{court.name}</h3>
                  {match ? <StatusBadge status={match.status} /> : <span className="text-xs text-gray-500">待機中</span>}
                </div>

                {match ? (
                  <>
                    <div className="text-[10px] text-gray-500 mb-2">{eventNameMap.get(match.eventId) || ''}</div>
                    <div className="space-y-2">
                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                        isFinished && match.winnerEntryId === match.player1EntryId ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5'
                      }`}>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{match.player1Name || 'TBD'}</div>
                          <div className="text-[10px] text-gray-500 truncate">{match.player1Affiliation}</div>
                        </div>
                        {isFinished && match.winnerEntryId === match.player1EntryId && (
                          <span className="text-emerald-400 text-xs font-medium ml-2">WIN</span>
                        )}
                      </div>
                      <div className="text-center text-xs text-gray-500">vs</div>
                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                        isFinished && match.winnerEntryId === match.player2EntryId ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5'
                      }`}>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{match.player2Name || 'TBD'}</div>
                          <div className="text-[10px] text-gray-500 truncate">{match.player2Affiliation}</div>
                        </div>
                        {isFinished && match.winnerEntryId === match.player2EntryId && (
                          <span className="text-emerald-400 text-xs font-medium ml-2">WIN</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                      {match.score ? (
                        <span className="font-mono text-sm text-amber-300">{match.score}</span>
                      ) : (
                        <span className="text-xs text-gray-500">スコア未入力</span>
                      )}
                      {elapsed !== null && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Timer className="w-3 h-3" />{elapsed}分経過
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-gray-600"><p className="text-sm">試合なし</p></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
