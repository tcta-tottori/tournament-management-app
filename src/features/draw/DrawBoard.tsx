import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import DrawRenderer from './DrawRenderer';
import RoundRobinRenderer from './RoundRobinRenderer';
import { exportDrawToExcel } from './DrawExporter';
import {
  exportTournamentResultAsJpeg,
  exportTournamentResultAsExcel,
  exportRoundRobinResultAsJpeg,
  exportRoundRobinResultAsExcel,
} from './DrawResultExporter';
import ScoreInputDialog from '../score/ScoreInputDialog';
import type { ScoreInputMatch } from '../score/ScoreInputDialog';
import { Trophy, Save, AlertCircle, Download, LayoutGrid, GitBranch, Image, FileSpreadsheet } from 'lucide-react';
import { useMixedStore } from '../mixed/mixedStore';
import MixedDrawView from '../mixed/MixedDrawView';

export type DrawSlotData = {
  position: number;
  entryId: string | null;
  seed: number;
  isBye: boolean;
  name: string;
  affiliation: string;
};

export type MatchResult = {
  round: number;        // ラウンド番号(1-indexed)
  position: number;     // そのラウンド内のポジション(1-indexed)
  player1Name: string;
  player2Name: string;
  winnerEntryId: string | null;
  player1EntryId: string | null;
  player2EntryId: string | null;
  score: string;
  status: 'waiting' | 'ready' | 'playing' | 'finished' | 'walkover';
  courtId: string | null;
  courtName: string;
  scheduledTime: string | null;
  updatedAt?: number;
};

export default function DrawBoard() {
  const isMixedImported = useMixedStore(s => s.isImported);

  // ミックスダブルスモード — 別コンポーネントとして返すことでHooks順序を保持
  if (isMixedImported) {
    return <MixedDrawView />;
  }

  return <NormalDrawBoard />;
}

