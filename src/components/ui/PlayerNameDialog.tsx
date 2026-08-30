// =============================================================================
// 選手名の修正ポップアップ
//
// エントリー確定後（対戦表を作ったあと）でも、ドロー画面から氏名・ふりがな・所属を
// 直せるようにするためのダイアログ。取り込んだドロー表の誤字や、当日の選手変更に使う。
// 保存すると選手マスタと、対戦表に写してある名前の両方を更新する。
// =============================================================================

import { useState } from 'react';
import { UserPen, X } from 'lucide-react';
import type { Player } from '../../db/database';
import { updatePlayerProfile } from '../../features/draw/playerNameEdit';

export interface PlayerNameTarget {
  /** ドロー番号（表示用） */
  drawNumber?: number;
  /** 修正対象の選手（ダブルスは2人） */
  players: Player[];
}

interface Props {
  target: PlayerNameTarget;
  onClose: () => void;
  /** 保存後に呼ばれる（対戦表の再読込などに使う） */
  onSaved?: () => void;
}

type Form = { playerId: string; name: string; furigana: string; affiliation: string };

export default function PlayerNameDialog({ target, onClose, onSaved }: Props) {
  const [forms, setForms] = useState<Form[]>(
    target.players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      furigana: p.furigana || '',
      affiliation: p.affiliation || '',
    })),
  );
  const [saving, setSaving] = useState(false);

  const patch = (i: number, next: Partial<Form>) =>
    setForms(prev => prev.map((f, idx) => (idx === i ? { ...f, ...next } : f)));

  const handleSave = async () => {
    if (forms.some(f => !f.name.trim())) {
      alert('氏名を入力してください。');
      return;
    }
    setSaving(true);
    try {
      await updatePlayerProfile(forms);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPen className="w-5 h-5" />
            <div>
              <h3 className="text-sm font-bold">選手名の修正</h3>
              <p className="text-[10px] text-white/70">
                {target.drawNumber ? `ドロー番号 ${target.drawNumber}` : 'エントリー確定後でも修正できます'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
          {forms.map((f, i) => (
            <div key={f.playerId} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              {forms.length > 1 && (
                <div className="text-[10px] font-bold text-gray-500">{i === 0 ? '選手1' : '選手2（ペア）'}</div>
              )}
              <div>
                <label className="text-[10px] text-gray-500 font-medium">氏名</label>
                <input
                  type="text"
                  value={f.name}
                  onChange={e => patch(i, { name: e.target.value })}
                  placeholder="山田 太郎"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">ふりがな（コール用）</label>
                  <input
                    type="text"
                    value={f.furigana}
                    onChange={e => patch(i, { furigana: e.target.value })}
                    placeholder="やまだ たろう"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">所属</label>
                  <input
                    type="text"
                    value={f.affiliation}
                    onChange={e => patch(i, { affiliation: e.target.value })}
                    placeholder="◯◯テニスクラブ"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-500 leading-snug">
            保存すると、ドロー・対戦表・コールの表示がすべて新しい名前に変わります
            （同じ選手が出ている他の種目にも反映されます）。
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
            className="px-4 py-2 text-xs font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
