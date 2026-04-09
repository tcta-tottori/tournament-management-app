import { useState, useMemo } from 'react';
import { Check, Circle, Play, MapPin, Maximize2, X, Trophy, Info, Settings2, ArrowUp, ArrowDown, HelpCircle, Sparkles, BarChart3, ListOrdered } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamLeagueMatch, TeamLeagueStanding, TiebreakRuleId } from './types';
import { calculateTeamStandings, MATCH_TYPE_ORDER, MATCH_TYPE_SHORT, TIEBREAK_RULE_LABELS } from './teamLogic';
import TeamScoreInput from './TeamScoreInput';
import { TeamLeagueResultPreview } from './TeamLeagueResultPreview';
import { createPortal } from 'react-dom';

/** 判定ルール詳細 */
const TIEBREAK_RULE_DETAILS: Record<TiebreakRuleId, {
  title: string;
  summary: string;
  description: string;
  example: { title: string; lines: string[]; conclusion: string };
  grad: string;
  iconBg: string;
}> = {
  points: {
    title: '取得ポイント（種目勝利数）',
    summary: '勝利した種目（MIX / WD / MD）の合計数で比較します',
    description: '各対戦では最大3種目を行い、勝利した種目の合計数を「取得ポイント」として集計します。勝利数が同じチーム同士で取得ポイントが多いチームが上位になります。',
    example: {
      title: '例：AとBが2勝1敗で並んだ場合',
      lines: [
        'チームA: 3試合で 6 種目勝利（2-1 / 3-0 / 1-2）',
        'チームB: 3試合で 5 種目勝利（2-1 / 2-1 / 1-2）',
      ],
      conclusion: '→ 取得ポイントが多いチームAが上位',
    },
    grad: 'from-amber-500 to-orange-600',
    iconBg: 'bg-amber-100 text-amber-700',
  },
  gameRatio: {
    title: 'ゲーム率',
    summary: '全試合での「取得ゲーム数 ÷ 総ゲーム数」で比較します',
    description: '各種目で取ったゲーム数を合計し、(取得ゲーム数) ÷ (取得ゲーム数 + 失ゲーム数) の値が高い方が上位になります。接戦で勝ったか、圧勝したかを評価します。',
    example: {
      title: '例：AとBのゲーム率を比較',
      lines: [
        'チームA: 取得 36 / 失 24 → 36 ÷ 60 = 0.600',
        'チームB: 取得 32 / 失 28 → 32 ÷ 60 = 0.533',
      ],
      conclusion: '→ ゲーム率が高いチームAが上位',
    },
    grad: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
  },
  headToHead: {
    title: '直接対決',
    summary: '同率 2 チーム同士の場合、直接対戦で勝ったチームが上位です',
    description: '2チームが完全に同率の場合のみ適用されます。両チームの直接対戦の勝者が上位となります。3チーム以上で同率になった場合はこのルールは適用されません（他のルールで判定）。',
    example: {
      title: '例：AとBが完全同率',
      lines: [
        '直接対戦: チームA 2-1 チームB',
      ],
      conclusion: '→ 直接対戦で勝ったチームAが上位',
    },
    grad: 'from-indigo-500 to-blue-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
  },
};

/** 判定ルール詳細ポップアップ */
function RuleDetailPopup({ rule, onClose }: { rule: TiebreakRuleId; onClose: () => void }) {
  const d = TIEBREAK_RULE_DETAILS[rule];
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`bg-gradient-to-br ${d.grad} px-5 py-4 text-white flex items-center justify-between`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] opacity-90 font-bold uppercase tracking-wider">判定ルール</div>
              <div className="text-base font-black truncate">{d.title}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`text-sm font-bold text-slate-800 ${d.iconBg} px-3 py-2 rounded-lg`}>
            {d.summary}
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">
            {d.description}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{d.example.title}</div>
            <div className="space-y-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
              {d.example.lines.map((l, i) => (
                <div key={i} className="text-xs text-slate-700 font-medium tabular-nums">{l}</div>
              ))}
              <div className="text-xs font-black text-slate-900 pt-1.5 mt-1.5 border-t border-slate-200">
                {d.example.conclusion}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-center">
            ※ 勝数（対戦勝利数）は常にこれらより優先されます
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** リーグカラー */
const LEAGUE_COLORS = [
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', soft: 'bg-blue-100', ring: 'ring-blue-500/20' },
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', soft: 'bg-emerald-100', ring: 'ring-emerald-500/20' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', soft: 'bg-purple-100', ring: 'ring-purple-500/20' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', soft: 'bg-rose-100', ring: 'ring-rose-500/20' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', soft: 'bg-amber-100', ring: 'ring-amber-500/20' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', soft: 'bg-cyan-100', ring: 'ring-cyan-500/20' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', soft: 'bg-lime-100', ring: 'ring-lime-500/20' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', soft: 'bg-fuchsia-100', ring: 'ring-fuchsia-500/20' },
];

