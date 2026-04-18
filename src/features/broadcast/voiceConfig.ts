// =============================================================================
// 音声（Gemini TTS）設定
// =============================================================================

export type VoiceMode = 'direct' | 'proxy';

export interface VoiceConfig {
  /** `direct` = ブラウザから直接 Gemini API を叩く（APIキーが必要）
   *  `proxy`  = sync-server 経由（APIキーはサーバー側） */
  mode: VoiceMode;
  /** direct モード時に使用する API キー（localStorage に保存） */
  apiKey: string;
  /** proxy モード時に使用する sync-server の HTTP URL */
  serverUrl: string;
  /** direct モード時のモデル名 */
  model: string;
  /** Gemini の組み込み音声名 */
  voiceName: string;
  /** 自然言語で指定する話し方の指示 */
  styleInstruction: string;
}

/** sync-settings-storage（zustand persist）から WS URL を抜き取り HTTP URL へ変換 */
function defaultServerUrl(): string {
  try {
    const raw = localStorage.getItem('sync-settings-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const wsUrl: string | undefined = parsed?.state?.serverUrl;
      if (wsUrl) {
        const u = new URL(wsUrl);
        const proto = u.protocol === 'wss:' ? 'https:' : 'http:';
        return `${proto}//${u.host}`;
      }
    }
  } catch {
    // 無視
  }
  // ホスト名だけに 8787 を付けるのは通常誤設定のため、空にしてユーザーに入力させる
  return '';
}

const KEY_MODE = 'voice_mode';
const KEY_API = 'voice_api_key';
const KEY_SERVER = 'voice_server_url';
const KEY_MODEL = 'voice_model';
const KEY_VOICE = 'voice_name';
const KEY_STYLE = 'voice_style';
const EVENT_CHANGED = 'voice-settings-changed';

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_STYLE =
  '落ち着いた女性アナウンサーの声で、はっきりと丁寧に読み上げてください';

/** 選択可能な既知モデル（カスタム入力も可） */
export const GEMINI_TTS_MODELS: { id: string; label: string }[] = [
  { id: 'gemini-3.1-flash-preview-tts', label: 'Gemini 3.1 Flash TTS（最新・高速）' },
  { id: 'gemini-3.1-pro-preview-tts', label: 'Gemini 3.1 Pro TTS（最新・高品質）' },
  { id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS（安定）' },
  { id: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro TTS（高品質）' },
];

export function getVoiceSettings(): VoiceConfig {
  const mode = (localStorage.getItem(KEY_MODE) as VoiceMode) || 'direct';
  return {
    mode,
    apiKey: localStorage.getItem(KEY_API) || '',
    serverUrl: localStorage.getItem(KEY_SERVER) || defaultServerUrl(),
    model: localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL,
    voiceName: localStorage.getItem(KEY_VOICE) || 'Kore',
    styleInstruction: localStorage.getItem(KEY_STYLE) ?? DEFAULT_STYLE,
  };
}

export function setVoiceSettings(patch: Partial<VoiceConfig>): void {
  if (patch.mode !== undefined) localStorage.setItem(KEY_MODE, patch.mode);
  if (patch.apiKey !== undefined) localStorage.setItem(KEY_API, patch.apiKey);
  if (patch.serverUrl !== undefined) localStorage.setItem(KEY_SERVER, patch.serverUrl);
  if (patch.model !== undefined) localStorage.setItem(KEY_MODEL, patch.model);
  if (patch.voiceName !== undefined) localStorage.setItem(KEY_VOICE, patch.voiceName);
  if (patch.styleInstruction !== undefined) localStorage.setItem(KEY_STYLE, patch.styleInstruction);
  try {
    window.dispatchEvent(new Event(EVENT_CHANGED));
  } catch {
    // 無視
  }
}

export function onVoiceSettingsChange(handler: () => void): () => void {
  window.addEventListener(EVENT_CHANGED, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_CHANGED, handler);
    window.removeEventListener('storage', handler);
  };
}

/** Gemini TTS で利用可能な事前構築音声（代表的なもの） */
export const GEMINI_VOICES: { name: string; label: string }[] = [
  { name: 'Kore', label: 'Kore（落ち着いた女性）' },
  { name: 'Aoede', label: 'Aoede（軽やかな女性）' },
  { name: 'Leda', label: 'Leda（若々しい女性）' },
  { name: 'Zephyr', label: 'Zephyr（明るい女性）' },
  { name: 'Callirhoe', label: 'Callirhoe（穏やかな女性）' },
  { name: 'Autonoe', label: 'Autonoe（柔らかい女性）' },
  { name: 'Despina', label: 'Despina（透明感のある女性）' },
  { name: 'Erinome', label: 'Erinome（はきはきした女性）' },
  { name: 'Puck', label: 'Puck（軽快な男性）' },
  { name: 'Charon', label: 'Charon（落ち着いた男性）' },
  { name: 'Fenrir', label: 'Fenrir（力強い男性）' },
  { name: 'Orus', label: 'Orus（標準的な男性）' },
];
