// =============================================================================
// マニュアル
//
// 画面の写し（ManualScreens）を交えて、実際の操作にそって説明する。
// スマホ／PCで操作が変わるところは端末の切り替えで出し分ける。
// =============================================================================

import { useEffect, useState } from 'react';
import {
  HelpCircle, Database, Users, ClipboardList, CalendarClock, Network,
  BarChart2, Radio, Printer, Settings, Image as ImageIcon, Volume2,
  Smartphone, Monitor, ChevronDown, ChevronRight, Lightbulb, AlertTriangle,
  MessageCircleQuestion, CheckCircle2, Wifi, Eye, Shield, Clock,
} from 'lucide-react';
import {
  type Device, ScreenFigure, MenuMockup, DrawHeaderMockup, DrawCardMockup,
  SettingsMockup, ResultPreviewMockup, MatchCardMockup,
} from './ManualScreens';

// ─── 端末ごとに言い回しが変わる文 ───────────────────────────────────

type DeviceText = { mobile: string; pc: string };
const t = (v: string | DeviceText, d: Device) => (typeof v === 'string' ? v : v[d]);

// ─── 当日の流れ ─────────────────────────────────────────────────────

interface FlowStep {
  step: number;
  icon: React.ElementType;
  title: string;
  timing: string;
  body: string | DeviceText;
}

const FLOW_STEPS: FlowStep[] = [
  {
    step: 1, icon: Database, title: '大会データを読み込む', timing: '前日〜当日の朝',
    body: {
      mobile: 'メニュー →「データ」。ドロー会議のバックアップ（JSON）か、ミックス・団体戦のExcelを読み込みます。読み込むと画面上部に大会名が流れます。',
      pc: '左メニューの「データ」。ドロー会議のバックアップ（JSON）か、ミックス・団体戦のExcelを読み込みます。読み込むと画面上部に大会名が流れます。',
    },
  },
  {
    step: 2, icon: Wifi, title: '複数の端末で使うなら同期する', timing: '大会開始前',
    body: '「設定」→「同期」でルームを作り、他の端末は同じコードで参加します。以後スコアや進行が全端末にそのまま反映されます。1台だけで運営するなら設定は不要です。',
  },
  {
    step: 3, icon: Users, title: 'エントリーと欠場を確認する', timing: '受付〜開始前',
    body: '「エントリー」で当日の欠場を反映します。棄権・不戦勝はここで処理すると、ドローにもそのまま反映されます。',
  },
  {
    step: 4, icon: ClipboardList, title: '対戦順を確認して呼び出す', timing: '試合中',
    body: {
      mobile: '「対戦順」に次の試合が並びます。行をタップするとコート投入や音声コールができます。',
      pc: '「対戦順」に次の試合が並びます。行を選ぶとコート投入や音声コールができます。まとめてコールする一斉呼び出しもここからです。',
    },
  },
  {
    step: 5, icon: Network, title: 'ドローでスコアを入れる', timing: '試合中',
    body: {
      mobile: '「ドロー」でクラスを選び、試合の枠をタップしてスコアを入力します。勝者は自動で次の回戦に進みます。',
      pc: '「ドロー」でクラスを選び、試合の枠をクリックしてスコアを入力します。勝者は自動で次の回戦に進みます。',
    },
  },
  {
    step: 6, icon: ImageIcon, title: '結果画像を出す', timing: 'クラス終了ごと',
    body: 'クラスの全試合が終わると、ドロー画面の上部に画像アイコンが出ます。押すとその場でプレビューでき、JPEGで保存できます。',
  },
  {
    step: 7, icon: Shield, title: 'バックアップを取る', timing: '大会前後',
    body: '「設定」→「バックアップ」から、端末にJSONで保存するか Google ドライブへ保存します。大会前日と当日の朝、終了後の3回を目安に。',
  },
];

// ─── 機能ごとの使い方 ───────────────────────────────────────────────

interface FeatureSection {
  id: string;
  icon: React.ElementType;
  title: string;
  summary: string;
  steps: (string | DeviceText)[];
  tips?: string[];
}

