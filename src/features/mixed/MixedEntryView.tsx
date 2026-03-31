import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { MapPin, Pencil, ArrowRightLeft, UserX, UserCheck } from 'lucide-react';
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
      onClick={() => { setInput(value); setEditing(true); }}
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
        onClick={() => setOpen(true)}
        className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
        title="リーグ移動"
      >
        <ArrowRightLeft size={13} />
      </button>
    );
  }

  return (
    <div className="relative">
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

export default function MixedEntryView() {
  const { leagues, allTeams, isImported, updateCourtName, updateTeamPlayer, setTeamStatus, moveTeamToLeague } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  if (!isImported) {
    return <MixedImportView />;
  }

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* リーグごとグループ表示 */}
      <div className="space-y-3">
        {leagues.map(league => {
          const entryCount = league.teams.filter(t => (t.status || 'entry') === 'entry').length;
          const defCount = league.teams.filter(t => t.status === 'def').length;

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
                      {entryCount}ペア{defCount > 0 && ` / DEF ${defCount}`}
                    </span>
                  </h3>
                  {/* コート名 */}
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
              </div>

              {/* PC: テーブル表示 */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="px-2 py-1.5 text-center w-8">#</th>
                      <th className="px-2 py-1.5 text-left">選手名</th>
                      <th className="px-2 py-1.5 text-left">所属</th>
                      <th className="px-2 py-1.5 text-center w-20">状態</th>
                      <th className="px-2 py-1.5 text-center w-10">移動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.teams.map((team, idx) => {
                      const isDef = team.status === 'def';
                      return (
                        <tr key={team.teamId} className={`border-t border-gray-100 ${isDef ? 'bg-red-50/40' : 'hover:bg-emerald-50/30'} transition-colors`}>
                          <td className="px-2 py-1.5 text-center" rowSpan={1}>
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[11px] font-bold rounded-full shadow-sm">
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <div className={`leading-tight ${isDef ? 'opacity-50 line-through' : ''}`}>
                              <div>
                                <EditableCell
                                  value={team.male.name}
                                  onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                  className="text-sm font-semibold text-gray-800"
                                />
                              </div>
                              <div>
                                <EditableCell
                                  value={team.female.name}
                                  onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                  className="text-sm text-gray-600"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <div className={`leading-tight ${isDef ? 'opacity-50' : ''}`}>
                              <div>
                                <EditableCell
                                  value={team.male.affiliation}
                                  onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                  className="text-xs text-gray-500"
                                />
                              </div>
                              <div>
                                <EditableCell
                                  value={team.female.affiliation}
                                  onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                  className="text-xs text-gray-400"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => setTeamStatus(team.teamId, isDef ? 'entry' : 'def')}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                                isDef
                                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {isDef ? <><UserX size={11} />DEF</> : <><UserCheck size={11} />Entry</>}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-center">
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
                  const isDef = team.status === 'def';
                  return (
                    <div key={team.teamId} className={`px-3 py-2 ${isDef ? 'bg-red-50/40' : ''}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className={`flex-1 min-w-0 ${isDef ? 'opacity-50' : ''}`}>
                          {/* 男子 */}
                          <div className="flex items-baseline gap-1">
                            <EditableCell
                              value={team.male.name}
                              onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                              className="text-sm font-semibold text-gray-800"
                            />
                            <EditableCell
                              value={team.male.affiliation}
                              onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                              className="text-[11px] text-gray-400"
                            />
                          </div>
                          {/* 女子 */}
                          <div className="flex items-baseline gap-1">
                            <EditableCell
                              value={team.female.name}
                              onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                              className="text-sm text-gray-600"
                            />
                            <EditableCell
                              value={team.female.affiliation}
                              onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                              className="text-[11px] text-gray-300"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setTeamStatus(team.teamId, isDef ? 'entry' : 'def')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isDef ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isDef ? 'DEF' : 'Entry'}
                          </button>
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

      {/* サマリー */}
      <div className="text-center text-xs text-gray-400 py-2">
        全{allTeams.length}ペア / {leagues.length}リーグ / Entry {allTeams.filter(t => (t.status || 'entry') === 'entry').length} / DEF {allTeams.filter(t => t.status === 'def').length}
      </div>
    </div>
  );
}
