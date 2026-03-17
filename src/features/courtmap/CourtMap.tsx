import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { Match, Court } from '../../db/database';
import { MapPin, Play, Clock, CheckCircle, AlertCircle } from 'lucide-react';

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

          <div className="flex flex-col items-center gap-3 max-w-3xl mx-auto">
            {/* hqSide === 'right' の場合: 全ブロックをflex-colでまとめ、右に本部を配置 */}
            {venue.hqSide === 'right' ? (
              <div className="w-full flex items-stretch gap-3">
                <div className="flex-1 flex flex-col gap-3">
                  {venue.blocks.map((block, blockIdx) => {
                    const cols = block.courts.length;
                    const gridCols = cols <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-6';

                    return (
                      <div key={blockIdx} className="w-full">
                        <div className={`bg-primary-50 rounded-xl border border-primary-200 p-3 shadow-sm`}>
                          <div className={`grid ${gridCols} gap-2`}>
                            {block.courts.map(courtName => {
                              const cs = courtStatusMap[courtName];
                              if (!cs) return null;
                              const style = statusStyles[cs.status];
                              const isSelected = selectedCourt === courtName;

                              return (
                                <button
                                  key={courtName}
                                  onClick={() => setSelectedCourt(isSelected ? null : courtName)}
                                  className={`
                                    relative rounded-lg border-2 p-2 md:p-3 transition-all cursor-pointer min-h-[80px] md:min-h-[100px]
                                    ${style.bg} ${style.border} ${style.glow}
                                    ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-md'}
                                    ${cs.status === 'playing' ? 'animate-pulse-slow' : ''}
                                  `}
                                >
                                  {cs.status === 'playing' && (
                                    <div className="absolute top-1 right-1">
                                      <Play className="w-3 h-3 text-green-500 fill-green-500" />
                                    </div>
                                  )}
                                  <div className={`text-xl md:text-2xl font-bold ${style.text} text-center leading-none`}>
                                    {courtName}
                                  </div>
                                  <div className={`text-[10px] font-medium ${style.text} text-center mt-1`}>
                                    {statusLabel[cs.status]}
                                  </div>
                                  {cs.currentMatch && (
                                    <div className="mt-1.5 pt-1 border-t border-green-200 space-y-0">
                                      <p className="text-[10px] font-medium text-green-800 truncate whitespace-nowrap text-center leading-tight">
                                        {cs.currentMatch.player1Name}
                                      </p>
                                      <p className="text-[8px] text-green-600 text-center">vs</p>
                                      <p className="text-[10px] font-medium text-green-800 truncate whitespace-nowrap text-center leading-tight">
                                        {cs.currentMatch.player2Name}
                                      </p>
                                    </div>
                                  )}
                                  {!cs.currentMatch && cs.nextMatch && (
                                    <div className="mt-1.5 pt-1 border-t border-blue-100 space-y-0">
                                      <p className="text-[10px] text-primary-500 truncate whitespace-nowrap text-center leading-tight">
                                        {cs.nextMatch.player1Name}
                                      </p>
                                      <p className="text-[8px] text-blue-400 text-center">vs</p>
                                      <p className="text-[10px] text-primary-500 truncate whitespace-nowrap text-center leading-tight">
                                        {cs.nextMatch.player2Name}
                                      </p>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* ブロック間の通路表示 */}
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
                {/* 本部 - 全ブロック右横に表示（千代テニス場レイアウト） */}
                <div className="flex items-center">
                  <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-4 shadow-sm h-full justify-center">
                    <span className="text-lg">🏠</span>
                    <span className="text-sm font-bold text-amber-800 writing-vertical">本部</span>
                  </div>
                </div>
              </div>
            ) : (
            /* 通常レイアウト（ヤマタスポーツパーク等） */
            venue.blocks.map((block, blockIdx) => {
              const cols = block.courts.length;
              const gridCols = cols <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-6';

              return (
                <div key={blockIdx} className="w-full">
                  {/* コートブロック - 緑のフィールド風 */}
                  <div className="flex items-stretch gap-3">
                    <div className={`flex-1 bg-primary-50 rounded-xl border border-primary-200 p-3 shadow-sm`}>
                      <div className={`grid ${gridCols} gap-2`}>
                        {block.courts.map(courtName => {
                          const cs = courtStatusMap[courtName];
                          if (!cs) return null;
                          const style = statusStyles[cs.status];
                          const isSelected = selectedCourt === courtName;

                          return (
                            <button
                              key={courtName}
                              onClick={() => setSelectedCourt(isSelected ? null : courtName)}
                              className={`
                                relative rounded-lg border-2 p-2 md:p-3 transition-all cursor-pointer min-h-[80px] md:min-h-[100px]
                                ${style.bg} ${style.border} ${style.glow}
                                ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02] hover:shadow-md'}
                                ${cs.status === 'playing' ? 'animate-pulse-slow' : ''}
                              `}
                            >
                              {cs.status === 'playing' && (
                                <div className="absolute top-1 right-1">
                                  <Play className="w-3 h-3 text-green-500 fill-green-500" />
                                </div>
                              )}
                              <div className={`text-xl md:text-2xl font-bold ${style.text} text-center leading-none`}>
                                {courtName}
                              </div>
                              <div className={`text-[10px] font-medium ${style.text} text-center mt-1`}>
                                {statusLabel[cs.status]}
                              </div>
                              {cs.currentMatch && (
                                <div className="mt-1.5 pt-1 border-t border-green-200 space-y-0">
                                  <p className="text-[10px] font-medium text-green-800 truncate whitespace-nowrap text-center leading-tight">
                                    {cs.currentMatch.player1Name}
                                  </p>
                                  <p className="text-[8px] text-green-600 text-center">vs</p>
                                  <p className="text-[10px] font-medium text-green-800 truncate whitespace-nowrap text-center leading-tight">
                                    {cs.currentMatch.player2Name}
                                  </p>
                                </div>
                              )}
                              {!cs.currentMatch && cs.nextMatch && (
                                <div className="mt-1.5 pt-1 border-t border-blue-100 space-y-0">
                                  <p className="text-[10px] text-primary-500 truncate whitespace-nowrap text-center leading-tight">
                                    {cs.nextMatch.player1Name}
                                  </p>
                                  <p className="text-[8px] text-blue-400 text-center">vs</p>
                                  <p className="text-[10px] text-primary-500 truncate whitespace-nowrap text-center leading-tight">
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

                  {/* 本部表示 - 指定ブロック間に表示（ヤマタスポーツパーク用） */}
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

                  {/* ブロック間の道路表示（本部表示がないブロック間） */}
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

            {/* 駐車場（ヤマタのみ） */}
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
