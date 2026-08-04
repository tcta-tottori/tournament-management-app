import { Loader2, Megaphone, Square } from 'lucide-react';

/**
 * コール（音声呼び出し）の状態を画面下部に固定表示するポップアップ。
 *
 * シングルス大会・ミックス大会で見た目を揃えるための共通コンポーネント。
 * - 音声の生成待ち（ネットワーク待ち）は「コール読込中」
 * - 再生が始まったら「コール中 ・ ○番コート」
 */
export interface CallStatusSide {
  /** 選手名／ペア名（改行したい場合は配列） */
  name: string | string[];
  /** 所属など、名前の下に小さく出す文字列 */
  sub?: string | string[];
}

interface Props {
  /** 音声を生成中（まだ再生が始まっていない） */
  loading?: boolean;
  /** 見出しに添えるコート名（例: "9番コート"）。空なら省略 */
  courtLabel?: string;
  /** 見出しの下に出す補足（種目・回戦など） */
  subtitle?: string;
  left: CallStatusSide;
  right: CallStatusSide;
  onStop: () => void;
}

function toLines(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

function SideBlock({ side }: { side: CallStatusSide }) {
  const names = toLines(side.name);
  const subs = toLines(side.sub).filter(s => s !== 'BYE');
  return (
    <div className="min-w-0 flex-1">
      {(names.length ? names : ['-']).map((n, i) => (
        <p key={i} className="text-sm font-bold text-gray-900 truncate">{n}</p>
      ))}
      {subs.map((s, i) => (
        <p key={i} className="text-[10px] text-gray-500 truncate">{s}</p>
      ))}
    </div>
  );
}

export default function CallStatusPopup({
  loading = false,
  courtLabel,
  subtitle,
  left,
  right,
  onStop,
}: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] flex justify-center px-3 pb-3 pointer-events-none">
      {/* 枠のみ点滅・背景は半透明・赤ベース */}
      <div className="pointer-events-auto w-full max-w-lg rounded-xl border-2 bg-white/80 backdrop-blur-sm shadow-2xl overflow-hidden call-popup-blink">
        <div className="flex items-center gap-3 bg-gradient-to-r from-red-600/90 to-rose-600/90 px-4 py-2">
          <div className="relative shrink-0">
            {loading
              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
              : <Megaphone className="w-5 h-5 text-white" />}
            {!loading && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold">
              {loading ? 'コール読込中' : `コール中${courtLabel ? ` ・ ${courtLabel}` : ''}`}
            </p>
            {subtitle && <p className="text-white/90 text-[11px] truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/25 hover:bg-white/40 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
            停止
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 px-4 py-3 text-center bg-red-50/70">
          <SideBlock side={left} />
          <span className="text-xs font-bold text-red-500 shrink-0">vs</span>
          <SideBlock side={right} />
        </div>
      </div>
    </div>
  );
}
