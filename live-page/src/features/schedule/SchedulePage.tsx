/**
 * L-02 タイムテーブル
 * 時刻 x コートのグリッドで試合予定を表示
 */
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import {
  useTournament,
  useEvents,
  useAllMatches,
  useCourts,
} from '../../lib/useFirestore';
import { statusLabel } from '../../lib/utils';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import LastUpdated from '../../components/ui/LastUpdated';

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const { data: tournament, loading: tLoading } = useTournament(id);
  const { data: events } = useEvents(id);
  const { data: courts, loading: cLoading } = useCourts(id);
  const eventIds = useMemo(() => events.map((e) => e.eventId), [events]);
  const { data: allMatches, loading: mLoading } = useAllMatches(eventIds);
  const [courtFilter, setCourtFilter] = useState<string | null>(null);

  const loading = tLoading || cLoading || mLoading;

  // 時刻でグループ化
  const scheduledMatches = useMemo(() => {
    return allMatches
      .filter((m) => m.scheduledTime)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
  }, [allMatches]);

  // 時刻一覧
  const timeSlots = useMemo(() => {
    const set = new Set(scheduledMatches.map((m) => m.scheduledTime!));
    return Array.from(set).sort();
  }, [scheduledMatches]);

  // コート一覧
  const sortedCourts = useMemo(() => {
    return [...courts].sort((a, b) => a.order - b.order);
  }, [courts]);

  const filteredCourts = courtFilter
    ? sortedCourts.filter((c) => c.courtId === courtFilter)
    : sortedCourts;

  // 現在時刻に近い時刻を判定
  const nowTime = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  if (loading) return <LoadingSpinner />;

  // イベント名マップ
  const eventNameMap = new Map(events.map((e) => [e.eventId, e.name]));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link to={`/live/tournament/${id}`} className="text-xs text-gray-500 hover:text-gray-300">
        &larr; {tournament?.name || '大会'} に戻る
      </Link>
      <div className="flex items-center justify-between mt-2 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          タイムテーブル
        </h1>
        <LastUpdated />
      </div>

      {/* コートフィルタ */}
      {sortedCourts.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setCourtFilter(null)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${
              !courtFilter
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            全コート
          </button>
          {sortedCourts.map((c) => (
            <button
              key={c.courtId}
              onClick={() => setCourtFilter(c.courtId)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${
                courtFilter === c.courtId
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {scheduledMatches.length === 0 ? (
        <p className="text-center text-gray-500 py-10">タイムテーブルが登録されていません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-gray-400 font-medium w-16">時刻</th>
                {filteredCourts.map((c) => (
                  <th key={c.courtId} className="text-center py-2 px-3 text-gray-400 font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((time) => {
                const isNear =
                  time >= nowTime &&
                  time <= `${String(Number(nowTime.split(':')[0])).padStart(2, '0')}:${String(Number(nowTime.split(':')[1]) + 30).padStart(2, '0')}`;
                return (
                  <tr
                    key={time}
                    className={`border-b border-white/5 ${isNear ? 'bg-orange-500/10' : ''}`}
                  >
                    <td className="py-2 px-3 font-mono text-gray-300 whitespace-nowrap">
                      {time}
                    </td>
                    {filteredCourts.map((court) => {
                      const match = scheduledMatches.find(
                        (m) => m.scheduledTime === time && m.courtId === court.courtId,
                      );
                      if (!match) {
                        return <td key={court.courtId} className="py-2 px-3 text-gray-600">-</td>;
                      }
                      return (
                        <td key={court.courtId} className="py-2 px-3">
                          <div
                            className={`rounded-lg p-2 ${
                              match.status === 'playing'
                                ? 'bg-orange-500/15 border border-orange-500/30'
                                : match.status === 'finished' || match.status === 'walkover'
                                  ? 'bg-white/5 opacity-60'
                                  : 'bg-white/5'
                            }`}
                          >
                            <div className="text-xs text-gray-500 truncate">
                              {eventNameMap.get(match.eventId) || ''}
                            </div>
                            <div className="font-medium text-xs mt-0.5 truncate">
                              {match.player1Name || 'TBD'}
                            </div>
                            <div className="text-xs text-gray-400">vs</div>
                            <div className="font-medium text-xs truncate">
                              {match.player2Name || 'TBD'}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <StatusBadge status={match.status} />
                              {match.score && (
                                <span className="text-xs font-mono text-amber-300">
                                  {match.score}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
