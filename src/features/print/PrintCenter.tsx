// =============================================================================
// 印刷メニュー（賞状印刷）
//
// 決勝トーナメント画面の賞状印刷は「決勝が終わったクラス」でしか開けなかったため、
// 表彰式の準備を前もって進められなかった。この画面は大会の進行状況に関係なく
// 単独で開けて、
//   ・エントリー済みの選手／チームから選んで入れる（選択式）
//   ・データが無くても手で入れる（手動）
// の両方で賞状を作れるようにしている。
//
// フォントは毛筆・楷書・明朝など複数から選べる（certificateFonts.ts）。
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Printer, Plus, Trash2, Copy, Search, Award, Settings2,
  ChevronUp, ChevronDown, Eye, RotateCcw, Users, ListChecks, ArrowLeftRight,
} from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { buildFontStack, CERT_FONTS, getCertFont, loadCertificateFont, type CertFontGroup } from './certificateFonts';
import {
  DEFAULT_CERT_LAYOUT, PAPER_SIZE, newCertEntry,
  type CertEntry, type CertLayout, type CertPaper,
} from './certificateTypes';
import { buildCertificateHtml, buildCertificatePreviewHtml } from './certificateHtml';
import {
  collectIndividualCandidates, collectMixedCandidates, collectTeamCandidates,
  swapPairName, winnersOnly, type CertCandidate,
} from './certificateCandidates';

/** 賞位のよく使う選択肢（自由入力も可） */
const RANK_PRESETS = ['優勝', '準優勝', '第3位', '第4位', '第5位', 'ベスト8', '敢闘賞', '3位'];

const LS_LAYOUT = 'certPrint.layout';
const LS_ENTRIES = 'certPrint.entries';

/** 保存済みレイアウトを読む（壊れていたら既定値） */
function loadLayout(): CertLayout {
  try {
    const raw = localStorage.getItem(LS_LAYOUT);
    if (!raw) return DEFAULT_CERT_LAYOUT;
    return { ...DEFAULT_CERT_LAYOUT, ...JSON.parse(raw) } as CertLayout;
  } catch {
    return DEFAULT_CERT_LAYOUT;
  }
}

