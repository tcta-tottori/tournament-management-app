import { useState } from 'react';

/** 使用コートのプリセット */
export const STANDARD_COURTS = Array.from({ length: 16 }, (_, i) => String(i + 1)).join(','); // 1〜16
export const RANGE5_COURTS = Array.from({ length: 12 }, (_, i) => String(i + 5)).join(',');    // 5〜16

/**
 * 使用コート選択（ボタン式）。
 * - 標準: 1〜16番コート
 * - 5〜16番コート
 * - その他: カンマ区切りで自由指定
 */
export default function CourtSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customOverride, setCustomOverride] = useState(false);
  const norm = value.replace(/[\s、]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
  const isStandard = norm === STANDARD_COURTS;
  const isRange5 = norm === RANGE5_COURTS;
  const mode: 'standard' | 'range5' | 'custom' =
    customOverride ? 'custom' : isStandard ? 'standard' : isRange5 ? 'range5' : 'custom';

  const btn = (active: boolean) =>
    `flex-1 px-2 py-2 text-xs font-bold rounded-lg border transition-all ${
      active
        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
    }`;

  return (
    <div>
      <label className="text-[11px] font-medium text-gray-500 block mb-1">使用コート</label>
      <div className="flex gap-2">
        <button type="button" className={btn(mode === 'standard')}
          onClick={() => { setCustomOverride(false); onChange(STANDARD_COURTS); }}>
          全面<span className="block text-[9px] font-normal opacity-80">1〜16面</span>
        </button>
        <button type="button" className={btn(mode === 'range5')}
          onClick={() => { setCustomOverride(false); onChange(RANGE5_COURTS); }}>
          12面<span className="block text-[9px] font-normal opacity-80">5〜16面</span>
        </button>
        <button type="button" className={btn(mode === 'custom')}
          onClick={() => setCustomOverride(true)}>
          その他<span className="block text-[9px] font-normal opacity-80">個別指定</span>
        </button>
      </div>
      {mode === 'custom' && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="例: 5,6,7,8,9,10,11,12,13,14,15,16"
          className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all"
        />
      )}
    </div>
  );
}
