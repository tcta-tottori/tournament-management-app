import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { DrawEngine } from './DrawEngine';
import type { DrawEntry } from './DrawEngine';
import { Dices, Save, RefreshCw, Users } from 'lucide-react';

export default function DrawGenerator() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const setCurrentTournamentId = useAppStore(state => state.setCurrentTournamentId);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [generatedDraw, setGeneratedDraw] = useState<{ draw: DrawEntry[], drawSize: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  const currentEvent = useMemo(() => events.find(e => e.eventId === selectedEventId), [events, selectedEventId]);
  const activeEntries = useMemo(() => entries.filter(e => e.status === 'active'), [entries]);

  const savedDraw = useLiveQuery(
    () => selectedEventId ? db.draws.where('eventId').equals(selectedEventId).first() : undefined,
    [selectedEventId]
  );

  const handleGenerateDraw = () => {
    if (!currentEvent || activeEntries.length === 0) return;

    const playersForDraw = activeEntries.map(entry => {
      const p1 = players.find(p => p.playerId === entry.playerId);
      const isDoubles = !!entry.partnerId;
      const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;

      const name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || 'Unknown');
      const furigana = isDoubles && p1 && p2 ? `${p1.furigana} / ${p2.furigana}` : (p1?.furigana || '');

      let affiliation = p1?.affiliation || '';
      if (isDoubles && p2 && p2.affiliation && p2.affiliation !== p1?.affiliation) {
        affiliation = `${p1?.affiliation} / ${p2.affiliation}`;
      }

      return {
        entryId: entry.entryId,
        playerId: entry.playerId,
        name,
        furigana,
        affiliation,
        points: entry.rankPoint || 0,
        id: p1?.id,
        rankings: p1?.rankings || {},
        isManual: p1?.isManual || false,
      };
    });

    const result = DrawEngine.generateDraw(playersForDraw as any);
    setGeneratedDraw(result);
  };

  const handleSaveDraw = async () => {
    if (!selectedEventId || !generatedDraw) return;
    setIsSaving(true);
    try {
      const existing = await db.draws.where('eventId').equals(selectedEventId).first();

      const drawData = {
        eventId: selectedEventId,
        drawSize: generatedDraw.drawSize,
        slots: generatedDraw.draw.map(d => ({
          position: d.position,
          entryId: d.entryId,
          seed: d.seed,
          isBye: d.isBye
        })),
        updatedAt: Date.now()
      };

      if (existing && existing.id) {
        await db.draws.update(existing.id, drawData);
      } else {
        await db.draws.add(drawData);
      }

      alert('ドローを保存しました。');
      setGeneratedDraw(null);
    } catch (error) {
      console.error('ドロー保存エラー:', error);
      alert('保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertTestData = async () => {
    try {
      const tId = currentTournamentId || 'T-TEST-001';
      const eId = 'E-MS-TEST';
      await db.events.put({
        tournamentId: tId,
        eventId: eId,
        name: '[テスト] 男子シングルス',
        type: 'Singles',
        gameRules: { sets: 1, games: 6, deuce: true, tiebreakPoint: 7 }
      });

      const testPlayers = [];
      const testEntries = [];
      for(let i=1; i<=12; i++) {
        const team = i <= 4 ? 'A-Team' : (i <= 8 ? 'B-Team' : 'C-Team');
        const pId = `P-TEST-${i}`;
        testPlayers.push({
          playerId: pId,
          name: `テスト選手 ${i}`,
          furigana: `テストセンシュ ${i}`,
          affiliation: team,
          rankings: { [eId]: 1000 - i * 10 },
          isManual: false
        });
        testEntries.push({
          eventId: eId,
          entryId: `EN-TEST-${i}`,
          playerId: pId,
          rankPoint: 1000 - i * 10,
          status: 'active' as const
        });
      }
      await db.players.bulkPut(testPlayers);
      await db.entries.bulkPut(testEntries);

      setCurrentTournamentId(tId);

      alert('テスト用データを投入しました！対象種目プルダウンから「[テスト] 男子シングルス」を選択してください。');
      setSelectedEventId(eId);
    } catch(err) {
      console.error(err);
      alert('テストデータ投入失敗');
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Dices className="w-6 h-6 text-primary-500" />
            抽選・ドロー作成
            {import.meta.env.DEV && (
              <button
                onClick={handleInsertTestData}
                className="ml-4 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-normal px-2 py-1 rounded-md shadow-sm"
                title="テスト用データをDBに投入"
              >
                [DEBUG] テストデータ投入
              </button>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            対象種目を選択し、シード配置・同所属分離を考慮したドローを自動生成します。
          </p>
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-900 whitespace-nowrap">対象種目:</label>
          <select
            value={selectedEventId}
            onChange={e => {
              setSelectedEventId(e.target.value);
              setGeneratedDraw(null);
            }}
            className="w-full sm:w-64 border-border-main rounded-lg shadow-sm focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 text-sm px-3 py-2 bg-white border outline-none font-medium"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
            ))}
          </select>
        </div>
      </header>

      {selectedEventId && currentEvent ? (
        <div className="flex-1 flex flex-col gap-4">
          {/* コントロールパネル */}
          <div className="bg-white rounded-xl shadow-sm border border-border-main p-5 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-primary-50 p-3 rounded-md flex items-center gap-3">
                <Users className="w-6 h-6 text-primary-500" />
                <div>
                  <p className="text-xs text-gray-500 font-medium tracking-wider uppercase">有効エントリー数</p>
                  <p className="text-xl font-bold text-primary-600">{activeEntries.length} <span className="text-sm font-normal text-primary-500">組</span></p>
                </div>
              </div>

              {savedDraw ? (
                <div className="bg-green-50 text-[#16a34a] px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 border border-green-200">
                  <Save className="w-4 h-4" />
                  保存済みドローあり
                </div>
              ) : (
                <div className="bg-primary-50 text-gray-500 px-3 py-1.5 rounded-full text-sm font-medium border border-border-main">
                  未抽選
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto outline-none">
              <button
                onClick={handleGenerateDraw}
                disabled={activeEntries.length === 0}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {savedDraw || generatedDraw ? '再抽選を実行' : '抽選を実行する'}
              </button>

              {(generatedDraw || savedDraw) && (
                <button
                  onClick={handleSaveDraw}
                  disabled={!generatedDraw || isSaving}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#16a34a] text-white px-5 py-2.5 rounded-md font-medium hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? '保存中...' : '確定して保存'}
                </button>
              )}
            </div>
          </div>

          {/* プレビュー表示エリア */}
          {generatedDraw ? (
            <div className="bg-white rounded-xl shadow-sm border border-border-main flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b-2 border-border-main bg-primary-50 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  ドロー生成プレビュー <span className="text-sm font-normal text-gray-500">(サイズ: {generatedDraw.drawSize})</span>
                </h3>
              </div>
              <div className="overflow-auto p-0 flex-1 bg-[#f6f9fc]/50">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-primary-50 text-sm font-semibold text-gray-900 sticky top-0">
                    <tr>
                      <th className="py-3 px-4 w-16 text-center border-b-2 border-border-main">No.</th>
                      <th className="py-3 px-4 border-b-2 border-border-main">シード</th>
                      <th className="py-3 px-4 border-b-2 border-border-main">選手名 / ペア名</th>
                      <th className="py-3 px-4 border-b-2 border-border-main">所属</th>
                      <th className="py-3 px-4 border-b-2 border-border-main text-right">ポイント</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {generatedDraw.draw.map((d, index) => {
                      const isMatchBottom = index % 2 === 1;

                      return (
                        <tr
                          key={index}
                          className={`
                            ${d.isBye ? 'bg-primary-50/70 text-gray-500 italic' : index % 2 === 0 ? 'bg-white' : 'bg-[#f6f9fc]'}
                            ${isMatchBottom ? 'border-b-2 border-border-main' : 'border-b border-border-main'}
                            hover:bg-primary-50 transition-colors
                          `}
                        >
                          <td className="py-2.5 px-4 text-center font-mono text-gray-500">{d.position}</td>
                          <td className="py-2.5 px-4">
                            {d.seed > 0 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-500 font-bold text-xs">
                                {d.seed}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4 font-medium font-sans">
                            {d.isBye ? 'BYE' : d.name}
                          </td>
                          <td className="py-2.5 px-4 text-gray-500 text-xs">{d.affiliation}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-gray-500">{d.isBye ? '-' : (d.points > 0 ? d.points : 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-border-main shadow-sm border-dashed">
              <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-4 text-gray-500">
                <Dices className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ドローを作成しましょう</h3>
              <p className="text-gray-500 max-w-md">
                「抽選を実行する」ボタンを押すと、JTAルールに則ったシード配置・BYE均等分散と、同所属分離を自動計算したドロー表が生成されます。
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 text-center bg-white rounded-xl border border-border-main shadow-sm h-64">
           <p className="font-semibold text-gray-500">上部のドロップダウンから対象種目を選択してください</p>
        </div>
      )}
    </div>
  );
}
