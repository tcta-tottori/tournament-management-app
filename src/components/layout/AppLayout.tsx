import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Database, Users, List, Dices, Trophy,
  ClipboardList, MonitorPlay, CalendarDays, BarChart2,
  Save, HelpCircle, MoreHorizontal, Volume2, MapPin
} from 'lucide-react';

const MAIN_TABS = [
  { id: 'S-01', path: '/data', label: 'データ', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', icon: Users },
  { id: 'S-03', path: '/entry-list', label: 'リスト', icon: List },
  { id: 'S-04', path: '/draw-lot', label: '抽選', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', icon: Trophy },
  { id: 'S-06', path: '/referee', label: '対戦順', icon: ClipboardList },
  { id: 'S-07', path: '/score', label: 'スコア', icon: MonitorPlay },
  { id: 'S-08', path: '/schedule', label: '時間割', icon: CalendarDays },
];

const MORE_ITEMS = [
  { id: 'S-09', path: '/dashboard', label: 'LIVE', icon: BarChart2 },
  { id: 'S-10', path: '/backup', label: 'バックアップ', icon: Save },
  { id: 'S-11', path: '/manual', label: 'マニュアル', icon: HelpCircle },
  { id: 'S-12', path: '/broadcast', label: '放送コール', icon: Volume2 },
  { id: 'S-13', path: '/court-map', label: 'コートマップ', icon: MapPin },
];

export default function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    if (moreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as any);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [moreOpen]);

  return (
    <div className="flex flex-col h-screen bg-bg-main overflow-hidden">

      {/* ヘッダー: グラデーション背景 + 芝コート風装飾 */}
      <header
        className="relative flex items-center gap-3 px-4 h-[58px] shrink-0 z-30 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 60%, #33691e 100%)',
        }}
      >
        {/* 芝コート風テクスチャ + テニスボール装飾 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              'repeating-linear-gradient(90deg, transparent 0, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)',
              'radial-gradient(circle at 92% 50%, rgba(198,255,0,0.12) 0, rgba(198,255,0,0.06) 18px, transparent 19px)',
              'radial-gradient(circle at 85% 50%, rgba(198,255,0,0.04) 0, transparent 30px)',
            ].join(', '),
          }}
        />

        {/* ロゴ */}
        <img
          src="/logo.png"
          alt="鳥取市テニス協会"
          className="w-[42px] h-[42px] rounded-full object-cover border-2 border-[#c6ff00]/50 shrink-0 relative z-10"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* テキスト */}
        <div className="relative z-10 min-w-0">
          <p className="text-[11px] text-white/80 leading-tight tracking-wide">鳥取市テニス協会</p>
          <h1 className="text-lg font-bold text-white leading-tight tracking-tight">大会運営システム</h1>
        </div>
      </header>

      {/* 水平タブバー */}
      <nav
        className="sticky top-0 z-20 shrink-0 shadow-md"
        style={{
          background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
        }}
      >
        <div className="flex items-center">
          {/* メインタブ: 横スクロール可能 */}
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex">
              {MAIN_TABS.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors relative ${
                      isActive
                        ? 'text-white bg-white/15'
                        : 'text-white/70 hover:text-white hover:bg-white/15'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-t" style={{ background: '#c6ff00' }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          {/* 「その他」ドロップダウン */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              className={`flex items-center gap-1 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                moreOpen ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/15'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
              <span>その他</span>
            </button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-[#e0e7ef] py-1 z-50">
                {MORE_ITEMS.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#e8f5e9] text-[#2e7d32]'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main h-full">
        <Outlet />
      </main>
    </div>
  );
}
