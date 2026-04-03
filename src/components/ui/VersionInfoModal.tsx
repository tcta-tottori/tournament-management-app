import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Bug, Wrench, Paintbrush, ChevronRight, ChevronDown, Clock } from 'lucide-react';

type ChangeType = 'feat' | 'fix' | 'design' | 'chore';

/** 時間帯ごとの更新グループ */
interface TimeGroup {
  time: string;          // "13:06" など
  summary: string;       // 時間帯の概要
  changes: { type: ChangeType; text: string }[];
}

/** バージョンごとの更新履歴 */
interface ChangelogEntry {
  version: string;
  date: string;
  highlights?: string;
  timeGroups: TimeGroup[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Ver 2.0',
    date: '2026-04-04',
    highlights: '決勝トーナメント旧データ残留修正・結果タブ完全削除・ストア永続化改善',
    timeGroups: [
      {
        time: '—',
        summary: '決勝トーナメントデータ整合性・不要機能の整理',
        changes: [
          { type: 'fix', text: '決勝トーナメントページでリーグ順位変更後も旧データが残り続ける問題を修正（順位ハッシュによる自動再生成）' },
          { type: 'fix', text: 'Zustandストアにバージョン管理・マイグレーションを追加し、アプリ更新時の旧データ互換性を確保' },
          { type: 'chore', text: '結果タブ削除に伴う未反映箇所を整理（/resultsルート・未使用コンポーネントの除去）' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.6',
    date: '2026-03-23',
    highlights: '対戦順テーブル刷新・試合順Excel取込・ブラケット線修正・BYE配置修正',
    timeGroups: [
      {
        time: '—',
        summary: '対戦順・エントリーページ改善',
        changes: [
          { type: 'feat', text: '対戦順ページをフラットテーブルに再設計（種目・ゲーム数・時間・コート列追加）' },
          { type: 'feat', text: '試合順Excelインポート機能を追加（リーグ戦のまとめ入れにも対応）' },
          { type: 'fix', text: 'エントリーページの左山・右山の決勝接続線をExcel標準パターンの直線に修正' },
          { type: 'fix', text: 'BYE配置をExcelレイアウトに合わせ、エントリーを上から詰めBYEを下部に配置' },
          { type: 'fix', text: 'トーナメントブラケットのジグザグ線を解消し綺麗な接続線に修正' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.5',
    date: '2026-03-22',
    highlights: '2セット+STBスコア入力・ゲームルール編集・棄権(Ret)対応',
    timeGroups: [
      {
        time: '—',
        summary: 'スコア入力・ゲームルール対応強化',
        changes: [
          { type: 'feat', text: '2セットマッチ＋スーパータイブレーク形式のスコア入力に対応（[10-5]表記）' },
          { type: 'feat', text: 'Excelドローからタイブレークセット＋ファイナルセット10ポイントSTB形式を自動検出' },
          { type: 'feat', text: 'ゲームルール編集ダイアログで試合方式（ゲームマッチ / 2セット+STB）を選択可能に' },
          { type: 'feat', text: 'ラウンドヘッダーにゲームルールバッジを表示' },
          { type: 'feat', text: 'スコア入力で棄権(Ret)・不戦勝(DEF)に対応' },
          { type: 'fix', text: 'コートマップPC横向きレイアウト対応' },
          { type: 'design', text: 'スピナー改善・一括読込ウィザード化' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.4',
    date: '2026-03-21',
    highlights: '情報バーティッカー・時間超過ハイライト・LIVE一斉コール整理',
    timeGroups: [
      {
        time: '18:00',
        summary: '情報バー・時間超過表示・LIVEページ改善',
        changes: [
          { type: 'feat', text: '大会情報バーを刷新：固定部分（大会名＋試合形式）＋流れるティッカー（進捗・コート状況・時間超過警告）' },
          { type: 'feat', text: 'コートマップ・LIVEダッシュボード・スコアボードに時間超過ハイライト表示を追加' },
          { type: 'fix', text: 'LIVEページの全コート一斉コールボタンを削除（対戦順ページに統合済み）' },
          { type: 'design', text: '時間超過コートを赤色ボーダー＋グロー＋パルスアイコンで視覚的に強調' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.3',
    date: '2026-03-21',
    highlights: 'タイムテーブル刷新・種目名マッチング修正・ライブステータス表示',
    timeGroups: [
      {
        time: '15:00',
        summary: 'タイムテーブルページ全面改修',
        changes: [
          { type: 'feat', text: '時間割ページをタイムテーブルに改名・スケジュール設定を削除' },
          { type: 'feat', text: 'インポート済み時間割データをコート×時刻のグリッドで表示' },
          { type: 'feat', text: '試合ステータス（待機/試合中/終了/不戦勝）をリアルタイム反映' },
          { type: 'feat', text: 'タイムテーブルのセル編集機能（コート・時刻変更）を追加' },
          { type: 'fix', text: '種目名マッチングを大幅改善（略称・正式名の双方向対応）' },
          { type: 'fix', text: 'スケジュールExcelパースのラウンドラベル正規表現修正（スペース入り対応）' },
          { type: 'fix', text: 'データページの時間割表示を時間→コート順でソート' },
        ],
      },
      {
        time: '14:00',
        summary: 'エントリー確定・対戦順改善',
        changes: [
          { type: 'feat', text: 'エントリー確定時の処理中モーダル・グレーアウト・確定解除機能' },
          { type: 'feat', text: '対戦順シートに時間割・コート順のグローバル表示を追加' },
          { type: 'fix', text: 'トーナメントブラケット線の接続不良を修正' },
          { type: 'fix', text: 'GDrive読込ボタンを3つに整理（一括/ふりがな・所属/大会・時間割）' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.2',
    date: '2026-03-21',
    highlights: 'GDrive連携UI刷新・PWA高速化・音声エンジン追加',
    timeGroups: [
      {
        time: '13:06',
        summary: 'GDrive連携セクション整理・ローディングUI改善',
        changes: [
          { type: 'design', text: 'GDrive読込スピナーを1段カラフルリングに変更' },
          { type: 'feat', text: 'ふりがな・所属操作を所属一覧パネル側に移動' },
          { type: 'feat', text: '大会データ・時間割読込をGDrive連携セクションに統合' },
          { type: 'fix', text: 'ドロー会議読込機能を削除・Excel読込をボタン方式に変更' },
          { type: 'fix', text: '読込が8秒以上停止した場合のタイムアウト処理を追加' },
        ],
      },
      {
        time: '12:24',
        summary: 'エントリーページ モバイル改善',
        changes: [
          { type: 'fix', text: 'モバイルでスクロール時に入力欄を非表示にし、ボタンでのみ再表示' },
        ],
      },
      {
        time: '11:05',
        summary: 'GDriveモーダルに進捗バー追加',
        changes: [
          { type: 'feat', text: '大会データ読込・時間割読込にDriveLoadingModal(進捗バー付き)を追加' },
        ],
      },
      {
        time: '10:54',
        summary: 'バージョン情報モーダル・時間割パーサー改善',
        changes: [
          { type: 'feat', text: 'バージョン情報モーダル追加・ヘッダーバージョンクリックで更新履歴表示' },
          { type: 'fix', text: '時間割Excelパーサーを改善し「コートNO.」形式のグリッドを正しく検出' },
        ],
      },
      {
        time: '09:48',
        summary: 'PWA高速化・キャッシュ戦略変更',
        changes: [
          { type: 'fix', text: 'PWAキャッシュ戦略をNetworkFirstに変更' },
          { type: 'fix', text: '未使用変数affFuriganaMapを削除してビルドエラーを解消' },
        ],
      },
      {
        time: '09:09',
        summary: 'GDriveモーダル進捗バー・時間割フォルダ取得',
        changes: [
          { type: 'fix', text: 'GDriveモーダルに進捗バー追加・時間割読込を専用フォルダから取得' },
        ],
      },
      {
        time: '08:20',
        summary: 'インポート完了UIリデザイン',
        changes: [
          { type: 'design', text: 'インポート完了UIをリデザイン（メッシュグラデーション・パーティクル装飾）' },
          { type: 'fix', text: 'ふりがな・所属データ読込後に一覧パネルを自動展開' },
        ],
      },
      {
        time: '07:11',
        summary: 'データ管理ページ レイアウト統一',
        changes: [
          { type: 'fix', text: '所属・ふりがな一覧をDB辞書テーブルベースに変更しGDrive読込数と一致させる' },
          { type: 'design', text: 'データ管理ページの全セクションを統一的な開閉式パネルに変更' },
        ],
      },
      {
        time: '06:04',
        summary: 'VOICEVOX音声・時間割機能・ブラケット改善',
        changes: [
          { type: 'feat', text: 'VOICEVOX音声エンジンを放送コールシステムに追加' },
          { type: 'feat', text: '時間割読込・自動コート配置・全コート初戦一斉コール機能' },
          { type: 'fix', text: 'DEF選手がいるときに対戦順が変わるバグを修正' },
          { type: 'feat', text: 'PC版ブラケット表をレスポンシブ化・選手名拡大' },
        ],
      },
      {
        time: '05:14',
        summary: 'GDrive大会一覧・所属データ修正',
        changes: [
          { type: 'fix', text: '所属・ふりがな一覧の重複を自動クリーンアップ' },
          { type: 'fix', text: 'Google Drive大会一覧をcreatePortalポップアップ式に変更' },
          { type: 'fix', text: 'PC版ブラケット統一表示・対戦順ボタン常時表示・時間割モーダル中央化' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.1',
    date: '2026-03-20',
    highlights: 'ライブダッシュボード・スコア入力・Google Drive連携',
    timeGroups: [
      {
        time: '20:43',
        summary: 'スコア入力・モバイル最適化',
        changes: [
          { type: 'fix', text: 'スコア入力ダイアログをcreatePortalで画面中央に表示' },
          { type: 'fix', text: 'モバイル表示の全面最適化' },
          { type: 'fix', text: 'レガシーテーブル表示のリーグ戦対応＋音声コール品質改善' },
        ],
      },
      {
        time: '19:37',
        summary: 'スコアボード全種目モード・エントリー改善',
        changes: [
          { type: 'fix', text: 'リーグ戦でのスコア入力時に次ラウンド進出処理をスキップ' },
          { type: 'feat', text: 'スコアボードに全種目表示モード追加（デフォルト）' },
          { type: 'fix', text: 'エントリーページのモバイル対応 — スクロールで入力欄を隠し種目名をスティッキーに' },
        ],
      },
      {
        time: '18:30',
        summary: 'ふりがな一括読込・GDriveローディング',
        changes: [
          { type: 'feat', text: 'ふりがな・所属の一括読込ボタン追加' },
          { type: 'feat', text: 'Google Drive操作時のローディングポップアップ追加' },
        ],
      },
      {
        time: '16:05',
        summary: 'ページヘッダー改善・GDrive接続修正',
        changes: [
          { type: 'feat', text: '各ページのヘッダーをスクロール時にスティッキー固定' },
          { type: 'fix', text: 'DataSync onConnectionChange props追加・LiveDashboard更新' },
          { type: 'fix', text: 'スコア入力ダイアログを画面中央に表示＋背景ぼかしを控えめに' },
        ],
      },
      {
        time: '15:22',
        summary: 'ヘッダーデザイン刷新・GDrive修正',
        changes: [
          { type: 'feat', text: 'ふりがな・所属データ読込後に自動重複削除を実行' },
          { type: 'fix', text: 'Google Driveトークンのスコープ検証を追加・エラー詳細化' },
          { type: 'design', text: 'ヘッダーのゴールド波型ラインを動的アニメーションにリデザイン' },
          { type: 'design', text: '金の粒子を極細かくして空中に漂うイメージに変更' },
          { type: 'fix', text: 'OAuthスコープ変更時に古いトークンを自動無効化' },
        ],
      },
      {
        time: '14:19',
        summary: 'GDriveフォルダ修正・PWAキャッシュ改善',
        changes: [
          { type: 'fix', text: 'Google Driveフォルダ重複作成を修正・読取時にフォルダ作成しない' },
          { type: 'fix', text: 'データページの大会データ読込セクションを最上部に移動' },
          { type: 'fix', text: 'PWAキャッシュ更新問題を修正・バージョン表示にビルド日時を追加' },
        ],
      },
      {
        time: '13:28',
        summary: 'ヘッダー金砂エフェクト・時間割Drive読込',
        changes: [
          { type: 'feat', text: 'ヘッダー金砂エフェクト追加' },
          { type: 'fix', text: 'トーナメント線接続修正・モバイルメニュー改善' },
          { type: 'feat', text: '時間割Driveインポート対応' },
        ],
      },
      {
        time: '09:13',
        summary: 'GDrive連携・データ管理レイアウト',
        changes: [
          { type: 'feat', text: 'Google ドライブ連携でふりがな・所属データの読込/書込機能' },
          { type: 'fix', text: 'データ管理ページのレイアウト整理・Google ドライブ連携を最上部に配置' },
        ],
      },
      {
        time: '07:14',
        summary: 'スコア入力・ダッシュボード・ふりがな',
        changes: [
          { type: 'feat', text: 'スコア入力ダイアログ追加・ブラケット改善・ふりがな管理改善' },
          { type: 'feat', text: 'ライブダッシュボード大幅改善' },
          { type: 'fix', text: 'ふりがなインポートの列名「氏名」対応・シードデータの確実な初期投入' },
          { type: 'feat', text: '時間割の進行状況表示・データページ改善・ふりがな初期データ' },
          { type: 'fix', text: 'タイムテーブル自動配置を対戦順（左山上→下、右山上→下）に統一' },
          { type: 'fix', text: 'エントリーページのリーグ戦枠をトーナメント表と同じ幅・高さに統一' },
        ],
      },
    ],
  },
  {
    version: 'Ver 1.0',
    date: '2026-03-19',
    highlights: '初回リリース',
    timeGroups: [
      {
        time: '23:09',
        summary: 'スコアボード強化',
        changes: [
          { type: 'feat', text: 'スコアボード大幅強化 — ブラケット/リーグ表示・アクションパネル・前種目表示' },
        ],
      },
      {
        time: '22:27',
        summary: 'GDriveブランドUI・ふりがな同期',
        changes: [
          { type: 'design', text: 'Google DriveブランドUI化・フォルダ開くボタン' },
          { type: 'feat', text: 'ふりがなGDrive同期機能' },
        ],
      },
      {
        time: '21:39',
        summary: 'データ同期・放送コール・エントリー',
        changes: [
          { type: 'feat', text: 'データ同期GitHub化・放送コールDB参照・時間割Excel対応・Google Drive連携' },
          { type: 'feat', text: 'エントリーページ大幅改善 — 全ラウンド表示・確定機能・左右山表示' },
        ],
      },
      {
        time: '19:22',
        summary: '時間割Excel・ブラケット修正',
        changes: [
          { type: 'fix', text: 'エントリーブラケットのBYE空白詰め・斜め線修正・番号修正' },
          { type: 'feat', text: '時間割の種目略称をM/W形式に変更、Excelインポート/エクスポート追加' },
        ],
      },
      {
        time: '18:23',
        summary: 'バックアップ・初期構築',
        changes: [
          { type: 'feat', text: 'GitHubバックアップをワンクリックエクスポート/インポートに改善' },
          { type: 'fix', text: 'データページのレイアウト崩れを修正' },
          { type: 'feat', text: 'エントリー管理・抽選・ドロー表生成' },
        ],
      },
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
  // 展開中のバージョン (null = 全閉)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  // 展開中の時間グループ (key: "Ver 1.2-13:06")
  const [expandedTimes, setExpandedTimes] = useState<Set<string>>(new Set());

  if (!open) return null;

  const toggleVersion = (version: string) => {
    setExpandedVersion(prev => prev === version ? null : version);
  };

  const toggleTime = (key: string) => {
    setExpandedTimes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** バージョン内の変更件数 */
  const countChanges = (entry: ChangelogEntry) =>
    entry.timeGroups.reduce((sum, g) => sum + g.changes.length, 0);

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
                  <h2 className="text-2xl font-bold text-white">Ver 1.6</h2>
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">更新履歴</h3>

          {CHANGELOG.map((entry) => {
            const isExpanded = expandedVersion === entry.version;
            const total = countChanges(entry);

            return (
              <div key={entry.version} className="rounded-xl border border-gray-100 overflow-hidden">
                {/* バージョンヘッダー — タップで展開 */}
                <button
                  onClick={() => toggleVersion(entry.version)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isExpanded ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary-700">{entry.version}</span>
                      <span className="text-[11px] text-gray-400">{entry.date}</span>
                      {entry === CHANGELOG[0] && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-primary-500 rounded-full uppercase tracking-wider">New</span>
                      )}
                    </div>
                    {entry.highlights && (
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{entry.highlights}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-400 tabular-nums">{total}件</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* 時間帯グループ一覧 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {entry.timeGroups.map((group, gi) => {
                      const timeKey = `${entry.version}-${group.time}`;
                      const isTimeExpanded = expandedTimes.has(timeKey);

                      return (
                        <div key={gi} className={gi > 0 ? 'border-t border-gray-100' : ''}>
                          {/* 時間帯ヘッダー — タップで詳細展開 */}
                          <button
                            onClick={() => toggleTime(timeKey)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                              isTimeExpanded ? 'bg-white' : 'hover:bg-white/80'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-[11px] font-mono text-gray-500 shrink-0 tabular-nums">{group.time}</span>
                            <span className={`text-xs flex-1 min-w-0 truncate ${isTimeExpanded ? 'text-primary-700 font-medium' : 'text-gray-600'}`}>
                              {group.summary}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-gray-400">{group.changes.length}件</span>
                              <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isTimeExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </button>

                          {/* 変更詳細 */}
                          {isTimeExpanded && (
                            <div className="px-4 pb-3 pt-1 space-y-1.5 bg-white animate-[fadeIn_0.15s_ease-out]">
                              {group.changes.map((change, ci) => {
                                const cfg = TYPE_CONFIG[change.type];
                                const Icon = cfg.icon;
                                return (
                                  <div key={ci} className="flex items-start gap-2 pl-6">
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                      <Icon className="w-2.5 h-2.5" />
                                      {cfg.label}
                                    </span>
                                    <span className="text-xs text-gray-700 leading-relaxed">{change.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
