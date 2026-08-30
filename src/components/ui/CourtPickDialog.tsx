// =============================================================================
// コート選択ポップアップ
//
// 待機中の試合を「どのコートに入れるか」運営が選ぶためのダイアログ。
// 対戦順シート（MatchManager）とコート別ドロー（CourtBracketPage）の
// どちらから入っても同じ操作になるよう、共通コンポーネントにしている。
// （以前はドロー側が自動で入るコートを決めてしまい、選べなかった）
//
// 表示はコート状況（コートマップ）に合わせて4面ごとのブロックで行を分け、
// 会場の全コートを並べる。空きコートだけが赤のボタンで選択でき、
// 試合中・使用しないコートはグレーで選択できない。
// =============================================================================

import { X, Trophy } from 'lucide-react';

export interface CourtPickCourt {
  courtId: string;
  name: string;
  /** 'empty' = 空き（選択可） / 'playing' = 試合中 / 'unavailable' = 使用しない */
  status: 'empty' | 'playing' | 'unavailable';
}

interface CourtPickDialogProps {
  /** 種目名（短縮済みでも可） */
  eventName: string;
  /** 回戦名（例: 1回戦） */
  roundName: string;
  player1Name: string;
  player2Name: string;
  /** 会場の全コート（番号順） */
  courts: CourtPickCourt[];
  onSelect: (courtId: string) => void;
  onClose: () => void;
  /**
   * コートを選ばずにそのままスコア入力へ進む。
   * 空きコートが無い・コート運用をしていない場合でも結果を入力できるようにするための導線。
   */
  onScoreInput?: () => void;
}

/** 1ブロックのコート数（コート状況の並びに合わせる） */
const BLOCK_SIZE = 4;

/** 配列を size ごとのブロックに分割する */
function chunk<T>(items: T[], size: number): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    blocks.push(items.slice(i, i + size));
  }
  return blocks;
}

export default function CourtPickDialog({
  eventName,
  roundName,
  player1Name,
  player2Name,
  courts,
  onSelect,
  onClose,
  onScoreInput,
}: CourtPickDialogProps) {
  const blocks = chunk(courts, BLOCK_SIZE);
  const emptyCount = courts.filter(c => c.status === 'empty').length;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
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
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-500">入れるコートを選択</label>
            <span className="text-[11px] text-gray-400">空き {emptyCount} / {courts.length}面</span>
          </div>
          {courts.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">コートが登録されていません。</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block, bi) => (
                <div key={bi} className="border border-primary-200 bg-primary-50/40 rounded-lg p-2">
                  <div className="text-[10px] font-bold text-gray-800 mb-1.5 px-0.5">
                    {block.length > 1
                      ? `${block[0].name}〜${block[block.length - 1].name}番コート`
                      : `${block[0].name}番コート`}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {block.map(c => {
                      const selectable = c.status === 'empty';
                      return (
                        <button
                          key={c.courtId}
                          onClick={() => selectable && onSelect(c.courtId)}
                          disabled={!selectable}
                          className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-colors ${
                            selectable
                              ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700 shadow-sm'
                              : 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed'
                          }`}
                        >
                          <span className="text-base font-black leading-none">{c.name}</span>
                          <span className="text-[9px] font-bold leading-none mt-1 opacity-90">
                            {c.status === 'empty' ? '空き' : c.status === 'playing' ? '試合中' : '使用不可'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {emptyCount === 0 && courts.length > 0 && (
            <p className="text-sm text-gray-400 py-2 text-center">現在、空きコートがありません。</p>
          )}
        </div>

        {/* コートを決めずに結果だけ入れる導線（コート未選択でもスコア入力できる） */}
        {onScoreInput && (
          <div className="pt-1 border-t border-gray-100">
            <button
              onClick={onScoreInput}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] text-sm font-bold text-gray-800 bg-primary-50 border border-primary-300 rounded-lg hover:bg-primary-100 active:scale-[0.98] transition-colors"
            >
              <Trophy className="w-4 h-4" />
              コートを選ばずにスコア入力
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
