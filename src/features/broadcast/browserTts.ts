// =============================================================================
// ブラウザ内蔵音声（Web Speech API）による読み上げ
//
// Gemini TTS はネットワーク・API キー・モデルの都合で失敗することがあり、
// 会場でコールが出ないと運営が止まってしまう。こちらは端末内蔵の音声合成を
// 使うため、オフラインでも待ち時間ゼロで確実に鳴らせる。
//
// 実装上の注意（安定してコールするための対策）:
// - 音声一覧は非同期に読み込まれる（初回は空配列が返る）ため voiceschanged を待つ
// - Chrome は 15 秒前後で読み上げが打ち切られるので、文単位に分割して順に話す
// - Chrome は長時間の読み上げ中に一時停止することがあるので resume() で小突く
// - iOS/Safari は最初の発話がユーザー操作から始まる必要があるため unlock を用意
// =============================================================================

/** 選択肢として表示する音声 */
export interface BrowserVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  /** 端末内蔵（オフラインで使える）音声か */
  localService: boolean;
}

export interface BrowserSpeakOptions {
  /** 使用する音声の voiceURI（未指定・見つからない場合は自動選択） */
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  signal?: AbortSignal;
}

/** 日本語音声の優先順（各OSの標準的な読み上げ音声を上から順に採用） */
const PREFERRED_JA_VOICES = [
  'Kyoko',          // macOS / iOS
  'O-ren',          // macOS / iOS
  'Google 日本語',   // Android / Chrome
  'Microsoft Nanami',
  'Microsoft Haruka',
  'Microsoft Ayumi',
  'Otoya',
];

/** 1回の発話に渡す最大文字数（長すぎると途中で切られる端末がある） */
const MAX_CHUNK_LENGTH = 90;

/** 読み上げ中に resume() を送る間隔（Chrome の途中停止対策） */
const KEEP_ALIVE_MS = 8000;

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** この端末でブラウザ内蔵音声が使えるか */
export function isBrowserTtsSupported(): boolean {
  return !!getSynth() && typeof window.SpeechSynthesisUtterance === 'function';
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/**
 * 音声一覧を取得する。初回は空で返ってくる実装が多いため、
 * voiceschanged イベント（最大 timeoutMs）を待ってから返す。
 */
export function loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  const synth = getSynth();
  if (!synth) return Promise.resolve([]);
  const current = synth.getVoices();
  if (current.length > 0) return Promise.resolve(current);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise<SpeechSynthesisVoice[]>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      clearTimeout(timer);
      voicesPromise = null;
      resolve(synth.getVoices());
    };
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener('voiceschanged', finish);
  });
  return voicesPromise;
}

/** 音声の並び（日本語・端末内蔵を上に）。設定画面の選択肢に使う。 */
export function listVoices(): BrowserVoiceOption[] {
  const synth = getSynth();
  if (!synth) return [];
  const score = (v: SpeechSynthesisVoice) => {
    const idx = PREFERRED_JA_VOICES.findIndex(n => v.name.includes(n));
    if (idx >= 0) return idx;
    if (/^ja/i.test(v.lang)) return PREFERRED_JA_VOICES.length + (v.localService ? 0 : 1);
    return 1000;
  };
  return synth.getVoices()
    .slice()
    .sort((a, b) => {
      const d = score(a) - score(b);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    })
    .map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService }));
}

