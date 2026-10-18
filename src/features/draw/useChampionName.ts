// =============================================
// 結果画像（トーナメント表形式）の優勝者表示名の編集欄
//
// 優勝者は既定で「苗字・苗字」を自動で出すが、氏名に空白がなく苗字を
// 切り出せない場合などに、画像に印字する名前をこの場で直せるようにする。
// 編集した名前は種目と優勝者ごとに保存し、次に開いたときも使う
// （優勝者が変わったら自動表示に戻る）。
// =============================================

import { useEffect, useState } from 'react';

const KEY_PREFIX = 'championName:';

function load(key: string): string {
  try {
    return localStorage.getItem(KEY_PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

function save(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(KEY_PREFIX + key, value);
    else localStorage.removeItem(KEY_PREFIX + key);
  } catch {
    // 保存できなくてもこの場の表示には反映される
  }
}

/**
 * 優勝者の表示名（編集中の値と、描画へ渡す確定値）。
 * storageKey は「種目＋優勝者」で一意になるものを渡す。優勝者が未確定なら null。
 */
export function useChampionName(storageKey: string | null, isOpen: boolean) {
  const [state, setState] = useState(() => {
    const stored = storageKey ? load(storageKey) : '';
    return { key: storageKey, draft: stored, applied: stored };
  });
  // 優勝者（＝保存キー）が変わったら、その優勝者用に保存した名前へ切り替える
  if (state.key !== storageKey) {
    const stored = storageKey ? load(storageKey) : '';
    setState({ key: storageKey, draft: stored, applied: stored });
  }

  // 入力が落ち着いたらプレビューへ反映して保存する（1文字ごとの再描画を避ける）
  const { draft } = state;
  useEffect(() => {
    if (!isOpen || !storageKey) return;
    const timer = setTimeout(() => {
      const next = draft.trim();
      setState(s => (s.key === storageKey ? { ...s, applied: next } : s));
      save(storageKey, next);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, isOpen, storageKey]);

  const setDraft = (value: string) => setState(s => ({ ...s, draft: value }));
  return { draft, setDraft, championName: storageKey ? state.applied : '' };
}
