// =============================================================================
// ゲームルール編集ポップアップ
//
// 種目の回戦別ルール（「1～2回戦 8ゲームマッチ」「準々決勝以降 6ゲームマッチ」等）を
// その場で直すためのダイアログ。ドロー画面・対戦順シートのどちらから開いても
// 同じ操作になるよう、共通コンポーネントにしている。
//
// スコア入力ダイアログの上からも開くため、重なり順は他のダイアログより上にしている。
//
// 保存すると Event.roundGameRules と、既定のゲーム数（Event.gameRules）を更新する。
// 以降のスコア入力・審判用紙・コール表示は保存したルールで動く。
// =============================================================================

import { useState } from 'react';
import { BookOpen, Plus, Trash2, X } from 'lucide-react';
import { db, type Event, type MatchFormatType, type RoundGameRule } from '../../db/database';

interface Props {
  /** 編集対象の種目 */
  event: Event;
  onClose: () => void;
}

/** ルール文から「Nゲーム」を拾う（全角数字も見る） */
function gamesFromText(text: string): number | null {
  const normalized = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
  const m = normalized.match(/(\d+)\s*ゲーム/);
  return m ? parseInt(m[1], 10) : null;
}

/** 未設定の種目に出す初期ルール（既定のゲーム数から組み立てる） */
function initialRulesOf(evt: Event): RoundGameRule[] {
  if (evt.roundGameRules?.length) return [...evt.roundGameRules];
  const g = evt.gameRules?.games ?? 6;
  return [{ roundLabel: '全回戦', ruleText: `${g}ゲームマッチ（${g}-${g}タイブレーク）`, games: g }];
}

export default function GameRulesDialog({ event, onClose }: Props) {
  const [rules, setRules] = useState<RoundGameRule[]>(() => initialRulesOf(event));
  const [saving, setSaving] = useState(false);

  const patch = (i: number, next: Partial<RoundGameRule>) => {
    setRules(prev => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
  };

  const handleSave = async () => {
    if (event.id == null) return;
    setSaving(true);
    try {
      const defaultGames = rules.length > 0 ? rules[0].games : 6;
      await db.events.update(event.id, {
        roundGameRules: rules,
        gameRules: { ...event.gameRules, games: defaultGames, tiebreakPoint: defaultGames },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            <div>
              <h3 className="text-sm font-bold">ゲームルール編集</h3>
              <p className="text-[10px] text-white/70">{event.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-1 space-y-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">適用範囲</label>
                  <input
                    type="text"
                    value={rule.roundLabel}
                    onChange={e => patch(i, { roundLabel: e.target.value })}
                    placeholder="例: 全回戦, 1～2回戦, 準決勝以降"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">ルール</label>
                  <input
                    type="text"
                    value={rule.ruleText}
                    onChange={e => {
                      const text = e.target.value;
                      patch(i, { ruleText: text, games: gamesFromText(text) ?? rule.games });
                    }}
                    placeholder="例: 8ゲームマッチ（8-8タイブレーク）"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 font-medium">ゲーム数</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={rule.games}
                      onChange={e => patch(i, { games: parseInt(e.target.value) || 6 })}
                      className="w-16 text-sm text-center border border-gray-200 rounded-lg px-2 py-1 focus:border-primary-400 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 font-medium">方式</label>
                    <select
                      value={rule.matchFormat || 'game'}
                      onChange={e => patch(i, { matchFormat: e.target.value as MatchFormatType })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:border-primary-400 outline-none"
                    >
                      <option value="game">ゲームマッチ</option>
                      <option value="twoSetsSuper10">2セット+STB</option>
                    </select>
                  </div>
                </div>
                {/* 熱中症警戒アラート時の試合形式（任意） */}
                <div className="mt-1 pt-2 border-t border-dashed border-red-200 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-red-600">🌡 熱中症警戒時の試合形式（任意）</span>
                  </div>
                  <input
                    type="text"
                    value={rule.heatRuleText ?? ''}
                    onChange={e => {
                      const text = e.target.value;
                      patch(i, { heatRuleText: text, heatGames: gamesFromText(text) ?? rule.heatGames });
                    }}
                    placeholder="例: 6ゲームマッチ（ノーアドバンテージ）"
                    className="w-full text-sm border border-red-200 rounded-lg px-2.5 py-1.5 focus:border-red-400 focus:ring-2 focus:ring-red-200 outline-none"
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 font-medium">ゲーム数</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={rule.heatGames ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          patch(i, { heatGames: v === '' ? undefined : (parseInt(v) || undefined) });
                        }}
                        placeholder="-"
                        className="w-16 text-sm text-center border border-red-200 rounded-lg px-2 py-1 focus:border-red-400 outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 font-medium">方式</label>
                      <select
                        value={rule.heatMatchFormat || 'game'}
                        onChange={e => patch(i, { heatMatchFormat: e.target.value as MatchFormatType })}
                        className="text-xs border border-red-200 rounded-lg px-2 py-1 focus:border-red-400 outline-none"
                      >
                        <option value="game">ゲームマッチ</option>
                        <option value="twoSetsSuper10">2セット+STB</option>
                      </select>
                    </div>
                    {(rule.heatRuleText || rule.heatGames) && (
                      <button
                        onClick={() => patch(i, { heatRuleText: undefined, heatGames: undefined, heatMatchFormat: undefined })}
                        className="text-[10px] text-red-500 hover:text-red-700 underline"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {rules.length > 1 && (
                <button
                  onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setRules([...rules, { roundLabel: '', ruleText: '', games: 6 }])}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-gray-700 border border-dashed border-primary-300 rounded-xl hover:bg-primary-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            ルールを追加
          </button>

          <p className="text-[10px] text-gray-500 leading-snug">
            保存すると、この種目のスコア入力・審判用紙・コール表示に反映されます
            （入力済みのスコアはそのままです）。
          </p>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-white bg-primary-500 rounded-lg hover:bg-primary-600 shadow-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
