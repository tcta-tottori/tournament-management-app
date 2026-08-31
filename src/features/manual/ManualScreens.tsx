// =============================================================================
// マニュアル用の「画面の写し」
//
// 実際の画面と同じ配色・並びのミニチュアを描いて、どこを押せばよいかを示す。
// 画像ではなく本物と同じ部品で描いているので、画面の意匠を変えても
// このファイルを直せば追従できる。
// =============================================================================

import {
  Network, Menu, Trophy, ChevronLeft, ChevronRight, ChevronDown, Eye,
  Image as ImageIcon, SlidersHorizontal, Database, Users, ClipboardList,
  Settings, Wifi, Volume2, Shield, ExternalLink, ArrowRight, PanelLeftClose,
} from 'lucide-react';

export type Device = 'mobile' | 'pc';

/** メニューの赤いグラデーション（実際のメニューと同じ） */
const MENU_BG = 'linear-gradient(180deg, #c63834 0%, #ad2c29 55%, #8c2220 100%)';

/** 説明と対応させる番号の丸 */
export function Marker({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-primary-600 text-white text-[10px] font-black shadow ring-2 ring-white ${className}`}
    >
      {n}
    </span>
  );
}

/** 画面の写しの外枠（見出し＋番号の説明つき） */
export function ScreenFigure({
  title, children, points,
}: {
  title: string;
  children: React.ReactNode;
  points?: { n: number; text: string }[];
}) {
  return (
    <figure className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <figcaption className="px-3 py-2 text-[11px] font-bold text-gray-600 bg-gray-50 border-b border-gray-100">
        {title}
      </figcaption>
      <div className="p-3 bg-gray-50/60 overflow-x-auto">
        <div className="mx-auto w-fit select-none">{children}</div>
      </div>
      {points && points.length > 0 && (
        <ul className="px-3 py-2.5 space-y-1.5 border-t border-gray-100">
          {points.map(p => (
            <li key={p.n} className="flex items-start gap-2 text-[12px] text-gray-700 leading-relaxed">
              <Marker n={p.n} className="mt-0.5 shrink-0" />
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** 協会ロゴ（メニュー下部と同じ、右下にリンクアイコン） */
function MiniLogo({ width }: { width: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width }}>
      <img
        src={`${import.meta.env.BASE_URL}logo-tcta-white.png`}
        alt="鳥取市テニス協会"
        style={{ width, display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
      />
      <ExternalLink
        className="absolute text-white"
        style={{
          width: 9, height: 9,
          right: 'calc(7.4% - 4.5px)',
          bottom: 'calc(24.9% - 4.5px)',
        }}
        strokeWidth={2.5}
      />
    </span>
  );
}

const MENU_ITEMS: { label: string; icon: React.ElementType }[] = [
  { label: 'データ', icon: Database },
  { label: 'エントリー', icon: Users },
  { label: '対戦順', icon: ClipboardList },
  { label: 'ドロー', icon: Network },
  { label: '設定', icon: Settings },
];

/** メニューの開き方（スマホ＝全画面メニュー / PC＝左の常設メニュー） */
export function MenuMockup({ device }: { device: Device }) {
  if (device === 'mobile') {
    return (
      <div className="w-[248px] rounded-[16px] border-[3px] border-gray-800 overflow-hidden bg-white shadow-md">
        {/* ヘッダー */}
        <div className="relative flex items-center justify-between px-2.5 h-9 bg-white border-b-2 border-primary-500">
          <span className="flex items-center gap-1 text-[11px] font-bold text-gray-900">
            <Network size={12} className="text-primary-500" />ドロー
          </span>
          <span className="relative">
            <Menu size={16} className="text-gray-900" />
            <Marker n={1} className="absolute -top-2 -right-2" />
          </span>
        </div>
        {/* 全画面メニュー */}
        <div style={{ background: MENU_BG }}>
          {MENU_ITEMS.map((m, i) => (
            <div
              key={m.label}
              className={`flex items-center gap-2 px-2.5 py-2 text-[11px] font-bold border-b border-white/15 ${
                i === 3 ? 'bg-white text-primary-600' : 'text-white'
              }`}
            >
              <m.icon size={13} className="shrink-0" />
              <span className="flex-1">{m.label}</span>
              {m.label === '設定' ? <Marker n={2} /> : <ArrowRight size={11} className="opacity-70" />}
            </div>
          ))}
          <div className="flex items-end justify-between px-2.5 pt-4 pb-2.5">
            <span className="relative">
              <MiniLogo width={72} />
              <Marker n={3} className="absolute -top-2 -left-2" />
            </span>
            <span className="text-right leading-tight">
              <span className="block text-[10px] font-black text-white tracking-wider">Ver 2.4</span>
              <span className="block text-[8px] text-white/70">2026/08/31</span>
            </span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-[320px] rounded-lg border border-gray-300 overflow-hidden bg-white shadow-md flex">
      {/* 左の常設メニュー */}
      <div className="w-[128px] shrink-0 flex flex-col" style={{ background: MENU_BG }}>
        <div className="flex items-center justify-between px-2 h-8 border-b border-white/20">
          <span className="text-[8px] font-bold text-white/75">メニュー</span>
          <span className="relative">
            <PanelLeftClose size={11} className="text-white/75" />
            <Marker n={1} className="absolute -top-2 -right-2" />
          </span>
        </div>
        <div className="p-1.5 space-y-0.5">
          {MENU_ITEMS.map((m, i) => (
            <div
              key={m.label}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-bold ${
                i === 3 ? 'bg-white text-primary-600' : 'text-white/90'
              }`}
            >
              <m.icon size={11} className="shrink-0" />
              <span className="flex-1">{m.label}</span>
              {m.label === '設定' && <Marker n={2} />}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-end justify-between px-2 pt-6 pb-2">
          <span className="relative">
            <MiniLogo width={54} />
            <Marker n={3} className="absolute -top-2 -left-2" />
          </span>
          <span className="text-[8px] font-black text-white tracking-wider">Ver 2.4</span>
        </div>
      </div>
      {/* 右の本体 */}
      <div className="flex-1 min-w-0">
        <div className="h-8 border-b-2 border-primary-500 flex items-center px-2 text-[10px] font-bold text-gray-900 gap-1">
          <Network size={11} className="text-primary-500" />ドロー
        </div>
        <div className="h-[112px] bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
          選んだ画面がここに出ます
        </div>
      </div>
    </div>
  );
}

