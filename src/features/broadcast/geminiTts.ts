// =============================================================================
// Gemini TTS シングルトンサービス
//
// - HTMLAudioElement を一つだけ生成し、iOS/Android モバイル向けに
//   「初回ユーザー操作で無音再生してアンロック」するパターンを実装
// - direct モード: ブラウザから直接 Gemini API を呼ぶ（APIキーを使用）
// - proxy モード:  sync-server 経由（APIキーはサーバー側で保持）
// =============================================================================

import { getVoiceSettings } from './voiceConfig';

/** 無音 WAV（再生を「プライム」するだけに使用） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type Listener = (isSpeaking: boolean) => void;

class GeminiTtsService {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private currentUrl: string | null = null;
  private _isSpeaking = false;
  private listeners = new Set<Listener>();
  private abortCtrl: AbortController | null = null;

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'auto';
      this.audio = a;
    }
    return this.audio;
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this._isSpeaking);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    for (const l of this.listeners) l(this._isSpeaking);
  }

  private setSpeaking(v: boolean) {
    if (this._isSpeaking !== v) {
      this._isSpeaking = v;
      this.emit();
    }
  }

  /**
   * ブラウザの自動再生制約をアンロックする。
   * 初回ユーザー操作（click/touch）から同期的に呼ばれる必要がある。
   */
  unlockAudio(): void {
    if (this.unlocked) return;
    try {
      const a = this.getAudio();
      a.src = SILENT_WAV;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          a.pause();
          a.currentTime = 0;
          this.unlocked = true;
        }).catch(() => {
          // 次回の操作で再試行
        });
      } else {
        this.unlocked = true;
      }
    } catch {
      // 無視
    }
  }

  async speak(
    text: string,
    options: {
      repeatCount?: number;
      onComplete?: () => void;
      onError?: (err: Error) => void;
    } = {},
  ): Promise<void> {
    this.stopInternal();
    this.unlockAudio();

    this.abortCtrl = new AbortController();
    this.setSpeaking(true);

    try {
      const repeats = Math.min(Math.max(1, options.repeatCount ?? 1), 3);
      for (let i = 0; i < repeats; i++) {
        if (this.abortCtrl.signal.aborted) break;
        const t = i === 0 ? text : `繰り返します。${text}`;
        await this.synthesizeAndPlay(t);
        if (i < repeats - 1 && !this.abortCtrl.signal.aborted) {
          await this.delay(1000);
        }
      }
      if (!this.abortCtrl.signal.aborted) options.onComplete?.();
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        console.error('[Gemini TTS]', err);
        options.onError?.(err as Error);
      }
    } finally {
      this.abortCtrl = null;
      this.setSpeaking(false);
    }
  }

  stop(): void {
    this.stopInternal();
    this.setSpeaking(false);
  }

  private stopInternal(): void {
    if (this.abortCtrl) {
      this.abortCtrl.abort();
      this.abortCtrl = null;
    }
    if (this.audio) {
      try { this.audio.pause(); } catch { /* noop */ }
    }
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private async synthesizeAndPlay(text: string): Promise<void> {
    const cfg = getVoiceSettings();
    const audioBlob = cfg.mode === 'direct'
      ? await this.synthesizeDirect(text, cfg)
      : await this.synthesizeViaProxy(text, cfg);

    const objectUrl = URL.createObjectURL(audioBlob);
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = objectUrl;

    return new Promise<void>((resolve, reject) => {
      const a = this.getAudio();
      const onEnded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('audio playback error')); };
      const onAbort = () => { cleanup(); resolve(); };
      const cleanup = () => {
        a.removeEventListener('ended', onEnded);
        a.removeEventListener('error', onError);
        this.abortCtrl?.signal.removeEventListener('abort', onAbort);
      };
      a.addEventListener('ended', onEnded, { once: true });
      a.addEventListener('error', onError, { once: true });
      this.abortCtrl?.signal.addEventListener('abort', onAbort, { once: true });

      a.src = objectUrl;
      a.play().catch(reject);
    });
  }

  private async synthesizeViaProxy(
    text: string,
    cfg: ReturnType<typeof getVoiceSettings>,
  ): Promise<Blob> {
    if (!cfg.serverUrl) throw new Error('中継サーバーURLが未設定です');
    const url = `${cfg.serverUrl.replace(/\/$/, '')}/api/gemini-tts`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: cfg.voiceName,
        styleInstruction: cfg.styleInstruction || undefined,
      }),
      signal: this.abortCtrl?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.blob();
  }

  private async synthesizeDirect(
    text: string,
    cfg: ReturnType<typeof getVoiceSettings>,
  ): Promise<Blob> {
    if (!cfg.apiKey) throw new Error('Gemini API キーが未設定です');
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const prompt = cfg.styleInstruction ? `${cfg.styleInstruction}: ${text}` : text;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voiceName } },
        },
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: this.abortCtrl?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const part = json?.candidates?.[0]?.content?.parts?.[0];
    const inline = part?.inlineData || part?.inline_data;
    const b64: string | undefined = inline?.data;
    if (!b64) throw new Error('Gemini API からオーディオが返されませんでした');
    const mime: string = inline?.mimeType || inline?.mime_type || '';
    const sampleRate = this.parseSampleRate(mime);
    const pcm = this.base64ToBytes(b64);
    const wav = this.pcmToWav(pcm, sampleRate);
    return new Blob([wav], { type: 'audio/wav' });
  }

  private parseSampleRate(mime: string): number {
    const m = mime.match(/rate=(\d+)/);
    return m ? parseInt(m[1], 10) : 24000;
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** 24kHz / 16-bit / mono PCM を WAV コンテナにラップ */
  private pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.byteLength;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeAscii(view, 8, 'WAVE');
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    new Uint8Array(buf, 44).set(pcm);
    return new Uint8Array(buf);
  }

  private writeAscii(view: DataView, offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.abortCtrl?.signal.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  }

  /** 現在のモードに応じて利用可能性を確認 */
  async checkAvailability(): Promise<{ available: boolean; model?: string; error?: string }> {
    const cfg = getVoiceSettings();
    if (cfg.mode === 'direct') {
      if (!cfg.apiKey) return { available: false, error: 'APIキーが未設定です' };
      // モデル情報の取得で API キーの有効性を実際に検証
      try {
        const res = await fetch(
          `${GEMINI_API_BASE}/${encodeURIComponent(cfg.model)}?key=${encodeURIComponent(cfg.apiKey)}`,
        );
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return {
            available: false,
            error: `HTTP ${res.status}: ${body.slice(0, 160) || '詳細不明'}`,
          };
        }
        return { available: true, model: cfg.model };
      } catch (err) {
        return { available: false, error: String(err) };
      }
    }
    if (!cfg.serverUrl) return { available: false, error: '中継サーバーURLが未設定です' };
    try {
      const res = await fetch(`${cfg.serverUrl.replace(/\/$/, '')}/api/gemini-status`);
      if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { available: !!data.available, model: data.model };
    } catch (err) {
      return { available: false, error: String(err) };
    }
  }
}

export const geminiTts = new GeminiTtsService();
