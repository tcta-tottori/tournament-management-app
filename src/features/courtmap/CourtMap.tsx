import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { Match, Court } from '../../db/database';
import { MapPin, Play, Clock, CheckCircle, AlertCircle } from 'lucide-react';

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
    hqPosition: 1, // 5-8ブロックの後（9-12ブロックの前）に本部
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
  const [selectedVenue, setSelectedVenue] = useState<string>('yamata');
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

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

  // 選択コートの全試合
  const selectedCourtMatches = useMemo(() => {
    if (!selectedCourtDetail?.court) return [];
    return allMatches
      .filter(m => m.courtId === selectedCourtDetail.court!.courtId)
      .sort((a, b) => a.matchOrder - b.matchOrder);
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
    const style = statusStyles[cs.status];
    const isSelected = selectedCourt === courtName;

    return (
      <button
        key={courtName}
        onClick={() => setSelectedCourt(isSelected ? null : courtName)}
        className={`
          relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden
          ${style.bg} ${style.border} ${style.glow}
          ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-md'}
          ${cs.status === 'playing' ? 'animate-pulse-slow' : ''}
        `}
        style={{ aspectRatio: '1 / 1.7' }}
      >
        <CourtLines status={cs.status} />
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-1.5">
          {cs.status === 'playing' && (
            <div className="absolute top-1 right-1">
              <Play className="w-3 h-3 text-green-500 fill-green-500" />
            </div>
          )}
          <div className={`text-xl font-bold ${style.text} leading-none`}>{courtName}</div>
          <div className={`text-[9px] font-medium ${style.text} mt-0.5`}>{statusLabel[cs.status]}</div>
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
  }, [courtStatusMap, selectedCourt, statusStyles, statusLabel]);

  /** コートボタン描画（PC用・横向き） */
  const renderCourtButtonH = useCallback((courtName: string) => {
    const cs = courtStatusMap[courtName];
    if (!cs) return null;
    const style = statusStyles[cs.status];
    const isSelected = selectedCourt === courtName;

    return (
      <button
        key={courtName}
        onClick={() => setSelectedCourt(isSelected ? null : courtName)}
        className={`
          relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden
          ${style.bg} ${style.border} ${style.glow}
          ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.02]' : 'hover:scale-[1.01] hover:shadow-md'}
          ${cs.status === 'playing' ? 'animate-pulse-slow' : ''}
        `}
        style={{ aspectRatio: '1.8 / 1' }}
      >
        <CourtLinesH status={cs.status} />
        <div className="relative z-10 flex items-center h-full px-3 py-1.5 gap-2">
          {/* 左側: コート番号 + ステータス */}
          <div className="flex flex-col items-center shrink-0 min-w-[40px]">
            {cs.status === 'playing' && (
              <Play className="w-3 h-3 text-green-500 fill-green-500 mb-0.5" />
            )}
            <div className={`text-2xl font-bold ${style.text} leading-none`}>{courtName}</div>
            <div className={`text-[10px] font-medium ${style.text} mt-0.5`}>{statusLabel[cs.status]}</div>
          </div>
          {/* 右側: 対戦情報 */}
          {cs.currentMatch && (
            <div className="flex-1 min-w-0 border-l border-green-200/60 pl-2 space-y-0">
              <p className="text-[10px] font-medium text-green-800 truncate leading-tight">{cs.currentMatch.player1Name}</p>
              <p className="text-[8px] text-green-600">vs</p>
              <p className="text-[10px] font-medium text-green-800 truncate leading-tight">{cs.currentMatch.player2Name}</p>
            </div>
          )}
          {!cs.currentMatch && cs.nextMatch && (
            <div className="flex-1 min-w-0 border-l border-blue-100/60 pl-2 space-y-0">
              <p className="text-[10px] text-primary-500 truncate leading-tight">{cs.nextMatch.player1Name}</p>
              <p className="text-[8px] text-blue-400">vs</p>
              <p className="text-[10px] text-primary-500 truncate leading-tight">{cs.nextMatch.player2Name}</p>
            </div>
          )}
        </div>
      </button>
    );
  }, [courtStatusMap, selectedCourt, statusStyles, statusLabel]);

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

          {/* === PC横向きレイアウト (md以上) === */}
          <div className="hidden md:block w-full">
            {venue.hqSide === 'right' ? (
              /* 千代テニス場: 横向きレイアウト - ブロックを列として並べ、右に本部 */
              <div className="flex items-stretch gap-3">
                {venue.blocks.map((block, blockIdx) => (
                  <div key={blockIdx} className="flex items-stretch gap-3">
                    <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 shadow-sm">
                      <div className="flex flex-col gap-2">
                        {[...block.courts].reverse().map(renderCourtButtonH)}
                      </div>
                    </div>
                    {blockIdx < venue.blocks.length - 1 && (
                      <div className="flex flex-col items-center justify-center gap-1 py-2">
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                        <span className="text-[10px] text-gray-500 [writing-mode:vertical-rl]">通路</span>
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center">
                  <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-4 shadow-sm h-full justify-center">
                    <span className="text-lg">🏠</span>
                    <span className="text-sm font-bold text-amber-800 [writing-mode:vertical-rl]">本部</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ヤマタスポーツパーク: 横向きレイアウト - ブロックを列、コート番号大→小（上→下） */
              <div className="flex items-start gap-0 justify-center">
                {venue.blocks.map((block, blockIdx) => (
                  <div key={blockIdx} className="flex items-start">
                    {/* ブロック */}
                    <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-2.5 shadow-sm">
                      <div className="flex flex-col gap-2">
                        {[...block.courts].reverse().map(renderCourtButtonH)}
                      </div>
                    </div>

                    {/* 本部表示（指定ブロックの後） */}
                    {blockIdx === venue.hqPosition && (
                      <div className="flex flex-col items-center justify-center mx-2 self-stretch">
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                        <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-3 shadow-sm my-1">
                          <span className="text-base">🏠</span>
                          <span className="text-xs font-bold text-amber-800">本部</span>
                        </div>
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                      </div>
                    )}

                    {/* 通路表示（本部がないブロック間） */}
                    {blockIdx !== venue.hqPosition && blockIdx < venue.blocks.length - 1 && (
                      <div className="flex flex-col items-center justify-center mx-1 self-stretch py-4">
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                        <span className="text-[10px] text-gray-500 [writing-mode:vertical-rl] my-1">通路</span>
                        <div className="flex-1 border-l border-dashed border-gray-300" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 駐車場（ヤマタのみ・PC横向き時は右端に表示） */}
            {venue.id === 'yamata' && (
              <div className="mt-3 flex justify-end">
                <div className="bg-primary-50 rounded-lg px-4 py-1.5 text-xs text-gray-500 font-medium border border-border-main">
                  駐車場側 →
                </div>
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

        {/* 右パネル: コート詳細 */}
        <div className="lg:w-80 shrink-0 overflow-auto space-y-3">
          {selectedCourtDetail ? (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary-500" />
                  {selectedCourt}番コート
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    selectedCourtDetail.status === 'playing' ? 'bg-green-100 text-green-800' :
                    selectedCourtDetail.status === 'ready' ? 'bg-blue-100 text-primary-500' :
                    selectedCourtDetail.status === 'unavailable' ? 'bg-gray-100 text-gray-500' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {selectedCourtDetail.status === 'playing' && <Play className="w-3 h-3" />}
                    {selectedCourtDetail.status === 'ready' && <Clock className="w-3 h-3" />}
                    {selectedCourtDetail.status === 'unavailable' && <AlertCircle className="w-3 h-3" />}
                    {statusLabel[selectedCourtDetail.status]}
                  </span>
                  <span className="text-xs text-gray-500">{selectedCourtDetail.matchCount}試合割当</span>
                </div>

                {/* 現在の試合 */}
                {selectedCourtDetail.currentMatch && (
                  <div className="mt-3 bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                      <Play className="w-3 h-3" /> 現在の試合
                    </div>
                    <div className="text-xs text-gray-500 mb-1">
                      {getEventName(selectedCourtDetail.currentMatch.eventId)}
                    </div>
                    <p className="text-sm font-medium whitespace-nowrap">{selectedCourtDetail.currentMatch.player1Name}</p>
                    <p className="text-[10px] text-gray-500 text-center">vs</p>
                    <p className="text-sm font-medium whitespace-nowrap">{selectedCourtDetail.currentMatch.player2Name}</p>
                    {selectedCourtDetail.currentMatch.score && (
                      <p className="text-sm font-mono text-primary-500 mt-1">{selectedCourtDetail.currentMatch.score}</p>
                    )}
                  </div>
                )}
              </div>

              {/* コート試合一覧 */}
              {selectedCourtMatches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-border-main p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">試合一覧</h4>
                  <div className="space-y-2 max-h-96 overflow-auto">
                    {selectedCourtMatches.map(m => (
                      <div
                        key={m.matchId}
                        className={`rounded-lg p-2.5 text-xs border ${
                          m.status === 'playing' ? 'bg-green-50 border-green-200' :
                          m.status === 'finished' ? 'bg-primary-50 border-border-main' :
                          m.status === 'walkover' ? 'bg-amber-50 border-amber-200' :
                          'bg-white border-border-main'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-500 truncate flex-1">
                            {getEventName(m.eventId)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            m.status === 'playing' ? 'bg-green-100 text-green-700' :
                            m.status === 'finished' ? 'bg-blue-100 text-primary-500' :
                            m.status === 'walkover' ? 'bg-amber-100 text-amber-700' :
                            m.status === 'ready' ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {m.status === 'playing' ? '試合中' :
                             m.status === 'finished' ? '終了' :
                             m.status === 'walkover' ? '不戦勝' :
                             m.status === 'ready' ? '準備完了' : '待機'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium truncate whitespace-nowrap">{m.player1Name}</span>
                          <span className="text-gray-500 shrink-0">vs</span>
                          <span className="font-medium truncate whitespace-nowrap">{m.player2Name}</span>
                        </div>
                        {m.score && (
                          <p className="font-mono text-primary-500 mt-0.5">{m.score}</p>
                        )}
                        {m.scheduledTime && (
                          <p className="text-gray-500 mt-0.5">{m.scheduledTime}〜</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-border-main p-8 text-center">
              <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">コートをクリックすると</p>
              <p className="text-sm text-gray-500">詳細が表示されます</p>
            </div>
          )}

          {/* 全体進捗 */}
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
    </div>
  );
}
