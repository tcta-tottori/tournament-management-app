import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Trophy, ChevronRight, MapPin, Play, Check, Medal, Award, Sparkles, Shuffle, RotateCcw, ClipboardList, Volume2, VolumeX, X, Layers, ArrowLeftRight, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTeamStore } from './teamStore';
import type { TeamBracketMatch, PlacementCategory, TeamPlacementBracket } from './types';
import { MATCH_TYPE_SHORT, buildTeamBracketCallText, getBracketRoundLabel, resolveBracketLabel, resolveBracketShortLabel, playersPerSubMatch } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';
import { useTeamCallStore } from './teamCallStore';
import { useGeminiTts } from '../broadcast/useGeminiTts';
import { TeamBracketResultPreview } from './TeamBracketResultPreview';

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント',
  '2nd': '2位トーナメント',
  '3rd': '3位トーナメント',
  '4th': '4・5位トーナメント',
};

/** カテゴリタブのリッチカラー文字 */
const CATEGORY_TAB_COLORS: Record<PlacementCategory, { active: string; inactive: string }> = {
  '1st': { active: '#d97706', inactive: '#f59e0b' }, // amber
  '2nd': { active: '#475569', inactive: '#94a3b8' }, // slate
  '3rd': { active: '#ea580c', inactive: '#fb923c' }, // orange
  '4th': { active: '#2563eb', inactive: '#60a5fa' }, // blue
};

/**
 * "1位T", "4・5位T" などのカテゴリ短縮ラベルから「位」の部分だけ
 * 小さい文字で描画する。それ以外の文字はそのまま。
 */
function renderCategoryShortLabel(label: string): React.ReactNode {
  const parts = label.split(/(位)/);
  return parts.map((part, i) =>
    part === '位'
      ? <span key={i} className="text-[0.55em] opacity-80 align-middle">{part}</span>
      : <span key={i}>{part}</span>
  );
}

