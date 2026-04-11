import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Users, Sparkles, Plus, Trash2, Edit3, UserCircle2, Layers, MapPin } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamEntry, TeamLeague, TeamMember } from './types';
import { getDisplayName, parseCourtNumbers } from './teamLogic';

/** リーグカラーパレット（Blue先頭で全ページ統一） */
const LEAGUE_COLORS = [
  { grad: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', solid: 'bg-blue-500' },
  { grad: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', solid: 'bg-emerald-500' },
  { grad: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', solid: 'bg-purple-500' },
  { grad: 'from-rose-500 to-pink-600', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', solid: 'bg-rose-500' },
  { grad: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', solid: 'bg-amber-500' },
  { grad: 'from-cyan-500 to-sky-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', solid: 'bg-cyan-500' },
  { grad: 'from-lime-500 to-green-600', bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', solid: 'bg-lime-500' },
  { grad: 'from-fuchsia-500 to-purple-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', solid: 'bg-fuchsia-500' },
];
const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

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

  const addMember = (gender: 'M' | 'F' = 'M') => {
    setMembers([...members, { player: { name: '', affiliation: '' }, gender }]);
  };

  const updateMember = (idx: number, value: string) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, player: { ...m.player, name: value } } : m));
  };

  const updateDisplayName = (idx: number, value: string) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, player: { ...m.player, displayName: value || undefined } } : m));
  };

  const updateGender = (idx: number, gender: 'M' | 'F') => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, gender } : m));
  };

  const removeMember = (idx: number) => {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  };

  const save = () => {
    updateTeamName(team.teamId, teamName);
    setTeamMembers(team.teamId, members.filter(m => m.player.name.trim()));
    onClose();
  };

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

        {/* メンバー編集（男女分割） */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(['M', 'F'] as const).map(g => {
            const groupMembers = members
              .map((m, idx) => ({ m, idx }))
              .filter(e => e.m.gender === g);
            const isMale = g === 'M';
            const groupLabel = isMale ? '男子' : '女子';
            const groupColor = isMale
              ? { text: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' }
              : { text: 'text-pink-700', bg: 'bg-pink-50', border: 'border-pink-200', dot: 'bg-pink-500' };
            return (
              <div key={g}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${groupColor.bg} ${groupColor.text} border ${groupColor.border} text-[10px] font-black`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${groupColor.dot}`} />
                      {groupLabel}
                    </span>
                    <span className="text-[10px] text-slate-400">({groupMembers.length}名)</span>
                  </div>
                  <button
                    onClick={() => addMember(g)}
                    className={`flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold ${groupColor.text} ${groupColor.bg} hover:brightness-95 border ${groupColor.border} rounded-lg transition-all`}
                  >
                    <Plus className="w-3 h-3" />
                    追加
                  </button>
                </div>
                <div className="space-y-1.5">
                  {groupMembers.map(({ m, idx }) => {
                    const autoDisplay = getDisplayName(m.player, members);
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateGender(idx, isMale ? 'F' : 'M')}
                          title="男女を切替"
                          className={`shrink-0 w-7 text-center text-[10px] font-black rounded-lg px-1 py-1.5 border transition-colors ${groupColor.bg} ${groupColor.text} ${groupColor.border} hover:brightness-95`}
                        >
                          {isMale ? '男' : '女'}
                        </button>
                        <input
                          type="text"
                          value={m.player.name}
                          onChange={e => updateMember(idx, e.target.value)}
                          placeholder="選手名"
                          className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                        />
                        <input
                          type="text"
                          value={m.player.displayName ?? ''}
                          onChange={e => updateDisplayName(idx, e.target.value)}
                          placeholder={autoDisplay}
                          title="表示名（空欄で自動）"
                          className={`w-14 text-center text-xs font-bold border rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-100 shrink-0 ${
                            m.player.displayName ? `${color.border} ${color.text} ${color.bg}` : 'border-slate-200 text-slate-400'
                          }`}
                        />
                        <button
                          onClick={() => removeMember(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {groupMembers.length === 0 && (
                    <div className="text-center py-2 text-[11px] text-slate-300 italic">登録なし</div>
                  )}
                </div>
              </div>
            );
          })}
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
  const memberCount = team.members.length;
  const maleMembers = team.members.filter(m => m.gender === 'M');
  const femaleMembers = team.members.filter(m => m.gender === 'F');
  const maleNames = maleMembers.map(m => getDisplayName(m.player, team.members)).filter(Boolean);
  const femaleNames = femaleMembers.map(m => getDisplayName(m.player, team.members)).filter(Boolean);

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

      {/* メンバーサマリー（男女別） */}
      <button
        onClick={onClick}
        className="w-full px-2.5 py-1.5 space-y-1 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left"
      >
        {memberCount > 0 && (
          <div className="space-y-1">
            {maleMembers.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="text-[8px] font-black text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.5 rounded shrink-0 mt-0.5">
                  男{maleMembers.length}
                </span>
                <div className="flex-1 min-w-0 text-[10px] text-slate-600 leading-tight">
                  {maleNames.slice(0, 5).join('・')}
                  {maleNames.length > 5 && <span className="text-slate-400"> 他{maleNames.length - 5}名</span>}
                </div>
              </div>
            )}
            {femaleMembers.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="text-[8px] font-black text-pink-700 bg-pink-50 border border-pink-200 px-1 py-0.5 rounded shrink-0 mt-0.5">
                  女{femaleMembers.length}
                </span>
                <div className="flex-1 min-w-0 text-[10px] text-slate-600 leading-tight">
                  {femaleNames.slice(0, 5).join('・')}
                  {femaleNames.length > 5 && <span className="text-slate-400"> 他{femaleNames.length - 5}名</span>}
                </div>
              </div>
            )}
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
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl font-black tracking-tight leading-none">{league.leagueId}</span>
            <span className="text-xs font-medium opacity-90 leading-none">リーグ</span>
            {(() => {
              const nums = parseCourtNumbers(league.courtName);
              if (nums.length === 0) return null;
              return (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/20 backdrop-blur-sm">
                  <MapPin className="w-3 h-3 opacity-90 shrink-0" />
                  <span className="text-[10px] font-bold tabular-nums">{nums.join('・')}</span>
                </span>
              );
            })()}
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

/** LEAGUE_COLORSのソリッドカラー（タブドット用） */
const LEAGUE_SOLID_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e',
  '#f59e0b', '#06b6d4', '#84cc16', '#d946ef',
];

/** メインコンポーネント */
export default function TeamEntryView() {
  const { leagues, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus } = useTeamStore();
  const [editingTeam, setEditingTeam] = useState<{ team: TeamEntry; colorIndex: number } | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

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

  const totalTeams = leagues.reduce((sum, l) => sum + l.teams.length, 0);
  const totalEntered = leagues.reduce((sum, l) => sum + l.teams.filter(t => t.status === 'entry').length, 0);
  const allEntered = totalEntered === totalTeams && totalTeams > 0;

  const visibleLeagues = selectedTab === 'all'
    ? leagues
    : leagues.filter(l => l.leagueId === selectedTab);

  return (
    <div className="space-y-3 pb-20">
      {/* Chrome風タブ（リッチカラー文字） */}
      <div className="sticky top-0 z-20 -mx-2 px-2">
        <div className="chrome-tab-bar">
          {/* 全体タブ */}
          {(() => {
            const allComplete = allEntered;
            return (
              <button
                onClick={() => setSelectedTab('all')}
                className={`chrome-tab ${selectedTab === 'all' ? 'chrome-tab-active' : ''}`}
              >
                <Layers className="chrome-tab-icon" stroke="url(#rainbow-grad)" />
                <span className="chrome-tab-label chrome-tab-label-rainbow">ALL</span>
                {allComplete && (
                  <Check className="w-3 h-3 text-emerald-600" strokeWidth={3} />
                )}
              </button>
            );
          })()}
          {/* 各リーグタブ */}
          {leagues.map((l, i) => {
            const entryCount = l.teams.filter(t => t.status === 'entry').length;
            const total = l.teams.length;
            const complete = entryCount === total && total > 0;
            const solidColor = LEAGUE_SOLID_COLORS[i % LEAGUE_SOLID_COLORS.length];
            return (
              <button
                key={l.leagueId}
                onClick={() => setSelectedTab(l.leagueId)}
                className={`chrome-tab ${selectedTab === l.leagueId ? 'chrome-tab-active' : ''}`}
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
                  {entryCount}/{total}
                </span>
                {complete && (
                  <Check className="w-3 h-3" strokeWidth={3} style={{ color: solidColor }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 全体一括エントリー */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 text-xs text-slate-500">
          <span className="font-bold tabular-nums text-slate-700">{totalEntered}</span>
          <span className="text-slate-400"> / {totalTeams} チーム Entry</span>
        </div>
        <button
          onClick={() => setAllTeamsStatus(allEntered ? 'none' : 'entry')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 ${
            allEntered
              ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:shadow-lg'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {allEntered ? '全て解除' : '全て一括Entry'}
        </button>
      </div>

      {/* リーグ別セクション */}
      {visibleLeagues.map((league) => {
        const index = leagues.findIndex(l => l.leagueId === league.leagueId);
        return (
          <LeagueSection
            key={league.leagueId}
            league={league}
            leagueIndex={index}
            onSetTeamStatus={setTeamStatus}
            onSetLeagueAll={setLeagueAllStatus}
            onEditTeam={team => setEditingTeam({ team, colorIndex: index })}
          />
        );
      })}

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
