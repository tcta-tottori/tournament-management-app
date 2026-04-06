import { useEffect, useMemo } from 'react';
import { useTeamStore } from './teamStore';
import { calculateTeamStandings } from './teamLogic';
import TeamBracketView from './TeamBracketView';

export default function TeamScoreView() {
  const {
    brackets, leagues, leagueMatches, rankOverrides, allTeams,
    lastStandingsHash, autoPopulateBrackets,
  } = useTeamStore();

  const currentHash = useMemo(() => {
    if (leagues.length === 0) return '';
    const standings = calculateTeamStandings(leagues, leagueMatches, rankOverrides);
    const parts: string[] = [];
    for (const [leagueId, ls] of standings) {
      parts.push(`${leagueId}:${ls.map(s => `${s.teamId}@${s.rank}`).join(',')}`);
    }
    return parts.sort().join('|');
  }, [leagues, leagueMatches, rankOverrides]);

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
    <div className="p-2 sm:p-4 space-y-4">
      <TeamBracketView />
    </div>
  );
}
