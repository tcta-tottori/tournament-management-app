import { useState } from 'react';
import {
  HelpCircle, Database, Users, Dices, Trophy, ClipboardList,
  CalendarClock, MonitorPlay, BarChart2, Save, ChevronDown, ChevronRight,
  ArrowRight, Lightbulb, AlertTriangle, MessageCircleQuestion,
  CheckCircle2, BookOpen, Volume2, FileSpreadsheet, Image,
  MousePointerClick, Printer, Search, Upload, Download,
  RefreshCw, Shield, Zap, Clock, GitBranch, LayoutGrid,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

type StepItem = { step: number; title: string; description: string };
type TipItem = string;
type FeatureItem = string;

interface FeatureSection {
  id: string;
  icon: React.ElementType;
  iconBg: string;    // static Tailwind class for icon background
  iconFg: string;    // static Tailwind class for icon foreground
  title: string;
  description: string;
  keyFeatures: FeatureItem[];
  operationSteps: StepItem[];
  tips: TipItem[];
}

interface FAQItem { question: string; answer: string }
interface TroubleItem { problem: string; cause: string; solution: string }

interface WorkflowStep {
  step: number;
  icon: React.ElementType;
  label: string;
  title: string;
  description: string;
  timing: string;
}

// ─── Workflow Data ──────────────────────────────────────────────────

const WORKFLOW_STEPS: WorkflowStep[] = [
  { step: 1, icon: Database, label: 'データ', title: 'データ準備', description: 'ドロー会議システムからデータ読込、ふりがな・所属情報を整備', timing: '大会1週間前〜前日' },
  { step: 2, icon: Users, label: 'エントリー', title: 'エントリー確認', description: '各種目のドロー順確認、当日の欠場者を棄権処理', timing: '大会当日（受付時）' },
  { step: 3, icon: Dices, label: '抽選', title: '抽選・ドロー生成', description: 'JTAルール準拠の自動抽選、シード配置・BYE分散・同所属分離', timing: '大会前日〜当日' },
  { step: 4, icon: Trophy, label: 'ドロー表', title: 'ドロー表確認・調整', description: 'ブラケット/リーグ表示で確認、手動入れ替え・Excel/JPEG出力', timing: '試合開始前' },
  { step: 5, icon: ClipboardList, label: '対戦順', title: '対戦順の生成', description: '試合一覧を自動生成、音声コールで選手呼出', timing: '大会当日' },
  { step: 6, icon: CalendarClock, label: '時間割', title: '時間割の自動生成', description: 'コート×時間帯のマトリックスに全試合を自動配置', timing: '試合開始前' },
  { step: 7, icon: MonitorPlay, label: 'スコア', title: 'スコア入力・試合進行', description: 'ブラケット/リーグ上で試合選択→スコア入力→勝者自動進出', timing: '試合中' },
  { step: 8, icon: BarChart2, label: 'LIVE', title: 'ライブダッシュボード', description: '大会全体の進行状況、コートマップ、遅延状況をリアルタイム監視', timing: '終日' },
  { step: 9, icon: Save, label: 'バックアップ', title: 'バックアップ・結果保存', description: 'Google ドライブ・GitHub・ローカルにデータを保全', timing: '大会前後' },
];

// ─── Feature Sections Data ──────────────────────────────────────────

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: 'data', icon: Database, iconBg: 'bg-primary-100', iconFg: 'text-primary-600', title: 'データ管理',
    description: 'ドロー会議システムとのデータ連携、選手マスタの管理、ふりがな・所属情報の整備を行うページです。',
    keyFeatures: [
      'ドロー会議システムのバックアップデータ（JSON）を一括読込',
      'GitHub / Google ドライブからふりがなデータベースを自動同期',
      'Excelファイルからのふりがな一括インポート',
      '選手の所属・ふりがなの一覧表示・編集・エクスポート',
    ],
    operationSteps: [
      { step: 1, title: 'ふりがなデータの同期', description: '「ふりがなデータ同期」パネルで、Google ドライブ・GitHub・Excelのいずれかから最新のふりがなデータを取得します。' },
      { step: 2, title: 'ドロー会議データの読込', description: '「データ読込」パネルで、バックアップJSONファイルまたはGoogle ドライブから読み込みます。大会情報・種目・エントリー・選手が一括インポートされます。' },
      { step: 3, title: '所属・ふりがなの確認', description: '「所属・ふりがな一覧」パネルで所属タブ・ふりがなタブを切り替え、データを確認・編集します。Excel出力/入力も可能です。' },
    ],
    tips: [
      'ふりがな同期の前に、バックアップページでGitHubトークンまたはGoogle ドライブ接続を設定してください',
      'データ読込前にバックアップを取ることを推奨します',
      '所属・ふりがな一覧のExcelインポートで一括修正が効率的です',
    ],
  },
  {
    id: 'entry', icon: Users, iconBg: 'bg-blue-100', iconFg: 'text-blue-600', title: 'エントリー登録',
    description: 'ドロー順に沿った選手のチェックイン管理と、当日の棄権処理を行うページです。',
    keyFeatures: [
      '全種目のエントリーをドロー順で一覧表示',
      '選手の出欠確認（チェックイン）機能',
      '棄権(withdrawn)への切り替えとBYE自動再配置',
      '種目ごとの折りたたみ表示と検索フィルター',
      'ドロー確定済み種目のロック表示（誤操作防止）',
    ],
    operationSteps: [
      { step: 1, title: '種目の選択', description: '画面上部で種目を選択するか、全種目表示モードで一括確認します。' },
      { step: 2, title: '出欠確認', description: '各選手の行をクリックして出欠を確認します。チェックマークが付きます。' },
      { step: 3, title: '棄権処理', description: '欠場者の「棄権」ボタンを押すとwithdrawn状態に変更され、BYEが自動再配置されます。' },
      { step: 4, title: '確認完了', description: '全員のチェックインが完了したら「抽選」ステップに進みます。' },
    ],
    tips: [
      'ドロー確定後に棄権が発生しても、BYE位置が自動再計算されます',
      '試合生成済み種目はロックアイコンが表示されます',
      '検索バーで素早く選手を検索できます',
    ],
  },
  {
    id: 'draw-lot', icon: Dices, iconBg: 'bg-violet-100', iconFg: 'text-violet-600', title: '抽選・ドロー作成',
    description: 'JTA（日本テニス協会）ルールに準拠した自動ドロー生成を行います。',
    keyFeatures: [
      'ドローサイズの自動決定（4/8/16/32/64/128）',
      'ランキングポイント順のシード自動配置',
      'BYEのシード対抗位置への均等分散',
      '同所属選手の1回戦対戦回避（スワップアルゴリズム）',
      '何度でも再抽選が可能',
    ],
    operationSteps: [
      { step: 1, title: '種目の選択', description: '上部のドロップダウンから対象種目を選択します。' },
      { step: 2, title: '抽選の実行', description: '「抽選を実行する」ボタンで自動ドロー生成。結果がプレビュー表示されます。' },
      { step: 3, title: '結果の確認', description: 'ドロー位置・シード番号・選手名・所属・ポイントを確認。同所属の1回戦対戦がないかチェック。' },
      { step: 4, title: '確定して保存', description: '問題なければ「確定して保存」で保存。保存後もドロー表画面で手動調整可能です。' },
    ],
    tips: [
      'エントリー数に応じて最適なドローサイズが自動選択されます',
      '保存済みドローがある場合は「再抽選を実行」で何度でもやり直せます',
      'シード数もエントリー数に応じて自動決定されます（例: 16ドロー → 最大4シード）',
    ],
  },
  {
    id: 'draw-table', icon: Trophy, iconBg: 'bg-amber-100', iconFg: 'text-amber-600', title: 'ドロー表プレビュー・調整',
    description: 'トーナメントブラケットまたはリーグ（総当たり）形式で表示し、手動調整やExcel/JPEG出力を行います。',
    keyFeatures: [
      'トーナメント表示とリーグ（総当たり表）表示の切替',
      'ドラッグ＆ドロップ / タップ選択による1回戦枠の位置入れ替え',
      'ドローのExcel出力（ブラケット形式）',
      '試合結果のJPEG画像出力',
      '試合結果のExcel出力',
      'ドロータイプの自動検出（少人数 → リーグ自動選択）',
    ],
    operationSteps: [
      { step: 1, title: '種目の選択', description: '上部のドロップダウンで対象種目を選択します。' },
      { step: 2, title: '表示モードの切替', description: '「トーナメント」/「リーグ」ボタンで切り替えます。少人数種目は自動リーグ表示。' },
      { step: 3, title: '位置の入れ替え', description: 'PC: ドラッグ＆ドロップ。スマホ: 1枠目タップ → 入れ替え先タップ。' },
      { step: 4, title: '変更の保存', description: '入れ替えたら「変更を保存」で保存。未保存の変更は警告表示されます。' },
      { step: 5, title: '出力', description: '「Excel出力」でドロー表、「結果JPEG」で画像、「結果Excel」で結果入りExcelをダウンロード。' },
    ],
    tips: [
      '入れ替え可能なのは1回戦の枠のみです',
      '結果JPEG/結果Excelは大会終了後の結果発表に活用してください',
      '参加者2〜5名かつドローサイズ8以下は自動でリーグ表示になります',
    ],
  },
  {
    id: 'referee', icon: ClipboardList, iconBg: 'bg-emerald-100', iconFg: 'text-emerald-600', title: '対戦順・音声コール',
    description: 'ドローから試合一覧を自動生成し、音声コール機能で選手呼び出しを行います。',
    keyFeatures: [
      '1回戦の全対戦カードと2回戦以降の空枠を自動生成',
      'BYE対戦（不戦勝）の自動walkover処理',
      '全種目の試合を一画面で一覧表示',
      'Web Speech APIを使った音声コール機能',
      'ふりがなデータを活用した正確な読み上げ',
      '音声設定（速度・ピッチ・音量・繰り返し回数）のカスタマイズ',
      '種目ごとの個別印刷',
    ],
    operationSteps: [
      { step: 1, title: '試合の確認', description: 'ドロー画面で試合を生成すると、全種目の対戦順が自動表示されます。' },
      { step: 2, title: '音声コール', description: 'コールボタンでコート番号を入力→選手名・所属・コート番号を音声読み上げ。' },
      { step: 3, title: '音声設定の調整', description: '速度・ピッチ・音量・繰り返し回数を調整できます。' },
      { step: 4, title: '印刷', description: '各種目の印刷ボタンで対戦順シートを印刷します。' },
    ],
    tips: [
      '音声コールはChrome（PC）+ 外部スピーカーで最も安定します',
      'ふりがな登録済みの選手は正確な読みでコールされます',
      '所属のふりがなも設定可能（データ管理ページの所属ふりがな辞書）',
    ],
  },
  {
    id: 'schedule-sheet', icon: CalendarClock, iconBg: 'bg-cyan-100', iconFg: 'text-cyan-600', title: '時間割（自動スケジューリング）',
    description: 'コート数・試合時間・開始時刻を設定し、全種目の試合をコート×時間帯のマトリックスに自動配置します。',
    keyFeatures: [
      'コートごとのON/OFF切替',
      '試合所要時間（分）と開始時刻の設定',
      '全種目の自動スケジューリング（同一選手の連続回避考慮）',
      'コート×時間帯のマトリックスビュー',
      '種目ごとの色分け表示（8色自動割当）',
      'セルの手動入れ替え',
      'Excel入出力・印刷対応',
    ],
    operationSteps: [
      { step: 1, title: 'コートの選択', description: '使用するコートにチェックを入れます。' },
      { step: 2, title: 'パラメータ設定', description: '試合所要時間（デフォルト30分）と開始時刻を設定。' },
      { step: 3, title: '自動生成', description: '「自動生成」ボタンで全試合を自動配置します。' },
      { step: 4, title: '手動調整', description: 'セルをクリック→移動先クリックで入れ替え可能です。' },
      { step: 5, title: '出力', description: '「Excel出力」でダウンロード、「印刷」で紙に出力。' },
    ],
    tips: [
      '同一選手が複数種目にエントリーしている場合の連続対戦を可能な限り回避します',
      '時間割はDBに保存されません — 必ず「Excel出力」で保存してください',
      'Excelインポートで手動作成の時間割を読み込むことも可能です',
    ],
  },
  {
    id: 'score', icon: MonitorPlay, iconBg: 'bg-rose-100', iconFg: 'text-rose-600', title: 'スコアボード（試合進行管理）',
    description: '試合のステータス管理・スコア入力・勝者記録を行う当日運営の中核画面です。',
    keyFeatures: [
      'ブラケットビュー: トーナメント表上で試合を直接選択',
      'リーグビュー: 総当たり表上で試合を選択',
      'テーブルビュー: 進行中/待機中/終了済みの試合一覧',
      '試合ステータス遷移: 待機 → 準備完了 → 試合中 → 終了',
      '勝者の次ラウンド自動進出',
      'コートステータスバー',
      '種目の前後ナビゲーション',
    ],
    operationSteps: [
      { step: 1, title: '種目の選択', description: 'ドロップダウンまたは左右矢印で種目を選択します。' },
      { step: 2, title: '表示モードの選択', description: '「ブラケット」/「テーブル」を切り替え。ブラケットで全体俯瞰が可能。' },
      { step: 3, title: '試合の選択', description: 'ブラケット上の対戦カードをクリック、またはテーブルの操作ボタンを使用。' },
      { step: 4, title: 'ステータス変更', description: '「準備完了」→「試合開始」→ スコア入力 →「勝者選択」の順に操作。' },
      { step: 5, title: 'スコア記録', description: 'セットスコア（例: 8-2）を入力し、勝者ボタンで試合完了。次ラウンドに自動進出。' },
    ],
    tips: [
      'ブラケットビューは大画面（PC/タブレット）での使用を推奨',
      'リセットボタンで試合を待機状態に戻せます（次ラウンド進出も取消）',
      'コートステータスバーで空きコートを素早く確認できます',
      'テーブルビューで待機中の試合にコートを直接割当可能',
    ],
  },
  {
    id: 'dashboard', icon: BarChart2, iconBg: 'bg-indigo-100', iconFg: 'text-indigo-600', title: 'ライブダッシュボード',
    description: '大会全体の進行状況をリアルタイムで監視するダッシュボードです。',
    keyFeatures: [
      'ドーナツチャートによる全体進捗率の表示',
      'サマリーカード: 全試合数・試合中・終了・待機中',
      'スケジュール遅延インジケーター',
      'テニスコートSVGによるビジュアルコートマップ',
      'コートクリックで試合詳細を展開',
      '種目別進行状況（プログレスバー+現在ラウンド名）',
      'リアルタイム自動更新（30秒間隔）',
    ],
    operationSteps: [
      { step: 1, title: 'ダッシュボードの確認', description: 'LIVEタブを開くだけで全データが自動表示されます。操作不要でリアルタイム更新。' },
      { step: 2, title: 'コートマップの活用', description: 'コートブロックをクリックで、割り当て済み試合一覧を表示。' },
      { step: 3, title: 'スケジュール確認', description: '遅延インジケーターで予定通りか遅延しているかを確認します。' },
    ],
    tips: [
      'モニター画面に常時表示しておくのに適しています',
      'スケジュール遅延は時間割で開始時刻を設定した試合のみ計算対象',
      'リロード不要 — IndexedDBのリアクティブクエリで自動更新されます',
    ],
  },
  {
    id: 'backup', icon: Save, iconBg: 'bg-teal-100', iconFg: 'text-teal-600', title: 'バックアップ・復元',
    description: 'Google ドライブ・GitHub・ローカルファイルでのバックアップ管理と全データ削除を行います。',
    keyFeatures: [
      'Google ドライブ連携: OAuth認証でクラウド保存',
      'GitHub連携: Personal Access Tokenでリポジトリ保存',
      'ローカルJSON: オフラインでもエクスポート/インポート可能',
      'Excelエクスポート/インポート',
      '全データ削除（二重確認あり）',
      'バックアップ一覧表示（日時・サイズ付き）',
    ],
    operationSteps: [
      { step: 1, title: 'バックアップ先の選択', description: 'タブで「Google ドライブ」「GitHub」「ローカル JSON」「Excel」「データ管理」を切替。' },
      { step: 2, title: 'Google ドライブの場合', description: '初回はクライアントIDを入力してOAuth認証。接続後「バックアップ保存」で保存。' },
      { step: 3, title: 'GitHubの場合', description: 'Personal Access Tokenを入力して接続。backupsディレクトリにJSON保存。' },
      { step: 4, title: '復元', description: 'バックアップ一覧から「復元」を選択。現在のデータは全て上書きされます。' },
      { step: 5, title: 'ローカル保存', description: '「エクスポート」でJSONダウンロード。「インポート」でアップロード復元。' },
    ],
    tips: [
      '大会前日と当日の朝に必ずバックアップを取ってください',
      '重要な操作の前にもバックアップを推奨',
      '復元時は現在のデータもバックアップしてから実行してください',
      'Google ドライブが最も推奨のバックアップ先です',
    ],
  },
];