/** 実際に使う音声を決める（指定が無ければ日本語音声を自動選択） */
export function resolveVoice(voiceURI?: string): SpeechSynthesisVoice | null {
  const synth = getSynth();
  if (!synth) return null;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  if (voiceURI) {
    const exact = voices.find(v => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  for (const name of PREFERRED_JA_VOICES) {
    const hit = voices.find(v => v.name.includes(name) && /^ja/i.test(v.lang));
    if (hit) return hit;
  }
  return (
    voices.find(v => /^ja/i.test(v.lang) && v.localService) ||
    voices.find(v => /^ja/i.test(v.lang)) ||
    null
  );
}

/** 自動選択される音声の表示名（設定画面・状態表示用） */
export function currentVoiceLabel(voiceURI?: string): string {
  const v = resolveVoice(voiceURI);
  return v ? `${v.name}（${v.lang}）` : '';
}

/**
 * 読み上げテキストを短い塊に分ける。
 * 句点・改行で切り、それでも長い場合は読点でさらに切る。
 */
export function splitForSpeech(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const sentences = text
    .split(/(?<=[。．！？!?\n])/)
    .map(s => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      chunks.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > maxLength) {
      const head = rest.slice(0, maxLength);
      const cut = Math.max(head.lastIndexOf('、'), head.lastIndexOf(' '), head.lastIndexOf('　'));
      const at = cut > maxLength * 0.4 ? cut + 1 : maxLength;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at);
    }
    if (rest.trim()) chunks.push(rest.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

/** 読み上げを止める */
export function cancelBrowserSpeech(): void {
  const synth = getSynth();
  if (!synth) return;
  try { synth.cancel(); } catch { /* 無視 */ }
}

let unlocked = false;

/**
 * iOS/Safari 対策。最初のユーザー操作から無音の発話を一度流しておくと、
 * 以降はボタン操作以外（自動コール等）からでも読み上げられるようになる。
 */
export function unlockBrowserTts(): void {
  if (unlocked) return;
  const synth = getSynth();
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
    unlocked = true;
  } catch {
    // 無視（次の操作で再試行）
  }
}

/**
 * 読み上げが終わらないまま黙り込んだときの見切り時間。
 * 一部の環境では onend が発火しないことがあり、そのままだと
 * 次のコールが出せなくなるため、想定時間を過ぎたら打ち切る。
 */
function watchdogMs(text: string, rate: number): number {
  const perChar = 500 / Math.max(0.5, rate);
  return Math.max(10000, Math.round(text.length * perChar) + 5000);
}

/** 1つの塊を読み上げる */
function speakChunk(
  synth: SpeechSynthesis,
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: BrowserSpeakOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang || 'ja-JP';
    utter.rate = opts.rate ?? 1;
    utter.pitch = opts.pitch ?? 1;
    utter.volume = opts.volume ?? 1;

    let done = false;
    const keepAlive = setInterval(() => {
      // Chrome は長い読み上げの途中で勝手に一時停止することがある
      try { if (synth.speaking) synth.resume(); } catch { /* 無視 */ }
    }, KEEP_ALIVE_MS);
    const watchdog = setTimeout(() => {
      if (done) return;
      cleanup();
      cancelBrowserSpeech();
      console.warn('[ブラウザ音声] 読み上げが終わらないため打ち切りました');
      resolve();
    }, watchdogMs(text, utter.rate));

    const cleanup = () => {
      done = true;
      clearInterval(keepAlive);
      clearTimeout(watchdog);
      opts.signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (done) return;
      cleanup();
      cancelBrowserSpeech();
      resolve();
    };

    utter.onend = () => { if (!done) { cleanup(); resolve(); } };
    utter.onerror = (e) => {
      if (done) return;
      cleanup();
      // 停止操作による中断はエラー扱いしない
      const reason = (e as SpeechSynthesisErrorEvent).error;
      if (reason === 'interrupted' || reason === 'canceled') resolve();
      else reject(new Error(`ブラウザ音声の再生に失敗しました（${reason || 'unknown'}）`));
    };

    opts.signal?.addEventListener('abort', onAbort, { once: true });
    if (opts.signal?.aborted) { onAbort(); return; }
    synth.speak(utter);
  });
}

/** ブラウザ内蔵音声で読み上げる（全文を読み終えたら解決） */
export async function speakWithBrowser(text: string, opts: BrowserSpeakOptions = {}): Promise<void> {
  const synth = getSynth();
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
    throw new Error('この端末ではブラウザ内蔵音声を利用できません');
  }
  const trimmed = (text || '').trim();
  if (!trimmed) return;

  const voices = await loadVoices();
  if (voices.length === 0) {
    // 読み上げ音声が入っていない端末。ここで気付けるようにエラーにする
    // （呼び出し側が Gemini TTS へ切り替える）。
    throw new Error('この端末に読み上げ音声が見つかりませんでした');
  }
  const voice = resolveVoice(opts.voiceURI);

  // 直前の読み上げが残っていると新しい発話が無視される端末があるため必ず止める。
  // Chrome では cancel() の直後に speak() すると発話が捨てられることがあるので少し待つ。
  const wasBusy = synth.speaking || synth.pending;
  cancelBrowserSpeech();
  if (wasBusy) await new Promise(resolve => setTimeout(resolve, 120));
  // 一時停止状態のまま speak() しても音が出ないため解除しておく
  try { if (synth.paused) synth.resume(); } catch { /* 無視 */ }

  for (const chunk of splitForSpeech(trimmed)) {
    if (opts.signal?.aborted) return;
    await speakChunk(synth, chunk, voice, opts);
  }
}
