import { useMemo, useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy,
  ClipboardList, CalendarClock, MonitorPlay, BarChart2,
  HelpCircle, ExternalLink, Medal, HardDrive,
  AlertTriangle, Network
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../../features/mixed/mixedStore';
import logoUrl from '/logo.png?url';
import VersionInfoModal from '../ui/VersionInfoModal';
import BulkCallOverlay from '../ui/BulkCallOverlay';

const ALL_MAIN_TABS = [
  { id: 'S-01', path: '/data', label: 'データ', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', icon: Users },

  { id: 'S-04', path: '/draw-lot', label: '抽選', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', icon: Trophy },
  { id: 'S-06', path: '/referee', label: '対戦順', icon: ClipboardList },
  { id: 'S-06b', path: '/schedule-sheet', label: 'タイムテーブル', icon: CalendarClock },
  { id: 'S-07', path: '/score', label: 'スコア', icon: MonitorPlay },
  { id: 'S-07b', path: '/court-bracket', label: 'ドロー状況', icon: Network },
  { id: 'S-09', path: '/dashboard', label: 'LIVE', icon: BarChart2 },
  { id: 'S-10', path: '/results', label: '結果', icon: Medal },
  { id: 'S-11', path: '/manual', label: 'マニュアル', icon: HelpCircle },
  { id: 'S-12', path: '/backup', label: 'バックアップ', icon: HardDrive },
];

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

/** ミックスダブルス読込時に非表示にするパス */
const MIXED_HIDDEN_PATHS = ['/referee', '/schedule-sheet', '/draw-lot', '/court-bracket'];

// 金の微粒子 — 空気中に漂う細かい金色パーティクル
// type: 0=微粒子(1-1.5px), 1=小粒子(1.5-2.5px), 2=中粒子(2.5-3.5px, キラッと光る)
const GOLD_DUST_PARTICLES: { x: number; y: number; s: number; o: number; t: number }[] = [];

// 微粒子 (type 0) — 大量に均等散布、金色の粉塵
for (let i = 0; i < 55; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 1.82 + ((i * 7 + 3) % 11) * 0.3) % 100,
    y: ((i * 13 + 5) % 59) + 1,
    s: 1 + ((i * 3) % 4) * 0.15,
    o: 0.5 + ((i * 7) % 5) * 0.06,
    t: 0,
  });
}

// 小粒子 (type 1) — 中密度、ふわっと浮遊して光る
for (let i = 0; i < 30; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 3.33 + ((i * 11 + 7) % 13) * 0.5) % 100,
    y: ((i * 17 + 3) % 55) + 3,
    s: 1.5 + ((i * 5) % 5) * 0.2,
    o: 0.5 + ((i * 3) % 6) * 0.06,
    t: 1,
  });
}

// 中粒子 (type 2) — 少数、はっきりキラッと光るアクセント
for (let i = 0; i < 10; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 10 + ((i * 5 + 2) % 7) * 1.5) % 100,
    y: ((i * 19 + 7) % 50) + 5,
    s: 2.5 + ((i * 3) % 4) * 0.3,
    o: 0.6 + ((i * 7) % 4) * 0.06,
    t: 2,
  });
}

