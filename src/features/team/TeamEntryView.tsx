import { Check, X, Users, Sparkles, RotateCcw, UserCircle2 } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamEntry, TeamLeague } from './types';

/** リーグカラーパレット */
const LEAGUE_COLORS = [
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'ring-emerald-500/20' },
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', ring: 'ring-blue-500/20' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', ring: 'ring-purple-500/20' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', ring: 'ring-rose-500/20' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'ring-amber-500/20' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', ring: 'ring-cyan-500/20' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', ring: 'ring-lime-500/20' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', ring: 'ring-fuchsia-500/20' },
];

const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];

/** チームカード */
function TeamCard({
  team,
  colorIndex,
  onSetStatus,
}: {
  team: TeamEntry;
  colorIndex: number;
  onSetStatus: (teamId: string, status: TeamEntry['status']) => void;
}) {
  const color = getColor(colorIndex);
  const femaleMembers = team.members.filter(m => m.gender === 'F');
  const maleMembers = team.members.filter(m => m.gender === 'M');

  const statusStyles =
    team.status === 'entry'
      ? 'bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-500/10'
      : team.status === 'def'
      ? 'bg-slate-50/50 border-slate-200 opacity-60'
      : 'bg-white border-slate-200';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${statusStyles}`}>
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
        <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${color.grad} text-white font-black text-sm shrink-0 shadow-sm`}>
          {CIRCLE_NUMS[team.teamNumber - 1] || team.teamNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm truncate">{team.teamName}</div>
          <div className="text-[10px] text-slate-400 font-medium">{team.leagueId}リーグ #{team.numberInLeague}</div>
        </div>
        {team.status === 'entry' && (
          <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
            <Check className="w-3 h-3" />
            Entry
          </div>
        )}
        {team.status === 'def' && (
          <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
            <X className="w-3 h-3" />
            DEF
          </div>
        )}
      </div>

      {/* メンバー */}
      <div className="px-3 py-2 space-y-1.5">
        {femaleMembers.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-[9px] font-black text-pink-600 bg-pink-50 border border-pink-100 px-1.5 py-0.5 rounded-md shrink-0">F</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
              {femaleMembers.map((m, i) => (
                <span key={i} className="text-xs text-slate-700">{m.player.name}</span>
              ))}
            </div>
          </div>
        )}
        {maleMembers.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-[9px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md shrink-0">M</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
              {maleMembers.map((m, i) => (
                <span key={i} className="text-xs text-slate-700">{m.player.name}</span>
              ))}
            </div>
          </div>
        )}
        {team.members.length === 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-400 italic">
            <UserCircle2 className="w-3 h-3" />
            メンバー未登録
          </div>
        )}
      </div>

      {/* ステータス切替 */}
      <div className="grid grid-cols-3 gap-0 border-t border-slate-100">
        <button
          onClick={() => onSetStatus(team.teamId, 'none')}
          className={`py-2 text-[11px] font-bold transition-colors ${
            team.status === 'none'
              ? 'bg-slate-100 text-slate-700'
              : 'bg-white text-slate-300 hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          未設定
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'entry')}
          className={`py-2 text-[11px] font-bold border-x border-slate-100 transition-colors flex items-center justify-center gap-0.5 ${
            team.status === 'entry'
              ? 'bg-emerald-500 text-white'
              : 'bg-white text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 active:bg-emerald-100'
          }`}
        >
          <Check className="w-3 h-3" />
          Entry
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'def')}
          className={`py-2 text-[11px] font-bold transition-colors flex items-center justify-center gap-0.5 ${
            team.status === 'def'
              ? 'bg-red-500 text-white'
              : 'bg-white text-slate-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100'
          }`}
        >
          <X className="w-3 h-3" />
          DEF
        </button>
      </div>
    </div>
  );
}

/** リーグセクション */
function LeagueSection({
  league,
  leagueIndex,
  onSetTeamStatus,
  onSetLeagueAll,
}: {
  league: TeamLeague;
  leagueIndex: number;
  onSetTeamStatus: (teamId: string, status: TeamEntry['status']) => void;
  onSetLeagueAll: (leagueId: string, status: TeamEntry['status']) => void;
}) {
  const color = getColor(leagueIndex);
  const entryCount = league.teams.filter(t => t.status === 'entry').length;
  const defCount = league.teams.filter(t => t.status === 'def').length;
  const totalCount = league.teams.length;
  const allEntry = entryCount === totalCount;
  const pct = totalCount > 0 ? ((entryCount + defCount) / totalCount) * 100 : 0;

  return (
    <div className={`rounded-2xl border ${color.border} bg-white overflow-hidden shadow-sm`}>
      {/* ヘッダー */}
      <div className={`relative bg-gradient-to-br ${color.grad} px-4 py-3 text-white overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-5 -right-5 w-24 h-24 rounded-full bg-white blur-2xl" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xl font-black tracking-tight">{league.leagueId}</span>
              <span className="text-xs font-medium opacity-90">リーグ</span>
              {league.courtName && (
                <span className="text-[10px] opacity-75 truncate">・{league.courtName}</span>
              )}
            </div>
            <button
              onClick={() => onSetLeagueAll(league.leagueId, allEntry ? 'none' : 'entry')}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-lg backdrop-blur-sm transition-colors shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              {allEntry ? '解除' : '一括Entry'}
            </button>
          </div>

          {/* プログレス */}
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/90 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10px] font-bold tabular-nums">
              {entryCount}/{totalCount}
              {defCount > 0 && <span className="ml-1 text-red-200">DEF{defCount}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* チームグリッド */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50/30">
        {league.teams.map(team => (
          <TeamCard
            key={team.teamId}
            team={team}
            colorIndex={leagueIndex}
            onSetStatus={onSetTeamStatus}
          />
        ))}
      </div>
    </div>
  );
}

