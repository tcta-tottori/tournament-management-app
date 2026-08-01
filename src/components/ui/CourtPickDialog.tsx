// =============================================================================
// コート選択ポップアップ
//
// 待機中の試合を「どのコートに入れるか」運営が選ぶためのダイアログ。
// 対戦順シート（MatchManager）とコート別ドロー（CourtBracketPage）の
// どちらから入っても同じ操作になるよう、共通コンポーネントにしている。
// （以前はドロー側が自動で入るコートを決めてしまい、選べなかった）
// =============================================================================

import { X } from 'lucide-react';

export interface CourtPickCourt {
  courtId: string;
  name: string;
}

interface CourtPickDialogProps {
  /** 種目名（短縮済みでも可） */
  eventName: string;
  /** 回戦名（例: 1回戦） */
  roundName: string;
  player1Name: string;
  player2Name: string;
  /** 選択できる空きコート（番号順） */
  courts: CourtPickCourt[];
  /** 対戦順で次に入る予定のコート名（あればオレンジで強調） */
  suggestedCourtName?: string | null;
  onSelect: (courtId: string) => void;
  onClose: () => void;
}

export default function CourtPickDialog({
  eventName,
  roundName,
  player1Name,
  player2Name,
  courts,
  suggestedCourtName,
  onSelect,
  onClose,
}: CourtPickDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">コートに入れる</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
          <div>
            <span className="font-medium">{eventName}</span>
            {roundName && <span className="ml-2 text-gray-500">{roundName}</span>}
          </div>
          <div className="text-gray-900 font-semibold">
            {player1Name} <span className="text-gray-400 font-normal mx-0.5">vs</span> {player2Name}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">入れる空きコートを選択</label>
          {courts.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">現在、空きコートがありません。</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {courts.map(c => (
                <button
                  key={c.courtId}
                  onClick={() => onSelect(c.courtId)}
                  className={`px-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                    suggestedCourtName === c.name
                      ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-primary-50 hover:border-primary-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {suggestedCourtName && courts.length > 0 && (
            <p className="text-[11px] text-orange-600 mt-2">オレンジ = 対戦順で次に入るコート（{suggestedCourtName}番）</p>
          )}
        </div>
      </div>
    </div>
  );
}
