import { useState, useMemo } from 'react';
import { Check, Circle, Play, MapPin, X, Trophy, Info, Settings2, ArrowUp, ArrowDown, HelpCircle, Sparkles, BarChart3, ListOrdered, Layers } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamLeagueMatch, TeamLeagueStanding, TiebreakRuleId, TeamEntry } from './types';
import { calculateTeamStandings, getMatchTypeOrder, MATCH_TYPE_SHORT, TIEBREAK_RULE_LABELS, getDisplayName, familyName, getClubPromotionStatus } from './teamLogic';
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

/** タブドット用ソリッドカラー */
const LEAGUE_SOLID_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e',
  '#f59e0b', '#06b6d4', '#84cc16', '#d946ef',
];

/** チーム名を最大6文字に制限（6文字超は5文字+...） */
function truncTeamName(name: string, max = 6): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

/**
 * プレイヤー名の表示コンポーネント
 * - 空白区切りで苗字のみ抽出
 * - 3文字以下 → そのまま表示
 * - 4文字 → 先頭3文字 + 1文字（小さめ、同姓補助）
 * - 5文字以上 → 先頭3文字のみ表示（フルネーム対策）
 */
function PlayerDisplay({ name }: { name: string }) {
  if (!name) return null;
  const famName = name.trim().split(/[\s\u3000]+/)[0] || name;
  if (famName.length <= 3) {
    return <span>{famName}</span>;
  }
  if (famName.length === 4) {
    return (
      <span className="inline-flex items-baseline">
        <span>{famName.slice(0, 3)}</span>
        <span className="text-[0.6em] opacity-75 ml-px">{famName.slice(3)}</span>
      </span>
    );
  }
  // 5文字以上は苗字＋名前の可能性が高いので先頭3文字のみ
  return <span>{famName.slice(0, 3)}</span>;
}

/** 複数のプレイヤー名をスラッシュ区切りで表示 */
function PlayerListDisplay({ players }: { players: string[] }) {
  if (players.length === 0) return null;
  return (
    <span className="inline-flex items-baseline gap-0.5">
      {players.map((p, i) => (
        <span key={i} className="inline-flex items-baseline">
          {i > 0 && <span className="text-slate-300 mx-[1px]">/</span>}
          <PlayerDisplay name={p} />
        </span>
      ))}
    </span>
  );
}

/**
 * テスト入力用：チームのメンバーを上から順に取り出し、各種目に割り当てる。
 * - ダブルス系種目（MIX/WD/MD/D1/D2/D3）は2名、シングルス（S1/S2）は1名
 * - メンバーが足りない場合は先頭に戻って巡回する
 */
function getTestPlayersForTeam(
  team: TeamEntry | undefined,
  matchTypeOrder: readonly string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const fallback = ['田中', '山本'];
  const names = team && team.members.length > 0
    ? team.members.map(m => familyName(m.player.name || '').trim() || '名無し')
    : fallback;

  let cursor = 0;
  for (const mt of matchTypeOrder) {
    const playerCount = (mt === 'S1' || mt === 'S2') ? 1 : 2;
    const slots: string[] = [];
    for (let i = 0; i < playerCount; i++) {
      slots.push(names[(cursor + i) % names.length]);
    }
    result[mt] = slots;
    cursor += playerCount;
  }
  return result;
}