/** メインコンポーネント */
export default function TeamEntryView() {
  const { leagues, allTeams, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus } = useTeamStore();

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Users className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-slate-500">データがありません</p>
        <p className="text-sm mt-1">Excelファイルをインポートしてください</p>
      </div>
    );
  }

  const totalTeams = allTeams.length;
  const totalEntry = allTeams.filter(t => t.status === 'entry').length;
  const totalDef = allTeams.filter(t => t.status === 'def').length;
  const totalNone = totalTeams - totalEntry - totalDef;
  const entryPct = totalTeams > 0 ? (totalEntry / totalTeams) * 100 : 0;

  return (
    <div className="space-y-4 pb-20">
      {/* 統計ヘッダー */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl shadow-lg text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">団体戦エントリー</h1>
              <p className="text-xs text-blue-100">出場チームのエントリー状況を管理</p>
            </div>
          </div>

          {/* 統計グリッド */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-white/20">
              <div className="text-[9px] text-blue-100 font-medium uppercase tracking-wider">Total</div>
              <div className="text-xl font-black tabular-nums leading-tight">{totalTeams}</div>
            </div>
            <div className="bg-emerald-400/20 backdrop-blur-sm rounded-xl p-2.5 border border-emerald-300/30">
              <div className="text-[9px] text-emerald-100 font-medium uppercase tracking-wider">Entry</div>
              <div className="text-xl font-black tabular-nums leading-tight text-emerald-100">{totalEntry}</div>
            </div>
            <div className="bg-red-400/20 backdrop-blur-sm rounded-xl p-2.5 border border-red-300/30">
              <div className="text-[9px] text-red-100 font-medium uppercase tracking-wider">DEF</div>
              <div className="text-xl font-black tabular-nums leading-tight text-red-100">{totalDef}</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/10">
              <div className="text-[9px] text-blue-100 font-medium uppercase tracking-wider">未設定</div>
              <div className="text-xl font-black tabular-nums leading-tight text-blue-100">{totalNone}</div>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="h-2 bg-white/20 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${entryPct}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all duration-500"
              style={{ width: `${totalTeams > 0 ? (totalDef / totalTeams) * 100 : 0}%` }}
            />
          </div>

          {/* 一括操作 */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setAllTeamsStatus('entry')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold bg-white text-indigo-700 hover:bg-blue-50 active:bg-blue-100 rounded-xl shadow-sm transition-colors"
            >
              <Check className="w-4 h-4" />
              全チーム Entry
            </button>
            <button
              onClick={() => setAllTeamsStatus('none')}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/20 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              リセット
            </button>
          </div>
        </div>
      </div>

      {/* リーグ別セクション */}
      <div className="space-y-3">
        {leagues.map((league, index) => (
          <LeagueSection
            key={league.leagueId}
            league={league}
            leagueIndex={index}
            onSetTeamStatus={setTeamStatus}
            onSetLeagueAll={setLeagueAllStatus}
          />
        ))}
      </div>
    </div>
  );
}
