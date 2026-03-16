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

      {/* ===== ヘッダー: プレミアムテニスコート風 ===== */}
      <header
        className="relative flex items-center gap-4 px-5 h-[62px] shrink-0 z-30 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a2e0f 0%, #133a18 35%, #0d2b10 70%, #081f0a 100%)',
        }}
      >
        {/* コートライン装飾 — 薄い白線でテニスコートのレイアウトを暗示 */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage: [
              /* 縦のサービスライン */
              'linear-gradient(90deg, transparent 24%, rgba(255,255,255,1) 24%, rgba(255,255,255,1) 24.15%, transparent 24.15%)',
              'linear-gradient(90deg, transparent 76%, rgba(255,255,255,1) 76%, rgba(255,255,255,1) 76.15%, transparent 76.15%)',
              /* 横のベースライン */
              'linear-gradient(0deg, transparent 20%, rgba(255,255,255,1) 20%, rgba(255,255,255,1) 21%, transparent 21%)',
              'linear-gradient(0deg, transparent 79%, rgba(255,255,255,1) 79%, rgba(255,255,255,1) 80%, transparent 80%)',
              /* センターライン */
              'linear-gradient(90deg, transparent 49.9%, rgba(255,255,255,1) 49.9%, rgba(255,255,255,1) 50.1%, transparent 50.1%)',
            ].join(', '),
          }}
        />

        {/* テニスボール・グローアクセント */}
        <div
          className="absolute animate-tennis-glow rounded-full"
          style={{
            width: 10,
            height: 10,
            right: 52,
            top: 14,
            background: 'radial-gradient(circle at 35% 35%, #e4ff54, #c6ff00 40%, #8db600 100%)',
          }}
        />
        <div
          className="absolute rounded-full opacity-20"
          style={{
            width: 60,
            height: 60,
            right: 28,
            top: -8,
            background: 'radial-gradient(circle at 40% 40%, rgba(198,255,0,0.25), transparent 70%)',
          }}
        />

        {/* ロゴ */}
        <div className="relative z-10 shrink-0">
          <div
            className="rounded-full p-[2px]"
            style={{
              background: 'linear-gradient(135deg, rgba(198,255,0,0.6), rgba(198,255,0,0.15))',
            }}
          >
            <img
              src="/logo.png"
              alt="鳥取市テニス協会"
              className="w-[42px] h-[42px] rounded-full object-cover bg-[#0a2e0f]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* テキスト */}
        <div className="relative z-10 min-w-0">
          <p
            className="text-[10.5px] text-white/55 leading-tight"
            style={{ letterSpacing: '0.18em', fontVariant: 'small-caps' }}
          >
            鳥取市テニス協会
          </p>
          <h1
            className="text-[19px] font-bold text-white leading-tight"
            style={{ letterSpacing: '-0.01em' }}
          >
            大会運営システム
          </h1>
        </div>
      </header>

      {/* ===== ネットパターン・ディバイダー ===== */}
      <div className="net-divider shrink-0" style={{ background:
        'repeating-linear-gradient(90deg, rgba(198,255,0,0.25) 0px, rgba(198,255,0,0.25) 3px, transparent 3px, transparent 7px)' +
        ', linear-gradient(180deg, rgba(198,255,0,0.08), transparent)'
      }} />

      {/* ===== ナビゲーションバー: グラスモーフィズム ===== */}
      <nav
        className="sticky top-0 z-20 shrink-0"
        style={{
          background: 'linear-gradient(135deg, rgba(10,36,12,0.92) 0%, rgba(16,48,18,0.88) 100%)',
          backdropFilter: 'blur(14px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.04)',
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
                    `tab-underline relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? 'tab-active text-white'
                        : 'text-white/50 hover:text-white/90'
                    }`
                  }
                  style={{ transform: 'translateZ(0)' }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className="shrink-0 transition-transform duration-200"
                        style={{
                          width: 18,
                          height: 18,
                          filter: isActive ? 'drop-shadow(0 0 4px rgba(198,255,0,0.4))' : undefined,
                        }}
                      />
                      <span>{item.label}</span>
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
              className={`tab-underline relative flex items-center gap-1 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${
                moreOpen ? 'tab-active text-white' : 'text-white/50 hover:text-white/90'
              }`}
            >
              <MoreHorizontal style={{ width: 18, height: 18 }} />
              <span>その他</span>
            </button>

            {moreOpen && (
              <div
                className="dropdown-animate absolute right-0 top-full mt-1.5 w-52 rounded-lg py-1.5 z-50"
                style={{
                  background: 'rgba(14, 38, 16, 0.92)',
                  backdropFilter: 'blur(20px) saturate(1.5)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                  border: '1px solid rgba(198, 255, 0, 0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
                }}
              >
                {MORE_ITEMS.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                        isActive
                          ? 'text-[#c6ff00] bg-white/[0.06]'
                          : 'text-white/65 hover:text-white hover:bg-white/[0.06]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className="shrink-0"
                          style={{
                            width: 16,
                            height: 16,
                            filter: isActive ? 'drop-shadow(0 0 3px rgba(198,255,0,0.35))' : undefined,
                          }}
                        />
                        <span>{item.label}</span>
                        {isActive && (
                          <span
                            className="ml-auto w-1.5 h-1.5 rounded-full"
                            style={{
                              background: '#c6ff00',
                              boxShadow: '0 0 6px rgba(198,255,0,0.5)',
                            }}
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ===== メインコンテンツ ===== */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main h-full">
        <Outlet />
      </main>
    </div>
  );
}