const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

/** 種目カラー */
const MATCH_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  MIX: { bg: 'bg-violet-100', text: 'text-violet-700' },
  WD:  { bg: 'bg-pink-100',   text: 'text-pink-700' },
  MD:  { bg: 'bg-sky-100',    text: 'text-sky-700' },
};

/** 順位（プレーンテキスト） */
function RankText({ rank }: { rank: number }) {
  return <span className="text-sm font-black text-slate-700 tabular-nums">{rank}位</span>;
}

/** 判定ルール設定パネル */
function TiebreakRuleSettings() {
  const { tiebreakOrder, setTiebreakOrder } = useTeamStore();
  const [open, setOpen] = useState(false);
  const [detailRule, setDetailRule] = useState<TiebreakRuleId | null>(null);

  const move = (idx: number, dir: -1 | 1) => {
    const newOrder = [...tiebreakOrder];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setTiebreakOrder(newOrder);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.10)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50/80 transition-colors bg-gradient-to-r from-slate-50/60 via-white to-slate-50/40"
      >
        <Settings2 className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-bold text-slate-700">判定ルール（優先順）</span>
        <span className="ml-auto text-[10px] text-slate-400 truncate">
          {tiebreakOrder.map(r => TIEBREAK_RULE_LABELS[r].split('（')[0]).join(' → ')}
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-slate-100 space-y-1.5 bg-slate-50/40">
          <div className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            ルール名をタップすると詳細と例が表示されます
          </div>
          {tiebreakOrder.map((rule, i) => (
            <div key={rule} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-lg border border-slate-200">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-black shrink-0">{i + 1}</span>
              <button
                onClick={() => setDetailRule(rule)}
                className="flex-1 flex items-center gap-1.5 text-left px-2 py-1 rounded-md hover:bg-indigo-50 active:bg-indigo-100 transition-colors min-w-0"
              >
                <span className="flex-1 text-xs font-bold text-slate-700 truncate">{TIEBREAK_RULE_LABELS[rule]}</span>
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              </button>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 shrink-0">
                <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === tiebreakOrder.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 shrink-0">
                <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          ))}
          <div className="text-[10px] text-slate-400 pt-1">※ 勝数は常に最優先です</div>
        </div>
      )}
      {detailRule && <RuleDetailPopup rule={detailRule} onClose={() => setDetailRule(null)} />}
    </div>
  );
}

/** 判定詳細ポップアップ */
function TiebreakDetailPopup({ standing, onClose }: { standing: TeamLeagueStanding; onClose: () => void }) {
  const { tiebreakOrder } = useTeamStore();
  const [detailRule, setDetailRule] = useState<TiebreakRuleId | null>(null);
  const totalGames = standing.gamesWon + standing.gamesLost;
  const ratio = totalGames === 0 ? 0 : standing.gamesWon / totalGames;
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-slate-700 to-slate-900 px-5 py-3 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] opacity-80 font-bold uppercase tracking-wider">判定詳細</div>
            <div className="text-base font-black">{standing.teamName}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">対戦勝敗</div>
              <div className="text-base font-black tabular-nums">{standing.wins} - {standing.losses}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">取得ポイント</div>
              <div className="text-base font-black tabular-nums">{standing.pointsWon} - {standing.pointsLost}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">取得ゲーム</div>
              <div className="text-base font-black tabular-nums">{standing.gamesWon} - {standing.gamesLost}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-[10px] text-slate-400 font-bold">ゲーム率</div>
              <div className="text-base font-black tabular-nums">{ratio.toFixed(3)}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-bold mb-1.5 flex items-center gap-1">
              適用された判定順
              <span className="text-slate-400 font-normal">（タップで詳細）</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
                <span className="inline-flex w-5 h-5 rounded-full bg-amber-500 text-white items-center justify-center text-[10px] font-black">0</span>
                <span className="font-bold text-amber-800">対戦勝数</span>
              </div>
              {tiebreakOrder.map((r, i) => (
                <button
                  key={r}
                  onClick={() => setDetailRule(r)}
                  className="w-full flex items-center gap-2 text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded hover:bg-indigo-50 hover:border-indigo-200 active:scale-[0.98] transition-all"
                >
                  <span className="inline-flex w-5 h-5 rounded-full bg-slate-600 text-white items-center justify-center text-[10px] font-black">{i + 1}</span>
                  <span className="flex-1 text-left font-bold text-slate-700">{TIEBREAK_RULE_LABELS[r]}</span>
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                </button>
              ))}
            </div>
          </div>
          {standing.tiebreakReason && (
            <div className="text-xs px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-blue-800 font-bold">適用理由: </span>
              <span className="text-blue-700">{standing.tiebreakReason}</span>
            </div>
          )}
        </div>
      </div>
      {detailRule && <RuleDetailPopup rule={detailRule} onClose={() => setDetailRule(null)} />}
    </div>,
    document.body
  );
}

