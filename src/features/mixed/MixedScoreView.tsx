import { useEffect, useMemo } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedBracketView from './MixedBracketView';

export default function MixedScoreView() {
  const { brackets, leagues, leagueMatches, rankOverrides, autoPopulateBrackets, regenerateBrackets } = useMixedStore();

  // 全リーグ完了チェック
  const allLeaguesComplete = useMemo(() => {
    return leagues.length > 0 && leagues.every(l => {
      const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
  }, [leagues, leagueMatches]);

  // 現在のリーグ順位からブラケットチームの整合性チェック用ハッシュ
  const standingsHash = useMemo(() => {
    if (leagues.length === 0) return '';
    const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
    // 各順位カテゴリごとのチームID配列をハッシュ化
    const parts: string[] = [];
    for (const [leagueId, ls] of standings) {
      parts.push(`${leagueId}:${ls.map(s => `${s.teamId}@${s.rank}`).join(',')}`);
    }
    return parts.sort().join('|');
  }, [leagues, leagueMatches, rankOverrides]);

  // 予選リーグが未完了なのにブラケットが残っている場合 → 旧データなのでクリア
  useEffect(() => {
    if (!allLeaguesComplete && brackets.length > 0) {
      useMixedStore.setState({ brackets: [] });
    }
  }, [allLeaguesComplete, brackets.length]);

  // 全リーグ完了時にブラケットがまだなければ自動生成
  useEffect(() => {
    if (allLeaguesComplete && brackets.length === 0 && leagues.length > 0) {
      autoPopulateBrackets();
    }
  }, [allLeaguesComplete, brackets.length, leagues.length, autoPopulateBrackets]);

  // リーグ順位が変わった場合、試合未開始のブラケットを自動更新（全リーグ完了時のみ）
  useEffect(() => {
    if (!allLeaguesComplete || brackets.length === 0 || !standingsHash) return;
    regenerateBrackets();
    // standingsHash の変化のみでトリガー（brackets は依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsHash, allLeaguesComplete]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <MixedBracketView />
    </div>
  );
}