/** 保存済みの賞状リストを読む */
function loadEntries(): CertEntry[] {
  try {
    const raw = localStorage.getItem(LS_ENTRIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as CertEntry[] : [];
  } catch {
    return [];
  }
}

type SourceId = 'mixed' | 'team' | 'individual';

export default function PrintCenter() {
  const [entries, setEntries] = useState<CertEntry[]>(loadEntries);
  const [layout, setLayout] = useState<CertLayout>(loadLayout);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // --- データ元（読み込まれている大会データから候補を出す） ---
  const isMixedImported = useMixedStore(s => s.isImported);
  const mixedTeams = useMixedStore(s => s.allTeams);
  const mixedBrackets = useMixedStore(s => s.brackets);
  const mixedInfo = useMixedStore(s => s.tournamentInfo);

  const isTeamImported = useTeamStore(s => s.isImported);
  const teamTeams = useTeamStore(s => s.allTeams);
  const teamBrackets = useTeamStore(s => s.brackets);
  const teamInfo = useTeamStore(s => s.tournamentInfo);

  const currentTournamentId = useAppStore(s => s.currentTournamentId);
  const tournament = useLiveQuery(
    () => currentTournamentId
      ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
      : undefined,
    [currentTournamentId],
  );
  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId],
  ) || [];
  const eventIdKey = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const matches = useLiveQuery(async () => {
    const ids = eventIdKey.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIdKey]) || [];

  const availableSources = useMemo(() => {
    const list: { id: SourceId; label: string }[] = [];
    if (isMixedImported && mixedTeams.length > 0) list.push({ id: 'mixed', label: 'ミックス大会' });
    if (isTeamImported && teamTeams.length > 0) list.push({ id: 'team', label: '団体戦' });
    if (events.length > 0) list.push({ id: 'individual', label: '個人戦' });
    return list;
  }, [isMixedImported, mixedTeams.length, isTeamImported, teamTeams.length, events.length]);

  // データ元は「選ばれていればそれ／無ければ先頭」を都度求める（状態を持ちすぎない）
  const [sourcePref, setSourcePref] = useState<SourceId | null>(null);
  const source: SourceId | null = useMemo(() => {
    if (sourcePref && availableSources.some(s => s.id === sourcePref)) return sourcePref;
    return availableSources[0]?.id ?? null;
  }, [sourcePref, availableSources]);

  /** 大会名（全体レイアウト印刷の既定値に使う） */
  const tournamentName = useMemo(() => {
    if (source === 'mixed') return mixedInfo?.name || '';
    if (source === 'team') return teamInfo?.name || '';
    return tournament?.name || '';
  }, [source, mixedInfo, teamInfo, tournament]);

  const candidates: CertCandidate[] = useMemo(() => {
    if (source === 'mixed') return collectMixedCandidates(mixedTeams, mixedBrackets);
    if (source === 'team') return collectTeamCandidates(teamTeams, teamBrackets, teamInfo?.bracketLabels);
    if (source === 'individual') return collectIndividualCandidates(events, matches);
    return [];
  }, [source, mixedTeams, mixedBrackets, teamTeams, teamBrackets, teamInfo, events, matches]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim();
    if (!q) return candidates;
    return candidates.filter(c =>
      c.name.includes(q) || c.category.includes(q) || c.group.includes(q) || c.affiliation.includes(q));
  }, [candidates, query]);

  // --- 保存 ---
  useEffect(() => { localStorage.setItem(LS_LAYOUT, JSON.stringify(layout)); }, [layout]);
  useEffect(() => { localStorage.setItem(LS_ENTRIES, JSON.stringify(entries)); }, [entries]);

  // 選択中のフォントをプレビュー用に読み込む
  useEffect(() => { loadCertificateFont(layout.fontId); }, [layout.fontId]);

  // --- 賞状リストの操作 ---
  const addEntry = useCallback((patch: Partial<CertEntry> = {}) => {
    const entry = newCertEntry(patch);
    setEntries(prev => [...prev, entry]);
    setPreviewId(entry.id);
  }, []);

  const addFromCandidate = useCallback((c: CertCandidate) => {
    addEntry({
      category: c.category,
      rank: c.rankHint || '優勝',
      affiliation: c.affiliation,
      names: c.name,
    });
  }, [addEntry]);

  /** 結果が確定している入賞者をまとめて追加する */
  const addAllWinners = useCallback(() => {
    const winners = winnersOnly(candidates);
    if (winners.length === 0) return;
    const added = winners.map(c => newCertEntry({
      category: c.category,
      rank: c.rankHint!,
      affiliation: c.affiliation,
      names: c.name,
    }));
    setEntries(prev => [...prev, ...added]);
    setPreviewId(added[0].id);
  }, [candidates]);

  /** 名前は後で入れる前提のひな形（優勝・準優勝・第3位）をまとめて追加する */
  const addBlankSet = useCallback(() => {
    const category = entries[entries.length - 1]?.category || '';
    const added = ['優勝', '準優勝', '第3位'].map(rank => newCertEntry({ rank, category }));
    setEntries(prev => [...prev, ...added]);
    setPreviewId(added[0].id);
  }, [entries]);

  const updateEntry = useCallback((id: string, patch: Partial<CertEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setPreviewId(prev => prev === id ? null : prev);
  }, []);

  const duplicateEntry = useCallback((id: string) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy = newCertEntry({
        selected: src.selected,
        category: src.category,
        rank: src.rank,
        affiliation: src.affiliation,
        names: src.names,
      });
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, []);

  const moveEntry = useCallback((id: string, dir: -1 | 1) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }, []);

  // 実際に何か印字される行だけを対象にする（白紙のページを刷らないため）
  const selectedEntries = useMemo(
    () => entries.filter(e => e.selected && (
      e.names.trim()
      || (layout.showRank && e.rank.trim())
      || (layout.showCategory && e.category.trim())
      || (layout.showAffiliation && e.affiliation.trim())
    )),
    [entries, layout.showRank, layout.showCategory, layout.showAffiliation],
  );

  /**
   * 実際に刷る枚数ぶんに展開する。
   * ダブルス（氏名が全角スペースで2つに分かれる）は、設定が入っていれば
   * 氏名を入れ替えた分をもう1枚足す（2人それぞれに渡すため）。
   */
  const printPages = useMemo(() => {
    if (!layout.swapDoubles) return selectedEntries;
    const pages: CertEntry[] = [];
    for (const e of selectedEntries) {
      pages.push(e);
      const swapped = swapPairName(e.names);
      if (swapped) pages.push({ ...e, id: `${e.id}-swap`, names: swapped });
    }
    return pages;
  }, [selectedEntries, layout.swapDoubles]);

  const previewEntry = useMemo(
    () => entries.find(e => e.id === previewId) || entries[0] || null,
    [entries, previewId],
  );

  // --- 印刷 ---
  const handlePrint = useCallback(() => {
    if (printPages.length === 0) return;
    const html = buildCertificateHtml(printPages, layout);
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      alert('印刷用ウィンドウを開けませんでした。ブラウザのポップアップブロックを解除してください。');
      return;
    }
    win.document.write(html);
    win.document.close();
    const doPrint = () => { try { win.focus(); win.print(); } catch { /* 閉じられた場合は何もしない */ } };
    // Webフォントの読み込みを待ってから印刷する（待たないと明朝で刷られてしまう）
    const fonts = win.document.fonts;
    if (fonts) fonts.ready.then(() => setTimeout(doPrint, 400)).catch(() => setTimeout(doPrint, 1200));
    else setTimeout(doPrint, 1200);
  }, [printPages, layout]);

  return (
    <div className="p-2 sm:p-4 space-y-3">
      {/* ===== ヘッダー ===== */}
      <div className="bg-white rounded-2xl border border-primary-200/70 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            <div>
              <h1 className="text-base font-black leading-tight">賞状印刷</h1>
              <p className="text-[10px] opacity-90 leading-tight">試合が決まっていなくても、選んで／手で入れて印刷できます</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                showSettings ? 'bg-white text-gray-800' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />書式設定
            </button>
            <button
              onClick={handlePrint}
              disabled={printPages.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-gray-800 text-xs font-black shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-50 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />{printPages.length}枚を印刷
            </button>
          </div>
        </div>

        {/* 書式設定パネル */}
        {showSettings && (
          <LayoutPanel
            layout={layout}
            onChange={patch => setLayout(prev => ({ ...prev, ...patch }))}
            onReset={() => setLayout({ ...DEFAULT_CERT_LAYOUT, eventName: tournamentName })}
            tournamentName={tournamentName}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
        <div className="space-y-3 min-w-0">
          {/* ===== 選択式：大会データから追加 ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-700">選択式で入れる</span>
              {availableSources.length > 1 && (
                <div className="flex items-center gap-1 ml-1">
                  {availableSources.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSourcePref(s.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        source === s.id
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >{s.label}</button>
                  ))}
                </div>
              )}
              <span className="ml-auto text-[10px] text-gray-400">{filteredCandidates.length}件</span>
            </div>

            {availableSources.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                大会データが読み込まれていません。下の「手動で入れる」から直接入力してください。
              </p>
            ) : (
              <>
                <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="氏名・チーム名・クラスで絞り込み"
                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none"
                    />
                  </div>
                  <button
                    onClick={addAllWinners}
                    disabled={winnersOnly(candidates).length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-800 bg-primary-50 border border-primary-200 hover:bg-primary-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="決勝が終わったクラスの優勝・準優勝・第3位をまとめて追加します"
                  >
                    <ListChecks className="w-3.5 h-3.5" />入賞者を一括追加
                  </button>
                </div>
                <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-50">
                  {filteredCandidates.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-gray-400">該当する候補がありません</p>
                  ) : filteredCandidates.map(c => (
                    <button
                      key={c.key}
                      onClick={() => addFromCandidate(c)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-primary-50/60 transition-colors"
                    >
                      <span className="shrink-0 text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{c.group}</span>
                      <span className="flex-1 min-w-0 truncate text-xs font-bold text-gray-800">{c.name}</span>
                      {c.affiliation && <span className="shrink-0 text-[10px] text-gray-400 truncate max-w-[120px]">{c.affiliation}</span>}
                      {c.rankHint && (
                        <span className="shrink-0 text-[9px] font-black text-gray-800 bg-primary-100 rounded-full px-1.5 py-0.5">{c.rankHint}</span>
                      )}
                      <Plus className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ===== 印刷リスト ===== */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
              <Printer className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-700">印刷リスト</span>
              <span className="text-[10px] text-gray-400">
                （チェックした{selectedEntries.length}件 → {printPages.length}枚を印刷）
              </span>
              {entries.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('印刷リストを全て削除しますか？')) { setEntries([]); setPreviewId(null); } }}
                  className="ml-auto text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                >すべて削除</button>
              )}
            </div>

            <div className="divide-y divide-gray-100">
              {entries.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-gray-400">
                  上の一覧から選ぶか、「手動で追加」で賞状を作ってください。
                </p>
              )}
              {entries.map((entry, idx) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  index={idx}
                  isPreview={previewEntry?.id === entry.id}
                  swapDoubles={layout.swapDoubles}
                  onSelect={() => setPreviewId(entry.id)}
                  onChange={patch => updateEntry(entry.id, patch)}
                  onRemove={() => removeEntry(entry.id)}
                  onDuplicate={() => duplicateEntry(entry.id)}
                  onMove={dir => moveEntry(entry.id, dir)}
                />
              ))}
            </div>

            <div className="p-2.5 flex gap-2">
              <button
                onClick={() => addEntry({ category: entries[entries.length - 1]?.category || '' })}
                className="flex-1 py-2 border-2 border-dashed border-gray-300 rounded-xl text-[11px] font-bold text-gray-500 hover:border-primary-400 hover:text-gray-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />手動で追加
              </button>
              <button
                onClick={addBlankSet}
                className="flex-1 py-2 border-2 border-dashed border-gray-300 rounded-xl text-[11px] font-bold text-gray-500 hover:border-primary-400 hover:text-gray-700 transition-colors"
                title="優勝・準優勝・第3位の3枚を空欄で追加します"
              >
                <Plus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />優勝〜第3位のひな形
              </button>
            </div>
          </section>
        </div>

        {/* ===== プレビュー ===== */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden lg:sticky lg:top-2">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-bold text-gray-700">プレビュー</span>
            <span className="ml-auto text-[10px] text-gray-400">
              {PAPER_SIZE[layout.paper].label}／{layout.overlay ? '文字のみ' : '枠つき'}
            </span>
          </div>
          <CertificatePreview entry={previewEntry} layout={layout} />
          <p className="px-3 pb-3 text-[10px] leading-relaxed text-gray-400">
            オレンジの点線は印字される範囲の目安です（印刷はされません）。
            賞状用紙に重ねて刷るときは「文字のみ印刷」のまま、位置を上下左右で合わせてください。
          </p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 賞状1件の編集行
// ---------------------------------------------------------------------------
function EntryRow({
  entry, index, isPreview, swapDoubles, onSelect, onChange, onRemove, onDuplicate, onMove,
}: {
  entry: CertEntry;
  index: number;
  isPreview: boolean;
  /** ダブルスの入れ替え印刷が有効か（この行が2枚になるかの表示に使う） */
  swapDoubles: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CertEntry>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const swapped = swapPairName(entry.names);
  return (
    <div
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer transition-colors ${
        isPreview ? 'bg-primary-50/70 ring-1 ring-inset ring-primary-300' : entry.selected ? 'hover:bg-gray-50' : 'bg-gray-50/70 opacity-60 hover:opacity-80'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-black text-gray-300 w-4 text-center shrink-0">{index + 1}</span>
        <input
          type="checkbox"
          checked={entry.selected}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ selected: e.target.checked })}
          className="accent-primary-500 shrink-0"
          title="印刷対象にする"
        />
        <input
          list="cert-rank-presets"
          value={entry.rank}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ rank: e.target.value })}
          placeholder="賞位"
          className="w-[86px] shrink-0 text-[11px] font-bold border border-gray-200 rounded px-1.5 py-1 bg-white focus:border-primary-400 outline-none"
        />
        <input
          value={entry.category}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ category: e.target.value })}
          placeholder="クラス・種目名"
          className="flex-1 min-w-0 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:border-primary-400 outline-none"
        />
        <div className="flex items-center shrink-0">
          {swapped && (
            <button
              onClick={e => { e.stopPropagation(); onChange({ names: swapped }); }}
              className="p-1 text-gray-300 hover:text-gray-700"
              title="ペアの氏名の順番を入れ替える"
            ><ArrowLeftRight className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={e => { e.stopPropagation(); onMove(-1); }} className="p-1 text-gray-300 hover:text-gray-600" title="上へ"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); onMove(1); }} className="p-1 text-gray-300 hover:text-gray-600" title="下へ"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); onDuplicate(); }} className="p-1 text-gray-300 hover:text-gray-500" title="複製"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 pl-[26px]">
        <input
          value={entry.affiliation}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ affiliation: e.target.value })}
          placeholder="所属・チーム名（任意）"
          className="w-[38%] text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:border-primary-400 outline-none"
        />
        <input
          value={entry.names}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ names: e.target.value })}
          placeholder="氏名（ダブルスは間を全角スペースで。例: 岸本 健悟　安田 彰汰）"
          className="flex-1 min-w-0 text-xs font-bold border border-gray-200 rounded px-2 py-1 focus:border-primary-400 outline-none"
        />
        {swapDoubles && swapped && entry.selected && (
          <span
            className="shrink-0 text-[9px] font-black text-gray-800 bg-primary-100 rounded-full px-1.5 py-0.5"
            title={`入れ替えた「${swapped}」も印刷されます`}
          >×2</span>
        )}
      </div>
      <datalist id="cert-rank-presets">
        {RANK_PRESETS.map(r => <option key={r} value={r} />)}
      </datalist>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 書式設定パネル
