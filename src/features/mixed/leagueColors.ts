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
