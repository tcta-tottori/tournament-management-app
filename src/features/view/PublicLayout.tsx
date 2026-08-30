import { useState, useMemo, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Swords, Radio, Info, Wifi, WifiOff, Network, Menu, X, AlertTriangle, ClipboardList, RefreshCw, Activity, BarChart2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { usePublicSync } from './usePublicSync';
import HeaderBackdrop from '../../components/layout/HeaderBackdrop';

/**
 * 参加者・HP訪問者向け公開ビューのレイアウト（読み取り専用）。
 * 個人戦・団体戦/ミックスとも操作画面と同じヘッダー＋流れる表示＋
 * ハンバーガーメニュー（タブ）で統一する。表示するタブだけを大会種別で切り替える。
 * - 個人戦: ライブスコア / ドロー / 対戦順 / ダッシュボード
 * - 団体戦/ミックス: 予選リーグ / 決勝トーナメント / LIVE
 */
export default function PublicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const sync = usePublicSync();

  const mixedInfo = useMixedStore(s => s.tournamentInfo);
  const teamInfo = useTeamStore(s => s.tournamentInfo);
  const groupInfo = mixedInfo || teamInfo;
  const isGroup = !!groupInfo;

  // 団体戦/ミックスの流れる表示用データ
  const mixedLeagues = useMixedStore(s => s.leagues);
  const mixedLeagueMatches = useMixedStore(s => s.leagueMatches);
  const mixedBrackets = useMixedStore(s => s.brackets);
  const teamLeagues = useTeamStore(s => s.leagues);
  const teamLeagueMatches = useTeamStore(s => s.leagueMatches);
  const teamBrackets = useTeamStore(s => s.brackets);

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

  // 運営端末が大会を選択していない状態でスナップショットが届くこともあるため、
  // 選択中大会が無ければ DB にある最新の大会にフォールバックする。
  // （これが無いとデータを受信済みでも「受信を待っています」のままになる）
  const individualTournament = useLiveQuery(async () => {
    if (isGroup) return undefined;
    if (currentTournamentId) {
      return db.tournaments.where('tournamentId').equals(currentTournamentId).first();
    }
    // 大会が選ばれていなければ DB 内の最新の大会を採用する
    const all = await db.tournaments.toArray();
    if (all.length === 0) return undefined;
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }, [isGroup, currentTournamentId]);

  const activeTournamentId = individualTournament?.tournamentId || '';

  const events = useLiveQuery(
    () => (!isGroup && activeTournamentId
      ? db.events.where('tournamentId').equals(activeTournamentId).toArray()
      : []),
    [isGroup, activeTournamentId]
  ) || [];
  const eventIds = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];
  const courts = useLiveQuery(
    () => (!isGroup && activeTournamentId
      ? db.courts.where('tournamentId').equals(activeTournamentId).toArray()
      : []),
    [isGroup, activeTournamentId]
  ) || [];

  // 観戦端末では appStore の選択中大会が未設定のことがある。
  // 実際に表示している大会に合わせておくと、配下のページ
  // （ドロー・対戦順・ダッシュボード）も同じ大会を参照できる。
  useEffect(() => {
    if (isGroup || currentTournamentId || !activeTournamentId) return;
    useAppStore.setState({ currentTournamentId: activeTournamentId });
  }, [isGroup, activeTournamentId, currentTournamentId]);

  // 個人戦なのに団体戦用ルート(league/bracket)に居る場合はドローへ寄せる
  useEffect(() => {
    if (!isGroup && individualTournament &&
        (location.pathname.endsWith('/league') || location.pathname.endsWith('/bracket'))) {
      navigate(`/view/draw${location.search}`, { replace: true });
    }
  }, [isGroup, individualTournament, location.pathname, location.search, navigate]);

  // 団体戦/ミックスなのに個人戦用ルートに居る場合は予選リーグへ寄せる
  useEffect(() => {
    if (isGroup && /\/(draw|order|livescore)$/.test(location.pathname)) {
      navigate(`/view/league${location.search}`, { replace: true });
    }
  }, [isGroup, location.pathname, location.search, navigate]);

  // 個人戦の流れる表示（本アプリと同じ内容）
  const individualTickerItems = useMemo(() => {
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

  // 団体戦/ミックスの流れる表示（操作画面と同じ内容）
  const groupTickerItems = useMemo(() => {
    if (!isGroup) return [];
    const isMixed = !!mixedInfo;
    const leagues: { leagueId: string }[] = isMixed ? mixedLeagues : teamLeagues;
    const leagueMatches: { leagueId: string; status: string }[] = isMixed ? mixedLeagueMatches : teamLeagueMatches;
    const brackets: { matches: { status: string }[] }[] = isMixed ? mixedBrackets : teamBrackets;
    const unit = isMixed ? '試合' : '対戦';
    if (leagueMatches.length === 0) return [];

    const items: string[] = [];
    const finished = leagueMatches.filter(m => m.status === 'finished').length;
    const total = leagueMatches.length;
    items.push(`予選リーグ: ${finished}/${total}${unit}完了 (${Math.round((finished / total) * 100)}%)`);

    const isLeagueComplete = (leagueId: string) => {
      const lm = leagueMatches.filter(m => m.leagueId === leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    };
    const completedLeagues = leagues.filter(l => isLeagueComplete(l.leagueId));
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${leagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    // 全リーグ完了時のみ決勝トーナメントの進捗を表示（未完了時は旧データの可能性）
    const allLeaguesComplete = leagues.every(l => isLeagueComplete(l.leagueId));
    if (brackets.length > 0 && allLeaguesComplete) {
      const bFinished = brackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bTotal = brackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bFinished}/${bTotal}${unit}完了`);
    }
    return items;
  }, [isGroup, mixedInfo, mixedLeagues, mixedLeagueMatches, mixedBrackets, teamLeagues, teamLeagueMatches, teamBrackets]);

  // ============================ 操作画面と同じヘッダー＋タブ（ハンバーガー） ============================
  const info = isGroup
    ? groupInfo!
    : individualTournament
      ? { name: individualTournament.name, date: individualTournament.date, venue: individualTournament.venue }
      : null;
  const tournamentName = info?.name?.replace(/\(.*?\)|（.*?）/g, '').trim() || '';
  const tickerItems = isGroup ? groupTickerItems : individualTickerItems;

  const menuItems = isGroup
    ? [
        { path: '/view/league', label: '予選リーグ', icon: Swords },
        { path: '/view/bracket', label: '決勝トーナメント', icon: Trophy },
        { path: '/view/live', label: 'ダッシュボード', icon: BarChart2 },
      ]
    : [
        { path: '/view/livescore', label: 'ライブスコア', icon: Activity },
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
                <item.icon className="shrink-0" style={{ width: 18, height: 18 }} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="hamburger-drawer-footer">
          <div className="drawer-action-row">
            {sync.hasRoom && <SyncBadge sync={sync} />}
            <span className="text-[10px] bg-white/15 border border-white/30 rounded-full px-2.5 py-1 font-bold text-white">観戦用ページ</span>
          </div>
          <img src={`${import.meta.env.BASE_URL}logo-tcta.png`} alt="鳥取市テニス協会"
            className="hamburger-drawer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </div>

      {/* コンテンツ */}
      <main className="flex-1 overflow-y-auto relative bg-bg-main">
        {!info ? (
          <div className="max-w-2xl mx-auto p-4">
            <WaitingCard sync={sync} />
          </div>
        ) : (
          <div key={location.pathname} className="page-enter min-h-full pb-24 [padding-bottom:calc(6rem_+_env(safe-area-inset-bottom))]">
            {isGroup ? (
              <div className="max-w-7xl w-full mx-auto px-3 md:px-4 py-4">
                <Outlet />
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * データ待ち画面。
 * 待つだけだと復帰できないことがあるため、手動の再読み込みを用意する。
 */
function WaitingCard({ sync }: { sync: ReturnType<typeof usePublicSync> }) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = () => {
    setRetrying(true);
    sync.refresh();
    setTimeout(() => setRetrying(false), 1500);
  };

  // 中継サーバーが未設定のビルドでは、そもそも他端末のデータを受け取れない。
  // 観戦者には「待てば映る」と誤解させず、運営側の設定漏れだと分かる文言にする。
  if (!sync.serverConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center mt-6">
        <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">観戦用の配信設定が有効になっていません。</p>
        <p className="text-gray-400 text-xs mt-1">
          中継サーバーが設定されていないため、他の端末の大会データを受信できません。
        </p>
        <p className="text-gray-400 text-xs mt-3 leading-relaxed">
          運営の方へ: リポジトリの Variables に SYNC_SERVER_URL を登録して再デプロイしてください。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center mt-6">
      <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-500 text-sm">
        {sync.connectionState === 'connected'
          ? '運営端末からのデータ受信を待っています...'
          : sync.connectionState === 'disconnected'
            ? '中継サーバーに接続できていません。'
            : '運営端末のルームに接続しています...'}
      </p>
      <p className="text-gray-400 text-xs mt-1">
        ルーム: <span className="font-mono font-bold">{sync.roomCode}</span>
      </p>
      <p className="text-gray-400 text-xs mt-3 leading-relaxed">
        {sync.connectionState === 'connected'
          ? '運営端末で大会データを読み込み、ヘッダーの電波アイコンから「インターネット公開を開始」すると自動で表示されます。'
          : '運営端末で大会データが読み込まれ、同期が開始されると自動で表示されます。'}
      </p>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 hover:bg-primary-100 disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
        再読み込み
      </button>
    </div>
  );
}

function SyncBadge({ sync }: { sync: ReturnType<typeof usePublicSync> }) {
  const connected = sync.connectionState === 'connected';
  const connecting = sync.connectionState === 'connecting' || sync.connectionState === 'reconnecting';
  const label = connected ? 'ライブ受信中' : connecting ? '接続中...' : sync.serverConfigured ? '切断' : 'ローカル同期';
  const Icon = connected ? Wifi : WifiOff;
  // 白地のヘッダーに合わせ、受信中だけ赤、それ以外は無彩色にする
  const color = connected
    ? 'bg-primary-50 border-primary-200 text-primary-700'
    : connecting ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-white border-gray-200 text-gray-500';
  return (
    <span className={`flex items-center gap-1 text-[10px] md:text-xs rounded-full px-2 py-1 font-bold border ${color}`} title={`ルーム: ${sync.roomCode}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}