// ─── FAQ Data ───────────────────────────────────────────────────────

const FAQ_ITEMS: FAQItem[] = [
  { question: 'ドロー会議システムとの連携方法は？', answer: '「データ管理」ページの「データ読込」パネルで、バックアップJSONファイルをインポートするか、Google ドライブから直接読み込みます。ふりがなは「ふりがなデータ同期」パネルで同期できます。' },
  { question: '当日に選手が棄権した場合は？', answer: '「エントリー」ページで該当選手の「棄権」ボタンを押してください。BYEの位置が自動的に再計算されます。' },
  { question: '抽選をやり直したい場合は？', answer: '「抽選」ページで「再抽選を実行」をクリックするだけです。何度でもやり直せます。' },
  { question: 'ドロー表の位置を手動で変更できますか？', answer: 'はい。PCはドラッグ＆ドロップ、スマホは2回タップで位置入れ替え可能です。1回戦の枠のみ対象です。' },
  { question: 'リーグ戦（総当たり）は対応していますか？', answer: 'はい。参加者2〜5名かつドローサイズ8以下は自動リーグ表示になります。手動切替も可能です。' },
  { question: '音声コールが動作しません', answer: 'Chrome（PC版）での使用を推奨します。ブラウザの音声合成設定が有効か確認し、外部スピーカーに接続してください。' },
  { question: '時間割が保存されません', answer: '時間割データはメモリ上のみ保持されます。画面を離れるとリセットされるため、必ず「Excel出力」で保存してください。' },
  { question: 'データが消えてしまった場合は？', answer: 'バックアップを取っていれば「バックアップ」ページから復元できます。Google ドライブ・GitHub・ローカルJSONのいずれかから復元してください。' },
  { question: 'スコアを間違えて入力した場合は？', answer: 'テーブルビューの「リセット」ボタンで試合を待機状態に戻せます。次ラウンドへの進出も取り消されます。' },
  { question: '複数の大会を同時に管理できますか？', answer: 'ブラウザ内データベースで一度に1つの大会を管理します。切り替える場合はバックアップ→新しいデータインポートの手順で行います。' },
];

