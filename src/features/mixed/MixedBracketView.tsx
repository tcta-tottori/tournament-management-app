import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Medal, Award, Users, Shuffle, RotateCcw, Ban, Save, Volume2, ClipboardList } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { PlacementCategory, BracketMatch, PlacementBracket, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import CallPreviewDialog from './CallPreviewDialog';

/** 全角数字→半角変換 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** Extract winning game number from rules */
function getWinningGamesFromRules(rules: string[]): number {
  for (const r of rules) {
    if (/ゲームマッチ|ゲーム/.test(r)) {
      const cleaned = r.replace(/^（[０-９\d]+）\s*/, '').trim();
      const m = cleaned.match(/(\d+)\s*ゲーム/);
      if (m) return parseInt(m[1]);
      const m2 = cleaned.match(/([０-９]+)\s*ゲーム/);
      if (m2) return parseInt(toHalfWidth(m2[1]));
    }
  }
  return 6;
}

/** リーグバッジの色（エントリーページと統一） */
const LEAGUE_BADGE_COLORS: Record<string, string> = {
  'A': 'bg-emerald-100 text-emerald-700', 'B': 'bg-blue-100 text-blue-700',
  'C': 'bg-purple-100 text-purple-700', 'D': 'bg-rose-100 text-rose-700',
  'E': 'bg-amber-100 text-amber-700', 'F': 'bg-cyan-100 text-cyan-700',
  'G': 'bg-lime-100 text-lime-700', 'H': 'bg-fuchsia-100 text-fuchsia-700',
  'I': 'bg-emerald-100 text-emerald-700', 'J': 'bg-blue-100 text-blue-700',
  'K': 'bg-purple-100 text-purple-700', 'L': 'bg-rose-100 text-rose-700',
  'M': 'bg-amber-100 text-amber-700',
};

const CATEGORY_TABS: { id: PlacementCategory; label: string; icon: React.ElementType; color: string }[] = [
  { id: '1st', label: '1位', icon: Trophy, color: 'from-yellow-500 to-amber-600' },
  { id: '2nd', label: '2位', icon: Medal, color: 'from-gray-400 to-gray-500' },
  { id: '3rd', label: '3位', icon: Award, color: 'from-orange-400 to-orange-500' },
  { id: '4th', label: '4・5位', icon: Users, color: 'from-slate-400 to-slate-500' },
];

/** 審判用紙を印刷（B5横・シングルス同様の形式） */
function printRefereeSheet(
  match: BracketMatch,
  allTeams: MixedTeam[],
  _tournamentName: string,
  bracketLabel: string,
  roundLabel: string,
  gameRule: string,
  tournamentInfo?: { date?: string } | null,
) {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙 - ${bracketLabel}</title>
<style>
  @page { size: B5 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', monospace; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 232mm; margin: auto; }
  .title { text-align: center; font-size: 22pt; font-weight: bold; letter-spacing: 1.5em; padding: 3mm 0 1mm; }
  .subtitle { display: flex; justify-content: center; gap: 40mm; font-size: 9pt; padding: 0 0 3mm; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1.5px solid #000; padding: 2mm 3mm; font-size: 10pt; vertical-align: middle; }
  th { background: #f5f5f5; font-weight: bold; text-align: center; }
  .row-label { width: 24mm; text-align: center; font-weight: bold; font-size: 9pt; letter-spacing: 0.3em; }
  .val { font-size: 12pt; font-weight: bold; text-align: center; }
  .val-lg { font-size: 16pt; font-weight: bold; text-align: center; }
  .name-cell { font-size: 14pt; font-weight: bold; padding: 3mm 5mm; line-height: 1.6; }
  .aff-cell { font-size: 8pt; padding: 2mm 3mm; line-height: 1.6; white-space: nowrap; }
  .score-row td { height: 28mm; text-align: center; vertical-align: top; padding-top: 3mm; }
  .score-label { font-size: 9pt; font-weight: bold; letter-spacing: 0.2em; }
  .score-box-area { display: flex; align-items: center; justify-content: center; gap: 4mm; margin-top: 3mm; }
  .score-box { width: 18mm; height: 18mm; border: 2px solid #000; display: inline-block; }
  .score-dash { font-size: 22pt; font-weight: bold; }
  .tb-area { margin-top: 1mm; }
  .tb-label { font-size: 8pt; }
  .tb-box { width: 14mm; height: 14mm; border: 1.5px solid #000; display: inline-block; margin-top: 1mm; }
  .footer-row td { height: 10mm; font-size: 9pt; }
  .uline { display: inline-block; border-bottom: 1px solid #000; min-width: 30mm; margin-left: 1mm; }
  .notes td { height: 12mm; font-size: 8pt; color: #999; }
  .credit { text-align: right; font-size: 8pt; padding: 1mm 2mm 0; }
</style>
</head><body>
<div class="page">
  <div class="title">審　判　用　紙</div>
  <div class="subtitle">
    <span>&nbsp;</span>
    <span>${(tournamentInfo as any)?.date || ''}</span>
  </div>
  <table>
    <tr>
      <th class="row-label">種　目</th>
      <td class="val" colspan="2">${bracketLabel}</td>
      <th class="row-label">回　戦</th>
      <td class="val" colspan="2">${roundLabel}</td>
    </tr>
    <tr>
      <th class="row-label">コートNo.</th>
      <td style="width:14%;">&nbsp;</td>
      <th style="width:12%;">試合方法</th>
      <td style="font-size:9pt;text-align:center;">${gameRule.replace(/\n/g, '<br>')}</td>
      <th style="width:12%;">開始時間</th>
      <td style="width:14%;">&nbsp;</td>
    </tr>
    <tr>
      <th class="row-label">エントリーNo.</th>
      <td class="val-lg" colspan="2">No.　${team1.pairNumber}</td>
      <td class="val-lg" colspan="3">No.　${team2.pairNumber}</td>
    </tr>
    <tr>
      <th class="row-label">選手氏名</th>
      <td class="name-cell" colspan="1">${team1.male.name}<br>${team1.female.name}</td>
      <td class="aff-cell">（ ${team1.male.affiliation} ）<br>（ ${team1.female.affiliation} ）</td>
      <td class="name-cell" colspan="2">${team2.male.name}<br>${team2.female.name}</td>
      <td class="aff-cell">（ ${team2.male.affiliation} ）<br>（ ${team2.female.affiliation} ）</td>
    </tr>
    <tr class="score-row">
      <td>
        <div class="score-label">ス　コ　ア</div>
        <div class="tb-area"><span class="tb-label">（ＴＢ）</span></div>
      </td>
      <td colspan="2">
        <div class="score-box-area">
          <div class="score-box"></div>
        </div>
      </td>
      <td style="border-left:none;border-right:none;">
        <div class="score-dash">ー</div>
        <div class="tb-area">（　　　）</div>
      </td>
      <td colspan="2">
        <div class="score-box-area">
          <div class="score-box"></div>
        </div>
      </td>
    </tr>
    <tr class="footer-row">
      <td colspan="2">コート：<span class="uline"></span></td>
      <td>開始時刻：<span class="uline"></span></td>
      <td>終了時刻：<span class="uline"></span></td>
      <td colspan="2">審判：<span class="uline"></span></td>
    </tr>
    <tr class="notes">
      <td colspan="6">備考：</td>
    </tr>
  </table>
  <div class="credit">鳥取市テニス協会</div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }
}

export default function MixedBracketView() {
  const { brackets, selectedBracketCategory, setSelectedBracketCategory, updateBracketScore, advanceWinner, shuffleBracketSeeds, tournamentInfo, leagues } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');
  const score2Ref = useRef<HTMLInputElement>(null);
  const [callMatch, setCallMatch] = useState<BracketMatch | null>(null);
  const [callCourt, setCallCourt] = useState('');
  const [callTime, setCallTime] = useState('');
  const { speak } = useSpeechSynthesis();
  const [courtAssignMatch, setCourtAssignMatch] = useState<BracketMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');
  const { assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();
  const [viewMode, setViewMode] = useState<'bracket' | 'waiting'>('bracket');
  const [drawEditMode, setDrawEditMode] = useState(false);

  const winGames = useMemo(() => getWinningGamesFromRules(tournamentInfo?.rules || []), [tournamentInfo]);

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

  // 控えリスト: 全ブラケットの対戦待ちマッチを1回戦優先で収集
  const waitingMatches = useMemo(() => {
    const matches: { match: BracketMatch; bracket: PlacementBracket; roundLabel: string }[] = [];
    for (const b of brackets) {
      const totalR = Math.log2(b.drawSize);
      for (const m of b.matches) {
        if (m.team1Id && m.team2Id && !m.isBye && (m.status === 'waiting' || m.status === 'ready')) {
          const fromFinal = totalR - m.round;
          const rl = fromFinal === 0 ? '決勝' : fromFinal === 1 ? '準決勝' : fromFinal === 2 ? '準々決勝' : `${m.round}回戦`;
          matches.push({ match: m, bracket: b, roundLabel: rl });
        }
      }
    }
    matches.sort((a, b) => {
      if (a.match.round !== b.match.round) return a.match.round - b.match.round;
      const catOrder = ['1st', '2nd', '3rd', '4th'];
      return catOrder.indexOf(a.bracket.category) - catOrder.indexOf(b.bracket.category);
    });
    return matches;
  }, [brackets]);

  if (brackets.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Trophy size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">データをインポートするとトーナメント表が表示されます</p>
      </div>
    );
  }

  const getRoundLabel = (round: number, totalRounds: number): string => {
    const fromFinal = totalRounds - round;
    if (fromFinal === 0) return '決勝';
    if (fromFinal === 1) return '準決勝';
    if (fromFinal === 2) return '準々決勝';
    return `${round}回戦`;
  };

  const openScoreEditor = (match: BracketMatch) => {
    if (!match.team1Id || !match.team2Id || match.isBye) return;
    // 控え中 → コート割当ポップアップ
    const ca = bracketCourtAssignments[match.matchId];
    if (!ca && match.status !== 'finished' && match.status !== 'playing') {
      setCourtAssignMatch(match);
      setCourtAssignValue('');
      return;
    }
    // 試合中/完了 → スコア入力
    setEditingMatch(match);
    setScore1Input(match.score1 !== null && match.score1 >= 0 ? match.score1.toString() : '');
    setScore2Input(match.score2 !== null && match.score2 >= 0 ? match.score2.toString() : '');
  };

  const handleCourtAssignConfirm = () => {
    if (!courtAssignMatch || !courtAssignValue) return;
    assignBracketMatchToCourt(courtAssignMatch.matchId, courtAssignValue);
    // コール確認: コート決定後にコールするか聞く
    const doCalling = window.confirm(`${courtAssignValue}でコールしますか？`);
    if (doCalling) {
      setCallMatch(courtAssignMatch);
      setCallCourt(courtAssignValue);
      setCallTime('');
    }
    setCourtAssignMatch(null);
  };

  const saveScore = () => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2) || s1 === s2) return;
    updateBracketScore(editingMatch.matchId, s1, s2);
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
    // コートから解放
    if (bracketCourtAssignments[editingMatch.matchId]) {
      useMixedStore.getState().removeBracketMatchFromCourt(editingMatch.matchId);
    }
    setEditingMatch(null);
  };

  const handleDEF = (winnerTeamId: string) => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    const finalScore1 = !isNaN(s1) && s1 >= 0 ? s1 : 0;
    const finalScore2 = !isNaN(s2) && s2 >= 0 ? s2 : 0;
    updateBracketScore(editingMatch.matchId, finalScore1, finalScore2, winnerTeamId);
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
    if (bracketCourtAssignments[editingMatch.matchId]) {
      useMixedStore.getState().removeBracketMatchFromCourt(editingMatch.matchId);
    }
    setEditingMatch(null);
  };

  const handleScore1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore1Input(raw);
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (num !== winGames && num !== winGames + 1 && score2Input === '') {
        setScore2Input(winGames.toString());
      }
      setTimeout(() => {
        score2Ref.current?.focus();
        score2Ref.current?.select();
      }, 50);
    }
  };

  const handleScore2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setScore2Input(raw);
    if (raw.length === 1) {
      const num = parseInt(raw);
      if (!isNaN(num) && num !== winGames && num !== winGames + 1 && score1Input === '') {
        setScore1Input(winGames.toString());
      }
    }
  };

  // Winner highlight
  const winnerSide = (() => {
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2)) return 0;
    if (s1 > s2) return 1;
    if (s2 > s1) return 2;
    return 0;
  })();

  // 1位トーナメントかつ試合がまだ始まっていないかチェック
  const is1stBracket = selectedBracketCategory === '1st';
  const noMatchesStarted = currentBracket?.matches.every(m => m.status === 'waiting' || m.status === 'bye') ?? true;

  return (
    <div className="space-y-4">
      {/* メインタブ: トーナメント / 控えリスト */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setViewMode('bracket')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            viewMode === 'bracket' ? 'bg-white border border-b-white border-gray-200 text-gray-800 -mb-[1px]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Trophy size={14} />
          トーナメント
        </button>
        <button
          onClick={() => setViewMode('waiting')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-bold transition-all ${
            viewMode === 'waiting' ? 'bg-white border border-b-white border-gray-200 text-gray-800 -mb-[1px]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList size={14} />
          控えリスト
          {waitingMatches.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{waitingMatches.length}</span>
          )}
        </button>
      </div>

      {/* 控えリスト表示 */}
      {viewMode === 'waiting' && (
        <WaitingList waitingMatches={waitingMatches} leagues={leagues} />
      )}

      {viewMode === 'bracket' && (<>
      {/* カテゴリタブ */}
      <div className="flex gap-2 overflow-x-auto">
        {CATEGORY_TABS.map(tab => {
          const Icon = tab.icon;
          const bracket = brackets.find(b => b.category === tab.id);
          const isActive = selectedBracketCategory === tab.id;
          const nonByeMatches = bracket?.matches.filter(m => !m.isBye) || [];
          const finished = nonByeMatches.filter(m => m.status === 'finished').length;
          const total = nonByeMatches.length;

          return (
            <button
              key={tab.id}
              onClick={() => setSelectedBracketCategory(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap
                ${isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
              {bracket && (
                <span className={`text-[10px] ml-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  ({finished}/{total})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ドロー編集ボタン */}
      <div className="flex justify-end">
        <button
          onClick={() => setDrawEditMode(!drawEditMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            drawEditMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <RotateCcw size={12} />
          {drawEditMode ? 'ドロー編集を終了' : 'ドロー編集'}
        </button>
      </div>

      {/* ドロー編集パネル */}
      {drawEditMode && currentBracket && (
        <DrawEditPanel bracket={currentBracket} />
      )}

      {/* 1位トーナメント: ルーレット抽選 */}
      {is1stBracket && noMatchesStarted && currentBracket && (
        <RouletteDrawPanel
          bracket={currentBracket}
          onShuffle={shuffleBracketSeeds}
        />
      )}

      {/* ブラケット表示 */}
      {currentBracket && (
        <BracketDisplay
          bracket={currentBracket}
          onMatchClick={openScoreEditor}
          getRoundLabel={getRoundLabel}
          allTeams={useMixedStore.getState().allTeams}
          courtAssignments={bracketCourtAssignments}
        />
      )}

      {/* コート割当ポップアップ */}
      {courtAssignMatch && (() => {
        const allTeamsData = useMixedStore.getState().allTeams;
        const t1 = allTeamsData.find(t => t.teamId === courtAssignMatch.team1Id);
        const t2 = allTeamsData.find(t => t.teamId === courtAssignMatch.team2Id);
        // 使用中コートを除外
        const usedCourts = new Set(Object.values(bracketCourtAssignments).map(ca => ca.courtName));
        const courtOpts = Array.from({ length: 16 }, (_, i) => `${i + 1}コート`);
        const leagueInProgress = new Set<string>();
        for (const l of leagues) {
          const lm = useMixedStore.getState().leagueMatches.filter(m => m.leagueId === l.leagueId);
          if (lm.some(m => m.status !== 'finished')) {
            const nums = l.courtName?.match(/\d+/g);
            if (nums) for (const n of nums) leagueInProgress.add(`${n}コート`);
          }
        }
        return createPortal(
          <div className="fixed inset-0 bg-black/40 z-[100]" onClick={() => setCourtAssignMatch(null)}>
            <div
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[380px] max-w-[92vw] max-h-[85vh] overflow-y-auto z-[110] p-5"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-gray-800 mb-3">コートを決定</h3>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  {courtAssignMatch.team1League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignMatch.team1League}</span>}
                  <span className="font-bold">{t1?.teamName || courtAssignMatch.team1Name}</span>
                </div>
                <div className="text-gray-400 text-[9px] my-0.5">vs</div>
                <div className="flex items-center gap-2">
                  {courtAssignMatch.team2League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignMatch.team2League}</span>}
                  <span className="font-bold">{t2?.teamName || courtAssignMatch.team2Name}</span>
                </div>
              </div>
              <label className="text-xs font-bold text-gray-600 block mb-2">コートを選択 <span className="text-gray-400 font-normal">（使用中は選択不可）</span></label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {courtOpts.map(c => {
                  const isUsed = usedCourts.has(c) || leagueInProgress.has(c);
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
                <button onClick={() => setCourtAssignMatch(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">キャンセル</button>
                <button onClick={handleCourtAssignConfirm} disabled={!courtAssignValue}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >決定</button>
              </div>
              <button onClick={() => {
                // スキップしてスコア入力へ
                setCourtAssignMatch(null);
                setEditingMatch(courtAssignMatch);
                setScore1Input(courtAssignMatch.score1 !== null && courtAssignMatch.score1 >= 0 ? courtAssignMatch.score1.toString() : '');
                setScore2Input(courtAssignMatch.score2 !== null && courtAssignMatch.score2 >= 0 ? courtAssignMatch.score2.toString() : '');
              }} className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                スキップしてスコア入力 →
              </button>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* スコア入力モーダル */}
      {editingMatch && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[100]" onClick={() => setEditingMatch(null)}>
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[420px] max-w-[92vw] max-h-[85vh] overflow-y-auto z-[110] p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-800 mb-4">スコア入力</h3>

            <div className="flex items-center gap-4 mb-5">
              <div className={`flex-1 text-center p-2 rounded-xl border-2 transition-all ${winnerSide === 1 ? 'bg-emerald-50 border-emerald-300' : 'border-transparent'}`}>
                <div className="font-medium text-sm">{editingMatch.team1Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team1League}</div>
              </div>
              <span className="text-gray-300 font-bold">VS</span>
              <div className={`flex-1 text-center p-2 rounded-xl border-2 transition-all ${winnerSide === 2 ? 'bg-emerald-50 border-emerald-300' : 'border-transparent'}`}>
                <div className="font-medium text-sm">{editingMatch.team2Name}</div>
                <div className="text-xs text-gray-400">{editingMatch.team2League}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mb-5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={score1Input}
                onChange={handleScore1Change}
                className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${winnerSide === 1 ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-emerald-300'}`}
                autoFocus
              />
              <span className="text-2xl font-bold text-gray-300">-</span>
              <input
                ref={score2Ref}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={score2Input}
                onChange={handleScore2Change}
                onKeyDown={e => { if (e.key === 'Enter') saveScore(); }}
                className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${winnerSide === 2 ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-emerald-300'}`}
              />
            </div>

            {/* Save button */}
            <button
              onClick={saveScore}
              className="w-full flex items-center justify-center gap-2 py-3 min-h-[48px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium mb-3 active:scale-[0.98] transition-all shadow-md"
            >
              <Save size={14} />保存
            </button>

            {/* DEF buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => editingMatch.team2Id && handleDEF(editingMatch.team2Id)}
                className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
              >
                <Ban size={14} />
                <span className="truncate">{editingMatch.team1Name}</span>
                <span className="text-xs">DEF</span>
              </button>
              <button
                onClick={() => editingMatch.team1Id && handleDEF(editingMatch.team1Id)}
                className="flex items-center justify-center gap-1.5 px-3 py-3 min-h-[48px] bg-orange-50 border-2 border-orange-300 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold active:scale-[0.98]"
              >
                <Ban size={14} />
                <span className="truncate">{editingMatch.team2Name}</span>
                <span className="text-xs">DEF</span>
              </button>
            </div>

            {/* 印刷・コールボタン */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => {
                const at = useMixedStore.getState().allTeams;
                const rules = tournamentInfo?.rules || [];
                const gr = rules.find(r => /ゲームマッチ|ノーアド|タイブレ/.test(r))?.replace(/^（[０-９\d]+）\s*/, '').trim() || '';
                printRefereeSheet(editingMatch, at, tournamentInfo?.name || '', currentBracket?.label || '', getRoundLabel(editingMatch.round, Math.log2(currentBracket?.drawSize || 16)), gr, tournamentInfo);
              }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 text-xs hover:bg-gray-100 active:scale-[0.98] transition-all">
                印刷
              </button>
              <button onClick={() => {
                const ca = bracketCourtAssignments[editingMatch.matchId];
                setEditingMatch(null);
                setCallMatch(editingMatch);
                setCallCourt(ca ? ca.courtName : '');
                setCallTime('');
              }}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 text-xs hover:bg-blue-100 active:scale-[0.98] transition-all">
                <Volume2 size={12} />コール
              </button>
            </div>

            <button onClick={() => setEditingMatch(null)} className="w-full py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all">
              キャンセル
            </button>
          </div>
        </div>,
        document.body
      )}

      </>)}

      {/* 音声コールプレビュー */}
      {callMatch && currentBracket && (() => {
        const ct1 = useMixedStore.getState().allTeams.find(t => t.teamId === callMatch.team1Id);
        const ct2 = useMixedStore.getState().allTeams.find(t => t.teamId === callMatch.team2Id);
        if (!ct1 || !ct2) return null;
        const totalR = Math.log2(currentBracket.drawSize);
        const rl = getRoundLabel(callMatch.round, totalR);
        return (
          <CallPreviewDialog
            match={callMatch}
            team1={ct1}
            team2={ct2}
            category={currentBracket.category}
            roundLabel={rl}
            courtName={callCourt}
            startTime={callTime}
            allTeams={useMixedStore.getState().allTeams}
            onConfirm={(text) => {
              if (text) speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 1 });
              setCallMatch(null);
            }}
            onClose={() => setCallMatch(null)}
          />
        );
      })()}
    </div>
  );
}

/** ドロー編集パネル: 1回戦の対戦順を手動で修正 */
function DrawEditPanel({ bracket }: { bracket: PlacementBracket }) {
  const { rebuildBracketFromSlots } = useMixedStore();
  const allTeams = useMixedStore(s => s.allTeams);

  // 1回戦の16スロット（BYE=null含む）を構築
  const r1Matches = bracket.matches.filter(m => m.round === 1).sort((a, b) => a.position - b.position);
  const slots: { teamId: string | null; teamName: string; league: string; isBye: boolean }[] = [];
  for (const m of r1Matches) {
    const t1Bye = !m.team1Id && (m.team2Name === 'BYE' || m.isBye);
    const t2Bye = !m.team2Id && (m.team1Name === 'BYE' || m.isBye);
    slots.push({
      teamId: m.team1Id || (m.team1Name === 'BYE' ? null : null),
      teamName: m.team1Name, league: m.team1League,
      isBye: t1Bye || m.team1Name === 'BYE',
    });
    slots.push({
      teamId: m.team2Id || null,
      teamName: m.team2Name, league: m.team2League,
      isBye: t2Bye || m.team2Name === 'BYE',
    });
  }

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const swapSlots = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const newSlots = [...slots];
    const temp = newSlots[fromIdx];
    newSlots[fromIdx] = newSlots[toIdx];
    newSlots[toIdx] = temp;
    // 16スロット配列を直接渡してブラケットを再構築
    const slotArray: (string | null)[] = newSlots.map(s => s.isBye ? null : s.teamId);
    rebuildBracketFromSlots(bracket.category, slotArray);
  };

  const hasStartedMatches = r1Matches.some(m => m.status === 'finished' || m.status === 'playing');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-100">
        <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
          <RotateCcw size={16} className="text-blue-600" />
          ドロー編集
          <span className="text-[10px] font-normal text-blue-500">（スロットをタップして入れ替え）</span>
        </h3>
      </div>
      <div className="p-4">
        {hasStartedMatches && (
          <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
            試合が開始済みのため編集できません。
          </div>
        )}
        <div className="space-y-0.5">
          {slots.map((slot, idx) => {
            const isMatchBoundary = idx % 2 === 0 && idx > 0;
            const teamData = slot.teamId ? allTeams.find(t => t.teamId === slot.teamId) : null;
            const isSelected = dragIdx === idx;
            const matchNum = Math.floor(idx / 2) + 1;

            return (
              <div key={idx}>
                {isMatchBoundary && <div className="h-2" />}
                {idx % 2 === 0 && (
                  <div className="text-[9px] text-gray-400 font-bold mb-0.5 ml-1">第{matchNum}試合</div>
                )}
                <button
                  disabled={hasStartedMatches}
                  onClick={() => {
                    if (hasStartedMatches) return;
                    if (dragIdx === null) {
                      setDragIdx(idx);
                    } else {
                      swapSlots(dragIdx, idx);
                      setDragIdx(null);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all ${
                    isSelected ? 'bg-blue-100 border-2 border-blue-400 ring-2 ring-blue-200' :
                    dragIdx !== null ? 'bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 cursor-pointer' :
                    slot.isBye || slot.teamName === 'BYE' ? 'bg-gray-50 border border-gray-200 text-gray-400' :
                    'bg-white border border-gray-200 hover:bg-gray-50'
                  } ${hasStartedMatches ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="w-5 text-center text-[10px] text-gray-400 font-mono shrink-0">{idx + 1}</span>
                  {slot.teamId && slot.league ? (
                    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[slot.league.trim()] || 'bg-gray-100 text-gray-600'}`}>
                      {slot.league}
                    </span>
                  ) : <span className="w-5 shrink-0" />}
                  {teamData ? (
                    <span className="font-bold text-gray-800">{teamData.teamName}</span>
                  ) : slot.teamName === 'BYE' || slot.isBye ? (
                    <span className="text-gray-400 italic">BYE</span>
                  ) : (
                    <span className="text-gray-400">―</span>
                  )}
                  {teamData && <span className="text-[10px] text-gray-400 ml-auto">No.{teamData.pairNumber}</span>}
                </button>
              </div>
            );
          })}
        </div>
        {dragIdx !== null && (
          <div className="mt-3 text-center text-xs text-blue-600 font-medium animate-pulse">
            入れ替え先のスロットをタップしてください
          </div>
        )}
        {dragIdx !== null && (
          <button onClick={() => setDragIdx(null)} className="mt-2 w-full py-2 bg-gray-100 text-gray-500 rounded-lg text-xs hover:bg-gray-200">
            選択を取り消し
          </button>
        )}
      </div>
    </div>
  );
}

/** ルーレット抽選パネル（改善版: 全ペア表示・個別選択・手動配置） */
function RouletteDrawPanel({ bracket, onShuffle }: {
  bracket: PlacementBracket;
  onShuffle: (category: PlacementCategory, newOrder: string[]) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teams = bracket.teams;

  // ドロー表通りの16スロット構造（BYE位置は2位等と同じパターン: slot2,slot8,slot16がBYE）
  // ①=slot1(BYE), ②③=slot3-4, ④⑤=slot5-6, ⑥=slot7(BYE), ⑦⑧=slot9-10, ⑨⑩=slot11-12, ⑪⑫=slot13-14, ⑬=slot15(BYE)
  const DRAW_SIZE = 16;
  const BYE_POSITIONS = new Set([1, 7, 15]); // 0-indexed: slot2, slot8, slot16
  const circled = (n: number) => String.fromCodePoint(0x2460 + n);

  // チーム配置可能なスロット（BYE以外）
  const teamSlots = useMemo(() =>
    Array.from({ length: DRAW_SIZE }, (_, i) => i).filter(i => !BYE_POSITIONS.has(i)),
  []);

  // 割当済みチームID
  const assignedTeamIds = useMemo(() => new Set(assignedSlots.values()), [assignedSlots]);
  const availableSlots = useMemo(() => teamSlots.filter(i => !assignedSlots.has(i)), [teamSlots, assignedSlots]);
  const unassignedTeams = useMemo(() => teams.filter(t => !assignedTeamIds.has(t.teamId)), [teams, assignedTeamIds]);
  const activeTeam = selectedTeamId ? teams.find(t => t.teamId === selectedTeamId) : unassignedTeams[0];

  // 現在の割当状態をブラケットに即時反映するヘルパー
  const syncToBracket = useCallback((slotsMap: Map<number, string>) => {
    const slots16: (string | null)[] = Array(DRAW_SIZE).fill(null);
    slotsMap.forEach((teamId, slot) => { slots16[slot] = teamId; });
    const order = slots16.filter((id): id is string => id !== null);
    // 未配置チームも末尾に追加（ブラケット再構築に必要）
    const ids = new Set(order);
    for (const t of teams) { if (!ids.has(t.teamId)) order.push(t.teamId); }
    onShuffle(bracket.category, order);
  }, [teams, bracket.category, onShuffle]);

  // ルーレット
  const spinRoulette = useCallback(() => {
    if (!activeTeam || availableSlots.length === 0) return;
    setSpinning(true);
    let count = 0;
    const totalSpins = 12 + Math.floor(Math.random() * 8);
    const spin = () => {
      setCurrentHighlight(availableSlots[Math.floor(Math.random() * availableSlots.length)]);
      count++;
      if (count < totalSpins) {
        spinTimerRef.current = setTimeout(spin, 50 + count * 18);
      } else {
        const finalSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
        setCurrentHighlight(finalSlot);
        const newSlots = new Map(assignedSlots);
        newSlots.set(finalSlot, activeTeam.teamId);
        setAssignedSlots(newSlots);
        setSpinning(false);
        setSelectedTeamId(null);
        // トーナメント表に即座に反映
        syncToBracket(newSlots);
      }
    };
    spin();
  }, [activeTeam, availableSlots, assignedSlots, syncToBracket]);

  const manualAssign = (slotIdx: number) => {
    if (!activeTeam || assignedSlots.has(slotIdx) || BYE_POSITIONS.has(slotIdx)) return;
    const newSlots = new Map(assignedSlots);
    newSlots.set(slotIdx, activeTeam.teamId);
    setAssignedSlots(newSlots);
    setSelectedTeamId(null);
    // トーナメント表に即座に反映
    syncToBracket(newSlots);
  };

  // 全自動抽選
  const autoDrawAll = useCallback(() => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    // BYE以外のスロットに順に配置
    const slots16: (string | null)[] = Array(DRAW_SIZE).fill(null);
    let ti = 0;
    for (let i = 0; i < DRAW_SIZE; i++) {
      if (BYE_POSITIONS.has(i)) continue;
      if (ti < shuffled.length) { slots16[i] = shuffled[ti].teamId; ti++; }
    }
    const order = slots16.filter((id): id is string => id !== null);
    onShuffle(bracket.category, order);
    setDrawComplete(true);
  }, [teams, bracket.category, onShuffle]);

  // 手動割当確定
  const confirmDraw = useCallback(() => {
    const slots16: (string | null)[] = Array(DRAW_SIZE).fill(null);
    assignedSlots.forEach((teamId, slot) => { slots16[slot] = teamId; });
    const order = slots16.filter((id): id is string => id !== null);
    const ids = new Set(order);
    for (const t of teams) { if (!ids.has(t.teamId)) order.push(t.teamId); }
    onShuffle(bracket.category, order);
    setDrawComplete(true);
  }, [assignedSlots, teams, bracket.category, onShuffle]);

  const resetDraw = () => {
    setAssignedSlots(new Map());
    setSelectedTeamId(null);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
  };

  useEffect(() => () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); }, []);

  // チーム番号（スロット内の通し番号、BYE除く）
  let teamNumCounter = 0;
  const slotTeamNum: number[] = [];
  for (let i = 0; i < DRAW_SIZE; i++) {
    if (BYE_POSITIONS.has(i)) { slotTeamNum.push(-1); }
    else { teamNumCounter++; slotTeamNum.push(teamNumCounter); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-2 border-b border-yellow-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
          <Shuffle size={14} className="text-yellow-600" />
          1位トーナメント 抽選
        </h3>
        <button onClick={resetDraw} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <RotateCcw size={12} />リセット
        </button>
      </div>

      <div className="p-3">
        {!drawComplete ? (
          <>
            {/* ペア選択 */}
            <div className="mb-3">
              <div className="text-[10px] text-gray-500 mb-1.5">ペアを選択してスロットに配置</div>
              <div className="flex flex-wrap gap-1">
                {teams.map(t => {
                  const isAssigned = assignedTeamIds.has(t.teamId);
                  const isSelected = activeTeam?.teamId === t.teamId;
                  return (
                    <button key={t.teamId} onClick={() => !isAssigned && setSelectedTeamId(t.teamId)}
                      disabled={isAssigned || spinning}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                        isAssigned ? 'bg-emerald-50 border-emerald-200 text-emerald-500 line-through opacity-60' :
                        isSelected ? 'bg-yellow-100 border-yellow-400 text-yellow-800 ring-1 ring-yellow-300' :
                        'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                    >
                      {t.leagueId} {t.teamName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ルーレットボタン */}
            {activeTeam && !spinning && (
              <div className="mb-3 flex items-center gap-2 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                <span className="text-[10px] text-yellow-700 flex-1 truncate">
                  <span className="font-bold">{activeTeam.leagueId}</span> {activeTeam.teamName}
                </span>
                <button onClick={spinRoulette}
                  className="px-3 py-1 rounded-lg text-[10px] font-bold bg-yellow-500 text-white hover:bg-yellow-600 shrink-0">
                  🎲 ルーレット
                </button>
              </div>
            )}
            {spinning && (
              <div className="mb-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg text-center text-xs font-bold text-yellow-700 animate-pulse">抽選中...</div>
            )}

            {/* ドロー表形式スロット（対戦ペアで2列表示） */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-3">
              {Array.from({ length: DRAW_SIZE / 2 }, (_, matchIdx) => {
                const s1 = matchIdx * 2;
                const s2 = matchIdx * 2 + 1;
                const isBye1 = BYE_POSITIONS.has(s1);
                const isBye2 = BYE_POSITIONS.has(s2);
                const a1 = assignedSlots.get(s1);
                const a2 = assignedSlots.get(s2);
                const t1 = a1 ? teams.find(t => t.teamId === a1) : null;
                const t2 = a2 ? teams.find(t => t.teamId === a2) : null;
                const hl1 = currentHighlight === s1 && spinning;
                const hl2 = currentHighlight === s2 && spinning;
                const canPlace1 = !isBye1 && !assignedSlots.has(s1) && !!activeTeam && !spinning;
                const canPlace2 = !isBye2 && !assignedSlots.has(s2) && !!activeTeam && !spinning;

                const renderSlot = (si: number, isBye: boolean, team: typeof t1, hl: boolean, canPlace: boolean) => (
                  <div
                    onClick={() => canPlace && manualAssign(si)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] transition-all ${
                      isBye ? 'bg-gray-100 text-gray-400' :
                      hl ? 'bg-yellow-200' :
                      team ? 'bg-emerald-50' :
                      canPlace ? 'bg-yellow-50 cursor-pointer hover:bg-yellow-100' : 'bg-white'
                    }`}
                  >
                    <span className="text-gray-400 font-bold w-4 text-center shrink-0">
                      {isBye ? '' : circled(slotTeamNum[si] - 1)}
                    </span>
                    {isBye ? (
                      <span className="text-gray-300 italic">BYE</span>
                    ) : team ? (
                      <span className="font-bold text-gray-800 truncate"><span className="text-gray-400">{team.leagueId}</span> {team.teamName}</span>
                    ) : canPlace ? (
                      <span className="text-yellow-500">← タップ</span>
                    ) : (
                      <span className="text-gray-300">―</span>
                    )}
                  </div>
                );

                return (
                  <div key={matchIdx} className="rounded border border-gray-200 overflow-hidden">
                    {renderSlot(s1, isBye1, t1, hl1, canPlace1)}
                    <div className="border-t border-gray-100" />
                    {renderSlot(s2, isBye2, t2, hl2, canPlace2)}
                  </div>
                );
              })}
            </div>

            {/* ボタン群 */}
            <div className="flex gap-2">
              <button onClick={autoDrawAll}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600">
                🎲 全自動抽選
              </button>
              {unassignedTeams.length === 0 && (
                <button onClick={confirmDraw}
                  className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600">
                  ✓ 確定
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-emerald-600 font-bold text-sm mb-2">抽選完了</div>
            <p className="text-xs text-gray-500">トーナメント表に反映されました</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** ブラケット描画コンポーネント */
function BracketDisplay({ bracket, onMatchClick, getRoundLabel, allTeams, courtAssignments, compact = false }: {
  bracket: PlacementBracket;
  onMatchClick: (match: BracketMatch) => void;
  getRoundLabel: (round: number, total: number) => string;
  allTeams: { teamId: string; teamName: string; male: { name: string; affiliation: string }; female: { name: string; affiliation: string }; pairNumber: number; leagueId: string }[];
  courtAssignments: Record<string, { courtName: string; startedAt: number }>;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // 4・5位トーナメント: 同一リーグから複数チーム参加時にM4, M5等のサフィックスを付ける
  const teamLeagueSuffix = useMemo(() => {
    if (bracket.category !== '4th') return new Map<string, string>();
    const leagueCount = new Map<string, number>();
    const result = new Map<string, string>();
    // 1回戦のチームを順に見て、同一リーグの出現回数をカウント
    for (const t of bracket.teams) {
      const lid = t.leagueId.trim();
      const count = (leagueCount.get(lid) || 0) + 1;
      leagueCount.set(lid, count);
      // 2回目以降は5位
      if (count > 1) result.set(t.teamId, `${lid}5`);
      else result.set(t.teamId, leagueCount.get(lid)! > 0 ? `${lid}4` : lid);
    }
    // 1回しか出現しないリーグはサフィックス不要
    for (const [tid, suffix] of result) {
      const lid = suffix.replace(/[0-9]$/, '');
      if ((leagueCount.get(lid) || 0) <= 1) result.set(tid, lid);
    }
    return result;
  }, [bracket]);

  const getLeagueBadge = (teamId: string | null, league: string) => {
    if (teamId && teamLeagueSuffix.size > 0) {
      return teamLeagueSuffix.get(teamId) || league;
    }
    return league;
  };

  const totalRounds = Math.log2(bracket.drawSize);
  const matchesByRound: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    matchesByRound.push(bracket.matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
  }

  const MATCH_HEIGHT = compact ? 64 : 130;
  const BYE_HEIGHT = compact ? 28 : 56;
  const MATCH_WIDTH = compact ? 160 : 300;
  const ROUND_GAP = compact ? 20 : 52;
  const MATCH_GAP = compact ? 6 : 24;

  // 1位トーナメント以外: 配置されるリーグ情報をビジュアル表示
  const is1stBracket = bracket.category === '1st';


  // 未配置スロットに配置予定のリーグ情報を表示
  const BRACKET_SLOT_MAP: Record<string, (string | null)[]> = {
    '2nd': ['G',null,'E','L','H','C','J',null,'B','F','A','M','I','D','K',null],
    '3rd': ['D',null,'H','M','F','A','K',null,'I','G','C','E','L','J','B',null],
    '4th': ['A','M','F','J','L','B','D',null,'E','H','K','I','G','C',null,'M'],
  };
  const getPlaceholderInfo = (match: BracketMatch, slot: 'team1' | 'team2'): { text: string; leagueId?: string; rank?: string } | null => {
    if (is1stBracket) return { text: '―' };
    const id = slot === 'team1' ? match.team1Id : match.team2Id;
    if (id) return null; // 既に配置済み
    // 1回戦のみプレースホルダー表示
    if (match.round !== 1) return null;
    const pos = match.position;
    const slotIdx = slot === 'team1' ? (pos - 1) * 2 : (pos - 1) * 2 + 1;
    // スロットマップからリーグIDを取得
    const slotMap = BRACKET_SLOT_MAP[bracket.category];
    if (slotMap && slotIdx < slotMap.length) {
      const lid = slotMap[slotIdx];
      if (lid === null) return { text: 'BYE' };
      const rank = bracket.category === '2nd' ? '2' : bracket.category === '3rd' ? '3' : '4';
      return { text: `${lid}リーグ ${rank}位`, leagueId: lid, rank };
    }
    if (slotIdx < bracket.teams.length) {
      const t = bracket.teams[slotIdx];
      const rank = bracket.category === '2nd' ? '2' : bracket.category === '3rd' ? '3' : '4';
      return { text: `${t.leagueId}リーグ ${rank}位`, leagueId: t.leagueId, rank };
    }
    return { text: 'BYE' };
  };

  // グリッドの基本単位（BYEも通常マッチと同じグリッド位置を占める）
  const GRID_UNIT = MATCH_HEIGHT + MATCH_GAP;

  // 接続線: 各マッチの中心Y座標を計算（グリッド基準）
  const getMatchY = (roundIdx: number, matchIdx: number) => {
    const spacing = Math.pow(2, roundIdx);
    const offset = (spacing - 1) * GRID_UNIT / 2;
    return 36 + matchIdx * spacing * GRID_UNIT + offset + MATCH_HEIGHT / 2;
  };

  // SVG全体の高さ
  const r1count = matchesByRound[0]?.length || 0;
  const svgHeight = r1count * GRID_UNIT + 36;

  return (
    <div className={`bg-white shadow-sm border border-gray-200 p-4 overflow-x-auto ${compact ? 'rounded-b-xl' : 'rounded-xl'}`}>
      <div className="relative" style={{ minWidth: (MATCH_WIDTH + ROUND_GAP) * totalRounds, height: svgHeight }}>
        {/* 接続線SVG */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: (MATCH_WIDTH + ROUND_GAP) * totalRounds, height: svgHeight }}>
          {matchesByRound.slice(0, -1).map((roundMatches, roundIdx) => {
            const x1 = roundIdx * (MATCH_WIDTH + ROUND_GAP) + MATCH_WIDTH;
            const x2 = (roundIdx + 1) * (MATCH_WIDTH + ROUND_GAP);
            const xMid = (x1 + x2) / 2;
            const pairs: React.ReactNode[] = [];
            for (let i = 0; i < roundMatches.length; i += 2) {
              if (i + 1 >= roundMatches.length) break;
              const y1 = getMatchY(roundIdx, i);
              const y2 = getMatchY(roundIdx, i + 1);
              const yNext = getMatchY(roundIdx + 1, Math.floor(i / 2));
              pairs.push(
                <g key={`line-${roundIdx}-${i}`}>
                  <line x1={x1} y1={y1} x2={xMid} y2={y1} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={x1} y1={y2} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={y1} x2={xMid} y2={y2} stroke="#c9cdd3" strokeWidth="1.5" />
                  <line x1={xMid} y1={yNext} x2={x2} y2={yNext} stroke="#c9cdd3" strokeWidth="1.5" />
                </g>
              );
            }
            return pairs;
          })}
        </svg>

        {/* 各マッチをabsolute配置（接続線の中心と正確に一致） */}
        {matchesByRound.map((roundMatches, roundIdx) => {
          const round = roundIdx + 1;
          const colX = roundIdx * (MATCH_WIDTH + ROUND_GAP);

          return (
            <div key={round}>
              {/* ラウンドラベル */}
              <div className="absolute" style={{ left: colX, top: 4, width: MATCH_WIDTH }}>
                <div className="text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold
                    ${round === totalRounds ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white' :
                      round === totalRounds - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {getRoundLabel(round, totalRounds)}
                  </span>
                </div>
              </div>

              {roundMatches.map((match, matchIdx) => {
                const centerY = getMatchY(roundIdx, matchIdx);
                const ph1 = getPlaceholderInfo(match, 'team1');
                const ph2 = getPlaceholderInfo(match, 'team2');
                const isBye = match.isBye;
                const ca = courtAssignments[match.matchId];
                const isPlaying = !!ca;
                const elapsedMs = ca ? now - ca.startedAt : 0;
                const elapsedMin = Math.floor(elapsedMs / 60000);
                const elapsedH = Math.floor(elapsedMin / 60);
                const elapsedM = elapsedMin % 60;
                const elapsedStr = `${elapsedH}:${String(elapsedM).padStart(2, '0')}`;

                // BYEマッチ: 勝者を通常マッチと同じスタイルで表示
                if (isBye) {
                  const winnerId = match.winnerId;
                  let winnerData = winnerId ? allTeams.find(t => t.teamId === winnerId) : null;
                  if (!winnerData) {
                    const wName = match.team1Name || match.team2Name;
                    const wLeague = match.team1League || match.team2League;
                    if (wName && wLeague) winnerData = allTeams.find(t => t.teamName === wName && t.leagueId === wLeague.trim()) || null;
                  }
                  const winnerLeague = winnerId === match.team1Id ? match.team1League : match.team2League;
                  const byeBoxH = winnerData ? (compact ? 28 : 70) : BYE_HEIGHT;
                  return (
                    <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - byeBoxH / 2, width: MATCH_WIDTH }}>
                      <div className="flex items-center gap-1.5 px-2 rounded-lg border border-gray-200 bg-white" style={{ height: byeBoxH }}>
                        {winnerLeague && (
                          <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[winnerLeague.trim()] || 'bg-gray-100 text-gray-600'}`}>
                            {winnerLeague}
                          </span>
                        )}
                        {winnerData ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 font-mono shrink-0 w-4 text-center">{winnerData.pairNumber}</span>
                            <div className="shrink-0" style={{ width: 95 }}>
                              <div className="text-sm font-bold text-gray-800 leading-tight"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{winnerData.male.name.replace(/[\s\u3000]+/g, '')}</span></div>
                              <div className="text-sm font-bold text-gray-800 leading-tight"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{winnerData.female.name.replace(/[\s\u3000]+/g, '')}</span></div>
                            </div>
                            <div className="w-px h-7 bg-gray-200 shrink-0" />
                            <div className="flex-1 min-w-0 text-center">
                              <div className="text-[11px] text-gray-400 truncate">{winnerData.male.affiliation}</div>
                              <div className="text-[11px] text-gray-400 truncate">{winnerData.female.affiliation}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-gray-700 truncate flex-1">{match.team1Name || match.team2Name}</span>
                        )}
                      </div>
                    </div>
                  );
                }

                // 通常マッチ
                const SLOT_HEIGHT = compact ? 22 : 42;
                const STATUS_HEIGHT = compact ? 16 : 30;
                const renderSlot = (slot: { teamId: string | null; name: string; league: string; score: number | null; isWinner: boolean; ph: ReturnType<typeof getPlaceholderInfo>; isTop: boolean }) => {
                  // teamIdから探す。なければnameから逆引き
                  let teamData = slot.teamId ? allTeams.find(t => t.teamId === slot.teamId) : null;
                  if (!teamData && slot.name && slot.league) {
                    teamData = allTeams.find(t => t.teamName === slot.name && t.leagueId === slot.league.trim()) || null;
                  }
                  return (
                    <div className={`flex items-center px-2 text-xs ${slot.isTop ? 'border-b border-gray-100' : ''}
                      ${slot.isWinner ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                    `} style={{ height: SLOT_HEIGHT }}>
                      {slot.league ? (() => {
                        const badge = getLeagueBadge(slot.teamId, slot.league);
                        return <span className={`shrink-0 mr-1.5 rounded text-[9px] font-bold flex items-center justify-center ${badge.length > 1 ? 'w-7 h-5 text-[8px]' : 'w-5 h-5'} ${LEAGUE_BADGE_COLORS[slot.league.trim()] || 'bg-gray-100 text-gray-600'}`}>{badge}</span>;
                      })() : <span className="w-5 shrink-0 mr-1.5" />}
                      <div className="flex-1 min-w-0">
                        {teamData ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 font-mono shrink-0 w-4 text-center">{teamData.pairNumber}</span>
                            <div className="shrink-0" style={{ width: 95 }}>
                              <div className="text-sm font-bold text-gray-800 leading-tight"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{teamData.male.name.replace(/[\s\u3000]+/g, '')}</span></div>
                              <div className="text-sm font-bold text-gray-800 leading-tight"><span className="inline-block w-[5em] text-justify" style={{ textAlignLast: 'justify' }}>{teamData.female.name.replace(/[\s\u3000]+/g, '')}</span></div>
                            </div>
                            <div className="w-px h-7 bg-gray-200 shrink-0" />
                            <div className="flex-1 min-w-0 text-center">
                              <div className="text-[11px] text-gray-400 truncate">{teamData.male.affiliation}</div>
                              <div className="text-[11px] text-gray-400 truncate">{teamData.female.affiliation}</div>
                            </div>
                          </div>
                        ) : slot.ph?.leagueId ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[10px] font-bold">{slot.ph.leagueId}</span>
                            <span className="text-[10px] text-blue-400">{slot.ph.rank}位</span>
                          </span>
                        ) : slot.ph ? <span className="text-[10px] text-gray-400">{slot.ph.text}</span>
                        : slot.name ? <span className="text-[11px] truncate">{slot.name}</span>
                        : <span className="text-[10px] text-gray-400">―</span>}
                      </div>
                      {slot.score !== null && (
                        <span className={`font-mono font-bold ml-1 text-base shrink-0 ${slot.isWinner ? 'text-emerald-600' : 'text-gray-500'}`}>{slot.score}</span>
                      )}
                    </div>
                  );
                };

                return (
                  <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - MATCH_HEIGHT / 2, width: MATCH_WIDTH, zIndex: 1 }}>
                    <div
                      onClick={() => onMatchClick(match)}
                      className={`rounded-lg border-2 overflow-hidden cursor-pointer transition-all
                        ${isPlaying ? 'border-green-400 shadow-md bracket-playing-blink' :
                          match.status === 'finished' ? 'border-emerald-300 shadow-sm' :
                          match.team1Id && match.team2Id ? 'border-blue-300 hover:shadow-md' :
                          'border-gray-200 hover:border-gray-300'}
                      `}
                      style={{ height: MATCH_HEIGHT }}
                    >
                      {renderSlot({ teamId: match.team1Id, name: match.team1Name, league: match.team1League, score: match.score1, isWinner: match.winnerId === match.team1Id, ph: ph1, isTop: true })}
                      {renderSlot({ teamId: match.team2Id, name: match.team2Name, league: match.team2League, score: match.score2, isWinner: match.winnerId === match.team2Id, ph: ph2, isTop: false })}
                      {/* 枠内ステータスバー */}
                      {match.team1Id && match.team2Id && (
                        <div className={`flex items-center text-[10px] font-medium border-t border-gray-100 px-2
                          ${isPlaying ? 'bg-green-50 text-green-700' :
                            match.status === 'finished' ? 'bg-gray-50 text-gray-500' :
                            'bg-amber-50/50 text-amber-600'}
                        `} style={{ height: STATUS_HEIGHT }}>
                          {isPlaying ? (
                            <>
                              <span className="flex items-center gap-1 shrink-0">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="font-bold text-green-700">{ca.courtName.replace('コート', '')}コート</span>
                              </span>
                              <span className="ml-auto font-mono text-green-600">{elapsedStr}</span>
                            </>
                          ) : match.status === 'finished' ? (
                            <span className="mx-auto text-gray-400">完了</span>
                          ) : (
                            <span className="mx-auto flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />控え中</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 点滅アニメーション */}
      <style>{`
        @keyframes bracket-playing {
          0%, 100% { border-color: rgb(74, 222, 128); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
          50% { border-color: rgb(34, 197, 94); box-shadow: 0 0 8px 2px rgba(34, 197, 94, 0.3); }
        }
        .bracket-playing-blink { animation: bracket-playing 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

/** 控えリスト — 全トーナメントの対戦待ちを表示 */
function WaitingList({ waitingMatches, leagues }: {
  waitingMatches: { match: BracketMatch; bracket: PlacementBracket; roundLabel: string }[];
  leagues: { leagueId: string; courtName: string }[];
}) {
  const allTeams = useMixedStore(s => s.allTeams);
  const { assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();
  const [courtAssignMatch, setCourtAssignMatch] = useState<BracketMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');

  const catLabel = (cat: PlacementCategory) => cat === '1st' ? '1位' : cat === '2nd' ? '2位' : cat === '3rd' ? '3位' : '4・5位';

  // 使用中コート
  const usedCourts = useMemo(() => {
    const set = new Set<string>();
    for (const ca of Object.values(bracketCourtAssignments)) set.add(ca.courtName);
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

  const handleCourtConfirm = () => {
    if (!courtAssignMatch || !courtAssignValue) return;
    assignBracketMatchToCourt(courtAssignMatch.matchId, courtAssignValue);
    setCourtAssignMatch(null);
    setCourtAssignValue('');
  };

  if (waitingMatches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">対戦控えはありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-2">
        {waitingMatches.length}試合が控えています（1回戦優先で自動並べ替え）
      </div>
      {waitingMatches.map(({ match, bracket, roundLabel }) => {
        const team1 = allTeams.find(t => t.teamId === match.team1Id);
        const team2 = allTeams.find(t => t.teamId === match.team2Id);
        return (
          <div key={match.matchId} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
            <div className="shrink-0 text-center">
              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                bracket.category === '1st' ? 'bg-yellow-100 text-yellow-700' :
                bracket.category === '2nd' ? 'bg-gray-200 text-gray-600' :
                bracket.category === '3rd' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-600'
              }`}>{catLabel(bracket.category)}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">{roundLabel}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                {match.team1League && <span className="w-4 h-4 rounded bg-gray-100 text-[8px] font-bold text-gray-600 flex items-center justify-center shrink-0">{match.team1League}</span>}
                <span className="font-bold text-gray-800 truncate">{team1?.teamName || match.team1Name}</span>
              </div>
              <div className="text-[9px] text-gray-400 my-0.5">vs</div>
              <div className="flex items-center gap-2 text-xs">
                {match.team2League && <span className="w-4 h-4 rounded bg-gray-100 text-[8px] font-bold text-gray-600 flex items-center justify-center shrink-0">{match.team2League}</span>}
                <span className="font-bold text-gray-800 truncate">{team2?.teamName || match.team2Name}</span>
              </div>
            </div>
            <button
              onClick={() => { setCourtAssignMatch(match); setCourtAssignValue(''); }}
              className="px-3 py-1.5 text-[10px] font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 active:scale-95 transition-all shrink-0"
            >
              コート入れ
            </button>
          </div>
        );
      })}

      {/* コート割当ポップアップ */}
      {courtAssignMatch && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={() => setCourtAssignMatch(null)}>
          <div className="min-h-full flex items-start justify-center py-[10vh] px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-full p-5 z-50" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-gray-800 mb-3">コートを決定</h3>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  {courtAssignMatch.team1League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignMatch.team1League}</span>}
                  <span className="font-bold">{allTeams.find(t => t.teamId === courtAssignMatch.team1Id)?.teamName || courtAssignMatch.team1Name}</span>
                </div>
                <div className="text-gray-400 text-[9px] my-0.5">vs</div>
                <div className="flex items-center gap-2">
                  {courtAssignMatch.team2League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignMatch.team2League}</span>}
                  <span className="font-bold">{allTeams.find(t => t.teamId === courtAssignMatch.team2Id)?.teamName || courtAssignMatch.team2Name}</span>
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
                <button onClick={() => setCourtAssignMatch(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">キャンセル</button>
                <button onClick={handleCourtConfirm} disabled={!courtAssignValue}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >決定</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