/** ドロー画面の上部（クラス切替・進捗・表示範囲・結果画像・修正） */
export function DrawHeaderMockup() {
  return (
    <div className="w-[300px] rounded-lg border border-gray-300 bg-white shadow-sm px-2.5 py-2">
      {/* クラス切替 */}
      <div className="flex items-center gap-1.5">
        <ChevronLeft size={14} className="text-gray-500" />
        <div className="flex-1 text-center">
          <span className="relative inline-flex items-center gap-1 text-[12px] font-bold text-gray-900">
            <Trophy size={12} className="text-primary-500" />
            男子ダブルスＡ級
            <ChevronDown size={12} className="text-gray-500" />
            <Marker n={1} className="absolute -top-2 -right-3" />
          </span>
          <p className="text-[8px] text-gray-500 mt-0.5">8ゲームマッチ（8-8タイブレ）</p>
        </div>
        <ChevronRight size={14} className="text-gray-500" />
      </div>
      {/* 進捗 */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full" style={{ width: '83%' }} />
        </div>
        <span className="relative text-[8px] text-gray-500">
          5/6 (83%)
          <Marker n={2} className="absolute -top-2.5 -right-3" />
        </span>
      </div>
      {/* 表示範囲＋右のボタン */}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="relative inline-flex items-center gap-0.5 rounded-full border border-gray-300 bg-white px-1 py-0.5 shadow-sm">
          <ChevronLeft size={13} className="text-gray-600" />
          <span className="flex items-center gap-1 px-1 text-[11px] font-bold text-gray-900">
            <Eye size={11} className="text-gray-400" />
            <span className="w-[54px] text-center whitespace-nowrap">ALL 1R〜</span>
          </span>
          <ChevronRight size={13} className="text-gray-600" />
          <Marker n={3} className="absolute -top-2 -left-2" />
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex items-center justify-center w-7 h-7 rounded-full border border-gray-300 bg-white">
            <ImageIcon size={14} className="text-gray-600" />
            <Marker n={4} className="absolute -top-2 -right-2" />
          </span>
          <span className="relative flex items-center justify-center w-7 h-7 rounded-full border border-gray-300 bg-white">
            <SlidersHorizontal size={14} className="text-gray-700" />
            <Marker n={5} className="absolute -top-2 -right-2" />
          </span>
        </span>
      </div>
    </div>
  );
}

/** ドロー表の1枠（番号＋ペア2行＋所属） */
function DrawSlot({ no, a, b, affA, affB }: {
  no: number; a: string; b: string; affA: string; affB: string;
}) {
  return (
    <div className="w-[150px] h-[46px] rounded border border-gray-400 bg-white flex items-stretch px-1 gap-1">
      <div className="shrink-0 flex items-center border-r border-gray-300 pr-1">
        <span className="w-3.5 text-center text-[9px] font-mono font-bold text-gray-600">{no}</span>
      </div>
      <div className="flex-1 min-w-0 self-center leading-tight">
        <div className="text-[11px] font-semibold text-gray-900 truncate">{a}</div>
        <div className="text-[11px] font-semibold text-gray-900 truncate">{b}</div>
      </div>
      <div className="self-center text-right leading-tight max-w-[46%]">
        <div className="text-[8px] text-gray-500 truncate">{affA}</div>
        <div className="text-[8px] text-gray-500 truncate">{affB}</div>
      </div>
    </div>
  );
}

/** ドロー表の枠の見かた（番号・氏名・所属・スコア・勝ち上がり） */
export function DrawCardMockup() {
  return (
    <div className="relative w-[300px] h-[132px]">
      <div className="absolute left-0 top-0"><DrawSlot no={1} a="山田 太郎" b="鈴木 次郎" affA="○○クラブ" affB="△△高校" /></div>
      <div className="absolute left-0 top-[74px]"><DrawSlot no={2} a="佐藤 三郎" b="高橋 四郎" affA="□□ＴＣ" affB="フリー" /></div>
      {/* 勝ち上がり線 */}
      <svg className="absolute inset-0" width="300" height="132">
        <path d="M 150 23 L 172 23 L 172 60" fill="none" stroke="#c63834" strokeWidth="2.6" />
        <path d="M 150 97 L 172 97 L 172 60" fill="none" stroke="#a6a6a6" strokeWidth="1.4" />
        <path d="M 172 60 L 196 60" fill="none" stroke="#c63834" strokeWidth="2.6" />
        <text x="177" y="55" fill="#c63834" fontSize="18" fontWeight={900}>8</text>
        <text x="177" y="79" fill="#767676" fontSize="18" fontWeight={800}>5</text>
      </svg>
      <div className="absolute left-[196px] top-[37px]">
        <div className="w-[104px] h-[46px] rounded border border-gray-400 bg-white flex items-stretch px-1 gap-1">
          <div className="shrink-0 flex items-center border-r border-gray-300 pr-1">
            <span className="w-3.5 text-center text-[9px] font-mono font-bold text-gray-600">1</span>
          </div>
          <div className="flex-1 min-w-0 self-center leading-tight">
            <div className="text-[11px] font-semibold text-gray-900 truncate">山田 太郎</div>
            <div className="text-[11px] font-semibold text-gray-900 truncate">鈴木 次郎</div>
          </div>
        </div>
      </div>
      <Marker n={1} className="absolute left-[2px] top-[-8px]" />
      <Marker n={2} className="absolute left-[52px] top-[-8px]" />
      <Marker n={3} className="absolute left-[130px] top-[-8px]" />
      <Marker n={4} className="absolute left-[176px] top-[86px]" />
      <Marker n={5} className="absolute left-[286px] top-[28px]" />
    </div>
  );
}

/** 設定ページ（スマホ＝畳んだ状態 / PC＝開いた状態） */
export function SettingsMockup({ device }: { device: Device }) {
  const rows = [
    { icon: Wifi, title: '同期', desc: '複数の端末で同じ大会データを共有する' },
    { icon: Eye, title: '観戦用ページ', desc: '参加者・協会HP向けの読み取り専用ページ' },
    { icon: Volume2, title: '音声（コール読み上げ）', desc: '呼び出しの声・読み上げ方法を選ぶ' },
    { icon: Shield, title: 'バックアップ', desc: '大会データをまとめて安全に保存・復元' },
  ];
  const open = device === 'pc';
  return (
    <div className={`${device === 'pc' ? 'w-[320px]' : 'w-[248px]'} space-y-2`}>
      {rows.map((r, i) => (
        <div key={r.title} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-2.5 py-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-600 shrink-0">
              <r.icon size={13} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-bold text-gray-800">{r.title}</span>
              <span className="block text-[9px] text-gray-500 truncate">{r.desc}</span>
            </span>
            <span className="relative">
              <ChevronDown size={13} className={`text-gray-400 ${open ? 'rotate-180' : ''}`} />
              {i === 0 && <Marker n={1} className="absolute -top-2 -right-2" />}
            </span>
          </div>
          {open && i === 0 && (
            <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-100 space-y-1.5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[9px] text-gray-600">
                同期していません（この端末だけで動いています）
              </div>
              <div className="rounded-lg bg-primary-600 text-white px-2 py-1.5 text-[10px] font-bold flex items-center justify-between">
                同期設定を開く<ChevronRight size={11} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 結果画像プレビューの操作バー */
export function ResultPreviewMockup({ device }: { device: Device }) {
  const w = device === 'pc' ? 320 : 248;
  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-sm overflow-hidden" style={{ width: w }}>
      <div className="px-2.5 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="order-1 flex-1 min-w-0 flex items-center gap-1.5 text-[10px] font-bold text-gray-900">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-500 text-white">
            <ImageIcon size={9} />
          </span>
          <span className="truncate">男子ダブルスＡ級 結果プレビュー</span>
        </span>
        <span className={`order-2 ${device === 'pc' ? 'sm:order-3' : ''} flex items-center gap-1 shrink-0`}>
          <span className="relative flex items-center justify-center w-6 h-6 rounded bg-gray-600 text-white text-[9px]">
            ⤓
            <Marker n={2} className="absolute -top-2 -right-2" />
          </span>
          <span className="flex items-center justify-center w-6 h-6 rounded border border-gray-200 text-gray-500 text-[10px]">✕</span>
        </span>
        <span className="order-3 basis-full flex items-center gap-2 text-[9px] font-medium text-gray-700">
          表示幅
          <span className="relative flex-1 h-1 rounded-full bg-gray-300">
            <span className="absolute left-[45%] -top-[3px] w-2.5 h-2.5 rounded-full bg-gray-600" />
            <Marker n={1} className="absolute -top-3 left-[40%]" />
          </span>
          <span className="text-gray-500">100%</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-gray-600 inline-block" />協会ロゴ
          </span>
        </span>
      </div>
      <div className="p-2 flex items-center justify-center bg-white">
        <div className="w-full h-[52px] rounded border border-gray-100 bg-gray-50 flex items-center justify-center text-[9px] text-gray-400">
          結果画像のプレビュー
        </div>
      </div>
    </div>
  );
}

/** 進行中の試合カード（コート番号つき）とスコア入力の入口 */
export function MatchCardMockup({ device }: { device: Device }) {
  return (
    <div className="relative w-[262px]">
      <div className="w-[210px] rounded border-2 border-primary-500 bg-primary-50 flex items-stretch overflow-hidden" style={{ height: 64 }}>
        <div className="flex flex-col items-center justify-center shrink-0 bg-primary-600 text-white" style={{ width: 34 }}>
          <span className="text-[7px] font-bold leading-none opacity-85">コート</span>
          <span className="text-lg font-black leading-none mt-0.5">3</span>
        </div>
        <div className="flex-1 flex flex-col justify-center min-w-0 px-1.5 gap-0.5">
          <div className="flex min-w-0">
            <div className="shrink-0 flex items-center border-r border-gray-300 pr-1">
              <span className="w-3.5 text-center text-[9px] font-mono font-bold text-gray-600">1</span>
            </div>
            <div className="flex-1 min-w-0 pl-1 leading-tight">
              <div className="text-[11px] font-bold text-gray-900 truncate">山田 太郎</div>
              <div className="text-[11px] font-bold text-gray-900 truncate">鈴木 次郎</div>
            </div>
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex min-w-0">
            <div className="shrink-0 flex items-center border-r border-gray-300 pr-1">
              <span className="w-3.5 text-center text-[9px] font-mono font-bold text-gray-600">2</span>
            </div>
            <div className="flex-1 min-w-0 pl-1 leading-tight">
              <div className="text-[11px] font-bold text-gray-900 truncate">佐藤 三郎</div>
              <div className="text-[11px] font-bold text-gray-900 truncate">高橋 四郎</div>
            </div>
          </div>
        </div>
      </div>
      <Marker n={1} className="absolute -top-2 left-[6px]" />
      <Marker n={2} className="absolute -top-2 left-[120px]" />
      <span className="absolute left-[216px] top-[22px] text-[10px] text-gray-500 whitespace-nowrap">
        {device === 'pc' ? 'クリック' : 'タップ'}
      </span>
    </div>
  );
}
