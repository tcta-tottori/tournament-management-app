import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { BracketMatch, MixedTeam, PlacementBracket } from './types';
import { blackCircled, consolationSourceLabel } from './mixedLogic';

/**
 * コンソレーションの試合一覧。
 * トーナメント表の線には乗らないため、表の下にカードで並べる。
 * 運営画面ではタップでコート入れ・スコア入力、公開画面では閲覧のみ。
 */
export default function ConsolationList({ bracket, allTeams, courtAssignments, onMatchClick, onCourtClick }: {
  bracket: PlacementBracket;
  allTeams: MixedTeam[];
  courtAssignments?: Record<string, { courtName: string; startedAt: number }>;
  onMatchClick?: (match: BracketMatch) => void;
  onCourtClick?: (match: BracketMatch) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const defs = bracket.consolation ?? [];
  const matches = bracket.matches.filter(m => m.isConsolation);
  if (defs.length === 0 || matches.length === 0) return null;

  const finished = matches.filter(m => m.status === 'finished').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold text-gray-700">コンソレーション</h3>
        <span className="text-[11px] text-gray-400">{finished}/{matches.length}試合</span>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {defs.map(def => {
          const match = matches.find(m => m.matchNumber === def.number);
          if (!match) return null;
          const ca = courtAssignments?.[match.matchId];
          const ready = !!match.team1Id && !!match.team2Id;
          const clickable = !!onMatchClick && ready;
          const elapsedMin = ca ? Math.floor((now - ca.startedAt) / 60000) : 0;
          return (
            <div
              key={match.matchId}
              onClick={() => clickable && onMatchClick?.(match)}
              className={`rounded-lg border-2 overflow-hidden transition-all
                ${ca ? 'border-primary-400 shadow-md' :
                  match.status === 'finished' ? 'border-primary-300' :
                  ready ? 'border-gray-300' : 'border-gray-200'}
                ${clickable ? 'cursor-pointer hover:shadow-md' : ''}`}
            >
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border-b border-gray-100 text-[11px]">
                <span className="text-sm text-primary-500 leading-none">{blackCircled(def.number)}</span>
                <span className="text-gray-500">{consolationSourceLabel(def.source1)} − {consolationSourceLabel(def.source2)}</span>
              </div>
              <TeamRow match={match} slot="team1" allTeams={allTeams} placeholder={consolationSourceLabel(def.source1)} />
              <div className="border-t border-gray-100" />
              <TeamRow match={match} slot="team2" allTeams={allTeams} placeholder={consolationSourceLabel(def.source2)} />
              {ready && (
                <div className={`flex items-center text-[10px] font-medium border-t border-gray-100 px-2 h-[22px]
                  ${ca ? 'bg-primary-50 text-gray-800' : match.status === 'finished' ? 'bg-gray-50 text-gray-500' : 'bg-primary-50/50 text-gray-700'}`}>
                  {ca ? (
                    <>
                      <button
                        onClick={e => { if (onCourtClick) { e.stopPropagation(); onCourtClick(match); } }}
                        className="flex items-center gap-1 rounded px-1 -ml-1 hover:bg-primary-100"
                      >
                        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                        <span className="font-bold">{ca.courtName}</span>
                        {onCourtClick && <MapPin size={9} className="text-primary-500" />}
                      </button>
                      <span className="ml-auto font-mono">{Math.floor(elapsedMin / 60)}:{String(elapsedMin % 60).padStart(2, '0')}</span>
                    </>
                  ) : match.status === 'finished' ? (
                    <span className="mx-auto text-gray-400">完了</span>
                  ) : match.status === 'playing' ? (
                    <span className="mx-auto flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />試合中</span>
                  ) : (
                    <span className="mx-auto flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary-400" />控え中</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamRow({ match, slot, allTeams, placeholder }: {
  match: BracketMatch;
  slot: 'team1' | 'team2';
  allTeams: MixedTeam[];
  placeholder: string;
}) {
  const teamId = slot === 'team1' ? match.team1Id : match.team2Id;
  const league = slot === 'team1' ? match.team1League : match.team2League;
  const score = slot === 'team1' ? match.score1 : match.score2;
  const team = teamId ? allTeams.find(t => t.teamId === teamId) : undefined;
  const isWinner = !!match.winnerId && match.winnerId === teamId;
  const isLoser = !!match.winnerId && !isWinner;
  const showScore = match.status === 'finished' && score !== null && score >= 0;

  return (
    <div className={`flex items-center gap-1.5 px-2 h-10 text-xs ${isWinner ? 'bg-primary-50' : 'bg-white'}`}>
      {league ? (
        <span className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-[9px] font-bold flex items-center justify-center shrink-0">{league}</span>
      ) : <span className="w-5 shrink-0" />}
      {team ? (
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-[10px] text-gray-400 font-mono w-4 text-center shrink-0">{team.pairNumber}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-800 leading-tight truncate">{team.male.name.replace(/[\s\u3000]+/g, '')}</div>
            <div className="text-sm font-bold text-gray-800 leading-tight truncate">{team.female.name.replace(/[\s\u3000]+/g, '')}</div>
          </div>
        </div>
      ) : (
        <span className="flex-1 text-[11px] text-gray-400">{placeholder}</span>
      )}
      {showScore && (
        <span className={`font-mono font-bold text-base shrink-0 ${isWinner ? 'text-primary-600' : 'text-gray-500'}`}>
          {score}
          {isLoser && match.tiebreakScore != null && (
            <span className="text-[9px] text-gray-500 align-super ml-0.5">({match.tiebreakScore})</span>
          )}
        </span>
      )}
    </div>
  );
}
