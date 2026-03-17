import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Database, Users, List, Dices, Trophy,
  ClipboardList, MonitorPlay, CalendarDays, BarChart2,
  Save, HelpCircle, MoreHorizontal, Volume2, MapPin
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import logoUrl from '/logo.png?url';

const ALL_MAIN_TABS = [
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

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

export default function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);

  // 現在の大会に紐づく種目を取得
  const events = useLiveQuery(
    () =>
      currentTournamentId
        ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
        : [],
    [currentTournamentId]
  );

  // ミックス or 団体戦の種目があるかどうかでタブを出し分け
  const mainTabs = useMemo(() => {
    const hasDrawEvents = (events ?? []).some(
      (e) =>
        /ミックス|団体|mixed|team/i.test(e.name) ||
        /ミックス|団体|mixed|team/i.test(e.type || '')
    );
    if (hasDrawEvents) return ALL_MAIN_TABS;
    return ALL_MAIN_TABS.filter((t) => !DRAW_TAB_PATHS.includes(t.path));
  }, [events]);

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

      {/* ===== ヘッダー ===== */}
      <header className="header-main relative flex items-center gap-4 px-5 h-[64px] shrink-0 z-30 overflow-visible">
        {/* 背景テニスコートライン装飾 */}
        <div className="header-court-lines" />

        {/* テニスボール装飾（右上） */}
        <div className="header-tennis-ball" />

        {/* ロゴ */}
        <img
          src={logoUrl}
          alt="鳥取市テニス協会"
          className="relative z-10 w-[46px] h-[46px] rounded-[12px] object-cover shrink-0"
          style={{
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25), 0 0 0 1px rgba(212,225,87,0.08)',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* テキスト */}
        <div className="relative z-10 min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold leading-tight tracking-[0.25em] uppercase"
            style={{ color: '#c9a55a' }}
          >
            鳥取市テニス協会
          </p>
          <h1 className="text-[19px] font-extrabold text-white leading-tight tracking-wide">
            大会運営システム
          </h1>
        </div>

        {/* バージョン情報 */}
        <div className="relative z-10 flex flex-col items-end ml-auto mr-1 gap-0.5">
          <span
            className="text-[11px] font-bold text-white px-2.5 py-0.5 rounded-md leading-normal"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(201,165,90,0.12))',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            v1.0
          </span>
          <span className="text-[10px] text-white/40 text-right">
            2026.3.17 更新
          </span>
        </div>

        {/* 日本海の海岸線ウェーブ装飾 */}
        <svg
          className="header-wave"
          viewBox="0 0 1440 16"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,8 C120,14 240,2 360,8 C480,14 600,2 720,8 C840,14 960,2 1080,8 C1200,14 1320,2 1440,8 L1440,16 L0,16 Z"
            fill="#1b4d3e"
          />
        </svg>
      </header>

      {/* ===== ナビゲーションバー ===== */}
      <nav className="nav-bar sticky top-0 z-20 shrink-0">
        <div className="flex items-center">
          {/* メインタブ */}
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex">
              {mainTabs.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    `nav-tab ${isActive ? 'nav-tab-active' : ''}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className="shrink-0"
                        style={{
                          width: 16,
                          height: 16,
                          filter: isActive ? 'drop-shadow(0 0 4px rgba(212,225,87,0.5))' : undefined,
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
              className={`nav-tab ${moreOpen ? 'nav-tab-active' : ''}`}
            >
              <MoreHorizontal style={{ width: 16, height: 16 }} />
              <span>その他</span>
            </button>

            {moreOpen && (
              <div className="dropdown-menu dropdown-animate absolute right-0 top-full mt-1 w-52 rounded-xl py-1.5 z-50">
                {MORE_ITEMS.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `dropdown-item ${isActive ? 'dropdown-item-active' : ''}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="shrink-0 w-4 h-4" />
                        <span>{item.label}</span>
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#d4e157] shadow-[0_0_6px_rgba(212,225,87,0.6)]" />
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

      {/* ===== メインコンテンツ（ページ遷移アニメーション） ===== */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main h-full">
        <div key={location.pathname} className="page-enter h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
