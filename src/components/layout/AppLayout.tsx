import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy,
  ClipboardList, CalendarClock, MonitorPlay, BarChart2,
  Save, HelpCircle, MoreHorizontal, ExternalLink
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import logoUrl from '/logo.png?url';

const ALL_MAIN_TABS = [
  { id: 'S-01', path: '/data', label: 'データ', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', icon: Users },

  { id: 'S-04', path: '/draw-lot', label: '抽選', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', icon: Trophy },
  { id: 'S-06', path: '/referee', label: '対戦順', icon: ClipboardList },
  { id: 'S-06b', path: '/schedule-sheet', label: '時間割', icon: CalendarClock },
  { id: 'S-07', path: '/score', label: 'スコア', icon: MonitorPlay },
  { id: 'S-09', path: '/dashboard', label: 'LIVE', icon: BarChart2 },
  { id: 'S-11', path: '/manual', label: 'マニュアル', icon: HelpCircle },
  { id: 'S-10', path: '/backup', label: 'バックアップ', icon: Save },
];

// モバイルではメイン8個 + その他5個に分割
const MOBILE_MAIN_COUNT = 8;

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
  const allTabs = useMemo(() => {
    const hasDrawEvents = (events ?? []).some(
      (e) =>
        /ミックス|団体|mixed|team/i.test(e.name) ||
        /ミックス|団体|mixed|team/i.test(e.type || '')
    );
    if (hasDrawEvents) return ALL_MAIN_TABS;
    return ALL_MAIN_TABS.filter((t) => !DRAW_TAB_PATHS.includes(t.path));
  }, [events]);

  // モバイル用: メインタブとその他に分割
  const mobileMainTabs = useMemo(() => allTabs.slice(0, MOBILE_MAIN_COUNT), [allTabs]);
  const mobileMoreTabs = useMemo(() => allTabs.slice(MOBILE_MAIN_COUNT), [allTabs]);

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
      <header className="header-main flex items-center gap-3 px-4 sm:px-5 h-[56px] shrink-0 z-30">
        {/* ゴールド波型ライン — ヘッダー全体に散りばめ */}
        <svg className="header-gold-waves" viewBox="0 0 1440 56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gold-wave-g" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(218,185,92,0)" />
              <stop offset="20%" stopColor="rgba(218,185,92,0.18)" />
              <stop offset="50%" stopColor="rgba(255,215,120,0.25)" />
              <stop offset="80%" stopColor="rgba(218,185,92,0.18)" />
              <stop offset="100%" stopColor="rgba(218,185,92,0)" />
            </linearGradient>
          </defs>
          {/* 波1 — 上部を横切る緩やかな波 */}
          <path d="M0,8 C200,3 400,14 600,8 C800,2 1000,13 1200,7 C1320,4 1400,10 1440,8" fill="none" stroke="url(#gold-wave-g)" strokeWidth="1" />
          {/* 波2 — 中央付近の大きな波 */}
          <path d="M0,26 C160,20 320,34 480,26 C640,18 800,35 960,27 C1120,19 1280,33 1440,26" fill="none" stroke="url(#gold-wave-g)" strokeWidth="1.2" opacity="0.7" />
          {/* 波3 — やや上寄りの細い波 */}
          <path d="M0,17 C240,12 480,22 720,16 C960,10 1200,23 1440,17" fill="none" stroke="url(#gold-wave-g)" strokeWidth="0.8" opacity="0.5" />
          {/* 波4 — 下寄りの波 */}
          <path d="M0,40 C180,35 360,46 540,39 C720,32 900,47 1080,40 C1260,33 1380,44 1440,40" fill="none" stroke="url(#gold-wave-g)" strokeWidth="1" opacity="0.6" />
          {/* 波5 — 最下部の細い波 */}
          <path d="M0,50 C300,46 600,54 900,49 C1100,45 1300,53 1440,50" fill="none" stroke="url(#gold-wave-g)" strokeWidth="0.7" opacity="0.4" />
        </svg>

        {/* ロゴ */}
        <img
          src={logoUrl}
          alt="鳥取市テニス協会"
          className="header-logo"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* タイトル */}
        <div className="min-w-0 flex-1">
          <p className="header-org-name">鳥取市テニス協会</p>
          <h1 className="header-title">大会運営システム</h1>
        </div>

        {/* 右側: リンク & バージョン */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://tcta-tottori.github.io/tottori-tennis-draw/"
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
            title="ドロー会議システムを開く"
          >
            <span className="hidden sm:inline">ドロー会議</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="header-version">v1.0</span>
        </div>
      </header>

      {/* ===== ナビゲーションバー ===== */}
      <nav className="nav-bar sticky top-0 z-20 shrink-0">
        <div className="flex items-center">
          {/* PC: 全タブ表示 */}
          <div className="hidden lg:flex flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex">
              {allTabs.map((item) => (
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

          {/* モバイル: メインタブ + その他ドロップダウン */}
          <div className="lg:hidden flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex">
              {mobileMainTabs.map((item) => (
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

          {/* モバイルのみ「その他」ドロップダウン */}
          <div className="lg:hidden relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              className={`nav-tab ${moreOpen ? 'nav-tab-active' : ''}`}
            >
              <MoreHorizontal style={{ width: 16, height: 16 }} />
              <span>その他</span>
            </button>

            {moreOpen && (
              <div className="dropdown-menu dropdown-animate absolute right-0 top-full mt-1 w-52 rounded-xl py-1.5 z-50">
                {mobileMoreTabs.map((item) => (
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
        <div key={location.pathname} className="page-enter min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
