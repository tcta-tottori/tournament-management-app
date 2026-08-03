import { useMemo } from 'react';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { calculateLeagueStandings } from '../mixed/mixedLogic';
import { calculateTeamStandings, MATCH_TYPE_SHORT } from '../team/teamLogic';
import type { LeagueMatchScore, MixedLeague, LeagueStanding } from '../mixed/types';
import type { TeamLeagueMatch, TeamLeague, TeamLeagueStanding } from '../team/types';
import { MapPin, Info } from 'lucide-react';

// =========================================================================
// 左側固定列（# ＋ 選手名/所属）の寸法
// 画面中央より少し左までを固定表示にして、スコア・勝敗・順位は横スクロールさせる。
// =========================================================================
/** 行番号列の幅(px) */
const NUM_COL_W = 32;
/** 固定表示する左側全体の幅（# ＋ 選手名/所属） */
const FIXED_LEFT_W = 'min(46vw, 300px)';
/** 選手名/所属列の幅 */
const NAME_COL_W = `calc(${FIXED_LEFT_W} - ${NUM_COL_W}px)`;

const numColStyle = { width: NUM_COL_W, minWidth: NUM_COL_W, left: 0 } as const;
const nameColStyle = { width: NAME_COL_W, minWidth: NAME_COL_W, maxWidth: NAME_COL_W, left: NUM_COL_W } as const;
/** 横スクロール側の列幅（ミックス / 団体戦） */
const scoreColStyle = { width: 64, minWidth: 64 } as const;
const teamScoreColStyle = { width: 84, minWidth: 84 } as const;
const recordColStyle = { width: 56, minWidth: 56 } as const;
const rankColStyle = { width: 52, minWidth: 52 } as const;

/** 固定列（ヘッダー行 / データ行）の共通クラス */
const stickyNumCls = 'sticky z-20 px-1 py-2';
const stickyNameCls = 'sticky z-20 px-2 py-2 border-r border-gray-200';

