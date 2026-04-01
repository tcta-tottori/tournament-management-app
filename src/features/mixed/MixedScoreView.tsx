import { useEffect, useMemo } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedBracketView from './MixedBracketView';
import MixedStandingsView from './MixedStandingsView';
import { Trophy, CheckCircle, Clock } from 'lucide-react';
import type { PlacementCategory } from './types';

const CATEGORIES: { cat: PlacementCategory; label: string; desc: string; color: string }[] = [
  { cat: '1st', label: '1位トーナメント', desc: '各リーグ1位（抽選）', color: 'yellow' },
  { cat: '2nd', label: '2位トーナメント', desc: '各リーグ2位', color: 'gray' },
  { cat: '3rd', label: '3位トーナメント', desc: '各リーグ3位', color: 'orange' },
  { cat: '4th', label: '4-5位トーナメント', desc: '各リーグ4位以下', color: 'slate' },
];

export default function MixedScoreView() {
  const { brackets, leagueMatches, leagues, autoPopulateBrackets } = useMixedStore();

  const allLeaguesComplete = leagues.every(league => {
    const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
    return lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
  });

  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;

  // 全リーグ完了時にブラケットがまだなければ自動生成 (2位以降)
  useEffect(() => {
    if (allLeaguesComplete && brackets.length === 0) {
      autoPopulateBrackets();
    }
  }, [allLeaguesComplete, brackets.length, autoPopulateBrackets]);

  // 完了したリーグから順位を取得
  const allStandings = useMemo(() => calculateLeagueStandings(leagues, leagueMatches), [leagues, leagueMatches]);
  const completedLeagues = leagues.filter(l => {
    const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
    return lm.length > 0 && lm.every(m => m.status === 'finished');
  });

  // ブラケット生成済み: ブラケット表示 + プレビュー
  if (brackets.length > 0) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <MixedBracketView />
      </div>
    );
  }

  // ブラケット未生成: プレビュー表示
  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* トーナメント構造プレビュー */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
          <Trophy size={16} className="text-yellow-500" />
          決勝トーナメント構成
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map(({ cat, label, desc, color }) => {
            // 完了リーグから該当順位のチームを収集、未完了リーグもプレースホルダー表示
            const teamsForCat: { teamName: string; league: string; confirmed: boolean }[] = [];
            const rank = cat === '1st' ? 1 : cat === '2nd' ? 2 : cat === '3rd' ? 3 : 4;

            for (const league of leagues) {
              const isComplete = completedLeagues.some(cl => cl.leagueId === league.leagueId);
              const standings = allStandings.get(league.leagueId) || [];

              if (rank <= 3) {
                if (isComplete) {
                  const entry = standings.find(s => s.rank === rank);
                  if (entry) teamsForCat.push({ teamName: entry.teamName, league: league.leagueId.trim(), confirmed: true });
                } else {
                  teamsForCat.push({ teamName: `${league.leagueId.trim()}リーグ ${rank}位`, league: league.leagueId.trim(), confirmed: false });
                }
              } else {
                if (isComplete) {
                  const entries = standings.filter(s => s.rank >= 4);
                  for (const e of entries) teamsForCat.push({ teamName: e.teamName, league: league.leagueId.trim(), confirmed: true });
                } else {
                  teamsForCat.push({ teamName: `${league.leagueId.trim()}リーグ 4位以下`, league: league.leagueId.trim(), confirmed: false });
                }
              }
            }

            const confirmedCount = teamsForCat.filter(t => t.confirmed).length;
            const bgClass = color === 'yellow' ? 'bg-yellow-50 border-yellow-200'
              : color === 'gray' ? 'bg-gray-50 border-gray-200'
              : color === 'orange' ? 'bg-orange-50 border-orange-200'
              : 'bg-slate-50 border-slate-200';

            return (
              <div key={cat} className={`rounded-lg border p-3 ${bgClass}`}>
                <div className="text-xs font-bold text-gray-700 mb-1">{label}</div>
                <div className="text-[10px] text-gray-500 mb-2">{desc}</div>

                <div className="space-y-0.5 mb-2">
                  {teamsForCat.map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1">
                        {t.confirmed ? (
                          <CheckCircle size={9} className="text-emerald-500" />
                        ) : (
                          <Clock size={9} className="text-gray-300" />
                        )}
                        <span className={t.confirmed ? 'text-gray-700' : 'text-gray-400 italic'}>{t.teamName}</span>
                      </span>
                      <span className="text-gray-400">{t.league}</span>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] text-gray-400 mt-1">
                  確定: {confirmedCount} / {teamsForCat.length}チーム
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-gray-400">
          予選リーグ進捗: {totalFinished}/{totalMatches} 試合完了
          {completedLeagues.length > 0 && (
            <span className="text-emerald-600 ml-2">
              {completedLeagues.length}/{leagues.length}リーグ完了
              ({completedLeagues.map(l => l.leagueId.trim()).join(', ')})
            </span>
          )}
          {!allLeaguesComplete && ' — 全リーグ完了後にトーナメントが自動生成されます'}
        </div>
      </div>

      {/* 全リーグ完了時: 順位表 + 生成ボタン */}
      {allLeaguesComplete && <MixedStandingsView />}
    </div>
  );
}
