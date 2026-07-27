import type { RoundGameRule } from '../../db/database';
import type { HeatRulePattern } from '../../stores/appStore';

/**
 * 熱中症警戒時の試合形式を回戦ルール配列へ付与する。
 * - roundGameRules が空の場合は「全回戦」の既定ルールを1件作成してから付与する。
 * - pattern.enabled が false の場合は heat* を除去（元の通常ルールのみ）。
 */
export function applyHeatToRules(
  base: RoundGameRule[] | undefined,
  defaultGames: number,
  pattern: HeatRulePattern,
): RoundGameRule[] | undefined {
  let rules: RoundGameRule[] = base && base.length > 0 ? base.map(r => ({ ...r })) : [];

  if (!pattern.enabled) {
    // 無効時は heat* を除去。元が空なら undefined のまま。
    if (rules.length === 0) return base && base.length > 0 ? base : undefined;
    return rules.map(r => {
      const next = { ...r };
      delete next.heatRuleText;
      delete next.heatGames;
      delete next.heatMatchFormat;
      return next;
    });
  }

  if (rules.length === 0) {
    rules = [{
      roundLabel: '全回戦',
      ruleText: `${defaultGames}ゲームマッチ（${defaultGames}-${defaultGames}タイブレーク）`,
      games: defaultGames,
    }];
  }

  const heatText = pattern.ruleText.trim() || `${pattern.games}ゲームマッチ`;
  for (const r of rules) {
    r.heatRuleText = heatText;
    r.heatGames = pattern.games;
    r.heatMatchFormat = pattern.matchFormat;
  }
  return rules;
}

interface Props {
  value: HeatRulePattern;
  onChange: (pattern: Partial<HeatRulePattern>) => void;
}

/** 熱中症警戒時の試合形式を指定する入力UI（一括読込・エントリー確定で共用） */
export default function HeatRulePatternInput({ value, onChange }: Props) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2.5">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={e => onChange({ enabled: e.target.checked })}
          className="w-4 h-4 accent-red-500"
        />
        <span className="text-sm font-bold text-red-700">🌡 熱中症警戒アラート時の試合形式を設定する</span>
      </label>
      <p className="text-[11px] text-red-600/80 leading-snug">
        設定すると全種目・全回戦に熱中症時パターンとして付与され、審判用紙に通常形式と併記されます。回戦ごとの個別変更は「対戦順」画面の試合ルール編集から行えます。
      </p>
      {value.enabled && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 font-medium">ルール</label>
            <input
              type="text"
              value={value.ruleText}
              onChange={e => {
                const text = e.target.value;
                const gMatch = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)).match(/(\d+)\s*ゲーム/);
                onChange(gMatch ? { ruleText: text, games: parseInt(gMatch[1]) } : { ruleText: text });
              }}
              placeholder="例: 6ゲームマッチ（ノーアドバンテージ）"
              className="w-full text-sm border border-red-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-200 outline-none"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 font-medium">ゲーム数</label>
              <input
                type="number"
                min={1}
                max={12}
                value={value.games}
                onChange={e => onChange({ games: parseInt(e.target.value) || 6 })}
                className="w-16 text-sm text-center border border-red-200 rounded-lg px-2 py-1 bg-white focus:border-red-400 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 font-medium">方式</label>
              <select
                value={value.matchFormat}
                onChange={e => onChange({ matchFormat: e.target.value as 'game' | 'twoSetsSuper10' })}
                className="text-xs border border-red-200 rounded-lg px-2 py-1 bg-white focus:border-red-400 outline-none"
              >
                <option value="game">ゲームマッチ</option>
                <option value="twoSetsSuper10">2セット+STB</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
