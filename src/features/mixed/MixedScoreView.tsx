import { useEffect, useMemo } from 'react';
import { useMixedStore } from './mixedStore';
import { calculateLeagueStandings } from './mixedLogic';
import MixedBracketView from './MixedBracketView';

export default function MixedScoreView() {
  const {
    brackets, leagues, leagueMatches, rankOverrides, allTeams,
    lastStandingsHash, autoPopulateBrackets,
  } = useMixedStore();

  // 全リーグの順位ハッシュ（変化検出用）
  const currentHash = useMemo(() => {
    if (leagues.length === 0) return '';
    const standings = calculateLeagueStandings(leagues, leagueMatches, rankOverrides);
    const parts: string[] = [];
    for (const [leagueId, ls] of standings) {
      parts.push(`${leagueId}:${ls.map(s => `${s.teamId}@${s.rank}`).join(',')}`);
    }
    return parts.sort().join('|');
  }, [leagues, leagueMatches, rankOverrides]);

  // ブラケットが現在の大会データと整合しているか検証
  // （persist hydration で旧大会のブラケットが復元された場合を検出）
  const bracketsStale = useMemo(() => {
    if (brackets.length === 0 || allTeams.length === 0) return false;
    const validTeamIds = new Set(allTeams.map(t => t.teamId));
    // ブラケット内のチームIDが現在の大会に存在するかチェック
    for (const b of brackets) {
      for (const m of b.matches) {
        if (m.team1Id && !validTeamIds.has(m.team1Id)) return true;
        if (m.team2Id && !validTeamIds.has(m.team2Id)) return true;
      }
    }
    return false;
  }, [brackets, allTeams]);

  // 旧大会のブラケットが検出されたら即座にクリア
  useEffect(() => {
    if (bracketsStale) {
      useMixedStore.setState({ brackets: [], bracketCourtAssignments: {}, lastStandingsHash: '' });
    }
  }, [bracketsStale]);

  // リーグが存在すればブラケットを常に生成（予選未完了でも構造を表示）
  useEffect(() => {
    if (leagues.length === 0) return;
    if (brackets.length === 0) {
      autoPopulateBrackets();
      useMixedStore.setState({ lastStandingsHash: currentHash });
    }
  }, [leagues.length, brackets.length, autoPopulateBrackets, currentHash]);

  // 順位が変わった場合、ブラケットを完全に再生成
  useEffect(() => {
    if (brackets.length === 0 || !currentHash) return;
    if (!lastStandingsHash) {
      useMixedStore.setState({ lastStandingsHash: currentHash });
      return;
    }
    if (currentHash === lastStandingsHash) return;
    useMixedStore.setState({ brackets: [], bracketCourtAssignments: {}, lastStandingsHash: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHash, lastStandingsHash]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <MixedBracketView />
    </div>
  );
}
