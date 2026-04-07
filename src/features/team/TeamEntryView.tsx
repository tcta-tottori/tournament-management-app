import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Users, Sparkles, Plus, Trash2, Edit3, UserCircle2 } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamEntry, TeamLeague, TeamMember } from './types';

/** リーグカラーパレット */
const LEAGUE_COLORS = [
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', solid: 'bg-emerald-500' },
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', solid: 'bg-blue-500' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', solid: 'bg-purple-500' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', solid: 'bg-rose-500' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', solid: 'bg-amber-500' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', solid: 'bg-cyan-500' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', solid: 'bg-lime-500' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', solid: 'bg-fuchsia-500' },
];
const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

/** 苗字のみ抽出 */
function familyName(name: string): string {
  return name.trim().split(/[\s　]+/)[0] || name;
}

/** メンバー編集モーダル */
function TeamEditModal({
  team,
  colorIndex,
  onClose,
}: {
  team: TeamEntry;
  colorIndex: number;
  onClose: () => void;
}) {
  const { setTeamMembers, updateTeamName } = useTeamStore();
  const [members, setMembers] = useState<TeamMember[]>(team.members);
  const [teamName, setTeamName] = useState(team.teamName);
  const color = getColor(colorIndex);

  const addMember = (gender: 'M' | 'F') => {
    setMembers([...members, { player: { name: '', affiliation: '' }, gender }]);
  };

  const updateMember = (idx: number, field: 'name' | 'affiliation', value: string) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, player: { ...m.player, [field]: value } } : m));
  };

  const removeMember = (idx: number) => {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  };

  const save = () => {
    updateTeamName(team.teamId, teamName);
    setTeamMembers(team.teamId, members.filter(m => m.player.name.trim()));
    onClose();
  };

  const femaleMembers = members.map((m, i) => ({ m, i })).filter(({ m }) => m.gender === 'F');
  const maleMembers = members.map((m, i) => ({ m, i })).filter(({ m }) => m.gender === 'M');

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={`bg-gradient-to-br ${color.grad} px-5 py-4 text-white flex items-center gap-3 shrink-0`}>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm font-black text-base shrink-0">
            {team.teamNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] opacity-80 font-bold uppercase tracking-wider">{team.leagueId}リーグ #{team.numberInLeague}</div>
            <input
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              className="w-full bg-transparent text-base font-black text-white placeholder-white/50 focus:outline-none focus:bg-white/10 rounded px-1 -mx-1"
              placeholder="チーム名"
            />
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メンバー編集 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 女子 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-pink-600 bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded-md">F</span>
                <span className="text-xs font-bold text-slate-600">女子</span>
                <span className="text-[10px] text-slate-400">({femaleMembers.length}名)</span>
              </div>
              <button
                onClick={() => addMember('F')}
                className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold text-pink-600 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                追加
              </button>
            </div>
            <div className="space-y-1.5">
              {femaleMembers.map(({ m, i }) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={m.player.name}
                    onChange={e => updateMember(i, 'name', e.target.value)}
                    placeholder="選手名"
                    className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                  />
                  <input
                    type="text"
                    value={m.player.affiliation}
                    onChange={e => updateMember(i, 'affiliation', e.target.value)}
                    placeholder="所属"
                    className="flex-1 min-w-0 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                  />
                  <button
                    onClick={() => removeMember(i)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {femaleMembers.length === 0 && (
                <div className="text-center py-3 text-xs text-slate-300 italic">女子メンバーなし</div>
              )}
            </div>
          </div>

          {/* 男子 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md">M</span>
                <span className="text-xs font-bold text-slate-600">男子</span>
                <span className="text-[10px] text-slate-400">({maleMembers.length}名)</span>
              </div>
              <button
                onClick={() => addMember('M')}
                className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                追加
              </button>
            </div>
            <div className="space-y-1.5">
              {maleMembers.map(({ m, i }) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={m.player.name}
                    onChange={e => updateMember(i, 'name', e.target.value)}
                    placeholder="選手名"
                    className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="text"
                    value={m.player.affiliation}
                    onChange={e => updateMember(i, 'affiliation', e.target.value)}
                    placeholder="所属"
                    className="flex-1 min-w-0 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => removeMember(i)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {maleMembers.length === 0 && (
                <div className="text-center py-3 text-xs text-slate-300 italic">男子メンバーなし</div>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={save}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br ${color.grad} text-white shadow-md hover:shadow-lg transition-all`}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** コンパクトチームカード（1行に複数表示） */
function CompactTeamCard({
  team,
  colorIndex,
  onSetStatus,
  onClick,
}: {
  team: TeamEntry;
  colorIndex: number;
  onSetStatus: (teamId: string, status: TeamEntry['status']) => void;
  onClick: () => void;
}) {
  const color = getColor(colorIndex);
  const femaleCount = team.members.filter(m => m.gender === 'F').length;
  const maleCount = team.members.filter(m => m.gender === 'M').length;
  const femaleFamilies = team.members.filter(m => m.gender === 'F').map(m => familyName(m.player.name)).filter(Boolean);
  const maleFamilies = team.members.filter(m => m.gender === 'M').map(m => familyName(m.player.name)).filter(Boolean);

  const statusStyles =
    team.status === 'entry'
      ? 'bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-500/10'
      : team.status === 'def'
      ? 'bg-slate-50/60 border-slate-200 opacity-60'
      : 'bg-white border-slate-200';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${statusStyles}`}>
      {/* ヘッダー（クリックで編集） */}
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2 px-2.5 py-2 border-b border-slate-100 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left group"
      >
        <div className={`flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br ${color.grad} text-white font-black text-xs shrink-0 shadow-sm`}>
          {team.teamNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-xs truncate">{team.teamName}</div>
          <div className="text-[9px] text-slate-400 font-medium">#{team.numberInLeague}</div>
        </div>
        <Edit3 className="w-3 h-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
      </button>

      {/* メンバーサマリー（苗字＋人数） */}
      <button
        onClick={onClick}
        className="w-full px-2.5 py-1.5 space-y-1 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left"
      >
        {femaleCount > 0 && (
          <div className="flex items-start gap-1">
            <span className="text-[8px] font-black text-pink-600 bg-pink-50 border border-pink-100 px-1 py-0.5 rounded shrink-0 mt-0.5">F{femaleCount}</span>
            <div className="flex-1 min-w-0 text-[10px] text-slate-600 leading-tight">
              {femaleFamilies.slice(0, 4).join('・')}
              {femaleFamilies.length > 4 && <span className="text-slate-400"> 他{femaleFamilies.length - 4}名</span>}
            </div>
          </div>
        )}
        {maleCount > 0 && (
          <div className="flex items-start gap-1">
            <span className="text-[8px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded shrink-0 mt-0.5">M{maleCount}</span>
            <div className="flex-1 min-w-0 text-[10px] text-slate-600 leading-tight">
              {maleFamilies.slice(0, 4).join('・')}
              {maleFamilies.length > 4 && <span className="text-slate-400"> 他{maleFamilies.length - 4}名</span>}
            </div>
          </div>
        )}
        {team.members.length === 0 && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400 italic">
            <UserCircle2 className="w-3 h-3" />
            メンバー未登録
          </div>
        )}
      </button>

      {/* ステータス切替 */}
      <div className="grid grid-cols-3 gap-0 border-t border-slate-100">
        <button
          onClick={() => onSetStatus(team.teamId, 'none')}
          className={`py-1.5 text-[10px] font-bold transition-colors ${
            team.status === 'none'
              ? 'bg-slate-100 text-slate-700'
              : 'bg-white text-slate-300 hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          未設定
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'entry')}
          className={`py-1.5 text-[10px] font-bold border-x border-slate-100 transition-colors flex items-center justify-center gap-0.5 ${
            team.status === 'entry'
              ? 'bg-emerald-500 text-white'
              : 'bg-white text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
          }`}
        >
          <Check className="w-3 h-3" />
          Entry
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'def')}
          className={`py-1.5 text-[10px] font-bold transition-colors flex items-center justify-center gap-0.5 ${
            team.status === 'def'
              ? 'bg-red-500 text-white'
              : 'bg-white text-slate-400 hover:bg-red-50 hover:text-red-600'
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
  onEditTeam,
}: {
  league: TeamLeague;
  leagueIndex: number;
  onSetTeamStatus: (teamId: string, status: TeamEntry['status']) => void;
  onSetLeagueAll: (leagueId: string, status: TeamEntry['status']) => void;
  onEditTeam: (team: TeamEntry) => void;
}) {
  const color = getColor(leagueIndex);
  const entryCount = league.teams.filter(t => t.status === 'entry').length;
  const totalCount = league.teams.length;
  const allEntry = entryCount === totalCount;
  // 1行に4または5チーム表示 (チーム数に合わせてグリッドを決定)
  const colsClass = totalCount >= 5 ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`rounded-2xl border ${color.border} bg-white overflow-hidden shadow-sm`}>
      {/* ヘッダー */}
      <div className={`relative bg-gradient-to-br ${color.grad} px-4 py-2.5 text-white overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white blur-2xl" />
        </div>
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xl font-black tracking-tight">{league.leagueId}</span>
            <span className="text-xs font-medium opacity-90">リーグ</span>
            {league.courtName && (
              <span className="text-[10px] opacity-75 truncate">・{league.courtName}</span>
            )}
            <span className="text-[10px] opacity-80 tabular-nums ml-1">{entryCount}/{totalCount}</span>
          </div>
          <button
            onClick={() => onSetLeagueAll(league.leagueId, allEntry ? 'none' : 'entry')}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-lg backdrop-blur-sm transition-colors shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            {allEntry ? '解除' : '一括Entry'}
          </button>
        </div>
      </div>

      {/* チームグリッド (1行に4または5) */}
      <div className={`p-2.5 grid grid-cols-1 ${colsClass} gap-2 bg-slate-50/30`}>
        {league.teams.map(team => (
          <CompactTeamCard
            key={team.teamId}
            team={team}
            colorIndex={leagueIndex}
            onSetStatus={onSetTeamStatus}
            onClick={() => onEditTeam(team)}
          />
        ))}
      </div>
    </div>
  );
}

/** メインコンポーネント */
export default function TeamEntryView() {
  const { leagues, setTeamStatus, setLeagueAllStatus } = useTeamStore();
  const [editingTeam, setEditingTeam] = useState<{ team: TeamEntry; colorIndex: number } | null>(null);

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

  return (
    <div className="space-y-3 pb-20">
      {/* リーグ別セクション */}
      {leagues.map((league, index) => (
        <LeagueSection
          key={league.leagueId}
          league={league}
          leagueIndex={index}
          onSetTeamStatus={setTeamStatus}
          onSetLeagueAll={setLeagueAllStatus}
          onEditTeam={team => setEditingTeam({ team, colorIndex: index })}
        />
      ))}

      {/* 編集モーダル */}
      {editingTeam && (
        <TeamEditModal
          team={editingTeam.team}
          colorIndex={editingTeam.colorIndex}
          onClose={() => setEditingTeam(null)}
        />
      )}
    </div>
  );
}
