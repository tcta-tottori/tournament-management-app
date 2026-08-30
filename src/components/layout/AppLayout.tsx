import { useMemo, useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy, Swords,
  ClipboardList, CalendarClock, BarChart2,
  HelpCircle, ExternalLink, HardDrive, Eye,
  AlertTriangle, Network, Menu, X, Volume2,
  PanelLeftClose, PanelLeftOpen, Radio, Printer
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../../features/mixed/mixedStore';
import { useTeamStore } from '../../features/team/teamStore';
import { useSyncStore, DEFAULT_SERVER_URL, PUBLIC_ROOM } from '../../features/sync/syncStore';
import VersionInfoModal from '../ui/VersionInfoModal';
import BulkCallOverlay from '../ui/BulkCallOverlay';
import VoiceSettingsDialog from '../ui/VoiceSettingsDialog';
import VoiceLoadingIndicator from '../ui/VoiceLoadingIndicator';
import SyncStatusIndicator from '../../features/sync/SyncStatusIndicator';
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
  { id: 'S-12', path: '/backup', label: 'バックアップ', icon: HardDrive },
];

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
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // PC表示：左側の常設サイドバー。デフォルト展開、アイコンのみ表示に折りたたみ可能。
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    typeof window !== 'undefined' && localStorage.getItem('sidebarCollapsed') === '1'
  );
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const navigate = useNavigate();

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

    // 大会データ未読み込み時: データ・マニュアル・バックアップのみ表示
    if (!currentTournamentId && !isMixedImported && !isTeamImported) {
      // 賞状印刷は大会データが無くても（手入力で）使えるので常に出す
      return tabs.filter(t => ['/data', '/print', '/manual', '/backup'].includes(t.path));
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
    <div className="flex flex-col h-[100dvh] bg-bg-main overflow-hidden">

      {/* ===== ヘッダー ===== */}
      <header className="header-main flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-[56px] shrink-0 z-30">
        <HeaderBackdrop />

        {/* 左: ハンバーガーボタン + 現在ページ名 */}
        <button
          className="header-hamburger-btn"
          onClick={() => isDesktop ? setSidebarCollapsed(v => !v) : setMenuOpen(!menuOpen)}
          aria-label="メニューを開く"
        >
          <Menu style={{ width: 24, height: 24 }} />
        </button>
        {currentPageLabel && (
          <div className="header-page-name min-w-0">
            {CurrentPageIcon && (
              <CurrentPageIcon style={{ width: 16, height: 16 }} className="shrink-0" />
            )}
            <span className="truncate">{currentPageLabel}</span>
          </div>
        )}

        {/* 右: 協会名 + 大会名（右揃え・残り幅いっぱい） */}
        <div className="header-title-right">
          {(() => {
            const tName = isMixedImported ? mixedTournamentInfo?.name : isTeamImported ? teamTournamentInfo?.name : tournament?.name;
            const mainName = tName
              ? tName.replace(/\(.*?\)|（.*?）/g, '').trim()
              : '大会運営システム';
            return (<>
              <p className="header-org-name">鳥取市テニス協会</p>
              <h1 className="header-title" title={mainName}>{mainName}</h1>
            </>);
          })()}
        </div>
      </header>

      {/* ===== 流れる表示バー（ティッカー・全幅） ===== */}
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

      {/* ===== スライドメニュー（モバイル：右から展開）※PCは常設サイドバー ===== */}
      {/* オーバーレイ */}
      <div
        className={`hamburger-overlay lg:hidden ${menuOpen ? 'hamburger-overlay-visible' : ''}`}
        onClick={() => setMenuOpen(false)}
      />
      {/* ドロワー */}
      <div className={`hamburger-drawer lg:hidden ${menuOpen ? 'hamburger-drawer-open' : ''}`}>
        <div className="hamburger-drawer-header">
          <span>メニュー</span>
          <button
            className="hamburger-icon-btn"
            onClick={() => setMenuOpen(false)}
            aria-label="メニューを閉じる"
          >
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <div className="hamburger-drawer-list">
          {allTabs.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.id}
                className={`hamburger-drawer-item ${isActive ? 'hamburger-drawer-item-active' : ''}`}
                onClick={() => handleMenuItemClick(item.path)}
              >
                <item.icon
                  className="shrink-0"
                  style={{
                    width: 18,
                    height: 18,
                    filter: isActive ? 'drop-shadow(0 0 3px rgba(198,56,52,0.35))' : undefined,
                  }}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* 下部: 操作ボタン4つ → バージョン情報 → 協会ロゴ */}
        <div className="hamburger-drawer-footer">
          {/* 画面上部ボタン4つ */}
          <div className="drawer-action-row">
            <SyncStatusIndicator />
            <button
              onClick={() => setVoiceSettingsOpen(true)}
              className="header-link"
              title="音声設定"
              aria-label="音声設定"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>音声</span>
            </button>
            <PublicViewHeaderLink />
            <a
              href="https://www.tottori-tenis.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="header-link"
              title="鳥取県テニス協会HPを開く"
            >
              <span>テニス協会HP</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* バージョン情報（ver.と更新日） */}
          <button
            onClick={() => setVersionModalOpen(true)}
            className="drawer-version-btn"
            title="バージョン情報・更新履歴"
          >
            <span className="header-version">Ver 2.4</span>
            <span className="drawer-version-date">{__BUILD_TIMESTAMP__}</span>
          </button>

          {/* 協会ロゴ */}
          <img
            src={`${import.meta.env.BASE_URL}logo-tcta.png`}
            alt="鳥取市テニス協会"
            className="hamburger-drawer-logo"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>

      {/* ===== 本体：PCは常設サイドバー＋メイン、モバイルはメインのみ ===== */}
      <div className="flex flex-1 min-h-0">
        {/* PC用 常設サイドバー（デフォルト展開・折りたたみでアイコンのみ） */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 transition-[width] duration-200 ${
            sidebarCollapsed ? 'w-[64px]' : 'w-56'
          }`}
          style={{ background: '#ffffff', borderRight: '1px solid var(--border-main)' }}
        >
          {/* 折りたたみトグル */}
          <div className={`flex items-center h-10 shrink-0 border-b border-border-main ${sidebarCollapsed ? 'justify-center' : 'justify-between px-3'}`}>
            {!sidebarCollapsed && <span className="text-[11px] font-bold text-gray-500 tracking-wide">メニュー</span>}
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors"
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
                  className={`hamburger-drawer-item ${isActive ? 'hamburger-drawer-item-active' : ''} ${sidebarCollapsed ? 'justify-center' : ''}`}
                  style={sidebarCollapsed ? { padding: '12px 0' } : undefined}
                >
                  <item.icon
                    className="shrink-0"
                    style={{ width: 18, height: 18, filter: isActive ? 'drop-shadow(0 0 3px rgba(198,56,52,0.35))' : undefined }}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* フッター：操作ボタン・バージョン */}
          <div className="border-t border-border-main p-2 flex flex-col gap-1.5 shrink-0">
            {sidebarCollapsed ? (
              <>
                <button onClick={() => setVoiceSettingsOpen(true)} className="flex items-center justify-center p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded" title="音声設定">
                  <Volume2 className="w-4 h-4" />
                </button>
                <button onClick={() => setVersionModalOpen(true)} className="text-[9px] font-black text-primary-500 hover:text-primary-700 text-center py-1" title="バージョン情報">
                  2.4
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center flex-wrap gap-1.5">
                  <SyncStatusIndicator />
                  <button onClick={() => setVoiceSettingsOpen(true)} className="header-link" title="音声設定" aria-label="音声設定">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>音声</span>
                  </button>
                  <PublicViewHeaderLink />
                  <a href="https://www.tottori-tenis.net/" target="_blank" rel="noopener noreferrer" className="header-link" title="鳥取県テニス協会HPを開く">
                    <span>テニス協会HP</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <button onClick={() => setVersionModalOpen(true)} className="drawer-version-btn" title="バージョン情報・更新履歴">
                  <span className="header-version">Ver 2.4</span>
                  <span className="drawer-version-date">{__BUILD_TIMESTAMP__}</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* メインコンテンツ（ページ遷移アニメーション） */}
        <main className="flex-1 min-w-0 overflow-y-auto relative bg-bg-main">
          <div key={location.pathname} className="page-enter min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* バージョン情報モーダル */}
      <VersionInfoModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} />
      <VoiceSettingsDialog open={voiceSettingsOpen} onClose={() => setVoiceSettingsOpen(false)} />

      {/* 一斉コール フローティングオーバーレイ */}
      <BulkCallOverlay />

      {/* コール音声の準備中を知らせるグローバルインジケータ */}
      <VoiceLoadingIndicator />
    </div>
  );
}

/**
 * ヘッダーの「観戦用」リンク
 * 同期ルーム接続中なら ?room=XXX&server=YYY を付与し、
 * 別端末からアクセスしても観戦者として同じ大会データを受信できる。
 */
function PublicViewHeaderLink() {
  const roomCode = useSyncStore((s) => s.roomCode);
  const serverUrl = useSyncStore((s) => s.serverUrl);
  const syncEnabled = useSyncStore((s) => s.syncEnabled);
  const isMixedImported = useMixedStore((s) => s.isImported);
  const isTeamImported = useTeamStore((s) => s.isImported);

  // 団体戦/ミックスは予選リーグ、個人戦はドローを既定タブにする
  const viewPath = isMixedImported || isTeamImported ? '/view/league' : '/view/draw';

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  let href = `${base}${viewPath}`;
  if (syncEnabled && roomCode) {
    // 既定サーバー/固定公開ルームと同じ値ならクエリを省略し、固定URLにする
    const qs = new URLSearchParams();
    if (roomCode && roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
    if (serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
    const q = qs.toString();
    href = `${base}${viewPath}${q ? `?${q}` : ''}`;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="header-link"
      title={
        syncEnabled && roomCode
          ? `参加者・HP向け公開ビューを別タブで開く（ルーム ${roomCode}）`
          : '参加者・HP向け公開ビューを別タブで開く'
      }
    >
      <Eye className="w-3 h-3" />
      <span>観戦用</span>
    </a>
  );
}
