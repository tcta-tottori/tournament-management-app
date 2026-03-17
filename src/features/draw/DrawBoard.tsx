import { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import DrawRenderer from './DrawRenderer';
import { exportDrawToExcel } from './DrawExporter';
import { Trophy, Save, AlertCircle, Download } from 'lucide-react';

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
};

export default function DrawBoard() {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [editedSlots, setEditedSlots] = useState<DrawSlotData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);

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
    } else {
       setEditedSlots([]);
       setHasUnsavedChanges(false);
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

            <div className="flex items-center gap-3">
              {selectedPosition !== null && (
                <button
                  onClick={() => setSelectedPosition(null)}
                  className="flex items-center gap-2 bg-primary-50 text-gray-900 px-4 py-2.5 rounded-md font-medium hover:bg-gray-200 shadow-sm transition-colors text-sm"
                >
                  選択解除
                </button>
              )}
              <button
                onClick={handleExportExcel}
                disabled={!drawData}
                className="flex items-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Excel出力
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className="flex items-center gap-2 bg-[#16a34a] text-white px-5 py-2.5 rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : '変更を保存'}
              </button>
            </div>
          </div>

          {selectedPosition !== null && (
            <div className="bg-primary-50 border border-[#2e7d32]/30 rounded-md px-4 py-2 text-sm text-primary-600 font-medium shrink-0">
              スロット #{selectedPosition} を選択中 -- 入れ替え先のスロットをタップしてください
            </div>
          )}

          <div className="flex-1 min-h-0 rounded-xl overflow-hidden shadow-sm border border-border-main bg-white">
            {editedSlots.length > 0 && drawData ? (
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
              />
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
    </div>
  );
}
