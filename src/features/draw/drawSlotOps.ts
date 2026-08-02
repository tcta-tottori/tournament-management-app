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
    const { position: _position, ...rest } = s;
    return rest as Content<T>;
  });
}

/** 中身の並びを枠へ戻す（position は元のまま） */
function applyContents<T extends SlotLike>(slots: T[], contents: Content<T>[]): T[] {
  return slots.map((s, i) => ({ ...contents[i], position: s.position } as T));
}

/** 空き枠の中身を作る（氏名などの表示用フィールドがある形にも合わせる） */
function emptyContent<T extends SlotLike>(sample: T): Content<T> {
  const { position: _position, ...rest } = sample;
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

  let j = -1;
  for (let k = i; k < slots.length; k++) {
    // 指定位置そのものが空き枠のときは、その次以降の空き枠を使う
    if (k === i && isEmptySlot(slots[k])) continue;
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