const CATEGORY_CONFIG: Record<PlacementCategory, { grad: string; bg: string; text: string; icon: typeof Trophy }> = {
  '1st': { grad: 'from-yellow-400 to-amber-500', bg: 'bg-yellow-50', text: 'text-yellow-700', icon: Trophy },
  '2nd': { grad: 'from-slate-400 to-slate-500', bg: 'bg-slate-50', text: 'text-slate-700', icon: Medal },
  '3rd': { grad: 'from-orange-400 to-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: Award },
  '4th': { grad: 'from-blue-400 to-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', icon: Sparkles },
};

/**
 * リーグ別の色パレット（TeamLeagueView の LEAGUE_SOLID_COLORS と対応）。
 * インデックス順にリーグへ割り当てる。
 */
const LEAGUE_BADGE_STYLES = [
  { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200' },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200' },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  { bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-200' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
];

const FALLBACK_LEAGUE_STYLE = { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };

/** 種目カラー（予選リーグと統一） */
const MATCH_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MIX: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  WD:  { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-200' },
  MD:  { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200' },
};

/** "9コート" や "5番コート" から数字のみを抽出 */
function extractCourtNumberShort(courtName: string): string {
  const m = courtName.match(/(\d+)/);
  return m ? m[1] : courtName;
}

export default function TeamBracketView() {
  const {
    brackets, selectedBracketCategory, setSelectedBracketCategory,
    advanceWinner, bracketCourtAssignments, assignBracketMatchToCourt,
    allTeams, leagues, rebuildBracketFromSlots, applyBracketReorder, tournamentInfo,
    updateBracketLabel,
  } = useTeamStore();

  const customLabels = tournamentInfo?.bracketLabels;
  const getLabel = (cat: PlacementCategory) => resolveBracketLabel(cat, customLabels);
  const getShortLabel = (cat: PlacementCategory) => resolveBracketShortLabel(cat, customLabels);

  const [editingMatch, setEditingMatch] = useState<TeamBracketMatch | null>(null);
  const [courtAssignMatch, setCourtAssignMatch] = useState<TeamBracketMatch | null>(null);
  const [courtAssignSelected, setCourtAssignSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'bracket' | 'waiting'>('bracket');
  const [showAllBrackets, setShowAllBrackets] = useState(false);
  const [callMatch, setCallMatch] = useState<TeamBracketMatch | null>(null);
  const [callCourts, setCallCourts] = useState<string[]>([]);
  const [reorderingCategory, setReorderingCategory] = useState<PlacementCategory | null>(null);
  // ブラケット名のインライン編集
  const [editingLabelCategory, setEditingLabelCategory] = useState<PlacementCategory | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const { speak } = useGeminiTts();
  const startCall = useTeamCallStore(s => s.start);
  const finishCall = useTeamCallStore(s => s.finish);

  const handleCallConfirm = (text: string, callContent: {
    matchId: string; category: PlacementCategory; roundLabel: string;
    team1Number: number; team1Name: string; team2Number: number; team2Name: string;
    courtNames: string[];
  }) => {
    // 1. 音声再生を最初に実行（モバイルのユーザージェスチャー制約を維持するため）
    speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 1 }, () => finishCall());
    // 2. ダイアログを閉じる
    setCallMatch(null);
    // 3. 右下バブルを表示
    startCall(callContent);
  };

  const currentBracket = brackets.find(b => b.category === selectedBracketCategory);

  /** リーグID → 色スタイル のマッピング（store の leagues の順序で割り当て） */
  const leagueStyleMap = useMemo(() => {
    const map: Record<string, typeof LEAGUE_BADGE_STYLES[number]> = {};
    leagues.forEach((l, i) => {
      map[l.leagueId] = LEAGUE_BADGE_STYLES[i % LEAGUE_BADGE_STYLES.length];
    });
    return map;
  }, [leagues]);
  const getLeagueStyle = (leagueId: string | null | undefined) =>
    (leagueId && leagueStyleMap[leagueId]) || FALLBACK_LEAGUE_STYLE;

  // 全ブラケットから対戦待ち（ready）試合を収集（控えリスト用）
  const waitingMatches = useMemo(() => {
    const items: { match: TeamBracketMatch; bracket: TeamPlacementBracket; roundLabel: string }[] = [];
    for (const b of brackets) {
      const totalR = Math.log2(b.drawSize);
      for (const m of b.matches) {
        if (m.team1Id && m.team2Id && !m.isBye && (m.status === 'waiting' || m.status === 'ready')) {
          const fromFinal = totalR - m.round;
          const rl = fromFinal === 0 ? '決勝' : fromFinal === 1 ? '準決勝' : fromFinal === 2 ? '準々決勝' : `${m.round}回戦`;
          items.push({ match: m, bracket: b, roundLabel: rl });
        }
      }
    }
    items.sort((a, b) => {
      if (a.match.round !== b.match.round) return a.match.round - b.match.round;
      const order = ['1st', '2nd', '3rd', '4th'];
      return order.indexOf(a.bracket.category) - order.indexOf(b.bracket.category);
    });
    return items;
  }, [brackets]);
  const is1stBracket = selectedBracketCategory === '1st';
  const showDrawPanel = useMemo(() => {
    if (!is1stBracket || !currentBracket) return false;
    const r1 = currentBracket.matches.filter(m => m.round === 1 && !m.isBye);
    return r1.some(m => !m.team1Id || !m.team2Id);
  }, [is1stBracket, currentBracket]);

  // 使用中コート（決勝Tに割り当て済みのコート＋予選未完了リーグのコート）
  const usedCourtNames = useMemo(() => {
    const used = new Set<string>();
    for (const ca of Object.values(bracketCourtAssignments)) {
      for (const c of ca.courtNames) used.add(c);
    }
    return used;
  }, [bracketCourtAssignments]);

  const openCourtAssign = (match: TeamBracketMatch) => {
    setCourtAssignMatch(match);
    const existing = bracketCourtAssignments[match.matchId];
    setCourtAssignSelected(existing ? [...existing.courtNames] : []);
  };

  const confirmCourtAssign = () => {
    if (!courtAssignMatch || courtAssignSelected.length === 0) return;
    assignBracketMatchToCourt(courtAssignMatch.matchId, courtAssignSelected);
    // 割当後にコールダイアログを自動的に開く
    setCallMatch(courtAssignMatch);
    setCallCourts([...courtAssignSelected]);
    setCourtAssignMatch(null);
    setCourtAssignSelected([]);
  };

  const openCall = (match: TeamBracketMatch) => {
    const ca = bracketCourtAssignments[match.matchId];
    setCallMatch(match);
    setCallCourts(ca ? [...ca.courtNames] : []);
  };

  if (!currentBracket || brackets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-slate-500">決勝トーナメント未生成</p>
        <p className="text-sm mt-1">予選リーグ順位表から生成してください</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* モバイル: メインタブ: トーナメント / 控えリスト（セグメント切替） */}
      <div className="flex justify-center lg:hidden">
        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setViewMode('bracket')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'bracket'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            トーナメント
          </button>
          <button
            onClick={() => setViewMode('waiting')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'waiting'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            控えリスト
            {waitingMatches.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{waitingMatches.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* モバイル: 控えリスト */}
      <div className="lg:hidden">
      {viewMode === 'waiting' && (
        <TeamWaitingList
          waitingMatches={waitingMatches}
          onAssignCourt={openCourtAssign}
          onCall={openCall}
          bracketCourtAssignments={bracketCourtAssignments}
          customLabels={customLabels}
        />
      )}
      </div>

      {/* PC: 左=控えリスト / 右=トーナメント の2カラム分割 */}
      <div className="lg:flex lg:gap-4">
        {/* PC左カラム: 控えリスト（PCのみ表示） */}
        <div className="hidden lg:block lg:w-1/3 lg:shrink-0">
          <div className="sticky top-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <ClipboardList className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-black text-slate-700">控えリスト</span>
              {waitingMatches.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{waitingMatches.length}</span>
              )}
            </div>
            <TeamWaitingList
              waitingMatches={waitingMatches}
              onAssignCourt={openCourtAssign}
              onCall={openCall}
              bracketCourtAssignments={bracketCourtAssignments}
              customLabels={customLabels}
            />
          </div>
        </div>

        {/* 右カラム（PC）/ フルワイド（モバイル）: トーナメント表示 */}
        <div className={`lg:w-2/3 lg:shrink-0 space-y-4 ${viewMode !== 'bracket' ? 'hidden lg:block' : ''}`}>
      {/* カテゴリタブ（リッチカラー文字） */}
      <div className="-mx-2 px-2">
        <div className="chrome-tab-bar">
          <button
            onClick={() => setShowAllBrackets(true)}
            className={`chrome-tab ${showAllBrackets ? 'chrome-tab-active' : ''}`}
          >
            <Layers className="chrome-tab-icon" stroke="url(#rainbow-grad)" />
            <span className="chrome-tab-label chrome-tab-label-rainbow">ALL</span>
          </button>
          {brackets.map(b => {
            const isSelected = !showAllBrackets && b.category === selectedBracketCategory;
            const colors = CATEGORY_TAB_COLORS[b.category];
            // トーナメントの全試合終了判定（全試合 = teams.length - 1）
            const tabTotal = Math.max(0, b.teams.length - 1);
            const finishedCount = b.matches.filter(m => !m.isBye && m.status === 'finished').length;
            const bracketDone = tabTotal > 0 && finishedCount === tabTotal;
            return (
              <button
                key={b.category}
                onClick={() => { setShowAllBrackets(false); setSelectedBracketCategory(b.category); }}
                className={`chrome-tab ${isSelected ? 'chrome-tab-active' : ''}`}
              >
                <span
                  className={`chrome-tab-label ${bracketDone ? 'chrome-tab-label-done' : ''}`}
                  style={{ color: isSelected ? colors.active : colors.inactive }}
                >
                  {renderCategoryShortLabel(getShortLabel(b.category))}
                </span>
                {bracketDone && (
                  <Check className="w-3 h-3" strokeWidth={3} style={{ color: isSelected ? colors.active : colors.inactive }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* テスト入力ボタン */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            const target = showAllBrackets ? brackets : (currentBracket ? [currentBracket] : []);
            const label = showAllBrackets ? '全トーナメント' : getLabel(selectedBracketCategory);
            if (!confirm(`${label}の全試合を 田中/山本 6-4 田中/山本 で埋めます。よろしいですか？`)) return;
            for (const bracket of target) {
              const totalRounds = Math.log2(bracket.drawSize);
              for (let round = 1; round <= totalRounds; round++) {
                const freshBrackets = useTeamStore.getState().brackets;
                const freshBracket = freshBrackets.find(b => b.category === bracket.category);
                if (!freshBracket) continue;
                const roundMatches = freshBracket.matches.filter(
                  m => m.round === round && m.team1Id && m.team2Id && !m.isBye
                );
                for (const m of roundMatches) {
                  for (const sm of m.subMatches) {
                    const players = playersPerSubMatch(sm.type) === 1 ? ['田中'] : ['田中', '山本'];
                    useTeamStore.getState().updateBracketSubMatchScore(m.matchId, sm.type, 6, 4, null);
                    useTeamStore.getState().updateBracketSubMatchPlayers(m.matchId, sm.type, players, players);
                  }
                  useTeamStore.getState().advanceWinner(m.matchId);
                }
              }
            }
          }}
          className="flex items-center justify-center py-2.5 rounded-xl text-xs font-black tracking-wider bg-gradient-to-b from-amber-50 to-amber-100/60 text-amber-700 border border-amber-200/80 shadow-sm hover:shadow hover:border-amber-300 active:scale-95 transition-all"
        >
          TEST
        </button>
        <button
          onClick={() => {
            if (!confirm(`全トーナメント（${brackets.length}カテゴリ）の全試合を 田中/山本 6-4 田中/山本 で埋めます。よろしいですか？`)) return;
            for (const bracket of brackets) {
              const totalRounds = Math.log2(bracket.drawSize);
              for (let round = 1; round <= totalRounds; round++) {
                const freshBrackets = useTeamStore.getState().brackets;
                const freshBracket = freshBrackets.find(b => b.category === bracket.category);
                if (!freshBracket) continue;
                const roundMatches = freshBracket.matches.filter(
                  m => m.round === round && m.team1Id && m.team2Id && !m.isBye
                );
                for (const m of roundMatches) {
                  for (const sm of m.subMatches) {
                    const players = playersPerSubMatch(sm.type) === 1 ? ['田中'] : ['田中', '山本'];
                    useTeamStore.getState().updateBracketSubMatchScore(m.matchId, sm.type, 6, 4, null);
                    useTeamStore.getState().updateBracketSubMatchPlayers(m.matchId, sm.type, players, players);
                  }
                  useTeamStore.getState().advanceWinner(m.matchId);
                }
              }
            }
          }}
          className="flex items-center justify-center py-2.5 rounded-xl text-xs font-black tracking-wider bg-gradient-to-b from-orange-50 to-orange-100/60 text-orange-700 border border-orange-200/80 shadow-sm hover:shadow hover:border-orange-300 active:scale-95 transition-all"
        >
          TEST（ALL）
        </button>
      </div>

      {/* === ブラケット表示（全体・個別共通） === */}
      {(() => {
        const bracketsToRender = showAllBrackets ? brackets : (currentBracket ? [currentBracket] : []);

        return (<>
        <div className="space-y-6">
          {bracketsToRender.map(bracket => {
            const cat = bracket.category;
            const cfg = CATEGORY_CONFIG[cat];
            const bTotalRounds = Math.log2(bracket.drawSize);
            const bRoundMatches = Array.from({ length: bTotalRounds }, (_, i) =>
              bracket.matches.filter(m => m.round === i + 1)
            );
            const bGetRoundName = (round: number) => {
              if (round === bTotalRounds) return '決勝';
              if (round === bTotalRounds - 1) return '準決勝';
              if (round === bTotalRounds - 2) return '準々決勝';
              return `${round}回戦`;
            };

            const MATCH_HEIGHT = 132;
            const MATCH_WIDTH = 240;
            const ROUND_GAP = 40;
            const MATCH_GAP = 16;
            const GRID_UNIT = MATCH_HEIGHT + MATCH_GAP;
            const getMatchY = (roundIdx: number, matchIdx: number) => {
              const spacing = Math.pow(2, roundIdx);
              const offset = (spacing - 1) * GRID_UNIT / 2;
              return 36 + matchIdx * spacing * GRID_UNIT + offset + MATCH_HEIGHT / 2;
            };
            const r1count = bRoundMatches[0]?.length || 0;
            const svgHeight = r1count * GRID_UNIT + 36;
            const catGradColors: Record<string, string> = {
              '1st': '#f59e0b', '2nd': '#94a3b8', '3rd': '#f97316', '4th': '#3b82f6',
            };
            const lineColor = catGradColors[cat] || '#c9cdd3';

            // ヘッダー用の進捗計算
            // 総試合数 = そのトーナメントに参加するチーム数 - 1（シングルエリミの定理）
            const headerTotal = Math.max(0, bracket.teams.length - 1);
            const headerFinished = bracket.matches.filter(m => !m.isBye && m.status === 'finished').length;
            const headerPct = headerTotal > 0 ? Math.round((headerFinished / headerTotal) * 100) : 0;

            const bracketDone = headerTotal > 0 && headerFinished === headerTotal;

            return (
              <div key={cat} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* 一体型ヘッダー（アイコン削除、右側に進捗ゲージ） */}
                <div className={`px-4 py-3 flex items-center gap-3 bg-gradient-to-r ${cfg.grad} text-white`}>
                  <div className="flex-1 min-w-0">
                    {editingLabelCategory === cat ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={editingLabelValue}
                          onChange={e => setEditingLabelValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              updateBracketLabel(cat, editingLabelValue);
                              setEditingLabelCategory(null);
                            } else if (e.key === 'Escape') {
                              setEditingLabelCategory(null);
                            }
                          }}
                          placeholder={CATEGORY_LABELS[cat]}
                          className="flex-1 min-w-0 px-2 py-1 text-sm font-bold text-slate-800 bg-white/95 rounded border border-white/40 focus:outline-none focus:ring-2 focus:ring-white/60"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            updateBracketLabel(cat, editingLabelValue);
                            setEditingLabelCategory(null);
                          }}
                          className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold"
                          title="保存"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLabelCategory(null)}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold"
                          title="キャンセル"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLabelCategory(cat);
                          setEditingLabelValue(getLabel(cat));
                        }}
                        className="group flex items-center gap-1.5 text-base font-black tracking-tight hover:opacity-90"
                        title="名前を変更"
                      >
                        <span className="text-left">{getLabel(cat)}</span>
                        <Pencil size={11} className="opacity-60 group-hover:opacity-100" />
                      </button>
                    )}
                    <div className="text-[10px] opacity-80">{bracket.drawSize}チームドロー</div>
                  </div>
                  {/* 右側: 並べ替え + 結果画像ボタン + 進捗ゲージ */}
                  <div className="shrink-0 flex items-center gap-2">
                    {!showAllBrackets && (
                      <button
                        onClick={() => setReorderingCategory(prev => prev === cat ? null : cat)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          reorderingCategory === cat
                            ? 'bg-white text-slate-700 shadow-sm'
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                        title="トーナメントの並べ替え"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        並べ替え
                      </button>
                    )}
                    {bracketDone && (
                      <TeamBracketResultPreview
                        bracket={bracket}
                        allTeams={allTeams}
                        tournamentName={tournamentInfo?.name || ''}
                        customLabels={customLabels}
                      />
                    )}
                    <div className="flex flex-col items-end gap-1 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black tabular-nums tracking-tight">
                          {headerFinished}<span className="opacity-60">/{headerTotal}</span>
                        </span>
                        <div className="w-20 h-1.5 rounded-full bg-white/25 overflow-hidden shadow-inner">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-500 shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                            style={{ width: `${headerPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] font-bold opacity-75 tabular-nums">{headerPct}% 完了</span>
                    </div>
                  </div>
                </div>

                {/* 1位トーナメント抽選パネル */}
                {!showAllBrackets && cat === '1st' && showDrawPanel && (
                  <div className="p-3 border-b border-slate-100">
                    <TeamRouletteDrawPanel bracket={bracket} onRebuild={rebuildBracketFromSlots} />
                  </div>
                )}

                {/* 並べ替えパネル（任意のカテゴリで利用可） */}
                {!showAllBrackets && reorderingCategory === cat && (
                  <div className="p-3 border-b border-slate-100">
                    <TeamBracketReorderPanel
                      bracket={bracket}
                      allBrackets={brackets}
                      customLabels={customLabels}
                      onClose={() => setReorderingCategory(null)}
                      onApply={applyBracketReorder}
                    />
                  </div>
                )}

                {/* ブラケット本体 */}
                <div className="overflow-x-auto bg-gradient-to-br from-slate-50/80 via-white to-slate-50/50">
                  <div className="relative p-4" style={{ minWidth: (MATCH_WIDTH + ROUND_GAP) * bTotalRounds, height: svgHeight }}>
                    {/* 接続線SVG */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ width: (MATCH_WIDTH + ROUND_GAP) * bTotalRounds, height: svgHeight }}>
                      {bRoundMatches.slice(0, -1).map((rMatches, roundIdx) => {
                        const x1 = roundIdx * (MATCH_WIDTH + ROUND_GAP) + MATCH_WIDTH;
                        const x2 = (roundIdx + 1) * (MATCH_WIDTH + ROUND_GAP);
                        const xMid = (x1 + x2) / 2;
                        const pairs: React.ReactNode[] = [];
                        for (let i = 0; i < rMatches.length; i += 2) {
                          if (i + 1 >= rMatches.length) break;
                          const y1 = getMatchY(roundIdx, i);
                          const y2 = getMatchY(roundIdx, i + 1);
                          const yNext = getMatchY(roundIdx + 1, Math.floor(i / 2));
                          pairs.push(
                            <g key={`line-${roundIdx}-${i}`}>
                              <line x1={x1} y1={y1} x2={xMid} y2={y1} stroke={lineColor} strokeWidth="2" strokeOpacity="0.5" />
                              <line x1={x1} y1={y2} x2={xMid} y2={y2} stroke={lineColor} strokeWidth="2" strokeOpacity="0.5" />
                              <line x1={xMid} y1={y1} x2={xMid} y2={y2} stroke={lineColor} strokeWidth="2" strokeOpacity="0.5" />
                              <line x1={xMid} y1={yNext} x2={x2} y2={yNext} stroke={lineColor} strokeWidth="2" strokeOpacity="0.5" />
                            </g>
                          );
                        }
                        return pairs;
                      })}
                    </svg>

                    {/* 各ラウンドのマッチカード */}
                    {bRoundMatches.map((matches, ri) => {
                      const round = ri + 1;
                      const colX = ri * (MATCH_WIDTH + ROUND_GAP);
                      return (
                        <div key={round}>
                          {/* ラウンドラベル */}
                          <div className="absolute" style={{ left: colX, top: 4, width: MATCH_WIDTH }}>
                            <div className="text-center">
                              <span className={`inline-block px-4 py-1 rounded-full text-xs font-black shadow-sm ${
                                round === bTotalRounds
                                  ? `bg-gradient-to-r ${cfg.grad} text-white`
                                  : round === bTotalRounds - 1
                                  ? `${cfg.bg} ${cfg.text} border border-current/20`
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {bGetRoundName(round)}
                              </span>
                            </div>
                          </div>

                          {/* 各試合 */}
                          {matches.map((match, matchIdx) => {
                            const centerY = getMatchY(ri, matchIdx);
                            const court = bracketCourtAssignments[match.matchId];
                            const isFinished = match.status === 'finished';
                            const isBye = match.status === 'bye';
                            const isPlaying = match.status === 'playing';
                            const isReady = match.status === 'ready';

                            if (isBye) {
                              const byeName = match.team1Name || match.team2Name || '';
                              const byeLeague = match.team1League || match.team2League;
                              const byeStyle = getLeagueStyle(byeLeague);
                              return (
                                <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - 24, width: MATCH_WIDTH, zIndex: 1 }}>
                                  <div className="flex items-center gap-2 px-3 h-12 rounded-lg border border-slate-200 bg-white/80">
                                    {byeLeague && (
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${byeStyle.bg} ${byeStyle.text} text-[9px] font-black shrink-0`}>
                                        {byeLeague}
                                      </span>
                                    )}
                                    <span className="text-sm font-bold text-slate-700 truncate flex-1">{byeName}</span>
                                  </div>
                                </div>
                              );
                            }

                            const borderStyle = isFinished
                              ? 'border-emerald-300 shadow-sm'
                              : isPlaying
                              ? 'border-green-400 shadow-md bracket-playing-blink'
                              : isReady && match.team1Id && match.team2Id
                              ? 'border-blue-300 hover:shadow-md'
                              : 'border-slate-200';

                            return (
                              <div key={match.matchId} className="absolute" style={{ left: colX, top: centerY - MATCH_HEIGHT / 2, width: MATCH_WIDTH, zIndex: 1 }}>
                                <div className={`rounded-xl border-2 overflow-hidden transition-all bg-white ${borderStyle}`} style={{ height: MATCH_HEIGHT }}>
                                  {/* ステータスバー（経過時間は下段に移動） */}
                                  <div className={`flex items-center justify-between px-2 py-0.5 border-b text-[10px] ${
                                    isPlaying ? 'bg-green-50 border-green-100' :
                                    isFinished ? 'bg-emerald-50/50 border-emerald-100' :
                                    `${cfg.bg} border-slate-100`
                                  }`}>
                                    <div className="flex items-center gap-1 min-w-0">
                                      {court ? (
                                        <span className="flex items-center gap-0.5 text-blue-600 font-bold truncate">
                                          <MapPin className="w-3 h-3 shrink-0" />
                                          <span className="truncate tabular-nums">{court.courtNames.map(extractCourtNumberShort).join('・')}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-medium">#{match.position}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {isFinished && (
                                        <span className="flex items-center gap-0.5 text-emerald-600 font-bold">
                                          <Check className="w-2.5 h-2.5" />完了
                                        </span>
                                      )}
                                      {isPlaying && (
                                        <span className="flex items-center gap-1 text-green-600 font-bold animate-pulse">
                                          <span className="w-2 h-2 rounded-full bg-green-500" />
                                          対戦中
                                        </span>
                                      )}
                                      {!isFinished && !isPlaying && match.team1Id && match.team2Id && (
                                        <span className="text-amber-500 font-bold flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />控え</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* チーム1 */}
                                  <button
                                    onClick={() => match.team1Id && match.team2Id && setEditingMatch(match)}
                                    disabled={!match.team1Id || !match.team2Id}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 transition-colors text-left border-b border-slate-100 ${
                                      match.winnerId === match.team1Id ? 'bg-blue-50/80' : ''
                                    } ${isReady && match.team1Id && match.team2Id ? 'hover:bg-blue-50 active:bg-blue-100' : ''} disabled:cursor-default`}
                                  >
                                    {match.team1League && (() => {
                                      const s = getLeagueStyle(match.team1League);
                                      return (
                                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${s.bg} ${s.text} text-[9px] font-black shrink-0`}>
                                          {match.team1League}
                                        </span>
                                      );
                                    })()}
                                    <span className={`flex-1 text-xs truncate ${
                                      match.team1Name === 'BYE' ? 'text-slate-300 italic' :
                                      match.winnerId === match.team1Id ? 'font-black text-blue-700' : 'text-slate-700 font-medium'
                                    }`}>{match.team1Name || '---'}</span>
                                    {isFinished && (
                                      <span className={`text-sm font-black tabular-nums ${
                                        match.winnerId === match.team1Id ? 'text-blue-600' : 'text-slate-300'
                                      }`}>{match.winsTeam1}</span>
                                    )}
                                  </button>

                                  {/* チーム2 */}
                                  <button
                                    onClick={() => match.team1Id && match.team2Id && setEditingMatch(match)}
                                    disabled={!match.team1Id || !match.team2Id}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 transition-colors text-left ${
                                      match.winnerId === match.team2Id ? 'bg-blue-50/80' : ''
                                    } ${isReady && match.team1Id && match.team2Id ? 'hover:bg-blue-50 active:bg-blue-100' : ''} disabled:cursor-default`}
                                  >
                                    {match.team2League && (() => {
                                      const s = getLeagueStyle(match.team2League);
                                      return (
                                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${s.bg} ${s.text} text-[9px] font-black shrink-0`}>
                                          {match.team2League}
                                        </span>
                                      );
                                    })()}
                                    <span className={`flex-1 text-xs truncate ${
                                      match.team2Name === 'BYE' ? 'text-slate-300 italic' :
                                      match.winnerId === match.team2Id ? 'font-black text-blue-700' : 'text-slate-700 font-medium'
                                    }`}>{match.team2Name || '---'}</span>
                                    {isFinished && (
                                      <span className={`text-sm font-black tabular-nums ${
                                        match.winnerId === match.team2Id ? 'text-blue-600' : 'text-slate-300'
                                      }`}>{match.winsTeam2}</span>
                                    )}
                                  </button>

                                  {/* スコア詳細 + アクション（左下: コート/コール / 右下: 経過時間 or 勝者進出） */}
                                  <div className={`flex items-center justify-between gap-1 px-2 py-0.5 border-t text-[9px] ${
                                    isPlaying ? 'bg-green-50/50 border-green-100' :
                                    isFinished ? 'bg-slate-50/50 border-slate-100' :
                                    'bg-slate-50/30 border-slate-100'
                                  }`}>
                                    {/* 左下: コート入力/変更 + コールボタン（すべて同じサイズのリッチボタン） */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isReady && !court && match.team1Id && match.team2Id && (
                                        <button
                                          onClick={e => { e.stopPropagation(); openCourtAssign(match); }}
                                          className="bracket-action-btn bracket-btn-in"
                                          aria-label="コート割当"
                                          title="コート割当"
                                        >
                                          <MapPin className="w-3.5 h-3.5" />
                                          <span>IN</span>
                                        </button>
                                      )}
                                      {isPlaying && court && (
                                        <>
                                          <button
                                            onClick={e => { e.stopPropagation(); openCourtAssign(match); }}
                                            className="bracket-action-btn bracket-btn-change"
                                            aria-label="コート変更"
                                            title="コート変更"
                                          >
                                            <MapPin className="w-3.5 h-3.5" />
                                            <span>変更</span>
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); openCall(match); }}
                                            className="bracket-action-btn bracket-btn-call"
                                            aria-label="試合コール"
                                            title="試合コール"
                                          >
                                            <Volume2 className="w-3.5 h-3.5" />
                                            <span>コール</span>
                                          </button>
                                        </>
                                      )}
                                    </div>

                                    {/* 中央: スコア詳細 */}
                                    <div className="flex-1 min-w-0 flex items-center justify-center overflow-hidden">
                                      {isFinished && match.subMatches.length > 0 && (
                                        <div className="flex gap-1 overflow-hidden items-center">
                                          {match.subMatches.map(sm => {
                                            const tag = MATCH_TYPE_COLORS[sm.type];
                                            const isTerminated = !!sm.terminated;
                                            return (
                                              <span key={sm.type} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                                                <span className={`inline-flex items-center justify-center px-1 h-3.5 rounded text-[8px] font-black tracking-wider ${tag.bg} ${tag.text} border ${tag.border}`}>
                                                  {MATCH_TYPE_SHORT[sm.type]}
                                                </span>
                                                <span className={`font-mono font-black tabular-nums ${
                                                  isTerminated ? 'text-slate-400 line-through decoration-rose-400' :
                                                  sm.winnerId === match.team1Id ? 'text-blue-600' :
                                                  sm.winnerId === match.team2Id ? 'text-red-400' : 'text-slate-400'
                                                }`}>{sm.score1}-{sm.score2}</span>
                                                {isTerminated && (
                                                  <span className="text-[8px] font-black text-rose-500">打</span>
                                                )}
                                                {sm.tiebreakScore !== null && <span className="text-slate-400 font-mono">({sm.tiebreakScore})</span>}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    {/* 右下: 経過時間 or 勝者進出 */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isPlaying && court?.startedAt && (() => {
                                        const el = Math.floor((Date.now() - court.startedAt) / 60000);
                                        const h = Math.floor(el / 60);
                                        const m = el % 60;
                                        return (
                                          <span className="font-mono text-[10px] font-black text-green-600 tabular-nums">
                                            {h}:{String(m).padStart(2, '0')}
                                          </span>
                                        );
                                      })()}
                                      {isFinished && match.winnerId && match.nextMatchId && (
                                        <button
                                          onClick={e => { e.stopPropagation(); advanceWinner(match.matchId); }}
                                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                                        >
                                          勝者進出<ChevronRight className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                  </div>
                </div>
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
        </>);
      })()}
        </div>{/* 右カラム end */}
      </div>{/* PC flex / モバイル wrapper end */}

      {/* コート割当ダイアログ（複数選択可） */}
      {courtAssignMatch && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setCourtAssignMatch(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <h3 className="font-black">コート割当（複数選択可）</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  {courtAssignMatch.team1League && <span className="w-4 h-4 rounded bg-slate-200 text-[8px] font-bold text-slate-600 flex items-center justify-center">{courtAssignMatch.team1League}</span>}
                  <span className="font-bold truncate">{courtAssignMatch.team1Name}</span>
                </div>
                <div className="text-slate-400 text-[9px] my-0.5">vs</div>
                <div className="flex items-center gap-2">
                  {courtAssignMatch.team2League && <span className="w-4 h-4 rounded bg-slate-200 text-[8px] font-bold text-slate-600 flex items-center justify-center">{courtAssignMatch.team2League}</span>}
                  <span className="font-bold truncate">{courtAssignMatch.team2Name}</span>
                </div>
              </div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                コートを選択 <span className="text-slate-400 font-normal">（複数選択可・使用中は選択不可）</span>
              </label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: 16 }, (_, i) => `${i + 1}コート`).map(c => {
                  const inLeagueProgress = (() => {
                    for (const l of leagues) {
                      const lm = useTeamStore.getState().leagueMatches.filter(m => m.leagueId === l.leagueId);
                      if (lm.length > 0 && lm.some(m => m.status !== 'finished')) {
                        const nums = (l.courtName || '').match(/\d+/g);
                        if (nums && nums.includes(c.replace('コート', ''))) return true;
                      }
                    }
                    return false;
                  })();
                  // 既に他のマッチで使用中
                  const usedByOther = Array.from(usedCourtNames).some(uc => uc === c) &&
                    !(bracketCourtAssignments[courtAssignMatch.matchId]?.courtNames.includes(c));
                  const isUsed = inLeagueProgress || usedByOther;
                  const isSelected = courtAssignSelected.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (isUsed) return;
                        setCourtAssignSelected(prev =>
                          prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                        );
                      }}
                      disabled={isUsed}
                      className={`py-2 text-xs font-bold rounded-lg border-2 transition-all
                        ${isUsed ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' :
                          isSelected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                          'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {c.replace('コート', '')}
                      {isUsed && <span className="block text-[7px] text-slate-300">使用中</span>}
                    </button>
                  );
                })}
              </div>
              {courtAssignSelected.length > 0 && (
                <div className="mb-3 text-[10px] text-slate-500 text-center">
                  選択中: <span className="font-bold text-emerald-600">{courtAssignSelected.sort((a, b) => parseInt(a) - parseInt(b)).join('・')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCourtAssignMatch(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={confirmCourtAssign}
                  disabled={courtAssignSelected.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* コールダイアログ */}
      {callMatch && (
        <TeamCallDialog
          match={callMatch}
          courtNames={callCourts}
          onClose={() => setCallMatch(null)}
          onConfirm={handleCallConfirm}
        />
      )}

      {/* スコア入力ダイアログ */}
      {editingMatch && (
        <TeamScoreInput
          matchId={editingMatch.matchId}
          team1Id={editingMatch.team1Id || ''}
          team2Id={editingMatch.team2Id || ''}
          team1Name={editingMatch.team1Name}
          team2Name={editingMatch.team2Name}
          subMatches={editingMatch.subMatches}
          onClose={() => setEditingMatch(null)}
          isBracket
        />
      )}
    </div>
  );
}

/** 団体戦・決勝トーナメント用コールダイアログ
 *  ミックス大会の CallPreviewDialog と同じパターン:
 *  ダイアログ内では text を編集し、onConfirm(text, content) で親に返す。
 *  親側で「ダイアログを閉じてから speak() を呼ぶ」。
 */
function TeamCallDialog({
  match,
  courtNames,
  onClose,
  onConfirm,
}: {
  match: TeamBracketMatch;
  courtNames: string[];
  onClose: () => void;
  onConfirm: (text: string, content: {
    matchId: string; category: PlacementCategory; roundLabel: string;
    team1Number: number; team1Name: string; team2Number: number; team2Name: string;
    courtNames: string[];
  }) => void;
}) {
  const allTeams = useTeamStore(s => s.allTeams);
  const brackets = useTeamStore(s => s.brackets);
  const isCalling = useTeamCallStore(s => s.isActive);
  const cancelCall = useTeamCallStore(s => s.cancel);

  const bracket = useMemo(() => brackets.find(b => b.category === match.category), [brackets, match.category]);
  const totalRounds = bracket ? Math.log2(bracket.drawSize) : 1;
  const roundLabel = getBracketRoundLabel(match.round, totalRounds);

  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);

  const customLabels = useTeamStore(s => s.tournamentInfo?.bracketLabels);
  const initialText = useMemo(() => {
    if (!team1 || !team2) return '';
    return buildTeamBracketCallText({
      category: match.category,
      roundLabel,
      team1Number: team1.teamNumber,
      team1Name: team1.teamName,
      team2Number: team2.teamNumber,
      team2Name: team2.teamName,
      courtNames,
      customLabels,
    });
  }, [match.category, roundLabel, team1, team2, courtNames, customLabels]);

  const [text, setText] = useState(initialText);
  useEffect(() => { setText(initialText); }, [initialText]);

  const handleSpeak = () => {
    if (!text.trim() || !team1 || !team2) return;
    onConfirm(text, {
      matchId: match.matchId,
      category: match.category,
      roundLabel,
      team1Number: team1.teamNumber,
      team1Name: team1.teamName,
      team2Number: team2.teamNumber,
      team2Name: team2.teamName,
      courtNames,
    });
  };

  const handleStop = () => {
    cancelCall();
  };

  if (!team1 || !team2) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            <h3 className="font-black">試合コール</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-[10px] text-slate-500">
            内容を確認・編集してから「コール」を押してください。
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500 resize-y"
          />
          <div className="text-[10px] text-slate-400 leading-snug">
            ※コール中はダイアログを閉じても画面右下に進行状況が表示されます。
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              閉じる
            </button>
            {isCalling ? (
              <button
                onClick={handleStop}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
              >
                <VolumeX className="w-4 h-4" />
                停止
              </button>
            ) : (
              <button
                onClick={handleSpeak}
                disabled={!text.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" />
                コール
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** 控えリスト — 全ブラケットの対戦待ち試合を1回戦優先で表示 */
function TeamWaitingList({
  waitingMatches,
  onAssignCourt,
  onCall,
  bracketCourtAssignments,
  customLabels,
}: {
  waitingMatches: { match: TeamBracketMatch; bracket: TeamPlacementBracket; roundLabel: string }[];
  onAssignCourt: (match: TeamBracketMatch) => void;
  onCall: (match: TeamBracketMatch) => void;
  bracketCourtAssignments: Record<string, { courtNames: string[]; startedAt: number }>;
  customLabels?: Partial<Record<PlacementCategory, string>>;
}) {
  const leagues = useTeamStore(s => s.leagues);
  const leagueStyleMap = useMemo(() => {
    const map: Record<string, typeof LEAGUE_BADGE_STYLES[number]> = {};
    leagues.forEach((l, i) => {
      map[l.leagueId] = LEAGUE_BADGE_STYLES[i % LEAGUE_BADGE_STYLES.length];
    });
    return map;
  }, [leagues]);
  const getLeagueStyle = (leagueId: string | null | undefined) =>
    (leagueId && leagueStyleMap[leagueId]) || FALLBACK_LEAGUE_STYLE;

  if (waitingMatches.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">対戦控えはありません</p>
        <p className="text-[11px] mt-1">両チームが確定した試合がここに表示されます</p>
      </div>
    );
  }

  const catFullLabel = (cat: PlacementCategory) => resolveBracketLabel(cat, customLabels);

  return (
    <div className="space-y-2.5">
      {waitingMatches.map(({ match, bracket, roundLabel }, idx) => {
        const cfg = CATEGORY_CONFIG[bracket.category];
        const ca = bracketCourtAssignments[match.matchId];
        const hasCourtAssigned = ca && ca.courtNames.length > 0;
        const s1 = getLeagueStyle(match.team1League);
        const s2 = getLeagueStyle(match.team2League);
        return (
          <div key={match.matchId} className={`rounded-xl border overflow-hidden transition-all ${
            hasCourtAssigned
              ? 'border-blue-200 shadow-md ring-1 ring-blue-100/50'
              : 'border-slate-200/80 shadow-sm'
          }`}>
            {/* ヘッダー: カテゴリ + ラウンド */}
            <div className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r ${cfg.grad} text-white`}>
              <span className="text-xs font-black opacity-80 tabular-nums">#{idx + 1}</span>
              <span className="text-xs font-black tracking-wide">{catFullLabel(bracket.category)} {roundLabel}</span>
            </div>
            {/* チーム情報 */}
            <div className="px-3 py-2 bg-white">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                {match.team1League && (
                  <span className={`w-5 h-5 rounded-md ${s1.bg} ${s1.text} text-[9px] font-black flex items-center justify-center shrink-0`}>{match.team1League}</span>
                )}
                <span className="truncate flex-1">{match.team1Name}</span>
              </div>
              <div className="text-[9px] text-slate-300 font-black pl-6.5 my-0.5">VS</div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                {match.team2League && (
                  <span className={`w-5 h-5 rounded-md ${s2.bg} ${s2.text} text-[9px] font-black flex items-center justify-center shrink-0`}>{match.team2League}</span>
                )}
                <span className="truncate flex-1">{match.team2Name}</span>
              </div>
            </div>
            {/* フッター: コート + ボタン */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-t border-slate-100">
              {hasCourtAssigned ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 tabular-nums">
                  <MapPin className="w-3.5 h-3.5" />
                  {ca.courtNames.map(extractCourtNumberShort).join('・')}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 italic">コート未割当</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {hasCourtAssigned && (
                  <button
                    onClick={() => onCall(match)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black text-white bg-gradient-to-b from-red-500 to-red-600 rounded-lg shadow-sm hover:from-red-600 hover:to-red-700 active:scale-95 transition-all"
                    title="試合コール"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    コール
                  </button>
                )}
                <button
                  onClick={() => onAssignCourt(match)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-lg active:scale-95 transition-all ${
                    hasCourtAssigned
                      ? 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm'
                      : 'text-white bg-gradient-to-b from-emerald-500 to-emerald-600 shadow-sm hover:from-emerald-600 hover:to-emerald-700'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {hasCourtAssigned ? '変更' : 'IN'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 1位トーナメント抽選パネル（ルーレット＋手動配置） */
function TeamRouletteDrawPanel({ bracket, onRebuild }: {
  bracket: TeamPlacementBracket;
  onRebuild: (category: PlacementCategory, slots: (string | null)[], byePositions?: Set<number>) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState(-1);
  const [assignedSlots, setAssignedSlots] = useState<Map<number, string>>(new Map());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [drawComplete, setDrawComplete] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teams = bracket.teams;
  const DRAW_SIZE = 8;

  // チーム数に応じてBYE位置を決定（5チームなら3 BYE等）
  const BYE_POSITIONS = useMemo(() => {
    const byeCount = Math.max(0, DRAW_SIZE - teams.length);
    // 5チーム→[1,5,7]、4チーム→[1,3,5,7]、6チーム→[1,5]、7チーム→[1]、8チーム→[]
    const presets: Record<number, number[]> = {
      0: [],
      1: [1],
      2: [1, 5],
      3: [1, 5, 7],
      4: [1, 3, 5, 7],
    };
    return new Set(presets[byeCount] ?? []);
  }, [teams.length]);

  const teamSlots = useMemo(() =>
    Array.from({ length: DRAW_SIZE }, (_, i) => i).filter(i => !BYE_POSITIONS.has(i)),
  [BYE_POSITIONS]);

  const assignedTeamIds = useMemo(() => new Set(assignedSlots.values()), [assignedSlots]);
  const availableSlots = useMemo(() => teamSlots.filter(i => !assignedSlots.has(i)), [teamSlots, assignedSlots]);
  const unassignedTeams = useMemo(() => teams.filter(t => !assignedTeamIds.has(t.teamId)), [teams, assignedTeamIds]);
  const activeTeam = selectedTeamId ? teams.find(t => t.teamId === selectedTeamId) : unassignedTeams[0];

  const syncToBracket = useCallback((slotsMap: Map<number, string>) => {
    const slots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    slotsMap.forEach((teamId, slot) => { slots[slot] = teamId; });
    onRebuild(bracket.category, slots, BYE_POSITIONS);
  }, [bracket.category, onRebuild, BYE_POSITIONS]);

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
    syncToBracket(newSlots);
  };

  const autoDrawAll = useCallback(() => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const slots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    let ti = 0;
    for (let i = 0; i < DRAW_SIZE; i++) {
      if (BYE_POSITIONS.has(i)) continue;
      if (ti < shuffled.length) { slots[i] = shuffled[ti].teamId; ti++; }
    }
    onRebuild(bracket.category, slots, BYE_POSITIONS);
    setDrawComplete(true);
  }, [teams, bracket.category, onRebuild, BYE_POSITIONS]);

  const confirmDraw = useCallback(() => {
    syncToBracket(assignedSlots);
    setDrawComplete(true);
  }, [assignedSlots, syncToBracket]);

  const resetDraw = () => {
    setAssignedSlots(new Map());
    setSelectedTeamId(null);
    setCurrentHighlight(-1);
    setDrawComplete(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    const emptySlots: (string | null)[] = Array(DRAW_SIZE).fill(null);
    onRebuild(bracket.category, emptySlots, BYE_POSITIONS);
  };

  useEffect(() => () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-yellow-200 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-4 py-2.5 border-b border-yellow-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
          <Shuffle size={14} className="text-yellow-600" />
          1位トーナメント 抽選
        </h3>
        <button onClick={resetDraw} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <RotateCcw size={12} />リセット
        </button>
      </div>

      <div className="p-3">
        {!drawComplete ? (
          <>
            {/* チーム選択 */}
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 mb-1.5">チームを選択してスロットに配置</div>
              <div className="flex flex-wrap gap-1">
                {teams.map(t => {
                  const isAssigned = assignedTeamIds.has(t.teamId);
                  const isSelected = activeTeam?.teamId === t.teamId;
                  return (
                    <button
                      key={t.teamId}
                      onClick={() => !isAssigned && setSelectedTeamId(t.teamId)}
                      disabled={isAssigned || spinning}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                        isAssigned ? 'bg-emerald-50 border-emerald-200 text-emerald-500 line-through opacity-60' :
                        isSelected ? 'bg-yellow-100 border-yellow-400 text-yellow-800 ring-1 ring-yellow-300' :
                        'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
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
                <button
                  onClick={spinRoulette}
                  className="px-3 py-1 rounded-lg text-[10px] font-bold bg-yellow-500 text-white hover:bg-yellow-600 shrink-0"
                >
                  🎲 ルーレット
                </button>
              </div>
            )}
            {spinning && (
              <div className="mb-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg text-center text-xs font-bold text-yellow-700 animate-pulse">
                抽選中...
              </div>
            )}

            {/* スロット表示（対戦ペアで2列表示） */}
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
                      isBye ? 'bg-slate-100 text-slate-400' :
                      hl ? 'bg-yellow-200' :
                      team ? 'bg-emerald-50' :
                      canPlace ? 'bg-yellow-50 cursor-pointer hover:bg-yellow-100' : 'bg-white'
                    }`}
                  >
                    <span className="text-slate-400 font-bold w-4 text-center shrink-0">{si + 1}</span>
                    {isBye ? (
                      <span className="text-slate-300 italic">BYE</span>
                    ) : team ? (
                      <span className="font-bold text-slate-800 truncate">
                        <span className="text-slate-400">{team.leagueId}</span> {team.teamName}
                      </span>
                    ) : canPlace ? (
                      <span className="text-yellow-500">← タップ</span>
                    ) : (
                      <span className="text-slate-300">―</span>
                    )}
                  </div>
                );

                return (
                  <div key={matchIdx} className="rounded border border-slate-200 overflow-hidden">
                    {renderSlot(s1, isBye1, t1, hl1, canPlace1)}
                    <div className="border-t border-slate-100" />
                    {renderSlot(s2, isBye2, t2, hl2, canPlace2)}
                  </div>
                );
              })}
            </div>

            {/* ボタン群 */}
            <div className="flex gap-2">
              <button
                onClick={autoDrawAll}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg text-xs font-bold hover:bg-yellow-600"
              >
                🎲 全自動抽選
              </button>
              {unassignedTeams.length === 0 && (
                <button
                  onClick={confirmDraw}
                  className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600"
                >
                  ✓ 確定
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-emerald-600 font-bold text-sm mb-2">抽選完了</div>
            <p className="text-xs text-slate-500">トーナメント表に反映されました</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 決勝トーナメントのR1スロット並べ替えパネル。
 *  - 2スロットをタップで入れ替え（BYEスロットも入れ替え可能）
 *  - 各スロット右の「BYE化/解除」でチームを未配置プールに退避／BYE解除
 *  - 未配置プールのチップをタップ → 空きスロットへ配置
 *  - 他カテゴリの順位トーナメントからチームを取り込み可能。元カテゴリからは
 *    そのチームが取り除かれ、空いたスロットは BYE になる
 *  - 対戦中・終了済みの試合があっても並び替え可。確定時に強い警告を表示。
 *    確定で applyBracketReorder を呼び、関係するブラケット全体（スコア含む）を再構築。
 */
function TeamBracketReorderPanel({ bracket, allBrackets, customLabels, onClose, onApply }: {
  bracket: TeamPlacementBracket;
  allBrackets: TeamPlacementBracket[];
  customLabels?: Partial<Record<PlacementCategory, string>>;
  onClose: () => void;
  onApply: (
    targetCategory: PlacementCategory,
    targetSlots: (string | null)[],
    targetByes: Set<number>,
    externalImports: Array<{ teamId: string; fromCategory: PlacementCategory }>
  ) => void;
}) {
  const labelOf = (c: PlacementCategory) => resolveBracketLabel(c, customLabels);
  const shortOf = (c: PlacementCategory) => resolveBracketShortLabel(c, customLabels);
  const { initialSlots, initialByes } = useMemo(() => {
    const drawSize = bracket.drawSize;
    const slots: (string | null)[] = Array(drawSize).fill(null);
    const byes = new Set<number>();
    const r1 = bracket.matches
      .filter(m => m.round === 1)
      .sort((a, b) => a.position - b.position);
    r1.forEach((m, i) => {
      const i1 = i * 2;
      const i2 = i * 2 + 1;
      if (m.isBye) {
        if (m.team1Id && (!m.team2Id || m.team2Name === 'BYE')) {
          slots[i1] = m.team1Id;
          byes.add(i2);
        } else if (m.team2Id && (!m.team1Id || m.team1Name === 'BYE')) {
          slots[i2] = m.team2Id;
          byes.add(i1);
        } else {
          byes.add(i1); byes.add(i2);
        }
      } else {
        slots[i1] = m.team1Id;
        slots[i2] = m.team2Id;
      }
    });
    return { initialSlots: slots, initialByes: byes };
  }, [bracket]);

  const [slots, setSlots] = useState<(string | null)[]>(initialSlots);
  const [byes, setByes] = useState<Set<number>>(initialByes);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // teamId → 取り込み元カテゴリ。ターゲットへ取り込んだ他カテゴリのチームを記録
  const [importedSources, setImportedSources] = useState<Map<string, PlacementCategory>>(new Map());

  // 全ブラケットのチームを統合した検索マップ（他カテゴリのチーム表示にも使う）
  const teamMap = useMemo(() => {
    const m = new Map<string, { teamName: string; leagueId: string }>();
    for (const b of allBrackets) {
      for (const t of b.teams) {
        if (!m.has(t.teamId)) m.set(t.teamId, { teamName: t.teamName, leagueId: t.leagueId });
      }
    }
    return m;
  }, [allBrackets]);

  const otherBrackets = useMemo(
    () => allBrackets.filter(b => b.category !== bracket.category),
    [allBrackets, bracket.category]
  );

  const usedTeamIds = useMemo(() => new Set(slots.filter((s): s is string => s !== null)), [slots]);
  // 自カテゴリの未配置（自カテゴリ teams からスロットに無いもの）
  const localUnassigned = useMemo(
    () => bracket.teams.filter(t => !usedTeamIds.has(t.teamId)),
    [bracket.teams, usedTeamIds]
  );
  // 他カテゴリから取り込み候補のチーム（スロットに既に入っているものは除外）
  const externalCandidates = useMemo(() => {
    const out: { teamId: string; teamName: string; leagueId: string; fromCategory: PlacementCategory }[] = [];
    for (const ob of otherBrackets) {
      for (const t of ob.teams) {
        if (!usedTeamIds.has(t.teamId)) {
          out.push({ teamId: t.teamId, teamName: t.teamName, leagueId: t.leagueId, fromCategory: ob.category });
        }
      }
    }
    return out;
  }, [otherBrackets, usedTeamIds]);

  // 確定時に実際に取り込まれるチーム（ターゲットのスロットに残っているもののみ）
  const effectiveImports = useMemo(
    () => Array.from(importedSources.entries())
      .filter(([teamId]) => usedTeamIds.has(teamId))
      .map(([teamId, fromCategory]) => ({ teamId, fromCategory })),
    [importedSources, usedTeamIds]
  );

  const dirty = useMemo(() => {
    const slotsChanged = slots.some((s, i) => s !== initialSlots[i]);
    const byesChanged = byes.size !== initialByes.size || [...byes].some(i => !initialByes.has(i));
    return slotsChanged || byesChanged || effectiveImports.length > 0;
  }, [slots, byes, initialSlots, initialByes, effectiveImports]);

  const hasInProgress = useMemo(
    () => bracket.matches.some(m => m.status === 'playing'),
    [bracket.matches]
  );
  const hasFinished = useMemo(
    () => bracket.matches.some(m => !m.isBye && m.status === 'finished'),
    [bracket.matches]
  );

  const handleSlotClick = (i: number) => {
    // 未配置チームを選択中なら、そのスロットに配置
    if (selectedTeamId) {
      const newSlots = [...slots];
      // 既存のチームがあれば未配置に戻す（newSlotsから外す）
      newSlots[i] = selectedTeamId;
      const newByes = new Set(byes);
      newByes.delete(i);
      setSlots(newSlots);
      setByes(newByes);
      setSelectedTeamId(null);
      return;
    }
    if (selectedIdx === null) {
      setSelectedIdx(i);
      return;
    }
    if (selectedIdx === i) {
      setSelectedIdx(null);
      return;
    }
    const a = selectedIdx;
    const b = i;
    const newSlots = [...slots];
    [newSlots[a], newSlots[b]] = [newSlots[b], newSlots[a]];
    const newByes = new Set(byes);
    const aWasBye = newByes.has(a);
    const bWasBye = newByes.has(b);
    if (aWasBye !== bWasBye) {
      if (aWasBye) { newByes.delete(a); newByes.add(b); }
      else { newByes.delete(b); newByes.add(a); }
    }
    setSlots(newSlots);
    setByes(newByes);
    setSelectedIdx(null);
  };

  const toggleBye = (i: number) => {
    const newByes = new Set(byes);
    if (newByes.has(i)) {
      // BYE解除 → 空きスロットへ
      newByes.delete(i);
      setByes(newByes);
    } else {
      // BYE化 → チームがいれば未配置に戻し、BYEに
      const newSlots = [...slots];
      newSlots[i] = null;
      newByes.add(i);
      setSlots(newSlots);
      setByes(newByes);
    }
    setSelectedIdx(null);
  };

  const reset = () => {
    setSlots(initialSlots);
    setByes(initialByes);
    setSelectedIdx(null);
    setSelectedTeamId(null);
    setImportedSources(new Map());
  };

  const apply = () => {
    const warnings: string[] = [];
    if (hasInProgress) warnings.push('● 対戦中の試合があります。');
    if (hasFinished) warnings.push('● 入力済みのスコアがあります。');
    if (effectiveImports.length > 0) {
      const sourceCats = Array.from(new Set(effectiveImports.map(i => i.fromCategory)));
      const labels = sourceCats.map(c => labelOf(c)).join('・');
      warnings.push(`● ${labels} のスコアもリセットされ、移籍チームのスロットはBYEになります。`);
    }
    if (warnings.length > 0) {
      const msg = `以下の影響があります:\n${warnings.join('\n')}\n\n本当に並べ替えますか？`;
      if (!confirm(msg)) return;
    }
    onApply(bracket.category, slots, byes, effectiveImports);
    onClose();
  };

  const drawSize = bracket.drawSize;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2.5 border-b border-indigo-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-indigo-600" />
          並べ替え
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={reset}
            disabled={!dirty}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={12} />リセット
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X size={12} />閉じる
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="text-[10px] text-slate-500 mb-2 leading-relaxed">
          スロット2つタップで入れ替え。右の「BYE/解除」でBYE化／解除。
          未配置チームをタップ後、配置先スロットをタップで移動。
        </div>

        {(hasInProgress || hasFinished) && (
          <div className="mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 font-bold">
            ⚠ 確定すると{hasInProgress ? '対戦中の試合と' : ''}入力済みのスコアがリセットされます。
          </div>
        )}

        {/* スロット表示（対戦ペアで2列表示） */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-3">
          {Array.from({ length: drawSize / 2 }, (_, matchIdx) => {
            const indices = [matchIdx * 2, matchIdx * 2 + 1];
            return (
              <div key={matchIdx} className="rounded border border-slate-200 overflow-hidden">
                {indices.map((si, k) => {
                  const isBye = byes.has(si);
                  const teamId = slots[si];
                  const team = teamId ? teamMap.get(teamId) : null;
                  const importSource = teamId ? importedSources.get(teamId) : undefined;
                  const isImported = !!importSource;
                  const isSelected = selectedIdx === si;
                  const slotMoved = slots[si] !== initialSlots[si];
                  const byeChanged = isBye !== initialByes.has(si);
                  const moved = slotMoved || byeChanged;
                  const canPlaceTeam = !!selectedTeamId && !team;

                  return (
                    <div key={si}>
                      {k === 1 && <div className="border-t border-slate-100" />}
                      <div className={`w-full flex items-stretch text-[10px] transition-all ${
                        isSelected ? 'bg-indigo-200 ring-2 ring-indigo-400' :
                        canPlaceTeam ? 'bg-yellow-50' :
                        moved ? 'bg-emerald-50' :
                        isBye ? 'bg-slate-50' :
                        'bg-white'
                      }`}>
                        <button
                          type="button"
                          onClick={() => handleSlotClick(si)}
                          className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-left ${
                            canPlaceTeam ? 'hover:bg-yellow-100 cursor-pointer' :
                            'hover:bg-indigo-50'
                          }`}
                        >
                          <span className="text-slate-400 font-bold w-4 text-center shrink-0">{si + 1}</span>
                          {isBye ? (
                            <span className="text-slate-400 italic">BYE</span>
                          ) : team ? (
                            <>
                              <span className="font-bold text-slate-800 truncate">
                                <span className="text-slate-400">{team.leagueId}</span> {team.teamName}
                              </span>
                              {isImported && (
                                <span className="ml-1 px-1 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-bold shrink-0">
                                  ←{shortOf(importSource!)}
                                </span>
                              )}
                            </>
                          ) : canPlaceTeam ? (
                            <span className="text-yellow-600">← ここに配置</span>
                          ) : (
                            <span className="text-slate-300">―</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBye(si)}
                          className={`px-1.5 text-[9px] font-bold border-l shrink-0 transition-colors ${
                            isBye
                              ? 'border-slate-200 text-indigo-500 hover:bg-indigo-100'
                              : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-rose-500'
                          }`}
                          title={isBye ? 'BYE解除' : 'BYE化'}
                        >
                          {isBye ? '解除' : 'BYE'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 未配置チームプール（自カテゴリ） */}
        {localUnassigned.length > 0 && (
          <div className="mb-2 p-2 rounded-lg border border-amber-200 bg-amber-50/50">
            <div className="text-[9px] text-amber-700 font-bold mb-1.5">
              未配置チーム（タップ → 配置先スロットをタップ）
            </div>
            <div className="flex flex-wrap gap-1">
              {localUnassigned.map(t => {
                const isSelected = selectedTeamId === t.teamId;
                return (
                  <button
                    key={t.teamId}
                    type="button"
                    onClick={() => {
                      setSelectedTeamId(prev => prev === t.teamId ? null : t.teamId);
                      setSelectedIdx(null);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-yellow-200 border-yellow-500 text-yellow-900 ring-2 ring-yellow-300'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300'
                    }`}
                  >
                    <span className="text-slate-400">{t.leagueId}</span> {t.teamName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 他カテゴリから取り込み候補 */}
        {externalCandidates.length > 0 && (
          <div className="mb-3 p-2 rounded-lg border border-violet-200 bg-violet-50/50">
            <div className="text-[9px] text-violet-700 font-bold mb-1.5">
              他カテゴリから取り込み（選択 → スロットをタップで移籍）
            </div>
            <div className="flex flex-wrap gap-1">
              {externalCandidates.map(t => {
                const isSelected = selectedTeamId === t.teamId;
                return (
                  <button
                    key={`${t.fromCategory}-${t.teamId}`}
                    type="button"
                    onClick={() => {
                      if (selectedTeamId === t.teamId) {
                        setSelectedTeamId(null);
                      } else {
                        setSelectedTeamId(t.teamId);
                        setSelectedIdx(null);
                        setImportedSources(prev => {
                          const next = new Map(prev);
                          if (!next.has(t.teamId)) next.set(t.teamId, t.fromCategory);
                          return next;
                        });
                      }
                    }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-violet-200 border-violet-500 text-violet-900 ring-2 ring-violet-300'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
                    }`}
                  >
                    <span className="px-1 rounded bg-violet-100 text-violet-700 text-[8px] font-bold">
                      {shortOf(t.fromCategory)}
                    </span>
                    <span><span className="text-slate-400">{t.leagueId}</span> {t.teamName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200"
          >
            キャンセル
          </button>
          <button
            onClick={apply}
            disabled={!dirty}
            className="flex-1 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✓ 確定
          </button>
        </div>
      </div>
    </div>
  );
}
