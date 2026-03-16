import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { MonitorPlay, Check, Play, RotateCcw } from 'lucide-react';

export default function Scoreboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const matches = useLiveQuery(
    () => selectedEventId ? db.matches.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const activeMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'playing' || m.status === 'ready')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const waitingMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'waiting' && m.player1Name && m.player2Name)
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const finishedMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'finished' || m.status === 'walkover')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const handleStartMatch = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;
      await db.matches.update(match.id, { status: 'playing', updatedAt: Date.now() });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReadyMatch = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;
      await db.matches.update(match.id, { status: 'ready', updatedAt: Date.now() });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishMatch = async (matchId: string, winnerNum: 1 | 2) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;

      const winnerEntryId = winnerNum === 1 ? match.player1EntryId : match.player2EntryId;

      await db.matches.update(match.id, {
        status: 'finished',
        score: scoreInput || '(スコア未入力)',
        winnerEntryId,
        updatedAt: Date.now()
      });

      const nextRound = match.round + 1;
      const nextPosition = Math.ceil(match.position / 2);
      const nextMatch = await db.matches
        .where('eventId').equals(match.eventId)
        .filter(m => m.round === nextRound && m.position === nextPosition)
        .first();

      if (nextMatch?.id) {
        const winnerName = winnerNum === 1 ? match.player1Name : match.player2Name;
        const winnerAff = winnerNum === 1 ? match.player1Affiliation : match.player2Affiliation;
        const isUpper = match.position % 2 === 1;

        await db.matches.update(nextMatch.id, {
          ...(isUpper
            ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
            : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
          ),
          updatedAt: Date.now()
        });
      }

      setEditingMatchId(null);
      setScoreInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetMatch = async (matchId: string) => {
    if (isProcessing) return;
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    if (!confirm('この試合を待機状態に戻しますか？')) return;
    setIsProcessing(true);
    try {
      const nextRound = match.round + 1;
      const nextPosition = Math.ceil(match.position / 2);
      const nextMatch = await db.matches
        .where('eventId').equals(match.eventId)
        .filter(m => m.round === nextRound && m.position === nextPosition)
        .first();

      if (nextMatch?.id) {
        const isUpper = match.position % 2 === 1;
        await db.matches.update(nextMatch.id, {
          ...(isUpper
            ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
            : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
          ),
          updatedAt: Date.now()
        });
      }

      await db.matches.update(match.id, {
        status: 'waiting',
        score: '',
        winnerEntryId: null,
        updatedAt: Date.now()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignCourt = async (matchId: string, courtId: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { courtId: courtId || null, updatedAt: Date.now() });
  };

  const getCourtName = (courtId: string | null) => {
    if (!courtId) return '';
    return courts.find(c => c.courtId === courtId)?.name || courtId;
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-[#2e7d32]" />
            スコアボード
          </h1>
          <p className="text-sm text-[#6b7280] mt-1">
            試合の進行管理とスコア入力を行います。
          </p>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full sm:w-64 border-[#cbd5e1] rounded-[6px] shadow-sm focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name}</option>
            ))}
          </select>
        </div>
      </header>

      {!selectedEventId ? (
        <div className="flex items-center justify-center p-8 bg-white rounded-[10px] border border-[#e0e7ef] shadow-sm h-64">
          <p className="font-semibold text-[#6b7280]">種目を選択してください</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-auto">
          {/* 試合中 */}
          {activeMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-[#16a34a] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Play className="w-4 h-4" /> 進行中 ({activeMatches.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {activeMatches.map(m => (
                  <div key={m.matchId} className="bg-white rounded-[10px] shadow-sm border-2 border-[#16a34a]/40 p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-mono text-[#6b7280]">#{m.matchOrder} R{m.round}</span>
                      {m.courtId && <span className="text-xs bg-[#e8f5e9] text-[#2e7d32] px-2 py-0.5 rounded font-medium">{getCourtName(m.courtId)}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'playing' ? 'bg-green-100 text-[#16a34a]' : 'bg-[#e8f5e9] text-[#2e7d32]'}`}>
                        {m.status === 'playing' ? '試合中' : '準備完了'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-[#111827]">{m.player1Name}</p>
                          <p className="text-xs text-[#6b7280]">{m.player1Affiliation}</p>
                        </div>
                        {editingMatchId === m.matchId && (
                          <button
                            onClick={() => handleFinishMatch(m.matchId, 1)}
                            disabled={isProcessing}
                            className="ml-2 bg-[#2e7d32] text-white text-sm px-3 py-2 rounded-md font-medium hover:bg-[#256b28] disabled:opacity-50"
                          >
                            勝利
                          </button>
                        )}
                      </div>
                      <div className="text-center text-xs text-[#6b7280]">vs</div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-[#111827]">{m.player2Name}</p>
                          <p className="text-xs text-[#6b7280]">{m.player2Affiliation}</p>
                        </div>
                        {editingMatchId === m.matchId && (
                          <button
                            onClick={() => handleFinishMatch(m.matchId, 2)}
                            disabled={isProcessing}
                            className="ml-2 bg-[#2e7d32] text-white text-sm px-3 py-2 rounded-md font-medium hover:bg-[#256b28] disabled:opacity-50"
                          >
                            勝利
                          </button>
                        )}
                      </div>
                    </div>
                    {editingMatchId === m.matchId ? (
                      <div className="mt-3 pt-3 border-t border-[#e0e7ef]">
                        <input
                          type="text"
                          placeholder="スコア (例: 6-4 6-3)"
                          value={scoreInput}
                          onChange={e => setScoreInput(e.target.value)}
                          className="w-full border border-[#cbd5e1] rounded-[6px] px-2 py-1 text-sm mb-2 focus:border-[#2e7d32] focus:ring-[3px] focus:ring-[#2e7d32]/15 outline-none"
                        />
                        <p className="text-xs text-[#6b7280]">スコア入力後、勝者ボタンを押してください</p>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-[#e0e7ef] flex gap-2">
                        {m.status === 'ready' && (
                          <button onClick={() => handleStartMatch(m.matchId)} disabled={isProcessing} className="text-xs bg-[#16a34a] text-white px-3 py-1 rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50">
                            開始
                          </button>
                        )}
                        {m.status === 'playing' && (
                          <button onClick={() => { setEditingMatchId(m.matchId); setScoreInput(''); }} className="text-xs bg-[#2e7d32] text-white px-3 py-1 rounded-md font-medium hover:bg-[#256b28]">
                            <Check className="w-3 h-3 inline mr-1" />結果入力
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 待機中 */}
          {waitingMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-[#6b7280] uppercase tracking-wider mb-3">
                待機中 ({waitingMatches.length})
              </h2>
              <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[#f1f8e9] text-xs font-semibold text-[#111827]">
                    <tr>
                      <th className="py-2 px-3 w-10 border-b-2 border-[#e0e7ef]">#</th>
                      <th className="py-2 px-3 border-b-2 border-[#e0e7ef]">対戦</th>
                      <th className="py-2 px-3 w-32 border-b-2 border-[#e0e7ef]">コート</th>
                      <th className="py-2 px-3 w-24 border-b-2 border-[#e0e7ef]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingMatches.map((m, idx) => (
                      <tr key={m.matchId} className={`border-b border-[#e0e7ef] hover:bg-[#e8f5e9] ${idx % 2 === 1 ? 'bg-[#f6f9fc]' : ''}`}>
                        <td className="py-2 px-3 font-mono text-[#6b7280]">{m.matchOrder}</td>
                        <td className="py-2 px-3">
                          <span className="font-medium">{m.player1Name}</span>
                          <span className="text-[#6b7280] mx-2">vs</span>
                          <span className="font-medium">{m.player2Name}</span>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={m.courtId || ''}
                            onChange={e => handleAssignCourt(m.matchId, e.target.value)}
                            className="w-full border-[#cbd5e1] rounded-[6px] text-xs px-2 py-1 bg-white border"
                          >
                            <option value="">未割当</option>
                            {courts.filter(c => c.isAvailable).map(c => (
                              <option key={c.courtId} value={c.courtId}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <button
                            onClick={() => handleReadyMatch(m.matchId)}
                            disabled={isProcessing}
                            className="text-xs bg-[#2e7d32] text-white px-3 py-1 rounded-md font-medium hover:bg-[#256b28] disabled:opacity-50"
                          >
                            準備完了
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 終了済み */}
          {finishedMatches.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-[#2e7d32] uppercase tracking-wider mb-3">
                終了 ({finishedMatches.length})
              </h2>
              <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-[#f1f8e9] text-xs font-semibold text-[#111827]">
                    <tr>
                      <th className="py-2 px-3 w-10 border-b-2 border-[#e0e7ef]">#</th>
                      <th className="py-2 px-3 border-b-2 border-[#e0e7ef]">勝者</th>
                      <th className="py-2 px-3 border-b-2 border-[#e0e7ef]">敗者</th>
                      <th className="py-2 px-3 w-28 border-b-2 border-[#e0e7ef]">スコア</th>
                      <th className="py-2 px-3 w-16 border-b-2 border-[#e0e7ef]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishedMatches.map((m, idx) => {
                      const isP1Winner = m.winnerEntryId === m.player1EntryId;
                      const winner = isP1Winner ? m.player1Name : m.player2Name;
                      const loser = isP1Winner ? m.player2Name : m.player1Name;
                      return (
                        <tr key={m.matchId} className={`border-b border-[#e0e7ef] hover:bg-[#e8f5e9] ${idx % 2 === 1 ? 'bg-[#f6f9fc]' : ''}`}>
                          <td className="py-2 px-3 font-mono text-[#6b7280]">{m.matchOrder}</td>
                          <td className="py-2 px-3 font-bold text-[#111827]">{winner}</td>
                          <td className="py-2 px-3 text-[#6b7280]">{loser || 'BYE'}</td>
                          <td className="py-2 px-3 font-mono">{m.score || (m.status === 'walkover' ? 'W/O' : '-')}</td>
                          <td className="py-2 px-3">
                            <button onClick={() => handleResetMatch(m.matchId)} disabled={isProcessing} className="text-[#6b7280] hover:text-[#111827] disabled:opacity-50" title="リセット">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {matches.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-[10px] border border-dashed border-[#e0e7ef]">
              <MonitorPlay className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-[#6b7280]">S-06で試合を生成してください</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
