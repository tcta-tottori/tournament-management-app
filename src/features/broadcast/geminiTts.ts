// =============================================================================
// Gemini TTS シングルトンサービス
//
// - HTMLAudioElement を一つだけ生成し、iOS/Android モバイル向けに
//   「初回ユーザー操作で無音再生してアンロック」するパターンを実装
// - direct モード: ブラウザから直接 Gemini API を呼ぶ（APIキーを使用）
// - proxy モード:  sync-server 経由（APIキーはサーバー側で保持）
// =============================================================================

import { getVoiceSettings, getResolvedModel, setResolvedModel, MODEL_FALLBACKS } from './voiceConfig';

/** 無音 WAV（再生を「プライム」するだけに使用） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 生成の揺らぎを抑えるための温度。
 * 既定（1.0前後）のままだと同じ音声・同じ指示でもコールごとに声色や口調が
 * 変わってしまうため、低めに固定して毎回同じ読み上げになるようにする。
 * モデルが temperature を受け付けない場合は自動でリトライする（下記 400 フォールバック）。
 */
export const TTS_TEMPERATURE = 0.15;

/** 生成済み音声を保持しておく最大件数 */
const MAX_CACHE_ENTRIES = 20;

/**
 * 繰り返しを含む読み上げテキストを1つにまとめる。
 * 1回の生成にまとめることで、繰り返しの前後で声色が変わるのを防ぎ、
 * API 呼び出し回数も減らせる。
 */
export function buildRepeatedText(text: string, repeatCount = 1): string {
  const repeats = Math.min(Math.max(1, repeatCount), 3);
  if (repeats === 1) return text;
  const parts = [text];
  for (let i = 1; i < repeats; i++) parts.push(`繰り返します。${text}`);
  return parts.join('\n');
}

export interface GeminiTtsState {
  /** 音声取得〜再生終了までの間 true */
  isSpeaking: boolean;
  /** API から音声データを取得中 true（再生開始すると false） */
  isLoading: boolean;
  /** 直近の生成で実際に使われたモデル ID（未生成なら空文字） */
  lastModel: string;
  /** 直近の生成にかかったミリ秒（未生成なら 0） */
  lastLatencyMs: number;
}

type Listener = (state: GeminiTtsState) => void;

/** 指定モデルがこの API キーで使えない（存在しない）ことを表す */
class ModelUnavailableError extends Error {
  readonly model: string;

  constructor(model: string, detail: string) {
    super(`モデル ${model} は利用できません（${detail}）`);
    this.name = 'ModelUnavailableError';
    this.model = model;
  }
}

class GeminiTtsService {
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private currentUrl: string | null = null;
  private _isSpeaking = false;
  private _isLoading = false;
  private _lastModel = '';
  private _lastLatencyMs = 0;
  private listeners = new Set<Listener>();
  private abortCtrl: AbortController | null = null;
  /**
   * モデルごとの `temperature` 対応可否。
   * 対応していないモデルに毎回 temperature 付きで投げると 400 → 再送となり、
   * 1回のコールで2往復ぶんの待ち時間が発生するため、一度判明したら記憶する。
   */
  private temperatureSupport = new Map<string, boolean>();
  /** 生成済み音声のキャッシュ（同じ文面のコールをやり直しても待たずに済む） */
  private cache = new Map<string, Blob>();
  /** 事前生成の進行中リクエスト（同じ文面を二重に生成しないため） */
  private inFlight = new Map<string, Promise<Blob>>();

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

  get isLoading(): boolean {
    return this._isLoading;
  }