/** 種目カラー */
const MATCH_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  MIX: { bg: 'bg-violet-100', text: 'text-violet-700' },
  WD:  { bg: 'bg-pink-100',   text: 'text-pink-700' },
  MD:  { bg: 'bg-sky-100',    text: 'text-sky-700' },
  D3:  { bg: 'bg-blue-100',   text: 'text-blue-700' },
  D2:  { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  D1:  { bg: 'bg-teal-100',   text: 'text-teal-700' },
  S2:  { bg: 'bg-amber-100',  text: 'text-amber-700' },
  S1:  { bg: 'bg-red-100',    text: 'text-red-700' },
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
/**
 * 勝率詳細ポップアップ：勝率の計算式・分母分子・参考統計（取得ポイント / ゲーム率）を提示。
 * クラブ対抗戦の特別ルール「勝率 → 取得ポイント → ゲーム率 → 直接対決」が分かるように
 * 並べる。
 */
function WinRateDetailPopup({ standing, onClose }: { standing: TeamLeagueStanding; onClose: () => void }) {
  const totalMatches = standing.wins + standing.losses;
  const winRate = totalMatches === 0 ? 0 : standing.wins / totalMatches;
  const totalGames = standing.gamesWon + standing.gamesLost;
  const gameRatio = totalGames === 0 ? 0 : standing.gamesWon / totalGames;
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-5 py-3 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] opacity-80 font-bold uppercase tracking-wider">勝率の計算</div>
            <div className="text-base font-black">{standing.teamName}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* 勝率本体 */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 text-center">
            <div className="text-[10px] text-indigo-600 font-bold tracking-wider mb-1">勝率</div>
            <div className="text-4xl font-black text-indigo-700 tabular-nums">{winRate.toFixed(3)}</div>
            <div className="mt-2 text-[11px] text-slate-600 font-medium tabular-nums">
              = 勝利した対戦チーム数 <span className="text-indigo-700 font-black">{standing.wins}</span>
              <span className="mx-1 text-slate-400">÷</span>
              総対戦チーム数 <span className="text-indigo-700 font-black">{totalMatches}</span>
            </div>
          </div>

          {/* 参考統計 */}
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
              <div className="text-[10px] text-slate-400 font-bold">取得ゲーム率</div>
              <div className="text-base font-black tabular-nums">{gameRatio.toFixed(3)}</div>
            </div>
          </div>

          {/* クラブ対抗戦の順位決定方法（明示） */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">クラブ対抗戦 順位決定方法</div>
            <ol className="space-y-1 text-[11px] text-slate-700 leading-snug">
              <li><span className="font-black text-indigo-700">①</span> 勝率（勝利した対戦チーム数 ÷ 総対戦チーム数）の高いチームを上位</li>
              <li><span className="font-black text-indigo-700">②</span> 同率の場合、取得ポイント（対戦内勝利数）の多いチームを上位</li>
              <li><span className="font-black text-indigo-700">③</span> 同率の場合、取得ゲーム率の高いチームを上位</li>
              <li><span className="font-black text-indigo-700">④</span> 同率の場合、直接対決の勝者を上位</li>
            </ol>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
  const [judgementTarget, setJudgementTarget] = useState<TeamLeagueStanding | null>(null);
  const [winRateTarget, setWinRateTarget] = useState<TeamLeagueStanding | null>(null);
  const [showAll, setShowAll] = useState(false);

  // 試合形式に応じた種目順（クラブ対抗戦は D3,D2,D1,S2,S1。それ以外は MIX,WD,MD）
  const matchTypeOrder = useMemo(
    () => getMatchTypeOrder(tournamentInfo?.matchFormat),
    [tournamentInfo?.matchFormat],
  );

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
    <div className="space-y-4 pb-20">
      {/* Chrome風リーグ選択タブ（リッチカラー文字） */}
      <div className="sticky top-0 z-20 -mx-2 px-2">
        <div className="chrome-tab-bar">
          {/* 全体表示タブ（左端） */}
          {(() => {
            const allLeaguesComplete = leagues.every(l => {
              const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
              return lm.length > 0 && lm.every(m => m.status === 'finished');
            });
            return (
              <button
                onClick={() => setShowAll(true)}
                className={`chrome-tab ${showAll ? 'chrome-tab-active' : ''}`}
              >
                <Layers className="chrome-tab-icon" stroke="url(#rainbow-grad)" />
                <span className="chrome-tab-label chrome-tab-label-rainbow">ALL</span>
                {allLeaguesComplete && (
                  <Check className="w-3 h-3 text-emerald-600" strokeWidth={3} />
                )}
              </button>
            );
          })()}
          {leagues.map((l, i) => {
            const lm = leagueMatches.filter(m => m.leagueId === l.leagueId);
            const done = lm.filter(m => m.status === 'finished').length;
            const total = lm.length;
            const complete = done === total && total > 0;
            const isSelected = !showAll && l.leagueId === selectedLeague.leagueId;
            const solidColor = LEAGUE_SOLID_COLORS[i % LEAGUE_SOLID_COLORS.length];
            return (
              <button
                key={l.leagueId}
                onClick={() => { setShowAll(false); setSelectedLeagueId(l.leagueId); }}
                className={`chrome-tab ${isSelected ? 'chrome-tab-active' : ''}`}
              >
                <span
                  className={`chrome-tab-label ${complete ? 'chrome-tab-label-done' : ''}`}
                  style={{ color: solidColor }}
                >
                  {l.leagueId}
                </span>
                <span
                  className={`chrome-tab-progress ${complete ? 'chrome-tab-progress-done' : ''}`}
                  style={{ color: solidColor }}
                >
                  {done}/{total}
                </span>
                {complete && (
                  <Check className="w-3 h-3" strokeWidth={3} style={{ color: solidColor }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======= 全体表示モード ======= */}
      {showAll && (
        <div className="space-y-4">
          {/* 判定ルール設定（全体表示でも表示） */}
          <TiebreakRuleSettings />
          {leagues.map((league, li) => {
            const c = getColor(li);
            const lm = leagueMatches.filter(m => m.leagueId === league.leagueId);
            const done = lm.filter(m => m.status === 'finished').length;
            const total = lm.length;
            const complete = done === total && total > 0;
            const leagueStandings = allStandings.get(league.leagueId) || [];

            // スコアマトリクス
            const sm = new Map<string, TeamLeagueMatch>();
            for (const m of lm) {
              sm.set(`${m.team1Id}-${m.team2Id}`, m);
              sm.set(`${m.team2Id}-${m.team1Id}`, m);
            }

            return (
              <div key={league.leagueId} className="bg-white rounded-xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden lg:max-w-5xl lg:mx-auto">
                {/* コンパクトヘッダー */}
                <div className={`flex items-center justify-between gap-2 px-3 py-1.5 bg-gradient-to-r ${c.grad} text-white`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black leading-none">{league.leagueId}</span>
                    <span className="text-[10px] font-bold opacity-80">リーグ</span>
                    {league.courtName && (
                      <span className="text-[10px] opacity-70 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{league.courtName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {complete && (
                      <TeamLeagueResultPreview
                        league={league}
                        standings={leagueStandings}
                        matches={lm}
                        allTeams={allTeams}
                        tournamentName={tournamentInfo?.name || ''}
                      />
                    )}
                    <span className="text-xs font-black tabular-nums">{done}/{total}</span>
                    {complete && <Check className="w-3 h-3" />}
                  </div>
                </div>
                {/* 成績表 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse lg:text-sm">
                    <thead>
                      <tr className={`bg-gradient-to-r ${c.grad} text-white`}>
                        <th className="px-1 py-2 lg:px-2 lg:py-3 text-center w-[28px] lg:w-[36px] font-bold text-white/80 border-b border-white/20 text-[10px] lg:text-[11px]">No.</th>
                        <th className="px-2 py-2 lg:px-4 lg:py-3 text-left min-w-[100px] font-bold text-white/90 border-b border-white/20 whitespace-nowrap text-[11px] lg:text-xs">チーム</th>
                        <th className="px-1 py-2 lg:px-2 lg:py-3 text-center w-[34px] lg:w-[42px] font-bold text-white/90 border-b border-white/20 text-[11px] lg:text-xs">種目</th>
                        {league.teams.map(t => (
                          <th key={t.teamId} className="px-1 py-2 lg:px-2 lg:py-3 text-center w-[76px] min-w-[76px] max-w-[76px] lg:w-auto lg:min-w-[140px] border-b border-white/20">
                            <span className="inline-block w-full px-1 py-0.5 lg:px-2 lg:py-1 rounded-full bg-white/20 text-[10px] lg:text-[11px] font-black text-white truncate" title={t.teamName}>
                              <span className="lg:hidden">{truncTeamName(t.teamName)}</span>
                              <span className="hidden lg:inline">{truncTeamName(t.teamName, 12)}</span>
                            </span>
                          </th>
                        ))}
                        <th className="px-2 py-2 lg:px-3 lg:py-3 text-center min-w-[50px] font-bold text-white/90 border-b border-l border-white/20 whitespace-nowrap text-[11px] lg:text-xs">成績</th>
                        {complete && (
                          <th className="px-2 py-2 lg:px-3 lg:py-3 text-center min-w-[44px] font-bold text-white/90 border-b border-l border-white/20 whitespace-nowrap text-[11px] lg:text-xs">順位</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {league.teams.map((rowTeam, rowIdx) => {
                        const standing = leagueStandings.find(s => s.teamId === rowTeam.teamId);
                        return (
                          <tr key={rowTeam.teamId} className={`border-t ${c.border} ${rowIdx % 2 === 0 ? 'bg-white' : c.bg + '/30'}`}>
                            <td className={`px-1 py-1 lg:px-2 lg:py-2.5 text-center align-middle border-r ${c.border} ${c.bg}/10 text-[9px] lg:text-[10px] font-bold text-slate-400 tabular-nums`}>
                              {rowTeam.teamNumber}
                            </td>
                            <td className={`px-2 py-1 lg:px-4 lg:py-2.5 font-bold text-xs lg:text-sm align-middle border-r ${c.border} whitespace-nowrap ${c.bg}/20 relative`}>
                              <div className="truncate max-w-[180px]">{rowTeam.teamName}</div>
                              {complete && standing && (() => {
                                const promo = getClubPromotionStatus(league.leagueId, standing.rank);
                                if (!promo) return null;
                                const cls = promo.kind === 'champion'
                                  ? 'bg-amber-500 text-white'
                                  : promo.kind === 'promote'
                                  ? 'bg-emerald-600 text-white'
                                  : promo.kind === 'relegate'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-400 text-white';
                                return (
                                  <span className={`absolute bottom-0 right-1 inline-flex items-center justify-center px-1 py-0.5 rounded text-[8px] lg:text-[9px] font-black tracking-wider shadow-sm ${cls}`}>
                                    {promo.label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className={`px-0.5 py-1 lg:px-1 lg:py-2.5 align-middle border-r ${c.border} ${c.bg}/20`}>
                              <div className="flex flex-col gap-0.5 lg:gap-1 items-center">
                                {matchTypeOrder.map(mt => {
                                  const tag = MATCH_TYPE_COLORS[mt];
                                  return (
                                    <span key={mt} className={`inline-flex items-center justify-center w-7 h-3.5 lg:w-8 lg:h-4 rounded text-[8px] lg:text-[9px] font-black tracking-wider ${tag.bg} ${tag.text}`}>
                                      {MATCH_TYPE_SHORT[mt]}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            {league.teams.map(colTeam => {
                              if (rowTeam.teamId === colTeam.teamId) {
                                return (
                                <td key={colTeam.teamId} className="border-r border-slate-100 relative" style={{ background: 'linear-gradient(to bottom left, #f8fafc 49.5%, #cbd5e1 49.5%, #cbd5e1 50.5%, #f1f5f9 50.5%)' }} />
                              );
                              }
                              const match = sm.get(`${rowTeam.teamId}-${colTeam.teamId}`);
                              if (!match) return <td key={colTeam.teamId} className="border-r border-slate-100" />;
                              const isTeam1 = match.team1Id === rowTeam.teamId;
                              const isFinished = match.status === 'finished';
                              const cellWonAll = isFinished && match.winnerId === rowTeam.teamId;
                              const cellLostAll = isFinished && match.winnerId === colTeam.teamId;
                              return (
                                <td
                                  key={colTeam.teamId}
                                  className={`p-0 text-center cursor-pointer transition-all border-r border-slate-100 align-middle ${
                                    cellWonAll ? 'bg-blue-50/80' : cellLostAll ? 'bg-rose-50/60' : 'hover:bg-slate-50'
                                  }`}
                                  onClick={() => setEditingMatch(match)}
                                >
                                  <div className="flex flex-col gap-0.5 px-1 py-1 lg:px-2 lg:py-1.5">
                                    {isFinished && (
                                      <div className={`text-[11px] lg:text-xs tabular-nums font-black leading-none text-center ${cellWonAll ? 'text-blue-700' : cellLostAll ? 'text-rose-500' : 'text-slate-600'}`}>
                                        {isTeam1 ? match.winsTeam1 : match.winsTeam2}
                                        <span className="text-slate-300 mx-0.5">-</span>
                                        {isTeam1 ? match.winsTeam2 : match.winsTeam1}
                                      </div>
                                    )}
                                    {matchTypeOrder.map(matchType => {
                                      const sub = match.subMatches.find(s => s.type === matchType);
                                      const myScore = isTeam1 ? sub?.score1 : sub?.score2;
                                      const oppScore = isTeam1 ? sub?.score2 : sub?.score1;
                                      const won = sub?.winnerId === rowTeam.teamId;
                                      const isTerminated = !!sub?.terminated;
                                      const hasScore = myScore != null && oppScore != null;
                                      const myPlayers = (isTeam1 ? sub?.players1 : sub?.players2) || [];
                                      const oppPlayers = (isTeam1 ? sub?.players2 : sub?.players1) || [];
                                      return (
                                        <div
                                          key={matchType}
                                          className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[10px] lg:text-[11px] tabular-nums h-3.5 lg:h-5 leading-[14px]"
                                        >
                                          {hasScore || isTerminated ? (<>
                                            <span className="col-start-1 hidden lg:flex justify-end items-baseline text-[10px] text-slate-500 font-medium overflow-hidden whitespace-nowrap">
                                              <PlayerListDisplay players={myPlayers} />
                                            </span>
                                            <span className={`col-start-2 font-black whitespace-nowrap text-center ${
                                              isTerminated ? 'text-slate-400 line-through decoration-rose-400' :
                                              won ? 'text-blue-700' : 'text-rose-500'
                                            }`}>
                                              {hasScore ? `${myScore}-${oppScore}` : '打'}
                                              {isTerminated && hasScore && (
                                                <span className="ml-0.5 text-[8px] text-rose-500 no-underline align-top font-black">打</span>
                                              )}
                                            </span>
                                            <span className="col-start-3 hidden lg:flex justify-start items-baseline text-[10px] text-slate-500 font-medium overflow-hidden whitespace-nowrap">
                                              <PlayerListDisplay players={oppPlayers} />
                                            </span>
                                          </>) : (
                                            <span className="col-start-2 text-center text-slate-300 font-bold">-</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                            <td className={`px-1.5 py-1 lg:px-3 lg:py-2.5 text-center font-black text-sm lg:text-base align-middle ${c.bg}/20 tabular-nums border-l ${c.border}`}>
                              {standing ? <><span className={c.text}>{standing.wins}</span><span className="text-slate-300">-</span><span className="text-slate-400">{standing.losses}</span></> : '-'}
                            </td>
                            {complete && (
                              <td className={`px-1.5 py-1 lg:px-3 lg:py-2.5 text-center align-middle ${c.bg}/20 border-l ${c.border}`}>
                                {standing && <RankText rank={standing.rank || 0} />}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======= 個別リーグ表示モード ======= */}
      {!showAll && <>

      {/* 判定ルール設定 */}
      {/* 判定ルール設定 */}
      <TiebreakRuleSettings />

      {/* テスト入力ボタン */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            if (!confirm(`${selectedLeague.leagueId}リーグの全試合を、各チームのメンバーを使って 6-4 で埋めます。よろしいですか？`)) return;
            for (const m of leagueMatchList) {
              const t1 = allTeams.find(t => t.teamId === m.team1Id);
              const t2 = allTeams.find(t => t.teamId === m.team2Id);
              const p1 = getTestPlayersForTeam(t1, matchTypeOrder);
              const p2 = getTestPlayersForTeam(t2, matchTypeOrder);
              for (const mt of matchTypeOrder) {
                updateSubMatchScore(m.matchId, mt, 6, 4, null);
                updateSubMatchPlayers(m.matchId, mt, p1[mt], p2[mt]);
              }
            }
          }}
          className="flex items-center justify-center py-2.5 rounded-xl text-xs font-black tracking-wider bg-gradient-to-b from-amber-50 to-amber-100/60 text-amber-700 border border-amber-200/80 shadow-sm hover:shadow hover:border-amber-300 active:scale-95 transition-all"
        >
          TEST
        </button>
        <button
          onClick={() => {
            if (!confirm(`全リーグ（${leagues.length}ブロック）の全試合を、各チームのメンバーを使って 6-4 で埋めます。よろしいですか？`)) return;
            for (const m of leagueMatches) {
              const t1 = allTeams.find(t => t.teamId === m.team1Id);
              const t2 = allTeams.find(t => t.teamId === m.team2Id);
              const p1 = getTestPlayersForTeam(t1, matchTypeOrder);
              const p2 = getTestPlayersForTeam(t2, matchTypeOrder);
              for (const mt of matchTypeOrder) {
                updateSubMatchScore(m.matchId, mt, 6, 4, null);
                updateSubMatchPlayers(m.matchId, mt, p1[mt], p2[mt]);
              }
            }
          }}
          className="flex items-center justify-center py-2.5 rounded-xl text-xs font-black tracking-wider bg-gradient-to-b from-orange-50 to-orange-100/60 text-orange-700 border border-orange-200/80 shadow-sm hover:shadow hover:border-orange-300 active:scale-95 transition-all"
        >
          TEST（ALL）
        </button>
      </div>

      {/* 成績表 */}
      {(() => {
        const hasTiebreak = leagueComplete && standings.some(s => s.tiebreakReason);
        return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.10)] overflow-hidden lg:max-w-5xl lg:mx-auto">
        {/* コンパクトヘッダー */}
        <div className={`flex items-center justify-between gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-gradient-to-r ${color.grad} text-white`}>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black leading-none">{selectedLeague.leagueId}</span>
            <span className="text-[10px] font-bold opacity-80">リーグ</span>
            {selectedLeague.courtName && (
              <span className="text-[10px] opacity-70 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{selectedLeague.courtName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {leagueComplete && (
              <TeamLeagueResultPreview
                league={selectedLeague}
                standings={standings}
                matches={leagueMatchList}
                allTeams={allTeams}
                tournamentName={tournamentInfo?.name || ''}
              />
            )}
            <span className="text-xs font-black tabular-nums">{finishedCount}/{totalCount}</span>
            {leagueComplete && <Check className="w-3 h-3" />}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse lg:text-sm">
            <thead>
              <tr className={`bg-gradient-to-b ${color.bg} to-white`}>
                <th className={`px-1 py-2.5 lg:px-2 lg:py-3 text-center w-[28px] lg:w-[36px] font-bold ${color.text} border-b ${color.border} text-[10px] lg:text-[11px]`}>No.</th>
                <th className={`px-2 py-2.5 lg:px-4 lg:py-3 text-left min-w-[100px] font-bold ${color.text} border-b ${color.border} whitespace-nowrap text-[11px] lg:text-xs tracking-wide`}>チーム</th>
                <th className={`px-1 py-2.5 lg:px-2 lg:py-3 text-center w-[34px] lg:w-[42px] font-bold ${color.text} border-b ${color.border} text-[11px] lg:text-xs tracking-wide`}>種目</th>
                {selectedLeague.teams.map(t => (
                  <th key={t.teamId} className={`px-1 py-2.5 lg:px-2 lg:py-3 text-center w-[76px] min-w-[76px] max-w-[76px] lg:w-auto lg:min-w-[140px] border-b ${color.border}`}>
                    <span className={`inline-block w-full px-1 py-0.5 lg:px-2 lg:py-1 rounded-full text-[10px] lg:text-[11px] font-black ${color.soft} ${color.text} truncate`} title={t.teamName}>
                      <span className="lg:hidden">{truncTeamName(t.teamName)}</span>
                      <span className="hidden lg:inline">{truncTeamName(t.teamName, 12)}</span>
                    </span>
                  </th>
                ))}
                <th className={`px-2 py-2.5 lg:px-3 lg:py-3 text-center min-w-[58px] font-bold ${color.text} border-b border-l ${color.border} whitespace-nowrap text-[11px] lg:text-xs`}>成績</th>
                <th className={`px-2 py-2.5 lg:px-3 lg:py-3 text-center min-w-[60px] font-bold ${color.text} border-b border-l ${color.border} whitespace-nowrap text-[11px] lg:text-xs`}>勝率</th>
                {leagueComplete && (
                  <th className={`px-2 py-2.5 lg:px-3 lg:py-3 text-center min-w-[52px] font-bold ${color.text} border-b border-l ${color.border} text-[11px] lg:text-xs`}>順位</th>
                )}
                {hasTiebreak && (
                  <th className={`px-2 py-2.5 lg:px-3 lg:py-3 text-center min-w-[80px] font-bold ${color.text} border-b border-l ${color.border} text-[11px] lg:text-xs`}>判定</th>
                )}
              </tr>
            </thead>
            <tbody>
              {selectedLeague.teams.map((rowTeam, rowIdx) => {
                const standing = standings.find(s => s.teamId === rowTeam.teamId);
                return (
                  <tr key={rowTeam.teamId} className={`border-t ${color.border} ${rowIdx % 2 === 0 ? 'bg-white' : color.bg + '/30'} hover:bg-slate-50/80 transition-colors`}>
                    <td className={`px-1 py-1.5 lg:px-2 lg:py-2.5 text-center align-middle border-r ${color.border} ${color.bg}/10 text-[9px] lg:text-[10px] font-bold text-slate-400 tabular-nums`}>
                      {rowTeam.teamNumber}
                    </td>
                    <td className={`px-2 py-1.5 lg:px-4 lg:py-2.5 font-bold text-xs lg:text-sm align-middle border-r ${color.border} whitespace-nowrap ${color.bg}/20 relative`}>
                      <div className="truncate max-w-[180px] text-slate-800" title={rowTeam.teamName}>{rowTeam.teamName}</div>
                      {/* 昇降格バッジ（クラブ対抗戦のみ、リーグ確定後に表示） */}
                      {leagueComplete && standing && (() => {
                        const promo = getClubPromotionStatus(selectedLeague.leagueId, standing.rank);
                        if (!promo) return null;
                        const cls = promo.kind === 'champion'
                          ? 'bg-amber-500 text-white'
                          : promo.kind === 'promote'
                          ? 'bg-emerald-600 text-white'
                          : promo.kind === 'relegate'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-400 text-white';
                        return (
                          <span className={`absolute bottom-0 right-1 lg:right-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] lg:text-[10px] font-black tracking-wider shadow-sm ${cls}`}>
                            {promo.label}
                          </span>
                        );
                      })()}
                    </td>
                    {/* 種目ラベル列 */}
                    <td className={`px-0.5 py-1.5 lg:px-1 lg:py-2.5 align-middle border-r ${color.border} ${color.bg}/20`}>
                      <div className="flex flex-col gap-0.5 lg:gap-1 items-center">
                        {matchTypeOrder.map(mt => {
                          const tag = MATCH_TYPE_COLORS[mt];
                          return (
                            <span key={mt} className={`inline-flex items-center justify-center w-7 h-3.5 lg:w-8 lg:h-4 rounded text-[8px] lg:text-[9px] font-black tracking-wider ${tag.bg} ${tag.text}`}>
                              {MATCH_TYPE_SHORT[mt]}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {selectedLeague.teams.map(colTeam => {
                      if (rowTeam.teamId === colTeam.teamId) {
                        return (
                                <td key={colTeam.teamId} className="border-r border-slate-100 relative" style={{ background: 'linear-gradient(to bottom left, #f8fafc 49.5%, #cbd5e1 49.5%, #cbd5e1 50.5%, #f1f5f9 50.5%)' }} />
                              );
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
                          className={`p-0 text-center cursor-pointer transition-all border-r border-slate-100 align-top group ${
                            cellWonAll ? 'bg-gradient-to-b from-blue-50/80 to-indigo-50/40' :
                            cellLostAll ? 'bg-gradient-to-b from-rose-50/50 to-white' :
                            isCurrent ? 'league-match-blink' :
                            'hover:bg-slate-50 active:bg-slate-100'
                          }`}
                          onClick={() => setEditingMatch(match)}
                        >
                          <div className="flex flex-col px-1 py-1 lg:px-2 lg:py-1.5 ring-inset group-hover:ring-1 group-hover:ring-slate-300/60 rounded-md min-w-[68px]">
                            {/* 対戦全体の勝敗バッジ */}
                            {isFinished && (
                              <div className={`mx-auto mb-0.5 lg:mb-1 px-2.5 py-0.5 lg:px-3 lg:py-1 rounded-full text-[11px] lg:text-xs tabular-nums font-black leading-none ${
                                cellWonAll
                                  ? 'bg-blue-600 text-white'
                                  : cellLostAll
                                  ? 'bg-rose-100 text-rose-400 border border-rose-200'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isTeam1 ? match.winsTeam1 : match.winsTeam2}
                                <span className={cellWonAll ? 'text-blue-200 mx-0.5' : 'text-slate-300 mx-0.5'}>-</span>
                                {isTeam1 ? match.winsTeam2 : match.winsTeam1}
                              </div>
                            )}
                            {/* 種目別スコア + PC:選手名 */}
                            {matchTypeOrder.map(matchType => {
                              const sub = match.subMatches.find(sm => sm.type === matchType);
                              const myScore = isTeam1 ? sub?.score1 : sub?.score2;
                              const oppScore = isTeam1 ? sub?.score2 : sub?.score1;
                              const won = sub?.winnerId === rowTeam.teamId;
                              const hasScore = myScore != null && oppScore != null;
                              const myPlayers = (isTeam1 ? sub?.players1 : sub?.players2) || [];
                              const oppPlayers = (isTeam1 ? sub?.players2 : sub?.players1) || [];
                              return (
                                <div
                                  key={matchType}
                                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[10px] lg:text-[11px] tabular-nums h-4 lg:h-5 leading-none"
                                >
                                  {hasScore ? (<>
                                    <span className="col-start-1 hidden lg:flex justify-end items-baseline text-[10px] text-slate-500 font-medium overflow-hidden whitespace-nowrap">
                                      <PlayerListDisplay players={myPlayers} />
                                    </span>
                                    <span className={`col-start-2 font-black whitespace-nowrap text-center ${won ? 'text-blue-700' : 'text-rose-400'}`}>
                                      {myScore}-{oppScore}
                                    </span>
                                    <span className="col-start-3 hidden lg:flex justify-start items-baseline text-[10px] text-slate-500 font-medium overflow-hidden whitespace-nowrap">
                                      <PlayerListDisplay players={oppPlayers} />
                                    </span>
                                  </>) : (
                                    <span className="col-start-2 text-center text-slate-300 font-bold">-</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                    <td className={`px-2 py-1 lg:px-3 lg:py-2.5 text-center font-black text-sm lg:text-base align-middle ${color.bg}/30 border-l ${color.border}`}>
                      {standing ? (
                        <div className="tabular-nums">
                          <span className={color.text}>{standing.wins}</span><span className="text-slate-300">-</span><span className="text-slate-400">{standing.losses}</span>
                        </div>
                      ) : '-'}
                    </td>
                    {/* 勝率列：クリックで詳細ポップアップ */}
                    <td
                      className={`px-2 py-1 lg:px-3 lg:py-2.5 text-center align-middle ${color.bg}/30 border-l ${color.border} cursor-pointer hover:bg-slate-100/60 transition-colors`}
                      onClick={() => standing && setWinRateTarget(standing)}
                    >
                      {standing ? (() => {
                        const total = standing.wins + standing.losses;
                        const rate = total === 0 ? 0 : standing.wins / total;
                        return (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="text-xs lg:text-sm font-black text-slate-800 tabular-nums">{rate.toFixed(3)}</span>
                            <Info className="w-2.5 h-2.5 text-slate-400" />
                          </div>
                        );
                      })() : '-'}
                    </td>
                    {leagueComplete && (
                      <td className={`px-2 py-1 lg:px-3 lg:py-2.5 text-center align-middle ${color.bg}/30 border-l ${color.border}`}>
                        {standing && <RankText rank={standing.rank || 0} />}
                      </td>
                    )}
                    {hasTiebreak && (
                      <td
                        className={`px-2 py-1 lg:px-3 lg:py-2.5 text-center align-middle ${color.bg}/30 border-l ${color.border} cursor-pointer hover:${color.bg} transition-colors`}
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
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        );
      })()}

      {judgementTarget && <TiebreakDetailPopup standing={judgementTarget} onClose={() => setJudgementTarget(null)} />}
      {winRateTarget && <WinRateDetailPopup standing={winRateTarget} onClose={() => setWinRateTarget(null)} />}

      {/* 対戦順 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.10)] overflow-hidden lg:max-w-5xl lg:mx-auto">
        <div className={`px-4 py-2.5 lg:py-3 border-b flex items-center gap-2 bg-gradient-to-r ${color.grad} text-white`}>
          <ListOrdered className="w-4 h-4 text-white/80" />
          <span className="text-sm font-bold tracking-wide">対戦順</span>
        </div>
        <div className="divide-y divide-slate-100">
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
                className={`w-full flex items-center gap-2 lg:gap-3 px-3 py-2 lg:px-4 lg:py-2.5 text-left transition-colors ${
                  isFinished
                    ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                    : isCurrent
                    ? 'bg-blue-50/60 hover:bg-blue-50'
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* # */}
                <span className="text-[10px] lg:text-[11px] font-black text-slate-400 w-5 lg:w-6 text-center shrink-0">#{mo.matchNumber}</span>

                {/* チーム1 */}
                <div className={`flex-1 min-w-0 text-xs lg:text-sm font-bold truncate ${match.winnerId === team1.teamId ? 'text-blue-700 font-black' : 'text-slate-800'}`}>
                  {team1.teamName}
                </div>

                {/* スコア / vs */}
                <div className="shrink-0 text-center w-12 lg:w-14">
                  {isFinished ? (
                    <span className="text-sm lg:text-base font-black tabular-nums">
                      <span className={match.winnerId === team1.teamId ? 'text-blue-600' : 'text-slate-400'}>{match.winsTeam1}</span>
                      <span className="text-slate-300 mx-0.5">-</span>
                      <span className={match.winnerId === team2.teamId ? 'text-blue-600' : 'text-slate-400'}>{match.winsTeam2}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold">vs</span>
                  )}
                </div>

                {/* チーム2 */}
                <div className={`flex-1 min-w-0 text-xs lg:text-sm font-bold truncate text-right ${match.winnerId === team2.teamId ? 'text-blue-700 font-black' : 'text-slate-800'}`}>
                  {team2.teamName}
                </div>

                {/* ステータス */}
                <div className="shrink-0 w-10 lg:w-12 flex justify-end">
                  {isFinished ? (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] lg:text-[9px] font-black">
                      <Check className="w-2.5 h-2.5" />完了
                    </span>
                  ) : isCurrent ? (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[8px] lg:text-[9px] font-black animate-pulse">
                      <Play className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      </>}

      {/* スコア入力ダイアログ */}
      {editingMatch && (() => {
        // 全体表示モードでは全リーグからチームを検索
        const allLeagueTeams = leagues.flatMap(l => l.teams);
        const team1 = allLeagueTeams.find(t => t.teamId === editingMatch.team1Id);
        const team2 = allLeagueTeams.find(t => t.teamId === editingMatch.team2Id);
        const t1Members = team1?.members || [];
        const t2Members = team2?.members || [];
        // 既存メンバー由来の roster
        const t1FromMembers = t1Members.map(m => getDisplayName(m.player, t1Members)).filter(Boolean);
        const t2FromMembers = t2Members.map(m => getDisplayName(m.player, t2Members)).filter(Boolean);
        // 同チームが過去に出場した試合の選手名を収集（手動入力した名前も含む）
        const collectPastNames = (teamId: string): string[] => {
          const set = new Set<string>();
          for (const m of leagueMatches) {
            if (m.team1Id !== teamId && m.team2Id !== teamId) continue;
            const isT1 = m.team1Id === teamId;
            for (const sm of m.subMatches) {
              const ps = isT1 ? sm.players1 : sm.players2;
              if (!ps) continue;
              for (const p of ps) {
                const v = (p || '').trim();
                if (v) set.add(v);
              }
            }
          }
          return Array.from(set);
        };
        const t1Past = collectPastNames(editingMatch.team1Id);
        const t2Past = collectPastNames(editingMatch.team2Id);
        // メンバー名と過去使用名をマージ（重複除去・登録順を優先）
        const t1Roster = Array.from(new Set([...t1FromMembers, ...t1Past]));
        const t2Roster = Array.from(new Set([...t2FromMembers, ...t2Past]));
        // 試合形式から1セット獲得に必要なゲーム数を解決（gameRules を team 数で参照）
        const editingLeague = leagues.find(l => l.leagueId === editingMatch.leagueId);
        const teamCount = editingLeague?.teams.length ?? 4;
        const ruleStr = tournamentInfo?.gameRules?.[teamCount] ?? '';
        const winGames = (() => {
          const m = ruleStr.match(/(\d+)\s*ゲーム/);
          const n = m ? parseInt(m[1], 10) : NaN;
          return Number.isFinite(n) && n > 0 ? n : 6;
        })();
        return (
          <TeamScoreInput
            matchId={editingMatch.matchId}
            team1Id={editingMatch.team1Id}
            team2Id={editingMatch.team2Id}
            team1Name={team1?.teamName || ''}
            team2Name={team2?.teamName || ''}
            subMatches={editingMatch.subMatches}
            team1Roster={t1Roster}
            team1Members={t1Members}
            team2Members={t2Members}
            team2Roster={t2Roster}
            winGames={winGames}
            onClose={() => setEditingMatch(null)}
          />
        );
      })()}
    </div>
  );
}
