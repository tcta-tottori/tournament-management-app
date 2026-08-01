import { useSyncExternalStore } from 'react';

/**
 * 一定間隔で更新される現在時刻(ms)を返す。
 * 経過時間・「◯秒前に更新」などの相対表示に使う。
 *
 * useState + Date.now() だとレンダー中に不純な関数を呼ぶことになるため、
 * 外部ストアとして購読する形にしている（値は intervalMs 単位に丸めるので
 * 同じティックの間は必ず同じ値が返り、再レンダーのループにならない）。
 */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  );
}
