// =============================================
// ドローの枠（スロット）並べ替え操作
//
// トーナメント表は「4枠ずつのまとまり」で2回戦の相手が決まる。
//   枠1-2 の勝者 と 枠3-4 の勝者 が2回戦で対戦
// 手書きのドロー表では「7・8の勝者と9が2回戦で当たる」のような
// 3人のまとまりがよくあり、これは枠を [7, 8, 9, 空き] と並べることで表せる。
//
// 取り込んだドローは選手が詰めて並ぶため、この形にするには
// 「途中に空き枠を差し込んで以降を1つずつ下へずらす」操作が要る。
// ここではその操作を純粋関数として提供する（選手が消えないよう、
// ずらしに使う空き枠は必ずドロー内のどこかから持ってくる）。
// =============================================

/**
 * 並べ替えの対象となる枠。
 * ドローの保存形（position/entryId/seed/isBye）と、
 * 表示用の DrawSlotData（氏名・所属つき）の両方をそのまま扱える。
 */
export interface SlotLike {
  position: number;
  entryId: string | null;
  seed: number;
  isBye: boolean;
  name?: string;
  affiliation?: string;
}

/** 空き枠（BYE）か */
export function isEmptySlot(slot: SlotLike): boolean {
  return slot.isBye || !slot.entryId;
}

/** 枠の中身（position 以外のすべて） */
type Content<T> = Omit<T, 'position'>;

/** 枠の中身だけを取り出す（position は動かさない） */
function contentsOf<T extends SlotLike>(slots: T[]): Content<T>[] {
  return slots.map(s => {
    const rest = { ...(s as object) } as Record<string, unknown>;
    delete rest.position;
    return rest as Content<T>;
  });
}

/** 中身の並びを枠へ戻す（position は元のまま） */
function applyContents<T extends SlotLike>(slots: T[], contents: Content<T>[]): T[] {
  return slots.map((s, i) => ({ ...contents[i], position: s.position } as T));
}

/** 空き枠の中身を作る（氏名などの表示用フィールドがある形にも合わせる） */
function emptyContent<T extends SlotLike>(sample: T): Content<T> {
  const rest = { ...(sample as object) } as Record<string, unknown>;
  delete rest.position;
  return {
    ...rest,
    entryId: null,
    seed: 0,
    isBye: true,
    ...('name' in rest ? { name: 'BYE' } : {}),
    ...('affiliation' in rest ? { affiliation: '' } : {}),
  } as Content<T>;
}

/** 2つの枠の中身を入れ替える */
export function swapSlotContents<T extends SlotLike>(slots: T[], posA: number, posB: number): T[] {
  if (posA === posB) return slots;
  const a = slots.findIndex(s => s.position === posA);
  const b = slots.findIndex(s => s.position === posB);
  if (a < 0 || b < 0) return slots;
  const contents = contentsOf(slots);
  const tmp = contents[a];
  contents[a] = contents[b];
  contents[b] = tmp;
  return applyContents(slots, contents);
}

export interface InsertGapResult<T extends SlotLike> {
  slots: T[];
  /** ずらせなかった理由（成功時は null） */
  error: string | null;
}

/**
 * 指定位置に空き枠を差し込み、そこから下を1つずつずらす。
 *
 * ずらすのに使う空き枠は、その位置より下にある最初の空き枠から持ってくる。
 * （ドロー全体を動かさずに済み、選手が押し出されて消えることもない）
 * 指定位置が既に空き枠の場合は、さらに下の空き枠を持ってきて空きを2つにする。
 */
export function insertGapAt<T extends SlotLike>(slots: T[], position: number): InsertGapResult<T> {
  const i = slots.findIndex(s => s.position === position);
  if (i < 0) return { slots, error: '対象の枠が見つかりません' };

  // 指定位置から続いている空き枠は「すでに空けた分」なので飛ばし、
  // その先にある空き枠を持ってくる（同じ位置で続けて実行すると空きが増えていく）
  let k = i;
  while (k < slots.length && isEmptySlot(slots[k])) k++;
  let j = -1;
  for (; k < slots.length; k++) {
    if (isEmptySlot(slots[k])) { j = k; break; }
  }
  if (j < 0) {
    return { slots, error: 'この位置より下に空き枠が無いため、ずらせません。' };
  }

  const contents = contentsOf(slots);
  contents.splice(j, 1);
  contents.splice(i, 0, emptyContent(slots[i]));
  return { slots: applyContents(slots, contents), error: null };
}

/**
 * 指定した空き枠を詰めて、そこから下を1つずつ上へ上げる。
 * 空いた分の枠はドローの末尾へ回す。
 */
export function removeGapAt<T extends SlotLike>(slots: T[], position: number): T[] {
  const i = slots.findIndex(s => s.position === position);
  if (i < 0 || !isEmptySlot(slots[i])) return slots;
  const contents = contentsOf(slots);
  contents.splice(i, 1);
  contents.push(emptyContent(slots[i]));
  return applyContents(slots, contents);
}

/**
 * 枠 position が属する「2回戦の相手が決まる4枠のまとまり」の先頭位置。
 * 表示のグループ分けや説明に使う。
 */
export function blockStartOf(position: number): number {
  return Math.floor((position - 1) / 4) * 4 + 1;
}

// =============================================
// 4枠のまとまりの「型」
//
// 手書きのドロー表は、4枠ずつのまとまりが次のどれかになっている。
// まとまりの型を上から順に選んでいけば、ドロー表と同じ並びを作れる。
// =============================================

export type BlockPattern = 'four' | 'trioBottom' | 'trioTop' | 'two' | 'one' | 'none';