/**
 * 予選リーグ公開ビュー（全リーグを縦に並べて一覧表示）
 * - ミックス大会・団体戦どちらも対応
 * - 編集操作は一切無効（読み取り専用）
 * - 選手名/所属は左側に固定し、スコア・勝敗・順位を横スクロールで見る
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

  const allStandings = useMemo(
    () => calculateLeagueStandings(leagues, leagueMatches, rankOverrides),
    [leagues, leagueMatches, rankOverrides]
  );

  if (leagues.length === 0) {
    return <div className="text-center text-gray-400 py-12">リーグ情報がありません</div>;
  }

  return (
    <div className="space-y-8">
      {leagues.map(league => (
        <MixedLeagueSection
          key={league.leagueId}
          league={league}
          matches={leagueMatches.filter(m => m.leagueId === league.leagueId)}
          standings={allStandings.get(league.leagueId) || []}
        />
      ))}
    </div>
  );
}

function MixedLeagueSection({
  league,
  matches,
  standings,
}: {
  league: MixedLeague;
  matches: LeagueMatchScore[];
  standings: LeagueStanding[];
}) {
  const finished = matches.filter(m => m.status === 'finished').length;
  const total = matches.length;
  const complete = total > 0 && finished === total;

  const matchMap = new Map<string, LeagueMatchScore>();
  for (const m of matches) {
    matchMap.set(`${m.team1Id}-${m.team2Id}`, m);
    matchMap.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  return (
    <section className="space-y-3">
      <LeagueHeaderCard
        title={`${league.leagueId.trim()}リーグ`}
        court={league.courtName}
        finished={finished}
        total={total}
      />

      {/* 対戦結果マトリクス（選手名/所属は左固定、スコア以降は横スクロール） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full w-max">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={`${stickyNumCls} bg-gray-50 text-left text-[11px] text-gray-500`} style={numColStyle}>#</th>
              <th className={`${stickyNameCls} bg-gray-50 text-left text-[11px] text-gray-500`} style={nameColStyle}>
                ペア名 / 所属
              </th>
              {league.teams.map((_, i) => (
                <th key={i} className="px-2 py-2 text-center text-[11px] text-gray-500" style={scoreColStyle}>
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    {i + 1}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-[11px] text-gray-500" style={recordColStyle}>勝敗</th>
              {complete && (
                <th className="px-2 py-2 text-center text-[11px] text-gray-500" style={rankColStyle}>順位</th>
              )}
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team, rowIdx) => {
              const standing = standings.find(s => s.teamId === team.teamId);
              return (
                <tr key={team.teamId} className="border-t border-gray-100">
                  <td className={`${stickyNumCls} bg-white`} style={numColStyle}>
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {rowIdx + 1}
                    </span>
                  </td>
                  <td className={`${stickyNameCls} bg-white`} style={nameColStyle}>
                    <div className="text-sm font-bold text-gray-800 leading-tight truncate">
                      {team.male.name.replace(/[\s\u3000]+/g, '')}
                    </div>
                    <div className="text-sm font-bold text-gray-800 leading-tight truncate">
                      {team.female.name.replace(/[\s\u3000]+/g, '')}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {team.male.affiliation}
                      {team.female.affiliation && team.female.affiliation !== team.male.affiliation
                        ? ` / ${team.female.affiliation}`
                        : ''}
                    </div>
                  </td>
                  {league.teams.map((col, colIdx) => {
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

    </section>
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

  const allStandings = useMemo(
    () => calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder),
    [leagues, leagueMatches, rankOverrides, tiebreakOrder]
  );

  if (leagues.length === 0) {
    return <div className="text-center text-gray-400 py-12">リーグ情報がありません</div>;
  }

  return (
    <div className="space-y-8">
      {leagues.map(league => (
        <TeamLeagueSection
          key={league.leagueId}
          league={league}
          matches={leagueMatches.filter(m => m.leagueId === league.leagueId)}
          standings={allStandings.get(league.leagueId) || []}
        />
      ))}
    </div>
  );
}

function TeamLeagueSection({
  league,
  matches,
  standings,
}: {
  league: TeamLeague;
  matches: TeamLeagueMatch[];
  standings: TeamLeagueStanding[];
}) {
  const finished = matches.filter(m => m.status === 'finished').length;
  const total = matches.length;
  const complete = total > 0 && finished === total;

  const matchMap = new Map<string, TeamLeagueMatch>();
  for (const m of matches) {
    matchMap.set(`${m.team1Id}-${m.team2Id}`, m);
    matchMap.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  return (
    <section className="space-y-3">
      <LeagueHeaderCard
        title={`${league.leagueId.trim()}リーグ`}
        court={league.courtName}
        finished={finished}
        total={total}
      />

      {/* 対戦結果（チーム名は左固定、スコア以降は横スクロール） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full w-max">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={`${stickyNumCls} bg-gray-50 text-left text-[11px] text-gray-500`} style={numColStyle}>#</th>
              <th className={`${stickyNameCls} bg-gray-50 text-left text-[11px] text-gray-500`} style={nameColStyle}>
                チーム
              </th>
              {league.teams.map((_, i) => (
                <th key={i} className="px-2 py-2 text-center text-[11px] text-gray-500" style={teamScoreColStyle}>
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    {i + 1}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-[11px] text-gray-500" style={recordColStyle}>勝敗</th>
              {complete && (
                <th className="px-2 py-2 text-center text-[11px] text-gray-500" style={rankColStyle}>順位</th>
              )}
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team, rowIdx) => {
              const standing = standings.find(s => s.teamId === team.teamId);
              return (
                <tr key={team.teamId} className="border-t border-gray-100">
                  <td className={`${stickyNumCls} bg-white`} style={numColStyle}>
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {rowIdx + 1}
                    </span>
                  </td>
                  <td className={`${stickyNameCls} bg-white`} style={nameColStyle}>
                    <div className="text-sm font-bold text-gray-800 leading-tight truncate">{team.teamName}</div>
                    <div className="text-[10px] text-gray-400">{team.members.length}名</div>
                  </td>
                  {league.teams.map((col, colIdx) => {
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

    </section>
  );
}

// =========================================================================
// 共通パーツ
// =========================================================================

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
