// =============================================
// 予選リーグのカラーパレット
// 管理ページ（MixedDrawView）と観戦用ページで同じ配色を使う。
// リーグの並び順（A, B, C…）に対応する。
// =============================================

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

/** リーグバッジカラー（Blue先頭で全ページ統一） */
export const LEAGUE_COLORS: LeagueColor[] = [
  { from: 'from-blue-600', to: 'to-indigo-700', light: 'from-blue-50 to-indigo-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  { from: 'from-emerald-600', to: 'to-teal-700', light: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  { from: 'from-purple-600', to: 'to-violet-700', light: 'from-purple-50 to-violet-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  { from: 'from-rose-600', to: 'to-pink-700', light: 'from-rose-50 to-pink-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
  { from: 'from-amber-600', to: 'to-orange-700', light: 'from-amber-50 to-orange-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  { from: 'from-cyan-600', to: 'to-sky-700', light: 'from-cyan-50 to-sky-50', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  { from: 'from-lime-600', to: 'to-green-700', light: 'from-lime-50 to-green-50', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-700' },
  { from: 'from-fuchsia-600', to: 'to-purple-700', light: 'from-fuchsia-50 to-purple-50', border: 'border-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-700' },
];

/** リーグの並び順に対応する配色を取得する */
export function leagueColor(index: number): LeagueColor {
  return LEAGUE_COLORS[((index % LEAGUE_COLORS.length) + LEAGUE_COLORS.length) % LEAGUE_COLORS.length];
}
