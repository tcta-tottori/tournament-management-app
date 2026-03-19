import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { Match, Court } from '../../db/database';
import {
  BarChart2, Play, CheckCircle, Clock, Trophy, Users, MapPin,
  AlertCircle, Timer,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/** "HH:MM" -> minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes -> "H:MM" display */
function minutesToDisplay(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '+';
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourtStatus = {
  court: Court;
  currentMatch: Match | null;
  nextMatch: Match | null;
  matchCount: number;
  status: 'empty' | 'playing' | 'ready' | 'unavailable';
};

// ---------------------------------------------------------------------------
// SVG Donut Chart
// ---------------------------------------------------------------------------

function DonutChart({
  percent,
  size = 140,
  strokeWidth = 14,
  playing,
  finished,
  total,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  playing: number;
  finished: number;
  total: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const finishedDash = (finished / Math.max(total, 1)) * circumference;
  const playingDash = (playing / Math.max(total, 1)) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth}
        />
        {/* Finished arc */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#3b82f6" strokeWidth={strokeWidth}
          strokeDasharray={`${finishedDash} ${circumference - finishedDash}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        {/* Playing arc (on top of finished) */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#22c55e" strokeWidth={strokeWidth}
          strokeDasharray={`${playingDash} ${circumference - playingDash}`}
          strokeDashoffset={`${-finishedDash}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-gray-900 leading-none">{percent}%</span>
        <span className="text-[10px] text-gray-400 mt-0.5 font-medium">完了</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tennis Court SVG block
// ---------------------------------------------------------------------------

function TennisCourtBlock({
  cs,
  isSelected,
  onSelect,
}: {
  cs: CourtStatus;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isPlaying = cs.status === 'playing';
  const isReady = cs.status === 'ready';
  const isUnavailable = cs.status === 'unavailable';

  // Court colors
  const courtFill = isPlaying ? '#bbf7d0' : isReady ? '#dbeafe' : isUnavailable ? '#e5e7eb' : '#f0fdf4';
  const lineFill = isPlaying ? '#16a34a' : isReady ? '#3b82f6' : isUnavailable ? '#9ca3af' : '#86efac';
  const borderColor = isPlaying ? 'border-green-500' : isReady ? 'border-blue-400' : isUnavailable ? 'border-gray-300' : 'border-green-200';
  const glowClass = isPlaying ? 'shadow-[0_0_16px_rgba(22,163,74,0.25)]' : '';

  return (
    <button
      onClick={onSelect}
      className={`relative rounded-xl border-2 p-2 transition-all cursor-pointer flex flex-col items-center
        ${borderColor} ${glowClass}
        ${isSelected ? 'ring-2 ring-primary-500 ring-offset-2 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-lg'}
      `}
      style={{ width: 150, minHeight: 110 }}
    >
      {/* Tennis court SVG */}
      <svg viewBox="0 0 120 68" className="w-full" style={{ maxWidth: 130 }}>
        {/* Court surface */}
        <rect x="2" y="2" width="116" height="64" rx="3" fill={courtFill} stroke={lineFill} strokeWidth="2" />
        {/* Center line (net) */}
        <line x1="60" y1="2" x2="60" y2="66" stroke={lineFill} strokeWidth="2" strokeDasharray="4 2" />
        {/* Service boxes */}
        <rect x="20" y="2" width="80" height="64" fill="none" stroke={lineFill} strokeWidth="1" opacity="0.5" />
        <line x1="20" y1="34" x2="100" y2="34" stroke={lineFill} strokeWidth="1" opacity="0.5" />
        {/* Service center lines */}
        <line x1="20" y1="34" x2="60" y2="34" stroke={lineFill} strokeWidth="0.8" opacity="0.4" />
        <line x1="60" y1="34" x2="100" y2="34" stroke={lineFill} strokeWidth="0.8" opacity="0.4" />
        {/* Center service marks */}
        <line x1="60" y1="18" x2="60" y2="50" stroke={lineFill} strokeWidth="0.8" opacity="0.3" />
      </svg>

      {/* Court name */}
      <div className={`mt-1 text-xs font-bold ${isPlaying ? 'text-green-700' : isReady ? 'text-blue-600' : isUnavailable ? 'text-gray-400' : 'text-gray-600'}`}>
        {cs.court.name}
      </div>

      {/* Status badge */}
      {isPlaying && (
        <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
          <Play className="w-2.5 h-2.5 fill-white" /> LIVE
        </span>
      )}

      {/* Match info */}
      {cs.currentMatch && (
        <div className="mt-0.5 text-center w-full px-1">
          <p className="text-[10px] font-semibold text-green-800 truncate">{cs.currentMatch.player1Name}</p>
          <p className="text-[8px] text-green-500 font-bold">VS</p>
          <p className="text-[10px] font-semibold text-green-800 truncate">{cs.currentMatch.player2Name}</p>
        </div>
      )}
      {!cs.currentMatch && cs.nextMatch && (
        <div className="mt-0.5 text-center w-full px-1">
          <p className="text-[10px] text-blue-500 truncate">{cs.nextMatch.player1Name}</p>
          <p className="text-[8px] text-blue-300 font-bold">VS</p>
          <p className="text-[10px] text-blue-500 truncate">{cs.nextMatch.player2Name}</p>
        </div>
      )}
      {!cs.currentMatch && !cs.nextMatch && !isUnavailable && (
        <p className="mt-1 text-[10px] text-gray-400">空き</p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function LiveDashboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());


  // Tick clock every 30s
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // -- Data queries --
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

  // -- Stats --
  const stats = useMemo(() => {
    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'walkover');
    const waiting = allMatches.filter(m => m.status === 'waiting' || m.status === 'ready');
    const total = allMatches.length;
    const progressPercent = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    return { playing, finished, waiting, total, progressPercent };
  }, [allMatches]);

  // -- Schedule delay calculation --
  const scheduleDelay = useMemo(() => {
    const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes();

    // Find the latest scheduled match that should have started by now but hasn't
    const scheduledMatches = allMatches.filter(m => m.scheduledTime);
    if (scheduledMatches.length === 0) return null;

    // Count matches that are behind schedule
    let maxDelay = 0;
    let behindCount = 0;
    for (const m of scheduledMatches) {
      if (!m.scheduledTime) continue;
      const scheduledMins = timeToMinutes(m.scheduledTime);
      if (scheduledMins <= nowMins && (m.status === 'waiting' || m.status === 'ready')) {
        const delay = nowMins - scheduledMins;
        if (delay > maxDelay) maxDelay = delay;
        behindCount++;
      }
    }

    // Also check if we're ahead: next scheduled match vs current time
    const nextScheduled = scheduledMatches
      .filter(m => m.scheduledTime && timeToMinutes(m.scheduledTime) > nowMins && m.status !== 'finished' && m.status !== 'walkover')
      .sort((a, b) => timeToMinutes(a.scheduledTime!) - timeToMinutes(b.scheduledTime!));

    const nextTime = nextScheduled[0]?.scheduledTime;
    const nextMins = nextTime ? timeToMinutes(nextTime) : null;

    return {
      maxDelay,
      behindCount,
      nextScheduledTime: nextTime,
      minutesUntilNext: nextMins !== null ? nextMins - nowMins : null,
      isOnSchedule: maxDelay <= 10 && behindCount === 0,
    };
  }, [allMatches, currentTime]);

  // -- Court status --
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

  const courtStats = useMemo(() => ({
    playing: courtStatusList.filter(c => c.status === 'playing').length,
    ready: courtStatusList.filter(c => c.status === 'ready').length,
    empty: courtStatusList.filter(c => c.status === 'empty').length,
    unavailable: courtStatusList.filter(c => c.status === 'unavailable').length,
  }), [courtStatusList]);

  // -- Group courts in rows of 4 --
  const courtRows = useMemo(() => {
    const rows: CourtStatus[][] = [];
    for (let i = 0; i < courtStatusList.length; i += 4) {
      rows.push(courtStatusList.slice(i, i + 4));
    }
    return rows;
  }, [courtStatusList]);

  // -- Event progress --
  const eventProgress = useMemo(() => {
    return events.map(e => {
      const eventMatches = allMatches.filter(m => m.eventId === e.eventId);
      const finished = eventMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
      const total = eventMatches.length;
      const playing = eventMatches.filter(m => m.status === 'playing').length;
      const draw = draws.find(d => d.eventId === e.eventId);
      const totalRounds = draw ? Math.log2(draw.drawSize) : 1;
      const maxRound = eventMatches.reduce((max, m) =>
        (m.status === 'finished' || m.status === 'playing') && m.round > max ? m.round : max, 0);
      const roundName = maxRound > 0 ? getRoundName(maxRound, totalRounds) : '-';
      return { event: e, finished, total, playing, percent: total > 0 ? Math.round((finished / total) * 100) : 0, roundName };
    });
  }, [events, allMatches, draws]);

  // -- Court detail --
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

  const timeStr = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* ===== HEADER ===== */}
      <header className="bg-white p-5 rounded-2xl shadow-sm border border-border-main">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary-500" />
              ライブダッシュボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {currentTournament ? currentTournament.name : '大会を選択してください'}
            </p>
          </div>
          {/* Current time */}
          <div className="text-right">
            <div className="text-3xl font-black text-gray-900 font-mono tracking-tight">{timeStr}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {currentTime.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
          </div>
        </div>
      </header>

      {/* ===== TOP ROW: Donut + Stats + Schedule ===== */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-stretch">
        {/* Donut chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-border-main p-5 flex flex-col items-center justify-center min-w-[180px]">
          <DonutChart
            percent={stats.progressPercent}
            playing={stats.playing.length}
            finished={stats.finished.length}
            total={stats.total}
          />
          <div className="flex gap-4 mt-3 text-[10px] font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />終了</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />試合中</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" />待機</span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
          <StatCard icon={Users} label="全試合数" value={stats.total} color="gray" />
          <StatCard icon={Play} label="試合中" value={stats.playing.length} color="green" />
          <StatCard icon={CheckCircle} label="終了" value={stats.finished.length} color="blue" />
          <StatCard icon={Clock} label="待機中" value={stats.waiting.length} color="gray" />
        </div>

        {/* Schedule delay indicator */}
        {scheduleDelay && (
          <div className="bg-white rounded-2xl shadow-sm border border-border-main p-4 flex flex-col justify-center min-w-[190px]">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-bold text-gray-900">スケジュール状況</span>
            </div>
            {scheduleDelay.isOnSchedule ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-bold text-green-600">予定通り</span>
              </div>
            ) : scheduleDelay.maxDelay > 0 ? (
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="text-lg font-black text-amber-600">
                    {minutesToDisplay(scheduleDelay.maxDelay)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {scheduleDelay.behindCount}試合が遅れています
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-sm font-bold text-green-600">予定通り</span>
              </div>
            )}
            {scheduleDelay.nextScheduledTime && (
              <div className="mt-2 pt-2 border-t border-border-main">
                <p className="text-[10px] text-gray-400">次の予定</p>
                <p className="text-sm font-bold text-gray-700">{scheduleDelay.nextScheduledTime}</p>
                {scheduleDelay.minutesUntilNext !== null && (
                  <p className="text-[10px] text-gray-400">あと{scheduleDelay.minutesUntilNext}分</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== COURT MAP ===== */}
      {courtStatusList.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-border-main p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              コートマップ
            </h2>
            <div className="flex gap-4 text-xs flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                試合中 {courtStats.playing}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                準備 {courtStats.ready}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-100 border border-green-200" />
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

          {/* Court grid: 4 per row */}
          <div className="flex flex-col gap-3 items-center">
            {courtRows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-3 flex-wrap justify-center">
                {row.map(cs => (
                  <TennisCourtBlock
                    key={cs.court.courtId}
                    cs={cs}
                    isSelected={selectedCourtId === cs.court.courtId}
                    onSelect={() => setSelectedCourtId(
                      selectedCourtId === cs.court.courtId ? null : cs.court.courtId
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== COURT DETAIL ===== */}
      {selectedDetail && (
        <div className="bg-white rounded-2xl shadow-sm border border-border-main p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              {selectedDetail.court.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                selectedDetail.status === 'playing' ? 'bg-green-100 text-green-800' :
                selectedDetail.status === 'ready' ? 'bg-blue-100 text-primary-500' :
                selectedDetail.status === 'unavailable' ? 'bg-gray-100 text-gray-500' :
                'bg-gray-50 text-gray-500'
              }`}>
                {selectedDetail.status === 'playing' && <Play className="w-3 h-3" />}
                {selectedDetail.status === 'ready' && <Clock className="w-3 h-3" />}
                {selectedDetail.status === 'unavailable' && <AlertCircle className="w-3 h-3" />}
                {selectedDetail.status === 'playing' ? '試合中' : selectedDetail.status === 'ready' ? '次の試合あり' : selectedDetail.status === 'unavailable' ? '使用不可' : '空き'}
              </span>
              <span className="text-xs text-gray-500">{selectedDetail.matchCount}試合割当</span>
              <button
                onClick={() => setSelectedCourtId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>

          {selectedDetail.currentMatch && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 mb-3">
              <div className="text-xs font-medium text-green-700 mb-1.5 flex items-center gap-1">
                <Play className="w-3 h-3" /> 現在の試合
                <span className="text-gray-500 ml-2">{getEventName(selectedDetail.currentMatch.eventId)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold text-green-900">{selectedDetail.currentMatch.player1Name}</span>
                <span className="text-green-400 text-xs font-bold">VS</span>
                <span className="font-bold text-green-900">{selectedDetail.currentMatch.player2Name}</span>
                {selectedDetail.currentMatch.score && (
                  <span className="font-mono text-primary-500 ml-2">{selectedDetail.currentMatch.score}</span>
                )}
              </div>
            </div>
          )}

          {selectedCourtMatches.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-auto">
              {selectedCourtMatches.map(m => (
                <div
                  key={m.matchId}
                  className={`rounded-lg p-2.5 text-xs border flex items-center gap-3 ${
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

      {/* ===== EVENT PROGRESS ===== */}
      {eventProgress.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-border-main p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary-500" />
            種目別進行
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eventProgress.map(ep => (
              <div
                key={ep.event.eventId}
                className="rounded-xl border border-border-main p-4 hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br from-white to-gray-50/50"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-sm text-gray-900 truncate flex-1">{ep.event.name}</h3>
                  {ep.playing > 0 && (
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2 flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      {ep.playing}試合中
                    </span>
                  )}
                </div>

                {/* Mini donut + stats */}
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                      <circle
                        cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="4"
                        strokeDasharray={`${(ep.percent / 100) * 88} ${88 - (ep.percent / 100) * 88}`}
                        strokeLinecap="round"
                        className="transition-all duration-500"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-700">
                      {ep.percent}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>{ep.finished}/{ep.total} 完了</span>
                      <span className="font-medium text-primary-500">{ep.roundName}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-primary-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${ep.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'green' | 'blue' | 'gray';
}) {
  const colorMap = {
    green: { border: 'border-green-200', text: 'text-green-600', icon: 'text-green-500', bg: 'from-green-50/50' },
    blue: { border: 'border-blue-200', text: 'text-primary-600', icon: 'text-primary-500', bg: 'from-blue-50/50' },
    gray: { border: 'border-border-main', text: 'text-gray-900', icon: 'text-gray-400', bg: 'from-gray-50/30' },
  };
  const c = colorMap[color];

  return (
    <div className={`bg-gradient-to-br ${c.bg} to-white rounded-xl shadow-sm border ${c.border} p-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
      <div className={`flex items-center gap-1.5 ${c.icon} text-xs mb-1.5`}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`text-2xl font-black ${c.text}`}>{value}</p>
    </div>
  );
}
