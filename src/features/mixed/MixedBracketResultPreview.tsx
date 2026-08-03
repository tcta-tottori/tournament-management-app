import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, ImageIcon, Loader2, Save, X } from 'lucide-react';
import {
  generateMixedBracketResultDataUrl,
  buildMixedBracketResultFileName,
  MIXED_CATEGORY_LABELS,
} from './exportMixedBracketResultJpeg';
import type { MixedBracketResultOptions } from './exportMixedBracketResultJpeg';
import { getAssociationLogoEnabled, setAssociationLogoEnabled } from '../draw/resultCanvasKit';
import { useMixedStore } from './mixedStore';

interface Props {
  opts: MixedBracketResultOptions;
  size?: 'sm' | 'md';
  label?: string;
}

/**
 * 決勝トーナメント（順位カテゴリ）の結果画像プレビュー。
 * 表示・ダウンロードの体裁はシングルス大会の EventResultPreview と同じ。
 */
export default function MixedBracketResultPreview({ opts, size = 'sm', label = '結果画像' }: Props) {
  const updateTournamentInfo = useMixedStore(s => s.updateTournamentInfo);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 協会ロゴを入れるかどうか（設定は次回以降も保持する）
  const [showLogo, setShowLogo] = useState(getAssociationLogoEnabled);
  // 画像に印字する大会名（この場で修整できる）
  const [nameDraft, setNameDraft] = useState(opts.tournamentName);
  const [appliedName, setAppliedName] = useState(opts.tournamentName);
  const [nameSaved, setNameSaved] = useState(false);

  const categoryLabel = MIXED_CATEGORY_LABELS[opts.bracket.category] || opts.bracket.category;

  const toggleLogo = (next: boolean) => {
    setShowLogo(next);
    setAssociationLogoEnabled(next);
  };

  // 開いた時点の大会名を初期値にする（保存後に入力欄が巻き戻らないよう1回だけ）
  const nameInitRef = useRef(false);
  useEffect(() => {
    if (!isOpen) { nameInitRef.current = false; return; }
    if (nameInitRef.current) return;
    nameInitRef.current = true;
    setNameDraft(opts.tournamentName);
    setAppliedName(opts.tournamentName);
    setNameSaved(false);
  }, [isOpen, opts.tournamentName]);

  // 入力が落ち着いたらプレビューへ反映する（1文字ごとの再描画を避ける）
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setAppliedName(nameDraft), 400);
    return () => clearTimeout(timer);
  }, [nameDraft, isOpen]);

  const renderOpts = useMemo<MixedBracketResultOptions>(() => ({
    ...opts,
    tournamentName: appliedName.trim() || opts.tournamentName,
    showAssociationLogo: showLogo,
  }), [opts, appliedName, showLogo]);

  // 開くたびに最新データで再生成する
  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let isMounted = true;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = await generateMixedBracketResultDataUrl(renderOpts);
        if (!isMounted) return;
        if (url) setDataUrl(url);
        else setError('結果画像を生成できませんでした。');
      } catch (err) {
        console.error(err);
        if (isMounted) setError('結果画像の生成に失敗しました。');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }, 30);
    return () => { isMounted = false; clearTimeout(timer); };
  }, [isOpen, renderOpts]);

  /** 修整した大会名を大会データにも保存する（他の出力にも反映される） */
  const handleSaveName = () => {
    const next = nameDraft.trim();
    if (!next || next === opts.tournamentName) return;
    setAppliedName(next);
    updateTournamentInfo('name', next);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = buildMixedBracketResultFileName(renderOpts);
    a.click();
  };

  const btnClass = size === 'sm'
    ? 'flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:bg-sky-100 active:scale-95 transition-all whitespace-nowrap'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 shadow-sm hover:shadow hover:bg-sky-100 hover:border-sky-300 transition-all active:scale-95 whitespace-nowrap';

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setIsOpen(true); }} className={btnClass}>
        <ImageIcon size={size === 'sm' ? 12 : 14} className="text-sky-600" />
        {label}
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 bg-sky-950/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-6xl max-h-[92vh] border border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sky-900 text-sm flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-sm shrink-0">
                  <ImageIcon size={13} />
                </span>
                <span className="truncate">{categoryLabel} 結果プレビュー</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                {dataUrl && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg shadow hover:from-sky-600 hover:to-sky-700 transition-colors active:scale-95"
                    title="JPEGで保存"
                    aria-label="JPEGで保存"
                  >
                    <Download size={15} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-9 h-9 text-sky-500 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 transition-colors"
                  aria-label="閉じる"
                  title="閉じる"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* 大会名の修整（画像右上に印字される文字列） */}
            <div className="px-4 py-2.5 border-b border-sky-100 bg-white shrink-0">
              <label className="text-[10px] font-semibold text-sky-700/70 block mb-1">
                大会名（画像に印字されます）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={() => setAppliedName(nameDraft)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setAppliedName(nameDraft); } }}
                  placeholder="大会名を入力"
                  className="flex-1 min-w-0 border border-sky-200 rounded-lg px-3 py-1.5 text-[13px] font-medium bg-sky-50/40 focus:bg-white focus:border-sky-400 focus:ring-[3px] focus:ring-sky-500/10 outline-none transition-all"
                />
                <button
                  onClick={handleSaveName}
                  disabled={!nameDraft.trim() || nameDraft.trim() === opts.tournamentName}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 transition-colors active:scale-95"
                  title="大会データにも保存する"
                >
                  {nameSaved ? <Check size={13} /> : <Save size={13} />}
                  {nameSaved ? '保存しました' : '保存'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                入力するとプレビューに反映されます。「保存」で大会データにも反映され、他の出力でも同じ名称になります。
              </p>
            </div>

            <div className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center">
              {isLoading && (
                <div className="flex flex-col items-center gap-2 text-sky-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-medium">画像を生成中...</span>
                </div>
              )}
              {!isLoading && error && <div className="text-sm text-gray-500">{error}</div>}
              {dataUrl && !isLoading && (
                <img
                  src={dataUrl}
                  alt={`${categoryLabel}結果`}
                  className="max-w-full h-auto object-contain shadow-sm border border-sky-100 bg-white rounded"
                  style={{ maxHeight: '100%' }}
                />
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-sky-100 bg-sky-50/50 text-[11px] text-sky-700 flex items-center justify-between gap-2 shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 font-medium">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={e => toggleLogo(e.target.checked)}
                  className="w-3.5 h-3.5 accent-sky-600 cursor-pointer"
                />
                協会ロゴを入れる
              </label>
              {dataUrl && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-700 transition-colors active:scale-95 shrink-0"
                >
                  <Download size={13} />
                  JPEGで保存
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