// ---------------------------------------------------------------------------
const FONT_GROUPS: CertFontGroup[] = ['毛筆', '楷書・手書き', '明朝', 'PCのフォント'];

function LayoutPanel({
  layout, onChange, onReset, tournamentName,
}: {
  layout: CertLayout;
  onChange: (patch: Partial<CertLayout>) => void;
  onReset: () => void;
  tournamentName: string;
}) {
  // 選択肢にマウスを乗せた／表示した時点で読み込んでおくと、選んだ瞬間に反映される
  useEffect(() => { CERT_FONTS.slice(0, 3).forEach(f => loadCertificateFont(f.id)); }, []);

  const selectedFont = CERT_FONTS.find(f => f.id === layout.fontId);

  return (
    <div className="p-3 space-y-3 bg-primary-50/40 border-t border-primary-100">
      {/* フォント */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-gray-600">フォント（習字・毛筆など）</label>
          <button onClick={onReset} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
            <RotateCcw className="w-3 h-3" />既定に戻す
          </button>
        </div>
        <div className="space-y-1.5">
          {FONT_GROUPS.map(group => (
            <div key={group} className="flex items-start gap-2">
              <span className="shrink-0 w-[76px] pt-1 text-[10px] font-bold text-gray-400">{group}</span>
              <div className="flex flex-wrap gap-1.5">
                {CERT_FONTS.filter(f => f.group === group).map(f => (
                  <button
                    key={f.id}
                    onMouseEnter={() => loadCertificateFont(f.id)}
                    onFocus={() => loadCertificateFont(f.id)}
                    onClick={() => onChange({ fontId: f.id })}
                    title={f.note}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                      layout.fontId === f.id
                        ? 'bg-primary-500 text-white border-primary-500 font-bold'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                    }`}
                    style={{ fontFamily: buildFontStack(f, layout.customFont), fontWeight: layout.fontWeight }}
                  >{f.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedFont && (
          <p className="mt-1.5 text-[10px] text-gray-400">
            {selectedFont.note}
            {selectedFont.hasRealWeights
              ? '／太さ違いあり（「太さ」でしっかり変わります）'
              : '／太さ違いが無いフォントです（「太さ微調整」で太らせられます）'}
          </p>
        )}

        {/* 一覧に無いフォントも使えるようにする（PCに入れた毛筆フォントなど） */}
        <div className="mt-2 flex items-start gap-2">
          <span className="shrink-0 w-[76px] pt-1.5 text-[10px] font-bold text-gray-400">名前で指定</span>
          <div className="flex-1 min-w-0">
            <input
              value={layout.customFont}
              onChange={e => onChange({ customFont: e.target.value })}
              placeholder="例: 衡山毛筆フォント行書（PCに入れたフォント名をそのまま入力）"
              className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none"
              style={layout.customFont.trim()
                ? { fontFamily: buildFontStack(getCertFont(layout.fontId), layout.customFont) }
                : undefined}
            />
            <p className="mt-1 text-[10px] text-gray-400">
              PCにインストールしたフォントを、上の一覧に無くても使えます。入っていない端末では上で選んだフォントで表示されます。
              {layout.customFont.trim() && (
                <button onClick={() => onChange({ customFont: '' })} className="ml-1 text-gray-400 underline hover:text-gray-600">
                  指定を消す
                </button>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 用紙・モード */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
          用紙
          <select
            value={layout.paper}
            onChange={e => onChange({ paper: e.target.value as CertPaper })}
            className="text-[11px] font-normal border border-gray-200 rounded px-2 py-1 bg-white"
          >
            {(Object.keys(PAPER_SIZE) as CertPaper[]).map(p => (
              <option key={p} value={p}>{PAPER_SIZE[p].label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={layout.overlay} onChange={e => onChange({ overlay: e.target.checked })} className="accent-primary-500" />
          文字のみ印刷（賞状用紙に重ねる）
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600" title="賞状用紙に縦書きで重ねたいときに使います">
          <input type="checkbox" checked={layout.vertical} onChange={e => onChange({ vertical: e.target.checked })} className="accent-primary-500" />
          縦書き
        </label>
      </div>

      {/* 賞状に載せる項目。既定は氏名のみ（クラス名・賞位は賞状用紙に刷り込み済みのことが多い） */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold text-gray-600">印刷する項目</span>
        <span className="text-[11px] text-gray-400">氏名（常に印刷）</span>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={layout.showRank} onChange={e => onChange({ showRank: e.target.checked })} className="accent-primary-500" />
          賞位
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={layout.showCategory} onChange={e => onChange({ showCategory: e.target.checked })} className="accent-primary-500" />
          クラス名
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={layout.showAffiliation} onChange={e => onChange({ showAffiliation: e.target.checked })} className="accent-primary-500" />
          所属
        </label>
      </div>

      {/* ダブルスの2枚出し */}
      <label className="flex items-center gap-1.5 text-[11px] text-gray-600" title="ペアの2人それぞれに、自分の名前が先に来た賞状を渡すための設定です">
        <input type="checkbox" checked={layout.swapDoubles} onChange={e => onChange({ swapDoubles: e.target.checked })} className="accent-primary-500" />
        ダブルスは氏名を入れ替えてもう1枚印刷する（1組 → 2枚）
      </label>

      {/* 位置・サイズ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2">
        <RangeField label="上下位置" value={layout.blockTop} min={0} max={85} step={1} unit="%" onChange={v => onChange({ blockTop: v })} />
        <RangeField label="左右位置" value={layout.offsetX} min={-60} max={60} step={1} unit="mm" onChange={v => onChange({ offsetX: v })} />
        <RangeField label="行間" value={layout.lineGap} min={0} max={30} step={1} unit="mm" onChange={v => onChange({ lineGap: v })} />
        {/* マイナスにすると字間を詰められる（長い氏名を1行に収めたいとき用） */}
        <RangeField label="字間" value={layout.tracking} min={-0.4} max={1} step={0.01} unit="em" onChange={v => onChange({ tracking: v })} />
        <RangeField label="太さ" value={layout.fontWeight} min={100} max={900} step={100} unit="" onChange={v => onChange({ fontWeight: v })} />
        <RangeField label="太さ微調整" value={layout.strokeWidth} min={0} max={2} step={0.05} unit="px" onChange={v => onChange({ strokeWidth: v })} />
        <RangeField label="クラス名" value={layout.categorySize} min={8} max={90} step={1} unit="pt" onChange={v => onChange({ categorySize: v })} />
        <RangeField label="賞位" value={layout.rankSize} min={8} max={110} step={1} unit="pt" onChange={v => onChange({ rankSize: v })} />
        <RangeField label="氏名" value={layout.nameSize} min={8} max={110} step={1} unit="pt" onChange={v => onChange({ nameSize: v })} />
        <RangeField label="所属" value={layout.affiliationSize} min={6} max={60} step={1} unit="pt" onChange={v => onChange({ affiliationSize: v })} />
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        「太さ」で太字にできます。毛筆フォントは太さ違いが配信されていないものが多いので、
        足りないときは「太さ微調整」で輪郭を太らせてください。字間はマイナスにすると詰まります。
      </p>

      {/* 全体レイアウト時だけ使う項目 */}
      {!layout.overlay && (
        <div className="space-y-2 pt-2 border-t border-primary-100">
          <p className="text-[10px] text-gray-500">枠・題字ごと印刷するときの内容（白紙から1枚仕上げる場合）</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField label="題字" value={layout.title} onChange={v => onChange({ title: v })} />
            <TextField
              label="大会名"
              value={layout.eventName}
              placeholder={tournamentName || '大会名'}
              onChange={v => onChange({ eventName: v })}
            />
            <TextField label="日付" value={layout.dateText} placeholder="令和8年8月30日" onChange={v => onChange({ dateText: v })} />
            <TextField label="主催者名" value={layout.organizer} onChange={v => onChange({ organizer: v })} />
          </div>
          <label className="block">
            <span className="text-[10px] font-bold text-gray-500">本文（{'{rank}'} {'{category}'} {'{names}'} が差し替わります）</span>
            <textarea
              value={layout.bodyText}
              onChange={e => onChange({ bodyText: e.target.value })}
              rows={3}
              className="mt-0.5 w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-primary-400 outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function RangeField({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[10px] font-bold text-gray-500">
        {label}
        <span className="tabular-nums text-gray-400 font-normal">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary-500"
      />
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-gray-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="mt-0.5 w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-primary-400 outline-none"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// プレビュー（印刷と同じHTMLを iframe に入れて縮小表示する）
// ---------------------------------------------------------------------------
const MM_TO_PX = 96 / 25.4;

function CertificatePreview({ entry, layout }: { entry: CertEntry | null; layout: CertLayout }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(320);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxWidth(el.clientWidth || 320);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paper = PAPER_SIZE[layout.paper];
  const pageW = paper.width * MM_TO_PX;
  const pageH = paper.height * MM_TO_PX;
  const scale = Math.min(1, (boxWidth - 8) / pageW);

  const srcDoc = useMemo(
    () => entry ? buildCertificatePreviewHtml(entry, layout) : '',
    [entry, layout],
  );

  return (
    <div ref={boxRef} className="p-2 bg-gray-100">
      {entry ? (
        <div className="mx-auto overflow-hidden" style={{ width: pageW * scale, height: pageH * scale }}>
          <iframe
            title="賞状プレビュー"
            srcDoc={srcDoc}
            scrolling="no"
            style={{
              width: pageW, height: pageH, border: 'none',
              transform: `scale(${scale})`, transformOrigin: 'top left',
            }}
          />
        </div>
      ) : (
        <p className="py-16 text-center text-xs text-gray-400">印刷リストに賞状を追加するとここに表示されます</p>
      )}
    </div>
  );
}
