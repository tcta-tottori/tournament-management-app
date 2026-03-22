import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createPortal } from 'react-dom';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { Match, Court } from '../../db/database';
import { MapPin, Play, Clock, CheckCircle, AlertCircle, X, Trophy, Timer } from 'lucide-react';

/** テニスコート型のSVGオーバーレイ（縦向き・モバイル用） */
function CourtLines({ status }: { status: string }) {
  const color = status === 'playing' ? 'rgba(22,163,74,0.25)'
    : status === 'ready' ? 'rgba(59,130,246,0.2)'
    : status === 'unavailable' ? 'rgba(156,163,175,0.2)'
    : 'rgba(148,163,184,0.15)';
  return (
    <svg viewBox="0 0 60 110" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <rect x="4" y="4" width="52" height="102" fill="none" stroke={color} strokeWidth="1.5" rx="1" />
      <line x1="2" y1="55" x2="58" y2="55" stroke={color} strokeWidth="2" />
      <line x1="10" y1="30" x2="50" y2="30" stroke={color} strokeWidth="0.8" />
      <line x1="10" y1="80" x2="50" y2="80" stroke={color} strokeWidth="0.8" />
      <line x1="10" y1="4" x2="10" y2="106" stroke={color} strokeWidth="0.8" />
      <line x1="50" y1="4" x2="50" y2="106" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="30" x2="30" y2="80" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="4" x2="30" y2="8" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="102" x2="30" y2="106" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** テニスコート型のSVGオーバーレイ（横向き・PC用） */
function CourtLinesH({ status }: { status: string }) {
  const color = status === 'playing' ? 'rgba(22,163,74,0.25)'
    : status === 'ready' ? 'rgba(59,130,246,0.2)'
    : status === 'unavailable' ? 'rgba(156,163,175,0.2)'
    : 'rgba(148,163,184,0.15)';
  return (
    <svg viewBox="0 0 110 60" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <rect x="4" y="4" width="102" height="52" fill="none" stroke={color} strokeWidth="1.5" rx="1" />
      {/* ネット（中央縦線） */}
      <line x1="55" y1="2" x2="55" y2="58" stroke={color} strokeWidth="2" />
      {/* サービスライン左 */}
      <line x1="30" y1="10" x2="30" y2="50" stroke={color} strokeWidth="0.8" />
      {/* サービスライン右 */}
      <line x1="80" y1="10" x2="80" y2="50" stroke={color} strokeWidth="0.8" />
      {/* シングルスベースライン上 */}
      <line x1="4" y1="10" x2="106" y2="10" stroke={color} strokeWidth="0.8" />
      {/* シングルスベースライン下 */}
      <line x1="4" y1="50" x2="106" y2="50" stroke={color} strokeWidth="0.8" />
      {/* センターサービスライン */}
      <line x1="30" y1="30" x2="80" y2="30" stroke={color} strokeWidth="0.8" />
      {/* センターマーク左 */}
      <line x1="4" y1="30" x2="8" y2="30" stroke={color} strokeWidth="0.8" />
      {/* センターマーク右 */}
      <line x1="102" y1="30" x2="106" y2="30" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

// 会場プリセット定義
// layout: 'blocks' = ブロック配置（本部位置指定あり）, 'grid' = 単純グリッド
interface CourtBlock {
  courts: string[];
}

interface VenuePreset {
  id: string;
  name: string;
  blocks: CourtBlock[];
  hqPosition: number; // 本部を表示するブロック間の位置（0-indexed: この番号のブロックの後に表示）, -1 = hqSideで制御
  totalCourts: number;
  hqSide?: 'right' | 'right-bottom'; // 'right' = 全ブロック右横に本部表示（千代テニス場用）
}

const VENUE_PRESETS: VenuePreset[] = [
  {
    id: 'yamata',
    name: 'ヤマタスポーツパーク',
    blocks: [
      { courts: ['1', '2', '3', '4'] },
      { courts: ['5', '6', '7', '8'] },
      { courts: ['9', '10', '11', '12'] },
      { courts: ['13', '14', '15', '16'] },
    ],
    hqPosition: 1, // 5番コートと9番コートの間に本部
    totalCourts: 16,
  },
  {
    id: 'sendai',
    name: '千代テニス場',
    blocks: [
      { courts: ['1', '2', '3', '4', '5', '6'] },
      { courts: ['7', '8', '9', '10', '11', '12'] },
    ],
    hqPosition: -1, // 本部はhqSideで制御
    totalCourts: 12,
    hqSide: 'right' as const, // 全ブロック右横に本部表示
  },
];

type CourtStatus = {
  court: Court | null;
  courtName: string;
  currentMatch: Match | null;
  nextMatch: Match | null;
  matchCount: number;
  status: 'empty' | 'playing' | 'ready' | 'unavailable';
};

export default function CourtMap() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const matchDuration = useAppStore(state => state.scheduleConfig.matchDuration);
  const [selectedVenue, setSelectedVenue] = useState<string>('yamata');
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick: 1秒（コート詳細表示中）/ 10秒（通常）で更新
  useEffect(() => {
    const interval = selectedCourt ? 1000 : 10000;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [selectedCourt]);

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

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

  // ドローデータ（回戦名取得用）
  const allDraws = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.draws.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];

  /** 回戦名を取得 */
  const getRoundName = useCallback((eventId: string, round: number) => {
    const draw = allDraws.find(d => d.eventId === eventId);
    if (!draw) return `${round}回戦`;
    const totalRounds = Math.log2(draw.drawSize);
    if (round === totalRounds) return '決勝';
    if (round === totalRounds - 1) return '準決勝';
    if (round === totalRounds - 2) return '準々決勝';
    return `${round}回戦`;
  }, [allDraws]);

  const venue = VENUE_PRESETS.find(v => v.id === selectedVenue) || VENUE_PRESETS[0];

  // コート名からCourtデータ・試合データを取得
  const courtStatusMap = useMemo(() => {
    const map: Record<string, CourtStatus> = {};

    for (const block of venue.blocks) {
      for (const courtName of block.courts) {
        const court = courts.find(c =>
          c.name === courtName ||
          c.name === `${courtName}番` ||
          c.name === `${courtName}番コート` ||
          c.name === `コート${courtName}` ||
          c.name === `${courtName}コート`
        ) || null;

        const courtId = court?.courtId || null;
        const courtMatches = courtId
          ? allMatches.filter(m => m.courtId === courtId)
          : [];

        const currentMatch = courtMatches.find(m => m.status === 'playing') || null;
        const nextMatch = courtMatches.find(m =>
          (m.status === 'ready' || m.status === 'waiting') && m.player1Name && m.player2Name
        ) || null;

        let status: CourtStatus['status'] = 'empty';
        if (court && !court.isAvailable) status = 'unavailable';
        else if (currentMatch) status = 'playing';
        else if (nextMatch) status = 'ready';

        map[courtName] = {
          court,
          courtName,
          currentMatch,
          nextMatch,
          matchCount: courtMatches.length,
          status,
        };
      }
    }
    return map;
  }, [venue, courts, allMatches]);

  // Time-over courts
  const timeOverCourts = useMemo(() => {
    const limitMs = matchDuration * 60 * 1000;
    const set = new Set<string>();
    for (const [courtName, cs] of Object.entries(courtStatusMap)) {
      if (cs.currentMatch?.status === 'playing' && cs.currentMatch.updatedAt) {
        if (now - cs.currentMatch.updatedAt > limitMs) {
          set.add(courtName);
        }
      }
    }
    return set;
  }, [courtStatusMap, matchDuration, now]);

  // 統計
  const stats = useMemo(() => {
    const allCourtNames = venue.blocks.flatMap(b => b.courts);
    const statuses = allCourtNames.map(n => courtStatusMap[n]?.status || 'empty');
    return {
      total: allCourtNames.length,
      playing: statuses.filter(s => s === 'playing').length,
      ready: statuses.filter(s => s === 'ready').length,
      empty: statuses.filter(s => s === 'empty').length,
      unavailable: statuses.filter(s => s === 'unavailable').length,
    };
  }, [venue, courtStatusMap]);

  const selectedCourtDetail = selectedCourt ? courtStatusMap[selectedCourt] : null;

  // 選択コートの全試合（履歴順: 完了試合を updatedAt 昇順で並べ、未完了は末尾）
  const selectedCourtMatches = useMemo(() => {
    if (!selectedCourtDetail?.court) return [];
    return allMatches
      .filter(m => m.courtId === selectedCourtDetail.court!.courtId)
      .sort((a, b) => {
        // finished/walkover → playing → others
        const statusOrder = (s: string) => s === 'finished' || s === 'walkover' ? 0 : s === 'playing' ? 1 : 2;
        const sa = statusOrder(a.status), sb = statusOrder(b.status);
        if (sa !== sb) return sa - sb;
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      });
  }, [selectedCourtDetail, allMatches]);

  // 種目名取得
  const getEventName = (eventId: string) => {
    return events.find(e => e.eventId === eventId)?.name || '';
  };

  const statusStyles: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    playing: {
      bg: 'bg-green-100',
      border: 'border-green-400',
      text: 'text-green-800',
      glow: 'shadow-[0_0_12px_rgba(22,163,74,0.3)]',
    },
    ready: {
      bg: 'bg-blue-50',
      border: 'border-primary-500',
      text: 'text-primary-500',
      glow: '',
    },
    empty: {
      bg: 'bg-white',
      border: 'border-border-main',
      text: 'text-gray-500',
      glow: '',
    },
    unavailable: {
      bg: 'bg-gray-100',
      border: 'border-gray-300',
      text: 'text-gray-400',
      glow: '',
    },
  };

  const statusLabel: Record<string, string> = {
    playing: '試合中',
    ready: '次の試合あり',
    empty: '空き',
    unavailable: '使用不可',
  };

  /** コートボタン描画（モバイル用・縦向き） */
  const renderCourtButton = useCallback((courtName: string) => {
    const cs = courtStatusMap[courtName];
    if (!cs) return null;
    const isOver = timeOverCourts.has(courtName);
    const style = isOver
      ? { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', glow: 'shadow-[0_0_16px_rgba(239,68,68,0.4)]' }
      : statusStyles[cs.status];
    const isSelected = selectedCourt === courtName;

    return (
      <button
        key={courtName}
        onClick={() => setSelectedCourt(isSelected ? null : courtName)}
        className={`
          relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden
          ${style.bg} ${style.border} ${style.glow}
          ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-md'}
          ${cs.status === 'playing' && !isOver ? 'animate-pulse-slow' : ''}
        `}
        style={{ aspectRatio: '1 / 1.7' }}
      >
        <CourtLines status={cs.status} />
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-1.5">
          {cs.status === 'playing' && (
            <div className="absolute top-1 right-1">
              {isOver ? (
                <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />
              ) : (
                <Play className="w-3 h-3 text-green-500 fill-green-500" />
              )}
            </div>
          )}
          <div className={`text-xl font-bold ${style.text} leading-none`}>{courtName}</div>
          <div className={`text-[9px] font-medium ${style.text} mt-0.5`}>{isOver ? '時間超過' : statusLabel[cs.status]}</div>
          {cs.currentMatch && (
            <div className="mt-1 pt-1 border-t border-green-200/60 w-full space-y-0">
              <p className="text-[9px] font-medium text-green-800 truncate text-center leading-tight">{cs.currentMatch.player1Name}</p>
              <p className="text-[7px] text-green-600 text-center">vs</p>
              <p className="text-[9px] font-medium text-green-800 truncate text-center leading-tight">{cs.currentMatch.player2Name}</p>
            </div>
          )}
          {!cs.currentMatch && cs.nextMatch && (
            <div className="mt-1 pt-1 border-t border-blue-100/60 w-full space-y-0">
              <p className="text-[9px] text-primary-500 truncate text-center leading-tight">{cs.nextMatch.player1Name}</p>
              <p className="text-[7px] text-blue-400 text-center">vs</p>
              <p className="text-[9px] text-primary-500 truncate text-center leading-tight">{cs.nextMatch.player2Name}</p>
            </div>
          )}
        </div>
      </button>
    );
  }, [courtStatusMap, selectedCourt, statusStyles, statusLabel, timeOverCourts]);

  /** コートボタン描画（PC用・回転レイアウト向き） */
  const renderCourtButtonPC = useCallback((courtName: string) => {
    const cs = courtStatusMap[courtName];
    if (!cs) return null;
    const isOver = timeOverCourts.has(courtName);
    const style = isOver
      ? { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', glow: 'shadow-[0_0_16px_rgba(239,68,68,0.4)]' }
      : statusStyles[cs.status];
    const isSelected = selectedCourt === courtName;

    return (
      <button
        key={courtName}
        onClick={() => setSelectedCourt(isSelected ? null : courtName)}
        className={`
          relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden
          ${style.bg} ${style.border} ${style.glow}
          ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.02]' : 'hover:scale-[1.01] hover:shadow-md'}
          ${cs.status === 'playing' && !isOver ? 'animate-pulse-slow' : ''}
        `}
        style={{ aspectRatio: '1.6 / 1' }}
      >
        <CourtLinesH status={cs.status} />
        <div className="relative z-10 flex items-center h-full px-2 py-1 gap-2">
          {/* 左: コート番号 + ステータス */}
          <div className="flex flex-col items-center shrink-0 min-w-[36px]">
            {cs.status === 'playing' && (
              isOver ? (
                <AlertCircle className="w-3 h-3 text-red-500 animate-pulse mb-0.5" />
              ) : (
                <Play className="w-3 h-3 text-green-500 fill-green-500 mb-0.5" />
              )
            )}
            <div className={`text-xl font-bold ${style.text} leading-none`}>{courtName}</div>
            <div className={`text-[9px] font-medium ${style.text} mt-0.5`}>{isOver ? '時間超過' : statusLabel[cs.status]}</div>
          </div>
          {/* 右: 対戦情報 */}
          {cs.currentMatch && (
            <div className="flex-1 min-w-0 border-l border-green-200/60 pl-2 space-y-0">
              <p className="text-[10px] font-medium text-green-800 truncate leading-tight">{cs.currentMatch.player1Name}</p>
              <p className="text-[7px] text-green-600">vs</p>
              <p className="text-[10px] font-medium text-green-800 truncate leading-tight">{cs.currentMatch.player2Name}</p>
            </div>
          )}
          {!cs.currentMatch && cs.nextMatch && (
            <div className="flex-1 min-w-0 border-l border-blue-100/60 pl-2 space-y-0">
              <p className="text-[10px] text-primary-500 truncate leading-tight">{cs.nextMatch.player1Name}</p>
              <p className="text-[7px] text-blue-400">vs</p>
              <p className="text-[10px] text-primary-500 truncate leading-tight">{cs.nextMatch.player2Name}</p>
            </div>
          )}
        </div>
      </button>
    );
  }, [courtStatusMap, selectedCourt, statusStyles, statusLabel, timeOverCourts]);

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* ヘッダー */}
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-primary-500" />
              コートマップ
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              会場のコート使用状況をリアルタイムで確認できます
            </p>
          </div>
          {/* 会場切替 */}
          <div className="flex gap-2">
            {VENUE_PRESETS.map(v => (
              <button
                key={v.id}
                onClick={() => { setSelectedVenue(v.id); setSelectedCourt(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedVenue === v.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-primary-50 text-gray-500 hover:bg-primary-50'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* サマリー */}
        <div className="flex gap-4 mt-3 text-sm flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-400" />
            試合中 {stats.playing}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-primary-500" />
            準備中 {stats.ready}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-white border border-border-main" />
            空き {stats.empty}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-300" />
            使用不可 {stats.unavailable}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* コートマップ */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-border-main p-4 md:p-6 overflow-auto">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
            {venue.name} - コート配置図
          </h2>

          {/* === PC横向きレイアウト (md以上) — 反時計回り90°回転レイアウト === */}
          <div className="hidden md:block w-full">
            {venue.hqSide === 'right' ? (
              /* 千代テニス場: ブロックを行として並べ、右に本部 */
              <div className="flex items-stretch gap-3">
                <div className="flex-1 flex flex-col gap-3">
                  {[...venue.blocks].reverse().map((block, ri) => {
                    const blockIdx = venue.blocks.length - 1 - ri;
                    return (
                      <div key={blockIdx}>
                        <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 shadow-sm">
                          <div className="grid grid-cols-6 gap-2">
                            {block.courts.map(renderCourtButtonPC)}
                          </div>
                        </div>
                        {ri < venue.blocks.length - 1 && (
                          <div className="flex items-center gap-2 my-2">
                            <div className="flex-1 border-t border-dashed border-gray-300" />
                            <span className="text-[10px] text-gray-500">通路</span>
                            <div className="flex-1 border-t border-dashed border-gray-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center">
                  <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-4 shadow-sm h-full justify-center">
                    <span className="text-lg">🏠</span>
                    <span className="text-sm font-bold text-amber-800 [writing-mode:vertical-rl]">本部</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ヤマタスポーツパーク: ブロックを行にして上→下に配置（反時計回り90°） */
              <div className="flex flex-col items-center gap-0 w-full">
                {[...venue.blocks].reverse().map((block, ri) => {
                  const blockIdx = venue.blocks.length - 1 - ri;
                  return (
                    <div key={blockIdx} className="w-full max-w-3xl">
                      {/* ブロック: コートを横一列に */}
                      <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 shadow-sm">
                        <div className="text-[10px] text-emerald-600 font-bold mb-2 px-1">
                          {block.courts[0]}〜{block.courts[block.courts.length - 1]}
                        </div>
                        <div className="grid grid-cols-4 gap-2.5">
                          {block.courts.map(renderCourtButtonPC)}
                        </div>
                      </div>

                      {/* 本部表示（指定ブロックの後 → 回転後は上のブロックとの間） */}
                      {blockIdx === venue.hqPosition + 1 && (
                        <div className="flex items-center gap-3 my-3 px-4">
                          <div className="flex-1 border-t border-dashed border-border-main" />
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 shadow-sm">
                            <span className="text-base">🏠</span>
                            <span className="text-sm font-bold text-amber-800">本部</span>
                          </div>
                          <div className="flex-1 border-t border-dashed border-border-main" />
                        </div>
                      )}

                      {/* 通路表示 */}
                      {blockIdx !== venue.hqPosition + 1 && ri < venue.blocks.length - 1 && (
                        <div className="flex items-center gap-2 my-2 px-4">
                          <div className="flex-1 border-t border-dashed border-gray-300" />
                          <span className="text-[10px] text-gray-500">通路</span>
                          <div className="flex-1 border-t border-dashed border-gray-300" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 駐車場（ヤマタのみ・回転後は下に表示） */}
                {venue.id === 'yamata' && (
                  <div className="mt-3 w-full max-w-3xl">
                    <div className="bg-primary-50 rounded-lg px-6 py-2 text-xs text-gray-500 font-medium border border-border-main text-center">
                      ↓ 駐車場側
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === モバイル縦向きレイアウト (md未満) === */}
          <div className="md:hidden flex flex-col items-center gap-3 w-full">
            {venue.hqSide === 'right' ? (
              <div className="w-full flex items-stretch gap-3">
                <div className="flex-1 flex flex-col gap-3">
                  {venue.blocks.map((block, blockIdx) => {
                    const cols = block.courts.length;
                    const gridCols = cols <= 4 ? 'grid-cols-4' : 'grid-cols-6';
                    return (
                      <div key={blockIdx} className="w-full">
                        <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 shadow-sm">
                          <div className={`grid ${gridCols} gap-2`}>
                            {block.courts.map(renderCourtButton)}
                          </div>
                        </div>
                        {blockIdx < venue.blocks.length - 1 && (
                          <div className="flex items-center gap-2 my-2">
                            <div className="flex-1 border-t border-dashed border-gray-300" />
                            <span className="text-[10px] text-gray-500">通路</span>
                            <div className="flex-1 border-t border-dashed border-gray-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center">
                  <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-4 shadow-sm h-full justify-center">
                    <span className="text-lg">🏠</span>
                    <span className="text-sm font-bold text-amber-800 [writing-mode:vertical-rl]">本部</span>
                  </div>
                </div>
              </div>
            ) : (
              venue.blocks.map((block, blockIdx) => {
                const cols = block.courts.length;
                const gridCols = cols <= 4 ? 'grid-cols-4' : 'grid-cols-6';
                return (
                  <div key={blockIdx} className="w-full">
                    <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 shadow-sm">
                      <div className={`grid ${gridCols} gap-2`}>
                        {block.courts.map(renderCourtButton)}
                      </div>
                    </div>
                    {blockIdx === venue.hqPosition && (
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 shadow-sm">
                          <span className="text-base">🏠</span>
                          <span className="text-sm font-bold text-amber-800">本部</span>
                        </div>
                        <div className="flex-1 border-t border-dashed border-border-main" />
                        <span className="text-[10px] text-gray-500">通路</span>
                        <div className="flex-1 border-t border-dashed border-border-main" />
                      </div>
                    )}
                    {blockIdx !== venue.hqPosition && blockIdx < venue.blocks.length - 1 && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="flex-1 border-t border-dashed border-gray-300" />
                        <span className="text-[10px] text-gray-500">通路</span>
                        <div className="flex-1 border-t border-dashed border-gray-300" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {venue.id === 'yamata' && (
              <div className="bg-primary-50 rounded-lg px-6 py-2 text-xs text-gray-500 font-medium border border-border-main w-full text-center mt-1">
                駐車場側
              </div>
            )}
          </div>
        </div>

        {/* 全体進捗 */}
        <div className="lg:w-64 shrink-0 overflow-auto">
          <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
            <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-primary-500" />
              試合進捗
            </h4>
            {(() => {
              const total = allMatches.length;
              const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'walkover').length;
              const playing = allMatches.filter(m => m.status === 'playing').length;
              const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
              return (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{finished}/{total} 完了</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-[#e0e7ef] rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: 'linear-gradient(135deg, #2e7d32, #1b5e20)' }}
                    />
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3 text-green-500" /> {playing}試合中
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {total - finished - playing}待機
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ===== フルスクリーン コート詳細オーバーレイ ===== */}
      {selectedCourt && selectedCourtDetail && createPortal(
        <div
          className="fixed inset-0 z-[100] court-detail-backdrop"
          onClick={() => setSelectedCourt(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm court-detail-fade-in" />

          {/* Content */}
          <div
            className="absolute inset-0 flex flex-col court-detail-slide-up overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* ヘッダー: コート番号 + ステータス */}
            <div className={`shrink-0 px-5 pt-5 pb-4 ${
              selectedCourtDetail.status === 'playing'
                ? 'bg-gradient-to-br from-green-600 via-green-700 to-emerald-800'
                : selectedCourtDetail.status === 'ready'
                  ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800'
                  : 'bg-gradient-to-br from-gray-600 via-gray-700 to-slate-800'
            } text-white`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {/* コート番号 大表示 */}
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                      <span className="text-3xl font-black">{selectedCourt}</span>
                    </div>
                    {selectedCourtDetail.status === 'playing' && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-ping opacity-75" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {selectedCourt}番コート
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        selectedCourtDetail.status === 'playing'
                          ? 'bg-green-400/30 text-green-100 border border-green-400/40'
                          : selectedCourtDetail.status === 'ready'
                            ? 'bg-blue-400/30 text-blue-100 border border-blue-400/40'
                            : 'bg-white/20 text-white/80 border border-white/20'
                      }`}>
                        {selectedCourtDetail.status === 'playing' && <Play className="w-3 h-3" />}
                        {selectedCourtDetail.status === 'ready' && <Clock className="w-3 h-3" />}
                        {statusLabel[selectedCourtDetail.status]}
                      </span>
                      <span className="text-xs text-white/60">
                        {selectedCourtDetail.matchCount}試合割当
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCourt(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 現在の試合 — 大きく表示 */}
              {selectedCourtDetail.currentMatch && (() => {
                const cm = selectedCourtDetail.currentMatch;
                const elapsed = cm.updatedAt ? Math.floor((now - cm.updatedAt) / 1000) : 0;
                const h = Math.floor(elapsed / 3600);
                const m = Math.floor((elapsed % 3600) / 60);
                const s = elapsed % 60;
                const elapsedStr = h > 0
                  ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                  : `${m}:${String(s).padStart(2, '0')}`;
                const isOver = timeOverCourts.has(selectedCourt!);
                return (
                  <div className="mt-4 bg-white/10 rounded-2xl p-4 border border-white/20 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-white/80 bg-white/15 px-2 py-0.5 rounded">
                        {getEventName(cm.eventId)}
                      </span>
                      <span className="text-xs text-white/60">
                        {getRoundName(cm.eventId, cm.round)}
                      </span>
                      {cm.scheduledTime && (
                        <span className="text-xs text-white/50 ml-auto">
                          予定 {cm.scheduledTime}
                        </span>
                      )}
                    </div>
                    {/* 選手名 大表示 */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-right">
                        <p className="text-lg font-bold leading-tight">{cm.player1Name}</p>
                        <p className="text-xs text-white/50 mt-0.5">{cm.player1Affiliation}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-center">
                        <span className="text-xs font-bold text-white/40">VS</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-lg font-bold leading-tight">{cm.player2Name}</p>
                        <p className="text-xs text-white/50 mt-0.5">{cm.player2Affiliation}</p>
                      </div>
                    </div>
                    {/* 経過時間 */}
                    <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/15">
                      <Timer className={`w-4 h-4 ${isOver ? 'text-red-300 animate-pulse' : 'text-white/60'}`} />
                      <span className={`text-2xl font-mono font-bold ${isOver ? 'text-red-300' : 'text-white'}`}>
                        {elapsedStr}
                      </span>
                      {isOver && (
                        <span className="text-xs font-bold text-red-300 bg-red-400/20 px-2 py-0.5 rounded-full border border-red-400/30 animate-pulse">
                          時間超過
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 空きコート/準備中 */}
              {!selectedCourtDetail.currentMatch && selectedCourtDetail.nextMatch && (
                <div className="mt-4 bg-white/10 rounded-2xl p-4 border border-white/20 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-white/60" />
                    <span className="text-sm font-bold text-white/80">次の試合</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-right">
                      <p className="text-base font-bold">{selectedCourtDetail.nextMatch.player1Name}</p>
                    </div>
                    <span className="text-xs text-white/40">VS</span>
                    <div className="flex-1">
                      <p className="text-base font-bold">{selectedCourtDetail.nextMatch.player2Name}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 試合履歴 */}
            <div className="flex-1 bg-white overflow-auto">
              <div className="px-5 py-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-primary-500" />
                  このコートの試合履歴
                  <span className="text-xs font-normal text-gray-400">({selectedCourtMatches.length}試合)</span>
                </h3>

                {selectedCourtMatches.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">このコートにはまだ試合がありません</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCourtMatches.map((m, idx) => {
                      const isPlaying = m.status === 'playing';
                      const isFinished = m.status === 'finished' || m.status === 'walkover';
                      const eventName = getEventName(m.eventId);
                      const roundName = getRoundName(m.eventId, m.round);
                      const endTime = isFinished && m.updatedAt
                        ? new Date(m.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                        : null;
                      const winnerName = isFinished && m.winnerEntryId
                        ? (m.winnerEntryId === m.player1EntryId ? m.player1Name : m.player2Name)
                        : null;
                      const loserName = isFinished && m.winnerEntryId
                        ? (m.winnerEntryId === m.player1EntryId ? m.player2Name : m.player1Name)
                        : null;

                      return (
                        <div
                          key={m.matchId}
                          className={`rounded-xl p-3 border transition-all court-detail-item ${
                            isPlaying
                              ? 'bg-green-50 border-green-300 shadow-sm shadow-green-100'
                              : isFinished
                                ? 'bg-gray-50 border-gray-200'
                                : 'bg-blue-50 border-blue-200'
                          }`}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          {/* 上段: 種目 + 回戦 + ステータス */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isPlaying ? 'bg-green-200 text-green-800'
                              : isFinished ? 'bg-gray-200 text-gray-600'
                              : 'bg-blue-200 text-blue-700'
                            }`}>
                              {isPlaying ? '試合中' : isFinished ? '終了' : m.status === 'walkover' ? 'W/O' : '待機'}
                            </span>
                            <span className="text-xs text-gray-600 font-medium">{eventName}</span>
                            <span className="text-xs text-gray-400">{roundName}</span>
                            {endTime && (
                              <span className="text-[10px] text-gray-400 ml-auto font-mono">{endTime}</span>
                            )}
                          </div>

                          {/* 中段: 選手名 + スコア */}
                          {isFinished && winnerName ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />
                                  <span className="text-sm font-bold text-gray-900 truncate">{winnerName}</span>
                                </div>
                                <span className="text-xs text-gray-400 truncate block">vs {loserName}</span>
                              </div>
                              {m.score && (
                                <span className="text-xs font-mono font-bold text-gray-700 shrink-0 bg-white px-2 py-1 rounded border border-gray-200">
                                  {m.score}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 truncate">{m.player1Name}</span>
                              <span className="text-xs text-gray-400 shrink-0">vs</span>
                              <span className="text-sm font-medium text-gray-800 truncate">{m.player2Name}</span>
                            </div>
                          )}

                          {/* 下段: 時間情報 */}
                          {m.scheduledTime && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                              <Clock className="w-3 h-3" />
                              予定 {m.scheduledTime}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* フッター: 閉じるボタン */}
            <div className="shrink-0 bg-white border-t border-gray-200 px-5 py-3">
              <button
                onClick={() => setSelectedCourt(null)}
                className="w-full py-3 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
              >
                コートマップに戻る
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
