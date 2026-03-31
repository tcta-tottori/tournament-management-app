import { useMixedStore } from './mixedStore';
import MixedBracketView from './MixedBracketView';
import MixedStandingsView from './MixedStandingsView';
import { Trophy } from 'lucide-react';

export default function MixedScoreView() {
  const { brackets, leagueMatches, leagues } = useMixedStore();

  const allLeaguesComplete = leagues.every(league => {
    const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
    return lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
  });

  const totalFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const totalMatches = leagueMatches.length;

  // ブラケット生成済み
  if (brackets.length > 0) {
    return (
      <div className="p-2 sm:p-4">
        <MixedBracketView />
      </div>
    );
  }

  // ブラケット未生成
  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* トーナメント構造プレビュー */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
          <Trophy size={16} className="text-yellow-500" />
          決勝トーナメント構成
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '1位トーナメント', desc: '各リーグ1位', color: 'yellow' },
            { label: '2位トーナメント', desc: '各リーグ2位', color: 'gray' },
            { label: '3位トーナメント', desc: '各リーグ3位', color: 'orange' },
            { label: '4-5位トーナメント', desc: '各リーグ4位以下', color: 'slate' },
          ].map(({ label, desc, color }) => (
            <div key={label} className={`p-3 rounded-lg border bg-${color}-50 border-${color}-200`}>
              <div className="text-xs font-bold text-gray-700">{label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{desc}</div>
              <div className="text-[10px] text-gray-400 mt-1">{leagues.length}チーム → トーナメント</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-gray-400">
          予選リーグ進捗: {totalFinished}/{totalMatches} 試合完了
          {!allLeaguesComplete && ' — 全リーグ完了後にトーナメントを生成できます'}
        </div>
      </div>

      {/* 全リーグ完了時: 順位表 + 生成ボタン */}
      {allLeaguesComplete && <MixedStandingsView />}
    </div>
  );
}
