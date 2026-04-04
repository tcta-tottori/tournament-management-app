import { useEffect, useMemo, useRef } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedBracketView from './MixedBracketView';

export default function MixedScoreView() {
  const { brackets, leagues, leagueMatches, rankOverrides, autoPopulateBrackets, regenerateBrackets } = useMixedStore();
  const hasInitialized = useRef(false);

  // 完了リーグ数チェック
  const completedLeagueIds = useMemo(() => {
    return leagues
      .filter(l => {
        const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
        return lm.length > 0 && lm.every(m => m.status === 'finished');
      })
      .map(l => l.leagueId);
  }, [leagues, leagueMatches]);

  const anyLeagueComplete = completedLeagueIds.length > 0;

  // 完了リーグの順位ハッシュ（変化検出用）
  const standingsHash = useMemo(() => {
    if (completedLeagueIds.length === 0) return '';
    const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
    const parts: string[] = [];
    for (const lid of completedLeagueIds) {
      const ls = standings.get(lid) || standings.get(lid.trim());
      if (ls) {
        parts.push(`${lid}:${ls.map(s => `${s.teamId}@${s.rank}`).join(',')}`);
      }
    }
    return parts.sort().join('|');
  }, [leagues, leagueMatches, rankOverrides, completedLeagueIds]);

  // 完了リーグがゼロなのにブラケットが残っている場合 → 旧データなのでクリア
  useEffect(() => {
    if (!anyLeagueComplete && brackets.length > 0) {
      useMixedStore.setState({ brackets: [], bracketCourtAssignments: {} });
    }
  }, [anyLeagueComplete, brackets.length]);

  // リーグが1つでも完了したらブラケットを生成/更新
  useEffect(() => {
    if (!anyLeagueComplete || leagues.length === 0) return;

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      useMixedStore.setState({ brackets: [], bracketCourtAssignments: {} });
      autoPopulateBrackets();
      return;
    }

    if (brackets.length === 0) {
      autoPopulateBrackets();
    }
  }, [anyLeagueComplete, brackets.length, leagues.length, autoPopulateBrackets]);

  // 完了リーグの順位が変わった場合、ブラケットを自動更新
  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!anyLeagueComplete || brackets.length === 0 || !standingsHash) return;
    regenerateBrackets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsHash, anyLeagueComplete]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <MixedBracketView />
    </div>
  );
}
