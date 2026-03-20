import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy,
  ClipboardList, CalendarClock, MonitorPlay, BarChart2,
  HelpCircle, ExternalLink
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
];

// モバイルでも全タブ表示（その他ドロップダウン廃止）
const MOBILE_MAIN_COUNT = 99;

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

// 金の砂粒の配置データ（固定位置・サイズ・不透明度）
const GOLD_DUST_PARTICLES = [
  { x: 3, y: 15, s: 2.5, o: 0.5 }, { x: 8, y: 42, s: 1.8, o: 0.35 }, { x: 12, y: 8, s: 1.5, o: 0.6 },
  { x: 17, y: 50, s: 2, o: 0.3 }, { x: 22, y: 25, s: 3, o: 0.45 }, { x: 26, y: 38, s: 1.2, o: 0.55 },
  { x: 31, y: 12, s: 2.2, o: 0.4 }, { x: 35, y: 45, s: 1.8, o: 0.5 }, { x: 39, y: 30, s: 2.5, o: 0.3 },
  { x: 44, y: 18, s: 1.5, o: 0.65 }, { x: 48, y: 48, s: 2, o: 0.35 }, { x: 52, y: 10, s: 2.8, o: 0.4 },
  { x: 56, y: 35, s: 1.3, o: 0.55 }, { x: 60, y: 22, s: 2.2, o: 0.45 }, { x: 64, y: 50, s: 1.8, o: 0.3 },
  { x: 68, y: 40, s: 2.5, o: 0.5 }, { x: 72, y: 8, s: 1.5, o: 0.6 }, { x: 76, y: 28, s: 2, o: 0.35 },
  { x: 80, y: 45, s: 3, o: 0.4 }, { x: 84, y: 15, s: 1.8, o: 0.5 }, { x: 88, y: 38, s: 2.2, o: 0.3 },
  { x: 92, y: 52, s: 1.5, o: 0.55 }, { x: 96, y: 20, s: 2, o: 0.45 }, { x: 5, y: 32, s: 1.2, o: 0.4 },
  { x: 15, y: 48, s: 1, o: 0.5 }, { x: 28, y: 5, s: 1.8, o: 0.35 }, { x: 42, y: 42, s: 1.5, o: 0.6 },
  { x: 55, y: 28, s: 2.5, o: 0.3 }, { x: 70, y: 52, s: 1, o: 0.55 }, { x: 85, y: 32, s: 2, o: 0.4 },
  { x: 20, y: 55, s: 1.5, o: 0.35 }, { x: 37, y: 5, s: 2, o: 0.5 }, { x: 50, y: 55, s: 1.2, o: 0.45 },
  { x: 63, y: 5, s: 1.8, o: 0.55 }, { x: 78, y: 55, s: 1.5, o: 0.3 }, { x: 90, y: 10, s: 2.5, o: 0.4 },
];

export default function AppLayout() {
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

  // モバイル用: 全タブ表示
  const mobileMainTabs = useMemo(() => allTabs, [allTabs]);

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

        {/* 金の砂粒エフェクト */}
        <div className="header-gold-dust">
          {GOLD_DUST_PARTICLES.map((p, i) => (
            <span key={i} className="dust" style={{
              left: `${p.x}%`, top: `${p.y}%`,
              width: p.s, height: p.s, opacity: p.o,
            }} />
          ))}
        </div>

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
          <div className="flex flex-col items-center">
            <span className="header-version">v1.1</span>
            <span className="text-[8px] text-white/40 leading-tight mt-0.5 whitespace-nowrap">{__BUILD_TIMESTAMP__}</span>
          </div>
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
