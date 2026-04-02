import { useState, useEffect, useMemo } from 'react';
import { useMixedStore } from './mixedStore';
import { MapPin, Play, CheckCircle, Trophy, BarChart2, Users } from 'lucide-react';
import type { LeagueMatchScore, MixedLeague } from './types';

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
function getLeagueCourtStatus(_league: MixedLeague, lMatches: LeagueMatchScore[]) {
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

export default function MixedLiveCourtView() {
  const { leagues, leagueMatches, allTeams, brackets, tournamentInfo, bracketCourtAssignments } = useMixedStore();


  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 全体進捗（予選+決勝合算）
  const leagueFinished = leagueMatches.filter(m => m.status === 'finished').length;
  const leagueTotal = leagueMatches.length;
  const bracketFinished = brackets.reduce((s, b) => s + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
  const bracketTotal = brackets.reduce((s, b) => s + b.matches.length, 0);
  const totalFinished = leagueFinished + bracketFinished;
  const totalMatches = leagueTotal + bracketTotal;
  const progressPct = totalMatches > 0 ? Math.round((totalFinished / totalMatches) * 100) : 0;

  // 物理コート(1〜16)の固定配置マップを構築
  // 各リーグのコート名から番号を抽出してマッピング
  const courtMap = useMemo(() => {
    const map = new Map<number, { league: MixedLeague; status: ReturnType<typeof getLeagueCourtStatus>; nextMatch: LeagueMatchScore | null } | null>();
    // 1〜16の物理コートを用意
    for (let i = 1; i <= 16; i++) map.set(i, null);

    for (const league of leagues) {
      const lm = leagueMatches.filter(m => m.leagueId === league.leagueId);
      const cs = getLeagueCourtStatus(league, lm);
      const nextMatch = lm.filter(m => m.status !== 'finished').sort((a, b) => a.matchNumber - b.matchNumber)[0] || null;
      // コート名から番号を抽出 (例: "6・7コート" → [6,7], "1コート" → [1])
      const nums = league.courtName?.match(/\d+/g);
      if (nums) {
        for (const n of nums) {
          map.set(parseInt(n), { league, status: cs, nextMatch });
        }
      }
    }
    return map;
  }, [leagues, leagueMatches]);

  // 4コートごとのブロック: 1-4, 5-8, 9-12, 13-16
  const physicalBlocks = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]];

  // コート状態集計
  const courtStats = useMemo(() => {
    let playing = 0, occupied = 0, empty = 0;
    for (const [, info] of courtMap) {
      if (!info) { empty++; continue; }
      if (info.status.status === 'playing') playing++;
      else if (info.status.isComplete) occupied++;
      else if (info.nextMatch) playing++;
      else empty++;
    }
    return { playing, occupied, empty };
  }, [courtMap]);

  const getTeamName = (id: string) => allTeams.find(t => t.teamId === id)?.teamName || '';

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* ===== HEADER ===== */}
      <header className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-emerald-500" />
              ライブダッシュボード
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tournamentInfo?.name || 'ミックス大会'}
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
                    const isOccupied = !!info;
                    const isPlaying = info && !info.status.isComplete && info.nextMatch;
                    const isComplete = info?.status.isComplete;

                    // リーグ完了 = 空きコート扱い
                    const statusStyle = isPlaying
                      ? { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800' }
                      : isOccupied && !isComplete
                        ? { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' }
                        : { bg: 'bg-white/80', border: 'border-gray-200', text: 'text-gray-500' };

                    return (
                      <div
                        key={courtNum}
                        className={`relative rounded-lg border-2 transition-all overflow-hidden ${statusStyle.bg} ${statusStyle.border}`}
                        style={{ aspectRatio: '1 / 1.6' }}
                      >
                        <VerticalCourtLines status={isPlaying ? 'playing' : (isOccupied && !isComplete) ? 'ready' : 'empty'} />
                        <div className="relative z-10 flex flex-col h-full p-1.5">
                          {/* コート番号 + ステータス */}
                          <div className="flex items-center justify-between mb-0.5">
                            <div className={`text-xl font-black ${statusStyle.text} leading-none`}>{courtNum}</div>
                            {isPlaying && (
                              <span className="flex items-center gap-0.5 bg-green-500 text-white text-[6px] font-bold px-1 py-0.5 rounded-full leading-none">
                                <Play className="w-1.5 h-1.5 fill-white" /> LIVE
                              </span>
                            )}
                          </div>

                          {/* 中央: コート使用状況 */}
                          <div className="flex-1 flex flex-col justify-center min-w-0">
                            {info && !info.status.isComplete && info.nextMatch ? (
                              <>
                                <div className="text-[9px] font-bold text-gray-500 mb-0.5">{info.league.leagueId}リーグ</div>
                                <div className="text-[7px] text-gray-400 mb-1">{info.status.finished}/{info.status.total}試合</div>
                                <div className="space-y-0">
                                  <p className="text-[7px] font-bold text-green-600/80 mb-0.5">第{info.nextMatch.matchNumber}試合</p>
                                  <p className="text-[8px] font-bold text-gray-800 truncate">{getTeamName(info.nextMatch.team1Id)}</p>
                                  <p className="text-[6px] font-medium text-gray-400 leading-none">vs</p>
                                  <p className="text-[8px] font-bold text-gray-800 truncate">{getTeamName(info.nextMatch.team2Id)}</p>
                                </div>
                              </>
                            ) : (() => {
                              // ブラケット試合がこのコートに割り当てられているか確認
                              const courtStr = `${courtNum}コート`;
                              const bracketMatch = Object.entries(bracketCourtAssignments).find(([, ca]) => ca.courtName === courtStr);
                              if (bracketMatch) {
                                const [matchId, ca] = bracketMatch;
                                const bm = brackets.flatMap(b => b.matches).find(m => m.matchId === matchId);
                                if (bm) {
                                  const elapsed = Math.floor((Date.now() - ca.startedAt) / 60000);
                                  return (
                                    <div className="space-y-0">
                                      <p className="text-[7px] font-bold text-green-600/80 mb-0.5">決勝T</p>
                                      <p className="text-[8px] font-bold text-gray-800 truncate">{bm.team1Name}</p>
                                      <p className="text-[6px] font-medium text-gray-400 leading-none">vs</p>
                                      <p className="text-[8px] font-bold text-gray-800 truncate">{bm.team2Name}</p>
                                      <p className="text-[7px] text-green-600 mt-0.5">{elapsed}分</p>
                                    </div>
                                  );
                                }
                              }
                              return (
                                <div className="flex flex-col items-center justify-center flex-1">
                                  <p className="text-[10px] text-gray-400 font-medium">空き</p>
                                </div>
                              );
                            })()}
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
              const label = b.category === '1st' ? '1位' : b.category === '2nd' ? '2位' : b.category === '3rd' ? '3位' : '4-5位';
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
    </div>
  );
}
