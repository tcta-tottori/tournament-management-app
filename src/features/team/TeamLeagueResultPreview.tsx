import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Loader2, X, Pencil, RotateCcw } from 'lucide-react';
import { generateTeamLeagueResultDataUrl } from './exportTeamLeagueResultJpeg';
import type { TeamLeague, TeamEntry, TeamLeagueMatch, TeamLeagueStanding } from './types';

interface Props {
  league: TeamLeague;
  standings: TeamLeagueStanding[];
  matches: TeamLeagueMatch[];
  allTeams: TeamEntry[];
  tournamentName: string;
}

/** 自動短縮（苗字2文字） */
function autoShortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 2) return trimmed;
  return trimmed.substring(0, 2);
}

export function TeamLeagueResultPreview({ league, standings, matches, allTeams, tournamentName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // 選手名の手動上書き: { 元の名前: 表示名 }
  const [playerOverrides, setPlayerOverrides] = useState<Record<string, string>>({});

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

  // モーダルを開くたびに最新コードで再生成する（閉じたらキャッシュを破棄）
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    generateTeamLeagueResultDataUrl(league, standings, matches, allTeams, tournamentName, playerOverrides)
      .then(url => {
        if (isMounted) {
          setDataUrl(url);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, league, standings, matches, allTeams, tournamentName, playerOverrides]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${league.leagueId.trim()}リーグ結果_団体戦.jpg`;
    a.click();
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
      {/* プレビュー呼び出しボタン (水色ベース) */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:shadow hover:bg-sky-100 hover:border-sky-300 transition-all active:scale-95 whitespace-nowrap"
      >
        <ImageIcon size={14} className="text-sky-600" />
        結果画像
      </button>

      {/* モーダル表示 */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-sky-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-5xl max-h-[90vh] border border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            {/* モーダルヘッダー (水色グラデ) */}
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sky-900 text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-sm">
                  <ImageIcon size={13} />
                </span>
                {league.leagueId.trim()}リーグ 予選結果プレビュー
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEdit(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg shadow transition-colors active:scale-95 border ${
                    showEdit
                      ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                  }`}
                  title="選手名を手動編集"
                >
                  <Pencil size={13} />
                  選手名編集
                  {Object.keys(playerOverrides).length > 0 && (
                    <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {Object.keys(playerOverrides).length}
                    </span>
                  )}
                </button>
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white text-xs font-bold rounded-lg shadow hover:from-sky-600 hover:to-sky-700 transition-colors active:scale-95"
                  >
                    <Download size={14} />
                    ダウンロード
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-8 h-8 text-sky-500 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors"
                  aria-label="閉じる"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 選手名編集パネル（トグル表示） */}
            {showEdit && (
              <div className="border-b border-amber-200 bg-amber-50/50 shrink-0">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="text-xs font-bold text-amber-800">
                    表示名を編集（空欄またはデフォルトで自動短縮: 苗字2文字）
                  </div>
                  <button
                    onClick={resetOverrides}
                    disabled={Object.keys(playerOverrides).length === 0}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-amber-700 bg-white border border-amber-300 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={11} />
                    すべてリセット
                  </button>
                </div>
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  {allPlayerNames.length === 0 ? (
                    <div className="text-[11px] text-amber-700/70 italic">選手名が登録されていません</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {allPlayerNames.map(name => {
                        const autoValue = autoShortName(name);
                        const currentValue = playerOverrides[name] ?? autoValue;
                        const isOverridden = playerOverrides[name] !== undefined;
                        return (
                          <label key={name} className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-amber-900/70 truncate" title={name}>
                              {name}
                            </span>
                            <input
                              type="text"
                              value={currentValue}
                              onChange={e => updateOverride(name, e.target.value)}
                              placeholder={autoValue}
                              className={`px-2 py-1 text-[11px] font-bold bg-white rounded border ${
                                isOverridden ? 'border-amber-400 ring-1 ring-amber-300' : 'border-amber-200'
                              } focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-400`}
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
              {isLoading && (
                <div className="flex flex-col items-center gap-2 text-sky-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${league.leagueId}リーグ結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-sky-100 bg-white rounded"
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