/** 型ごとの枠の使い方（true = 選手が入る） */
const BLOCK_MASKS: Record<BlockPattern, boolean[]> = {
  four: [true, true, true, true],           // 2試合（それぞれの勝者が2回戦）
  trioBottom: [true, true, true, false],    // 3人: 上2人が1回戦 → 勝者と3人目が2回戦
  trioTop: [true, false, true, true],       // 3人: 下2人が1回戦 → 勝者と1人目が2回戦
  two: [true, true, false, false],          // 1試合（勝者は次の回戦から）
  one: [true, false, false, false],         // 1人（2回戦から登場）
  none: [false, false, false, false],       // 空き
};

export const BLOCK_PATTERN_LABELS: Record<BlockPattern, string> = {
  four: '4人（2試合）',
  trioBottom: '3人（下が2回戦から）',
  trioTop: '3人（上が2回戦から）',
  two: '2人（1試合）',
  one: '1人（2回戦から）',
  none: '空き',
};

/** 並びから、そのまとまりが今どの型かを判定する（当てはまらなければ null） */
export function blockPatternOf<T extends SlotLike>(slots: T[], blockStart: number): BlockPattern | null {
  const i = slots.findIndex(s => s.position === blockStart);
  if (i < 0) return null;
  const mask = [0, 1, 2, 3].map(k => {
    const s = slots[i + k];
    return !!s && !isEmptySlot(s);
  });
  for (const [key, m] of Object.entries(BLOCK_MASKS)) {
    if (m.every((v, k) => v === mask[k])) return key as BlockPattern;
  }
  return null;
}

export interface ApplyBlockResult<T extends SlotLike> {
  slots: T[];
  error: string | null;
}

/** まとめ指定で使う短い記号 */
const PATTERN_TOKENS: Record<string, BlockPattern> = {
  '4': 'four', '4人': 'four',
  '3下': 'trioBottom', '3': 'trioBottom',
  '3上': 'trioTop',
  '2': 'two', '2人': 'two',
  '1': 'one', '1人': 'one',
  '0': 'none', '空': 'none', '空き': 'none', '-': 'none', 'ー': 'none',
};

const PATTERN_TO_TOKEN: Record<BlockPattern, string> = {
  four: '4', trioBottom: '3下', trioTop: '3上', two: '2', one: '1', none: '空',
};

/**
 * まとまりの型を並べた文字列を解釈する。
 * 例: "4,空,2,3下,4,空,2,3下,3上,2,4,空,3上,2,4,空"
 */
export function parseBlockPatterns(text: string): { patterns: BlockPattern[]; error: string | null } {
  const tokens = text
    .replace(/[，、]/g, ',')
    .split(/[,\s/]+/)
    .map(t => t.trim())
    .filter(Boolean);
  const patterns: BlockPattern[] = [];
  for (const t of tokens) {
    const p = PATTERN_TOKENS[t];
    if (!p) return { patterns: [], error: `「${t}」は型として読み取れません（4 / 3下 / 3上 / 2 / 1 / 空）` };
    patterns.push(p);
  }
  if (patterns.length === 0) return { patterns: [], error: '型が指定されていません' };
  return { patterns, error: null };
}

/** 現在の並びを、まとまりの型の並びとして書き出す */
export function describeBlockPatterns<T extends SlotLike>(slots: T[]): string {
  const out: string[] = [];
  for (let p = 1; p <= slots.length; p += 4) {
    const pattern = blockPatternOf(slots, p);
    out.push(pattern ? PATTERN_TO_TOKEN[pattern] : '?');
  }
  return out.join(',');
}

/** まとまりの型を上から順にまとめて適用する */
export function applyBlockPatterns<T extends SlotLike>(
  slots: T[], patterns: BlockPattern[],
): ApplyBlockResult<T> {
  let cur = slots;
  for (let i = 0; i < patterns.length; i++) {
    const blockStart = i * 4 + 1;
    if (blockStart > slots.length) {
      return { slots, error: `ドローの枠数（${slots.length}）より多くの型が指定されています` };
    }
    const r = applyBlockPattern(cur, blockStart, patterns[i]);
    if (r.error) return { slots, error: `${blockStart}〜${blockStart + 3}: ${r.error}` };
    cur = r.slots;
  }
  return { slots: cur, error: null };
}

/**
 * まとまりの型を適用する。
 *
 * そのまとまり以降の選手を順番どおりに取り出し、選んだ型で並べ直す。
 * 残った選手は以降の枠へ順に詰め直すので、上のまとまりから順に型を
 * 選んでいけば、ドロー表と同じ並びになる。
 */
export function applyBlockPattern<T extends SlotLike>(
  slots: T[], blockStart: number, pattern: BlockPattern,
): ApplyBlockResult<T> {
  const i = slots.findIndex(s => s.position === blockStart);
  if (i < 0) return { slots, error: '対象のまとまりが見つかりません' };

  const contents = contentsOf(slots);
  const empty = emptyContent(slots[i]);
  const isEmptyContent = (c: Content<T>) => {
    const v = c as unknown as { entryId: string | null; isBye: boolean };
    return v.isBye || !v.entryId;
  };

  const rest = contents.slice(i).filter(c => !isEmptyContent(c));
  const next: Content<T>[] = contents.slice(0, i);
  let p = 0;
  for (const usePlayer of BLOCK_MASKS[pattern]) {
    next.push(usePlayer && p < rest.length ? rest[p++] : { ...empty });
  }
  while (next.length < slots.length) {
    next.push(p < rest.length ? rest[p++] : { ...empty });
  }
  if (p < rest.length) {
    return { slots, error: 'この型にすると選手が入りきりません。' };
  }
  return { slots: applyContents(slots, next), error: null };
}
