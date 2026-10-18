// =============================================
// 結果画像（トーナメント表形式）の優勝者表示名の入力欄
// 状態と保存は useChampionName が持つ。
// =============================================

import { RotateCcw } from 'lucide-react';

interface Props {
  draft: string;
  onChange: (value: string) => void;
}

/** 優勝者の表示名の入力欄（空欄なら自動表示） */
export function ChampionNameField({ draft, onChange }: Props) {
  return (
    <div className="px-3 sm:px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
      <label className="text-[10px] font-semibold text-gray-700/70 block mb-1">
        優勝者の表示名（空欄なら苗字を自動表示）
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => onChange(e.target.value)}
          placeholder="例: 山本・平木"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] font-medium bg-gray-50/40 focus:bg-white focus:border-gray-400 focus:ring-[3px] focus:ring-gray-500/10 outline-none transition-all"
        />
        <button
          onClick={() => onChange('')}
          disabled={!draft}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors active:scale-95"
          title="自動表示に戻す"
        >
          <RotateCcw size={13} />
          自動に戻す
        </button>
      </div>
    </div>
  );
}
