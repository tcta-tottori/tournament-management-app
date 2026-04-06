/**
 * ライブ公開設定
 *
 * Cloudflare Workers エンドポイントの URL を環境変数で設定する。
 * 未設定の場合はライブ公開機能が無効になり、従来どおりローカル動作のみ。
 *
 * 環境変数:
 *   VITE_LIVE_API_URL  — Cloudflare Worker の URL（例: https://live-api.tcta-tottori.workers.dev）
 *   VITE_LIVE_API_KEY  — 書き込み用 APIキー（Worker 側で検証）
 */

/** ライブ公開 API の URL */
export const liveApiUrl = import.meta.env.VITE_LIVE_API_URL as string | undefined;

/** 書き込み用 APIキー */
export const liveApiKey = import.meta.env.VITE_LIVE_API_KEY as string | undefined;

/** ライブ公開が有効かどうか */
export const isLiveEnabled = !!liveApiUrl;