const FEATURES: FeatureSection[] = [
  {
    id: 'data', icon: Database, title: 'データ',
    summary: '大会データの読み込み・ふりがな・所属の整備',
    steps: [
      'ドロー会議システムのバックアップ（JSON）を読み込むと、大会・種目・エントリー・ドローがまとめて入ります。',
      'ミックスダブルス・団体戦は専用のExcelを読み込みます。読み込むと予選リーグと決勝トーナメントが自動で組まれます。',
      'ふりがな・所属ふりがなは音声コールの読み上げに使います。誤読があればこの画面で直せます。',
      'テストデータの投入や全データの削除もこの画面から行えます（削除は二重確認あり）。',
    ],
    tips: ['読み込みの前にバックアップを取っておくと、元に戻せます。'],
  },
  {
    id: 'entry', icon: Users, title: 'エントリー',
    summary: '出場者の確認・欠場（棄権／不戦勝）の処理',
    steps: [
      '種目ごとに出場者とドロー番号を確認します。',
      '当日欠場は棄権にします。相手はそのまま次の回戦へ進みます。',
      '氏名の誤りは、ドロー画面の修正メニュー →「名前の修正」からも直せます。直すと対戦表・結果画像にも反映されます。',
    ],
  },
  {
    id: 'referee', icon: ClipboardList, title: '対戦順',
    summary: '次に行う試合の一覧・コート投入・音声コール',
    steps: [
      '空きコートに入れられる試合が上に並びます。',
      {
        mobile: '試合をタップ →「コートに入れる」でコートを選びます。呼び出しは同じ画面の音声ボタンから。',
        pc: '試合を選び「コートに入れる」でコートを選びます。呼び出しは同じ画面の音声ボタンから。複数試合をまとめて呼ぶ一斉コールも使えます。',
      },
      '読み上げの声や速さは「設定」→「音声」で変えられます。',
    ],
    tips: ['読み間違いがあるときは「データ」でふりがなを直してください。'],
  },
  {
    id: 'schedule', icon: CalendarClock, title: 'タイムテーブル',
    summary: 'コート×時間帯に試合を並べた予定表',
    steps: [
      '開始時刻と1試合の想定時間を決めると、全試合が自動で並びます。',
      '並べ替えたあとはExcelに出して印刷・掲示できます。',
    ],
    tips: ['タイムテーブルは目安です。実際の進行は「対戦順」と「ドロー」で管理します。'],
  },
  {
    id: 'draw', icon: Network, title: 'ドロー（試合の進行）',
    summary: 'トーナメント表の確認・スコア入力・あたりの修正',
    steps: [
      '上部でクラスを切り替えます。左右の矢印か、クラス名を押して一覧から選べます。',
      '「ALL 1R〜」の左右で表示する回戦を絞れます。決着した回戦は自動で省かれ、押すと戻せます。',
      {
        mobile: '対戦中の枠をタップするとスコア入力が開きます。勝者は自動で次の回戦へ進みます。',
        pc: '対戦中の枠をクリックするとスコア入力が開きます。勝者は自動で次の回戦へ進みます。',
      },
      '右上の設定アイコンから「あたりの修正」「名前の修正」「ゲームルールの変更」ができます。',
      'リーグ戦のクラスは星取表で表示され、セルから直接スコアを入れられます。',
    ],
    tips: [
      '勝ち上がりの線は赤、スコアは勝った側が赤・負けた側がグレーです。',
      'ダブルスはペアを1人ずつ2行に分け、所属もその行の右に出ます。',
    ],
  },
  {
    id: 'live', icon: BarChart2, title: 'ダッシュボード / ライブ配信',
    summary: '進行状況の把握と、1ポイントごとの配信',
    steps: [
      'ダッシュボードでは進捗・コートの使用状況・時間超過の警告をまとめて見られます。',
      'ライブ配信はコートサイドの端末で開き、選手名を押すだけでポイントが進みます。観戦用ページにそのまま流れます。',
    ],
  },
  {
    id: 'print', icon: Printer, title: '印刷',
    summary: '賞状・審判用紙などの印刷',
    steps: [
      '賞状は優勝・準優勝などの候補から選ぶか、手入力でも作れます。',
      '大会データが無くても印刷だけは使えます。',
    ],
  },
  {
    id: 'settings', icon: Settings, title: '設定',
    summary: '同期・観戦用ページ・音声・バックアップ',
    steps: [
      '同期：ルームを作る／参加する。同じルームの端末どうしでデータが揃います。',
      '観戦用ページ：参加者・協会HP向けの読み取り専用ページ。URLをコピーして配れます。',
      '音声：読み上げのエンジン（端末内蔵／Gemini）・声・速さを選べます。',
      'バックアップ：端末にJSONで保存、または Google ドライブへ保存・復元します。',
    ],
    tips: ['復元すると今のデータは上書きされます。先に今のデータを保存してから実行してください。'],
  },
];

