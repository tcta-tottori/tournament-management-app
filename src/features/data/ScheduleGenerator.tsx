import { useState, useCallback } from 'react';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Zap, AlertTriangle } from 'lucide-react';
import {
  extractMatchesFromDraw,
  autoSchedule,
  type ScheduleConfig,
  type EventInfo,
  type Entry as ScheduleEntry,
  type Player as SchedulePlayer,
  type Draw as ScheduleDraw,
  type ScheduleMatch,
} from '../schedule/scheduleEngine';

export default function ScheduleGenerator() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);

  const [courtNamesInput, setCourtNamesInput] = useState('1,2,3,4,5,6');
  const [matchDuration, setMatchDuration] = useState(40);
  const [startTime, setStartTime] = useState('09:00');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hasExistingSchedule, setHasExistingSchedule] = useState(false);

  // Check for existing schedule on mount-ish (simple check)
  const checkExisting = useCallback(async () => {
    if (!currentTournamentId) return;
    const events = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
    for (const evt of events) {
      const m = await db.matches.where('eventId').equals(evt.eventId).filter(m => !!m.scheduledTime && !!m.courtId).first();
      if (m) {
        setHasExistingSchedule(true);
        return;
      }
    }
    setHasExistingSchedule(false);
  }, [currentTournamentId]);

  // Run check on render
  useState(() => { checkExisting(); });

  const handleGenerate = useCallback(async () => {
    if (!currentTournamentId) return;

    setIsGenerating(true);
    setResult(null);

    try {
      // Parse court names
      const courtNames = courtNamesInput
        .split(/[,、\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (courtNames.length === 0) {
        setResult('コート名を入力してください。');
        setIsGenerating(false);
        return;
      }

      // Ensure courts exist in DB
      const existingCourts = await db.courts.where('tournamentId').equals(currentTournamentId).toArray();
      const existingCourtNames = new Set(existingCourts.map(c => c.name));

      for (let i = 0; i < courtNames.length; i++) {
        if (!existingCourtNames.has(courtNames[i])) {
          const courtId = `C-${Date.now()}-${i}`;
          await db.courts.add({
            tournamentId: currentTournamentId,
            courtId,
            name: courtNames[i],
            surface: '',
            isAvailable: true,
            currentMatchId: null,
            order: existingCourts.length + i + 1,
          });
        }
      }

      // Re-fetch courts after creation
      const allCourts = await db.courts.where('tournamentId').equals(currentTournamentId).toArray();
      const courtNameToId = new Map(allCourts.map(c => [c.name, c.courtId]));

      // Load all events
      const allEvents = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      if (allEvents.length === 0) {
        setResult('種目が登録されていません。先にデータを読み込んでください。');
        setIsGenerating(false);
        return;
      }

      const allPlayers = await db.players.toArray();
      const playersList: SchedulePlayer[] = allPlayers.map(p => ({
        playerId: p.playerId,
        name: p.name,
      }));

      // Extract matches from all events
      let allScheduleMatches: ScheduleMatch[] = [];

      for (let idx = 0; idx < allEvents.length; idx++) {
        const evt = allEvents[idx];
        const draw = await db.draws.where('eventId').equals(evt.eventId).first();
        if (!draw) continue;

        const entries = await db.entries.where('eventId').equals(evt.eventId).toArray();

        const eventInfo: EventInfo = {
          eventCode: evt.eventId,
          eventName: evt.name,
          eventOrder: idx,
        };

        const drawData: ScheduleDraw = {
          eventId: evt.eventId,
          drawSize: draw.drawSize,
          slots: draw.slots,
        };

        const entryList: ScheduleEntry[] = entries.map(e => ({
          entryId: e.entryId,
          playerId: e.playerId,
          partnerId: e.partnerId,
        }));

        const extracted = extractMatchesFromDraw(drawData, entryList, playersList, eventInfo);
        allScheduleMatches = allScheduleMatches.concat(extracted);
      }

      if (allScheduleMatches.length === 0) {
        setResult('スケジュール対象の試合がありません。ドローデータを先に読み込んでください。');
        setIsGenerating(false);
        return;
      }

      // Run auto-schedule
      const config: ScheduleConfig = {
        courtCount: courtNames.length,
        courtNames,
        matchDuration,
        startTime,
      };

      const slots = autoSchedule(allScheduleMatches, config);

      // Build matchId -> slot map
      const slotMap = new Map(slots.map(s => [s.matchId, s]));

      // Update existing matches in DB
      let updatedCount = 0;
      for (const evt of allEvents) {
        const dbMatches = await db.matches.where('eventId').equals(evt.eventId).toArray();
        for (const m of dbMatches) {
          const scheduled = slotMap.get(m.matchId);
          if (scheduled && m.id) {
            const courtId = courtNameToId.get(scheduled.courtName) || null;
            await db.matches.update(m.id, {
              courtId,
              scheduledTime: scheduled.startTime,
              updatedAt: Date.now(),
            });
            updatedCount++;
          }
        }
      }

      // Create matches that don't exist yet in DB
      let createdCount = 0;
      for (const slot of slots) {
        const schedMatch = allScheduleMatches.find(m => m.matchId === slot.matchId);
        if (!schedMatch) continue;

        const existing = await db.matches.where('matchId').equals(slot.matchId).first();
        if (!existing) {
          const courtId = courtNameToId.get(slot.courtName) || null;
          await db.matches.add({
            eventId: schedMatch.eventCode,
            matchId: slot.matchId,
            round: schedMatch.round,
            matchOrder: schedMatch.matchNumInRound,
            position: schedMatch.matchNumInRound,
            player1EntryId: null,
            player2EntryId: null,
            player1Name: schedMatch.players[0] || '',
            player2Name: schedMatch.players[1] || '',
            player1Affiliation: '',
            player2Affiliation: '',
            score: '',
            winnerEntryId: null,
            courtId,
            scheduledTime: slot.startTime,
            status: 'waiting',
            refereeId: null,
            refereeName: '',
            updatedAt: Date.now(),
          });
          createdCount++;
        }
      }

      // Count unique courts used
      const uniqueCourts = new Set(slots.map(s => s.courtName));

      setResult(
        `自動生成完了: ${slots.length}試合を${uniqueCourts.size}コートにスケジュールしました。` +
        (updatedCount > 0 ? ` (${updatedCount}試合を更新)` : '') +
        (createdCount > 0 ? ` (${createdCount}試合を新規作成)` : '')
      );
      setHasExistingSchedule(true);
    } catch (err) {
      console.error('自動生成エラー:', err);
      setResult(`自動生成に失敗しました: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [currentTournamentId, courtNamesInput, matchDuration, startTime]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#6b7280]">
        ドローデータから全種目の試合スケジュールを自動生成します。コートが未登録の場合は自動作成されます。
      </p>

      {hasExistingSchedule && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
          <p className="text-xs text-[#d97706] font-medium">
            既にスケジュールが設定されています。自動生成を実行すると既存のコート割当・時間が上書きされます。
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#6b7280] mb-1">コート名（カンマ区切り）</label>
          <input
            type="text"
            value={courtNamesInput}
            onChange={e => setCourtNamesInput(e.target.value)}
            placeholder="1,2,3,4,5,6"
            className="w-full border border-[#cbd5e1] rounded-[6px] px-3 py-2 text-sm focus:border-[#1565c0] focus:ring-[3px] focus:ring-[#1565c0]/15 outline-none"
          />
          <p className="text-[10px] text-[#9ca3af] mt-1">例: 1,2,3,4,5,6 または A-1,A-2,B-1</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#6b7280] mb-1">1試合の所要時間（分）</label>
          <input
            type="number"
            min={20}
            max={120}
            value={matchDuration}
            onChange={e => setMatchDuration(parseInt(e.target.value) || 40)}
            className="w-full border border-[#cbd5e1] rounded-[6px] px-3 py-2 text-sm focus:border-[#1565c0] focus:ring-[3px] focus:ring-[#1565c0]/15 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#6b7280] mb-1">開始時刻</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full border border-[#cbd5e1] rounded-[6px] px-3 py-2 text-sm focus:border-[#1565c0] focus:ring-[3px] focus:ring-[#1565c0]/15 outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !currentTournamentId}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#1565c0] rounded-md hover:bg-[#0d47a1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Zap className="w-4 h-4" />
          {isGenerating ? '生成中...' : '自動生成'}
        </button>

        {!currentTournamentId && (
          <p className="text-xs text-[#dc2626]">大会が選択されていません。</p>
        )}
      </div>

      {result && (
        <div className={`p-3 rounded-md text-sm ${
          result.includes('失敗') || result.includes('ありません') || result.includes('ください')
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}