function NormalDrawBoard() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [editedSlots, setEditedSlots] = useState<DrawSlotData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'tournament' | 'roundRobin'>('tournament');
  const [scoreMatch, setScoreMatch] = useState<ScoreInputMatch | null>(null);

  const events = useLiveQuery(() => db.events.toArray()) || [];
  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];
  const players = useLiveQuery(() => db.players.toArray()) || [];
  const drawData = useLiveQuery(
    () => selectedEventId ? db.draws.where('eventId').equals(selectedEventId).first() : undefined,
    [selectedEventId]
  );
  const matches = useLiveQuery(
    () => selectedEventId ? db.matches.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const courts = useLiveQuery(() => db.courts.toArray()) || [];

  // matchesデータをMatchResult[]に変換（useMemoで安定化）
  const matchResults: MatchResult[] = useMemo(() => matches.map(m => {
    const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
    return {
      round: m.round,
      position: m.position,
      player1Name: m.player1Name,
      player2Name: m.player2Name,
      winnerEntryId: m.winnerEntryId,
      player1EntryId: m.player1EntryId,
      player2EntryId: m.player2EntryId,
      score: m.score,
      status: m.status,
      courtId: m.courtId,
      courtName: court?.name || '',
      scheduledTime: m.scheduledTime,
    };
  }), [matches, courts]);

  // drawDataの実データが変わった時だけスロットを再構築する
  const lastDrawRef = useRef<{ id?: number; updatedAt?: number; eventId?: string }>({});

  useEffect(() => {
    if (hasUnsavedChanges) return;

    const drawId = drawData?.id;
    const drawUpdatedAt = drawData?.updatedAt;
    const prev = lastDrawRef.current;

    // drawDataの実質的な変更がない場合はスキップ
    if (drawId === prev.id && drawUpdatedAt === prev.updatedAt && selectedEventId === prev.eventId) {
      return;
    }
    lastDrawRef.current = { id: drawId, updatedAt: drawUpdatedAt, eventId: selectedEventId };

    if (drawData && drawData.slots) {
       const mapped: DrawSlotData[] = drawData.slots.map(s => {
          let name = 'BYE';
          let affiliation = '';

          if (!s.isBye && s.entryId) {
             const entry = entries.find(e => e.entryId === s.entryId);
             if (entry) {
                const p1 = players.find(p => p.playerId === entry.playerId);
                const isDoubles = !!entry.partnerId;
                const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
                name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
                affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
                     ? `${p1.affiliation} / ${p2.affiliation}`
                     : (p1?.affiliation || '');
             }
          }
          return {
             position: s.position,
             entryId: s.entryId,
             seed: s.seed,
             isBye: s.isBye,
             name,
             affiliation
          };
       });

       mapped.sort((a,b) => a.position - b.position);
       setEditedSlots(mapped);
       setHasUnsavedChanges(false);

       // ドロータイプの自動検出
       if (drawData.drawType === 'roundRobin') {
         setViewMode('roundRobin');
       } else if (drawData.drawType === 'tournament') {
         setViewMode('tournament');
       } else {
         // drawType未設定の場合: 実選手が2〜5人かつdrawSize≦8ならリーグの可能性
         const realPlayers = mapped.filter(s => !s.isBye);
         if (realPlayers.length >= 2 && realPlayers.length <= 5 && drawData.drawSize <= 8) {
           setViewMode('roundRobin');
         } else {
           setViewMode('tournament');
         }
       }
    } else {
       setEditedSlots([]);
       setHasUnsavedChanges(false);
       setViewMode('tournament');
    }
  }, [drawData, entries, players, selectedEventId]);

  const swapSlots = (sourcePosition: number, targetPosition: number) => {
    if (sourcePosition === targetPosition) return;
    setEditedSlots(prev => {
      const newSlots = [...prev];
      const sourceIdx = newSlots.findIndex(s => s.position === sourcePosition);
      const targetIdx = newSlots.findIndex(s => s.position === targetPosition);

      if (sourceIdx >= 0 && targetIdx >= 0) {
        const s1 = { ...newSlots[sourceIdx] };
        const s2 = { ...newSlots[targetIdx] };

        newSlots[sourceIdx] = { ...s2, position: sourcePosition };
        newSlots[targetIdx] = { ...s1, position: targetPosition };
      }
      return newSlots;
    });
    setHasUnsavedChanges(true);
  };

  const handleDragStart = (e: React.DragEvent, position: number) => {
    e.dataTransfer.setData('text/plain', position.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetPosition: number) => {
    e.preventDefault();
    const sourceStr = e.dataTransfer.getData('text/plain');
    if (!sourceStr) return;
    const sourcePosition = parseInt(sourceStr, 10);

    if (isNaN(sourcePosition)) return;
    swapSlots(sourcePosition, targetPosition);
  };

  const handleTap = (position: number) => {
    if (selectedPosition === null) {
      setSelectedPosition(position);
    } else {
      if (selectedPosition !== position) {
        swapSlots(selectedPosition, position);
      }
      setSelectedPosition(null);
    }
  };

  const handleSave = async () => {
    if (!drawData || !drawData.id || editedSlots.length === 0) return;
    setIsSaving(true);
    try {
      const updatedSlots = editedSlots.map(s => ({
        position: s.position,
        entryId: s.entryId,
        seed: s.seed,
        isBye: s.isBye
      }));

      await db.draws.update(drawData.id, {
        slots: updatedSlots,
        updatedAt: Date.now()
      });
      setHasUnsavedChanges(false);
      alert('ドローの調整を保存しました');
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = async () => {
    if (!drawData || !selectedEventId) return;
    try {
      const eventObj = events.find(e => e.eventId === selectedEventId);
      if (!eventObj) { alert('種目データが見つかりません'); return; }

      const tournamentObj = await db.tournaments.where('tournamentId').equals(eventObj.tournamentId).first();
      if (!tournamentObj) { alert('大会データが見つかりません'); return; }

      const allEntries = await db.entries.where('eventId').equals(selectedEventId).toArray();
      const allMatches = await db.matches.where('eventId').equals(selectedEventId).toArray();
      const allPlayers = await db.players.toArray();

      exportDrawToExcel({
        tournament: tournamentObj,
        event: eventObj,
        draw: drawData,
        matches: allMatches,
        entries: allEntries,
        players: allPlayers,
      });
    } catch (e) {
      console.error('Excel出力エラー:', e);
      alert('Excel出力に失敗しました');
    }
  };

  const getResultExportOptions = async () => {
    if (!drawData || !selectedEventId) return null;
    const eventObj = events.find(e => e.eventId === selectedEventId);
    if (!eventObj) { alert('種目データが見つかりません'); return null; }
    const tournamentObj = await db.tournaments.where('tournamentId').equals(eventObj.tournamentId).first();
    if (!tournamentObj) { alert('大会データが見つかりません'); return null; }
    const allEntries = await db.entries.where('eventId').equals(selectedEventId).toArray();
    const allMatches = await db.matches.where('eventId').equals(selectedEventId).toArray();
    const allPlayers = await db.players.toArray();
    return { tournament: tournamentObj, event: eventObj, draw: drawData, matches: allMatches, entries: allEntries, players: allPlayers };
  };

  const handleExportResultJpeg = async () => {
    try {
      const opts = await getResultExportOptions();
      if (!opts) return;
      if (viewMode === 'roundRobin') {
        await exportRoundRobinResultAsJpeg(opts);
      } else {
        await exportTournamentResultAsJpeg(opts);
      }
    } catch (e) {
      console.error('結果JPEG出力エラー:', e);
      alert('結果JPEG出力に失敗しました');
    }
  };

  const handleExportResultExcel = async () => {
    try {
      const opts = await getResultExportOptions();
      if (!opts) return;
      if (viewMode === 'roundRobin') {
        exportRoundRobinResultAsExcel(opts);
      } else {
        exportTournamentResultAsExcel(opts);
      }
    } catch (e) {
      console.error('結果Excel出力エラー:', e);
      alert('結果Excel出力に失敗しました');
    }
  };

  // --- Score dialog helpers ---
  const handleMatchClick = useCallback((round: number, position: number) => {
    const m = matches.find(x => x.round === round && x.position === position);
    if (!m || !m.id) return;
    const eventObj = events.find(e => e.eventId === selectedEventId);
    setScoreMatch({
      matchId: m.matchId,
      dbId: m.id,
      round: m.round,
      position: m.position,
      matchOrder: m.matchOrder,
      player1Name: m.player1Name,
      player2Name: m.player2Name,
      player1Affiliation: m.player1Affiliation,
      player2Affiliation: m.player2Affiliation,
      player1EntryId: m.player1EntryId,
      player2EntryId: m.player2EntryId,
      score: m.score,
      winnerEntryId: m.winnerEntryId,
      courtId: m.courtId,
      status: m.status,
      scheduledTime: m.scheduledTime,
      eventName: eventObj?.name || '',
      updatedAt: m.updatedAt,
    });
  }, [matches, events, selectedEventId]);

  const totalRounds = drawData ? Math.log2(drawData.drawSize) : 0;
  const makeRoundName = useCallback((round: number) => {
    if (round === totalRounds) return '決勝';
    if (round === totalRounds - 1) return '準決勝';
    if (round === totalRounds - 2) return '準々決勝';
    return `${round}回戦`;
  }, [totalRounds]);

  const occupiedCourtIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      if (m.status === 'playing' && m.courtId) set.add(m.courtId);
    }
    return set;
  }, [matches]);

  return (
    <div className="h-full flex flex-col p-4 md:p-6 mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-border-main shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary-500" />
            ドロー表プレビュー・調整
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            生成されたドローをブラケット形式で確認し、必要に応じて枠の入れ替えができます。
          </p>
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-900 whitespace-nowrap">対象種目:</label>
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full sm:w-64 border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
            ))}
          </select>
        </div>
      </header>

      {selectedEventId ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="bg-white rounded-xl shadow-sm border border-border-main p-4 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
               {drawData ? (
                 <>
                   <div className="px-3 py-1.5 bg-primary-50 text-primary-500 rounded-md text-sm font-medium">
                     ドローサイズ: {drawData.drawSize}
                   </div>
                   {hasUnsavedChanges && (
                     <div className="flex items-center gap-1.5 text-warning text-sm font-medium bg-amber-50 px-3 py-1.5 rounded-md">
                       <AlertCircle className="w-4 h-4" />
                       未保存の変更があります
                     </div>
                   )}
                 </>
               ) : (
                 <div className="text-sm text-gray-500">
                   まだ抽選結果が保存されていません。「抽選機能 S-04」でドローを作成してください。
                 </div>
               )}
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* 表示切替ボタン */}
              <div className="flex rounded-md border border-border-main overflow-hidden">
                <button
                  onClick={() => setViewMode('tournament')}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                    viewMode === 'tournament'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">トーナメント</span><span className="sm:hidden">T</span>
                </button>
                <button
                  onClick={() => setViewMode('roundRobin')}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs font-medium transition-colors ${
                    viewMode === 'roundRobin'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">リーグ</span><span className="sm:hidden">L</span>
                </button>
              </div>
              {selectedPosition !== null && viewMode === 'tournament' && (
                <button
                  onClick={() => setSelectedPosition(null)}
                  className="flex items-center gap-1.5 bg-primary-50 text-gray-900 px-3 sm:px-4 py-2 rounded-md font-medium hover:bg-gray-200 shadow-sm transition-colors text-xs sm:text-sm"
                >
                  選択解除
                </button>
              )}
              <button
                onClick={handleExportExcel}
                disabled={!drawData}
                className="flex items-center gap-1.5 bg-primary-500 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-xs sm:text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <Download className="w-3.5 h-3.5 hidden sm:block" />
                Excel
              </button>
              <button
                onClick={handleExportResultJpeg}
                disabled={!drawData}
                className="flex items-center gap-1.5 bg-orange-500 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-xs sm:text-sm"
              >
                <Image className="w-4 h-4" />
                <span className="hidden sm:inline">結果</span>JPEG
              </button>
              <button
                onClick={handleExportResultExcel}
                disabled={!drawData}
                className="flex items-center gap-1.5 bg-teal-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-xs sm:text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">結果</span>Excel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className="flex items-center gap-1.5 bg-green-600 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors text-xs sm:text-sm"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>

          {selectedPosition !== null && (
            <div className="bg-primary-50 border border-primary-500/30 rounded-md px-4 py-2 text-sm text-primary-600 font-medium shrink-0">
              スロット #{selectedPosition} を選択中 -- 入れ替え先のスロットをタップしてください
            </div>
          )}

          <div className="flex-1 min-h-0 rounded-xl overflow-hidden shadow-sm border border-border-main bg-white">
            {editedSlots.length > 0 && drawData ? (
              viewMode === 'roundRobin' ? (
                <RoundRobinRenderer
                  slots={editedSlots}
                  matchResults={matchResults}
                />
              ) : (
                <DrawRenderer
                  slots={editedSlots}
                  drawSize={drawData.drawSize}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onTap={handleTap}
                  selectedPosition={selectedPosition}
                  matchResults={matchResults}
                  eventType={events.find(e => e.eventId === selectedEventId)?.type}
                  onMatchClick={handleMatchClick}
                />
              )
            ) : (
               <div className="flex flex-col items-center justify-center p-8 h-full bg-primary-50 text-center text-gray-500">
                 <Trophy className="w-16 h-16 mb-4 opacity-20" />
                 <p className="font-semibold">表示できるドローが存在しません</p>
               </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 text-center bg-white rounded-xl border border-border-main shadow-sm h-64">
           <p className="font-semibold text-gray-500">上部のドロップダウンから対象種目を選択してください</p>
        </div>
      )}

      {/* Score input dialog */}
      {scoreMatch && (
        <ScoreInputDialog
          match={scoreMatch}
          courts={courts.filter(c => c.isAvailable).map(c => ({
            courtId: c.courtId,
            name: c.name,
            isAvailable: !occupiedCourtIds.has(c.courtId) || c.courtId === scoreMatch.courtId,
          }))}
          onClose={() => setScoreMatch(null)}
          onMatchUpdate={() => {}}
          getRoundName={makeRoundName}
        />
      )}
    </div>
  );
}
