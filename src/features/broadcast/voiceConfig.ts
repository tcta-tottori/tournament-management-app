// =============================================================================
// 音声（Gemini TTS）設定
// =============================================================================

export interface VoiceConfig {
  serverUrl: string;
  voiceName: string;
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
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8787`;
  }
  return 'http://localhost:8787';
}

const KEY_SERVER = 'voice_server_url';
const KEY_VOICE = 'voice_name';
const KEY_STYLE = 'voice_style';
const EVENT_CHANGED = 'voice-settings-changed';

const DEFAULT_STYLE =
  '落ち着いた女性アナウンサーの声で、はっきりと丁寧に読み上げてください';

export function getVoiceSettings(): VoiceConfig {
  return {
    serverUrl: localStorage.getItem(KEY_SERVER) || defaultServerUrl(),
    voiceName: localStorage.getItem(KEY_VOICE) || 'Kore',
    styleInstruction: localStorage.getItem(KEY_STYLE) ?? DEFAULT_STYLE,
  };
}

export function setVoiceSettings(patch: Partial<VoiceConfig>): void {
  if (patch.serverUrl !== undefined) localStorage.setItem(KEY_SERVER, patch.serverUrl);
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
