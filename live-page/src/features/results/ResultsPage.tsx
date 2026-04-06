/**
 * 結果ページ
 */
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy, Medal } from 'lucide-react';
import { useTournamentSnapshot } from '../../lib/useFirestore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LastUpdated from '../../components/ui/LastUpdated';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { snapshot, loading } = useTournamentSnapshot(id);

  const tournament = snapshot?.tournament;
  const events = snapshot?.events || [];
  const allMatches = snapshot?.matches || [];

  const results = useMemo(() =>
    events.map((event) => {
      const matches = allMatches.filter((m) => m.eventId === event.eventId);
      const total = matches.length;
      const finished = matches.filter((m) => m.status === 'finished' || m.status === 'walkover').length;
      const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;
      const finalMatch = matches.find((m) => m.round === maxRound && m.status === 'finished');

      let champion: string | null = null, championAff = '', runnerUp: string | null = null, runnerUpAff = '', finalScore = '';
      if (finalMatch) {
        if (finalMatch.winnerEntryId === finalMatch.player1EntryId) {
          champion = finalMatch.player1Name; championAff = finalMatch.player1Affiliation;
          runnerUp = finalMatch.player2Name; runnerUpAff = finalMatch.player2Affiliation;
        } else {
          champion = finalMatch.player2Name; championAff = finalMatch.player2Affiliation;
          runnerUp = finalMatch.player1Name; runnerUpAff = finalMatch.player1Affiliation;
        }
        finalScore = finalMatch.score;
      }
      return { eventId: event.eventId, eventName: event.name, champion, championAff, runnerUp, runnerUpAff, finalScore, total, finished };
    }),
    [events, allMatches],
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link to={`/live/tournament/${id}`} className="text-xs text-gray-500 hover:text-gray-300">
        &larr; {tournament?.name || '大会'} に戻る
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          大会結果
        </h1>
        <LastUpdated />
      </div>

      {results.length === 0 ? (
        <p className="text-center text-gray-500 py-10">結果データがありません</p>
      ) : (
        <div className="space-y-6">
          {results.map((r) => (
            <div key={r.eventId} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="bg-white/5 px-4 py-3 border-b border-white/10">
                <h2 className="font-semibold">{r.eventName}</h2>
                <span className="text-xs text-gray-400">{r.finished}/{r.total}試合完了</span>
              </div>
              <div className="p-4">
                {r.champion ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Trophy className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <div className="text-xs text-amber-400 font-medium">優勝</div>
                        <div className="font-semibold text-lg">{r.champion}</div>
                        <div className="text-xs text-gray-400">{r.championAff}</div>
                      </div>
                    </div>
                    {r.runnerUp && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center shrink-0">
                          <Medal className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 font-medium">準優勝</div>
                          <div className="font-medium">{r.runnerUp}</div>
                          <div className="text-xs text-gray-500">{r.runnerUpAff}</div>
                        </div>
                      </div>
                    )}
                    {r.finalScore && (
                      <div className="mt-2 text-sm text-gray-400">
                        決勝: <span className="font-mono text-amber-300">{r.finalScore}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 py-2">
                    {r.total > 0 ? '大会進行中...' : '試合データなし'}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
