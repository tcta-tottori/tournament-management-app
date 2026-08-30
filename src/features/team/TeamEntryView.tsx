import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Users, Sparkles, Plus, Trash2, Edit3, UserCircle2, Layers, Upload } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamEntry, TeamLeague, TeamMember } from './types';
import { getDisplayName } from './teamLogic';
import { parseClubExcel, normalizeTeamName } from './clubExcelParser';
import { parseTeamExcel } from './teamExcelParser';

type RosterCandidate = { teamName: string; members: TeamMember[] };

/**
 * 取込結果からメンバー候補を「会場セクション単位のグループ」で収集する。
 * 男女別会場ファイルでは同名系チーム（例: 男子「湖山池ＴＣ２」/ 女子「湖山池ＴＣ」）が
 * 混在し、名前一致が曖昧になるため、セクション別に分けて後段で最適な1グループを選ぶ。
 */
function collectRosterGroups(res: { leagues?: { teams: TeamEntry[] }[]; sections?: { leagues: { teams: TeamEntry[] }[] }[] }): RosterCandidate[][] {
  const groups: RosterCandidate[][] = [];
  const fromLeagues = (leagues?: { teams: TeamEntry[] }[]): RosterCandidate[] => {
    const out: RosterCandidate[] = [];
    for (const l of leagues || []) {
      for (const t of l.teams) {
        if (t.members && t.members.length > 0) out.push({ teamName: t.teamName, members: t.members });
      }
    }
    return out;
  };
  if (res.sections && res.sections.length > 0) {
    for (const s of res.sections) { const g = fromLeagues(s.leagues); if (g.length) groups.push(g); }
  } else {
    const g = fromLeagues(res.leagues); if (g.length) groups.push(g);
  }
  return groups;
}

/**
 * 取込済みチーム名の集合と最も重なるグループ（=同じ会場/性別）を選ぶ。
 * これにより別会場の同名系チームを取り違えない。
 */
