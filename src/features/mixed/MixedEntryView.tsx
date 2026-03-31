import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { Users, RotateCcw, MapPin, Pencil } from 'lucide-react';
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

/** ペアカード - ドロー表風（スマホ対応） */
function PairCard({ team, idx }: { team: MixedTeam; idx: number }) {
  const { updateTeamPlayer } = useMixedStore();

  return (
    <div className="flex items-start gap-2 sm:gap-3 py-2 px-2 sm:px-3 border-b border-gray-100 last:border-0 hover:bg-emerald-50/30 transition-colors">
      {/* ペア番号 */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
        <span className="text-[10px] text-gray-400 font-mono">No.{team.pairNumber}</span>
        <span className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-sm">
          {idx + 1}
        </span>
      </div>

      {/* 選手情報 */}
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-0.5">
        {/* 男子 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-blue-500 font-bold shrink-0">♂</span>
          <EditableCell
            value={team.male.name}
            onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
            className="text-sm font-semibold text-gray-800 truncate"
          />
          <EditableCell
            value={team.male.affiliation}
            onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
            className="text-xs text-gray-400 truncate hidden sm:inline"
          />
        </div>
        {/* 女子 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-pink-500 font-bold shrink-0">♀</span>
          <EditableCell
            value={team.female.name}
            onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
            className="text-sm font-semibold text-gray-800 truncate"
          />
          <EditableCell
            value={team.female.affiliation}
            onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
            className="text-xs text-gray-400 truncate hidden sm:inline"
          />
        </div>
      </div>

      {/* スマホ用: 所属表示 */}
      <div className="sm:hidden text-right shrink-0">
        <div className="text-[10px] text-gray-400 truncate max-w-[60px]">{team.male.affiliation}</div>
        <div className="text-[10px] text-gray-300 truncate max-w-[60px]">{team.female.affiliation}</div>
      </div>
    </div>
  );
}

export default function MixedEntryView() {
  const { leagues, allTeams, tournamentInfo, isImported, resetAll, updateCourtName } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');

  if (!isImported) {
    return <MixedImportView />;
  }

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-4 sm:p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
              <Users size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold">ミックスダブルス エントリー</h2>
              <p className="text-emerald-200 text-xs sm:text-sm truncate">
                {tournamentInfo?.name} | {allTeams.length}ペア | {leagues.length}リーグ
                <span className="hidden sm:inline"> | 選手名クリックで編集可能</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => { if (confirm('データをすべてリセットしますか？')) resetAll(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors shrink-0"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">リセット</span>
          </button>
        </div>
      </div>

      {/* リーグごとグループ表示 - ドロー表風 */}
      <div className="space-y-3">
        {leagues.map(league => (
          <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* リーグヘッダー */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
              <span className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-base sm:text-lg font-bold rounded-lg flex items-center justify-center shadow-md shrink-0">
                {league.leagueId.trim()}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-gray-800">
                  {league.leagueId.trim()} リーグ
                  <span className="text-xs font-normal text-gray-400 ml-2">{league.teams.length}ペア</span>
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

            {/* ペアリスト */}
            <div>
              {league.teams.map((team, idx) => (
                <PairCard key={team.teamId} team={team} idx={idx} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
