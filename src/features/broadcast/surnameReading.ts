// =============================================================================
// 苗字（漢字）と、その読み（ひらがな）を求めるための共通ロジック。
//
// コールは「苗字のみ」で読み上げるため、
//   1) フルネームから苗字だけを取り出す
//   2) 苗字だけの読み（ふりがな）を求める
// の2つが必要になる。選手名簿のふりがなは「たなかよしひろ」のように
// 苗字と名前が繋がっていることが多く、そのままでは苗字だけにできない。
// =============================================================================

import { FURIGANA_SEED } from '../../db/seedData';
import { kataToHira } from './callTextBuilder';

/**
 * 同じ苗字の読みの最長共通接頭辞（LCP）を苗字の読みとして採用する。
 * 異なる読みが2種以上ある場合のみ採用する（1種だと名前まで含んでしまうため）。
 * 例: 「田中」の選手が「たなかよしひろ」「たなかまさし」→ 共通「たなか」
 */
function lcpOf(readings: string[]): string {
  if (readings.length < 2) return '';
  let lcp = readings[0];
  for (const r of readings) {
    let i = 0;
    while (i < lcp.length && i < r.length && lcp[i] === r[i]) i++;
    lcp = lcp.slice(0, i);
    if (!lcp) break;
  }
  const distinct = new Set(readings);
  return (lcp.length >= 1 && distinct.size >= 2) ? lcp : '';
}

/** スペース区切りのフルネームから苗字を取り出す（区切りが無ければ空） */
function splitSurname(name: string): string {
  const n = (name || '').replace(/\u3000/g, ' ').trim();
  if (!n) return '';
  const parts = n.split(/\s+/);
  return parts.length > 1 ? parts[0] : '';
}

/**
 * フルネームから苗字のみを取り出す。
 *
 * - スペース（全角・半角）があればその前を苗字とする
 * - 区切りが無い「西山英汰」形式は、既知の苗字（選手名簿・全国名簿）と
 *   前方一致するものを長い順に探す。見つからなければ先頭2文字を苗字とみなす。
 */
export function extractSurname(fullName: string, knownSurnames?: Set<string>): string {
  const n = (fullName || '').replace(/\u3000/g, ' ').trim();
  if (!n) return fullName || '';
  const split = splitSurname(n);
  if (split) return split;
  if (n.length <= 2) return n;
  if (knownSurnames) {
    // 「佐々木」のような3文字姓を2文字で切ってしまわないよう、長い方から照合する
    for (let len = Math.min(4, n.length - 1); len >= 2; len--) {
      const head = n.slice(0, len);
      if (knownSurnames.has(head)) return head;
    }
  }
  return n.slice(0, 2);
}

/** 名簿（スペース区切りの氏名）から既知の苗字セットを作る */
export function collectKnownSurnames(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const s = splitSurname(name);
    if (s) set.add(s);
  }
  return set;
}

/**
 * 苗字（漢字）→ 苗字の読み（ひらがな）の推定マップを作る。
 *
 * 1) 渡された名簿の同姓者の読みの最長共通接頭辞から推定
 * 2) 解決できなかった苗字は全国名簿（FURIGANA_SEED）から同様に推定
 */
export function buildSurnameReadingMap(
  people: { name: string; furigana?: string }[],
): Record<string, string> {
  const groups = new Map<string, string[]>();
  const surnames = new Set<string>();
  for (const p of people) {
    const surname = splitSurname(p.name);
    if (!surname) continue;
    surnames.add(surname);
    const reading = kataToHira((p.furigana || '').trim());
    if (!reading) continue;
    const arr = groups.get(surname);
    if (arr) arr.push(reading); else groups.set(surname, [reading]);
  }

  const map: Record<string, string> = {};
  for (const [surname, readings] of groups) {
    const lcp = lcpOf(readings);
    if (lcp) map[surname] = lcp;
  }

  // 全国名簿は「漢字フルネーム(スペース無)」→「かなフルネーム(スペース無)」。
  // 対象の苗字で前方一致する同姓者を集め、その読みのLCPを苗字読みとする。
  for (const s of surnames) {
    if (map[s]) continue;
    const readings: string[] = [];
    for (const [name, furi] of FURIGANA_SEED) {
      if (name.length > s.length && name.startsWith(s)) readings.push(kataToHira(furi));
    }
    const lcp = lcpOf(readings);
    if (lcp) map[s] = lcp;
  }
  return map;
}

/**
 * 苗字（漢字）1つについて、全国名簿から読みを推定する。
 * `buildSurnameReadingMap` で解決できなかった苗字の後追い解決に使う。
 */
export function estimateSurnameReading(surname: string): string {
  if (!surname) return '';
  const readings: string[] = [];
  for (const [name, furi] of FURIGANA_SEED) {
    if (name.length > surname.length && name.startsWith(surname)) readings.push(kataToHira(furi));
  }
  return lcpOf(readings);
}
