import { useState, useEffect, useMemo } from 'react';
import { useTeamStore } from './teamStore';
import { MapPin, Play, CheckCircle, Trophy, BarChart2, Users } from 'lucide-react';
import type { TeamLeague, TeamLeagueMatch } from './types';
import { parseCourtNumbers } from './teamLogic';

/** SVG コートライン（縦向き） */
function VerticalCourtLines({ status }: { status: 'playing' | 'ready' | 'complete' | 'empty' }) {
  const color = status === 'playing' ? 'rgba(22,163,74,0.15)'
    : status === 'ready' ? 'rgba(59,130,246,0.1)'
    : status === 'complete' ? 'rgba(16,185,129,0.08)'
    : 'rgba(0,0,0,0.04)';
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 160" preserveAspectRatio="none">
      <rect x="5" y="5" width="90" height="150" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="5" y1="80" x2="95" y2="80" stroke={color} strokeWidth="1" />
      <line x1="50" y1="5" x2="50" y2="155" stroke={color} strokeWidth="1" />
      <rect x="20" y="5" width="60" height="150" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** ドーナツチャートコンポーネント */
function DonutChart({ percent, finished, total }: { percent: number; finished: number; total: number }) {
  const radius = 44;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const finishedArc = (percent / 100) * circumference;
  return (
    <div className="relative">
      <svg width={radius * 2 + stroke + 4} height={radius * 2 + stroke + 4} className="transform -rotate-90">
        <circle cx={radius + stroke / 2 + 2} cy={radius + stroke / 2 + 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={radius + stroke / 2 + 2} cy={radius + stroke / 2 + 2} r={radius} fill="none" stroke="#3b82f6" strokeWidth={stroke}
          strokeDasharray={`${finishedArc} ${circumference}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-gray-900">{percent}%</span>
        <span className="text-[9px] text-gray-400 font-medium">{finished}/{total}</span>
      </div>
    </div>
  );
}

/** リーグのコート状態を判定 */
function getLeagueCourtStatus(_league: TeamLeague, lMatches: TeamLeagueMatch[]) {
  const finished = lMatches.filter(m => m.status === 'finished').length;
  const total = lMatches.length;
  const isComplete = finished === total && total > 0;
  const nextMatch = lMatches
    .filter(m => m.status !== 'finished')
    .sort((a, b) => a.matchNumber - b.matchNumber)[0] || null;

  const status = isComplete ? 'complete' as const
    : (finished > 0) ? 'playing' as const
    : nextMatch ? 'ready' as const
    : 'empty' as const;

  return { finished, total, isComplete, nextMatch, status };
}

export default function TeamLiveCourtView() {
  const { leagues, leagueMatches, allTeams, brackets, tournamentInfo, bracketCourtAssignments } = useTeamStore();

  const [selectedCourt, setSelectedCourt] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  // 全体進捗（予選+決勝合算）
  const leagueFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const leagueTotal = leagueMatches.length;
  const bracketFinished = brackets.reduce((s, b) => s + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
  const bracketTotal = brackets.reduce((s, b) => s + b.matches.length, 0);
  const totalFinished = leagueFinished + bracketFinished;
  const totalMatches = leagueTotal + bracketTotal;
  const progressPct = totalMatches > 0 ? Math.round((totalFinished / totalMatches) * 100) : 0;

  // 物理コート(1〜16)の固定配置マップを構築
  const courtMap = useMemo(() => {
    const map = new Map<number, { league: TeamLeague; status: ReturnType<typeof getLeagueCourtStatus>; nextMatch: TeamLeagueMatch | null } | null>();
    for (let i = 1; i <= 16; i++) map.set(i, null);

    for (const league of leagues) {
      const lm = leagueMatches.filter(m => m.leagueId === league.leagueId);
      const cs = getLeagueCourtStatus(league, lm);
      const nextMatch = lm.filter(m => m.status !== 'finished').sort((a, b) => a.matchNumber - b.matchNumber)[0] || null;
      const nums = parseCourtNumbers(league.courtName);
      for (const n of nums) {
        map.set(n, { league, status: cs, nextMatch });
      }
    }
    return map;
  }, [leagues, leagueMatches]);

  // 4コートごとのブロック: 1-4, 5-8, 9-12, 13-16
  const physicalBlocks = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]];

  // コート状態集計
  const courtStats = useMemo(() => {
    let playing = 0, occupied = 0, empty = 0;
    for (let i = 1; i <= 16; i++) {
      const info = courtMap.get(i);
      const courtStr = `${i}コート`;
      const hasBracketMatch = Object.values(bracketCourtAssignments).some(ca => ca.courtNames.includes(courtStr));
      if (hasBracketMatch) { playing++; continue; }
      if (!info || info.status.isComplete) { empty++; continue; }
      if (info.nextMatch) playing++;
      else if (info.status.status === 'playing' || info.status.finished > 0) occupied++;
      else empty++;
    }
    return { playing, occupied, empty };
  }, [courtMap, bracketCourtAssignments]);

  const getTeamName = (id: string) => allTeams.find(t => t.teamId === id)?.teamName || '';

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <style>{`
        @keyframes court-blink {
          0%, 100% { border-color: rgb(74, 222, 128); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
          50% { border-color: rgb(34, 197, 94); box-shadow: 0 0 6px 1px rgba(34, 197, 94, 0.25); }
        }
        .court-playing-blink { animation: court-blink 2s ease-in-out infinite; }
      `}</style>
      {/* ===== HEADER ===== */}
      <header className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-emerald-500" />
              ライブダッシュボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tournamentInfo?.name || '団体戦'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-gray-900 font-mono tracking-tight">{timeStr}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {currentTime.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
          </div>
        </div>
      </header>

      {/* ===== TOP ROW: Donut + Stats ===== */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-stretch">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col items-center justify-center min-w-[180px]">
          <DonutChart percent={progressPct} finished={totalFinished} total={totalMatches} />
          <div className="flex gap-4 mt-3 text-[10px] font-medium">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />終了</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />試合中</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" />待機</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
          {[
            { icon: Users, label: '全試合数', value: totalMatches, color: 'text-gray-600 bg-gray-50 border-gray-200' },
            { icon: Play, label: '予選リーグ', value: `${leagueFinished}/${leagueTotal}`, color: 'text-green-700 bg-green-50 border-green-200' },
            { icon: CheckCircle, label: '使用中', value: `${courtStats.occupied}`, color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { icon: Trophy, label: '決勝T', value: brackets.length > 0 ? `${bracketFinished}/${bracketTotal}` : '―', color: 'text-amber-700 bg-amber-50 border-amber-200' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className={`rounded-xl border p-3 ${color}`}>
              <Icon className="w-4 h-4 mb-1 opacity-60" />
              <div className="text-lg font-black leading-none">{value}</div>
              <div className="text-[10px] mt-1 opacity-60 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== コートマップ ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            コートマップ
          </h2>
          <div className="flex gap-3 text-[10px] flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />試合中 {courtStats.playing}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" />使用中 {courtStats.occupied}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-100 border border-green-200" />空き {courtStats.empty}</span>
          </div>
        </div>

        {/* 物理コート配置: 4コートごとのブロック */}
        <div className="flex flex-col gap-3 items-center">
          {physicalBlocks.map((block, blockIdx) => (
            <div key={blockIdx} className="contents">
              <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3 w-full max-w-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {block[0]}〜{block[block.length - 1]}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {block.map(courtNum => {
                    const info = courtMap.get(courtNum);
                    const hasActiveMatch = info && !info.status.isComplete;
                    const isLeaguePlaying = hasActiveMatch && info.nextMatch;

                    // ブラケット試合情報を事前に取得（複数コート使用に対応）
                    const courtStr = `${courtNum}コート`;
                    const bracketEntry = Object.entries(bracketCourtAssignments).find(([, ca]) => ca.courtNames.includes(courtStr));
                    const isBracketPlaying = !!bracketEntry;
                    let bracketMatchData: { matchId: string; bm: any; ca: any; catLabel: string } | null = null;
                    if (bracketEntry) {
                      const [matchId, ca] = bracketEntry;
                      const bm = brackets.flatMap(b => b.matches).find(m => m.matchId === matchId);
                      const bCat = brackets.find(b => b.matches.some(m => m.matchId === matchId));
                      const catLabel = bCat?.category === '1st' ? '1位T' : bCat?.category === '2nd' ? '2位T' : bCat?.category === '3rd' ? '3位T' : '4・5位T';
                      if (bm) bracketMatchData = { matchId, bm, ca, catLabel };
                    }

                    const isPlaying = isLeaguePlaying || isBracketPlaying;
                    const statusStyle = isPlaying
                      ? { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', blink: true }
                      : hasActiveMatch
                        ? { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', blink: false }
                        : { bg: 'bg-white/80', border: 'border-gray-200', text: 'text-gray-500', blink: false };

                    return (
                      <div
                        key={courtNum}
                        onClick={() => (isBracketPlaying || hasActiveMatch) && setSelectedCourt(courtNum)}
                        className={`relative rounded-lg border-2 transition-all overflow-hidden ${statusStyle.bg} ${statusStyle.border} ${statusStyle.blink ? 'court-playing-blink' : ''} ${(isPlaying || hasActiveMatch) ? 'cursor-pointer' : ''}`}
                        style={{ aspectRatio: '1 / 1.6' }}
                      >
                        <VerticalCourtLines status={isPlaying ? 'playing' : hasActiveMatch ? 'ready' : 'empty'} />
                        <div className="relative z-10 flex flex-col h-full p-1.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className={`text-xl font-black ${statusStyle.text} leading-none`}>{courtNum}</div>
                            {isPlaying && <Play className="w-3.5 h-3.5 text-green-500 fill-green-500" />}
                          </div>
                          <div className="flex-1 flex flex-col justify-center min-w-0">
                            {hasActiveMatch ? (
                              <>
                                <div className="text-[9px] font-bold text-gray-500 mb-0.5">{info!.league.leagueId}リーグ</div>
                                <div className="text-[7px] text-gray-400 mb-1">{info!.status.finished}/{info!.status.total}試合</div>
                                {info!.nextMatch ? (
                                  <div className="space-y-0">
                                    <p className="text-[7px] font-bold text-green-600/80 mb-0.5">第{info!.nextMatch.matchNumber}試合</p>
                                    <p className="text-[8px] font-bold text-gray-800 truncate">{getTeamName(info!.nextMatch.team1Id)}</p>
                                    <p className="text-[6px] font-medium text-gray-400 leading-none">vs</p>
                                    <p className="text-[8px] font-bold text-gray-800 truncate">{getTeamName(info!.nextMatch.team2Id)}</p>
                                  </div>
                                ) : (
                                  <p className="text-[8px] text-gray-400 text-center">待機中</p>
                                )}
                              </>
                            ) : bracketMatchData ? (() => {
                              const { bm, ca, catLabel } = bracketMatchData;
                              const elapsedMin = Math.floor((Date.now() - ca.startedAt) / 60000);
                              const elapsedH = Math.floor(elapsedMin / 60);
                              const elapsedM = elapsedMin % 60;
                              const isMultiCourt = ca.courtNames.length > 1;
                              return (
                                <div className="flex flex-col h-full">
                                  <p className="text-[8px] font-black text-green-700 leading-tight">{catLabel}</p>
                                  {isMultiCourt && (
                                    <p className="text-[6px] font-bold text-emerald-600 leading-none mb-0.5">
                                      {ca.courtNames.length}コート併用
                                    </p>
                                  )}
                                  <p className="text-[8px] font-bold text-gray-800 truncate mt-0.5">
                                    {bm.team1League && <span className="text-gray-400">{bm.team1League} </span>}{bm.team1Name}
                                  </p>
                                  <p className="text-[6px] font-bold text-gray-400">VS</p>
                                  <p className="text-[8px] font-bold text-gray-800 truncate">
                                    {bm.team2League && <span className="text-gray-400">{bm.team2League} </span>}{bm.team2Name}
                                  </p>
                                  <p className="text-[7px] font-mono font-bold text-green-600 mt-auto self-end">{elapsedH}:{String(elapsedM).padStart(2, '0')}</p>
                                </div>
                              );
                            })() : (
                              <div className="flex flex-col items-center justify-center flex-1">
                                <p className="text-[10px] text-gray-400 font-medium">空き</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* 通路 */}
              {blockIdx < physicalBlocks.length - 1 && (
                <div className="flex items-center gap-2 w-full max-w-lg">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[9px] text-gray-400">通路</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== 決勝トーナメント進捗 ===== */}
      {brackets.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            決勝トーナメント進捗
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {brackets.map(b => {
              const bf = b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length;
              const bt = b.matches.length;
              const bPct = bt > 0 ? Math.round((bf / bt) * 100) : 0;
              const label = b.category === '1st' ? '1位' : b.category === '2nd' ? '2位' : b.category === '3rd' ? '3位' : '4・5位';
              return (
                <div key={b.category} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-700">{label}トーナメント</span>
                    <span className="text-xs text-gray-400">{bf}/{bt}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${bPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* コート詳細ポップアップ */}
      {selectedCourt && (() => {
        const courtStr = `${selectedCourt}コート`;
        const info = courtMap.get(selectedCourt);
        const bracketEntry = Object.entries(bracketCourtAssignments).find(([, ca]) => ca.courtNames.includes(courtStr));

        let content = null;
        if (bracketEntry) {
          const [, ca] = bracketEntry;
          const bm = brackets.flatMap(b => b.matches).find(m => m.matchId === bracketEntry[0]);
          const bCat = brackets.find(b => b.matches.some(m => m.matchId === bracketEntry[0]));
          const catLabel = bCat?.category === '1st' ? '1位トーナメント' : bCat?.category === '2nd' ? '2位トーナメント' : bCat?.category === '3rd' ? '3位トーナメント' : '4・5位トーナメント';
          if (bm) {
            const startTime = new Date(ca.startedAt);
            const elapsed = Math.floor((Date.now() - ca.startedAt) / 60000);
            const h = Math.floor(elapsed / 60);
            const m = elapsed % 60;
            content = (
              <div>
                <div className="text-base font-black text-emerald-700 mb-1">{catLabel}</div>
                {ca.courtNames.length > 1 && (
                  <div className="mb-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                    <MapPin className="w-3 h-3" />
                    {ca.courtNames.length}コート併用: {ca.courtNames.join('・')}
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    {bm.team1League && <span className="w-5 h-5 rounded bg-gray-200 text-[9px] font-bold text-gray-600 flex items-center justify-center">{bm.team1League}</span>}
                    <span>{bm.team1Name}</span>
                  </div>
                  <div className="text-center text-xs font-bold text-gray-400 my-1.5">VS</div>
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    {bm.team2League && <span className="w-5 h-5 rounded bg-gray-200 text-[9px] font-bold text-gray-600 flex items-center justify-center">{bm.team2League}</span>}
                    <span>{bm.team2Name}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400">開始時刻</div>
                    <div className="font-bold text-gray-800">{startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-gray-400">経過時間</div>
                    <div className="text-lg font-black font-mono text-green-700">{h}:{String(m).padStart(2, '0')}</div>
                  </div>
                </div>
              </div>
            );
          }
        } else if (info && !info.status.isComplete) {
          const leagueAllMatches = leagueMatches
            .filter(m => m.leagueId === info.league.leagueId)
            .sort((a, b) => a.matchNumber - b.matchNumber);
          content = (
            <div>
              <div className="text-xs font-bold text-emerald-600 mb-1">{info.league.leagueId}リーグ</div>
              <div className="text-xs text-gray-500 mb-3">{info.status.finished}/{info.status.total}試合完了</div>
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {leagueAllMatches.map(m => {
                  const isFinished = m.status === 'finished';
                  const isPlaying = m.status === 'playing';
                  const t1Name = getTeamName(m.team1Id);
                  const t2Name = getTeamName(m.team2Id);
                  const scoreStr = isFinished
                    ? `${m.winsTeam1}-${m.winsTeam2}`
                    : null;
                  return (
                    <div
                      key={m.matchId}
                      className={`rounded-lg p-2.5 border ${
                        isPlaying ? 'bg-green-50 border-green-300'
                        : isFinished ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-gray-500">第{m.matchNumber}試合</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isPlaying ? 'bg-green-200 text-green-800'
                          : isFinished ? 'bg-gray-200 text-gray-600'
                          : 'bg-blue-100 text-blue-600'
                        }`}>
                          {isPlaying ? '試合中' : isFinished ? '終了' : '待機'}
                        </span>
                        {scoreStr && (
                          <span className="text-[10px] font-mono font-bold text-gray-700 ml-auto bg-white px-1.5 py-0.5 rounded border border-gray-200">
                            {scoreStr}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold flex-1 truncate ${isFinished && m.winnerId === m.team1Id ? 'text-amber-600' : 'text-gray-800'}`}>
                          {isFinished && m.winnerId === m.team1Id && '🏆 '}{t1Name}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">vs</span>
                        <span className={`text-xs font-bold flex-1 truncate text-right ${isFinished && m.winnerId === m.team2Id ? 'text-amber-600' : 'text-gray-800'}`}>
                          {t2Name}{isFinished && m.winnerId === m.team2Id && ' 🏆'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (!content) { setSelectedCourt(null); return null; }

        return (
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelectedCourt(null)}>
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[360px] max-w-[92vw] p-5 z-50" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-800">{selectedCourt}コート</h3>
                <button onClick={() => setSelectedCourt(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                  <span className="text-gray-400 text-lg">×</span>
                </button>
              </div>
              {content}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