  get state(): GeminiTtsState {
    return {
      isSpeaking: this._isSpeaking,
      isLoading: this._isLoading,
      lastModel: this._lastModel,
      lastLatencyMs: this._lastLatencyMs,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    const s = this.state;
    for (const l of this.listeners) l(s);
  }

  private setSpeaking(v: boolean) {
    if (this._isSpeaking !== v) {
      this._isSpeaking = v;
      this.emit();
    }
  }

  private setLoading(v: boolean) {
    if (this._isLoading !== v) {
      this._isLoading = v;
      this.emit();
    }
  }

  /** 生成中カウンタ（一斉コールの事前生成では複数が並行するため数える） */
  private loadingCount = 0;

  private beginLoading() {
    this.loadingCount++;
    this.setLoading(true);
  }

  private endLoading() {
    this.loadingCount = Math.max(0, this.loadingCount - 1);
    if (this.loadingCount === 0) this.setLoading(false);
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
      // 繰り返しも含めて1回の生成にまとめる（声色が途中で変わらないようにするため）
      await this.synthesizeAndPlay(buildRepeatedText(text, options.repeatCount ?? 1));
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
    this.loadingCount = 0;
    this.setLoading(false);
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

  /**
   * 音声データだけを生成して返す（再生しない）。
   * 一斉コールのように、先に全部の音声を用意してから続けて再生したい場合に使う。
   */
  async synthesize(
    text: string,
    options: { repeatCount?: number; signal?: AbortSignal } = {},
  ): Promise<Blob> {
    const cfg = getVoiceSettings();
    const t = buildRepeatedText(text, options.repeatCount ?? 1);
    this.beginLoading();
    try {
      return cfg.mode === 'direct'
        ? await this.synthesizeDirect(t, cfg, options.signal)
        : await this.synthesizeViaProxy(t, cfg, options.signal);
    } finally {
      this.endLoading();
    }
  }

  /** `synthesize()` で先に生成しておいた音声を再生する */
  async playBlob(blob: Blob): Promise<void> {
    this.stopInternal();
    this.unlockAudio();
    this.abortCtrl = new AbortController();
    this.setSpeaking(true);
    try {
      await this.playAudioBlob(blob);
    } finally {
      this.abortCtrl = null;
      this.setSpeaking(false);
    }
  }

  /** 生成済み音声のキャッシュキー（同じ設定・同じ文面なら再利用できる） */
  private cacheKey(text: string, cfg: ReturnType<typeof getVoiceSettings>): string {
    return [cfg.mode, cfg.model, cfg.voiceName, cfg.styleInstruction, text].join('\u0000');
  }

  /**
   * 読み上げ内容を先に生成しておく。
   *
   * コールプレビューを開いている間に裏で用意しておくことで、
   * 「コール」を押してから音が出るまでの待ち時間をほぼゼロにできる。
   * 画面のローディング表示（isLoading）は変化させない。
   */
  prefetch(text: string, repeatCount = 1): void {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const cfg = getVoiceSettings();
    if (cfg.mode === 'direct' ? !cfg.apiKey : !cfg.serverUrl) return;
    const full = buildRepeatedText(trimmed, repeatCount);
    const key = this.cacheKey(full, cfg);
    if (this.cache.has(key) || this.inFlight.has(key)) return;

    // 再生の停止（stop）で事前生成まで中断されないよう、専用の signal を渡す
    const own = new AbortController().signal;
    const task = (cfg.mode === 'direct'
      ? this.synthesizeDirect(full, cfg, own)
      : this.synthesizeViaProxy(full, cfg, own)
    ).then(blob => {
      this.putCache(key, blob);
      return blob;
    }).finally(() => {
      this.inFlight.delete(key);
    });
    // 事前生成の失敗は無視する（本番のコール時に改めてエラーを出す）
    task.catch(() => { /* noop */ });
    this.inFlight.set(key, task);
  }

  private putCache(key: string, blob: Blob): void {
    this.cache.set(key, blob);
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async synthesizeAndPlay(text: string): Promise<void> {
    const cfg = getVoiceSettings();
    const key = this.cacheKey(text, cfg);

    // 事前生成済みならネットワーク待ちなしで再生する
    const cached = this.cache.get(key);
    if (cached) {
      await this.playAudioBlob(cached);
      return;
    }

    this.beginLoading();
    let audioBlob: Blob;
    try {
      // 事前生成が進行中ならその結果を待つ（二重リクエストを避ける）
      const pending = this.inFlight.get(key);
      audioBlob = pending
        ? await pending
        : cfg.mode === 'direct'
          ? await this.synthesizeDirect(text, cfg)
          : await this.synthesizeViaProxy(text, cfg);
      this.putCache(key, audioBlob);
    } finally {
      this.endLoading();
    }
    await this.playAudioBlob(audioBlob);
  }

  private playAudioBlob(audioBlob: Blob): Promise<void> {
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
    signal?: AbortSignal,
  ): Promise<Blob> {
    if (!cfg.serverUrl) throw new Error('中継サーバーURLが未設定です');
    const url = `${cfg.serverUrl.replace(/\/$/, '')}/api/gemini-tts`;
    const startedAt = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: cfg.voiceName,
        styleInstruction: cfg.styleInstruction || undefined,
        // 毎回同じ声・同じ口調にするため温度を固定して渡す
        temperature: TTS_TEMPERATURE,
      }),
      signal: signal ?? this.abortCtrl?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const blob = await res.blob();
    // 中継サーバー側のモデル名はレスポンスヘッダー（無ければ /api/gemini-status）で分かる
    this._lastModel = res.headers.get('X-Gemini-Model') || this._lastModel;
    this._lastLatencyMs = Math.round(performance.now() - startedAt);
    return blob;
  }

  /**
   * 設定されたモデルを先頭に、フォールバック候補を並べた試行順を返す。
   * 一度成功したモデルが記録されていればそれを最優先にする（毎回の総当たりを避ける）。
   */
  private modelCandidates(configured: string): string[] {
    const resolved = getResolvedModel();
    const list = [resolved, configured, ...MODEL_FALLBACKS].filter(Boolean);
    return Array.from(new Set(list));
  }

  private async synthesizeDirect(
    text: string,
    cfg: ReturnType<typeof getVoiceSettings>,
    signal?: AbortSignal,
  ): Promise<Blob> {
    if (!cfg.apiKey) throw new Error('Gemini API キーが未設定です');

    const candidates = this.modelCandidates(cfg.model);
    let lastError: Error | null = null;

    for (const model of candidates) {
      try {
        const startedAt = performance.now();
        const blob = await this.requestAudio(text, model, cfg, signal);
        this._lastModel = model;
        this._lastLatencyMs = Math.round(performance.now() - startedAt);
        setResolvedModel(model);
        return blob;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        // モデルが存在しない／このキーで使えない場合のみ次の候補へ
        if (!(err instanceof ModelUnavailableError)) throw err;
        lastError = err;
      }
    }
    throw lastError ?? new Error('利用可能な Gemini TTS モデルが見つかりませんでした');
  }

  /** 1モデルぶんの音声生成リクエスト */
  private async requestAudio(
    text: string,
    model: string,
    cfg: ReturnType<typeof getVoiceSettings>,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const prompt = cfg.styleInstruction ? `${cfg.styleInstruction}: ${text}` : text;
    const buildPayload = (withTemperature: boolean) => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        // 生成ごとの声色・口調の揺れを抑える
        ...(withTemperature ? { temperature: TTS_TEMPERATURE } : {}),
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voiceName } },
        },
      },
    });
    const post = (withTemperature: boolean) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(withTemperature)),
      signal: signal ?? this.abortCtrl?.signal,
    });

    // temperature 非対応と判明済みのモデルには最初から付けずに送る（往復を1回に抑える）
    const useTemperature = this.temperatureSupport.get(model) !== false;
    let res = await post(useTemperature);
    if (!res.ok && res.status === 400 && useTemperature) {
      this.temperatureSupport.set(model, false);
      res = await post(false);
    } else if (res.ok && useTemperature) {
      this.temperatureSupport.set(model, true);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 404 || /NOT_FOUND|is not found|not supported/i.test(body)) {
        throw new ModelUnavailableError(model, `HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
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

  /**
   * 現在の API キーで利用可能なモデルを一覧する（direct モード時）。
   * TTS 対応と思われるモデル（名前に "tts" を含む、または
   * `supportedGenerationMethods` に generateContent を含むもの）を先頭に並べる。
   */
  async listAvailableModels(): Promise<{
    models: { id: string; displayName?: string; description?: string; ttsLikely: boolean }[];
    error?: string;
  }> {
    const cfg = getVoiceSettings();
    if (cfg.mode !== 'direct') {
      return { models: [], error: '直接モード時のみ利用可能です' };
    }
    if (!cfg.apiKey) return { models: [], error: 'APIキーが未設定です' };
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}?key=${encodeURIComponent(cfg.apiKey)}&pageSize=200`,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { models: [], error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = Array.isArray(json?.models) ? json.models : [];
      const list = raw.map((m) => {
        const id: string = (m.name || '').replace(/^models\//, '');
        const methods: string[] = m.supportedGenerationMethods || [];
        const ttsLikely = /tts/i.test(id) || methods.some((x: string) => /tts/i.test(x));
        return {
          id,
          displayName: m.displayName,
          description: m.description,
          ttsLikely,
        };
      });
      // TTS 候補を先頭に
      list.sort((a, b) => (a.ttsLikely === b.ttsLikely ? a.id.localeCompare(b.id) : a.ttsLikely ? -1 : 1));
      return { models: list };
    } catch (err) {
      return { models: [], error: String(err) };
    }
  }

  /** 現在のモードに応じて利用可能性を確認 */
  async checkAvailability(): Promise<{ available: boolean; model?: string; error?: string }> {
    const cfg = getVoiceSettings();
    if (cfg.mode === 'direct') {
      if (!cfg.apiKey) return { available: false, error: 'APIキーが未設定です' };
      // モデル情報の取得で API キーの有効性を実際に検証。
      // 設定モデルが無ければ候補を順に試し、使えたものを記録する。
      let lastError = '';
      for (const model of this.modelCandidates(cfg.model)) {
        try {
          const res = await fetch(
            `${GEMINI_API_BASE}/${encodeURIComponent(model)}?key=${encodeURIComponent(cfg.apiKey)}`,
          );
          if (res.ok) {
            setResolvedModel(model);
            return { available: true, model };
          }
          const body = await res.text().catch(() => '');
          lastError = `HTTP ${res.status}: ${body.slice(0, 160) || '詳細不明'}`;
          // モデルが無いだけなら次の候補へ。認証エラー等はそこで打ち切る。
          if (res.status !== 404 && !/NOT_FOUND|is not found/i.test(body)) break;
        } catch (err) {
          return { available: false, error: String(err) };
        }
      }
      return { available: false, error: lastError || '利用できるモデルが見つかりませんでした' };
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