// ─── Troubleshooting Data ───────────────────────────────────────────

const TROUBLE_ITEMS: TroubleItem[] = [
  { problem: 'ドロー会議のデータ読込でエラーが発生', cause: 'バックアップファイルの形式が異なる、またはファイルが破損', solution: 'ドロー会議システムで最新のバックアップを再取得し、正しいJSONファイルを選択してください。' },
  { problem: 'ふりがな同期で「トークンが設定されていません」と表示', cause: 'バックアップページでGitHubトークンまたはGoogle ドライブ接続が未設定', solution: '先に「バックアップ」ページで接続を設定してください。' },
  { problem: '抽選で「有効エントリー数: 0組」と表示', cause: '種目にエントリーが未登録、または全員withdrawn', solution: '「エントリー」ページで該当種目を確認してください。' },
  { problem: 'ドロー表で「表示できるドローが存在しません」', cause: '対象種目の抽選が未実行', solution: '「抽選」ページで対象種目の抽選を実行・保存してください。' },
  { problem: 'スコア入力後、勝者が次ラウンドに反映されない', cause: '次ラウンドの試合データが未生成の可能性', solution: '対戦順ページで全ラウンド分の試合枠が作成されているか確認してください。' },
  { problem: '音声コールで選手名が正しく読まれない', cause: 'ふりがなデータが未登録', solution: '「データ管理」ページでふりがなデータを同期するか、手動修正してください。' },
  { problem: 'Google ドライブのバックアップ一覧が表示されない', cause: 'OAuthトークンの有効期限切れ', solution: 'バックアップページの「再接続」ボタンでOAuth認証をやり直してください。' },
  { problem: 'ブラウザを閉じたらデータが消えた', cause: 'キャッシュクリアまたはシークレットモードでIndexedDBが消去', solution: '通常モードで使用し、定期的にバックアップを取ってください。' },
];

