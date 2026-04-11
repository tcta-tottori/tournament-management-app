import { useEffect, useMemo } from 'react';
import { useTeamStore } from './teamStore';
import { calculateTeamStandings } from './teamLogic';
import TeamBracketView from './TeamBracketView';

export default function TeamScoreView() {
  const {
    brackets, leagues, leagueMatches, rankOverrides, allTeams,
    lastStandingsHash, autoPopulateBrackets, tiebreakOrder,
  } = useTeamStore();

  // ハッシュには順位だけでなく「リーグ完了状態」も含める。
  // 初期状態（全0勝）は stable sort によりチーム順がそのまま 1,2,3... の
  // 順位になり、テスト6-4（team1が常勝）完了後の順位と偶然一致して
  // ハッシュが変わらず、決勝トーナメントが更新されない問題を防ぐ。
  const currentHash = useMemo(() => {
    if (leagues.length === 0) return '';
    const standings = calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder);
    const parts: string[] = [];
    for (const league of leagues) {
      const lid = league.leagueId;
      const lm = leagueMatches.filter(m => m.leagueId === lid);
      const isCompleted = lm.length > 0 && lm.every(m => m.status === 'finished');
      const ls = standings.get(lid) || [];
      parts.push(`${lid}[${isCompleted ? '1' : '0'}]:${ls.map(s => `${s.teamId}@${s.rank}`).join(',')}`);
    }
    return parts.sort().join('|');
  }, [leagues, leagueMatches, rankOverrides, tiebreakOrder]);

  const bracketsStale = useMemo(() => {
    if (brackets.length === 0 || allTeams.length === 0) return false;
    const validTeamIds = new Set(allTeams.map(t => t.teamId));
    for (const b of brackets) {
      for (const m of b.matches) {
        if (m.team1Id && !validTeamIds.has(m.team1Id)) return true;
        if (m.team2Id && !validTeamIds.has(m.team2Id)) return true;
      }
    }
    return false;
  }, [brackets, allTeams]);

  useEffect(() => {
    if (bracketsStale) {
      useTeamStore.setState({ brackets: [], bracketCourtAssignments: {}, lastStandingsHash: '' });
    }
  }, [bracketsStale]);

  useEffect(() => {
    if (leagues.length === 0) return;
    if (brackets.length === 0) {
      autoPopulateBrackets();
      useTeamStore.setState({ lastStandingsHash: currentHash });
    }
  }, [leagues.length, brackets.length, autoPopulateBrackets, currentHash]);

  useEffect(() => {
    if (brackets.length === 0 || !currentHash) return;
    if (!lastStandingsHash) {
      useTeamStore.setState({ lastStandingsHash: currentHash });
      return;
    }
    if (currentHash === lastStandingsHash) return;
    useTeamStore.setState({ brackets: [], bracketCourtAssignments: {}, lastStandingsHash: '' });
  }, [currentHash, lastStandingsHash]);

  return (
    <div>
      <TeamBracketView />
    </div>
  );
}