// ─── 困ったとき ─────────────────────────────────────────────────────

const TROUBLES: { problem: string; solution: string }[] = [
  { problem: 'メニューに「抽選」「ドロー表」が出てこない', solution: 'ミックスダブルス・団体戦の種目があるときだけ出ます。個人戦は「ドロー」で進行します。' },
  { problem: 'クラスを切り替えても何も表示されない', solution: 'そのクラスのドローがまだありません。「データ」で読み込むか、ミックス・団体戦は「抽選」から作成してください。' },
  { problem: 'スコアを入れても次の回戦に進まない', solution: '勝者が未確定のままになっていないか確認してください。スコア入力画面で勝者を選び直せます。' },
  { problem: '結果画像のアイコンが出ない', solution: 'そのクラスの全試合が終わると出ます。途中の状態では表示されません。' },
  { problem: '音声が鳴らない・読み間違える', solution: '端末の音量とマナーモードを確認してください。読みは「データ」のふりがなで直せます。' },
  { problem: '他の端末に反映されない', solution: '「設定」→「同期」で、両方の端末が同じルームコードに接続されているか確認してください。' },
  { problem: 'データが消えた', solution: 'ブラウザの履歴消去やシークレットモードだとデータが残りません。通常のブラウザで使い、こまめにバックアップを取ってください。' },
];

const FAQS: { q: string; a: string | DeviceText }[] = [
  { q: '当日の欠場はどう処理しますか？', a: '「エントリー」で棄権にします。相手はそのまま次の回戦に進みます。' },
  { q: 'あたり（組み合わせ）を入れ替えたい', a: {
    mobile: 'ドロー画面の設定アイコン →「あたりの修正」。入れ替えたい枠を2つタップすると入れ替わります。保存するまで反映されません。',
    pc: 'ドロー画面の設定アイコン →「あたりの修正」。入れ替えたい枠を2つクリックすると入れ替わります。保存するまで反映されません。',
  } },
  { q: '選手名を間違えて登録した', a: 'ドロー画面の設定アイコン →「名前の修正」で直せます。対戦表・結果画像にも反映されます。' },
  { q: '観戦用ページは誰でも見られますか？', a: 'URLを知っている人が見られます。読み取り専用なので、見た人が結果を変えることはできません。' },
  { q: '結果画像の横幅を変えたい', a: 'プレビュー上部の「表示幅」を動かすと、トーナメント表の横幅が変わります。既定は70%で、変えた設定は次回も引き継がれます。' },
  { q: '大会をもう1つ管理したい', a: '一度に扱えるのは1大会です。先に今の大会をバックアップしてから、新しいデータを読み込んでください。' },
];

// ─── 部品 ───────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-100 text-primary-600 shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

