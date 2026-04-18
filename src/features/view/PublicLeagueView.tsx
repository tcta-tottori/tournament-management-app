import { useMemo, useState } from 'react';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { calculateLeagueStandings } from '../mixed/mixedLogic';
import { calculateTeamStandings, MATCH_TYPE_SHORT } from '../team/teamLogic';
import type { LeagueMatchScore } from '../mixed/types';
import type { TeamLeagueMatch } from '../team/types';
import { MapPin, Users, Trophy, Info } from 'lucide-react';

/**
 * 予選リーグ公開ビュー
 * - ミックス大会・団体戦どちらも対応
 * - 編集操作は一切無効（読み取り専用）
 */
export default function PublicLeagueView() {
  const mixedImported = useMixedStore(s => s.isImported);
  const teamImported = useTeamStore(s => s.isImported);

  if (mixedImported) return <PublicMixedLeagueView />;
  if (teamImported) return <PublicTeamLeagueView />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
      <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-500 text-sm">予選リーグデータがまだありません。</p>
    </div>
  );
}

// =========================================================================
// ミックス大会版
// =========================================================================

function PublicMixedLeagueView() {
  const leagues = useMixedStore(s => s.leagues);
  const leagueMatches = useMixedStore(s => s.leagueMatches);
  const rankOverrides = useMixedStore(s => s.rankOverrides);

  const [selectedId, setSelectedId] = useState<string>(leagues[0]?.leagueId || '');
  const allStandings = useMemo(
    () => calculateLeagueStandings(leagues, leagueMatches, rankOverrides),
    [leagues, leagueMatches, rankOverrides]
  );

  const selected = leagues.find(l => l.leagueId === selectedId) || leagues[0];
  if (!selected) {
    return <div className="text-center text-gray-400 py-12">リーグ情報がありません</div>;
  }

  const myMatches = leagueMatches.filter(m => m.leagueId === selected.leagueId);
  const finished = myMatches.filter(m => m.status === 'finished').length;
  const total = myMatches.length;
  const complete = total > 0 && finished === total;
  const standings = allStandings.get(selected.leagueId) || [];

  const matchMap = new Map<string, LeagueMatchScore>();
  for (const m of myMatches) {
    matchMap.set(`${m.team1Id}-${m.team2Id}`, m);
    matchMap.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <LeagueSidebar
        leagues={leagues.map(l => ({
          id: l.leagueId,
          label: `${l.leagueId.trim()}リーグ`,
          court: l.courtName,
          finished: leagueMatches.filter(m => m.leagueId === l.leagueId && m.status === 'finished').length,
          total: leagueMatches.filter(m => m.leagueId === l.leagueId).length,
        }))}
        selectedId={selected.leagueId}
        onSelect={setSelectedId}
      />

      <div className="flex-1 space-y-3 min-w-0">
        <LeagueHeaderCard
          title={`${selected.leagueId.trim()}リーグ`}
          court={selected.courtName}
          finished={finished}
          total={total}
        />

        {/* Score matrix */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-left text-[11px] text-gray-500 w-8">#</th>
                <th className="px-2 py-2 text-left text-[11px] text-gray-500">ペア名 / 所属</th>
                {selected.teams.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center text-[11px] text-gray-500 w-16">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {i + 1}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[11px] text-gray-500 w-14">勝敗</th>
                {complete && <th className="px-2 py-2 text-center text-[11px] text-gray-500 w-12">順位</th>}
              </tr>
            </thead>
            <tbody>
              {selected.teams.map((team, rowIdx) => {
                const standing = standings.find(s => s.teamId === team.teamId);
                return (
                  <tr key={team.teamId} className="border-t border-gray-100">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        {rowIdx + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-sm font-bold text-gray-800 leading-tight">
                        {team.male.name.replace(/[\s\u3000]+/g, '')}
                      </div>
                      <div className="text-sm font-bold text-gray-800 leading-tight">
                        {team.female.name.replace(/[\s\u3000]+/g, '')}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {team.male.affiliation}
                        {team.female.affiliation && team.female.affiliation !== team.male.affiliation
                          ? ` / ${team.female.affiliation}`
                          : ''}
                      </div>
                    </td>
                    {selected.teams.map((col, colIdx) => {
                      if (team.teamId === col.teamId) {
                        return (
                          <td key={colIdx} className="relative bg-gray-100 border-l border-gray-100">
                            <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none">
                              <line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1" />
                            </svg>
                          </td>
                        );
                      }
                      const m = matchMap.get(`${team.teamId}-${col.teamId}`);
                      if (!m || m.status !== 'finished') {
                        return (
                          <td key={colIdx} className="px-1 py-2 text-center text-[10px] text-gray-300 border-l border-gray-100">
                            {m?.status === 'playing' ? '試合中' : '―'}
                          </td>
                        );
                      }
                      const isT1 = m.team1Id === team.teamId;
                      const my = isT1 ? m.score1 : m.score2;
                      const opp = isT1 ? m.score2 : m.score1;
                      const won = m.winnerId === team.teamId;
                      const s1 = m.score1 ?? 0;
                      const s2 = m.score2 ?? 0;
                      const isWO = m.winnerId && s1 === 0 && s2 === 0;
                      const isRet =
                        m.winnerId &&
                        !isWO &&
                        ((m.winnerId === m.team1Id && s1 < s2) || (m.winnerId === m.team2Id && s2 < s1));
                      let text: string;
                      if (isWO) text = won ? 'W.O勝' : 'W.O';
                      else if (isRet) text = won ? `${my}-${opp}` : `${my}-${opp} Ret`;
                      else text = `${my}-${opp}`;
                      return (
                        <td
                          key={colIdx}
                          className={`px-1 py-2 text-center text-sm border-l border-gray-100 ${
                            won ? 'bg-emerald-50 text-emerald-700 font-bold' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {text}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center text-sm font-semibold text-gray-700 border-l border-gray-200">
                      {standing ? `${standing.wins}-${standing.losses}` : '-'}
                    </td>
                    {complete && (
                      <td className="px-2 py-2 text-center border-l border-gray-200">
                        {standing && standing.rank > 0 && <RankBadge rank={standing.rank} />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 対戦順 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">対戦順</h3>
          <div className="flex flex-wrap gap-2">
            {selected.matchOrder.map(mo => {
              const match = myMatches.find(m => m.matchNumber === mo.matchNumber);
              const isFinished = match?.status === 'finished';
              const isPlaying = match?.status === 'playing';
              return (
                <div
                  key={mo.matchNumber}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                    isFinished
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isPlaying
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <span className="font-mono text-xs">第{mo.matchNumber}試合</span>
                  <span className="font-bold">
                    {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-
                    {String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                  </span>
                  {isFinished && match && (
                    <span className="text-xs ml-1 text-gray-500">
                      ({match.score1}-{match.score2})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 順位表 */}
        {standings.length > 0 && finished > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              {complete ? '確定順位' : '暫定順位'}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-2 text-center w-10">順位</th>
                  <th className="py-2 px-2 text-left">ペア名</th>
                  <th className="py-2 px-2 text-center w-14">勝敗</th>
                  <th className="py-2 px-2 text-center w-14">取得G</th>
                  <th className="py-2 px-2 text-center w-14">失G</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.teamId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-2 text-center">
                      <RankBadge rank={s.rank} />
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-800">{s.teamName}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-700">
                      {s.wins}-{s.losses}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-600">{s.gamesWon}</td>
                    <td className="py-2 px-2 text-center font-mono text-red-500">{s.gamesLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 団体戦版
// =========================================================================

function PublicTeamLeagueView() {
  const leagues = useTeamStore(s => s.leagues);
  const leagueMatches = useTeamStore(s => s.leagueMatches);
  const rankOverrides = useTeamStore(s => s.rankOverrides);
  const tiebreakOrder = useTeamStore(s => s.tiebreakOrder);

  const [selectedId, setSelectedId] = useState<string>(leagues[0]?.leagueId || '');
  const allStandings = useMemo(
    () => calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder),
    [leagues, leagueMatches, rankOverrides, tiebreakOrder]
  );

  const selected = leagues.find(l => l.leagueId === selectedId) || leagues[0];
  if (!selected) {
    return <div className="text-center text-gray-400 py-12">リーグ情報がありません</div>;
  }

  const myMatches = leagueMatches.filter(m => m.leagueId === selected.leagueId);
  const finished = myMatches.filter(m => m.status === 'finished').length;
  const total = myMatches.length;
  const complete = total > 0 && finished === total;
  const standings = allStandings.get(selected.leagueId) || [];

  const matchMap = new Map<string, TeamLeagueMatch>();
  for (const m of myMatches) {
    matchMap.set(`${m.team1Id}-${m.team2Id}`, m);
    matchMap.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <LeagueSidebar
        leagues={leagues.map(l => ({
          id: l.leagueId,
          label: `${l.leagueId.trim()}リーグ`,
          court: l.courtName,
          finished: leagueMatches.filter(m => m.leagueId === l.leagueId && m.status === 'finished').length,
          total: leagueMatches.filter(m => m.leagueId === l.leagueId).length,
        }))}
        selectedId={selected.leagueId}
        onSelect={setSelectedId}
      />

      <div className="flex-1 space-y-3 min-w-0">
        <LeagueHeaderCard
          title={`${selected.leagueId.trim()}リーグ`}
          court={selected.courtName}
          finished={finished}
          total={total}
        />

        {/* 対戦結果 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-left text-[11px] text-gray-500 w-8">#</th>
                <th className="px-2 py-2 text-left text-[11px] text-gray-500">チーム</th>
                {selected.teams.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center text-[11px] text-gray-500 w-20">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {i + 1}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[11px] text-gray-500 w-14">勝敗</th>
                {complete && <th className="px-2 py-2 text-center text-[11px] text-gray-500 w-12">順位</th>}
              </tr>
            </thead>
            <tbody>
              {selected.teams.map((team, rowIdx) => {
                const standing = standings.find(s => s.teamId === team.teamId);
                return (
                  <tr key={team.teamId} className="border-t border-gray-100">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        {rowIdx + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-sm font-bold text-gray-800 leading-tight">{team.teamName}</div>
                      <div className="text-[10px] text-gray-400">
                        {team.members.length}名
                      </div>
                    </td>
                    {selected.teams.map((col, colIdx) => {
                      if (team.teamId === col.teamId) {
                        return (
                          <td key={colIdx} className="relative bg-gray-100 border-l border-gray-100">
                            <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none">
                              <line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1" />
                            </svg>
                          </td>
                        );
                      }
                      const m = matchMap.get(`${team.teamId}-${col.teamId}`);
                      if (!m || m.status !== 'finished') {
                        return (
                          <td
                            key={colIdx}
                            className="px-1 py-2 text-center text-[10px] text-gray-300 border-l border-gray-100"
                          >
                            {m?.status === 'playing' ? '試合中' : '―'}
                          </td>
                        );
                      }
                      const isT1 = m.team1Id === team.teamId;
                      const myWins = isT1 ? m.winsTeam1 : m.winsTeam2;
                      const oppWins = isT1 ? m.winsTeam2 : m.winsTeam1;
                      const won = m.winnerId === team.teamId;
                      return (
                        <td
                          key={colIdx}
                          className={`px-1 py-1.5 text-center border-l border-gray-100 ${
                            won ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          <div className="text-sm font-bold">
                            {myWins}-{oppWins}
                          </div>
                          <div className="text-[9px] opacity-70 mt-0.5 flex justify-center gap-0.5">
                            {m.subMatches.map(sm => {
                              const smWon = sm.winnerId === team.teamId;
                              return (
                                <span
                                  key={sm.type}
                                  className={`px-0.5 rounded ${
                                    sm.winnerId
                                      ? smWon
                                        ? 'bg-emerald-200 text-emerald-800'
                                        : 'bg-red-200 text-red-700'
                                      : 'bg-gray-100 text-gray-400'
                                  }`}
                                >
                                  {MATCH_TYPE_SHORT[sm.type]}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center text-sm font-semibold text-gray-700 border-l border-gray-200">
                      {standing ? `${standing.wins}-${standing.losses}` : '-'}
                    </td>
                    {complete && (
                      <td className="px-2 py-2 text-center border-l border-gray-200">
                        {standing && standing.rank > 0 && <RankBadge rank={standing.rank} />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 対戦順 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">対戦順</h3>
          <div className="flex flex-wrap gap-2">
            {selected.matchOrder.map(mo => {
              const match = myMatches.find(m => m.matchNumber === mo.matchNumber);
              const isFinished = match?.status === 'finished';
              const isPlaying = match?.status === 'playing';
              return (
                <div
                  key={mo.matchNumber}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                    isFinished
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isPlaying
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <span className="font-mono text-xs">第{mo.matchNumber}試合</span>
                  <span className="font-bold">
                    {String.fromCodePoint(0x2460 + mo.team1Index - 1)}-
                    {String.fromCodePoint(0x2460 + mo.team2Index - 1)}
                  </span>
                  {isFinished && match && (
                    <span className="text-xs ml-1 text-gray-500">
                      ({match.winsTeam1}-{match.winsTeam2})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 順位表 */}
        {standings.length > 0 && finished > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              {complete ? '確定順位' : '暫定順位'}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-2 text-center w-10">順位</th>
                  <th className="py-2 px-2 text-left">チーム名</th>
                  <th className="py-2 px-2 text-center w-14">勝敗</th>
                  <th className="py-2 px-2 text-center w-14">取得P</th>
                  <th className="py-2 px-2 text-center w-14">失P</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.teamId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-2 text-center">
                      <RankBadge rank={s.rank} />
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-800">{s.teamName}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-700">
                      {s.wins}-{s.losses}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-600">{s.pointsWon}</td>
                    <td className="py-2 px-2 text-center font-mono text-red-500">{s.pointsLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// 共通パーツ
// =========================================================================

function LeagueSidebar({
  leagues,
  selectedId,
  onSelect,
}: {
  leagues: { id: string; label: string; court: string; finished: number; total: number }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="md:w-48 md:flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="p-3 border-b border-gray-100 hidden md:block">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-emerald-600" />
          リーグ一覧
        </h3>
      </div>
      <div className="p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {leagues.map(l => {
          const isActive = l.id === selectedId;
          const isComplete = l.total > 0 && l.finished === l.total;
          return (
            <button
              key={l.id}
              onClick={() => onSelect(l.id)}
              className={`shrink-0 md:w-full flex md:items-center items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-sm'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isActive
                    ? 'bg-white/20'
                    : isComplete
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {l.id.trim()}
              </span>
              <span className="flex-1 font-medium whitespace-nowrap">{l.label}</span>
              <span className={`text-[11px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                {l.finished}/{l.total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeagueHeaderCard({
  title,
  court,
  finished,
  total,
}: {
  title: string;
  court: string;
  finished: number;
  total: number;
}) {
  return (
    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-lg font-bold">
          {title.replace('リーグ', '').trim()}
        </div>
        <div>
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          {court && (
            <p className="text-[11px] text-white/80 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {court}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold">
          {finished}/{total} 完了
        </div>
        <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${total > 0 ? (finished / total) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const color =
    rank === 1
      ? 'bg-yellow-400 text-white'
      : rank === 2
      ? 'bg-gray-400 text-white'
      : rank === 3
      ? 'bg-orange-400 text-white'
      : 'bg-gray-200 text-gray-600';
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${color}`}
    >
      {rank}
    </span>
  );
}
