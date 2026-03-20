import { useMemo } from 'react';
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

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

// 金の砂粒の配置データ（固定位置・サイズ・不透明度・タイプ）
// type: 0=微粒子, 1=中粒子, 2=大粒子（輝き強め）
const GOLD_DUST_PARTICLES = [
  // 微粒子 — 広域に散布
  { x: 2, y: 12, s: 1.2, o: 0.4, t: 0 }, { x: 6, y: 45, s: 1, o: 0.3, t: 0 }, { x: 10, y: 28, s: 1.5, o: 0.35, t: 0 },
  { x: 14, y: 8, s: 1, o: 0.5, t: 0 }, { x: 18, y: 52, s: 1.3, o: 0.25, t: 0 }, { x: 23, y: 35, s: 1, o: 0.4, t: 0 },
  { x: 27, y: 18, s: 1.2, o: 0.3, t: 0 }, { x: 32, y: 48, s: 1, o: 0.45, t: 0 }, { x: 36, y: 10, s: 1.5, o: 0.3, t: 0 },
  { x: 41, y: 40, s: 1, o: 0.35, t: 0 }, { x: 46, y: 22, s: 1.3, o: 0.4, t: 0 }, { x: 51, y: 55, s: 1, o: 0.25, t: 0 },
  { x: 55, y: 15, s: 1.2, o: 0.45, t: 0 }, { x: 59, y: 42, s: 1, o: 0.3, t: 0 }, { x: 64, y: 30, s: 1.5, o: 0.35, t: 0 },
  { x: 69, y: 8, s: 1, o: 0.5, t: 0 }, { x: 73, y: 50, s: 1.3, o: 0.25, t: 0 }, { x: 78, y: 25, s: 1, o: 0.4, t: 0 },
  { x: 83, y: 45, s: 1.2, o: 0.3, t: 0 }, { x: 88, y: 12, s: 1, o: 0.45, t: 0 }, { x: 93, y: 38, s: 1.5, o: 0.3, t: 0 },
  { x: 97, y: 20, s: 1, o: 0.35, t: 0 }, { x: 4, y: 55, s: 1.3, o: 0.25, t: 0 }, { x: 16, y: 30, s: 1, o: 0.4, t: 0 },
  // 中粒子 — 間隔を開けて配置
  { x: 5, y: 20, s: 2.2, o: 0.45, t: 1 }, { x: 13, y: 42, s: 2, o: 0.35, t: 1 }, { x: 21, y: 10, s: 2.5, o: 0.5, t: 1 },
  { x: 30, y: 50, s: 2, o: 0.3, t: 1 }, { x: 38, y: 25, s: 2.2, o: 0.45, t: 1 }, { x: 47, y: 48, s: 2.5, o: 0.35, t: 1 },
  { x: 54, y: 15, s: 2, o: 0.5, t: 1 }, { x: 62, y: 38, s: 2.2, o: 0.3, t: 1 }, { x: 71, y: 52, s: 2.5, o: 0.4, t: 1 },
  { x: 79, y: 18, s: 2, o: 0.45, t: 1 }, { x: 86, y: 42, s: 2.2, o: 0.35, t: 1 }, { x: 95, y: 28, s: 2.5, o: 0.5, t: 1 },
  // 大粒子（輝き） — まばらに配置
  { x: 8, y: 30, s: 3.5, o: 0.55, t: 2 }, { x: 25, y: 15, s: 3, o: 0.5, t: 2 }, { x: 43, y: 45, s: 3.5, o: 0.45, t: 2 },
  { x: 58, y: 10, s: 3, o: 0.55, t: 2 }, { x: 75, y: 35, s: 3.5, o: 0.5, t: 2 }, { x: 91, y: 48, s: 3, o: 0.45, t: 2 },
  // 追加の微粒子 — 密度アップ
  { x: 1, y: 38, s: 0.8, o: 0.2, t: 0 }, { x: 9, y: 5, s: 0.8, o: 0.25, t: 0 }, { x: 19, y: 58, s: 0.8, o: 0.2, t: 0 },
  { x: 29, y: 5, s: 0.8, o: 0.3, t: 0 }, { x: 39, y: 55, s: 0.8, o: 0.2, t: 0 }, { x: 49, y: 5, s: 0.8, o: 0.25, t: 0 },
  { x: 60, y: 58, s: 0.8, o: 0.2, t: 0 }, { x: 70, y: 5, s: 0.8, o: 0.3, t: 0 }, { x: 81, y: 55, s: 0.8, o: 0.2, t: 0 },
  { x: 92, y: 5, s: 0.8, o: 0.25, t: 0 },
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
        {/* 動的ゴールド波型ライン — アニメーション付き */}
        <div className="header-gold-waves-container">
          {/* 波レイヤー1 — 右方向にゆっくり流れる */}
          <svg className="header-wave header-wave-1" viewBox="0 0 2880 56" preserveAspectRatio="none">
            <defs>
              <linearGradient id="gw1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(218,185,92,0.12)" />
                <stop offset="25%" stopColor="rgba(255,215,120,0.28)" />
                <stop offset="50%" stopColor="rgba(218,185,92,0.08)" />
                <stop offset="75%" stopColor="rgba(255,215,120,0.25)" />
                <stop offset="100%" stopColor="rgba(218,185,92,0.12)" />
              </linearGradient>
            </defs>
            <path d="M0,10 C120,4 240,18 360,10 C480,2 600,16 720,8 C840,0 960,18 1080,12 C1200,6 1320,20 1440,10 C1560,4 1680,18 1800,10 C1920,2 2040,16 2160,8 C2280,0 2400,18 2520,12 C2640,6 2760,20 2880,10" fill="none" stroke="url(#gw1)" strokeWidth="1.5" />
            <path d="M0,30 C100,22 200,38 300,28 C400,18 500,40 600,30 C700,20 800,38 900,28 C1000,18 1100,40 1200,30 C1300,22 1400,38 1500,28 C1600,18 1700,40 1800,30 C1900,20 2000,38 2100,28 C2200,18 2300,40 2400,30 C2500,22 2600,38 2700,28 C2800,18 2880,32 2880,30" fill="none" stroke="url(#gw1)" strokeWidth="1" opacity="0.6" />
          </svg>
          {/* 波レイヤー2 — 左方向にゆっくり流れる（逆方向） */}
          <svg className="header-wave header-wave-2" viewBox="0 0 2880 56" preserveAspectRatio="none">
            <defs>
              <linearGradient id="gw2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,215,120,0.08)" />
                <stop offset="30%" stopColor="rgba(218,185,92,0.2)" />
                <stop offset="60%" stopColor="rgba(255,215,120,0.15)" />
                <stop offset="100%" stopColor="rgba(218,185,92,0.08)" />
              </linearGradient>
            </defs>
            <path d="M0,20 C180,14 360,28 540,18 C720,8 900,30 1080,22 C1260,14 1440,28 1620,18 C1800,8 1980,30 2160,22 C2340,14 2520,28 2700,18 C2880,8 2880,20 2880,20" fill="none" stroke="url(#gw2)" strokeWidth="1.2" />
            <path d="M0,44 C200,38 400,50 600,42 C800,34 1000,52 1200,44 C1400,36 1600,50 1800,42 C2000,34 2200,52 2400,44 C2600,36 2800,50 2880,44" fill="none" stroke="url(#gw2)" strokeWidth="0.8" opacity="0.5" />
          </svg>
          {/* 波レイヤー3 — ゆらぎ（上下に揺れる） */}
          <svg className="header-wave header-wave-3" viewBox="0 0 1440 56" preserveAspectRatio="none">
            <defs>
              <linearGradient id="gw3" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(218,185,92,0)" />
                <stop offset="40%" stopColor="rgba(255,225,140,0.18)" />
                <stop offset="60%" stopColor="rgba(255,225,140,0.18)" />
                <stop offset="100%" stopColor="rgba(218,185,92,0)" />
              </linearGradient>
            </defs>
            <path d="M0,28 C240,16 480,40 720,28 C960,16 1200,40 1440,28" fill="none" stroke="url(#gw3)" strokeWidth="1.8" opacity="0.4" />
          </svg>
        </div>

        {/* ゴールドシマー（左から右に光が走る） */}
        <div className="header-shimmer" />

        {/* 金の砂粒エフェクト — 3レイヤー構成 */}
        <div className="header-gold-dust">
          {GOLD_DUST_PARTICLES.map((p, i) => (
            <span key={i} className={`dust dust-t${p.t}`} style={{
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
