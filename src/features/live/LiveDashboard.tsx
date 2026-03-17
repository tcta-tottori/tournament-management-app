import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { BarChart2, Play, CheckCircle, Clock, Trophy, Users } from 'lucide-react';

export default function LiveDashboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  const tournaments = useLiveQuery(() => db.tournaments.toArray()) || [];
  const currentTournament = useMemo(
    () => tournaments.find(t => t.tournamentId === currentTournamentId),
    [tournaments, currentTournamentId]
  );

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // eventIdsを安定化してallMatchesの不必要な再取得を防止
  const eventIds = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const stats = useMemo(() => {
    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'walkover');
    const waiting = allMatches.filter(m => m.status === 'waiting' || m.status === 'ready');
    const total = allMatches.length;
    const progressPercent = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    return { playing, finished, waiting, total, progressPercent };
  }, [allMatches]);

  const courtStatus = useMemo(() => {
    return courts.map(c => {
      const currentMatch = allMatches.find(m => m.courtId === c.courtId && m.status === 'playing');
      const nextMatch = allMatches.find(m => m.courtId === c.courtId && (m.status === 'ready' || m.status === 'waiting') && m.player1Name && m.player2Name);
      return { court: c, currentMatch, nextMatch };
    }).sort((a, b) => a.court.order - b.court.order);
  }, [courts, allMatches]);

  const eventProgress = useMemo(() => {
    return events.map(e => {
      const eventMatches = allMatches.filter(m => m.eventId === e.eventId);
      const finished = eventMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
      const total = eventMatches.length;
      const playing = eventMatches.filter(m => m.status === 'playing').length;
      return { event: e, finished, total, playing, percent: total > 0 ? Math.round((finished / total) * 100) : 0 };
    });
  }, [events, allMatches]);

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-[#2e7d32]" />
          ライブダッシュボード
        </h1>
        <p className="text-sm text-[#6b7280] mt-1">
          {currentTournament ? currentTournament.name : '大会を選択してください'} - 全体の進行状況をリアルタイムで確認できます
        </p>
      </header>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-[#6b7280] text-xs mb-1">
            <Users className="w-3.5 h-3.5" /> 全試合数
          </div>
          <p className="text-2xl font-bold text-[#111827]">{stats.total}</p>
        </div>
        <div className="bg-white rounded-[10px] shadow-sm border border-[#16a34a]/30 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-[#16a34a] text-xs mb-1">
            <Play className="w-3.5 h-3.5" /> 試合中
          </div>
          <p className="text-2xl font-bold text-[#16a34a]">{stats.playing.length}</p>
        </div>
        <div className="bg-white rounded-[10px] shadow-sm border border-[#2e7d32]/30 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-[#2e7d32] text-xs mb-1">
            <CheckCircle className="w-3.5 h-3.5" /> 終了
          </div>
          <p className="text-2xl font-bold text-[#1b5e20]">{stats.finished.length}</p>
        </div>
        <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-[#6b7280] text-xs mb-1">
            <Clock className="w-3.5 h-3.5" /> 待機中
          </div>
          <p className="text-2xl font-bold text-[#111827]">{stats.waiting.length}</p>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-[#111827]">全体進捗</span>
          <span className="text-sm font-mono text-[#6b7280]">{stats.progressPercent}%</span>
        </div>
        <div className="w-full bg-[#e0e7ef] rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{
              width: `${stats.progressPercent}%`,
              background: 'linear-gradient(135deg, #2e7d32, #1b5e20)',
            }}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* コート状況 */}
        <div className="lg:flex-1 overflow-auto">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wider mb-3">コート状況</h2>
          {courtStatus.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {courtStatus.map(({ court, currentMatch, nextMatch }) => (
                <div
                  key={court.courtId}
                  className={`rounded-[10px] shadow-sm border-2 p-4 ${
                    currentMatch ? 'border-[#16a34a]/40 bg-green-50/50' :
                    !court.isAvailable ? 'border-red-200 bg-red-50/30 opacity-60' :
                    'border-[#e0e7ef] bg-white'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-[#111827]">{court.name}</h3>
                  </div>
                  {currentMatch ? (
                    <div>
                      <div className="text-xs text-[#16a34a] font-medium mb-1 flex items-center gap-1">
                        <Play className="w-3 h-3" /> 試合中
                      </div>
                      <p className="text-sm font-medium whitespace-nowrap">{currentMatch.player1Name}</p>
                      <p className="text-xs text-[#6b7280] text-center">vs</p>
                      <p className="text-sm font-medium whitespace-nowrap">{currentMatch.player2Name}</p>
                    </div>
                  ) : (
                    <div className="text-sm text-[#6b7280]">
                      {court.isAvailable ? '空きコート' : '使用不可'}
                    </div>
                  )}
                  {nextMatch && !currentMatch && (
                    <div className="mt-2 pt-2 border-t border-[#e0e7ef]">
                      <p className="text-xs text-[#2e7d32] font-medium">次の試合:</p>
                      <p className="text-xs text-[#6b7280] truncate whitespace-nowrap">{nextMatch.player1Name} vs {nextMatch.player2Name}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[10px] border border-dashed border-[#e0e7ef] p-8 text-center text-[#6b7280]">
              <p>コートが未登録です (S-08で登録)</p>
            </div>
          )}
        </div>

        {/* 種目別進行 */}
        <div className="lg:w-80 shrink-0 overflow-auto">
          <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wider mb-3">種目別進行</h2>
          {eventProgress.length > 0 ? (
            <div className="space-y-3">
              {eventProgress.map(ep => (
                <div key={ep.event.eventId} className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-sm text-[#111827] truncate">{ep.event.name}</h3>
                    {ep.playing > 0 && (
                      <span className="text-xs bg-green-100 text-[#16a34a] px-1.5 py-0.5 rounded-full font-medium">
                        {ep.playing}試合中
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-[#6b7280] mb-1">
                    <span>{ep.finished} / {ep.total} 完了</span>
                    <span>{ep.percent}%</span>
                  </div>
                  <div className="w-full bg-[#e0e7ef] rounded-full h-2">
                    <div
                      className="bg-[#2e7d32] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${ep.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[10px] border border-dashed border-[#e0e7ef] p-8 text-center text-[#6b7280]">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">種目データがありません</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
