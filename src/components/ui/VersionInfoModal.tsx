import { createPortal } from 'react-dom';
import { X, Sparkles, Bug, Wrench, Paintbrush, ChevronRight } from 'lucide-react';

/** 更新履歴のエントリ */
interface ChangelogEntry {
  version: string;
  date: string;
  highlights?: string;
  changes: { type: 'feat' | 'fix' | 'design' | 'chore'; text: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.2',
    date: '2026-03-21',
    highlights: 'PWA高速化・Google Drive連携強化・音声エンジン追加',
    changes: [
      { type: 'feat', text: 'VOICEVOX音声エンジンを放送コールシステムに追加' },
      { type: 'feat', text: '時間割読込・自動コート配置・全コート初戦一斉コール機能' },
      { type: 'feat', text: 'PC版ブラケット表をレスポンシブ化・選手名拡大' },
      { type: 'fix', text: 'PWAキャッシュ戦略をNetworkFirstに変更' },
      { type: 'fix', text: 'GDriveモーダルに進捗バー追加' },
      { type: 'fix', text: 'ふりがな・所属データ読込後に一覧パネルを自動展開' },
      { type: 'fix', text: 'DEF選手がいるときに対戦順が変わるバグを修正' },
      { type: 'fix', text: 'Google Driveフォルダ重複作成を修正' },
      { type: 'design', text: 'インポート完了UIをリデザイン' },
      { type: 'design', text: 'データ管理ページの全セクションを統一的な開閉式パネルに変更' },
    ],
  },
  {
    version: 'v1.1',
    date: '2026-03-20',
    highlights: 'ライブダッシュボード・スコア入力・Google Drive連携',
    changes: [
      { type: 'feat', text: 'スコア入力ダイアログ追加・ブラケット改善' },
      { type: 'feat', text: 'ライブダッシュボード大幅改善' },
      { type: 'feat', text: 'スコアボードに全種目表示モード追加' },
      { type: 'feat', text: 'Google ドライブ連携でふりがな・所属データの読込/書込' },
      { type: 'feat', text: '各ページのヘッダーをスクロール時にスティッキー固定' },
      { type: 'feat', text: 'ふりがな・所属の一括読込ボタン追加' },
      { type: 'fix', text: 'スコア入力ダイアログを画面中央に表示' },
      { type: 'fix', text: 'モバイル表示の全面最適化' },
      { type: 'fix', text: 'リーグ戦でのスコア入力時に次ラウンド進出処理をスキップ' },
      { type: 'fix', text: 'エントリーページのモバイル対応改善' },
      { type: 'fix', text: 'タイムテーブル自動配置を対戦順に統一' },
      { type: 'design', text: 'ヘッダーのゴールド波型ラインを動的アニメーションにリデザイン' },
      { type: 'design', text: 'Google DriveブランドUI化' },
    ],
  },
  {
    version: 'v1.0',
    date: '2026-03-19',
    highlights: '初回リリース',
    changes: [
      { type: 'feat', text: 'データ同期GitHub化・放送コール・時間割Excel対応' },
      { type: 'feat', text: 'スコアボード — ブラケット/リーグ表示・アクションパネル' },
      { type: 'feat', text: 'バックアップ・リストア機能' },
      { type: 'feat', text: 'エントリー管理・抽選・ドロー表生成' },
    ],
  },
];

const TYPE_CONFIG = {
  feat:   { label: '新機能', icon: Sparkles,   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  fix:    { label: '修正',   icon: Bug,         color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  design: { label: 'デザイン', icon: Paintbrush, color: 'text-violet-600', bg: 'bg-violet-50',  border: 'border-violet-200' },
  chore:  { label: 'その他', icon: Wrench,      color: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200' },
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function VersionInfoModal({ open, onClose }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-[min(92vw,480px)] max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">

        {/* ヘッダー */}
        <div className="relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-[#0a2618]" />
          <div className="absolute inset-0 opacity-20"
            style={{ background: 'radial-gradient(circle at 30% 40%, rgba(212,225,87,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(61,126,166,0.3) 0%, transparent 50%)' }} />
          {/* 装飾リング */}
          <div className="absolute -top-6 -right-6 w-28 h-28 border border-white/[0.08] rounded-full" />
          <div className="absolute -bottom-4 -left-4 w-20 h-20 border border-white/[0.06] rounded-full" />

          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mb-2 rounded-full bg-accent/20 border border-accent/30">
                  <Sparkles className="w-3 h-3 text-accent" />
                  <span className="text-[11px] font-bold text-accent tracking-wide">大会運営システム</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-2xl font-bold text-white">v1.2</h2>
                  <span className="text-xs text-white/50">Latest</span>
                </div>
                <p className="text-[11px] text-white/60 mt-1">
                  ビルド: {__BUILD_TIMESTAMP__}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 更新履歴 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">更新履歴</h3>

          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="relative">
              {/* バージョンヘッダー */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-primary-700">{entry.version}</span>
                <span className="text-[11px] text-gray-400">{entry.date}</span>
                {entry === CHANGELOG[0] && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-primary-500 rounded-full uppercase tracking-wider">New</span>
                )}
              </div>

              {/* ハイライト */}
              {entry.highlights && (
                <p className="text-xs text-gray-500 mb-2 pl-1 border-l-2 border-primary-200 ml-0.5">
                  {entry.highlights}
                </p>
              )}

              {/* 変更リスト */}
              <div className="space-y-1">
                {entry.changes.map((change, i) => {
                  const cfg = TYPE_CONFIG[change.type];
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 group">
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-700 leading-relaxed">{change.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* フッター */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/80">
          <p className="text-[10px] text-gray-400">鳥取市テニス協会</p>
          <a
            href="https://github.com/TCTA-Tottori/tournament-management-app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5 transition-colors"
          >
            GitHub
            <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
