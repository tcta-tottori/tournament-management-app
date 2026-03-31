import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { MapPin, Pencil, ArrowRightLeft, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import type { MixedTeam } from './types';

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
        className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
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
        className="text-xs border border-emerald-400 rounded px-1 py-0.5 focus:outline-none"
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

/** 3状態ステータスボタン */
function StatusButton({ status, onClick, size = 'normal' }: {
  status: 'none' | 'entry' | 'def';
  onClick: () => void;
  size?: 'normal' | 'small';
}) {
  const cls = size === 'small' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]';
  if (status === 'entry') {
    return <button onClick={e => { e.stopPropagation(); onClick(); }} className={`${cls} rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors`}>Entry</button>;
  }
  if (status === 'def') {
    return <button onClick={e => { e.stopPropagation(); onClick(); }} className={`${cls} rounded-full font-medium bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors`}>DEF</button>;
  }
  return <button onClick={e => { e.stopPropagation(); onClick(); }} className={`${cls} rounded-full font-medium bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors`}>未登録</button>;
}

function cycleStatus(current: 'none' | 'entry' | 'def'): 'none' | 'entry' | 'def' {
  if (current === 'none') return 'entry';
  if (current === 'entry') return 'def';
  return 'none';
}

/** 行の背景色 */
function rowBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-emerald-50/60';
  if (status === 'def') return 'bg-orange-50/60';
  return '';
}

export default function MixedEntryView() {
  const { leagues, allTeams, isImported, updateCourtName, updateTeamPlayer, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus, moveTeamToLeague } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  if (!isImported) {
    return <MixedImportView />;
  }

  const allEntry = allTeams.length > 0 && allTeams.every(t => t.status === 'entry');

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* 一括操作 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAllTeamsStatus(allEntry ? 'none' : 'entry')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            allEntry
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Users size={13} />
          {allEntry ? '全員Entry解除' : '全員Entry'}
        </button>
      </div>

      <div className="space-y-3">
        {leagues.map(league => {
          const entryCount = league.teams.filter(t => t.status === 'entry').length;
          const defCount = league.teams.filter(t => t.status === 'def').length;
          const leagueAllEntry = league.teams.length > 0 && league.teams.every(t => t.status === 'entry');
          return (
            <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* リーグヘッダー */}
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
                <span className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-base sm:text-lg font-bold rounded-lg flex items-center justify-center shadow-md shrink-0">
                  {league.leagueId.trim()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-gray-800">
                    {league.leagueId.trim()} リーグ
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      {league.teams.length}ペア
                      {entryCount > 0 && <span className="text-emerald-600 ml-1">Entry {entryCount}</span>}
                      {defCount > 0 && <span className="text-orange-500 ml-1">DEF {defCount}</span>}
                    </span>
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
                        className="px-1.5 py-0.5 text-xs border border-emerald-400 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 w-28"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                    >
                      <MapPin size={11} />
                      {league.courtName || '(コート未設定)'}
                      <Pencil size={9} className="opacity-40" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 ${
                    leagueAllEntry
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-white/80 text-gray-500 hover:bg-white hover:text-emerald-600 border border-gray-200'
                  }`}
                >
                  <UserCheck size={12} />
                  {leagueAllEntry ? 'Entry解除' : '全員Entry'}
                </button>
              </div>

              {/* PC: ドロー表スタイルのテーブル表示 */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 560 }}>
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="px-2 py-1 text-center w-8">#</th>
                      <th className="px-2 py-1 text-left min-w-[140px]">ペア名</th>
                      <th className="px-2 py-1 text-left min-w-[80px]">所属</th>
                      <th className="px-2 py-1 text-center w-20">状態</th>
                      <th className="px-2 py-1 text-center w-10">移動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.teams.map((team, idx) => {
                      const st = team.status || 'none';
                      const isDef = st === 'def';
                      return (
                        <tr key={team.teamId} className={`border-t border-gray-100 ${rowBg(st)} transition-colors`}>
                          <td className="px-2 py-1 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <div className={`${isDef ? 'opacity-50 line-through' : ''}`}>
                              <div className="flex items-center gap-0.5">
                                <EditableCell
                                  value={team.male.name}
                                  onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                  className="text-xs font-medium text-gray-800"
                                />
                              </div>
                              <div className="flex items-center gap-0.5">
                                <EditableCell
                                  value={team.female.name}
                                  onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                  className="text-xs font-medium text-gray-800"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <div className={`${isDef ? 'opacity-50' : ''}`}>
                              <div>
                                <EditableCell
                                  value={team.male.affiliation}
                                  onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                  className="text-[11px] text-gray-500"
                                />
                              </div>
                              <div>
                                <EditableCell
                                  value={team.female.affiliation}
                                  onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                  className="text-[11px] text-gray-500"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center">
                            <StatusButton status={st} onClick={() => setTeamStatus(team.teamId, cycleStatus(st))} />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* スマホ: リスト表示 */}
              <div className="sm:hidden divide-y divide-gray-100">
                {league.teams.map((team, idx) => {
                  const st = team.status || 'none';
                  const isDef = st === 'def';
                  return (
                    <div key={team.teamId} className={`px-3 py-2 ${rowBg(st)}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className={`flex-1 min-w-0 ${isDef ? 'opacity-50' : ''}`}>
                          <div className="flex items-baseline gap-1">
                            <EditableCell
                              value={team.male.name}
                              onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                              className="text-sm font-medium text-gray-800"
                            />
                            <EditableCell
                              value={team.male.affiliation}
                              onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                              className="text-[11px] text-gray-500"
                            />
                          </div>
                          <div className="flex items-baseline gap-1">
                            <EditableCell
                              value={team.female.name}
                              onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                              className="text-sm font-medium text-gray-800"
                            />
                            <EditableCell
                              value={team.female.affiliation}
                              onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                              className="text-[11px] text-gray-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <StatusButton status={st} onClick={() => setTeamStatus(team.teamId, cycleStatus(st))} size="small" />
                          <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs text-gray-400 py-2">
        全{allTeams.length}ペア / {leagues.length}リーグ / Entry {allTeams.filter(t => t.status === 'entry').length} / DEF {allTeams.filter(t => t.status === 'def').length}
      </div>
    </div>
  );
}