function pickBestRosterGroup(groups: RosterCandidate[][], storeTeamNames: string[]): RosterCandidate[] {
  if (groups.length <= 1) return groups[0] || [];
  const storeNorms = new Set(storeTeamNames.map(normalizeTeamName).filter(Boolean));
  let best: RosterCandidate[] = [];
  let bestScore = -1;
  for (const g of groups) {
    const score = g.filter(c => storeNorms.has(normalizeTeamName(c.teamName))).length;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

/** リーグカラー（サイトのトンマナに合わせ、全リーグ共通の無彩色） */
const LEAGUE_COLORS = [
  { grad: 'from-gray-600 to-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', solid: 'bg-gray-600' },
];
const getColor = (i: number) => LEAGUE_COLORS[i % LEAGUE_COLORS.length];

/** 苗字のみ抽出（フォールバック用） */
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

  const addMember = () => {
    setMembers([...members, { player: { name: '', affiliation: '' }, gender: 'F' }]);
  };

  const updateMember = (idx: number, value: string) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, player: { ...m.player, name: value } } : m));
  };

  const updateDisplayName = (idx: number, value: string) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, player: { ...m.player, displayName: value || undefined } } : m));
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

        {/* メンバー編集 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-bold text-gray-600">メンバー</span>
              <span className="text-[10px] text-gray-400">({members.length}名)</span>
            </div>
            <button
              onClick={addMember}
              className={`flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold ${color.text} ${color.bg} hover:brightness-95 border ${color.border} rounded-lg transition-all`}
            >
              <Plus className="w-3 h-3" />
              追加
            </button>
          </div>
          <div className="space-y-1.5">
            {members.map((m, i) => {
              const autoDisplay = getDisplayName(m.player, members);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={m.player.name}
                    onChange={e => updateMember(i, e.target.value)}
                    placeholder="選手名"
                    className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
                  />
                  <input
                    type="text"
                    value={m.player.displayName ?? ''}
                    onChange={e => updateDisplayName(i, e.target.value)}
                    placeholder={autoDisplay}
                    title="表示名（空欄で自動）"
                    className={`w-14 text-center text-xs font-bold border rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-100 shrink-0 ${
                      m.player.displayName ? `${color.border} ${color.text} ${color.bg}` : 'border-gray-200 text-gray-400'
                    }`}
                  />
                  <button
                    onClick={() => removeMember(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="text-center py-3 text-xs text-gray-300 italic">メンバーなし</div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
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
  const families = team.members.map(m => getDisplayName(m.player, team.members)).filter(Boolean);

  const statusStyles =
    team.status === 'entry'
      ? 'bg-white border-primary-200 shadow-sm ring-1 ring-primary-500/10'
      : team.status === 'def'
      ? 'bg-gray-50/60 border-gray-200 opacity-60'
      : 'bg-white border-gray-200';

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${statusStyles}`}>
      {/* ヘッダー（クリックで編集） */}
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 hover:bg-gray-50/80 active:bg-gray-100 transition-colors text-left group"
      >
        <div className={`flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br ${color.grad} text-white font-black text-xs shrink-0 shadow-sm`}>
          {team.teamNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-800 text-xs truncate">{team.teamName}</div>
          <div className="text-[9px] text-gray-400 font-medium">#{team.numberInLeague}</div>
        </div>
        <Edit3 className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" />
      </button>

      {/* メンバーサマリー（苗字＋人数） */}
      <button
        onClick={onClick}
        className="w-full px-2.5 py-1.5 space-y-1 hover:bg-gray-50/80 active:bg-gray-100 transition-colors text-left"
      >
        {memberCount > 0 && (
          <div className="flex items-start gap-1">
            <span className={`text-[8px] font-black ${color.text} ${color.bg} border ${color.border} px-1 py-0.5 rounded shrink-0 mt-0.5`}>{memberCount}名</span>
            <div className="flex-1 min-w-0 text-[10px] text-gray-600 leading-tight">
              {families.slice(0, 6).join('・')}
              {families.length > 6 && <span className="text-gray-400"> 他{families.length - 6}名</span>}
            </div>
          </div>
        )}
        {team.members.length === 0 && (
          <div className="flex items-center gap-1 text-[10px] text-gray-400 italic">
            <UserCircle2 className="w-3 h-3" />
            メンバー未登録
          </div>
        )}
      </button>

      {/* ステータス切替 */}
      <div className="grid grid-cols-3 gap-0 border-t border-gray-100">
        <button
          onClick={() => onSetStatus(team.teamId, 'none')}
          className={`py-1.5 text-[10px] font-bold transition-colors ${
            team.status === 'none'
              ? 'bg-gray-100 text-gray-700'
              : 'bg-white text-gray-300 hover:bg-gray-50 active:bg-gray-100'
          }`}
        >
          未設定
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'entry')}
          className={`py-1.5 text-[10px] font-bold border-x border-gray-100 transition-colors flex items-center justify-center gap-0.5 ${
            team.status === 'entry'
              ? 'bg-primary-500 text-white'
              : 'bg-white text-gray-400 hover:bg-primary-50 hover:text-gray-700'
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
              : 'bg-white text-gray-400 hover:bg-red-50 hover:text-red-600'
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
      <div className={`p-2.5 grid grid-cols-1 ${colsClass} gap-2 bg-gray-50/30`}>
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
  '#767676', '#c63834', '#8b5cf6', '#f43f5e',
  '#c63834', '#06b6d4', '#84cc16', '#d946ef',
];

/** メインコンポーネント */
export default function TeamEntryView() {
  const { leagues, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus, relinkMembersByName } = useTeamStore();
  const [editingTeam, setEditingTeam] = useState<{ team: TeamEntry; colorIndex: number } | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const relinkInputRef = useRef<HTMLInputElement | null>(null);

  // 名簿を再取込（スコアを保持したまま、メンバー未登録チームだけ選手名簿を復元）
  const handleRelinkFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      let groups: RosterCandidate[][] = [];
      // クラブ対抗（後期など）→ 通常団体戦 の順で解析を試す
      try { groups = collectRosterGroups(parseClubExcel(buffer, file.name)); } catch { /* try next */ }
      if (groups.length === 0) {
        try { groups = collectRosterGroups(parseTeamExcel(buffer)); } catch { /* ignore */ }
      }
      const storeTeamNames = leagues.flatMap(l => l.teams.map(t => t.teamName));
      const candidates = pickBestRosterGroup(groups, storeTeamNames);
      if (candidates.length === 0) {
        alert('このファイルから選手名簿を読み取れませんでした。名簿シートを含むExcelを選択してください。');
        return;
      }
      const updated = relinkMembersByName(candidates);
      alert(updated > 0
        ? `${updated}チームの選手名簿を復元しました（スコアはそのまま保持）。`
        : '未登録のチームはありませんでした（既に全チームに名簿があります）。');
    } catch (e) {
      alert(`名簿の再取込に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Users className="w-8 h-8" />
        </div>
        <p className="text-base font-bold text-gray-500">データがありません</p>
        <p className="text-sm mt-1">Excelファイルをインポートしてください</p>
      </div>
    );
  }

  const totalTeams = leagues.reduce((sum, l) => sum + l.teams.length, 0);
  const totalEntered = leagues.reduce((sum, l) => sum + l.teams.filter(t => t.status === 'entry').length, 0);
  const allEntered = totalEntered === totalTeams && totalTeams > 0;
  const teamsMissingMembers = leagues.reduce((sum, l) => sum + l.teams.filter(t => !t.members || t.members.length === 0).length, 0);

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
                <span
                  className={`chrome-tab-progress ${allComplete ? 'chrome-tab-progress-done' : ''}`}
                  style={{ color: allComplete ? '#c63834' : '#767676' }}
                >
                  {totalEntered}/{totalTeams}
                </span>
                {allComplete && (
                  <Check className="w-3 h-3 text-primary-600" strokeWidth={3} />
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
        <div className="flex-1 text-xs text-gray-500">
          <span className="font-bold tabular-nums text-gray-700">{totalEntered}</span>
          <span className="text-gray-400"> / {totalTeams} チーム Entry</span>
          {teamsMissingMembers > 0 && (
            <span className="ml-2 text-gray-700 font-bold">選手名簿なし {teamsMissingMembers}チーム</span>
          )}
        </div>
        <input
          ref={relinkInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleRelinkFile(f); e.target.value = ''; }}
        />
        <button
          onClick={() => relinkInputRef.current?.click()}
          title="Excelを選び直して、選手が空のチームだけ名簿を復元します（スコアは保持）"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 bg-white border border-primary-200 text-gray-800 hover:bg-primary-50"
        >
          <Upload className="w-3.5 h-3.5" />
          名簿を再取込
        </button>
        <button
          onClick={() => setAllTeamsStatus(allEntered ? 'none' : 'entry')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 ${
            allEntered
              ? 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white hover:shadow-lg'
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
