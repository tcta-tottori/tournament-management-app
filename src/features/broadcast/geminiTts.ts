// =============================================================================
// Gemini TTS シングルトンサービス
//
// - HTMLAudioElement を一つだけ生成し、iOS/Android モバイル向けに
//   「初回ユーザー操作で無音再生してアンロック」するパターンを実装
// - フック内ではなく module-level に置くことで、ページ上に複数のコール
//   コンポーネントがあっても状態・停止制御を1本化する
// =============================================================================

import { getVoiceSettings } from './voiceConfig';

/** 無音 WAV（再生を「プライム」するだけに使用） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

type Listener = (isSpeaking: boolean) => void;

class GeminiTtsService {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private currentUrl: string | null = null;
  private _isSpeaking = false;
  private listeners = new Set<Listener>();
  private abortCtrl: AbortController | null = null;

  /** HTMLAudioElement を遅延初期化（SSR 対策 + モバイル制約対応） */
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
   * 一度成功すれば、同じ `<audio>` 要素に対しては後から非同期でも再生可能。
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
          // 失敗時は次回の操作で再試行
        });
      } else {
        this.unlocked = true;
      }
    } catch {
      // 無視
    }
  }

  /**
   * テキストを読み上げる。
   * @param text 読み上げるテキスト
   * @param options { repeatCount, onComplete, onError }
   */
  async speak(
    text: string,
    options: {
      repeatCount?: number;
      onComplete?: () => void;
      onError?: (err: Error) => void;
    } = {},
  ): Promise<void> {
    // 既存再生を停止
    this.stopInternal();
    // アンロック（同期）
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
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    // 前回 URL を解放
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.abortCtrl?.signal.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  }

  /** sync-server の Gemini プロキシ可用性を確認 */
  async checkAvailability(): Promise<{ available: boolean; model?: string; error?: string }> {
    try {
      const { serverUrl } = getVoiceSettings();
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/gemini-status`);
      if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { available: !!data.available, model: data.model };
    } catch (err) {
      return { available: false, error: String(err) };
    }
  }
}

export const geminiTts = new GeminiTtsService();
