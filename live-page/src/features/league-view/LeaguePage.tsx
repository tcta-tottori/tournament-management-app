/**
 * L-03 予選リーグ表
 */
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Grid3X3 } from 'lucide-react';
import { useTournamentSnapshot } from '../../lib/useFirestore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LastUpdated from '../../components/ui/LastUpdated';

interface PlayerRecord {
  entryId: string;
  name: string;
  affiliation: string;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  results: Map<string, { score: string; won: boolean }>;
}

export default function LeaguePage() {
  const { id, eventId } = useParams<{ id: string; eventId: string }>();
  const { snapshot, loading } = useTournamentSnapshot(id);

  const tournament = snapshot?.tournament;
  const events = snapshot?.events || [];
  const allMatches = snapshot?.matches || [];

  const event = events.find((e) => e.eventId === eventId);
  const matches = useMemo(
    () => allMatches.filter((m) => m.eventId === eventId),
    [allMatches, eventId],
  );

  const entryNameMap = useMemo(() => {
    const map = new Map<string, { name: string; affiliation: string }>();
    for (const m of matches) {
      if (m.player1EntryId) map.set(m.player1EntryId, { name: m.player1Name, affiliation: m.player1Affiliation });
      if (m.player2EntryId) map.set(m.player2EntryId, { name: m.player2Name, affiliation: m.player2Affiliation });
    }
    return map;
  }, [matches]);

  const standings = useMemo(() => {
    const records = new Map<string, PlayerRecord>();
    for (const [entryId, info] of entryNameMap) {
      records.set(entryId, {
        entryId, name: info.name, affiliation: info.affiliation,
        wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, results: new Map(),
      });
    }
    for (const match of matches) {
      if (match.status !== 'finished' && match.status !== 'walkover') continue;
      if (!match.player1EntryId || !match.player2EntryId) continue;
      const p1 = records.get(match.player1EntryId);
      const p2 = records.get(match.player2EntryId);
      if (!p1 || !p2) continue;
      const p1Won = match.winnerEntryId === match.player1EntryId;
      if (p1Won) { p1.wins++; p2.losses++; } else { p2.wins++; p1.losses++; }
      const scoreParts = match.score.split(/\s+/);
      for (const part of scoreParts) {
        const m = part.match(/^(\d+)-(\d+)/);
        if (m) {
          p1.gamesWon += parseInt(m[1]); p1.gamesLost += parseInt(m[2]);
          p2.gamesWon += parseInt(m[2]); p2.gamesLost += parseInt(m[1]);
        }
      }
      p1.results.set(match.player2EntryId, { score: match.score, won: p1Won });
      p2.results.set(match.player1EntryId, {
        score: match.score.split(/\s+/).map((s) => {
          const m = s.match(/^(\d+)-(\d+)(.*)/);
          return m ? `${m[2]}-${m[1]}${m[3] || ''}` : s;
        }).join(' '),
        won: !p1Won,
      });
    }
    return Array.from(records.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aR = a.gamesLost === 0 ? Infinity : a.gamesWon / a.gamesLost;
      const bR = b.gamesLost === 0 ? Infinity : b.gamesWon / b.gamesLost;
      return bR - aR;
    });
  }, [matches, entryNameMap]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link to={`/live/tournament/${id}`} className="text-xs text-gray-500 hover:text-gray-300">
        &larr; {tournament?.name || '大会'} に戻る
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-purple-400" />
          {event?.name || '予選リーグ'}
        </h1>
        <LastUpdated />
      </div>

      {standings.length === 0 ? (
        <p className="text-center text-gray-500 py-10">リーグデータがありません</p>
      ) : (
        <>
          {/* 順位表 */}
          <div className="rounded-xl border border-white/10 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="py-2 px-3 text-left font-medium text-gray-400 w-10">#</th>
                  <th className="py-2 px-3 text-left font-medium text-gray-400">選手</th>
                  <th className="py-2 px-3 text-center font-medium text-gray-400 w-12">勝</th>
                  <th className="py-2 px-3 text-center font-medium text-gray-400 w-12">敗</th>
                  <th className="py-2 px-3 text-center font-medium text-gray-400 w-20">得失G</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((p, i) => (
                  <tr key={p.entryId} className="border-b border-white/5">
                    <td className="py-2 px-3 font-medium text-amber-300">{i + 1}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.affiliation}</div>
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400 font-medium">{p.wins}</td>
                    <td className="py-2 px-3 text-center text-red-400 font-medium">{p.losses}</td>
                    <td className="py-2 px-3 text-center font-mono text-xs">{p.gamesWon}-{p.gamesLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 対戦マトリクス */}
          <h2 className="text-lg font-semibold mb-3">対戦表</h2>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="py-1 px-2 border border-white/10 bg-white/5" />
                  {standings.map((p) => (
                    <th key={p.entryId} className="py-1 px-2 border border-white/10 bg-white/5 font-medium min-w-[80px]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => (
                  <tr key={row.entryId}>
                    <td className="py-1 px-2 border border-white/10 bg-white/5 font-medium whitespace-nowrap">{row.name}</td>
                    {standings.map((col) => {
                      if (row.entryId === col.entryId) {
                        return <td key={col.entryId} className="py-1 px-2 border border-white/10 bg-white/3 text-center">-</td>;
                      }
                      const result = row.results.get(col.entryId);
                      return (
                        <td key={col.entryId} className={`py-1 px-2 border border-white/10 text-center font-mono ${
                          result?.won ? 'bg-emerald-500/10 text-emerald-300' : result ? 'bg-red-500/10 text-red-300' : ''
                        }`}>
                          {result ? result.score : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
