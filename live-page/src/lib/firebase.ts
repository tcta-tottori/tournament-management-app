/**
 * ライブデータ取得設定
 *
 * Cloudflare Workers から JSON をポーリングで取得する。
 * Firebase は使用しない。
 */

/** データ取得元の API URL */
export const API_BASE_URL =
  (import.meta.env.VITE_LIVE_API_URL as string) || '';

/** ポーリング間隔（ミリ秒） */
export const POLL_INTERVAL = 15_000;
