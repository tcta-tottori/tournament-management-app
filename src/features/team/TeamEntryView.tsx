import { useState } from 'react';
import { Check, X, Users, AlertTriangle } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { TeamEntry, TeamLeague } from './types';

/** リーグバッジカラー (MixedLeagueView と統一) */
const LEAGUE_COLORS = [
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', header: 'from-emerald-500 to-teal-600' },
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', header: 'from-blue-500 to-indigo-600' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', header: 'from-purple-500 to-violet-600' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700', header: 'from-rose-500 to-pink-600' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', header: 'from-amber-500 to-orange-600' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', header: 'from-cyan-500 to-sky-600' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-700', header: 'from-lime-500 to-green-600' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-700', header: 'from-fuchsia-500 to-purple-600' },
];

function getLeagueColor(index: number) {
  return LEAGUE_COLORS[index % LEAGUE_COLORS.length];
}

/** 丸数字マッピング */
const CIRCLE_NUMBERS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳','㉑','㉒','㉓','㉔','㉕'];

function circleNumber(n: number): string {
  return CIRCLE_NUMBERS[n - 1] || `(${n})`;
}

/** ステータスバッジ */
function StatusBadge({ status }: { status: TeamEntry['status'] }) {
  switch (status) {
    case 'entry':
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
          <Check className="w-3 h-3" />
          Entry
        </span>
      );
    case 'def':
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
          <X className="w-3 h-3" />
          DEF
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-300">
          未設定
        </span>
      );
  }
}

/** 個別チームカード */
function TeamCard({
  team,
  colorIndex,
  onSetStatus,
}: {
  team: TeamEntry;
  colorIndex: number;
  onSetStatus: (teamId: string, status: TeamEntry['status']) => void;
}) {
  const color = getLeagueColor(colorIndex);
  const femaleMembers = team.members.filter(m => m.gender === 'F');
  const maleMembers = team.members.filter(m => m.gender === 'M');

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all ${
        team.status === 'def'
          ? 'border-red-300 bg-red-50/50 opacity-70'
          : team.status === 'entry'
          ? 'border-green-300 bg-white shadow-sm'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* チームヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${color.badge.split(' ')[1] || 'text-gray-700'}`}>
            {circleNumber(team.teamNumber)}
          </span>
          <span className="font-semibold text-gray-800 text-sm">{team.teamName}</span>
          <StatusBadge status={team.status} />
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded ${color.badge}`}>
          {team.leagueId}-{team.numberInLeague}
        </span>
      </div>

      {/* メンバーリスト */}
      <div className="px-3 py-2 space-y-1">
        {femaleMembers.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-xs font-bold text-pink-600 bg-pink-50 px-1 py-0.5 rounded shrink-0">F</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {femaleMembers.map((m, i) => (
                <span key={i} className="text-xs text-gray-700">{m.player.name}</span>
              ))}
            </div>
          </div>
        )}
        {maleMembers.length > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded shrink-0">M</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {maleMembers.map((m, i) => (
                <span key={i} className="text-xs text-gray-700">{m.player.name}</span>
              ))}
            </div>
          </div>
        )}
        {team.members.length === 0 && (
          <div className="text-xs text-gray-400 italic">メンバー未登録</div>
        )}
      </div>

      {/* ステータス切替ボタン */}
      <div className="flex border-t border-gray-100">
        <button
          onClick={() => onSetStatus(team.teamId, 'none')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            team.status === 'none'
              ? 'bg-gray-200 text-gray-700'
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          未設定
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'entry')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors border-x border-gray-100 ${
            team.status === 'entry'
              ? 'bg-green-500 text-white'
              : 'bg-white text-gray-400 hover:bg-green-50'
          }`}
        >
          <span className="flex items-center justify-center gap-0.5">
            <Check className="w-3 h-3" />
            Entry
          </span>
        </button>
        <button
          onClick={() => onSetStatus(team.teamId, 'def')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            team.status === 'def'
              ? 'bg-red-500 text-white'
              : 'bg-white text-gray-400 hover:bg-red-50'
          }`}
        >
          <span className="flex items-center justify-center gap-0.5">
            <X className="w-3 h-3" />
            DEF
          </span>
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
  const color = getLeagueColor(leagueIndex);
  const entryCount = league.teams.filter(t => t.status === 'entry').length;
  const defCount = league.teams.filter(t => t.status === 'def').length;
  const totalCount = league.teams.length;
  const decidedCount = entryCount + defCount;
  const allDecided = decidedCount === totalCount;

  return (
    <div className={`rounded-xl border-2 ${color.border} overflow-hidden`}>
      {/* リーグヘッダー */}
      <div className={`bg-gradient-to-r ${color.header} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black">{league.leagueId}リーグ</span>
            <span className="text-sm opacity-90">{league.courtName}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* 進捗表示 */}
            <div className="flex items-center gap-1.5">
              {allDecided ? (
                <Check className="w-4 h-4 text-green-200" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-200" />
              )}
              <span className="text-sm font-medium">
                {entryCount}/{totalCount} エントリー
                {defCount > 0 && <span className="ml-1 text-red-200">({defCount} DEF)</span>}
              </span>
            </div>
            {/* 全エントリーボタン */}
            <button
              onClick={() => onSetLeagueAll(league.leagueId, 'entry')}
              className="px-3 py-1 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg transition-colors backdrop-blur-sm"
            >
              全エントリー
            </button>
          </div>
        </div>
        {/* プログレスバー */}
        <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 rounded-full transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (entryCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* チームカード一覧 */}
      <div className={`bg-gradient-to-b ${color.light} p-3`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    </div>
  );
}

/** メインコンポーネント */
export default function TeamEntryView() {
  const { leagues, allTeams, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus } = useTeamStore();
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(
    new Set(leagues.map(l => l.leagueId))
  );

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Users className="w-12 h-12 mb-3" />
        <p className="text-lg font-medium">データがありません</p>
        <p className="text-sm">Excelファイルをインポートしてください</p>
      </div>
    );
  }

  // 全体サマリー
  const totalTeams = allTeams.length;
  const totalEntry = allTeams.filter(t => t.status === 'entry').length;
  const totalDef = allTeams.filter(t => t.status === 'def').length;
  const totalNone = totalTeams - totalEntry - totalDef;

  return (
    <div className="space-y-4">
      {/* 全体サマリーバー */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              団体戦エントリー
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="font-medium text-gray-700">{totalEntry}</span>
                <span className="text-gray-400">エントリー</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-medium text-gray-700">{totalDef}</span>
                <span className="text-gray-400">DEF</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                <span className="font-medium text-gray-700">{totalNone}</span>
                <span className="text-gray-400">未設定</span>
              </span>
              <span className="text-gray-300">|</span>
              <span className="font-semibold text-gray-800">{totalTeams} チーム</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAllTeamsStatus('entry')}
              className="px-4 py-2 text-sm font-bold bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm"
            >
              全チーム エントリー
            </button>
            <button
              onClick={() => setAllTeamsStatus('none')}
              className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            >
              全リセット
            </button>
          </div>
        </div>
        {/* 全体プログレスバー */}
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${totalTeams > 0 ? (totalEntry / totalTeams) * 100 : 0}%` }}
          />
          <div
            className="h-full bg-red-400 transition-all duration-300"
            style={{ width: `${totalTeams > 0 ? (totalDef / totalTeams) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* リーグ別セクション */}
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
  );
}