export default function AppLayout() {
  const location = useLocation();
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const isMixedImported = useMixedStore((s) => s.isImported);
  const mixedTournamentInfo = useMixedStore((s) => s.tournamentInfo);
  const mixedLeagueMatches = useMixedStore((s) => s.leagueMatches);
  const mixedLeagues = useMixedStore((s) => s.leagues);
  const mixedBrackets = useMixedStore((s) => s.brackets);
  const [versionModalOpen, setVersionModalOpen] = useState(false);

  // 現在の大会情報を取得
  const tournament = useLiveQuery(
    () => currentTournamentId
      ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
      : undefined,
    [currentTournamentId]
  );
  const matchDuration = useAppStore((s) => s.scheduleConfig.matchDuration);
  const [now, setNow] = useState(Date.now());

  // Tick every 15 seconds for ticker updates
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // 現在の大会に紐づく種目を取得
  const events = useLiveQuery(
    () =>
      currentTournamentId
        ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
        : [],
    [currentTournamentId]
  );

  // 全試合データ取得
  const eventIds = useMemo(() => (events ?? []).map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];

  // コートデータ取得
  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // ティッカー用リアルタイムステータス
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (allMatches.length === 0 && courts.length === 0) return items;

    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'walkover');
    const total = allMatches.length;

    // 進捗
    if (total > 0) {
      const pct = Math.round((finished.length / total) * 100);
      items.push(`進捗: ${finished.length}/${total}試合完了 (${pct}%)`);
    }

    // コート状況
    if (courts.length > 0) {
      const availCourts = courts.filter(c => c.isAvailable);
      const playingCourts = availCourts.filter(c =>
        allMatches.some(m => m.courtId === c.courtId && m.status === 'playing')
      );
      const emptyCourts = availCourts.length - playingCourts.length;
      items.push(`${playingCourts.length}/${availCourts.length}コート使用中 | ${emptyCourts}コート空き`);
    }

    // 試合中
    if (playing.length > 0) {
      items.push(`${playing.length}試合進行中`);
    }

    // 時間超過コート
    const limitMs = matchDuration * 60 * 1000;
    const overMatches = playing.filter(m => m.updatedAt && (now - m.updatedAt) > limitMs);
    for (const m of overMatches) {
      const court = courts.find(c => c.courtId === m.courtId);
      const elapsed = Math.floor((now - (m.updatedAt || now)) / 60000);
      const courtLabel = court?.name || m.courtId;
      items.push(`⚠ ${courtLabel} 時間超過(${elapsed}分) ${m.player1Name} vs ${m.player2Name}`);
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches, courts, matchDuration, now]);

  // ミックスダブルス用ティッカー
  const mixedTickerItems = useMemo(() => {
    if (!isMixedImported || mixedLeagueMatches.length === 0) return [];
    const items: string[] = [];
    const finished = mixedLeagueMatches.filter(m => m.status === 'finished').length;
    const total = mixedLeagueMatches.length;
    const pct = Math.round((finished / total) * 100);
    items.push(`予選リーグ: ${finished}/${total}試合完了 (${pct}%)`);

    // リーグごとの進捗
    const completedLeagues = mixedLeagues.filter(l => {
      const lm = mixedLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${mixedLeagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    if (mixedBrackets.length > 0) {
      const bracketFinished = mixedBrackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bracketTotal = mixedBrackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bracketFinished}/${bracketTotal}試合完了`);
    }

    return items;
  }, [isMixedImported, mixedLeagueMatches, mixedLeagues, mixedBrackets]);

  // ミックス読込時は対戦順・タイムテーブル等を非表示
  const allTabs = useMemo(() => {
    let tabs = ALL_MAIN_TABS;

    // 大会データ未読み込み時: データ・マニュアル・バックアップのみ表示
    if (!currentTournamentId && !isMixedImported) {
      return tabs.filter(t => ['/data', '/manual', '/backup'].includes(t.path));
    }

    // ミックスダブルス読込時: 不要なタブを非表示 + ラベル変更
    if (isMixedImported) {
      tabs = tabs.filter((t) => !MIXED_HIDDEN_PATHS.includes(t.path));
      tabs = tabs.map(t => {
        if (t.path === '/draw-table') return { ...t, label: '予選リーグ' };
        if (t.path === '/score') return { ...t, label: '決勝トーナメント' };
        return t;
      });
    } else {
      // 通常モード: ミックス/団体戦の種目がなければ抽選・ドロー表タブを非表示
      const hasDrawEvents = (events ?? []).some(
        (e) =>
          /ミックス|団体|mixed|team/i.test(e.name) ||
          /ミックス|団体|mixed|team/i.test(e.type || '')
      );
      if (!hasDrawEvents) {
        tabs = tabs.filter((t) => !DRAW_TAB_PATHS.includes(t.path));
      }
    }
    return tabs;
  }, [events, isMixedImported]);


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
          {(() => {
            // 大会名が確定していたらヘッダーに大会名を表示
            const tName = isMixedImported ? mixedTournamentInfo?.name : tournament?.name;
            if (tName) {
              // 「令和○年度」「第○回」等のプレフィックスを抽出
              const prefixMatch = tName.match(/^((?:令和|平成|昭和)[\d０-９]+年度\s*|第[\d０-９]+回\s*)/);
              const prefix = prefixMatch ? prefixMatch[1].trim() : '';
              const mainName = prefix ? tName.slice(prefixMatch![0].length).trim() : tName;
              return (<>
                <p className="header-org-name" style={{ color: '#fbbf24' }}>{prefix || '鳥取市テニス協会'}</p>
                <h1 className="header-title">{mainName}</h1>
              </>);
            }
            return (<>
              <p className="header-org-name">鳥取市テニス協会</p>
              <h1 className="header-title">大会運営システム</h1>
            </>);
          })()}
        </div>

        {/* 右側: リンク & バージョン */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://www.tottori-tenis.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
            title="鳥取県テニス協会HPを開く"
          >
            <span className="hidden sm:inline">テニス協会HP</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={() => setVersionModalOpen(true)}
            className="flex flex-col items-center hover:opacity-80 transition-opacity cursor-pointer"
            title="バージョン情報・更新履歴"
          >
            <span className="header-version">Ver 1.9</span>
            <span className="text-[8px] text-white/40 leading-tight mt-0.5 whitespace-nowrap">{__BUILD_TIMESTAMP__}</span>
          </button>
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

      {/* ===== 大会情報バー ===== */}
      {(tournament || (isMixedImported && mixedTournamentInfo)) && (() => {
        const displayName = isMixedImported && mixedTournamentInfo
          ? mixedTournamentInfo.name.replace(/\(.*?\)|（.*?）/g, '')
          : tournament?.name.replace(/\(.*?\)|（.*?）/g, '') || '';
        const activeTickerItems = isMixedImported ? mixedTickerItems : tickerItems;
        return (
          <div className="info-bar flex items-center shrink-0 h-8 overflow-hidden text-xs">
            <div className="flex-1 overflow-hidden relative h-full info-ticker-area">
              <div className="info-ticker flex items-center h-full whitespace-nowrap">
                {activeTickerItems.length > 0 ? activeTickerItems.map((item, i) => (
                  <span key={i} className={`info-ticker-item ${item.startsWith('⚠') ? 'info-ticker-alert' : ''}`}>
                    {item.startsWith('⚠') && <AlertTriangle className="w-3 h-3" />}
                    <span>{item.startsWith('⚠') ? item.slice(2) : item}</span>
                    {i < activeTickerItems.length - 1 && <span className="info-ticker-dot" />}
                  </span>
                )) : (
                  <span className="info-ticker-item">
                    <span>{displayName || '大会運営システム'}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== メインコンテンツ（ページ遷移アニメーション） ===== */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main h-full">
        <div key={location.pathname} className="page-enter min-h-full">
          <Outlet />
        </div>
      </main>

      {/* バージョン情報モーダル */}
      <VersionInfoModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} />

      {/* 一斉コール フローティングオーバーレイ */}
      <BulkCallOverlay />
    </div>
  );
}
