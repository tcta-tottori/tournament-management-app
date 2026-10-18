// =============================================
// 予選リーグのカラーパレット
// 管理ページ（MixedDrawView）と観戦用ページで同じ配色を使う。
// リーグの並び順（A, B, C…）に対応する。
// =============================================

import type { CSSProperties } from 'react';

export interface LeagueColor {
  /** 見出しグラデーションの開始色 */
  from: string;
  /** 見出しグラデーションの終了色 */
  to: string;
  /** 淡い背景（カードヘッダー） */
  light: string;
  /** 枠線 */
  border: string;
  /** 番号バッジ */
  badge: string;
}

/**
 * リーグバッジカラー。
 * 協会サイトのトンマナ（白ベース＋赤の差し色）に合わせ、リーグごとの
 * 色分けは廃止し、全リーグ共通の無彩色にしている。
 */
export const LEAGUE_COLORS: LeagueColor[] = [
  { from: 'from-gray-600', to: 'to-gray-700', light: 'from-gray-50 to-white', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-700' },
];

/** リーグの並び順に対応する配色を取得する */
export function leagueColor(index: number): LeagueColor {
  return LEAGUE_COLORS[((index % LEAGUE_COLORS.length) + LEAGUE_COLORS.length) % LEAGUE_COLORS.length];
}

// =============================================
// リーグバッジ（A, B, C… の記号バッジ）の色分け
// 表やヘッダーは無彩色のまま、バッジだけリーグごとに色を変える。
// 先頭リーグ（A）を赤、最後のリーグを紫とし、間は虹の順（橙→黄→緑→青）で
// リーグ数に応じて均等に割り振る。最大 S リーグ（19 リーグ）まで対応。
// =============================================

/** 対応する最大リーグ数（A〜S） */
export const MAX_LEAGUE_COUNT = 19;

/**
 * 虹色の基準色（OKLCH: 明度, 彩度, 色相）。赤 → 紫。
 * 色相を単純に等分すると橙〜茶の範囲が間延びするため、虹の各色を基準点として
 * 置き、その間を等間隔に補間する。文字は白で統一するため、黄色系は少し濃いめにして読みやすくする。
 */
const RAINBOW_STOPS: [number, number, number][] = [
  [0.60, 0.20, 25],   // 赤
  [0.66, 0.17, 55],   // 橙
  [0.70, 0.15, 88],   // 黄
  [0.64, 0.18, 145],  // 緑
  [0.64, 0.12, 205],  // 水色
  [0.57, 0.17, 255],  // 青
  [0.52, 0.19, 282],  // 藍
  [0.55, 0.20, 312],  // 紫
];

/** 0〜1 の位置に対応する虹色を求める */
function rainbowAt(t: number): [number, number, number] {
  const pos = Math.min(Math.max(t, 0), 1) * (RAINBOW_STOPS.length - 1);
  const i = Math.min(Math.floor(pos), RAINBOW_STOPS.length - 2);
  const f = pos - i;
  const [l1, c1, h1] = RAINBOW_STOPS[i];
  const [l2, c2, h2] = RAINBOW_STOPS[i + 1];
  return [l1 + (l2 - l1) * f, c1 + (c2 - c1) * f, h1 + (h2 - h1) * f];
}

/** リーグ記号（'A'〜'S'）を 0 始まりの番号に変換する。判別できなければ -1 */
export function leagueLetterIndex(leagueId: string | undefined | null): number {
  const c = (leagueId ?? '').trim().toUpperCase().replace(/[Ａ-Ｚ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0)).charAt(0);
  if (c < 'A' || c > 'Z') return -1;
  return c.charCodeAt(0) - 65;
}

/** リーグ番号とリーグ数からバッジの OKLCH 値を求める */
function leagueBadgeLch(index: number, leagueCount: number): [number, number, number] {
  const count = Math.min(MAX_LEAGUE_COUNT, Math.max(1, leagueCount, index + 1));
  const i = Math.min(Math.max(0, index), count - 1);
  return rainbowAt(count === 1 ? 0 : i / (count - 1));
}

/** リーグ番号とリーグ数からバッジの背景色を求める */
export function leagueBadgeColor(index: number, leagueCount: number): string {
  const [l, c, h] = leagueBadgeLch(index, leagueCount);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** 白背景の文字色として使うリーグ色（明るい黄色などは読めるよう暗くする） */
export function leagueTextColor(index: number, leagueCount: number): string {
  const [l, c, h] = leagueBadgeLch(index, leagueCount);
  return `oklch(${Math.min(l, 0.58).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** リーグ記号を判別できないときのバッジ配色（グレー） */
const FALLBACK_BADGE_STYLE: CSSProperties = { backgroundColor: '#f3f4f6', color: '#4b5563' };

/**
 * リーグバッジのインラインスタイル。
 * leagueId が A〜S 以外（判別不能）の場合はグレーにする。
 */
export function leagueBadgeStyle(leagueId: string | undefined | null, leagueCount: number): CSSProperties {
  const index = leagueLetterIndex(leagueId);
  if (index < 0 || index >= MAX_LEAGUE_COUNT) return FALLBACK_BADGE_STYLE;
  return {
    backgroundColor: leagueBadgeColor(index, leagueCount),
    color: '#fff',
    // 黄色など明るめの背景でも白文字が読めるよう、ごく薄い影を付ける
    textShadow: '0 1px 1px rgba(0, 0, 0, 0.25)',
  };
}
