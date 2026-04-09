import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { MapPin, Pencil, ArrowRightLeft, UserCheck, Users, CheckCircle, AlertTriangle, Search, X, Settings } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { MixedTeam, TournamentInfo } from './types';

/** インライン編集セル */
function EditableCell({ value, onSave, className = '' }: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);

  if (editing) {
    return (
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={() => { onSave(input); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(input); setEditing(false); }
          if (e.key === 'Escape') { setInput(value); setEditing(false); }
        }}
        className="w-full px-1.5 py-0.5 border border-emerald-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setInput(value); setEditing(true); }}
      className={`cursor-pointer hover:bg-emerald-50 px-1 py-0.5 rounded transition-colors ${className}`}
      title="クリックで編集"
    >
      {value || <span className="text-gray-300 italic text-xs">-</span>}
    </span>
  );
}

/** リーグ移動ドロップダウン */
function MoveToLeagueSelect({ team, leagues, onMove }: {
  team: MixedTeam;
  leagues: { leagueId: string }[];
  onMove: (teamId: string, targetLeagueId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const otherLeagues = leagues.filter(l => l.leagueId !== team.leagueId);

  if (!open) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
        title="リーグ移動"
      >
        <ArrowRightLeft size={13} />
      </button>
    );
  }

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <select
        autoFocus
        className="text-xs border border-emerald-400 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        onChange={e => {
          if (e.target.value) {
            if (confirm(`${team.teamName} を ${e.target.value}リーグに移動しますか？\n（該当リーグの試合データはリセットされます）`)) {
              onMove(team.teamId, e.target.value);
            }
          }
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        defaultValue=""
      >
        <option value="">移動先...</option>
        {otherLeagues.map(l => (
          <option key={l.leagueId} value={l.leagueId}>{l.leagueId}リーグ</option>
        ))}
      </select>
    </div>
  );
}

/** Entry / DEF 個別ボタン */
function EntryDefButtons({ status, onSetStatus, size = 'normal' }: {
  status: 'none' | 'entry' | 'def';
  onSetStatus: (s: 'none' | 'entry' | 'def') => void;
  size?: 'normal' | 'small';
}) {
  const base = size === 'small'
    ? 'px-3 py-1.5 text-[11px] min-w-[48px] min-h-[34px]'
    : 'px-3.5 py-1.5 text-xs min-w-[52px] min-h-[36px]';
  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onSetStatus(status === 'entry' ? 'none' : 'entry')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'entry'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600'
            : 'bg-white text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 border border-gray-200 hover:border-emerald-300'
        }`}
      >
        Entry
      </button>
      <button
        onClick={() => onSetStatus(status === 'def' ? 'none' : 'def')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'def'
            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md shadow-orange-200 hover:from-orange-600 hover:to-red-600'
            : 'bg-white text-gray-400 hover:bg-orange-50 hover:text-orange-600 border border-gray-200 hover:border-orange-300'
        }`}
      >
        DEF
      </button>
    </div>
  );
}

/** チームセルの背景色（PC） */
function cellBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-gradient-to-br from-emerald-50/80 to-teal-50/60';
  if (status === 'def') return 'bg-gradient-to-br from-orange-50/80 to-red-50/40';
  return 'bg-white';
}

/** スマホの行背景色 */
function rowBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-emerald-50/50';
  if (status === 'def') return 'bg-orange-50/50';
  return '';
}

/** リーグバッジカラー（Blue先頭で全ページ統一） */
const LEAGUE_COLORS = [
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200' },
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200' },
];

