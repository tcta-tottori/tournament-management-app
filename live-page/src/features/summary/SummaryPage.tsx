/**
 * L-01 トップ / 大会サマリー
 * 直近の大会一覧・進行ステータスを表示
 */
import { Link } from 'react-router-dom';
import { Trophy, Calendar, MapPin } from 'lucide-react';
import { useTournaments } from '../../lib/useFirestore';
import { formatDate } from '../../lib/utils';
import LastUpdated from '../../components/ui/LastUpdated';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function SummaryPage() {
  const { data: tournaments, loading } = useTournaments();

  // 日付の新しい順にソート
  const sorted = [...tournaments].sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
          鳥取市テニス協会
        </h1>
        <p className="text-lg text-gray-300 mt-1">大会ライブ情報</p>
        <div className="mt-2">
          <LastUpdated />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">現在公開中の大会はありません</p>
          <p className="text-sm text-gray-500 mt-1">大会開催時に情報が表示されます</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((t) => (
            <Link
              key={t.tournamentId}
              to={`/live/tournament/${t.tournamentId}`}
              className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-5"
            >
              <h2 className="text-lg font-semibold text-amber-300">{t.name}</h2>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(t.date)}
                </span>
                {t.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {t.venue}
                  </span>
                )}
              </div>
              {t.reserveDate && (
                <p className="text-xs text-gray-500 mt-1">
                  予備日: {formatDate(t.reserveDate)} {t.reserveVenue && `/ ${t.reserveVenue}`}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
