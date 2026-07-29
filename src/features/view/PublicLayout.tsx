import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Users, Radio, Info, Wifi, WifiOff, Network, Menu, X, AlertTriangle, ClipboardList } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { usePublicSync } from './usePublicSync';
import HeaderBackdrop from '../../components/layout/HeaderBackdrop';

/**
 * 参加者・HP訪問者向け公開ビューのレイアウト（読み取り専用）。
 * - 個人戦: 本アプリと同じヘッダー＋流れる表示＋ハンバーガーメニュー（ドロー / ダッシュボード の2項目）
 * - 団体戦/ミックス: 従来のタブUI（予選リーグ / 全トーナメント / LIVE）
 */
export default function PublicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const sync = usePublicSync();

  const mixedInfo = useMixedStore(s => s.tournamentInfo);
  const teamInfo = useTeamStore(s => s.tournamentInfo);
  const groupInfo = mixedInfo || teamInfo;
  const isGroup = !!groupInfo;

  // 個人戦: 同期で受信した選択中大会
  const currentTournamentId = useAppStore(s => s.currentTournamentId);
  const matchDuration = useAppStore(s => s.scheduleConfig.matchDuration);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // ルート変更時にメニューを閉じる
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const individualTournament = useLiveQuery(
    () => (!isGroup && currentTournamentId
      ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
      : undefined),
    [isGroup, currentTournamentId]
  );
  const events = useLiveQuery(
    () => (!isGroup && currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : []),
    [isGroup, currentTournamentId]
  ) || [];
  const eventIds = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];
  const courts = useLiveQuery(
    () => (!isGroup && currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : []),
    [isGroup, currentTournamentId]
  ) || [];

  // 個人戦なのに団体戦用ルート(league/bracket)に居る場合はドローへ寄せる
  useEffect(() => {
    if (!isGroup && individualTournament &&
        (location.pathname.endsWith('/league') || location.pathname.endsWith('/bracket'))) {
      navigate(`/view/draw${location.search}`, { replace: true });
    }
  }, [isGroup, individualTournament, location.pathname, location.search, navigate]);

  // 個人戦の流れる表示（本アプリと同じ内容）
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (allMatches.length === 0 && courts.length === 0) return items;
    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished');
    const total = allMatches.filter(m => m.status !== 'walkover').length;
    if (total > 0) {
      const pct = Math.round((finished.length / total) * 100);
      items.push(`進捗: ${finished.length}/${total}試合完了 (${pct}%)`);
    }
    if (courts.length > 0) {
      const availCourts = courts.filter(c => c.isAvailable);
      const playingCourts = availCourts.filter(c => allMatches.some(m => m.courtId === c.courtId && m.status === 'playing'));
      const emptyCourts = availCourts.length - playingCourts.length;
      items.push(`${playingCourts.length}/${availCourts.length}コート使用中 | ${emptyCourts}コート空き`);
    }
    if (playing.length > 0) items.push(`${playing.length}試合進行中`);
    const limitMs = (matchDuration || 40) * 60 * 1000;
    for (const m of playing.filter(m => m.updatedAt && (now - m.updatedAt) > limitMs)) {
      const court = courts.find(c => c.courtId === m.courtId);
      const elapsed = Math.floor((now - (m.updatedAt || now)) / 60000);
      items.push(`⚠ ${court?.name || m.courtId} 時間超過(${elapsed}分) ${m.player1Name} vs ${m.player2Name}`);
    }
    return items;
  }, [allMatches, courts, matchDuration, now]);

  // ============================ 団体戦/ミックス: 従来のタブUI ============================
  if (isGroup) {
    return <GroupTabsLayout info={groupInfo!} sync={sync} />;
  }

  // ============================ 個人戦: 本アプリ同様のヘッダー＋ハンバーガー ============================
  const info = individualTournament
    ? { name: individualTournament.name, date: individualTournament.date, venue: individualTournament.venue }
    : null;
  const tournamentName = info?.name?.replace(/\(.*?\)|（.*?）/g, '').trim() || '';

  const menuItems = [
    { path: '/view/draw', label: 'ドロー', icon: Network },
    { path: '/view/order', label: '対戦順', icon: ClipboardList },
    { path: '/view/live', label: 'ダッシュボード', icon: Radio },
  ];
  const current = menuItems.find(mi => location.pathname.startsWith(mi.path)) || menuItems[0];
  const CurrentIcon = current.icon;
  const go = (path: string) => { navigate(`${path}${location.search}`); setMenuOpen(false); };

  return (
    <div className="h-screen flex flex-col bg-bg-main overflow-hidden">
      {/* ヘッダー（本アプリと同一） */}
      <header className="header-main flex items-center gap-3 px-4 sm:px-5 h-[56px] shrink-0 z-30">
        <HeaderBackdrop />
        <button className="header-hamburger-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="メニューを開く">
          <Menu style={{ width: 24, height: 24 }} />
        </button>
        <div className="header-page-name min-w-0">
          <CurrentIcon style={{ width: 16, height: 16 }} className="shrink-0" />
          <span className="truncate">{current.label}</span>
        </div>
        <div className="flex-1" />
        <div className="header-title-right min-w-0">
          <p className="header-org-name">鳥取市テニス協会</p>
          <h1 className="header-title truncate">{tournamentName || '大会運営システム'}</h1>
        </div>
      </header>

      {/* 流れる表示バー（本アプリと同一） */}
      <div className="info-bar flex items-center shrink-0 h-9 overflow-hidden text-xs sticky top-0 z-20">
        <div className="flex-1 overflow-hidden relative h-full info-ticker-area">
          <div className="info-ticker flex items-center h-full whitespace-nowrap">
            {tickerItems.length > 0 ? tickerItems.map((item, i) => (
              <span key={i} className={`info-ticker-item ${item.startsWith('⚠') ? 'info-ticker-alert' : ''}`}>
                {item.startsWith('⚠') && <AlertTriangle className="w-3 h-3" />}
                <span>{item.startsWith('⚠') ? item.slice(2) : item}</span>
                {i < tickerItems.length - 1 && <span className="info-ticker-dot" />}
              </span>
            )) : (
              <span className="info-ticker-item"><span>{tournamentName || '観戦用ページ'}</span></span>
            )}
          </div>
        </div>
      </div>

      {/* ハンバーガーメニュー */}
      <div className={`hamburger-overlay ${menuOpen ? 'hamburger-overlay-visible' : ''}`} onClick={() => setMenuOpen(false)} />
      <div className={`hamburger-drawer ${menuOpen ? 'hamburger-drawer-open' : ''}`}>
        <div className="hamburger-drawer-header">
          <span>メニュー</span>
          <button className="hamburger-icon-btn" onClick={() => setMenuOpen(false)} aria-label="メニューを閉じる">
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <div className="hamburger-drawer-list">
          {menuItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button key={item.path}
                className={`hamburger-drawer-item ${isActive ? 'hamburger-drawer-item-active' : ''}`}
                onClick={() => go(item.path)}>
                <item.icon className="shrink-0" style={{ width: 18, height: 18, filter: isActive ? 'drop-shadow(0 0 4px rgba(212,225,87,0.5))' : undefined }} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="hamburger-drawer-footer">
          <div className="drawer-action-row">
            {sync.hasRoom && <SyncBadge sync={sync} />}
            <span className="text-[10px] bg-white/10 border border-white/15 rounded-full px-2.5 py-1 font-bold text-white/80">観戦用ページ</span>
          </div>
          <img src={`${import.meta.env.BASE_URL}logo-tcta.png`} alt="鳥取市テニス協会"
            className="hamburger-drawer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </div>

      {/* コンテンツ */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main">
        {!info ? (
          <div className="max-w-2xl mx-auto p-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center mt-6">
              <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              {sync.hasRoom ? (
                <>
                  <p className="text-gray-500 text-sm">
                    {sync.connectionState === 'connected' ? '運営端末からのデータ受信を待っています...' : '運営端末のルームに接続しています...'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">ルーム: <span className="font-mono font-bold">{sync.roomCode}</span></p>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-sm">大会データが読み込まれていません。</p>
                  <p className="text-gray-400 text-xs mt-1">運営端末で発行された観戦用URLからアクセスしてください。</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div key={location.pathname} className="page-enter min-h-full pb-24 [padding-bottom:calc(6rem_+_env(safe-area-inset-bottom))]">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}

/** 団体戦/ミックス向けの従来タブUI */
function GroupTabsLayout({ info, sync }: { info: { name: string; date?: string; venue?: string }; sync: ReturnType<typeof usePublicSync> }) {
  const tabs = [
    { to: 'league', label: '予選リーグ', icon: Users },
    { to: 'bracket', label: '全トーナメント', icon: Trophy },
    { to: 'live', label: 'LIVE', icon: Radio },
  ];
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-t-lg transition-all border-b-2 ${
      isActive ? 'bg-white text-emerald-700 border-emerald-500' : 'bg-white/10 text-white/80 border-transparent hover:bg-white/20'
    }`;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 md:w-6 md:h-6 text-amber-300" />
                {info.name || '大会情報'}
              </h1>
              <p className="text-[11px] md:text-xs text-white/80 mt-0.5">{[info.date, info.venue].filter(Boolean).join(' / ')}</p>
            </div>
            <div className="flex items-center gap-2">
              {sync.hasRoom && <SyncBadge sync={sync} />}
              <span className="text-[10px] md:text-xs bg-white/15 border border-white/20 rounded-full px-2.5 py-1 font-bold">観戦用ページ</span>
            </div>
          </div>
          <nav className="flex gap-1 mt-4 -mb-[2px]" aria-label="公開ビュータブ">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} className={linkClass}>
                <t.icon className="w-4 h-4" /><span>{t.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 md:px-4 py-4">
        <Outlet />
      </main>
      <footer className="text-center text-[10px] text-gray-400 py-3">大会運営統合Webアプリケーション</footer>
    </div>
  );
}

function SyncBadge({ sync }: { sync: ReturnType<typeof usePublicSync> }) {
  const connected = sync.connectionState === 'connected';
  const connecting = sync.connectionState === 'connecting' || sync.connectionState === 'reconnecting';
  const label = connected ? 'ライブ受信中' : connecting ? '接続中...' : sync.serverConfigured ? '切断' : 'ローカル同期';
  const Icon = connected ? Wifi : WifiOff;
  const color = connected
    ? 'bg-emerald-500/25 border-emerald-300/60 text-emerald-50'
    : connecting ? 'bg-amber-500/25 border-amber-300/60 text-amber-50' : 'bg-white/15 border-white/20 text-white/80';
  return (
    <span className={`flex items-center gap-1 text-[10px] md:text-xs rounded-full px-2 py-1 font-bold border ${color}`} title={`ルーム: ${sync.roomCode}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}