function Accordion({
  icon: Icon, title, summary, open, onToggle, children,
}: {
  icon: React.ElementType; title: string; summary: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-600 shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-gray-900 text-sm">{title}</span>
          <span className="block text-[11px] text-gray-500 truncate">{summary}</span>
        </span>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── 本体 ───────────────────────────────────────────────────────────

export default function Manual() {
  // 端末の切り替え。初期値は今見ている画面の幅で決める。
  const [device, setDevice] = useState<Device>(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 'pc' : 'mobile'
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setDevice(mq.matches ? 'pc' : 'mobile');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [openFeature, setOpenFeature] = useState<string | null>('draw');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isPc = device === 'pc';

  return (
    <div className="min-h-full bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-6">

        {/* 見出し＋端末の切り替え */}
        <header className="relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-lg">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          </div>
          <div className="relative px-4 py-4 md:px-6 md:py-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm shrink-0">
                <HelpCircle className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">マニュアル</h1>
                <p className="text-[11px] md:text-sm text-primary-50 mt-0.5">実際の画面にそって、当日の使い方を説明します</p>
              </div>
            </div>
            {/* 端末の切り替え */}
            <div className="mt-3 inline-flex rounded-full bg-white/15 p-0.5 border border-white/25">
              {([
                { id: 'mobile' as const, label: 'スマホ', icon: Smartphone },
                { id: 'pc' as const, label: 'パソコン', icon: Monitor },
              ]).map(o => (
                <button
                  key={o.id}
                  onClick={() => setDevice(o.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                    device === o.id ? 'bg-white text-primary-700 shadow-sm' : 'text-white/85 hover:text-white'
                  }`}
                >
                  <o.icon className="w-3.5 h-3.5" />
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-primary-50/90 mt-1.5">
              {isPc ? 'パソコンでの操作を表示しています。' : 'スマホでの操作を表示しています。'}
            </p>
          </div>
        </header>

        {/* 1. まずはこれだけ */}
        <section>
          <SectionTitle icon={CheckCircle2} title="まずはこれだけ" sub="この3つができれば大会は回せます" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { n: 1, icon: Database, title: 'データを読み込む', text: t({ mobile: 'メニュー →「データ」', pc: '左メニューの「データ」' }, device) },
              { n: 2, icon: Network, title: 'ドローで進行する', text: t({ mobile: '枠をタップしてスコア入力', pc: '枠をクリックしてスコア入力' }, device) },
              { n: 3, icon: ImageIcon, title: '結果画像を出す', text: 'クラス終了で画像アイコンが出ます' },
            ].map(c => (
              <div key={c.n} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-[11px] font-black">{c.n}</span>
                  <c.icon className="w-4 h-4 text-primary-500" />
                  <span className="font-bold text-gray-900 text-sm">{c.title}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 2. 画面の見かた */}
        <section>
          <SectionTitle
            icon={Eye}
            title="画面の見かた"
            sub={isPc ? 'パソコンの画面で説明します' : 'スマホの画面で説明します'}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ScreenFigure
              title={isPc ? 'メニュー（画面の左に出たままになります）' : 'メニュー（右上の三本線で開きます）'}
              points={[
                { n: 1, text: isPc ? '「‹|」を押すとアイコンだけの細いメニューになります。もう一度押すと戻ります。' : '三本線を押すと画面いっぱいにメニューが開きます。もう一度押すと閉じます。' },
                { n: 2, text: '同期・観戦用ページ・音声・バックアップは「設定」にまとまっています。' },
                { n: 3, text: '協会ロゴを押すと鳥取市テニス協会のホームページが開きます（右下のアイコンが目印）。' },
              ]}
            >
              <MenuMockup device={device} />
            </ScreenFigure>

            <ScreenFigure
              title="ドロー画面の上部"
              points={[
                { n: 1, text: 'クラス名。左右の矢印で切り替え、名前を押すと一覧から選べます。' },
                { n: 2, text: 'そのクラスの進み具合（終わった試合数）。' },
                { n: 3, text: '表示する回戦。「ALL 1R〜」から右で先の回戦だけに絞れます。押すと自動に戻ります。' },
                { n: 4, text: '結果画像。クラスの全試合が終わると出ます。' },
                { n: 5, text: 'あたり・名前・ゲームルールの修正メニュー。' },
              ]}
            >
              <DrawHeaderMockup />
            </ScreenFigure>

            <ScreenFigure
              title="ドロー表の枠の見かた"
              points={[
                { n: 1, text: 'ドロー番号（ペアの真ん中に区切って出ます）。' },
                { n: 2, text: 'ダブルスはペアを1人ずつ2行で表示します。' },
                { n: 3, text: '所属。2人で違うときはそれぞれの行に出ます。' },
                { n: 4, text: 'スコア。勝った側が赤、負けた側がグレーです。' },
                { n: 5, text: '勝ち上がりの線は赤くなり、勝者が次の回戦へ進みます。' },
              ]}
            >
              <DrawCardMockup />
            </ScreenFigure>

            <ScreenFigure
              title={isPc ? '試合中の枠（クリックでスコア入力）' : '試合中の枠（タップでスコア入力）'}
              points={[
                { n: 1, text: '入っているコート番号。試合中は枠が点滅します。' },
                { n: 2, text: t({ mobile: '枠をタップするとスコア入力が開きます。', pc: '枠をクリックするとスコア入力が開きます。' }, device) },
              ]}
            >
              <MatchCardMockup device={device} />
            </ScreenFigure>

            <ScreenFigure
              title={isPc ? '設定ページ（開いた状態で表示されます）' : '設定ページ（畳んだ状態で表示されます）'}
              points={[
                { n: 1, text: isPc ? '見出しを押すと畳めます。' : '見出しを押すと開きます。使う項目だけ開いてください。' },
              ]}
            >
              <SettingsMockup device={device} />
            </ScreenFigure>

            <ScreenFigure
              title="結果画像のプレビュー"
              points={[
                { n: 1, text: '表示幅でトーナメント表の横幅を調整できます（既定は70%。リーグ戦では出ません）。' },
                { n: 2, text: '保存ボタンでJPEGとして端末に保存します。' },
              ]}
            >
              <ResultPreviewMockup device={device} />
            </ScreenFigure>
          </div>
        </section>

        {/* 3. 当日の流れ */}
        <section>
          <SectionTitle icon={Clock} title="大会当日の流れ" sub="上から順に進めれば運営できます" />
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {FLOW_STEPS.map((s, i) => (
              <div key={s.step} className="flex gap-3 relative">
                {i < FLOW_STEPS.length - 1 && (
                  <div className="absolute left-[15px] top-9 w-0.5 h-[calc(100%-20px)] bg-primary-100" />
                )}
                <span className="shrink-0 w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold z-10">
                  {s.step}
                </span>
                <div className={`flex-1 min-w-0 ${i === FLOW_STEPS.length - 1 ? 'pb-0' : 'pb-4'}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <s.icon className="w-4 h-4 text-primary-500 shrink-0" />
                    <span className="font-bold text-gray-900 text-sm">{s.title}</span>
                    <span className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{s.timing}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mt-1">{t(s.body, device)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 機能ごとの使い方 */}
        <section>
          <SectionTitle icon={ClipboardList} title="画面ごとの使い方" sub="見出しを押すと開きます" />
          <div className="space-y-2">
            {FEATURES.map(f => (
              <Accordion
                key={f.id}
                icon={f.icon}
                title={f.title}
                summary={f.summary}
                open={openFeature === f.id}
                onToggle={() => setOpenFeature(openFeature === f.id ? null : f.id)}
              >
                <ol className="space-y-2 mt-2">
                  {f.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-gray-700 leading-relaxed">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span>{t(s, device)}</span>
                    </li>
                  ))}
                </ol>
                {f.tips && f.tips.length > 0 && (
                  <div className="mt-3 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2">
                    {f.tips.map((tip, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-[12px] text-gray-700 leading-relaxed">
                        <Lightbulb className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </p>
                    ))}
                  </div>
                )}
              </Accordion>
            ))}
          </div>
        </section>

        {/* 5. 困ったとき */}
        <section>
          <SectionTitle icon={AlertTriangle} title="困ったとき" sub="よくあるつまずきと直し方" />
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {TROUBLES.map((tr, i) => (
              <div key={i} className="px-4 py-3">
                <p className="flex items-start gap-2 text-[13px] font-bold text-gray-900">
                  <AlertTriangle className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                  {tr.problem}
                </p>
                <p className="text-[12px] text-gray-600 leading-relaxed mt-1 pl-6">{tr.solution}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. よくある質問 */}
        <section>
          <SectionTitle icon={MessageCircleQuestion} title="よくある質問" />
          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex-1 text-[13px] font-bold text-gray-900">{f.q}</span>
                  {openFaq === i
                    ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
                {openFaq === i && (
                  <p className="px-4 pb-3 text-[12px] text-gray-600 leading-relaxed border-t border-gray-100 pt-2">
                    {t(f.a, device)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 音声・配信の補足 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <SectionTitle icon={Volume2} title="音声コールと配信について" />
          <ul className="space-y-1.5 text-[12px] text-gray-600 leading-relaxed">
            <li className="flex gap-2"><Radio className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />ライブ配信はコートサイドの端末で開き、選手名を押すだけでポイントが進みます。</li>
            <li className="flex gap-2"><Volume2 className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />読み上げは端末内蔵の音声が既定です。より自然な声にしたいときは「設定」→「音声」で切り替えます。</li>
            <li className="flex gap-2"><Wifi className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />同期していないと、他の端末や観戦用ページには反映されません。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