export default function MixedEntryView() {
  const { leagues, allTeams, isImported, updateCourtName, updateTeamPlayer, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus, moveTeamToLeague, tournamentInfo, updateGameRule } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // スクロールで検索窓を閉じる
  useEffect(() => {
    if (!searchOpen) return;
    const handleScroll = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        if (searchQuery === '') setSearchOpen(false);
      }, 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('scroll', handleScroll); if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [searchOpen, searchQuery]);

  // 検索フィルタ
  const matchesSearch = useCallback((team: MixedTeam, league: { leagueId: string }) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      team.male.name.toLowerCase().includes(q) ||
      team.female.name.toLowerCase().includes(q) ||
      team.male.affiliation.toLowerCase().includes(q) ||
      team.female.affiliation.toLowerCase().includes(q) ||
      String(team.pairNumber).includes(q) ||
      league.leagueId.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  if (!isImported) {
    return <MixedImportView />;
  }

  const allEntry = allTeams.length > 0 && allTeams.every(t => t.status === 'entry');
  const totalEntry = allTeams.filter(t => t.status === 'entry').length;
  const totalDef = allTeams.filter(t => t.status === 'def').length;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* ヘッダー統計バー (sticky) */}
      <div className="sticky top-0 z-30 bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setAllTeamsStatus(allEntry ? 'none' : 'entry')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                allEntry
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600'
                  : 'bg-white text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-300'
              }`}
            >
              <Users size={15} />
              {allEntry ? '全員Entry解除' : '全員Entry'}
            </button>
          </div>
          {/* 統計カプセル */}
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              <Users size={12} />
              {allTeams.length}ペア / {leagues.length}リーグ
            </span>
            {totalEntry > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                <CheckCircle size={12} />
                Entry {totalEntry}
              </span>
            )}
            {totalDef > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-orange-100 text-orange-600 font-bold">
                <AlertTriangle size={12} />
                DEF {totalDef}
              </span>
            )}
          </div>
          {/* 検索 */}
          <div className="flex items-center gap-2 mt-2">
            {searchOpen ? (
              <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="名前・所属・番号・リーグで検索..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
                  autoFocus
                />
                <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="p-0.5 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Search size={12} />
                検索
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ゲームルール設定 */}
      <GameRuleConfig leagues={leagues} tournamentInfo={tournamentInfo} updateGameRule={updateGameRule} />

      {/* リーグ一覧 */}
      <div className="space-y-4">
        {leagues.map((league, leagueIdx) => {
          const entryCount = league.teams.filter(t => t.status === 'entry').length;
          const defCount = league.teams.filter(t => t.status === 'def').length;
          const leagueAllEntry = league.teams.length > 0 && league.teams.every(t => t.status === 'entry');
          const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];
          const filteredTeams = searchQuery ? league.teams.filter(t => matchesSearch(t, league)) : league.teams;
          if (searchQuery && filteredTeams.length === 0) return null;

          return (
            <div key={league.leagueId} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${colors.border}`}>
              {/* リーグヘッダー — スマホ用 */}
              <div className={`sm:hidden flex items-center gap-2.5 px-3 py-3 bg-gradient-to-r ${colors.light} border-b ${colors.border}`}>
                <span className={`w-10 h-10 bg-gradient-to-br ${colors.from} ${colors.to} text-white text-base font-bold rounded-xl flex items-center justify-center shadow-lg shrink-0`}>
                  {league.leagueId.trim()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    {league.leagueId.trim()} リーグ
                    <span className="text-[10px] font-normal text-gray-400 bg-white/70 px-1.5 py-0.5 rounded-full">
                      {league.teams.length}ペア
                    </span>
                    {entryCount > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        {entryCount}
                      </span>
                    )}
                    {defCount > 0 && (
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                        DEF {defCount}
                      </span>
                    )}
                  </h3>
                  {editingCourtId === league.leagueId ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="text-gray-400 shrink-0" />
                      <input
                        type="text"
                        value={courtInput}
                        onChange={e => setCourtInput(e.target.value)}
                        onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                          if (e.key === 'Escape') setEditingCourtId(null);
                        }}
                        className="px-1.5 py-0.5 text-xs border border-emerald-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 w-28"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors mt-0.5"
                    >
                      <MapPin size={11} />
                      {league.courtName || '(コート未設定)'}
                      <Pencil size={9} className="opacity-40" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 shrink-0 ${
                    leagueAllEntry
                      ? 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600'
                      : 'bg-white text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 border border-gray-200'
                  }`}
                >
                  <UserCheck size={12} />
                  {leagueAllEntry ? '解除' : '全Entry'}
                </button>
              </div>

              {/* PC: ドロー表横1行スタイル */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: filteredTeams.length * 210 + 130 }}>
                  <tbody>
                    <tr>
                      {/* リーグ名+コート列 */}
                      <td className={`border border-gray-200 px-3 py-3 align-middle text-center bg-gradient-to-b ${colors.light}`} style={{ minWidth: 120 }}>
                        <div className={`w-12 h-12 mx-auto bg-gradient-to-br ${colors.from} ${colors.to} text-white text-xl font-bold rounded-xl flex items-center justify-center shadow-lg mb-1.5`}>
                          {league.leagueId.trim()}
                        </div>
                        <div className="font-bold text-sm text-gray-700 mb-1">{league.leagueId.trim()} リーグ</div>
                        {editingCourtId === league.leagueId ? (
                          <div className="flex items-center justify-center gap-1 mb-1.5">
                            <input
                              type="text"
                              value={courtInput}
                              onChange={e => setCourtInput(e.target.value)}
                              onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                                if (e.key === 'Escape') setEditingCourtId(null);
                              }}
                              className="px-1.5 py-0.5 text-xs border border-emerald-400 rounded-lg focus:outline-none w-20 text-center"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                            className="flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors mb-1.5 mx-auto"
                          >
                            <MapPin size={10} />
                            {league.courtName || '(コート未設定)'}
                          </button>
                        )}
                        <button
                          onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${
                            leagueAllEntry
                              ? 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600'
                              : 'bg-white text-gray-500 hover:bg-emerald-50 border border-gray-200'
                          }`}
                        >
                          <UserCheck size={10} />
                          {leagueAllEntry ? '解除' : '全Entry'}
                        </button>
                      </td>
                      {/* チーム列 */}
                      {filteredTeams.map((team) => {
                        const st = team.status || 'none';
                        const isDef = st === 'def';
                        return (
                          <td
                            key={team.teamId}
                            className={`border border-gray-200 px-3 py-2 align-top ${cellBg(st)} transition-all`}
                            style={{ minWidth: 200 }}
                          >
                            {/* 番号バッジ */}
                            <div className="flex items-start gap-2">
                              <div className="shrink-0 mt-0.5">
                                <span className={`w-7 h-7 bg-gradient-to-br ${colors.from} ${colors.to} text-white text-xs font-bold rounded-full flex items-center justify-center shadow`}>
                                  {team.pairNumber}
                                </span>
                              </div>
                              <div className={`flex-1 min-w-0 ${isDef ? 'opacity-40 line-through' : ''}`}>
                                {/* 男子 */}
                                <div className="flex items-baseline gap-1.5 leading-relaxed">
                                  <EditableCell
                                    value={team.male.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                    className="text-sm font-bold text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.male.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                    className="text-[11px] text-gray-400 whitespace-nowrap"
                                  />
                                </div>
                                {/* 女子 */}
                                <div className="flex items-baseline gap-1.5 leading-relaxed">
                                  <EditableCell
                                    value={team.female.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                    className="text-sm font-bold text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.female.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                    className="text-[11px] text-gray-400 whitespace-nowrap"
                                  />
                                </div>
                              </div>
                            </div>
                            {/* ステータスインジケーター + 操作ボタン */}
                            <div className="flex items-center gap-1.5 mt-2 justify-end">
                              <EntryDefButtons status={st} onSetStatus={s => setTeamStatus(team.teamId, s)} />
                              <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* スマホ: リスト表示 */}
              <div className="sm:hidden divide-y divide-gray-100">
                {filteredTeams.map((team) => {
                  const st = team.status || 'none';
                  const isDef = st === 'def';
                  return (
                    <div key={team.teamId} className={`flex items-center gap-2 px-2 py-2 ${rowBg(st)}`}>
                      {/* ペア番号 */}
                      <span className={`w-6 h-6 bg-gradient-to-br ${colors.from} ${colors.to} text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow shrink-0`}>
                        {team.pairNumber}
                      </span>
                      {/* 名前+所属 */}
                      <div className={`flex-1 min-w-0 ${isDef ? 'opacity-40' : ''}`}>
                        <div className="flex gap-0">
                          <div className="w-[80px] shrink-0 pr-1.5">
                            <div className="text-[13px] font-bold text-gray-800 truncate leading-tight">{team.male.name}</div>
                            <div className="text-[13px] font-bold text-gray-800 truncate leading-tight">{team.female.name}</div>
                          </div>
                          <div className="w-px bg-gray-200 shrink-0 self-stretch" />
                          <div className="flex-1 min-w-0 pl-1.5">
                            <div className="text-[10px] text-gray-400 truncate leading-[1.4rem]">{team.male.affiliation}</div>
                            <div className="text-[10px] text-gray-400 truncate leading-[1.4rem]">{team.female.affiliation}</div>
                          </div>
                        </div>
                      </div>
                      {/* ボタン */}
                      <div className="flex items-center gap-1 shrink-0">
                        <EntryDefButtons status={st} onSetStatus={s => setTeamStatus(team.teamId, s)} size="small" />
                        <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ゲームルール設定コンポーネント */
function GameRuleConfig({ leagues, tournamentInfo, updateGameRule }: {
  leagues: { leagueId: string; teams: MixedTeam[] }[];
  tournamentInfo: TournamentInfo | null;
  updateGameRule: (teamCount: number, rule: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // リーグのチーム数別にグルーピング
  const teamCountGroups = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const l of leagues) {
      const count = l.teams.length;
      if (!map.has(count)) map.set(count, []);
      map.get(count)!.push(l.leagueId);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [leagues]);

  const gameRules = tournamentInfo?.gameRules || {};

  // デフォルトルール候補
  const defaultRules: Record<number, string> = {
    4: 'ノーアド・6ゲームマッチ（6-6タイブレーク）',
    5: '6ゲーム先取（ノーアド）',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Settings size={14} className="text-gray-500" />
          ゲームルール設定
          {teamCountGroups.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400">
              ({teamCountGroups.map(([count, ids]) => `${count}チーム: ${ids.length}リーグ`).join('、')})
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] text-gray-500">チーム数ごとにゲームルールを設定します。スコア入力画面に反映されます。</p>

          {teamCountGroups.map(([teamCount, leagueIds]) => (
            <div key={teamCount} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">{teamCount}チームリーグ</span>
                <span className="text-[10px] text-gray-400">({leagueIds.join(', ')}リーグ)</span>
              </div>
              <input
                type="text"
                value={gameRules[teamCount] ?? defaultRules[teamCount] ?? ''}
                onChange={e => updateGameRule(teamCount, e.target.value)}
                placeholder={`${teamCount}チームリーグのゲームルール`}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none"
              />
            </div>
          ))}

          {/* よく使うルールのプリセット */}
          <div className="pt-2 border-t border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1.5">プリセット</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                'ノーアド・6ゲームマッチ（6-6タイブレーク）',
                '6ゲーム先取（ノーアド）',
                'ノーアド・8ゲームマッチ（8-8タイブレーク）',
                '4ゲームマッチ（4-4タイブレーク）',
              ].map(preset => (
                <button
                  key={preset}
                  onClick={() => {
                    // 最初の未設定グループに適用
                    const unset = teamCountGroups.find(([c]) => !gameRules[c]);
                    if (unset) updateGameRule(unset[0], preset);
                  }}
                  className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
