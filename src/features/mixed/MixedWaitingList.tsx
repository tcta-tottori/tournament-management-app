import { useState, useMemo } from 'react';
import { ClipboardList, Printer, Volume2, VolumeX, Play } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { BracketMatch, PlacementCategory, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import { printMixedRefereeSheet } from './printMixedRefereeSheet';

/** リーグバッジの色 */
const LEAGUE_BADGE_COLORS: Record<string, string> = {
  'A': 'bg-emerald-100 text-emerald-700', 'B': 'bg-blue-100 text-blue-700',
  'C': 'bg-purple-100 text-purple-700', 'D': 'bg-rose-100 text-rose-700',
  'E': 'bg-amber-100 text-amber-700', 'F': 'bg-cyan-100 text-cyan-700',
  'G': 'bg-lime-100 text-lime-700', 'H': 'bg-fuchsia-100 text-fuchsia-700',
  'I': 'bg-emerald-100 text-emerald-700', 'J': 'bg-blue-100 text-blue-700',
  'K': 'bg-purple-100 text-purple-700', 'L': 'bg-rose-100 text-rose-700',
  'M': 'bg-amber-100 text-amber-700',
};

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位T', '2nd': '2位T', '3rd': '3位T', '4th': '4・5位T',
};

const CATEGORY_COLORS: Record<PlacementCategory, string> = {
  '1st': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  '2nd': 'bg-gray-100 text-gray-700 border-gray-300',
  '3rd': 'bg-orange-100 text-orange-700 border-orange-300',
  '4th': 'bg-slate-100 text-slate-600 border-slate-300',
};

function getRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${round}回戦`;
}

/** コールテキスト生成 */
function buildCallText(match: BracketMatch, allTeams: MixedTeam[], catLabel: string, roundLabel: string, courtName: string, startTime: string): string {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return '';
  const fn = (name: string) => name.trim().split(/[\s　]+/)[0] || name;
  const parts = ['試合のコールをします。', `ミックスダブルス、${catLabel}、${roundLabel}。`,
    `${match.team1League}リーグ、${fn(team1.male.name)}さん、${fn(team1.female.name)}さん ペア。`,
    `${match.team2League}リーグ、${fn(team2.male.name)}さん、${fn(team2.female.name)}さん ペア。`];
  let ct = `この試合を、${courtName}で`;
  if (startTime) { const [h, m] = startTime.split(':'); ct += parseInt(m) === 0 ? `、${parseInt(h)}時より` : `、${parseInt(h)}時${parseInt(m)}分より`; }
  ct += '、おこなってください。';
  parts.push(ct);
  return parts.join(' ');
}

interface WaitingMatch {
  match: BracketMatch;
  category: PlacementCategory;
  totalRounds: number;
  priority: number; // lower = higher priority
}

export default function MixedWaitingList() {
  const { brackets, allTeams, leagues, tournamentInfo } = useMixedStore();
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const [selectedCourt, setSelectedCourt] = useState<Record<string, string>>({});
  const [selectedTime, setSelectedTime] = useState<Record<string, string>>({});
  const [speakingMatchId, setSpeakingMatchId] = useState<string | null>(null);

  const courtOptions = useMemo(() => {
    const courts = leagues.map(l => l.courtName).filter(Boolean);
    return [...new Set(courts)].sort();
  }, [leagues]);

  // 全ブラケットから対戦可能な試合を収集
  const waitingMatches = useMemo(() => {
    const result: WaitingMatch[] = [];
    for (const bracket of brackets) {
      const totalRounds = Math.log2(bracket.drawSize);
      for (const match of bracket.matches) {
        if (match.status === 'ready' && match.team1Id && match.team2Id && !match.isBye) {
          // priority: 低い回戦を優先（1回戦が最優先）、同じ回戦ならポジション順
          const priority = match.round * 1000 + match.position;
          result.push({ match, category: bracket.category, totalRounds, priority });
        }
      }
    }
    return result.sort((a, b) => a.priority - b.priority);
  }, [brackets]);

  const handleCall = (wm: WaitingMatch) => {
    const court = selectedCourt[wm.match.matchId];
    if (!court) return;
    const time = selectedTime[wm.match.matchId] || '';
    const catLabel = CATEGORY_LABELS[wm.category];
    const roundLabel = getRoundLabel(wm.match.round, wm.totalRounds);
    const text = buildCallText(wm.match, allTeams, catLabel, roundLabel, court, time);
    if (!text) return;
    setSpeakingMatchId(wm.match.matchId);
    speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 2 }, () => setSpeakingMatchId(null));
  };

  const handlePrint = (wm: WaitingMatch) => {
    const court = selectedCourt[wm.match.matchId] || '';
    const catLabel = CATEGORY_LABELS[wm.category];
    const roundLabel = getRoundLabel(wm.match.round, wm.totalRounds);
    const gr = tournamentInfo?.gameRules?.tournament || '';
    const time = selectedTime[wm.match.matchId] || '';
    printMixedRefereeSheet(wm.match, allTeams, tournamentInfo?.name || '', catLabel, roundLabel, gr, tournamentInfo?.date || '', court, time);
  };

  if (waitingMatches.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <ClipboardList size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">対戦可能な試合がありません</p>
        <p className="text-sm mt-2">決勝トーナメントで両チームが確定した試合がここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <ClipboardList size={16} />
          控えリスト
          <span className="text-xs font-normal text-gray-400">({waitingMatches.length}試合)</span>
        </h2>
        {isSpeaking && (
          <button onClick={() => { stop(); setSpeakingMatchId(null); }} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">
            <VolumeX size={12} />音声停止
          </button>
        )}
      </div>

      {waitingMatches.map((wm) => {
        const { match, category, totalRounds } = wm;
        const team1 = allTeams.find(t => t.teamId === match.team1Id);
        const team2 = allTeams.find(t => t.teamId === match.team2Id);
        const roundLabel = getRoundLabel(match.round, totalRounds);
        const court = selectedCourt[match.matchId] || '';
        const isSpeakingThis = speakingMatchId === match.matchId;

        return (
          <div key={match.matchId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* ヘッダー: カテゴリ + 回戦 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[category]}`}>
                {CATEGORY_LABELS[category]}
              </span>
              <span className="text-xs font-medium text-gray-600">{roundLabel}</span>
              <span className="text-[10px] text-gray-400">#{match.position}</span>
            </div>

            {/* 対戦チーム */}
            <div className="px-3 py-2">
              {[
                { team: team1, league: match.team1League },
                { team: team2, league: match.team2League },
              ].map((side, idx) => (
                <div key={idx} className={`flex items-center gap-2 ${idx === 0 ? 'pb-1.5 border-b border-gray-100 mb-1.5' : ''}`}>
                  <span className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[side.league?.trim()] || 'bg-gray-100 text-gray-600'}`}>
                    {side.league}
                  </span>
                  {side.team ? (
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="shrink-0" style={{ width: 110 }}>
                        <div className="text-xs font-bold text-gray-800 truncate">{side.team.male.name}</div>
                        <div className="text-xs text-gray-600 truncate">{side.team.female.name}</div>
                      </div>
                      <div className="w-px h-6 bg-gray-200 mx-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-gray-400 truncate">{side.team.male.affiliation}</div>
                        <div className="text-[10px] text-gray-400 truncate">{side.team.female.affiliation}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">{side.league}リーグ</span>
                  )}
                </div>
              ))}
            </div>

            {/* コート選択 + 時間 + アクション */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-[10px] text-gray-500 font-medium shrink-0">コート:</span>
                {courtOptions.map(c => (
                  <button key={c} onClick={() => setSelectedCourt(prev => ({ ...prev, [match.matchId]: c }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${court === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                    {c}
                  </button>
                ))}
                <input type="time" value={selectedTime[match.matchId] || ''} onChange={e => setSelectedTime(prev => ({ ...prev, [match.matchId]: e.target.value }))}
                  className="ml-auto px-1.5 py-0.5 border border-gray-200 rounded text-[10px] w-20" />
              </div>

              <div className="flex gap-1.5">
                <button onClick={() => handleCall(wm)} disabled={!court || isSpeaking}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    !court ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                    isSpeakingThis ? 'bg-blue-600 text-white animate-pulse' :
                    'bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100'}`}>
                  {isSpeakingThis ? <><Volume2 size={12} />コール中...</> : <><Play size={12} />コール</>}
                </button>
                <button onClick={() => handlePrint(wm)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all">
                  <Printer size={12} />印刷
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
