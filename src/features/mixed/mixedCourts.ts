import { useMemo } from 'react';
import { useMixedStore } from './mixedStore';

/** 使用コート未設定時の既定（全面 1〜16） */
export const DEFAULT_MIXED_COURT_NUMBERS = Array.from({ length: 16 }, (_, i) => i + 1);

/**
 * 使用コート指定（"1,2,3" 形式）をコート番号の配列へ変換する。
 * 未設定・解析不能な場合は既定（1〜16）を返す。
 */
export function parseCourtNumbers(value?: string | null): number[] {
  const nums = (value ?? '').match(/\d+/g);
  if (!nums) return DEFAULT_MIXED_COURT_NUMBERS;
  const uniq = [...new Set(nums.map(n => parseInt(n, 10)))].filter(n => n > 0).sort((a, b) => a - b);
  return uniq.length > 0 ? uniq : DEFAULT_MIXED_COURT_NUMBERS;
}

/** コート番号配列 → コート名配列 ("1コート" 形式) */
export function courtNumbersToNames(nums: number[]): string[] {
  return nums.map(n => `${n}コート`);
}

/** 大会設定で選んだ使用コートの番号一覧（未設定なら全面） */
export function useMixedCourtNumbers(): number[] {
  const courtNames = useMixedStore(s => s.tournamentInfo?.courtNames);
  return useMemo(() => parseCourtNumbers(courtNames), [courtNames]);
}

/** 大会設定で選んだ使用コートの名前一覧 ("1コート" 形式) */
export function useMixedCourtNames(): string[] {
  const numbers = useMixedCourtNumbers();
  return useMemo(() => courtNumbersToNames(numbers), [numbers]);
}
