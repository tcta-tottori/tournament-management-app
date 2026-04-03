import { useEffect, useMemo } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedBracketView from './MixedBracketView';

export default function MixedScoreView() {
  const { brackets, leagues, leagueMatches, rankOverrides, autoPopulateBrackets, regenerateBrackets } = useMixedStore();

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

  // ブラケットがまだ生成されていなければ自動生成
  useEffect(() => {
    if (brackets.length === 0 && leagues.length > 0) {
      autoPopulateBrackets();
    }
  }, [brackets.length, leagues.length, autoPopulateBrackets]);

  // リーグ順位が変わった場合、試合未開始のブラケットを自動更新
  useEffect(() => {
    if (brackets.length === 0 || !standingsHash) return;
    // 1位ブラケットで試合が始まっていたら全体再生成をスキップ（regenerateBracketsが1st保護する）
    // 2位以降は自動的に再生成される
    const hasAnyStarted = brackets.some(b =>
      b.matches.some(m => m.status === 'finished' || m.status === 'playing')
    );
    if (!hasAnyStarted) {
      // 全ブラケット未開始なら完全再生成
      regenerateBrackets();
    } else {
      // 一部開始済みの場合は regenerateBrackets が1位ブラケットを保護しつつ再生成
      regenerateBrackets();
    }
    // standingsHash の変化のみでトリガー（brackets は依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsHash]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <MixedBracketView />
    </div>
  );
}
