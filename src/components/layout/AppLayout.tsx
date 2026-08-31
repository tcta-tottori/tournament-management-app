import { useMemo, useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy, Swords,
  ClipboardList, CalendarClock, BarChart2,
  HelpCircle, Settings, ExternalLink,
  AlertTriangle, Network, Menu, X,
  PanelLeftClose, PanelLeftOpen, Radio, Printer, ArrowRight
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../../features/mixed/mixedStore';
import { useTeamStore } from '../../features/team/teamStore';
import VersionInfoModal from '../ui/VersionInfoModal';
import BulkCallOverlay from '../ui/BulkCallOverlay';
import VoiceLoadingIndicator from '../ui/VoiceLoadingIndicator';
import HeaderBackdrop from './HeaderBackdrop';
import { callTts } from '../../features/broadcast/callTts';

const ALL_MAIN_TABS = [
  { id: 'S-01', path: '/data', label: 'データ', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', icon: Users },

  { id: 'S-04', path: '/draw-lot', label: '抽選', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', icon: Swords },
  { id: 'S-06', path: '/referee', label: '対戦順', icon: ClipboardList },
  { id: 'S-06b', path: '/schedule-sheet', label: 'タイムテーブル', icon: CalendarClock },
  { id: 'S-07', path: '/score', label: 'スコア', icon: Trophy },
  { id: 'S-07b', path: '/court-bracket', label: 'ドロー', icon: Network },
  { id: 'S-09', path: '/dashboard', label: 'ダッシュボード', icon: BarChart2 },
  { id: 'S-09b', path: '/broadcast', label: 'ライブ配信', icon: Radio },
  { id: 'S-10', path: '/print', label: '印刷', icon: Printer },
  { id: 'S-11', path: '/manual', label: 'マニュアル', icon: HelpCircle },
  // 同期・観戦用ページ・音声・バックアップは設定ページに集約している
  { id: 'S-12', path: '/settings', label: '設定', icon: Settings },
];

/** 協会HP（メニュー下部のロゴから開く） */
const ASSOCIATION_URL = 'https://www.tottori-tenis.net/';

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

/** ミックスダブルス/団体戦 読込時に非表示にするパス */
const MIXED_HIDDEN_PATHS = ['/referee', '/schedule-sheet', '/draw-lot', '/court-bracket'];

export default function AppLayout() {
  const location = useLocation();
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const isMixedImported = useMixedStore((s) => s.isImported);
  const mixedTournamentInfo = useMixedStore((s) => s.tournamentInfo);
  const mixedLeagueMatches = useMixedStore((s) => s.leagueMatches);
  const mixedLeagues = useMixedStore((s) => s.leagues);
  const mixedBrackets = useMixedStore((s) => s.brackets);
  const isTeamImported = useTeamStore((s) => s.isImported);
  const teamTournamentInfo = useTeamStore((s) => s.tournamentInfo);
  const teamLeagueMatches = useTeamStore((s) => s.leagueMatches);
  const teamLeagues = useTeamStore((s) => s.leagues);
  const teamBrackets = useTeamStore((s) => s.brackets);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // PC表示：左側の常設サイドバー。デフォルト展開、アイコンのみ表示に折りたたみ可能。
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    typeof window !== 'undefined' && localStorage.getItem('sidebarCollapsed') === '1'
  );
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // モバイルの自動再生制約対策: 最初のユーザー操作でオーディオをアンロックする
  useEffect(() => {
    const unlock = () => { callTts.unlockAudio(); };
    document.addEventListener('click', unlock, { once: true, capture: true });
    document.addEventListener('touchstart', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
  }, []);

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
    // 不戦勝(BYE)は実際に行う試合ではないので進捗の分母・完了数から除外する
    const finished = allMatches.filter(m => m.status === 'finished');
    const total = allMatches.filter(m => m.status !== 'walkover').length;

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

    // 全リーグ完了時のみブラケット情報を表示（未完了時は旧データの可能性）
    const allLeaguesComplete = mixedLeagues.every(l => {
      const lm = mixedLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (mixedBrackets.length > 0 && allLeaguesComplete) {
      const bracketFinished = mixedBrackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bracketTotal = mixedBrackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bracketFinished}/${bracketTotal}試合完了`);
    }

    return items;
  }, [isMixedImported, mixedLeagueMatches, mixedLeagues, mixedBrackets]);

  // 団体戦用ティッカー
  const teamTickerItems = useMemo(() => {
    if (!isTeamImported || teamLeagueMatches.length === 0) return [];
    const items: string[] = [];
    const finished = teamLeagueMatches.filter(m => m.status === 'finished').length;
    const total = teamLeagueMatches.length;
    const pct = Math.round((finished / total) * 100);
    items.push(`予選リーグ: ${finished}/${total}対戦完了 (${pct}%)`);

    const completedLeagues = teamLeagues.filter(l => {
      const lm = teamLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${teamLeagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    const allLeaguesComplete = teamLeagues.every(l => {
      const lm = teamLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (teamBrackets.length > 0 && allLeaguesComplete) {
      const bracketFinished = teamBrackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bracketTotal = teamBrackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bracketFinished}/${bracketTotal}対戦完了`);
    }

    return items;
  }, [isTeamImported, teamLeagueMatches, teamLeagues, teamBrackets]);

  // ミックス読込時は対戦順・タイムテーブル等を非表示
  const allTabs = useMemo(() => {
    let tabs = ALL_MAIN_TABS;

    // 大会データ未読み込み時: データ・印刷・マニュアル・設定のみ表示
    if (!currentTournamentId && !isMixedImported && !isTeamImported) {
      // 賞状印刷は大会データが無くても（手入力で）使えるので常に出す
      return tabs.filter(t => ['/data', '/print', '/manual', '/settings'].includes(t.path));
    }

    // ミックスダブルス or 団体戦 読込時: 不要なタブを非表示 + ラベル変更
    if (isMixedImported || isTeamImported) {
      tabs = tabs.filter((t) => !MIXED_HIDDEN_PATHS.includes(t.path));
      tabs = tabs.map(t => {
        if (t.path === '/draw-table') return { ...t, label: '予選リーグ' };
        if (t.path === '/score') return { ...t, label: '決勝トーナメント' };
        return t;
      });
    } else {
      // 通常モード（個人戦）: スコアは廃止し、ドロー画面で入力する
      tabs = tabs.filter((t) => t.path !== '/score');
      // ミックス/団体戦の種目がなければ抽選・ドロー表タブを非表示
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
  }, [events, isMixedImported, isTeamImported]);


  // 現在のページラベルを取得
  const currentPageLabel = useMemo(() => {
    const currentTab = allTabs.find(t => location.pathname.startsWith(t.path));
    return currentTab?.label || '';
  }, [allTabs, location.pathname]);

  // 現在のページアイコンを取得
  const CurrentPageIcon = useMemo(() => {
    const currentTab = allTabs.find(t => location.pathname.startsWith(t.path));
    return currentTab?.icon || null;
  }, [allTabs, location.pathname]);

  // メニュー項目タップ時
  const handleMenuItemClick = useCallback((path: string) => {
    navigate(path);
    setMenuOpen(false);
  }, [navigate]);

  // パス変更時にメニューを閉じる
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-[100dvh] bg-bg-main overflow-hidden">

      {/* ===== PC: 画面の上端から立てる常設メニュー（ヘッダーの高さぶんも含む） ===== */}
      <aside
        className={`side-menu hidden lg:flex flex-col shrink-0 transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-[64px]' : 'w-56'
        }`}
        style={{ background: 'linear-gradient(180deg, #c63834 0%, #ad2c29 55%, #8c2220 100%)' }}
      >
        {/* 折りたたみトグル */}
        <div className={`flex items-center h-[56px] shrink-0 border-b border-white/20 ${sidebarCollapsed ? 'justify-center' : 'justify-between px-3'}`}>
          {!sidebarCollapsed && <span className="text-[11px] font-bold text-white/75 tracking-wide">メニュー</span>}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="p-1.5 text-white/75 hover:text-white hover:bg-white/20 rounded transition-colors"
            title={sidebarCollapsed ? 'メニューを展開' : 'アイコンのみに縮小'}
            aria-label={sidebarCollapsed ? 'メニューを展開' : 'メニューを縮小'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
          {allTabs.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={item.label}
                className={`side-menu-item ${isActive ? 'side-menu-item-active' : ''} ${sidebarCollapsed ? 'justify-center' : ''}`}
                style={sidebarCollapsed ? { padding: '12px 0' } : undefined}
              >
                <item.icon
                  className="shrink-0"
                  style={{ width: 18, height: 18 }}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* フッター：左下に協会ロゴ（押すと協会HP）・右下にバージョン */}
        <div className="px-2.5 py-2.5 shrink-0">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <AssociationLogoLink className="menu-logo-link menu-logo-link-sm" />
              <button onClick={() => setVersionModalOpen(true)} className="text-[9px] font-black text-white/85 hover:text-white text-center" title="バージョン情報">
                2.4
              </button>
            </div>
          ) : (
            <div className="menu-bottom-row">
              <AssociationLogoLink className="menu-logo-link" />
              <button onClick={() => setVersionModalOpen(true)} className="drawer-version-btn" title="バージョン情報・更新履歴">
                <span className="header-version">Ver 2.4</span>
                <span className="drawer-version-date">{__BUILD_TIMESTAMP__}</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ===== 右側: ヘッダー + 流れる表示バー + 本体 ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ===== ヘッダー（左=メニュータイトル / 右=メニューボタン。大会名は下の表示バーへ） ===== */}
        <header className="header-main flex items-center gap-3 px-4 lg:px-5 shrink-0 z-30">
          <HeaderBackdrop />

          {/* 左: 現在ページ名（メニュータイトル） */}
          <div className="header-page-name min-w-0">
            {CurrentPageIcon && (
              <CurrentPageIcon style={{ width: 18, height: 18 }} className="shrink-0" />
            )}
            <span className="truncate">{currentPageLabel || '大会運営システム'}</span>
          </div>

          {/* 右: メニューボタン（スマホのみ・開くと × に変わる） */}
          <button
            className="header-menu-btn header-menu-btn-mobile-only"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={menuOpen}
          >
            {menuOpen
              ? <X style={{ width: 26, height: 26 }} strokeWidth={2} />
              : <Menu style={{ width: 26, height: 26 }} strokeWidth={2} />}
          </button>
        </header>

        {/* ===== 流れる表示バー（ティッカー） ===== */}
        {(() => {
          const displayName = isMixedImported && mixedTournamentInfo
            ? mixedTournamentInfo.name.replace(/\(.*?\)|（.*?）/g, '')
            : isTeamImported && teamTournamentInfo
              ? teamTournamentInfo.name.replace(/\(.*?\)|（.*?）/g, '')
              : tournament?.name.replace(/\(.*?\)|（.*?）/g, '') || '';
          const activeTickerItems = isMixedImported ? mixedTickerItems : isTeamImported ? teamTickerItems : tickerItems;
          return (
            <div className="info-bar flex items-center shrink-0 h-9 overflow-hidden text-xs sticky top-0 z-20">
              <div className="flex-1 overflow-hidden relative h-full info-ticker-area">
                <div className="info-ticker flex items-center h-full whitespace-nowrap">
                  {/* 大会名はヘッダーではなくここに流す */}
                  <span className="info-ticker-item info-ticker-lead">
                    <span>{displayName || '大会運営システム'}</span>
                    <span className="info-ticker-dot" />
                  </span>
                  {activeTickerItems.length > 0 ? activeTickerItems.map((item, i) => (
                    <span key={i} className={`info-ticker-item ${item.startsWith('⚠') ? 'info-ticker-alert' : ''}`}>
                      {item.startsWith('⚠') && <AlertTriangle className="w-3 h-3" />}
                      <span>{item.startsWith('⚠') ? item.slice(2) : item}</span>
                      {i < activeTickerItems.length - 1 && <span className="info-ticker-dot" />}
                    </span>
                  )) : null}
                </div>
              </div>
            </div>
          );
        })()}

        {/* メインコンテンツ（ページ遷移アニメーション） */}
        <main className="flex-1 min-w-0 overflow-y-auto relative bg-bg-main">
          <div key={location.pathname} className="page-enter min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ===== スマホ: 全画面メニュー（ヘッダーは出したまま、その下いっぱいに開く） ===== */}
      <div className={`fullmenu fullmenu-mobile-only ${menuOpen ? 'fullmenu-open' : ''}`}>
        <div className="fullmenu-list">
          {allTabs.map((item, i) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.id}
                className={`fullmenu-item ${isActive ? 'fullmenu-item-active' : ''}`}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => handleMenuItemClick(item.path)}
              >
                <item.icon className="shrink-0" />
                <span>{item.label}</span>
                <ArrowRight className="fullmenu-arrow" style={{ width: 18, height: 18 }} />
              </button>
            );
          })}
        </div>

        {/* 下部: 左に協会ロゴ（押すと協会HP）・右にバージョン */}
        <div
          className="fullmenu-footer"
          style={{ '--footer-delay': `${allTabs.length * 45}ms` } as React.CSSProperties}
        >
          <div className="menu-bottom-row">
            <AssociationLogoLink className="menu-logo-link" />

            {/* バージョン情報（ver.と更新日） */}
            <button
              onClick={() => setVersionModalOpen(true)}
              className="drawer-version-btn"
              title="バージョン情報・更新履歴"
            >
              <span className="header-version">Ver 2.4</span>
              <span className="drawer-version-date">{__BUILD_TIMESTAMP__}</span>
            </button>
          </div>
        </div>
      </div>

      {/* バージョン情報モーダル */}
      <VersionInfoModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} />

      {/* 一斉コール フローティングオーバーレイ */}
      <BulkCallOverlay />

      {/* コール音声の準備中を知らせるグローバルインジケータ */}
      <VoiceLoadingIndicator />
    </div>
  );
}

/**
 * メニュー下部の協会ロゴ。押すと鳥取市テニス協会のHPを別タブで開く。
 * （以前あった「テニス協会HP」ボタンはこのロゴに置き換えて廃止した）
 */
function AssociationLogoLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={ASSOCIATION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="鳥取市テニス協会HPを開く"
      aria-label="鳥取市テニス協会HPを開く"
    >
      <img
        src={`${import.meta.env.BASE_URL}logo-tcta-white.png`}
        alt="鳥取市テニス協会"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {/* 外部リンクだと分かるよう、ロゴの右下に小さく重ねる */}
      <ExternalLink className="menu-logo-link-icon" strokeWidth={2.5} />
    </a>
  );
}
