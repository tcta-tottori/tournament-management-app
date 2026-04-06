/**
 * 大会トップ — 種目一覧・各ページへのリンク
 */
import { useParams, Link } from 'react-router-dom';
import {
  Calendar, MapPin, ListOrdered, BarChart2,
  Grid3X3, Trophy, Clock,
} from 'lucide-react';
import { useTournamentSnapshot } from '../../lib/useFirestore';
import { formatDate } from '../../lib/utils';
import LastUpdated from '../../components/ui/LastUpdated';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useMemo } from 'react';

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { snapshot, loading } = useTournamentSnapshot(id);

  const tournament = snapshot?.tournament;
  const events = snapshot?.events || [];
  const allMatches = snapshot?.matches || [];

  const eventStats = useMemo(() =>
    events.map((event) => {
      const matches = allMatches.filter((m) => m.eventId === event.eventId);
      const total = matches.length;
      const finished = matches.filter(
        (m) => m.status === 'finished' || m.status === 'walkover',
      ).length;
      const playing = matches.filter((m) => m.status === 'playing').length;

      let phase = '開始前';
      if (total > 0 && finished === total) phase = '終了';
      else if (playing > 0) phase = '試合中';
      else if (finished > 0) phase = '進行中';

      return { event, total, finished, playing, phase };
    }),
    [events, allMatches],
  );

  if (loading) return <LoadingSpinner />;
  if (!tournament) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>大会が見つかりません</p>
        <Link to="/live/" className="text-amber-400 underline mt-2 inline-block">
          トップに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link to="/live/" className="text-xs text-gray-500 hover:text-gray-300">
          &larr; 大会一覧に戻る
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-amber-300 mt-2">
          {tournament.name}
        </h1>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDate(tournament.date)}
          </span>
          {tournament.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {tournament.venue}
            </span>
          )}
        </div>
        <div className="mt-2">
          <LastUpdated />
        </div>
      </div>

      {/* クイックリンク */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Link
          to={`/live/tournament/${id}/live`}
          className="flex flex-col items-center gap-1 py-4 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-colors text-orange-300"
        >
          <BarChart2 className="w-6 h-6" />
          <span className="text-xs font-medium">ライブスコア</span>
        </Link>
        <Link
          to={`/live/tournament/${id}/schedule`}
          className="flex flex-col items-center gap-1 py-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-blue-300"
        >
          <Clock className="w-6 h-6" />
          <span className="text-xs font-medium">タイムテーブル</span>
        </Link>
        <Link
          to={`/live/tournament/${id}/results`}
          className="flex flex-col items-center gap-1 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors text-emerald-300"
        >
          <Trophy className="w-6 h-6" />
          <span className="text-xs font-medium">結果</span>
        </Link>
        <Link
          to={`/live/tournament/${id}/schedule`}
          className="flex flex-col items-center gap-1 py-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors text-purple-300"
        >
          <Grid3X3 className="w-6 h-6" />
          <span className="text-xs font-medium">ドロー</span>
        </Link>
      </div>

      {/* 種目一覧 */}
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <ListOrdered className="w-5 h-5 text-amber-400" />
        種目一覧
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">種目情報がまだ登録されていません</p>
      ) : (
        <div className="space-y-3">
          {eventStats.map(({ event, total, finished, playing, phase }) => (
            <div
              key={event.eventId}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{event.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    phase === '終了'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : phase === '試合中'
                        ? 'bg-orange-500/20 text-orange-400'
                        : phase === '進行中'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {phase}
                </span>
              </div>
              {total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{finished}/{total}試合完了</span>
                    {playing > 0 && (
                      <span className="text-orange-400">{playing}試合進行中</span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${(finished / total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <Link
                  to={`/live/tournament/${id}/draw/${event.eventId}`}
                  className="text-xs text-amber-400 hover:underline"
                >
                  ドロー表
                </Link>
                <Link
                  to={`/live/tournament/${id}/league/${event.eventId}`}
                  className="text-xs text-amber-400 hover:underline"
                >
                  予選リーグ
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
