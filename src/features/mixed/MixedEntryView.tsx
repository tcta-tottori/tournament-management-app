import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { MapPin, Pencil, ArrowRightLeft, UserCheck, Users, FlaskConical } from 'lucide-react';
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

/** Entry / DEF 個別ボタン */
function EntryDefButtons({ status, onSetStatus, size = 'normal' }: {
  status: 'none' | 'entry' | 'def';
  onSetStatus: (s: 'none' | 'entry' | 'def') => void;
  size?: 'normal' | 'small';
}) {
  const base = size === 'small'
    ? 'px-2.5 py-1.5 text-[11px] min-w-[44px] min-h-[32px]'
    : 'px-3 py-1.5 text-xs min-w-[48px] min-h-[36px]';
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onSetStatus(status === 'entry' ? 'none' : 'entry')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'entry'
            ? 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600'
            : 'bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 border border-gray-200'
        }`}
      >
        Entry
      </button>
      <button
        onClick={() => onSetStatus(status === 'def' ? 'none' : 'def')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'def'
            ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-600'
            : 'bg-gray-100 text-gray-400 hover:bg-orange-50 hover:text-orange-600 border border-gray-200'
        }`}
      >
        DEF
      </button>
    </div>
  );
}

/** 行の背景色 */
function rowBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-emerald-50/60';
  if (status === 'def') return 'bg-orange-50/60';
  return '';
}

export default function MixedEntryView() {
  const { leagues, allTeams, isImported, updateCourtName, updateTeamPlayer, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus, moveTeamToLeague, fillAllScoresForTest, leagueMatches } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  if (!isImported) {
    return <MixedImportView />;
  }

  const allEntry = allTeams.length > 0 && allTeams.every(t => t.status === 'entry');

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* 一括操作 */}
      <div className="flex items-center gap-2 flex-wrap">
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
        {/* テスト用: 予選リーグ全試合を6-4で入力 */}
        {leagueMatches.some(m => m.status !== 'finished') && (
          <button
            onClick={() => {
              if (confirm('テスト用：全ての予選リーグ未完了試合を6-4で入力しますか？')) {
                fillAllScoresForTest();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <FlaskConical size={13} />
            テスト: 全6-4入力
          </button>
        )}
      </div>

      <div className="space-y-3">
        {leagues.map(league => {
          const entryCount = league.teams.filter(t => t.status === 'entry').length;
          const defCount = league.teams.filter(t => t.status === 'def').length;
          const leagueAllEntry = league.teams.length > 0 && league.teams.every(t => t.status === 'entry');
          return (
            <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* リーグヘッダー — スマホ用 */}
              <div className="sm:hidden flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
                <span className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-base font-bold rounded-lg flex items-center justify-center shadow-md shrink-0">
                  {league.leagueId.trim()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-800">
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

              {/* PC: ドロー表横1行スタイル — リーグ名+コートを左端セルに統合 */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: league.teams.length * 200 + 120 }}>
                  <tbody>
                    <tr>
                      {/* リーグ名+コート列 */}
                      <td className="border border-gray-200 px-3 py-2 align-middle text-center bg-white" style={{ minWidth: 100 }}>
                        <div className="font-bold text-lg text-gray-800 leading-tight">{league.leagueId.trim()} リーグ</div>
                        {editingCourtId === league.leagueId ? (
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <input
                              type="text"
                              value={courtInput}
                              onChange={e => setCourtInput(e.target.value)}
                              onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                                if (e.key === 'Escape') setEditingCourtId(null);
                              }}
                              className="px-1.5 py-0.5 text-xs border border-emerald-400 rounded focus:outline-none w-20 text-center"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                            className="text-xs text-gray-500 hover:text-emerald-600 transition-colors mt-0.5"
                          >
                            {league.courtName || '(コート未設定)'}
                          </button>
                        )}
                        <div className="mt-1">
                          <button
                            onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                              leagueAllEntry
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            <UserCheck size={10} />
                            {leagueAllEntry ? '解除' : '全Entry'}
                          </button>
                        </div>
                      </td>
                      {/* チーム列 */}
                      {league.teams.map((team, idx) => {
                        const st = team.status || 'none';
                        const isDef = st === 'def';
                        return (
                          <td
                            key={team.teamId}
                            className={`border border-gray-200 px-2 py-1.5 align-top ${rowBg(st)} transition-colors`}
                            style={{ minWidth: 190 }}
                          >
                            <div className="flex items-start gap-1">
                              <span className="text-sm font-bold text-gray-500 mt-0.5 shrink-0 w-4 text-right">{idx + 1}</span>
                              <div className={`flex-1 min-w-0 ${isDef ? 'opacity-50 line-through' : ''}`}>
                                {/* 男子: 名前 所属 */}
                                <div className="flex items-baseline gap-1 leading-snug">
                                  <EditableCell
                                    value={team.male.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                    className="text-sm font-medium text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.male.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                    className="text-[11px] text-gray-500 whitespace-nowrap"
                                  />
                                </div>
                                {/* 女子: 名前 所属 */}
                                <div className="flex items-baseline gap-1 leading-snug">
                                  <EditableCell
                                    value={team.female.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                    className="text-sm font-medium text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.female.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                    className="text-[11px] text-gray-500 whitespace-nowrap"
                                  />
                                </div>
                              </div>
                            </div>
                            {/* 操作ボタン */}
                            <div className="flex items-center gap-1 mt-1 justify-end">
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

              {/* スマホ: リスト表示 — 名前と所属の間にラインを統一配置 */}
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
                          {/* 名前 | 所属 を固定幅テーブルで揃える */}
                          <table className="w-full border-collapse">
                            <tbody>
                              <tr>
                                <td className="w-[5.5em] pr-1 border-r border-gray-200 align-baseline">
                                  <EditableCell
                                    value={team.male.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                    className="text-sm font-medium text-gray-800 block truncate"
                                  />
                                </td>
                                <td className="pl-1.5 align-baseline">
                                  <EditableCell
                                    value={team.male.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                    className="text-[11px] text-gray-500 block truncate"
                                  />
                                </td>
                              </tr>
                              <tr>
                                <td className="w-[5.5em] pr-1 border-r border-gray-200 align-baseline">
                                  <EditableCell
                                    value={team.female.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                    className="text-sm font-medium text-gray-800 block truncate"
                                  />
                                </td>
                                <td className="pl-1.5 align-baseline">
                                  <EditableCell
                                    value={team.female.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                    className="text-[11px] text-gray-500 block truncate"
                                  />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* 操作ボタン行 */}
                      <div className="flex items-center justify-end gap-1 mt-1.5 pl-7">
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

      <div className="text-center text-xs text-gray-400 py-2">
        全{allTeams.length}ペア / {leagues.length}リーグ / Entry {allTeams.filter(t => t.status === 'entry').length} / DEF {allTeams.filter(t => t.status === 'def').length}
      </div>
    </div>
  );
}
