// =============================================
// クラス（種目）の並び順
// ---------------------------------------------
// 大会運営の感覚に合わせて、次の順で並べる。
//   1. 男子 → 女子 → その他（ミックスなど）
//   2. 各性別の中は「アルファベットのクラス（A級・B級…）」が先、
//      その後に「年齢のクラス（45歳・55歳…）」
//   3. 同じ種類の中は A→B→C、45→55→65 の昇順
// 例: 男子A級, 男子B級, 男子C級, 男子45歳, 男子55歳, 男子65歳, 女子A級, 女子B級 …
// =============================================

/** 男子=0 / 女子=1 / その他=2 */
function genderRank(name: string): number {
  if (/女子|女性|レディース/.test(name)) return 1;
  if (/男子|男性/.test(name)) return 0;
  // ミックス・混合などは最後
  return 2;
}

/** アルファベットのクラス（A級・B級…）を拾う。無ければ null */
function alphaClass(name: string): string | null {
  // 「A級」「Ａ級」のような表記を優先し、無ければ「男子A」のような並びを見る
  const m = name.match(/([A-Za-zＡ-Ｚａ-ｚ])\s*級/);
  if (m) return toHalfUpper(m[1]);
  const m2 = name.match(/(?:男子|女子|一般)\s*(?:シングルス|ダブルス)?\s*([A-Za-zＡ-Ｚａ-ｚ])(?![A-Za-zＡ-Ｚａ-ｚ])/);
  return m2 ? toHalfUpper(m2[1]) : null;
}

/** 年齢のクラス（45歳・55歳以上…）を拾う。無ければ null */
function ageClass(name: string): number | null {
  const m = name.match(/(\d{2})\s*(?:歳|才)/);
  if (m) return Number(m[1]);
  // 「男子45」「45D」のように歳が省かれている表記も拾う
  const m2 = name.match(/(?<!\d)(35|40|45|50|55|60|65|70|75|80)(?!\d)/);
  return m2 ? Number(m2[1]) : null;
}

function toHalfUpper(ch: string): string {
  const c = ch.charCodeAt(0);
  // 全角英字を半角に直してから大文字にする
  const half = c >= 0xff21 && c <= 0xff5a ? String.fromCharCode(c - 0xfee0) : ch;
  return half.toUpperCase();
}

/** 並べ替え用のキー。小さいほど先に並ぶ */
export function eventSortKey(name: string): [number, number, number, string] {
  const g = genderRank(name);
  const alpha = alphaClass(name);
  if (alpha) return [g, 0, alpha.charCodeAt(0), name];
  const age = ageClass(name);
  if (age != null) return [g, 1, age, name];
  return [g, 2, 0, name];
}

/** 種目名どうしを比較する（Array.prototype.sort に渡す） */
export function compareEventName(a: string, b: string): number {
  const ka = eventSortKey(a || '');
  const kb = eventSortKey(b || '');
  for (let i = 0; i < 3; i++) {
    if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
  }
  return String(ka[3]).localeCompare(String(kb[3]), 'ja');
}

/** name を持つ種目の配列を、上の規則で並べ替えた新しい配列にして返す */
export function sortEventsByClass<T extends { name?: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => compareEventName(a.name || '', b.name || ''));
}
