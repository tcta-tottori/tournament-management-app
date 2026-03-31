import { useMixedStore } from './mixedStore';
import MixedImportView from './MixedImportView';
import { Users, RotateCcw, MapPin, Pencil, X, Check } from 'lucide-react';
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
        className="w-full px-1 py-0.5 border border-emerald-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={() => { setInput(value); setEditing(true); }}
      className={`cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 px-1 py-0.5 rounded transition-colors ${className}`}
      title="クリックで編集"
    >
      {value || <span className="text-gray-300 italic">未入力</span>}
    </span>
  );
}

/** チームカード（ドロー表風） */
function TeamCard({ team, pairNum }: { team: MixedTeam; pairNum: number }) {
  const { updateTeamPlayer } = useMixedStore();

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all overflow-hidden min-w-[200px] flex-1">
      {/* ペア番号バッジ */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-100">
        <span className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-sm">
          {pairNum}
        </span>
        <span className="text-xs text-gray-400 font-medium">No.{team.pairNumber}</span>
      </div>
      {/* 男子 */}
      <div className="px-3 py-1.5 flex items-center gap-1 border-b border-gray-50">
        <span className="text-[10px] text-blue-500 font-bold w-3 shrink-0">♂</span>
        <EditableCell
          value={team.male.name}
          onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
          className="text-sm font-semibold text-gray-800 flex-1"
        />
        <EditableCell
          value={team.male.affiliation}
          onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
          className="text-[11px] text-gray-400"
        />
      </div>
      {/* 女子 */}
      <div className="px-3 py-1.5 flex items-center gap-1">
        <span className="text-[10px] text-pink-500 font-bold w-3 shrink-0">♀</span>
        <EditableCell
          value={team.female.name}
          onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
          className="text-sm font-semibold text-gray-800 flex-1"
        />
        <EditableCell
          value={team.female.affiliation}
          onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
          className="text-[11px] text-gray-400"
        />
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
    <div className="p-4 space-y-4">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">ミックスダブルス エントリー</h2>
              <p className="text-emerald-200 text-sm">
                {tournamentInfo?.name} | {allTeams.length}ペア | {leagues.length}リーグ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="text-emerald-300 text-xs">選手名・所属をクリックで編集可能</div>
            </div>
            <button
              onClick={() => { if (confirm('データをすべてリセットしますか？')) resetAll(); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              <RotateCcw size={14} />
              リセット
            </button>
          </div>
        </div>
      </div>

      {/* リーグごとのドロー表風レイアウト */}
      <div className="space-y-3">
        {leagues.map(league => (
          <div key={league.leagueId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* リーグヘッダー */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
              <span className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-lg font-bold rounded-lg flex items-center justify-center shadow-md">
                {league.leagueId.trim()}
              </span>
              <div>
                <h3 className="text-base font-bold text-gray-800">
                  {league.leagueId.trim()} リーグ
                </h3>
                {/* コート名（編集可能） */}
                {editingCourtId === league.leagueId ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-gray-400" />
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
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors mt-0.5"
                  >
                    <MapPin size={12} />
                    {league.courtName || '(コート未設定)'}
                    <Pencil size={9} className="opacity-50" />
                  </button>
                )}
              </div>
              <div className="ml-auto text-sm text-gray-500">
                {league.teams.length}ペア
              </div>
            </div>

            {/* チームカード横並び */}
            <div className="p-3 flex gap-3 overflow-x-auto">
              {league.teams.map((team, idx) => (
                <TeamCard key={team.teamId} team={team} pairNum={idx + 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
