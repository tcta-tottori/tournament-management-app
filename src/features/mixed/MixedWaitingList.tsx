import { useState, useMemo } from 'react';
import { ClipboardList, Printer, Volume2, VolumeX, MapPin } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { BracketMatch, PlacementCategory, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import CallPreviewDialog from './CallPreviewDialog';

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

/** 審判用紙を印刷 */
function printRefereeSheet(
  match: BracketMatch,
  allTeams: MixedTeam[],
  tournamentName: string,
  catLabel: string,
  roundLabel: string,
  courtName: string,
) {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  body { font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; margin: 0; padding: 15px; }
  .header { text-align: center; margin-bottom: 12px; }
  .header h2 { margin: 0; font-size: 16px; }
  .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #333; padding: 6px 10px; font-size: 13px; }
  th { background: #f0f0f0; width: 80px; text-align: center; }
  .player-name { font-size: 16px; font-weight: bold; }
  .score-area { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
  .score-box { width: 50px; height: 50px; border: 2px solid #333; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
  .dash { font-size: 28px; font-weight: bold; display: inline-flex; align-items: center; }
  .court-line { margin-top: 12px; font-size: 13px; }
</style>
</head><body>
<div class="header">
  <h2>${tournamentName}</h2>
  <div class="sub">${catLabel}　${roundLabel}　${courtName ? 'コート: ' + courtName : ''}</div>
</div>
<table>
  <tr><th rowspan="2">チーム1</th><td class="player-name">${team1.male.name}</td><td>${team1.male.affiliation}</td><td rowspan="2" style="text-align:center;font-weight:bold;font-size:14px;">${match.team1League}リーグ</td></tr>
  <tr><td class="player-name">${team1.female.name}</td><td>${team1.female.affiliation}</td></tr>
  <tr><th rowspan="2">チーム2</th><td class="player-name">${team2.male.name}</td><td>${team2.male.affiliation}</td><td rowspan="2" style="text-align:center;font-weight:bold;font-size:14px;">${match.team2League}リーグ</td></tr>
  <tr><td class="player-name">${team2.female.name}</td><td>${team2.female.affiliation}</td></tr>
</table>
<div style="text-align:center;">
  <div class="score-area">
    <div class="score-box"></div><div class="dash">−</div><div class="score-box"></div>
  </div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=800,height=600');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
}



interface WaitingMatch {
  match: BracketMatch;
  category: PlacementCategory;
  totalRounds: number;
  priority: number;
}

interface WaitingMatch {
  match: BracketMatch;
  category: PlacementCategory;
  totalRounds: number;
  priority: number; // lower = higher priority
}

export default function MixedWaitingList() {
  const { brackets, allTeams, leagues, tournamentInfo, assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const [speakingMatchId, setSpeakingMatchId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<Record<string, string>>({});

  // コート割当ポップアップ state
  const [courtAssignWm, setCourtAssignWm] = useState<WaitingMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');

  // コールプレビュー state
  const [previewMatch, setPreviewMatch] = useState<WaitingMatch | null>(null);
  const [previewCourt, setPreviewCourt] = useState('');

  // 使用中コートを計算
  const usedCourts = useMemo(() => {
    const set = new Set<string>();
    for (const ca of Object.values(bracketCourtAssignments)) {
      set.add(ca.courtName);
    }
    // 予選リーグ進行中のコートも除外
    for (const l of leagues) {
      const lm = useMixedStore.getState().leagueMatches.filter(m => m.leagueId === l.leagueId);
      if (lm.some(m => m.status !== 'finished')) {
        const nums = l.courtName?.match(/\d+/g);
        if (nums) for (const n of nums) set.add(`${n}コート`);
      }
    }
    return set;
  }, [bracketCourtAssignments, leagues]);

  const courtOpts = Array.from({ length: 16 }, (_, i) => `${i + 1}コート`);

  // 全ブラケットから対戦可能な試合を収集
  const waitingMatches = useMemo(() => {
    const result: WaitingMatch[] = [];
    for (const bracket of brackets) {
      const totalRounds = Math.log2(bracket.drawSize);
      for (const match of bracket.matches) {
        if (match.status === 'ready' && match.team1Id && match.team2Id && !match.isBye) {
          const priority = match.round * 1000 + match.position;
          result.push({ match, category: bracket.category, totalRounds, priority });
        }
      }
    }
    return result.sort((a, b) => a.priority - b.priority);
  }, [brackets]);

  // コート入れボタン → ポップアップ表示
  const handleOpenCourtAssign = (wm: WaitingMatch) => {
    setCourtAssignWm(wm);
    setCourtAssignValue('');
  };

  // コート割当確定 → コート入れ＋コールプレビューへ
  const handleCourtAssignConfirm = () => {
    if (!courtAssignWm || !courtAssignValue) return;
    assignBracketMatchToCourt(courtAssignWm.match.matchId, courtAssignValue);
    // コールプレビューへ遷移
    setPreviewMatch(courtAssignWm);
    setPreviewCourt(courtAssignValue);
    setCourtAssignWm(null);
  };

  const handleConfirmCall = (text: string, _overrides: Record<string, string>) => {
    if (!text || !previewMatch) return;
    setSpeakingMatchId(previewMatch.match.matchId);
    setPreviewMatch(null);
    speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 1 }, () => setSpeakingMatchId(null));
  };

  const handlePrint = (wm: WaitingMatch) => {
    const catLabel = CATEGORY_LABELS[wm.category];
    const roundLabel = getRoundLabel(wm.match.round, wm.totalRounds);
    printRefereeSheet(wm.match, allTeams, tournamentInfo?.name || '', catLabel, roundLabel, '');
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

            {/* アクション: コート入れ + 時間 + 印刷 */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-[10px] text-gray-500 font-medium shrink-0">開始時間:</label>
                <input type="time" value={selectedTime[match.matchId] || ''} onChange={e => setSelectedTime(prev => ({ ...prev, [match.matchId]: e.target.value }))}
                  className="px-1.5 py-0.5 border border-gray-200 rounded text-[10px] w-20" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => handleOpenCourtAssign(wm)} disabled={isSpeaking}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    isSpeakingThis ? 'bg-blue-600 text-white animate-pulse' :
                    'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                  {isSpeakingThis ? <><Volume2 size={12} />コール中...</> : <><MapPin size={12} />コート入れ &amp; コール</>}
                </button>
                <button onClick={() => handlePrint(wm)}
                  className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all">
                  <Printer size={12} />印刷
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ===== コート割当ポップアップ（トーナメント表と同じ形式） ===== */}
      {courtAssignWm && (() => {
        const t1 = allTeams.find(t => t.teamId === courtAssignWm.match.team1Id);
        const t2 = allTeams.find(t => t.teamId === courtAssignWm.match.team2Id);
        const catLabel = CATEGORY_LABELS[courtAssignWm.category];
        const roundLabel = getRoundLabel(courtAssignWm.match.round, courtAssignWm.totalRounds);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={() => setCourtAssignWm(null)}>
            <div className="min-h-full flex items-start justify-center py-[10vh] px-4">
              <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-full p-5 z-50" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-gray-800 mb-3">コートを決定</h3>
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs">
                  <div className="text-gray-500 mb-1.5">{catLabel} {roundLabel}</div>
                  <div className="flex items-center gap-2 mb-1">
                    {courtAssignWm.match.team1League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignWm.match.team1League}</span>}
                    <span className="font-bold">{t1?.teamName || courtAssignWm.match.team1Name}</span>
                  </div>
                  <div className="text-gray-400 text-[9px] my-0.5">vs</div>
                  <div className="flex items-center gap-2">
                    {courtAssignWm.match.team2League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignWm.match.team2League}</span>}
                    <span className="font-bold">{t2?.teamName || courtAssignWm.match.team2Name}</span>
                  </div>
                </div>
                <label className="text-xs font-bold text-gray-600 block mb-2">コートを選択 <span className="text-gray-400 font-normal">（使用中は選択不可）</span></label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {courtOpts.map(c => {
                    const isUsed = usedCourts.has(c);
                    return (
                      <button key={c} onClick={() => !isUsed && setCourtAssignValue(c)}
                        disabled={isUsed}
                        className={`py-2 text-xs font-bold rounded-lg border-2 transition-all
                          ${isUsed ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' :
                            courtAssignValue === c ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                            'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >{c.replace('コート', '')}{isUsed && <span className="block text-[7px] text-gray-300">使用中</span>}</button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCourtAssignWm(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">キャンセル</button>
                  <button onClick={handleCourtAssignConfirm} disabled={!courtAssignValue}
                    className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >決定 &amp; コール</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== コールプレビューダイアログ ===== */}
      {previewMatch && (() => {
        const team1 = allTeams.find(t => t.teamId === previewMatch.match.team1Id);
        const team2 = allTeams.find(t => t.teamId === previewMatch.match.team2Id);
        if (!team1 || !team2) return null;
        const time = selectedTime[previewMatch.match.matchId] || '';
        const roundLabel = getRoundLabel(previewMatch.match.round, previewMatch.totalRounds);
        return (
          <CallPreviewDialog
            match={previewMatch.match}
            team1={team1}
            team2={team2}
            category={previewMatch.category}
            roundLabel={roundLabel}
            courtName={previewCourt}
            startTime={time}
            allTeams={allTeams}
            onConfirm={handleConfirmCall}
            onClose={() => setPreviewMatch(null)}
          />
        );
      })()}
    </div>
  );
}