export default function TeamLeagueView() {
  const { leagues, leagueMatches, selectedLeagueId, setSelectedLeagueId, tiebreakOrder, updateSubMatchScore, updateSubMatchPlayers, allTeams, tournamentInfo } = useTeamStore();
  const [editingMatch, setEditingMatch] = useState<TeamLeagueMatch | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [judgementTarget, setJudgementTarget] = useState<TeamLeagueStanding | null>(null);

  const { rankOverrides } = useTeamStore();
  const allStandings = calculateTeamStandings(leagues, leagueMatches, rankOverrides, tiebreakOrder);

  const selectedLeague = leagues.find(l => l.leagueId === selectedLeagueId) || leagues[0];
  if (!selectedLeague) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-base font-bold text-slate-500">データがありません</p>
      </div>
    );
  }

  const leagueMatchList = leagueMatches.filter(m => m.leagueId === selectedLeague.leagueId);
  const finishedCount = leagueMatchList.filter(m => m.status === 'finished').length;
  const totalCount = leagueMatchList.length;
  const leagueComplete = finishedCount === totalCount && totalCount > 0;
  const standings = allStandings.get(selectedLeague.leagueId) || [];

  const leagueIdx = leagues.findIndex(l => l.leagueId === selectedLeague.leagueId);
  const color = getColor(leagueIdx);

  // 現在の対戦番号
  const currentMatchNumber = useMemo(() => {
    for (const mo of selectedLeague.matchOrder) {
      const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
      if (!match || match.status !== 'finished') return mo.matchNumber;
    }
    return null;
  }, [selectedLeague.matchOrder, leagueMatchList]);

  // スコアマトリクス
  const scoreMatrix = new Map<string, TeamLeagueMatch>();
  for (const m of leagueMatchList) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  const getMatchBetween = (team1Id: string, team2Id: string) => scoreMatrix.get(`${team1Id}-${team2Id}`);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 overflow-auto p-4' : ''} space-y-4 pb-20`}>
      {/* リーグ選択タブ（横スクロール可） */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-2 bg-gradient-to-b from-slate-50 via-slate-50 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1.5 min-w-max">
              {leagues.map((l, i) => {
                const c = getColor(i);
                const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
                const done = lm.filter(m => m.status === 'finished').length;
                const total = lm.length;
                const complete = done === total && total > 0;
                const isSelected = l.leagueId === selectedLeague.leagueId;
                return (
                  <button
                    key={l.leagueId}
                    onClick={() => setSelectedLeagueId(l.leagueId)}
                    className={`relative px-3.5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                      isSelected
                        ? `bg-gradient-to-br ${c.grad} text-white shadow-md`
                        : `${c.bg} ${c.text} hover:shadow-sm`
                    }`}
                  >
                    <span className="text-base font-black">{l.leagueId}</span>
                    <span className={`ml-1 text-[10px] tabular-nums ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                      {done}/{total}
                    </span>
                    {complete && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white flex items-center justify-center">
                        <Check className="w-2 h-2 text-white" strokeWidth={4} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 shrink-0 transition-colors"
            title={isFullscreen ? '通常表示' : '全画面'}
          >
            {isFullscreen ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* リーグヘッダーカード */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${color.grad} text-white shadow-lg`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight">{selectedLeague.leagueId}</span>
                <span className="text-sm font-medium opacity-90">リーグ</span>
              </div>
              {selectedLeague.courtName && (
                <div className="flex items-center gap-1 text-xs opacity-90 mt-1">
                  <MapPin className="w-3 h-3" />
                  {selectedLeague.courtName}
                </div>
              )}
            </div>
            <div className="text-right">
              {leagueComplete ? (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-black">
                  <Check className="w-3.5 h-3.5" />
                  全試合完了
                </div>
              ) : (
                <div className="text-[10px] opacity-80 font-medium">進行状況</div>
              )}
              <div className="text-2xl font-black tabular-nums leading-tight mt-0.5">
                {finishedCount}<span className="text-sm opacity-60">/{totalCount}</span>
              </div>
            </div>
          </div>

          {/* 結果プレビュー（全試合完了時のみ） */}
          {leagueComplete && (
            <div className="mt-3 flex justify-end">
              <TeamLeagueResultPreview
                league={selectedLeague}
                standings={standings}
                matches={leagueMatchList}
                allTeams={allTeams}
                tournamentName={tournamentInfo?.name || ''}
              />
            </div>
          )}

          {/* プログレスバー */}
          <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (finishedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 判定ルール設定 */}
      <TiebreakRuleSettings />

      {/* テスト入力ボタン */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            if (!confirm(`${selectedLeague.leagueId}リーグの全試合を 田中/山本 6-4 田中/山本 で埋めます。よろしいですか？`)) return;
            for (const m of leagueMatchList) {
              for (const mt of MATCH_TYPE_ORDER) {
                updateSubMatchScore(m.matchId, mt, 6, 4, null);
                updateSubMatchPlayers(m.matchId, mt, ['田中', '山本'], ['田中', '山本']);
              }
            }
          }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-b from-amber-50 to-amber-100/60 text-amber-700 border border-amber-200/80 shadow-sm hover:shadow hover:border-amber-300 active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {selectedLeague.leagueId}リーグのみ
        </button>
        <button
          onClick={() => {
            if (!confirm(`全リーグ（${leagues.length}ブロック）の全試合を 田中/山本 6-4 田中/山本 で埋めます。よろしいですか？`)) return;
            for (const m of leagueMatches) {
              for (const mt of MATCH_TYPE_ORDER) {
                updateSubMatchScore(m.matchId, mt, 6, 4, null);
                updateSubMatchPlayers(m.matchId, mt, ['田中', '山本'], ['田中', '山本']);
              }
            }
          }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-b from-orange-50 to-orange-100/60 text-orange-700 border border-orange-200/80 shadow-sm hover:shadow hover:border-orange-300 active:scale-95 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          全リーグ一括（6-4 / 田中・山本）
        </button>
      </div>

      {/* 成績表 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.10)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-indigo-100 flex items-center gap-2 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-bold text-slate-700 tracking-wide">成績表</span>
          <span className="ml-auto text-[10px] text-slate-400 tracking-wider">タップで入力</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-2 py-2 text-left min-w-[110px] font-bold text-slate-600 border-b border-slate-200">チーム</th>
                <th className="px-1 py-2 text-center w-[34px] font-bold text-slate-600 border-b border-slate-200">種目</th>
                {selectedLeague.teams.map(t => (
                  <th key={t.teamId} className="px-1.5 py-2 text-center min-w-[64px] text-[10px] font-bold text-slate-600 border-b border-slate-200">
                    {t.teamName.split(' ')[0]}
                  </th>
                ))}
                <th className="px-2 py-2 text-center min-w-[58px] font-bold text-slate-600 border-b border-slate-200">成績</th>
                {leagueComplete && (
                  <>
                    <th className="px-2 py-2 text-center min-w-[52px] font-bold text-slate-600 border-b border-slate-200">順位</th>
                    <th className="px-2 py-2 text-center min-w-[80px] font-bold text-slate-600 border-b border-slate-200">判定</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {selectedLeague.teams.map(rowTeam => {
                const standing = standings.find(s => s.teamId === rowTeam.teamId);
                return (
                  <tr key={rowTeam.teamId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-bold text-xs bg-slate-50/40 align-middle border-r border-slate-100">
                      <div className="truncate max-w-[150px]" title={rowTeam.teamName}>{rowTeam.teamName}</div>
                    </td>
                    {/* 種目ラベル列 */}
                    <td className="px-0.5 py-1.5 align-middle border-r border-slate-100 bg-slate-50/30">
                      <div className="flex flex-col gap-0.5 items-center">
                        {MATCH_TYPE_ORDER.map(mt => {
                          const tag = MATCH_TYPE_COLORS[mt];
                          return (
                            <span key={mt} className={`inline-flex items-center justify-center w-7 h-3.5 rounded text-[8px] font-black tracking-wider ${tag.bg} ${tag.text}`}>
                              {MATCH_TYPE_SHORT[mt]}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {selectedLeague.teams.map(colTeam => {
                      if (rowTeam.teamId === colTeam.teamId) {
                        return <td key={colTeam.teamId} className="bg-gradient-to-br from-slate-100 to-slate-50 border-r border-slate-100" />;
                      }
                      const match = getMatchBetween(rowTeam.teamId, colTeam.teamId);
                      if (!match) return <td key={colTeam.teamId} className="border-r border-slate-100" />;
                      const isTeam1 = match.team1Id === rowTeam.teamId;
                      const isCurrent = currentMatchNumber && match.matchNumber === currentMatchNumber;
                      const isFinished = match.status === 'finished';
                      const cellWonAll = isFinished && match.winnerId === rowTeam.teamId;
                      const cellLostAll = isFinished && match.winnerId === colTeam.teamId;

                      return (
                        <td
                          key={colTeam.teamId}
                          className={`p-0 text-center cursor-pointer transition-all border-r border-slate-100 align-middle group ${
                            cellWonAll ? 'bg-gradient-to-br from-blue-50 to-indigo-50/60' :
                            cellLostAll ? 'bg-gradient-to-br from-rose-50/60 to-rose-50/30' :
                            isCurrent ? 'league-match-blink' :
                            'hover:bg-slate-50 active:bg-slate-100'
                          }`}
                          onClick={() => setEditingMatch(match)}
                        >
                          <div className="flex flex-col gap-0.5 px-1.5 py-1.5 ring-inset group-hover:ring-1 group-hover:ring-slate-300/60 rounded-md">
                            {/* 対戦全体の勝敗 (種目勝利数) */}
                            {isFinished && (
                              <div className="flex items-center justify-center text-[12px] tabular-nums font-black leading-none">
                                <span className={cellWonAll ? 'text-blue-700' : cellLostAll ? 'text-rose-500' : 'text-slate-600'}>
                                  {isTeam1 ? match.winsTeam1 : match.winsTeam2}
                                  <span className="text-slate-300 mx-0.5">-</span>
                                  {isTeam1 ? match.winsTeam2 : match.winsTeam1}
                                </span>
                              </div>
                            )}
                            {MATCH_TYPE_ORDER.map(matchType => {
                              const sub = match.subMatches.find(sm => sm.type === matchType);
                              const myScore = isTeam1 ? sub?.score1 : sub?.score2;
                              const oppScore = isTeam1 ? sub?.score2 : sub?.score1;
                              const won = sub?.winnerId === rowTeam.teamId;
                              const hasScore = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;
                              return (
                                <div key={matchType} className="flex items-center justify-center text-[11px] tabular-nums h-3.5">
                                  {hasScore ? (
                                    <span className={`font-black ${won ? 'text-blue-700' : 'text-rose-500'}`}>
                                      {myScore}-{oppScore}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">-</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-black text-sm align-middle bg-slate-50/40">
                      {standing ? (
                        <div className="tabular-nums">
                          {standing.wins}<span className="text-slate-300">-</span>{standing.losses}
                        </div>
                      ) : '-'}
                    </td>
                    {leagueComplete && (
                      <>
                        <td className="px-2 py-1 text-center align-middle bg-slate-50/40">
                          {standing && <RankText rank={standing.rank || 0} />}
                        </td>
                        <td
                          className="px-2 py-1 text-center align-middle bg-slate-50/40 cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => standing && setJudgementTarget(standing)}
                        >
                          {standing?.tiebreakReason ? (
                            <div className="inline-flex items-center gap-0.5 text-[9px] text-slate-600 font-medium">
                              <Info className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[80px]">{standing.tiebreakReason}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {judgementTarget && <TiebreakDetailPopup standing={judgementTarget} onClose={() => setJudgementTarget(null)} />}

      {/* 対戦順 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.10)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-sky-100 flex items-center gap-2 bg-gradient-to-r from-sky-50/80 via-white to-indigo-50/60">
          <ListOrdered className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-bold text-slate-700">対戦順</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
          {selectedLeague.matchOrder.map(mo => {
            const match = leagueMatchList.find(m => m.matchNumber === mo.matchNumber);
            const team1 = selectedLeague.teams[mo.team1Index - 1];
            const team2 = selectedLeague.teams[mo.team2Index - 1];
            if (!match || !team1 || !team2) return null;

            const isFinished = match.status === 'finished';
            const isCurrent = mo.matchNumber === currentMatchNumber;

            return (
              <button
                key={mo.matchNumber}
                onClick={() => setEditingMatch(match)}
                className={`relative p-2.5 rounded-xl border text-xs transition-all active:scale-95 text-left ${
                  isFinished
                    ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                    : isCurrent
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black text-slate-400">#{mo.matchNumber}</span>
                  {isFinished ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black">
                      <Check className="w-2.5 h-2.5" />
                      完了
                    </div>
                  ) : isCurrent ? (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black animate-pulse">
                      <Play className="w-2.5 h-2.5" />
                      対戦中
                    </div>
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className={`truncate ${match.winnerId === team1.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team1.teamName.split(' ')[0]}
                  </div>
                  <div className="text-[9px] text-slate-400 text-center font-bold">
                    {isFinished ? `${match.winsTeam1} - ${match.winsTeam2}` : 'vs'}
                  </div>
                  <div className={`truncate ${match.winnerId === team2.teamId ? 'font-black text-blue-700' : 'text-slate-700'}`}>
                    {team2.teamName.split(' ')[0]}
                  </div>
                </div>

                {/* 種目別スコア（選手名つき） */}
                {(isFinished || isCurrent) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                    {MATCH_TYPE_ORDER.map(mt => {
                      const sub = match.subMatches.find(sm => sm.type === mt);
                      const has = sub && sub.score1 !== null && sub.score2 !== null;
                      const tag = MATCH_TYPE_COLORS[mt];
                      const p1 = sub?.players1?.join('/') || '';
                      const p2 = sub?.players2?.join('/') || '';
                      return (
                        <div key={mt} className="flex items-center gap-1 text-[9px]">
                          <span className={`inline-flex items-center justify-center w-7 h-3 rounded text-[7px] font-black ${tag.bg} ${tag.text}`}>
                            {MATCH_TYPE_SHORT[mt]}
                          </span>
                          {has ? (
                            <span className="flex-1 truncate text-slate-600 tabular-nums">
                              {p1 && <span className="font-bold">{p1} </span>}
                              <span className="font-black">{sub!.score1}-{sub!.score2}</span>
                              {p2 && <span className="font-bold"> {p2}</span>}
                            </span>
                          ) : (
                            <span className="flex-1 text-slate-300">
                              {p1 || p2 ? `${p1} vs ${p2}` : '—'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* スコア入力ダイアログ */}
      {editingMatch && (() => {
        const team1 = selectedLeague.teams.find(t => t.teamId === editingMatch.team1Id);
        const team2 = selectedLeague.teams.find(t => t.teamId === editingMatch.team2Id);
        const familyOf = (n: string) => n.trim().split(/[\s\u3000]+/)[0] || n;
        const t1Roster = Array.from(new Set((team1?.members || []).map(m => familyOf(m.player.name)).filter(Boolean)));
        const t2Roster = Array.from(new Set((team2?.members || []).map(m => familyOf(m.player.name)).filter(Boolean)));
        return (
          <TeamScoreInput
            matchId={editingMatch.matchId}
            team1Id={editingMatch.team1Id}
            team2Id={editingMatch.team2Id}
            team1Name={team1?.teamName || ''}
            team2Name={team2?.teamName || ''}
            subMatches={editingMatch.subMatches}
            team1Roster={t1Roster}
            team2Roster={t2Roster}
            onClose={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
}
