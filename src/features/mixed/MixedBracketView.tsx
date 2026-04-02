import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Trophy, Medal, Award, Users, Shuffle, Hand, RotateCcw, Ban, Save, Volume2, VolumeX, ClipboardList } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { PlacementCategory, BracketMatch, PlacementBracket, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';

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
  { id: '4th', label: '4-5位', icon: Users, color: 'from-slate-400 to-slate-500' },
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

/** ミックスダブルス用コールテキスト生成 */
function buildMixedCallText(
  match: BracketMatch,
  allTeams: MixedTeam[],
  bracketLabel: string,
  roundLabel: string,
  courtName: string,
  startTime: string,
): string {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return '';

  const familyName = (name: string) => name.trim().split(/[\s　]+/)[0] || name;

  const parts: string[] = [];
  parts.push('試合のコールをします。');
  parts.push(`ミックスダブルス、${bracketLabel}、${roundLabel}。`);
  parts.push(`${match.team1League}リーグ、${familyName(team1.male.name)}さん、${familyName(team1.female.name)}さん ペア。`);
  parts.push(`${match.team2League}リーグ、${familyName(team2.male.name)}さん、${familyName(team2.female.name)}さん ペア。`);

  let courtText = `この試合を、${courtName}で`;
  if (startTime) {
    const [h, m] = startTime.split(':');
    const minutes = parseInt(m);
    courtText += minutes === 0
      ? `、${parseInt(h)}時より`
      : `、${parseInt(h)}時${minutes}分より`;
  }
  courtText += '、おこなってください。';
  parts.push(courtText);

  return parts.join(' ');
}

export default function MixedBracketView() {
  const { brackets, selectedBracketCategory, setSelectedBracketCategory, updateBracketScore, advanceWinner, shuffleBracketSeeds, tournamentInfo, leagues, regenerateBrackets } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');
  const score2Ref = useRef<HTMLInputElement>(null);
  const [callMatch, setCallMatch] = useState<BracketMatch | null>(null);
  const [callCourt, setCallCourt] = useState('');
  const [callTime, setCallTime] = useState('');

  const winGames = useMemo(() => getWinningGamesFromRules(tournamentInfo?.rules || []), [tournamentInfo]);

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

  if (brackets.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Trophy size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">順位表からトーナメントを生成してください</p>
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

  const [courtAssignMatch, setCourtAssignMatch] = useState<BracketMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');
  const { assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();

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
    setCourtAssignMatch(null);
  };

  const saveScore = () => {
    if (!editingMatch) return;
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (isNaN(s1) || isNaN(s2) || s1 === s2) return;
    updateBracketScore(editingMatch.matchId, s1, s2);
    setTimeout(() => advanceWinner(editingMatch.matchId), 50);
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
    // 1回戦優先、同ラウンド内はカテゴリ順
    matches.sort((a, b) => {
      if (a.match.round !== b.match.round) return a.match.round - b.match.round;
      const catOrder = ['1st', '2nd', '3rd', '4th'];
      return catOrder.indexOf(a.bracket.category) - catOrder.indexOf(b.bracket.category);
    });
    return matches;
  }, [brackets]);

  const [viewMode, setViewMode] = useState<'bracket' | 'waiting'>('bracket');

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
          const finished = bracket?.matches.filter(m => m.status === 'finished' || m.status === 'bye').length || 0;
          const total = bracket?.matches.length || 0;

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

      {/* トーナメント再生成ボタン */}
      <div className="flex justify-end">
        <button
          onClick={() => { if (window.confirm('ドロー表の並び順でトーナメントを再生成しますか？\n（1位トーナメントで試合が開始済みの場合は維持されます）')) regenerateBrackets(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
        >
          <RotateCcw size={12} />
          並び順を再生成
        </button>
      </div>

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
        const courtOpts = (() => {
          const s = new Set<string>();
          for (const l of leagues) { const nums = l.courtName?.match(/\d+/g); if (nums) for (const n of nums) s.add(`${n}コート`); }
          return [...s].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
        })();
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCourtAssignMatch(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] p-5" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-gray-800 mb-3">コートに入れる</h3>
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
              <label className="text-xs font-bold text-gray-600 block mb-2">コートを選択</label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {courtOpts.map(c => (
                  <button key={c} onClick={() => setCourtAssignValue(c)}
                    className={`py-2 text-xs font-bold rounded-lg border-2 transition-all ${courtAssignValue === c ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >{c.replace('コート', '')}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCourtAssignMatch(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">キャンセル</button>
                <button onClick={handleCourtAssignConfirm} disabled={!courtAssignValue}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >コートに入れる</button>
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
          </div>
        );
      })()}

      {/* スコア入力モーダル */}
      {editingMatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setEditingMatch(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[95vw] p-5" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => { setEditingMatch(null); setCallMatch(editingMatch); setCallCourt(''); setCallTime(''); }}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 text-xs hover:bg-blue-100 active:scale-[0.98] transition-all">
                <Volume2 size={12} />コール
              </button>
            </div>

            <button onClick={() => setEditingMatch(null)} className="w-full py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all">
              キャンセル
            </button>
          </div>
        </div>
      )}

      </>)}

      {/* 音声コールモーダル */}
      {callMatch && currentBracket && (
        <CallModal
          match={callMatch}
          bracket={currentBracket}
          leagues={leagues}
          allTeams={useMixedStore.getState().allTeams}
          tournamentName={tournamentInfo?.name || ''}
          getRoundLabel={getRoundLabel}
          callCourt={callCourt}
          setCallCourt={setCallCourt}
          callTime={callTime}
          setCallTime={setCallTime}
          onClose={() => setCallMatch(null)}
        />
      )}
    </div>
  );
}

/** 音声コールモーダル */
function CallModal({ match, bracket, leagues, allTeams, tournamentName: _tournamentName, getRoundLabel, callCourt, setCallCourt, callTime, setCallTime, onClose }: {
  match: BracketMatch;
  bracket: PlacementBracket;
  leagues: { leagueId: string; courtName: string }[];
  allTeams: MixedTeam[];
  tournamentName: string;
  getRoundLabel: (round: number, total: number) => string;
  callCourt: string;
  setCallCourt: (v: string) => void;
  callTime: string;
  setCallTime: (v: string) => void;
  onClose: () => void;
}) {
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const totalRounds = Math.log2(bracket.drawSize);
  const roundLabel = getRoundLabel(match.round, totalRounds);

  // コート候補: リーグのコート名を個別コートに分解
  const courtOptions = useMemo(() => {
    const courtSet = new Set<string>();
    for (const l of leagues) {
      if (!l.courtName) continue;
      // "6・7コート" → "6コート", "7コート" / "10・11コート" → "10コート", "11コート"
      const nums = l.courtName.match(/\d+/g);
      if (nums) {
        for (const n of nums) courtSet.add(`${n} コート`);
      } else {
        courtSet.add(l.courtName);
      }
    }
    return [...courtSet].sort((a, b) => {
      const na = parseInt(a) || 0;
      const nb = parseInt(b) || 0;
      return na - nb;
    });
  }, [leagues]);

  const handleSpeak = () => {
    if (!callCourt) return;
    const text = buildMixedCallText(match, allTeams, bracket.label, roundLabel, callCourt, callTime);
    if (!text) return;
    speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 2 });
  };

  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[95vw] p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Volume2 size={16} className="text-blue-600" />
          音声コール
        </h3>

        {/* 対戦情報 */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs">
          <div className="text-gray-500 mb-1">{bracket.label}　{roundLabel}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <span className="inline-block px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-bold mr-1">{match.team1League}</span>
              {team1 ? `${team1.male.name} / ${team1.female.name}` : match.team1Name}
            </div>
            <span className="text-gray-400 font-bold">vs</span>
            <div className="flex-1 text-right">
              <span className="inline-block px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-bold mr-1">{match.team2League}</span>
              {team2 ? `${team2.male.name} / ${team2.female.name}` : match.team2Name}
            </div>
          </div>
        </div>

        {/* コート選択 */}
        <div className="mb-3">
          <label className="text-xs font-bold text-gray-600 block mb-1">コート指定 *</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {courtOptions.map(court => (
              <button
                key={court}
                onClick={() => setCallCourt(court)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  callCourt === court
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {court}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={callCourt}
            onChange={e => setCallCourt(e.target.value)}
            placeholder="コート名を入力（例: 1コート）"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 時間指定 */}
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-600 block mb-1">開始時間（任意）</label>
          <input
            type="time"
            value={callTime}
            onChange={e => setCallTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* コールボタン */}
        <button
          onClick={handleSpeak}
          disabled={!callCourt || isSpeaking}
          className={`w-full flex items-center justify-center gap-2 py-3 min-h-[48px] rounded-xl text-sm font-medium mb-2 active:scale-[0.98] transition-all shadow-md ${
            !callCourt
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : isSpeaking
              ? 'bg-red-500 text-white'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
          }`}
        >
          {isSpeaking ? <><VolumeX size={14} />再生中...</> : <><Volume2 size={14} />コール開始</>}
        </button>

        {isSpeaking && (
          <button
            onClick={stop}
            className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] bg-red-50 border-2 border-red-300 text-red-600 rounded-xl hover:bg-red-100 text-sm font-medium mb-2 active:scale-[0.98] transition-all"
          >
            <VolumeX size={14} />停止
          </button>
        )}

        <button onClick={onClose} className="w-full py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm active:scale-[0.98] transition-all">
          閉じる
        </button>
      </div>
    </div>
  );
}

/** ルーレット抽選パネル */
function RouletteDrawPanel({ bracket, onShuffle }: {
  bracket: PlacementBracket;
  onShuffle: (category: PlacementCategory, newOrder: string[]) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [currentTeamIdx, setCurrentTeamIdx] = useState(0);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ドロー枠の数（BYEを除いた1回戦のスロット数）
  const round1Matches = bracket.matches.filter(m => m.round === 1);
  const totalSlots = round1Matches.length * 2;
  const teams = bracket.teams;

  // 未割当のスロット番号リスト
  const getAvailableSlots = useCallback(() => {
    const all = Array.from({ length: totalSlots }, (_, i) => i);
    return all.filter(i => !assignedSlots.has(i));
  }, [totalSlots, assignedSlots]);

  // ルーレット回転
  const spinRoulette = useCallback(() => {
    if (currentTeamIdx >= teams.length) return;
    const available = getAvailableSlots();
    if (available.length === 0) return;

    setSpinning(true);
    let count = 0;
    const totalSpins = 15 + Math.floor(Math.random() * 10);

    const spin = () => {
      const idx = available[Math.floor(Math.random() * available.length)];
      setCurrentHighlight(idx);
      count++;

      if (count < totalSpins) {
        const delay = 50 + count * 15; // 徐々に遅くなる
        spinTimerRef.current = setTimeout(spin, delay);
      } else {
        // 停止 - このスロットに割り当て
        const finalSlot = available[Math.floor(Math.random() * available.length)];
        setCurrentHighlight(finalSlot);
        setAssignedSlots(prev => {
          const next = new Map(prev);
          next.set(finalSlot, teams[currentTeamIdx].teamId);
          return next;
        });
        setSpinning(false);
        setCurrentTeamIdx(prev => prev + 1);
      }
    };
    spin();
  }, [currentTeamIdx, teams, getAvailableSlots]);

  // 全自動抽選
  const autoDrawAll = useCallback(() => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const newOrder = shuffled.map(t => t.teamId);
    onShuffle(bracket.category, newOrder);
    setDrawComplete(true);
  }, [teams, bracket.category, onShuffle]);

  // 手動割当確定
  const confirmManualDraw = useCallback(() => {
    // assignedSlots を元に順序を決定
    const ordered: string[] = new Array(totalSlots).fill('');
    assignedSlots.forEach((teamId, slot) => { ordered[slot] = teamId; });
    const newOrder = ordered.filter(id => id !== '');
    // 未割当のチームも末尾に追加
    const assignedIds = new Set(newOrder);
    for (const t of teams) {
      if (!assignedIds.has(t.teamId)) newOrder.push(t.teamId);
    }
    onShuffle(bracket.category, newOrder);
    setDrawComplete(true);
  }, [assignedSlots, totalSlots, teams, bracket.category, onShuffle]);

  // リセット
  const resetDraw = () => {
    setAssignedSlots(new Map());
    setCurrentTeamIdx(0);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
  };

  useEffect(() => {
    return () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); };
  }, []);

  // 全チーム割当済みかチェック
  const allAssigned = currentTeamIdx >= teams.length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-3 border-b border-yellow-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
            <Shuffle size={16} className="text-yellow-600" />
            1位トーナメント 抽選
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetDraw}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={12} />
              リセット
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {!drawComplete ? (
          <>
            {/* 抽選スロット表示 */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-4">
              {Array.from({ length: totalSlots }, (_, i) => {
                const assignedTeamId = assignedSlots.get(i);
                const assignedTeam = assignedTeamId ? teams.find(t => t.teamId === assignedTeamId) : null;
                const isHighlighted = currentHighlight === i && spinning;
                const isAvailable = !assignedSlots.has(i);

                return (
                  <div
                    key={i}
                    className={`
                      relative p-2 rounded-lg border-2 text-center transition-all min-h-[56px] flex flex-col items-center justify-center
                      ${isHighlighted ? 'border-yellow-400 bg-yellow-100 scale-105 shadow-lg' :
                        assignedTeam ? 'border-emerald-300 bg-emerald-50' :
                        isAvailable ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-100'}
                    `}
                  >
                    <div className="text-[10px] text-gray-400 font-mono">#{i + 1}</div>
                    {assignedTeam ? (
                      <>
                        <div className="text-[10px] font-bold text-emerald-700 truncate w-full">{assignedTeam.teamName}</div>
                        <div className="text-[8px] text-emerald-500">{assignedTeam.leagueId}リーグ</div>
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-300">―</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 次の抽選チーム */}
            {!allAssigned && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="text-xs text-yellow-600 mb-1">次の抽選</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-yellow-800">{teams[currentTeamIdx]?.teamName}</span>
                    <span className="text-xs text-yellow-600 ml-2">({teams[currentTeamIdx]?.leagueId}リーグ)</span>
                  </div>
                  <button
                    onClick={spinRoulette}
                    disabled={spinning}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all
                      ${spinning
                        ? 'bg-yellow-200 text-yellow-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:from-yellow-600 hover:to-amber-600 shadow-md'
                      }
                    `}
                  >
                    <Shuffle size={14} className={spinning ? 'animate-spin' : ''} />
                    {spinning ? '抽選中...' : 'ルーレット'}
                  </button>
                </div>
              </div>
            )}

            {/* ボタン群 */}
            <div className="flex gap-3">
              <button
                onClick={autoDrawAll}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-xl hover:from-yellow-600 hover:to-amber-600 text-sm font-medium shadow-md transition-all"
              >
                <Shuffle size={14} />
                全自動抽選
              </button>
              {allAssigned && (
                <button
                  onClick={confirmManualDraw}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium shadow-md transition-all"
                >
                  <Hand size={14} />
                  この配置で確定
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
function BracketDisplay({ bracket, onMatchClick, getRoundLabel, allTeams, courtAssignments }: {
  bracket: PlacementBracket;
  onMatchClick: (match: BracketMatch) => void;
  getRoundLabel: (round: number, total: number) => string;
  allTeams: { teamId: string; teamName: string; male: { name: string; affiliation: string }; female: { name: string; affiliation: string }; pairNumber: number; leagueId: string }[];
  courtAssignments: Record<string, { courtName: string; startedAt: number }>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const totalRounds = Math.log2(bracket.drawSize);
  const matchesByRound: BracketMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    matchesByRound.push(bracket.matches.filter(m => m.round === r).sort((a, b) => a.position - b.position));
  }

  const MATCH_HEIGHT = 110;
  const BYE_HEIGHT = 36;
  const MATCH_WIDTH = 260;
  const ROUND_GAP = 48;
  const MATCH_GAP = 24; // ボタン分の余白を確保

  // 1位トーナメント以外: 配置されるリーグ情報をビジュアル表示
  const is1stBracket = bracket.category === '1st';


  // 未配置スロットに配置予定のリーグ情報を表示
  const getPlaceholderInfo = (match: BracketMatch, slot: 'team1' | 'team2'): { text: string; leagueId?: string; rank?: string } | null => {
    if (is1stBracket) return { text: '―' };
    const id = slot === 'team1' ? match.team1Id : match.team2Id;
    if (id) return null; // 既に配置済み
    // 1回戦のみプレースホルダー表示
    if (match.round !== 1) return null;
    const pos = match.position;
    const slotIdx = slot === 'team1' ? (pos - 1) * 2 : (pos - 1) * 2 + 1;
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
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

                // BYEマッチ: 勝者のみコンパクト表示（BYE文字なし）
                if (isBye) {
                  const winnerId = match.winnerId;
                  const winnerData = winnerId ? allTeams.find(t => t.teamId === winnerId) : null;
                  const winnerLeague = winnerId === match.team1Id ? match.team1League : match.team2League;
                  return (
                    <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - BYE_HEIGHT / 2, width: MATCH_WIDTH }}>
                      <div className="flex items-center gap-1.5 px-2 rounded border border-gray-200 bg-white" style={{ height: BYE_HEIGHT }}>
                        {winnerLeague && (
                          <span className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[winnerLeague.trim()] || 'bg-gray-100 text-gray-600'}`}>
                            {winnerLeague}
                          </span>
                        )}
                        {winnerData && <span className="text-[9px] text-gray-400 font-mono shrink-0">{winnerData.pairNumber}</span>}
                        <span className="text-[10px] font-bold text-gray-700 truncate">{winnerData?.teamName || match.team1Name || match.team2Name}</span>
                      </div>
                    </div>
                  );
                }

                // 通常マッチ
                const renderSlot = (slot: { teamId: string | null; name: string; league: string; score: number | null; isWinner: boolean; ph: ReturnType<typeof getPlaceholderInfo>; isTop: boolean }) => {
                  const teamData = slot.teamId ? allTeams.find(t => t.teamId === slot.teamId) : null;
                  return (
                    <div className={`flex items-center px-1.5 text-xs ${slot.isTop ? 'border-b border-gray-100' : ''}
                      ${slot.isWinner ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                    `} style={{ height: 40 }}>
                      {slot.league ? (
                        <span className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center shrink-0 mr-1 ${LEAGUE_BADGE_COLORS[slot.league.trim()] || 'bg-gray-100 text-gray-600'}`}>{slot.league}</span>
                      ) : <span className="w-4 shrink-0 mr-1" />}
                      <div className="flex-1 min-w-0">
                        {teamData ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-gray-400 font-mono shrink-0">{teamData.pairNumber}</span>
                            <div className="min-w-0" style={{ width: 90 }}>
                              <div className="text-[10px] font-bold truncate leading-tight">{teamData.male.name}</div>
                              <div className="text-[10px] truncate leading-tight">{teamData.female.name}</div>
                            </div>
                            <div className="w-px h-6 bg-gray-200 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[7px] text-gray-400 truncate">{teamData.male.affiliation}</div>
                              <div className="text-[7px] text-gray-400 truncate">{teamData.female.affiliation}</div>
                            </div>
                          </div>
                        ) : slot.ph?.leagueId ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block px-1 py-0.5 rounded bg-blue-100 text-blue-600 text-[9px] font-bold">{slot.ph.leagueId}</span>
                            <span className="text-[9px] text-blue-400">{slot.ph.rank}位</span>
                          </span>
                        ) : slot.ph ? <span className="text-[9px] text-gray-400">{slot.ph.text}</span>
                        : slot.name ? <span className="text-[10px] truncate">{slot.name}</span>
                        : <span className="text-[9px] text-gray-400">―</span>}
                      </div>
                      {slot.score !== null && (
                        <span className={`font-mono font-bold ml-1 text-sm shrink-0 ${slot.isWinner ? 'text-emerald-600' : 'text-gray-500'}`}>{slot.score}</span>
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
                        <div className={`flex items-center justify-center gap-1.5 h-[26px] text-[9px] font-medium border-t border-gray-100
                          ${isPlaying ? 'bg-green-50 text-green-700' :
                            match.status === 'finished' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-amber-50 text-amber-600'}
                        `}>
                          {isPlaying ? (
                            <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />{ca.courtName} {elapsedStr}</>
                          ) : match.status === 'finished' ? (
                            <span>完了</span>
                          ) : (
                            <><span className="w-2 h-2 rounded-full bg-amber-400" />控え中</>
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
  const { assignBracketMatchToCourt } = useMixedStore();
  const [selectedCourts, setSelectedCourts] = useState<Record<string, string>>({});

  const courtOptions = useMemo(() => {
    const courtSet = new Set<string>();
    for (const l of leagues) {
      if (!l.courtName) continue;
      const nums = l.courtName.match(/\d+/g);
      if (nums) for (const n of nums) courtSet.add(`${n}コート`);
      else courtSet.add(l.courtName);
    }
    return [...courtSet].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }, [leagues]);

  const catLabel = (cat: PlacementCategory) => cat === '1st' ? '1位' : cat === '2nd' ? '2位' : cat === '3rd' ? '3位' : '4-5位';

  const handleAssign = (matchId: string) => {
    const court = selectedCourts[matchId];
    if (!court) return;
    assignBracketMatchToCourt(matchId, court);
    setSelectedCourts(prev => { const { [matchId]: _, ...rest } = prev; return rest; });
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
        const selectedCourt = selectedCourts[match.matchId] || '';
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
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                className="text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                value={selectedCourt}
                onChange={e => setSelectedCourts(prev => ({ ...prev, [match.matchId]: e.target.value }))}
              >
                <option value="">コート</option>
                {courtOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {selectedCourt && (
                <button
                  onClick={() => handleAssign(match.matchId)}
                  className="px-2.5 py-1.5 text-[10px] font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
