import { kataToHira } from './callTextBuilder';

/**
 * kuromoji（Web Worker）を使って、漢字などの文字列の読み（ひらがな）を推定するユーティリティ。
 * コール設定でフリガナを「自動で一旦入れておき、間違っていれば修正する」ために使う。
 *
 * - Worker と辞書のロードは初回のみ（モジュール内でキャッシュ）。
 * - 推定結果は文字列単位でメモリキャッシュし、2回目以降は即時に返す。
 * - Worker が使えない／失敗した場合は空文字を返す（呼び出し側は空欄のまま表示）。
 */

let workerPromise: Promise<Worker> | null = null;
const cache = new Map<string, string>();

function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;
  workerPromise = new Promise<Worker>((resolve, reject) => {
    try {
      if (typeof Worker === 'undefined') {
        reject(new Error('Worker unavailable'));
        return;
      }
      const worker = new Worker('/kuromoji_worker.js');
      const handler = (e: MessageEvent) => {
        if (e.data?.id !== 'init') return;
        if (e.data.type === 'init_success') {
          worker.removeEventListener('message', handler);
          resolve(worker);
        } else if (e.data.type === 'init_error') {
          worker.removeEventListener('message', handler);
          reject(new Error(e.data.error || 'kuromoji init failed'));
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'init', id: 'init' });
    } catch (e) {
      reject(e as Error);
    }
  });
  // 失敗時は次回リトライできるようにリセット
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

/**
 * 文字列配列の読み（ひらがな）を推定して返す。推定できない場合は空文字。
 * 入力と同じ順序・長さの配列を返す。
 */
export async function estimateReadings(texts: string[]): Promise<string[]> {
  const need = Array.from(new Set(texts.filter(t => t && !cache.has(t))));
  if (need.length > 0) {
    try {
      const worker = await getWorker();
      const id = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const results: string[] = await new Promise((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data?.id !== id) return;
          worker.removeEventListener('message', handler);
          if (e.data.type === 'tokenize_success') resolve(e.data.results || []);
          else reject(new Error(e.data.error || 'tokenize failed'));
        };
        worker.addEventListener('message', handler);
        worker.postMessage({ type: 'tokenize', payload: need, id });
      });
      need.forEach((t, i) => {
        const raw = (results[i] || '').trim();
        // kuromoji の reading はカタカナ。ひらがなへ変換して保存。
        cache.set(t, kataToHira(raw));
      });
    } catch {
      // 失敗時は空文字をキャッシュ（何度も試行しない）
      need.forEach(t => cache.set(t, ''));
    }
  }
  return texts.map(t => (t ? (cache.get(t) || '') : ''));
}