// ─── Sub Components ─────────────────────────────────────────────────

function WorkflowOverview() {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ArrowRight className="w-5 h-5" />
          大会運営の流れ
        </h2>
        <p className="text-sm text-white/80 mt-0.5">大会の準備から当日運営、結果出力までの全体フロー</p>
      </div>
      <div className="p-5">
        <div className="relative">
          {WORKFLOW_STEPS.map((ws, idx) => {
            const Icon = ws.icon;
            return (
              <div key={ws.step} className="flex gap-4 relative">
                {/* Timeline line */}
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <div className="absolute left-[19px] top-10 w-0.5 h-[calc(100%-16px)] bg-gradient-to-b from-primary-300 to-primary-100" />
                )}
                {/* Step circle */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center text-sm font-bold shadow-md z-10">
                  {ws.step}
                </div>
                {/* Content */}
                <div className={`flex-1 pb-6 ${idx === WORKFLOW_STEPS.length - 1 ? 'pb-0' : ''}`}>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary-500" />
                      <span className="font-bold text-gray-900 text-sm">{ws.title}</span>
                      <span className="text-[10px] bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full font-medium ml-auto whitespace-nowrap">{ws.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{ws.description}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400 font-medium">{ws.timing}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureSectionCard({ section, isOpen, onToggle }: { section: FeatureSection; isOpen: boolean; onToggle: () => void }) {
  const Icon = section.icon;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className={`w-9 h-9 rounded-lg ${section.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${section.iconFg}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-gray-900">{section.title}</span>
          {!isOpen && <p className="text-xs text-gray-400 truncate mt-0.5">{section.description}</p>}
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed pl-[52px]">{section.description}</p>

          {/* Key Features */}
          <div className="pl-[52px]">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              主な機能
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {section.keyFeatures.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operation Steps */}
          <div className="pl-[52px]">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              操作手順
            </h4>
            <div className="space-y-2">
              {section.operationSteps.map((s) => (
                <div key={s.step} className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">{s.step}</span>
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{s.title}</span>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="pl-[52px]">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              ポイント・注意点
            </h4>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1.5">
              {section.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickReferencePanel() {
  const items = [
    { icon: MousePointerClick, label: 'ドラッグ＆ドロップ', desc: 'ドロー表の枠入替' },
    { icon: Volume2, label: '音声コール', desc: '対戦順ページのスピーカーボタン' },
    { icon: Printer, label: '印刷', desc: '各ページの印刷ボタン' },
    { icon: Search, label: '検索', desc: 'エントリー・所属の検索バー' },
    { icon: FileSpreadsheet, label: 'Excel入出力', desc: '緑ボタンでインポート/エクスポート' },
    { icon: Image, label: 'JPEG出力', desc: 'ドロー表の結果画像出力' },
    { icon: GitBranch, label: 'トーナメント', desc: 'ブラケット表示モード' },
    { icon: LayoutGrid, label: 'リーグ', desc: '総当たり表示モード' },
    { icon: Upload, label: 'インポート', desc: 'ファイルの読込' },
    { icon: Download, label: 'エクスポート', desc: 'ファイルの出力' },
    { icon: RefreshCw, label: '同期', desc: 'クラウドデータの取得' },
    { icon: Shield, label: 'バックアップ', desc: 'データの保全・復元' },
  ];

  return (
    <section className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-5 py-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="w-4 h-4" />
          クイックリファレンス
        </h2>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
              <Icon className="w-4 h-4 text-primary-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">{item.label}</div>
                <div className="text-[10px] text-gray-400 truncate">{item.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FAQSection({ items, isOpen, onToggle }: { items: FAQItem[]; isOpen: boolean; onToggle: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <MessageCircleQuestion className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <span className="font-bold text-gray-900">よくある質問 (FAQ)</span>
          <span className="text-xs text-gray-400 ml-2">{items.length}件</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pl-[68px] space-y-2">
          {items.map((item, i) => (
            <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-blue-50/50 transition-colors"
              >
                <span className="text-blue-500 font-bold text-sm shrink-0">Q.</span>
                <span className="text-sm font-medium text-gray-800 flex-1">{item.question}</span>
                {openIdx === i ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
              </button>
              {openIdx === i && (
                <div className="px-4 pb-3 flex gap-2">
                  <span className="text-emerald-500 font-bold text-sm shrink-0">A.</span>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TroubleshootingSection({ items, isOpen, onToggle }: { items: TroubleItem[]; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <span className="font-bold text-gray-900">トラブルシューティング</span>
          <span className="text-xs text-gray-400 ml-2">{items.length}件</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pl-[68px] space-y-3">
          {items.map((item, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-gray-800">{item.problem}</span>
              </div>
              <div className="ml-6 space-y-1">
                <div className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-600">原因: </span>{item.cause}
                </div>
                <div className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1.5">
                  <span className="font-semibold">対処法: </span>{item.solution}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function Manual() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [showFaq, setShowFaq] = useState(false);
  const [showTrouble, setShowTrouble] = useState(false);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAll = () => {
    setOpenSections(new Set(FEATURE_SECTIONS.map(s => s.id)));
    setShowFaq(true);
    setShowTrouble(true);
  };
  const closeAll = () => {
    setOpenSections(new Set());
    setShowFaq(false);
    setShowTrouble(false);
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <header className="bg-white p-5 rounded-xl shadow-sm border border-border-main">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-primary-500" />
              操作マニュアル
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              大会運営システムの使い方を確認できます。セクションをクリックして詳細を表示してください。
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={openAll} className="text-xs bg-primary-50 hover:bg-primary-100 text-primary-600 px-3 py-1.5 rounded-md font-medium transition-colors">
              全て開く
            </button>
            <button onClick={closeAll} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md font-medium transition-colors">
              全て閉じる
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-4">
        {/* Workflow */}
        <WorkflowOverview />

        {/* Quick Reference */}
        <QuickReferencePanel />

        {/* Feature Sections */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
            <BookOpen className="w-4 h-4" />
            機能別ガイド
          </h2>
          {FEATURE_SECTIONS.map(section => (
            <FeatureSectionCard
              key={section.id}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

        {/* FAQ */}
        <FAQSection items={FAQ_ITEMS} isOpen={showFaq} onToggle={() => setShowFaq(!showFaq)} />

        {/* Troubleshooting */}
        <TroubleshootingSection items={TROUBLE_ITEMS} isOpen={showTrouble} onToggle={() => setShowTrouble(!showTrouble)} />
      </div>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-primary-500/10 to-primary-500/5 rounded-xl p-4 text-center text-xs text-gray-500 border border-primary-100">
        大会運営システム v1.0 — 鳥取市テニス協会
      </footer>
    </div>
  );
}
