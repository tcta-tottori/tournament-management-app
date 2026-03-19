import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { Match, Court } from '../../db/database';
import { BarChart2, Play, CheckCircle, Clock, Trophy, Users, MapPin, AlertCircle } from 'lucide-react';

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

type CourtStatus = {
  court: Court;
  currentMatch: Match | null;
  nextMatch: Match | null;
  matchCount: number;
  status: 'empty' | 'playing' | 'ready' | 'unavailable';
};

export default function LiveDashboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);

  const tournaments = useLiveQuery(() => db.tournaments.toArray()) || [];
  const currentTournament = useMemo(
    () => tournaments.find(t => t.tournamentId === currentTournamentId),
    [tournaments, currentTournamentId]
  );

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

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

  const draws = useLiveQuery(
    () => {
      const ids = eventIds.split(',').filter(Boolean);
      if (ids.length === 0) return [];
      return db.draws.where('eventId').anyOf(ids).toArray();
    },
    [eventIds]
  ) || [];

  const stats = useMemo(() => {
    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'walkover');
    const waiting = allMatches.filter(m => m.status === 'waiting' || m.status === 'ready');
    const total = allMatches.length;
    const progressPercent = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    return { playing, finished, waiting, total, progressPercent };
  }, [allMatches]);

  // 登録済みコートのステータスマップ（order順）
  const courtStatusList = useMemo((): CourtStatus[] => {
    return courts
      .sort((a, b) => a.order - b.order)
      .map(court => {
        const courtMatches = allMatches.filter(m => m.courtId === court.courtId);
        const currentMatch = courtMatches.find(m => m.status === 'playing') || null;
        const nextMatch = courtMatches.find(m =>
          (m.status === 'ready' || m.status === 'waiting') && m.player1Name && m.player2Name
        ) || null;

        let status: CourtStatus['status'] = 'empty';
        if (!court.isAvailable) status = 'unavailable';
        else if (currentMatch) status = 'playing';
        else if (nextMatch) status = 'ready';

        return { court, currentMatch, nextMatch, matchCount: courtMatches.length, status };
      });
  }, [courts, allMatches]);

  // コートマップの統計
  const courtStats = useMemo(() => ({
    playing: courtStatusList.filter(c => c.status === 'playing').length,
    ready: courtStatusList.filter(c => c.status === 'ready').length,
    empty: courtStatusList.filter(c => c.status === 'empty').length,
    unavailable: courtStatusList.filter(c => c.status === 'unavailable').length,
  }), [courtStatusList]);

  const eventProgress = useMemo(() => {
    return events.map(e => {
      const eventMatches = allMatches.filter(m => m.eventId === e.eventId);
      const finished = eventMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
      const total = eventMatches.length;
      const playing = eventMatches.filter(m => m.status === 'playing').length;
      const draw = draws.find(d => d.eventId === e.eventId);
      const totalRounds = draw ? Math.log2(draw.drawSize) : 1;
      // 現在の最大進行ラウンド
      const maxRound = eventMatches.reduce((max, m) =>
        (m.status === 'finished' || m.status === 'playing') && m.round > max ? m.round : max, 0);
      const roundName = maxRound > 0 ? getRoundName(maxRound, totalRounds) : '-';
      return { event: e, finished, total, playing, percent: total > 0 ? Math.round((finished / total) * 100) : 0, roundName };
    });
  }, [events, allMatches, draws]);

  const selectedDetail = useMemo(() => {
    if (!selectedCourtId) return null;
    return courtStatusList.find(c => c.court.courtId === selectedCourtId) || null;
  }, [selectedCourtId, courtStatusList]);

  const selectedCourtMatches = useMemo(() => {
    if (!selectedDetail) return [];
    return allMatches
      .filter(m => m.courtId === selectedDetail.court.courtId)
      .sort((a, b) => a.matchOrder - b.matchOrder);
  }, [selectedDetail, allMatches]);

  const getEventName = (eventId: string) => events.find(e => e.eventId === eventId)?.name || '';

  const statusStyles: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    playing: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', glow: 'shadow-[0_0_12px_rgba(22,163,74,0.3)]' },
    ready: { bg: 'bg-blue-50', border: 'border-primary-500', text: 'text-primary-500', glow: '' },
    empty: { bg: 'bg-white', border: 'border-border-main', text: 'text-gray-500', glow: '' },
    unavailable: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-400', glow: '' },
  };
  const statusLabel: Record<string, string> = {
    playing: '試合中', ready: '次の試合あり', empty: '空き', unavailable: '使用不可',
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-primary-500" />
          ライブダッシュボード
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {currentTournament ? currentTournament.name : '大会を選択してください'} - 進行状況・コートマップ
        </p>
      </header>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
            <Users className="w-3.5 h-3.5" /> 全試合数
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-green-600/30 p-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
            <Play className="w-3.5 h-3.5" /> 試合中
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.playing.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-primary-500/30 p-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-primary-500 text-xs mb-1">
            <CheckCircle className="w-3.5 h-3.5" /> 終了
          </div>
          <p className="text-2xl font-bold text-primary-600">{stats.finished.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-3 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
            <Clock className="w-3.5 h-3.5" /> 待機中
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.waiting.length}</p>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-gray-900">全体進捗</span>
          <span className="text-sm font-mono text-gray-500">{stats.progressPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-br from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </div>

      {/* コートマップ（登録コートのみ・横スクロール） */}
      {courtStatusList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              コートマップ
            </h2>
            <div className="flex gap-3 text-xs flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                試合中 {courtStats.playing}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                準備 {courtStats.ready}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-300" />
                空き {courtStats.empty}
              </span>
              {courtStats.unavailable > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  不可 {courtStats.unavailable}
                </span>
              )}
            </div>
          </div>

          {/* 横スクロールで1行表示 */}
          <div className="overflow-x-auto -mx-1 px-1 pb-2">
            <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
              {courtStatusList.map(cs => {
                const style = statusStyles[cs.status];
                const isSelected = selectedCourtId === cs.court.courtId;
                return (
                  <button
                    key={cs.court.courtId}
                    onClick={() => setSelectedCourtId(isSelected ? null : cs.court.courtId)}
                    className={`
                      relative rounded-lg border-2 p-2 transition-all cursor-pointer flex-shrink-0
                      w-[100px] min-h-[90px]
                      ${style.bg} ${style.border} ${style.glow}
                      ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-md'}
                    `}
                  >
                    {cs.status === 'playing' && (
                      <div className="absolute top-1 right-1">
                        <Play className="w-3 h-3 text-green-500 fill-green-500" />
                      </div>
                    )}
                    <div className={`text-lg font-bold ${style.text} text-center leading-none`}>
                      {cs.court.name}
                    </div>
                    <div className={`text-[10px] font-medium ${style.text} text-center mt-1`}>
                      {statusLabel[cs.status]}
                    </div>
                    {cs.currentMatch && (
                      <div className="mt-1 pt-1 border-t border-green-200 space-y-0">
                        <p className="text-[9px] font-medium text-green-800 truncate text-center leading-tight">
                          {cs.currentMatch.player1Name}
                        </p>
                        <p className="text-[8px] text-green-600 text-center">vs</p>
                        <p className="text-[9px] font-medium text-green-800 truncate text-center leading-tight">
                          {cs.currentMatch.player2Name}
                        </p>
                      </div>
                    )}
                    {!cs.currentMatch && cs.nextMatch && (
                      <div className="mt-1 pt-1 border-t border-blue-100 space-y-0">
                        <p className="text-[9px] text-primary-500 truncate text-center leading-tight">
                          {cs.nextMatch.player1Name}
                        </p>
                        <p className="text-[8px] text-blue-400 text-center">vs</p>
                        <p className="text-[9px] text-primary-500 truncate text-center leading-tight">
                          {cs.nextMatch.player2Name}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* コート詳細（選択時のみ） */}
      {selectedDetail && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              {selectedDetail.court.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                selectedDetail.status === 'playing' ? 'bg-green-100 text-green-800' :
                selectedDetail.status === 'ready' ? 'bg-blue-100 text-primary-500' :
                selectedDetail.status === 'unavailable' ? 'bg-gray-100 text-gray-500' :
                'bg-gray-50 text-gray-500'
              }`}>
                {selectedDetail.status === 'playing' && <Play className="w-3 h-3" />}
                {selectedDetail.status === 'ready' && <Clock className="w-3 h-3" />}
                {selectedDetail.status === 'unavailable' && <AlertCircle className="w-3 h-3" />}
                {statusLabel[selectedDetail.status]}
              </span>
              <span className="text-xs text-gray-500">{selectedDetail.matchCount}試合割当</span>
              <button
                onClick={() => setSelectedCourtId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2"
              >
                閉じる
              </button>
            </div>
          </div>

          {/* 現在の試合 */}
          {selectedDetail.currentMatch && (
            <div className="bg-green-50 rounded-lg p-3 border border-green-200 mb-3">
              <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                <Play className="w-3 h-3" /> 現在の試合
                <span className="text-gray-500 ml-2">{getEventName(selectedDetail.currentMatch.eventId)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{selectedDetail.currentMatch.player1Name}</span>
                <span className="text-gray-400 text-xs">vs</span>
                <span className="font-medium">{selectedDetail.currentMatch.player2Name}</span>
                {selectedDetail.currentMatch.score && (
                  <span className="font-mono text-primary-500 ml-2">{selectedDetail.currentMatch.score}</span>
                )}
              </div>
            </div>
          )}

          {/* 試合一覧 */}
          {selectedCourtMatches.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-auto">
              {selectedCourtMatches.map(m => (
                <div
                  key={m.matchId}
                  className={`rounded-lg p-2 text-xs border flex items-center gap-3 ${
                    m.status === 'playing' ? 'bg-green-50 border-green-200' :
                    m.status === 'finished' ? 'bg-primary-50 border-border-main' :
                    m.status === 'walkover' ? 'bg-amber-50 border-amber-200' :
                    'bg-white border-border-main'
                  }`}
                >
                  <span className="text-gray-400 w-16 truncate shrink-0">{getEventName(m.eventId)}</span>
                  <span className="font-medium truncate">{m.player1Name}</span>
                  <span className="text-gray-400 shrink-0">vs</span>
                  <span className="font-medium truncate">{m.player2Name}</span>
                  {m.score && <span className="font-mono text-primary-500 shrink-0">{m.score}</span>}
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                    m.status === 'playing' ? 'bg-green-100 text-green-700' :
                    m.status === 'finished' ? 'bg-blue-100 text-primary-500' :
                    m.status === 'walkover' ? 'bg-amber-100 text-amber-700' :
                    m.status === 'ready' ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {m.status === 'playing' ? '試合中' :
                     m.status === 'finished' ? '終了' :
                     m.status === 'walkover' ? 'W.O' :
                     m.status === 'ready' ? '準備完了' : '待機'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 下部: 種目別進行 */}
      {eventProgress.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary-500" />
            種目別進行
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eventProgress.map(ep => (
              <div key={ep.event.eventId} className="rounded-lg border border-border-main p-3 hover:shadow-sm transition-shadow">
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="font-bold text-sm text-gray-900 truncate">{ep.event.name}</h3>
                  {ep.playing > 0 && (
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2">
                      {ep.playing}試合中
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{ep.finished} / {ep.total} 完了</span>
                  <span>{ep.roundName}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${ep.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
