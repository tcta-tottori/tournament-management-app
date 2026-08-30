import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X, Pencil, RotateCcw, ListOrdered, LayoutGrid } from 'lucide-react';
import { generateTeamLeagueResultDataUrl } from './exportTeamLeagueResultJpeg';
import { generateTeamLeagueSummaryDataUrl, summaryResultFileName } from './exportTeamLeagueSummaryJpeg';
import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding } from './types';
import { useTeamStore } from './teamStore';
import { buildResultFileName, leagueDivisionLabel } from './resultFileName';

type ResultView = 'summary' | 'detail';

interface Props {
  league: TeamLeague;
  standings: TeamLeagueStanding[];
  matches: TeamLeagueMatch[];
  allTeams: TeamEntry[];
  tournamentName: string;
}

/** 自動短縮（苗字最大3文字） */
function autoShortName(name: string): string {
  const trimmed = name.trim();
  const famName = trimmed.split(/[\s　]+/)[0] || trimmed;
  if (famName.length <= 3) return famName;
  return famName.substring(0, 3);
}

export function TeamLeagueResultPreview({ league, standings, matches, allTeams, tournamentName }: Props) {
  // 2種類の画像: サマリー（順位表）と詳細（総当たり表）
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null);
  const [detailUrl, setDetailUrl] = useState<string | null>(null);
  const [view, setView] = useState<ResultView>('summary');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // 選手名の手動上書き: { 元の名前: 表示名 }
  const [playerOverrides, setPlayerOverrides] = useState<Record<string, string>>({});
  const matchFormat = useTeamStore(s => s.tournamentInfo?.matchFormat);
  const promotionOverrides = useTeamStore(s => s.promotionOverrides);
  const venue = useTeamStore(s => s.tournamentInfo?.venue);

  // リーグ内の全選手名（重複除去）
  const allPlayerNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      if (m.leagueId !== league.leagueId) continue;
      for (const sm of m.subMatches) {
        (sm.players1 || []).forEach(n => { if (n && n.trim()) set.add(n); });
        (sm.players2 || []).forEach(n => { if (n && n.trim()) set.add(n); });
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [matches, league.leagueId]);

  // サマリー画像（順位表）— 選手名の上書きには依存しない
  useEffect(() => {
    if (!isOpen) { setSummaryUrl(null); return; }
    let isMounted = true;
    generateTeamLeagueSummaryDataUrl(league, standings, tournamentName, matchFormat, promotionOverrides, venue)
      .then(url => { if (isMounted) setSummaryUrl(url); })
      .catch(err => { console.error(err); });
    return () => { isMounted = false; };
  }, [isOpen, league, standings, tournamentName, matchFormat, promotionOverrides, venue]);

  // 詳細画像（総当たり表）— 選手名の上書きに依存
  useEffect(() => {
    if (!isOpen) { setDetailUrl(null); return; }
    let isMounted = true;
    setIsLoading(true);
    generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, playerOverrides, matchFormat, promotionOverrides, venue)
      .then(url => { if (isMounted) { setDetailUrl(url); setIsLoading(false); } })
      .catch(err => { console.error(err); if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [isOpen, league, standings, matches, allTeams, tournamentName, playerOverrides, matchFormat, promotionOverrides, venue]);

  const currentUrl = view === 'summary' ? summaryUrl : detailUrl;
  // 表示中の画像がまだ生成できていない場合のみローディング表示
  const showLoading = !currentUrl && (view === 'detail' ? isLoading : true);

  const downloadUrl = (url: string, view: ResultView) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = view === 'summary'
      ? summaryResultFileName(tournamentName, league.leagueId)
      : buildResultFileName(tournamentName, `${leagueDivisionLabel(league.leagueId)}結果_団体戦`);
    a.click();
  };

  const handleDownload = () => {
    if (currentUrl) downloadUrl(currentUrl, view);
  };

  // サマリー・詳細の両方を保存
  const handleDownloadBoth = () => {
    if (summaryUrl) downloadUrl(summaryUrl, 'summary');
    // 連続ダウンロードがブラウザにブロックされないよう少し遅らせる
    if (detailUrl) setTimeout(() => downloadUrl(detailUrl, 'detail'), 400);
  };

  const resetOverrides = () => setPlayerOverrides({});
  const updateOverride = (name: string, value: string) => {
    setPlayerOverrides(prev => {
      const next = { ...prev };
      if (value === '' || value === autoShortName(name)) {
        // デフォルト値と同じなら上書きをクリア
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  };

  return (
    <>
      {/* プレビュー呼び出しボタン（無彩色ベース） */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-700 bg-gray-50 border border-gray-200 shadow-sm hover:shadow hover:bg-gray-100 hover:border-gray-300 transition-all active:scale-95 whitespace-nowrap"
      >
        <ImageIcon size={14} className="text-gray-600" />
        結果画像
      </button>

      {/* モーダル表示 */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-gray-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-5xl max-h-[90vh] border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー（無彩色グラデ） */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-gray-400 to-gray-600 text-white shadow-sm">
                  <ImageIcon size={13} />
                </span>
                {leagueDivisionLabel(league.leagueId)} 予選結果プレビュー
              </h3>
              <div className="flex items-center gap-2">
                {/* 選手名編集は詳細（総当たり表）のみ有効 */}
                {view === 'detail' && (
                  <button
                    onClick={() => setShowEdit(v => !v)}
                    className={`relative flex items-center justify-center w-9 h-9 rounded-lg shadow transition-colors active:scale-95 border ${
                      showEdit
                        ? 'bg-primary-100 text-primary-800 border-primary-300 hover:bg-primary-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    title="選手名を手動編集"
                    aria-label="選手名を手動編集"
                  >
                    <Pencil size={15} />
                    {Object.keys(playerOverrides).length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full leading-none">
                        {Object.keys(playerOverrides).length}
                      </span>
                    )}
                  </button>
                )}
                {currentUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg shadow hover:from-gray-600 hover:to-gray-700 transition-colors active:scale-95"
                    title={view === 'summary' ? '順位表を保存' : '総当たり表を保存'}
                    aria-label="表示中の画像を保存"
                  >
                    <Download size={15} />
                  </button>
                )}
                {summaryUrl && detailUrl && (
                  <button
                    onClick={handleDownloadBoth}
                    className="hidden sm:flex items-center gap-1 px-3 h-9 bg-white text-gray-700 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors active:scale-95 text-xs font-bold"
                    title="順位表と総当たり表の両方を保存"
                  >
                    <Download size={14} />2枚保存
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-9 h-9 text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  aria-label="閉じる"
                  title="閉じる"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* 表示切替タブ: サマリー（順位表） / 詳細（総当たり表） */}
            <div className="px-4 py-2 bg-white border-b border-gray-100 shrink-0 flex items-center gap-2">
              <div className="inline-flex p-0.5 bg-gray-50 border border-gray-200 rounded-lg">
                <button
                  onClick={() => { setView('summary'); setShowEdit(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    view === 'summary' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <ListOrdered size={14} />順位表
                </button>
                <button
                  onClick={() => setView('detail')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    view === 'detail' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutGrid size={14} />総当たり表
                </button>
              </div>
              <span className="text-[10px] text-gray-500/80 hidden sm:inline">
                {view === 'summary' ? '見やすい順位一覧（共有向き）' : '対戦ごとの詳細スコア'}
              </span>
            </div>

            {/* 選手名編集パネル（詳細表示時のみ・トグル） */}
            {showEdit && view === 'detail' && (
              <div className="border-b border-primary-200 bg-primary-50/50 shrink-0">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-xs font-bold text-primary-800">
                    表示名を編集（空欄またはデフォルトで自動短縮: 苗字最大3文字）
                  </div>
                  <button
                    onClick={resetOverrides}
                    disabled={Object.keys(playerOverrides).length === 0}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-primary-700 bg-white border border-primary-300 rounded-md hover:bg-primary-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={11} />
                    すべてリセット
                  </button>
                </div>
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  {allPlayerNames.length === 0 ? (
                    <div className="text-[11px] text-primary-700/70 italic">選手名が登録されていません</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {allPlayerNames.map(name => {
                        const autoValue = autoShortName(name);
                        const currentValue = playerOverrides[name] ?? autoValue;
                        const isOverridden = playerOverrides[name] !== undefined;
                        return (
                          <label key={name} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-primary-900/70 truncate" title={name}>
                              {name}
                            </span>
                            <input
                              type="text"
                              value={currentValue}
                              onChange={e => updateOverride(name, e.target.value)}
                              placeholder={autoValue}
                              className={`px-2 py-1 text-[11px] font-bold bg-white rounded border ${
                                isOverridden ? 'border-primary-400 ring-1 ring-primary-300' : 'border-primary-200'
                              } focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-400`}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* プレビュー画像本体 (白背景) */}
            <div className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center">
              {showLoading && (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {currentUrl && !showLoading && (
                <img
                  src={currentUrl}
                  alt={`${league.leagueId}リーグ${view === 'summary' ? '順位表' : '結果'}`}
                  className="max-w-full h-auto object-contain shadow-sm border border-gray-100 bg-white rounded"
                  style={{ maxHeight: '100%' }}
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
