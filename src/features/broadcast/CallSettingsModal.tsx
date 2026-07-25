import { createPortal } from 'react-dom';
import { Volume2, X, MapPin, Clock } from 'lucide-react';

export interface CallCourtOption {
  value: string;
  label: string;
}

/** 上部表示の1選手（またはペア）の情報 */
export interface CallPlayerInfo {
  /** ドロー番号（表示のみ。無ければ非表示） */
  number?: number;
  /** フルネーム（ダブルスは「A / B」） */
  name: string;
  /** 所属（ダブルスは「A / B」） */
  affiliation?: string;
}

interface CallSettingsModalProps {
  open: boolean;
  /** ヘッダーに表示する種目名（級・部を含む） */
  eventName?: string;
  /** 対戦カード（フルネーム）。players が渡されればそちらを優先して情報付きで表示 */
  player1Name: string;
  player2Name: string;
  /** 上部表示に番号・フルネーム・所属をすべて出す場合に渡す */
  player1?: CallPlayerInfo;
  player2?: CallPlayerInfo;
  /** コート・開始時刻の欄を表示するか（W.O/リタイアなど不要な場合は false） */
  showCourtAndTime?: boolean;
  courtOptions?: CallCourtOption[];
  courtNumber?: string;
  onCourtChange?: (v: string) => void;
  /** コートが既に指定済みのとき「（指定済み・修正可）」を表示 */
  courtAssigned?: boolean;
  startTime?: string;
  onStartTimeChange?: (v: string) => void;
  /** コール読み上げ内容（ひらがな）。修正可能。 */
  callText: string;
  onCallTextChange: (v: string) => void;
  canCall: boolean;
  onCall: () => void;
  onClose: () => void;
}

/** 上部表示の1行（番号・フルネーム・所属） */
function PlayerCardLine({ info, fallbackName }: { info?: CallPlayerInfo; fallbackName: string }) {
  const name = info?.name || fallbackName;
  if (!name) return <div className="text-sm font-bold text-gray-800">(未定)</div>;
  return (
    <div>
      <div className="text-sm font-bold text-gray-800">
        {info?.number ? <span className="text-emerald-600 mr-1">{info.number}番</span> : null}
        {name}
      </div>
      {info?.affiliation && <div className="text-[11px] text-gray-500 mt-0.5">{info.affiliation}</div>}
    </div>
  );
}

/**
 * コール設定ポップアップ（対戦順・スコアシート共通）。
 * - 名前は苗字のみ表示
 * - 開始時刻は任意（標準は「指定なし」）
 * - 読み上げ内容（ひらがな）を事前に表示・修正してからコールできる
 */
export default function CallSettingsModal({
  open,
  eventName,
  player1Name,
  player2Name,
  player1,
  player2,
  showCourtAndTime = true,
  courtOptions = [],
  courtNumber = '',
  onCourtChange,
  courtAssigned = false,
  startTime = '',
  onStartTimeChange,
  callText,
  onCallTextChange,
  canCall,
  onCall,
  onClose,
}: CallSettingsModalProps) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm my-auto overflow-hidden animate-[confirmSlideUp_0.2s_ease-out]">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">コール設定</h3>
            <p className="text-[11px] text-white/70 truncate">{eventName || ''}</p>
          </div>
          <button onClick={onClose} className="ml-auto shrink-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* 本体 */}
        <div className="px-5 py-4 space-y-4">
          {/* 対戦カード（番号・フルネーム・所属をすべて表示。級・部はヘッダーの種目名） */}
          <div className="text-center py-1 space-y-1.5">
            <PlayerCardLine info={player1} fallbackName={player1Name} />
            <div className="text-[11px] text-gray-400">vs</div>
            <PlayerCardLine info={player2} fallbackName={player2Name} />
          </div>

          {showCourtAndTime && (
            <>
              {/* コート指定（指定済みなら初期選択・修正可） */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" />コート
                  {courtAssigned && <span className="text-emerald-600 font-medium">（指定済み・修正可）</span>}
                </label>
                <select value={courtNumber} onChange={e => onCourtChange?.(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all">
                  <option value="">選択してください</option>
                  {courtOptions.length > 0
                    ? courtOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                    : Array.from({ length: 16 }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{n}番コート</option>)}
                </select>
              </div>

              {/* 開始時刻（標準は「指定なし」。任意で指定できる） */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" />開始時刻
                  <span className="text-gray-400 font-medium">（任意）</span>
                </label>
                <input type="time" value={startTime} onChange={e => onStartTimeChange?.(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all" />
                {!startTime && <p className="text-[10px] text-gray-400 mt-1">指定なし（開始時刻を読み上げません）。必要なときだけ選択してください。</p>}
              </div>
            </>
          )}

          {/* コール読み上げ内容（ひらがな）: 事前に表示・修正してからコールできる */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1 mb-1">
              <Volume2 className="w-3 h-3" />コール内容（修正可）
            </label>
            <textarea value={callText} onChange={e => onCallTextChange(e.target.value)}
              rows={5}
              placeholder={showCourtAndTime && !courtNumber ? 'コートを選択すると読み上げ内容が表示されます。' : ''}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed bg-gray-50/50 focus:bg-white focus:border-emerald-400 outline-none transition-all resize-y" />
            <p className="text-[10px] text-gray-400 mt-1">この内容（ひらがな）でコールします。読みが違う場合は修正してください。</p>
          </div>
        </div>

        {/* アクション */}
        <div className="px-5 pb-4 flex items-center gap-2.5">
          <button onClick={onClose}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all">
            キャンセル
          </button>
          <button
            onClick={() => { if (canCall) onCall(); }}
            disabled={!canCall}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all">
            <Volume2 className="w-4 h-4" />コール
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
