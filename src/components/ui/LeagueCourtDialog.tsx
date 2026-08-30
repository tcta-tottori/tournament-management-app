// =============================================================================
// リーグの使用コート割り当てポップアップ
//
// リーグ戦は1〜2面を固定で使って総当たりを回すため、試合ごとにコートを選ぶのでは
// なく、リーグ単位で使うコートをここで決める。決めたコートはそのリーグの専有に
// なり、他の種目の「入るコート」候補からは外れる。
//
// 並びはコート状況・コート選択ダイアログに合わせて4面ごとのブロックにする。
// =============================================================================

import { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { MAX_LEAGUE_COURTS } from '../../features/draw/leagueCourts';

export interface LeagueCourtOption {
  courtId: string;
  name: string;
  /** 使用しないコート（コート設定でOFF） */
  unavailable?: boolean;
  /** 他のリーグが使っているコート（選べない） */
  takenBy?: string;
}

interface Props {
  /** リーグ（種目）名 */
  eventName: string;
  courts: LeagueCourtOption[];
  /** 現在の割り当て（courtId） */
  selectedCourtIds: string[];
  onSave: (courtIds: string[]) => void;
  onClose: () => void;
}

/** 1ブロックのコート数（コート状況の並びに合わせる） */
const BLOCK_SIZE = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += size) blocks.push(items.slice(i, i + size));
  return blocks;
}

export default function LeagueCourtDialog({
  eventName, courts, selectedCourtIds, onSave, onClose,
}: Props) {
  const [selected, setSelected] = useState<string[]>(selectedCourtIds);

  const toggle = (courtId: string) => {
    setSelected(prev => {
      if (prev.includes(courtId)) return prev.filter(id => id !== courtId);
      // 上限（2面）を超えたら古い方から外す
      const next = [...prev, courtId];
      return next.slice(-MAX_LEAGUE_COURTS);
    });
  };

  const blocks = chunk(courts, BLOCK_SIZE);

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary-600" />リーグの使用コート
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg text-sm">
          <span className="font-medium">{eventName}</span>
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            このリーグを行うコートを{MAX_LEAGUE_COURTS}面まで選べます。
            選んだコートは他の種目には割り当てられなくなり、空いたら次の対戦を入れられます。
          </p>
        </div>

        {courts.length === 0 ? (
          <p className="text-sm text-gray-400 py-2 text-center">コートが登録されていません。</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((block, bi) => (
              <div key={bi} className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-2">
                <div className="text-[10px] font-bold text-emerald-700 mb-1.5 px-0.5">
                  {block.length > 1
                    ? `${block[0].name}〜${block[block.length - 1].name}番コート`
                    : `${block[0].name}番コート`}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {block.map(c => {
                    const isSelected = selected.includes(c.courtId);
                    const blocked = !isSelected && (!!c.unavailable || !!c.takenBy);
                    return (
                      <button
                        key={c.courtId}
                        onClick={() => !blocked && toggle(c.courtId)}
                        disabled={blocked}
                        title={c.takenBy ? `${c.takenBy} が使用中` : undefined}
                        className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                            : blocked
                              ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                        }`}
                      >
                        <span className="text-base font-black leading-none">{c.name}</span>
                        <span className="text-[9px] font-bold leading-none mt-1 opacity-90">
                          {isSelected ? '使用' : c.unavailable ? '使用不可' : c.takenBy ? '他リーグ' : '空き'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={() => onSave([])}
            className="px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            割り当てを解除
          </button>
          <button
            onClick={() => onSave(selected)}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            {selected.length > 0 ? `${selected.length}面で決定` : '決定'}
          </button>
        </div>
      </div>
    </div>
  );
}
