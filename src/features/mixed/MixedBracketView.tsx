import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Medal, Award, Users, Shuffle, RotateCcw, Ban, Save, Volume2, Square, ClipboardList, Download, ImageIcon, Loader2, X, Printer } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { PlacementCategory, BracketMatch, PlacementBracket, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import CallPreviewDialog from './CallPreviewDialog';
import { generateBracketDataUrl, generateResultDataUrl } from './exportBracketJpeg';

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

/** 審判用紙を印刷（B5横・Excel原本と同じ構成） */
function printRefereeSheet(
  match: BracketMatch,
  allTeams: MixedTeam[],
  _tournamentName: string,
  bracketLabel: string,
  roundLabel: string,
  gameRule: string,
  tournamentInfo?: { date?: string; name?: string } | null,
) {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return;

  const dateStr = (tournamentInfo?.date || '').split(/予備日[：:]?/)[0].trim();

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙 - ${bracketLabel}</title>
<style>
  @page { size: B5 landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Meiryo', sans-serif;
    color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar { text-align: center; padding: 8px; background: #f5f5f5; border-bottom: 1px solid #ddd; margin-bottom: 4mm; }
  .toolbar button { padding: 6px 20px; font-size: 13px; cursor: pointer; border: 1px solid #999; border-radius: 4px; background: #fff; }
  .toolbar button:hover { background: #e0e0e0; }
  .toolbar .hint { font-size: 11px; color: #888; margin-top: 4px; }
  @media print { .toolbar { display: none !important; } }
  [contenteditable="true"]:hover { background: #fffde7; cursor: text; }
  [contenteditable="true"]:focus { background: #fff9c4; outline: none; }
  @media print { [contenteditable="true"]:hover, [contenteditable="true"]:focus { background: transparent; } }

  .page { width: 241mm; height: 166mm; margin: auto; display: flex; flex-direction: column; }
  .title {
    text-align: center; font-size: 26pt; font-weight: 900;
    letter-spacing: 0.8em; padding: 1mm 0 0;
    font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'MS PMincho', serif;
  }
  .meta { text-align: center; font-size: 11pt; padding: 0 0 1mm; color: #333; position: relative; }
  .meta-name { display: block; }
  .meta-date { position: absolute; right: 0; top: 0; }

  .tbl-wrap { flex: 1; border: 2px solid #333; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #888; padding: 1mm 3mm; font-size: 10pt; vertical-align: middle; }
  .lbl { width: 24mm; text-align: center; font-weight: 700; font-size: 9pt; letter-spacing: 0.1em; background: #fafafa; white-space: nowrap; }

  /* 種目行 */
  .r-event td, .r-event th { height: 16mm; }
  .val { font-weight: 700; font-size: 14pt; text-align: center; }

  /* コートNo行 */
  .r-court td, .r-court th { height: 20mm; }
  .r-court td { text-align: center; }

  /* 50/50分割行用 */
  .split-cell { padding: 0 !important; }
  .split { display: grid; grid-template-columns: 1fr 1fr; height: 100%; }
  .split-half { display: flex; align-items: center; justify-content: center; padding: 1mm 3mm; }
  .split-half:first-child { border-right: 1px solid #888; }

  /* エントリーNo行 */
  .r-entry td, .r-entry th { height: 16mm; }
  .entry-num { font-weight: 800; font-size: 22pt; font-family: 'Arial', sans-serif; }

  /* 選手氏名行 */
  .r-name td, .r-name th { height: 34mm; }
  .name-half { display: flex; align-items: center; justify-content: center; gap: 3mm; padding: 2mm 4mm !important; height: 100%; }
  .p-name {
    font-size: 16pt; font-weight: 600; line-height: 1.9; white-space: nowrap;
    font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif;
  }
  .p-aff { font-size: 9pt; line-height: 1.9; color: #444; white-space: nowrap; }

  /* スコア行（残りをすべて使う） */
  .r-score td, .r-score th { height: auto; }
  .score-wrap { flex: 1; display: flex; flex-direction: column; }
  .score-inner { flex: 1; }
  .score-split { display: grid; grid-template-columns: 1fr 1fr; height: 100%; }
  .score-half { display: flex; align-items: center; justify-content: center; }
  .score-half:first-child { border-right: none; }
  .score-center { display: flex; flex-direction: column; align-items: center; justify-content: center; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .score-area { position: relative; height: 100%; }
  .score-lbl { font-size: 11pt; font-weight: 700; letter-spacing: 0.3em; white-space: nowrap; }
  .score-tb { font-size: 9pt; color: #555; white-space: nowrap; }
  .score-dash { font-size: 28pt; font-weight: 700; color: #333; }
  .tb-par { font-size: 13pt; color: #555; margin-top: 4mm; }

  .credit { text-align: right; font-size: 8pt; color: #999; padding: 0.5mm 2mm 0; flex-shrink: 0; }
</style>
</head><body>

<div class="toolbar">
  <button onclick="window.print()">🖨️ 印刷</button>
  <div class="hint">黄色くなる箇所はクリックして編集できます</div>
</div>

<div class="page">
  <div class="title">審　判　用　紙</div>
  <div class="meta">
    <span class="meta-name">${tournamentInfo?.name || ''}</span>
    <span class="meta-date">${dateStr}</span>
  </div>
  <div class="tbl-wrap">
    <table>
      <tr class="r-event">
        <th class="lbl">種　目</th>
        <td class="val" colspan="2" contenteditable="true">${bracketLabel}</td>
        <th class="lbl" style="width:auto">回　戦</th>
        <td class="val" colspan="2" contenteditable="true">${roundLabel}</td>
      </tr>
      <tr class="r-court">
        <th class="lbl">コートNo.</th>
        <td contenteditable="true" style="width:16%">&nbsp;</td>
        <th class="lbl" style="width:auto">試合方法</th>
        <td style="font-size:9pt; text-align:center;" contenteditable="true">${gameRule.replace(/\n/g, '<br>')}</td>
        <th class="lbl" style="width:auto">開始時間</th>
        <td contenteditable="true" style="width:16%">&nbsp;</td>
      </tr>
    </table>

    <table style="border-top:3px double #333; flex:1; height:100%;">
      <colgroup><col style="width:24mm"><col style="width:calc(50% - 12mm)"><col></colgroup>
      <tr class="r-entry">
        <th class="lbl">エントリーNo.</th>
        <td style="text-align:center;"><span class="entry-num" contenteditable="true">No.　${team1.pairNumber}</span></td>
        <td style="text-align:center;"><span class="entry-num" contenteditable="true">No.　${team2.pairNumber}</span></td>
      </tr>
      <tr class="r-name">
        <th class="lbl">選手氏名</th>
        <td style="padding:0;"><div class="name-half"><div><div class="p-name" contenteditable="true">${team1.male.name}</div><div class="p-name" contenteditable="true">${team1.female.name}</div></div><div><div class="p-aff" contenteditable="true">（${team1.male.affiliation}）</div><div class="p-aff" contenteditable="true">（${team1.female.affiliation}）</div></div></div></td>
        <td style="padding:0;"><div class="name-half"><div><div class="p-name" contenteditable="true">${team2.male.name}</div><div class="p-name" contenteditable="true">${team2.female.name}</div></div><div><div class="p-aff" contenteditable="true">（${team2.male.affiliation}）</div><div class="p-aff" contenteditable="true">（${team2.female.affiliation}）</div></div></div></td>
      </tr>
      <tr>
        <th class="lbl" style="vertical-align:middle;"><div class="score-lbl">スコア</div><div style="margin-top:10mm;" class="score-tb">（ＴＢ）</div></th>
        <td colspan="2" style="text-align:center; vertical-align:middle;"><div class="score-dash">―</div><div class="tb-par">（　　　）</div></td>
      </tr>
    </table>
  </div>
  <div class="credit">鳥取市テニス協会</div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}

export default function MixedBracketView() {
  const { brackets, selectedBracketCategory, setSelectedBracketCategory, updateBracketScore, advanceWinner, rebuildBracketFromSlots, tournamentInfo, leagues, updateBracketGameRule } = useMixedStore();
  const [editingMatch, setEditingMatch] = useState<BracketMatch | null>(null);
  const [score1Input, setScore1Input] = useState('');
  const [score2Input, setScore2Input] = useState('');
  const [tiebreakInput, setTiebreakInput] = useState('');
  const score2Ref = useRef<HTMLInputElement>(null);
  const tiebreakRef = useRef<HTMLInputElement>(null);
  const [callMatch, setCallMatch] = useState<BracketMatch | null>(null);
  const [callCourt, setCallCourt] = useState('');
  const [callTime, setCallTime] = useState('');
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const [speakingText, setSpeakingText] = useState('');
  const [courtAssignMatch, setCourtAssignMatch] = useState<BracketMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');
  const { assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();
  const [viewMode, setViewMode] = useState<'bracket' | 'waiting'>('bracket');
  const [drawEditMode, setDrawEditMode] = useState(false);

  const bracketGameRule = tournamentInfo?.bracketGameRule || '';
  // ドロー表のルールから初期値を自動設定
  useEffect(() => {
    if (!bracketGameRule && tournamentInfo?.rules) {
      const ruleFromDraw = tournamentInfo.rules.find(r => /ゲームマッチ|ノーアド|タイブレ|セットマッチ/.test(r));
      if (ruleFromDraw) {
        const cleaned = ruleFromDraw.replace(/^（[０-９\d]+）\s*/, '').trim();
        if (cleaned) updateBracketGameRule(cleaned);
      }
    }
  }, [tournamentInfo?.rules]);
  const winGames = useMemo(() => {
    // bracketGameRuleが設定されていればそれからゲーム数を抽出
    if (bracketGameRule) {
      const m = bracketGameRule.match(/(\d+)\s*ゲーム/);
      if (m) return parseInt(m[1]);
      const m2 = bracketGameRule.match(/([０-９]+)\s*ゲーム/);
      if (m2) return parseInt(toHalfWidth(m2[1]));
    }
    return getWinningGamesFromRules(tournamentInfo?.rules || []);
  }, [tournamentInfo, bracketGameRule]);

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
    setTiebreakInput(match.tiebreakScore?.toString() ?? '');
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
    const isTb = (s1 === winGames + 1 && s2 === winGames) || (s1 === winGames && s2 === winGames + 1);
    const tb = isTb && tiebreakInput ? parseInt(tiebreakInput) : null;
    updateBracketScore(editingMatch.matchId, s1, s2, undefined, tb);
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
      const s1 = parseInt(score1Input);
      if (!isNaN(s1) && ((s1 === winGames + 1 && num === winGames) || (s1 === winGames && num === winGames + 1))) {
        setTimeout(() => { tiebreakRef.current?.focus(); tiebreakRef.current?.select(); }, 50);
      }
    }
  };

  const handleTiebreakChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toHalfWidth(e.target.value).replace(/[^0-9]/g, '');
    setTiebreakInput(raw);
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

  // Tiebreak detection
  const isTiebreak = useMemo(() => {
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    return (s1 === winGames + 1 && s2 === winGames) || (s1 === winGames && s2 === winGames + 1);
  }, [score1Input, score2Input, winGames]);

  const loserSide = useMemo(() => {
    const s1 = parseInt(score1Input);
    const s2 = parseInt(score2Input);
    if (s1 === winGames + 1 && s2 === winGames) return 2;
    if (s1 === winGames && s2 === winGames + 1) return 1;
    return 0;
  }, [score1Input, score2Input, winGames]);

  // 1位トーナメントかつ試合がまだ始まっていないかチェック
  const is1stBracket = selectedBracketCategory === '1st';


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

      {/* ドロー編集 / プレビュー / 賞状ボタン */}
      <div className="flex justify-end gap-2">
        <CertificatePrintButton brackets={brackets} allTeams={useMixedStore.getState().allTeams} selectedCategory={selectedBracketCategory} />
        {currentBracket && (
          <>
            <ResultPreviewButton bracket={currentBracket} />
            <BracketPreviewButton bracket={currentBracket} />
          </>
        )}
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

      {/* 決勝トーナメント用ゲームルール設定（選択式＋記述式） */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <label className="text-xs font-bold text-gray-500 block mb-1.5">ゲームルール:</label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {[
            'ノーアド・6ゲームマッチ（6-6タイブレーク）',
            'ノーアド・4ゲームマッチ（4-4タイブレーク）',
            'デュースあり・6ゲームマッチ（6-6タイブレーク）',
            '1セットマッチ（6-6タイブレーク）',
            '8ゲームマッチ（8-8タイブレーク）',
          ].map(preset => (
            <button
              key={preset}
              onClick={() => updateBracketGameRule(preset)}
              className={`px-2 py-1 text-[10px] rounded-lg border transition-colors ${
                bracketGameRule === preset
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={bracketGameRule}
          onChange={e => updateBracketGameRule(e.target.value)}
          placeholder="上記から選択、または直接入力"
          className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
        />
      </div>

      {/* ドロー編集パネル */}
      {drawEditMode && currentBracket && (
        <DrawEditPanel bracket={currentBracket} />
      )}

      {/* 1位トーナメント: ルーレット抽選（1回戦に未配置スロットがある場合のみ） */}
      {is1stBracket && currentBracket && (() => {
        const r1 = currentBracket.matches.filter(m => m.round === 1 && !m.isBye);
        const hasEmptySlot = r1.some(m => !m.team1Id || !m.team2Id);
        return hasEmptySlot;
      })() && (
        <RouletteDrawPanel
          bracket={currentBracket}
          onRebuild={rebuildBracketFromSlots}
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
                setTiebreakInput(courtAssignMatch.tiebreakScore?.toString() ?? '');
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

            <div className="flex items-center justify-center gap-2 mb-5">
              {isTiebreak && loserSide === 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                  <input
                    ref={tiebreakRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={tiebreakInput}
                    onChange={handleTiebreakChange}
                    onKeyDown={e => { if (e.key === 'Enter') saveScore(); }}
                    className="w-10 h-12 text-center text-lg font-bold border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-blue-50 transition-all"
                  />
                </div>
              )}
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
                onKeyDown={e => { if (e.key === 'Enter' && !isTiebreak) saveScore(); }}
                className={`w-14 h-12 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all ${winnerSide === 2 ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300' : 'border-emerald-300'}`}
              />
              {isTiebreak && loserSide === 2 && (
                <div className="flex flex-col items-center">
                  <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
                  <input
                    ref={tiebreakRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={tiebreakInput}
                    onChange={handleTiebreakChange}
                    onKeyDown={e => { if (e.key === 'Enter') saveScore(); }}
                    className="w-10 h-12 text-center text-lg font-bold border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-blue-50 transition-all"
                  />
                </div>
              )}
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
                const gr = tournamentInfo?.bracketGameRule
                  || tournamentInfo?.gameRules?.[0]
                  || tournamentInfo?.rules?.find(r => /ゲームマッチ|ノーアド|タイブレ/.test(r))?.replace(/^（[０-９\d]+）\s*/, '').trim()
                  || '';
                // 日付から予備日を除去
                const dateStr = (tournamentInfo?.date || '').split(/予備日[：:]?/)[0].trim();
                printRefereeSheet(editingMatch, at, tournamentInfo?.name || '', currentBracket?.label || '', getRoundLabel(editingMatch.round, Math.log2(currentBracket?.drawSize || 16)), gr, { date: dateStr, name: tournamentInfo?.name || '' });
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

      {/* 音声再生中ポップアップ */}
      {isSpeaking && speakingText && createPortal(
        <div className="fixed bottom-6 right-6 z-[200] w-80 bg-white rounded-2xl shadow-2xl border border-blue-200 overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="px-4 py-2.5 bg-blue-600 text-white flex items-center gap-2">
            <Volume2 size={16} className="animate-pulse shrink-0" />
            <span className="text-sm font-bold flex-1">コール再生中...</span>
            <button
              onClick={() => { stop(); setSpeakingText(''); }}
              className="flex items-center gap-1 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
            >
              <Square size={10} />
              停止
            </button>
          </div>
          <div className="px-4 py-3 max-h-24 overflow-y-auto">
            <p className="text-[11px] text-gray-600 leading-relaxed">{speakingText}</p>
          </div>
        </div>,
        document.body
      )}

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
              if (text) {
                setSpeakingText(text);
                speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 1 }, () => setSpeakingText(''));
              }
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
                  onClick={() => {
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
                  }`}
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
function RouletteDrawPanel({ bracket, onRebuild }: {
  bracket: PlacementBracket;
  onRebuild: (category: PlacementCategory, slots: (string | null)[], byePositions?: Set<number>) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teams = bracket.teams;

  // ドロー表通りの16スロット構造（1位トーナメント）
  // ①=slot0, BYE=slot1, ②③=slot2-3, ④⑤=slot4-5, ⑥⑦=slot6-7
  // ⑧=slot8, BYE=slot9, ⑨⑩=slot10-11, ⑪⑫=slot12-13, ⑬=slot14, BYE=slot15
  const DRAW_SIZE = 16;
  const BYE_POSITIONS = new Set([1, 9, 15]); // ①シード, ⑧シード, ⑬シード
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

  // 現在の割当状態をブラケットに即時反映するヘルパー（未配置スロットはnullのまま、BYE位置のみBYE扱い）
  const syncToBracket = useCallback((slotsMap: Map<number, string>) => {
    const slots16: (string | null)[] = Array(DRAW_SIZE).fill(null);
    slotsMap.forEach((teamId, slot) => { slots16[slot] = teamId; });
    onRebuild(bracket.category, slots16, BYE_POSITIONS);
  }, [bracket.category, onRebuild]);

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
    onRebuild(bracket.category, slots16, BYE_POSITIONS);
    setDrawComplete(true);
  }, [teams, bracket.category, onRebuild]);

  // 手動割当確定
  const confirmDraw = useCallback(() => {
    const slots16: (string | null)[] = Array(DRAW_SIZE).fill(null);
    assignedSlots.forEach((teamId, slot) => { slots16[slot] = teamId; });
    onRebuild(bracket.category, slots16, BYE_POSITIONS);
    setDrawComplete(true);
  }, [assignedSlots, bracket.category, onRebuild]);

  const resetDraw = () => {
    setAssignedSlots(new Map());
    setSelectedTeamId(null);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    // ブラケットも全スロット空にリセット
    const emptySlots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    onRebuild(bracket.category, emptySlots, BYE_POSITIONS);
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
  // 1位トーナメント: BYE位置 (0-indexed)
  const BYE_POSITIONS_1ST = new Set([1, 9, 15]);
  // スロット→丸番号マップ（BYE以外に①~⑬を割り当て）
  const slotCircledNum = useMemo(() => {
    const map = new Map<number, string>();
    let num = 0;
    for (let i = 0; i < 16; i++) {
      if (BYE_POSITIONS_1ST.has(i)) continue;
      map.set(i, String.fromCodePoint(0x2460 + num));
      num++;
    }
    return map;
  }, []);

  // 1回戦スロットの丸番号を取得（1位トーナメントの1回戦のみ）
  const getSlotNumber = (match: BracketMatch, slot: 'team1' | 'team2'): string | null => {
    if (!is1stBracket || match.round !== 1) return null;
    const slotIdx = slot === 'team1' ? (match.position - 1) * 2 : (match.position - 1) * 2 + 1;
    return slotCircledNum.get(slotIdx) || null;
  };

  const getPlaceholderInfo = (match: BracketMatch, slot: 'team1' | 'team2'): { text: string; leagueId?: string; rank?: string } | null => {
    const id = slot === 'team1' ? match.team1Id : match.team2Id;
    if (id) return null; // 既に配置済み
    // 1回戦のみプレースホルダー表示
    if (match.round !== 1) return null;
    const pos = match.position;
    const slotIdx = slot === 'team1' ? (pos - 1) * 2 : (pos - 1) * 2 + 1;

    if (is1stBracket) {
      if (BYE_POSITIONS_1ST.has(slotIdx)) return { text: 'BYE' };
      const num = slotCircledNum.get(slotIdx) || '';
      return { text: `${num} 未配置` };
    }

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
                  const byeSlotNum = match.round === 1 ? getSlotNumber(match, match.team1Id ? 'team1' : 'team2') : null;
                  return (
                    <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - byeBoxH / 2, width: MATCH_WIDTH }}>
                      <div className="flex items-center gap-1.5 px-2 rounded-lg border border-gray-200 bg-white" style={{ height: byeBoxH }}>
                        {byeSlotNum && (
                          <span className="text-sm text-amber-500 shrink-0 w-5 text-center">{byeSlotNum}</span>
                        )}
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
                const renderSlot = (slot: { teamId: string | null; name: string; league: string; score: number | null; isWinner: boolean; isLoser: boolean; tiebreakScore: number | null; ph: ReturnType<typeof getPlaceholderInfo>; isTop: boolean; slotNum: string | null }) => {
                  // teamIdから探す。なければnameから逆引き
                  let teamData = slot.teamId ? allTeams.find(t => t.teamId === slot.teamId) : null;
                  if (!teamData && slot.name && slot.league) {
                    teamData = allTeams.find(t => t.teamName === slot.name && t.leagueId === slot.league.trim()) || null;
                  }
                  return (
                    <div className={`flex items-center px-2 text-xs ${slot.isTop ? 'border-b border-gray-100' : ''}
                      ${slot.isWinner ? 'bg-emerald-50 font-bold text-emerald-800' : 'bg-white text-gray-700'}
                    `} style={{ height: SLOT_HEIGHT }}>
                      {slot.slotNum && (
                        <span className="text-sm text-amber-500 shrink-0 mr-1 w-5 text-center">{slot.slotNum}</span>
                      )}
                      {slot.league ? (() => {
                        const badge = getLeagueBadge(slot.teamId, slot.league);
                        return <span className={`shrink-0 mr-1.5 rounded text-[9px] font-bold flex items-center justify-center ${badge.length > 1 ? 'w-7 h-5 text-[8px]' : 'w-5 h-5'} ${LEAGUE_BADGE_COLORS[slot.league.trim()] || 'bg-gray-100 text-gray-600'}`}>{badge}</span>;
                      })() : !slot.slotNum ? <span className="w-5 shrink-0 mr-1.5" /> : null}
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
                        <span className={`font-mono font-bold ml-1 text-base shrink-0 ${slot.isWinner ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {slot.score}
                          {slot.isLoser && slot.tiebreakScore != null && (
                            <span className="text-[9px] text-blue-500 align-super ml-0.5">({slot.tiebreakScore})</span>
                          )}
                        </span>
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
                      {renderSlot({ teamId: match.team1Id, name: match.team1Name, league: match.team1League, score: match.score1, isWinner: match.winnerId === match.team1Id, isLoser: match.winnerId !== null && match.winnerId !== match.team1Id, tiebreakScore: match.tiebreakScore, ph: ph1, isTop: true, slotNum: getSlotNumber(match, 'team1') })}
                      {renderSlot({ teamId: match.team2Id, name: match.team2Name, league: match.team2League, score: match.score2, isWinner: match.winnerId === match.team2Id, isLoser: match.winnerId !== null && match.winnerId !== match.team2Id, tiebreakScore: match.tiebreakScore, ph: ph2, isTop: false, slotNum: getSlotNumber(match, 'team2') })}
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
        const renderTeamRow = (team: typeof team1, league: string) => (
          <div className="flex items-center gap-1.5">
            {league && (
              <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[league.trim()] || 'bg-gray-100 text-gray-600'}`}>{league}</span>
            )}
            {team ? (
              <>
                <span className="text-[10px] text-gray-400 font-mono shrink-0 w-4 text-center">{team.pairNumber}</span>
                <div className="shrink-0" style={{ width: 90 }}>
                  <div className="text-xs font-bold text-gray-800 leading-tight">{team.male.name.replace(/[\s\u3000]+/g, '')}</div>
                  <div className="text-xs font-bold text-gray-800 leading-tight">{team.female.name.replace(/[\s\u3000]+/g, '')}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-gray-400 truncate">{team.male.affiliation}</div>
                  <div className="text-[10px] text-gray-400 truncate">{team.female.affiliation}</div>
                </div>
              </>
            ) : (
              <span className="text-xs text-gray-500 truncate">{match.team1Name || match.team2Name}</span>
            )}
          </div>
        );
        return (
          <div key={match.matchId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-stretch">
              <div className={`shrink-0 w-12 flex flex-col items-center justify-center border-r border-gray-100 ${
                bracket.category === '1st' ? 'bg-yellow-50' :
                bracket.category === '2nd' ? 'bg-gray-50' :
                bracket.category === '3rd' ? 'bg-orange-50' : 'bg-slate-50'
              }`}>
                <div className={`text-[10px] font-bold ${
                  bracket.category === '1st' ? 'text-yellow-700' :
                  bracket.category === '2nd' ? 'text-gray-600' :
                  bracket.category === '3rd' ? 'text-orange-600' : 'text-slate-600'
                }`}>{catLabel(bracket.category)}</div>
                <div className="text-[8px] text-gray-400">{roundLabel}</div>
              </div>
              <div className="flex-1 min-w-0 py-2 px-3">
                {renderTeamRow(team1, match.team1League)}
                <div className="text-[9px] text-gray-300 font-bold my-0.5 pl-6">VS</div>
                {renderTeamRow(team2, match.team2League)}
              </div>
              <div className="shrink-0 flex items-center pr-3">
                <button
                  onClick={() => { setCourtAssignMatch(match); setCourtAssignValue(''); }}
                  className="px-3 py-2 text-[10px] font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  コート入れ
                </button>
              </div>
            </div>
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

/** 苗字取得ヘルパー */
const getFN = (n: string) => n.trim().split(/[\s　]+/)[0] || n;

/** トーナメント表プレビュー＋ダウンロードボタン */
function BracketPreviewButton({ bracket }: { bracket: PlacementBracket }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const allTeams = useMixedStore(s => s.allTeams);
  const tournamentName = useMixedStore(s => s.tournamentInfo?.name || '');

  const getDefaultWinner = useCallback(() => {
    const maxRound = Math.max(...bracket.matches.map(m => m.round));
    const fm = bracket.matches.find(m => m.round === maxRound);
    if (fm?.winnerId) {
      const w = allTeams.find(t => t.teamId === fm.winnerId);
      if (w) return `${getFN(w.male.name)}・${getFN(w.female.name)}`;
    }
    return '';
  }, [bracket, allTeams]);

  const regen = useCallback(() => {
    setDataUrl(null);
    setIsLoading(true);
    generateBracketDataUrl(bracket, allTeams, tournamentName, winnerName || undefined)
      .then(url => { setDataUrl(url); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [bracket, allTeams, tournamentName, winnerName]);

  useEffect(() => {
    if (isOpen) setWinnerName(getDefaultWinner());
  }, [isOpen, getDefaultWinner]);

  useEffect(() => {
    if (isOpen) regen();
  }, [isOpen, regen]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const labels: Record<string, string> = { '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント' };
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${labels[bracket.category] || bracket.category}.jpg`;
    a.click();
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
        <ImageIcon size={12} /> 画像DL
      </button>
      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setIsOpen(false)}>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col w-[95vw] max-w-5xl max-h-[90vh] z-[210]" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <ImageIcon size={16} className="text-gray-500" /> トーナメント表プレビュー
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 shrink-0">優勝者:</span>
                  <input type="text" value={winnerName} onChange={e => setWinnerName(e.target.value)}
                    placeholder="苗字・苗字" className="text-xs border border-gray-300 rounded px-2 py-1 w-28 focus:border-blue-400 outline-none" />
                </div>
                {dataUrl && (
                  <button onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg shadow hover:bg-emerald-600 transition-colors active:scale-95">
                    <Download size={14} /> ダウンロード
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
              {isLoading && <div className="flex flex-col items-center gap-2 text-gray-400"><Loader2 size={32} className="animate-spin" /><span className="text-sm">生成中...</span></div>}
              {dataUrl && !isLoading && <img src={dataUrl} alt="トーナメント表" className="max-w-full h-auto shadow border border-gray-200 bg-white" style={{ maxHeight: '100%' }} />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 結果画像プレビュー/DL
// ---------------------------------------------------------------------------
function ResultPreviewButton({ bracket }: { bracket: PlacementBracket }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const allTeams = useMixedStore(s => s.allTeams);
  const tournamentName = useMixedStore(s => s.tournamentInfo?.name || '');

  const regen = useCallback(() => {
    setDataUrl(null);
    setIsLoading(true);
    generateResultDataUrl(bracket, allTeams, tournamentName)
      .then(url => { setDataUrl(url); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [bracket, allTeams, tournamentName]);

  useEffect(() => { if (isOpen) regen(); }, [isOpen, regen]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const labels: Record<string, string> = { '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント' };
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${labels[bracket.category] || bracket.category}_結果.jpg`;
    a.click();
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors">
        <ClipboardList size={12} /> 結果画像
      </button>
      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setIsOpen(false)}>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col w-[95vw] max-w-6xl max-h-[90vh] z-[210]" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-3">
                <ClipboardList size={16} className="text-blue-500" />
                <span>{({'1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント'} as Record<string, string>)[bracket.category] || bracket.category}</span>
                <span className="text-xs text-gray-500 font-normal">{tournamentName}</span>
              </h3>
              <div className="flex items-center gap-3">
                {dataUrl && (
                  <button onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg shadow hover:bg-blue-600 transition-colors active:scale-95">
                    <Download size={14} /> ダウンロード
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
              {isLoading && <div className="flex flex-col items-center gap-2 text-gray-400"><Loader2 size={32} className="animate-spin" /><span className="text-sm">生成中...</span></div>}
              {dataUrl && !isLoading && <img src={dataUrl} alt="結果画像" className="max-w-full h-auto shadow border border-gray-200 bg-white" style={{ maxHeight: '100%' }} />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 賞状印刷機能
// ---------------------------------------------------------------------------

/** ブラケットから入賞者を取得 */
function getWinnersFromBrackets(brackets: PlacementBracket[], allTeams: MixedTeam[], filterCategory?: PlacementCategory): { rank: string; category: string; names: string }[] {
  const results: { rank: string; category: string; names: string }[] = [];
  const catLabels: Record<string, string> = { '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント' };
  const familyN = (n: string) => n.trim().split(/[\s　]+/)[0] || n;

  for (const b of brackets) {
    if (filterCategory && b.category !== filterCategory) continue;
    const maxRound = Math.max(...b.matches.map(m => m.round));
    const finalMatch = b.matches.find(m => m.round === maxRound);
    if (!finalMatch || finalMatch.status !== 'finished' || !finalMatch.winnerId) continue;

    const cat = catLabels[b.category] || b.category;
    const winner = allTeams.find(t => t.teamId === finalMatch.winnerId);
    const loserId = finalMatch.winnerId === finalMatch.team1Id ? finalMatch.team2Id : finalMatch.team1Id;
    const runnerUp = loserId ? allTeams.find(t => t.teamId === loserId) : null;

    if (winner) results.push({ rank: '優勝', category: cat, names: `${familyN(winner.male.name)}・${familyN(winner.female.name)}　組` });
    if (runnerUp) results.push({ rank: '準優勝', category: cat, names: `${familyN(runnerUp.male.name)}・${familyN(runnerUp.female.name)}　組` });

    const sfMatches = b.matches.filter(m => m.round === maxRound - 1 && m.status === 'finished' && m.winnerId);
    for (const sf of sfMatches) {
      const loserId2 = sf.winnerId === sf.team1Id ? sf.team2Id : sf.team1Id;
      const third = loserId2 ? allTeams.find(t => t.teamId === loserId2) : null;
      if (third) results.push({ rank: '第3位', category: cat, names: `${familyN(third.male.name)}・${familyN(third.female.name)}　組` });
    }
  }
  return results;
}

/** 賞状CSS（太筆行書風 Google Font: Yuji Mai） */
const CERT_FONT_URL = 'https://fonts.googleapis.com/css2?family=Yuji+Mai&display=swap';

function buildCertificateHtml(entries: { rank: string; category: string; names: string }[]): string {
  const pages = entries.map(e => `
    <div class="page">
      <div class="cert-content">
        <div class="class-name">${e.category}</div>
        <div class="rank-name">${e.rank}</div>
        <div class="player-name">${e.names}</div>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>賞状印刷</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${CERT_FONT_URL}" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Yuji Mai", "游明朝", "Yu Mincho", serif; color: #000; }
  .page {
    width: 210mm; height: 297mm;
    page-break-after: always; position: relative;
  }
  .page:last-child { page-break-after: auto; }
  .cert-content {
    position: absolute;
    top: 35%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center; width: 80%;
    height: 50mm;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  .class-name {
    font-size: 28pt; font-weight: 400;
    letter-spacing: 0.4em; color: #000;
    margin-bottom: 5mm;
    -webkit-text-stroke: 0.5px #000;
  }
  .rank-name {
    font-size: 32pt; font-weight: 400;
    letter-spacing: 0.6em; color: #000;
    margin-bottom: 6mm;
    -webkit-text-stroke: 0.5px #000;
  }
  .player-name {
    font-size: 36pt; font-weight: 400;
    letter-spacing: 0.4em; color: #000;
    -webkit-text-stroke: 0.5px #000;
  }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>${pages}</body></html>`;
}

/** 賞状印刷ボタン */
function CertificatePrintButton({ brackets, allTeams, selectedCategory }: {
  brackets: PlacementBracket[];
  allTeams: MixedTeam[];
  selectedCategory: PlacementCategory;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<{ rank: string; category: string; names: string; selected: boolean }[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);

  // Yuji Bokuフォントを動的にロード
  useEffect(() => {
    if (!isOpen) return;
    const id = 'yuji-boku-font';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = CERT_FONT_URL;
    document.head.appendChild(link);
  }, [isOpen]);

  const openDialog = () => {
    const auto = getWinnersFromBrackets(brackets, allTeams, selectedCategory);
    setEntries(auto.map(e => ({ ...e, selected: true })));
    setPreviewIdx(0);
    setIsOpen(true);
  };

  const updateEntry = (idx: number, field: 'rank' | 'category' | 'names', value: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };
  const toggleEntry = (idx: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  };
  const addEntry = () => {
    setEntries(prev => [...prev, { rank: '優勝', category: '', names: '', selected: true }]);
  };
  const removeEntry = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
    if (previewIdx >= entries.length - 1) setPreviewIdx(Math.max(0, entries.length - 2));
  };

  const handlePrint = () => {
    const selected = entries.filter(e => e.selected && e.names.trim());
    if (selected.length === 0) return;
    const html = buildCertificateHtml(selected);
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 800); }
  };

  const selectedEntries = entries.filter(e => e.selected && e.names.trim());
  const previewEntry = entries[previewIdx] || entries[0];

  return (
    <>
      <button onClick={openDialog}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors">
        <Printer size={12} /> 賞状印刷
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[200]" onClick={() => setIsOpen(false)}>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col z-[210]" onClick={e => e.stopPropagation()}>
            {/* ヘッダー */}
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <Printer size={16} className="text-amber-600" /> 賞状印刷
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} disabled={selectedEntries.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg shadow hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95">
                  <Printer size={14} /> {selectedEntries.length}枚を印刷
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 本体: 左=編集リスト、右=プレビュー */}
            <div className="flex-1 overflow-hidden flex">
              {/* 左: エントリーリスト */}
              <div className="w-[45%] border-r border-gray-200 overflow-y-auto p-3 space-y-2">
                <p className="text-[10px] text-gray-500 mb-1">クリックでプレビュー表示。チェックで印刷対象を選択。</p>
                {entries.map((entry, idx) => (
                  <div key={idx}
                    onClick={() => setPreviewIdx(idx)}
                    className={`border rounded-lg p-2.5 cursor-pointer transition-all ${
                      previewIdx === idx ? 'ring-2 ring-amber-400 border-amber-300' : ''
                    } ${entry.selected ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <input type="checkbox" checked={entry.selected} onChange={e => { e.stopPropagation(); toggleEntry(idx); }} className="accent-amber-500" />
                      <select value={entry.rank} onChange={e => updateEntry(idx, 'rank', e.target.value)} onClick={e => e.stopPropagation()} className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 font-bold bg-white">
                        <option value="優勝">優勝</option><option value="準優勝">準優勝</option><option value="第3位">第3位</option>
                      </select>
                      <input type="text" value={entry.category} onChange={e => updateEntry(idx, 'category', e.target.value)} onClick={e => e.stopPropagation()}
                        placeholder="クラス名" className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 min-w-0" />
                      <button onClick={e => { e.stopPropagation(); removeEntry(idx); }} className="text-gray-400 hover:text-red-500 p-0.5"><X size={12} /></button>
                    </div>
                    <input type="text" value={entry.names} onChange={e => updateEntry(idx, 'names', e.target.value)} onClick={e => e.stopPropagation()}
                      placeholder="氏名（例: 田中・山本）" className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-bold" />
                  </div>
                ))}
                <button onClick={addEntry} className="w-full py-1.5 border-2 border-dashed border-gray-300 rounded-lg text-[11px] text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors">
                  + 手動で追加
                </button>
              </div>

              {/* 右: A4プレビュー */}
              <div className="flex-1 bg-gray-100 overflow-auto flex items-center justify-center p-4">
                {previewEntry ? (
                  <div className="bg-white shadow-lg border border-gray-300" style={{ width: '280px', height: '396px', position: 'relative' }}>
                    {/* 賞状の外枠イメージ */}
                    <div className="absolute inset-2 border-2 border-amber-300/40 rounded" />
                    <div className="absolute inset-3 border border-amber-200/30 rounded" />
                    {/* 上部: 表彰状（印刷済み模擬） */}
                    <div className="absolute top-[10%] left-0 right-0 text-center">
                      <span className="text-gray-300 text-lg tracking-[0.5em]" style={{ fontFamily: '"Yuji Mai", serif' }}>表　彰　状</span>
                    </div>
                    {/* 印刷対象エリア: A4中央より少し上、約3cm幅 */}
                    <div className="absolute left-0 right-0 flex flex-col items-center justify-center px-4" style={{ top: '35%', height: '11%' }}>
                      <div className="border-y-2 border-dashed border-amber-300/50 py-2 w-full flex flex-col items-center justify-center">
                        <div className="text-sm text-black tracking-[0.3em] mb-1.5" style={{ fontFamily: '"Yuji Mai", serif' }}>
                          {previewEntry.category || '（クラス未入力）'}
                        </div>
                        <div className="text-base text-black tracking-[0.5em] mb-1.5" style={{ fontFamily: '"Yuji Mai", serif' }}>
                          {previewEntry.rank}
                        </div>
                        <div className="text-lg text-black tracking-[0.35em]" style={{ fontFamily: '"Yuji Mai", serif' }}>
                          {previewEntry.names || '（氏名未入力）'}
                        </div>
                      </div>
                    </div>
                    {/* 印刷エリア注釈 */}
                    <div className="absolute right-1 text-[6px] text-amber-400" style={{ top: '34%' }}>印刷範囲↓</div>
                    {/* 下部: 鳥取市テニス協会（印刷済み模擬） */}
                    <div className="absolute bottom-[10%] left-0 right-0 text-center">
                      <span className="text-gray-300 text-[8px] tracking-[0.2em]" style={{ fontFamily: '"Yuji Mai", serif' }}>鳥取市テニス協会</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">エントリーを追加してください</div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
