import { NavLink, Outlet } from 'react-router-dom';
import { Trophy, Users, Radio, Info } from 'lucide-react';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';

/**
 * 参加者・HP訪問者向け公開ビューのレイアウト
 * 運営用の左側ドロワーや編集機能を排し、
 * 予選リーグ / 決勝トーナメント / LIVE の3タブのみを提供する。
 */
export default function PublicLayout() {
  const mixedInfo = useMixedStore(s => s.tournamentInfo);
  const teamInfo = useTeamStore(s => s.tournamentInfo);
  const info = mixedInfo || teamInfo;

  const tabs = [
    { to: 'league', label: '予選リーグ', icon: Users },
    { to: 'bracket', label: '決勝トーナメント', icon: Trophy },
    { to: 'live', label: 'LIVE', icon: Radio },
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-t-lg transition-all border-b-2 ${
      isActive
        ? 'bg-white text-emerald-700 border-emerald-500'
        : 'bg-white/10 text-white/80 border-transparent hover:bg-white/20'
    }`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 md:w-6 md:h-6 text-amber-300" />
                {info?.name || '大会情報'}
              </h1>
              {info && (
                <p className="text-[11px] md:text-xs text-white/80 mt-0.5">
                  {[info.date, info.venue].filter(Boolean).join(' / ')}
                </p>
              )}
            </div>
            <span className="text-[10px] md:text-xs bg-white/15 border border-white/20 rounded-full px-2.5 py-1 font-bold">
              観戦用ページ
            </span>
          </div>

          <nav className="flex gap-1 mt-4 -mb-[2px]" aria-label="公開ビュータブ">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} className={linkClass}>
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 md:px-4 py-4">
        {!info ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
            <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">大会データが読み込まれていません。</p>
            <p className="text-gray-400 text-xs mt-1">運営者による大会データ登録後にご覧いただけます。</p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <footer className="text-center text-[10px] text-gray-400 py-3">
        大会運営統合Webアプリケーション
      </footer>
    </div>
  );
}
