import { useState, useCallback } from 'react';
import { Info, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

// ドロー会議システムのlocalStorageキー
const LS_KEY_TOURNAMENTS = 'drawSystem_tournaments';
const LS_KEY_DRAW_RESULTS = 'drawSystem_drawResults';

interface TournamentData {
  id: number;
  name: string;
  events: string;
  date: string;
  dayOfWeek: string;
  venue: string;
  reserveDate: string;
  reserveVenue: string;
  deadline: string;
}

interface DrawResultSummary {
  eventCode: string;
  eventName: string;
  drawSize: number;
  entryCount: number;
  confirmed: boolean;
}

export default function TournamentInfo() {
  const [tournamentData, setTournamentData] = useState<TournamentData[] | null>(null);
  const [drawSummaries, setDrawSummaries] = useState<DrawResultSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadInfo = useCallback(() => {
    setError(null);
    setTournamentData(null);
    setDrawSummaries([]);

    try {
      const tournamentsRaw = localStorage.getItem(LS_KEY_TOURNAMENTS);
      const drawResultsRaw = localStorage.getItem(LS_KEY_DRAW_RESULTS);

      if (!tournamentsRaw && !drawResultsRaw) {
        setError('ドロー会議システムのデータが見つかりません。先にドロー会議システムでデータを読み込んでください。');
        setLoaded(true);
        return;
      }

      // 大会情報
      if (tournamentsRaw) {
        try {
          const parsed = JSON.parse(tournamentsRaw);
          const tournaments: TournamentData[] = parsed.tournaments || [];
          setTournamentData(tournaments);
        } catch {
          setError('大会データの解析に失敗しました。');
        }
      }

      // ドロー結果サマリー
      if (drawResultsRaw) {
        try {
          const parsed = JSON.parse(drawResultsRaw);
          const drawResults = parsed.drawResults || {};
          const confirmedEvents = parsed.confirmedEvents || {};
          const summaries: DrawResultSummary[] = [];

          for (const [code, result] of Object.entries(drawResults)) {
            const r = result as { drawSize: number; entryCount: number; eventName?: string };
            summaries.push({
              eventCode: code,
              eventName: r.eventName || code,
              drawSize: r.drawSize || 0,
              entryCount: r.entryCount || 0,
              confirmed: !!confirmedEvents[code],
            });
          }
          setDrawSummaries(summaries);
        } catch {
          // ドロー結果は任意
        }
      }

      setLoaded(true);
    } catch (err) {
      setError(`読込エラー: ${(err as Error).message}`);
      setLoaded(true);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#6b7280]">ドロー会議システムから大会情報を取得します。</p>
        <button
          onClick={loadInfo}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2e7d32] rounded-md hover:bg-[#1b5e20] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          情報を取得
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loaded && tournamentData && tournamentData.length > 0 && (
        <div className="space-y-3">
          {tournamentData.map((t, idx) => (
            <div key={idx} className="bg-[#f1f8e9] rounded-lg p-3 border border-[#c8e6c9]">
              <h3 className="font-bold text-[#1b5e20] text-sm mb-2 flex items-center gap-1.5">
                <Info className="w-4 h-4" />
                {t.name}
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-[#6b7280]">開催日:</span>
                  <span className="ml-1 font-medium text-[#111827]">{t.date} {t.dayOfWeek && `(${t.dayOfWeek})`}</span>
                </div>
                <div>
                  <span className="text-[#6b7280]">会場:</span>
                  <span className="ml-1 font-medium text-[#111827]">{t.venue}</span>
                </div>
                {t.reserveDate && (
                  <div>
                    <span className="text-[#6b7280]">予備日:</span>
                    <span className="ml-1 font-medium text-[#111827]">{t.reserveDate}</span>
                  </div>
                )}
                {t.reserveVenue && (
                  <div>
                    <span className="text-[#6b7280]">予備会場:</span>
                    <span className="ml-1 font-medium text-[#111827]">{t.reserveVenue}</span>
                  </div>
                )}
                {t.events && (
                  <div className="col-span-2">
                    <span className="text-[#6b7280]">種目:</span>
                    <span className="ml-1 font-medium text-[#111827]">{t.events}</span>
                  </div>
                )}
                {t.deadline && (
                  <div>
                    <span className="text-[#6b7280]">申込期限:</span>
                    <span className="ml-1 font-medium text-[#111827]">{t.deadline}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && drawSummaries.length > 0 && (
        <div className="bg-white rounded-lg border border-[#e0e7ef] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#f1f8e9]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[#6b7280]">種目</th>
                <th className="px-3 py-2 text-right font-medium text-[#6b7280]">エントリー</th>
                <th className="px-3 py-2 text-right font-medium text-[#6b7280]">ドローサイズ</th>
                <th className="px-3 py-2 text-center font-medium text-[#6b7280]">確定</th>
              </tr>
            </thead>
            <tbody>
              {drawSummaries.map(s => (
                <tr key={s.eventCode} className="border-t border-[#e0e7ef]">
                  <td className="px-3 py-1.5 font-medium text-[#111827]">{s.eventName}</td>
                  <td className="px-3 py-1.5 text-right text-[#6b7280]">{s.entryCount}件</td>
                  <td className="px-3 py-1.5 text-right text-[#6b7280]">{s.drawSize}</td>
                  <td className="px-3 py-1.5 text-center">
                    {s.confirmed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a] inline" />
                    ) : (
                      <span className="text-[#d97706] text-[10px]">未確定</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loaded && !error && (!tournamentData || tournamentData.length === 0) && drawSummaries.length === 0 && (
        <p className="text-xs text-[#6b7280] text-center py-2">大会情報がありません。</p>
      )}
    </div>
  );
}
