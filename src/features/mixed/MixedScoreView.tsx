import { useMixedStore } from './mixedStore';
import MixedBracketView from './MixedBracketView';
import MixedStandingsView from './MixedStandingsView';
import { AlertCircle } from 'lucide-react';

export default function MixedScoreView() {
  const { brackets, leagueMatches, leagues } = useMixedStore();

  // 全リーグ完了チェック
  const allLeaguesComplete = leagues.every(league => {
    const lMatches = leagueMatches.filter(m => m.leagueId === league.leagueId);
    return lMatches.length > 0 && lMatches.every(m => m.status === 'finished');
  });

  // ブラケット未生成時
  if (brackets.length === 0) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        {!allLeaguesComplete ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto mb-4 text-amber-400 opacity-60" />
            <p className="text-gray-500 text-sm">予選リーグの全試合が完了すると決勝トーナメントを生成できます</p>
            <p className="text-gray-400 text-xs mt-2">予選リーグページでスコアを入力してください</p>
          </div>
        ) : (
          <MixedStandingsView />
        )}
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4">
      <MixedBracketView />
    </div>
  );
}
