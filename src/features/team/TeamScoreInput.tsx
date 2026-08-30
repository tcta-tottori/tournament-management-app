import { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Trophy, ChevronDown, Check, Users, Pencil, OctagonX } from 'lucide-react';
import { useTeamStore } from './teamStore';
import type { SubMatchScore, MatchType, BracketSubMatchScore } from './types';
import { MATCH_TYPE_LABELS, MATCH_TYPE_SHORT, getDisplayNameParts, playersPerSubMatch } from './teamLogic';
import type { TeamMember } from './types';

/** Full-width to half-width number conversion */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** 種目別テーマカラー */
interface MatchTheme {
  grad: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  ring: string;
  accentBorder: string;
  softBg: string;
  btn: string;
}

/**
 * 種目（S1/S2/D1…）ごとの配色。
 * 協会サイトのトンマナ（白ベース＋赤の差し色）に合わせ、種目ごとの
 * 色分けはやめて全種目で共通の無彩色にしている。赤は勝者スコアなど
 * 要点だけに使う。
 */
const NEUTRAL_MATCH_THEME: MatchTheme = {
  grad: 'from-gray-600 to-gray-700',
  bg: 'bg-gradient-to-br from-gray-50 to-white',
  border: 'border-gray-200',
  text: 'text-gray-700',
  badge: 'bg-gradient-to-br from-gray-600 to-gray-700 text-white',
  ring: 'focus:ring-gray-400 focus:border-gray-500',
  accentBorder: 'border-gray-300',
  softBg: 'bg-gray-100/60',
  btn: 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700',
};

const MATCH_TYPE_THEME: Record<MatchType, MatchTheme> = {
  MIX: NEUTRAL_MATCH_THEME,
  WD: NEUTRAL_MATCH_THEME,
  MD: NEUTRAL_MATCH_THEME,
  D3: NEUTRAL_MATCH_THEME,
  D2: NEUTRAL_MATCH_THEME,
  D1: NEUTRAL_MATCH_THEME,
  S2: NEUTRAL_MATCH_THEME,
  S1: NEUTRAL_MATCH_THEME,
};

/** 対戦チーム別テーマ（左=ブランド赤、右=墨） */
interface TeamTheme {
  bg: string;
  bgStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textStrong: string;
  grad: string;
  btnBg: string;
  btnBorder: string;
  btnText: string;
}

const TEAM_THEME: Record<1 | 2, TeamTheme> = {
  1: {
    bg: 'bg-primary-50',
    bgStrong: 'bg-primary-100',
    border: 'border-primary-300',
    borderStrong: 'border-primary-500',
    text: 'text-primary-700',
    textStrong: 'text-primary-800',
    grad: 'from-primary-500 to-primary-600',
    btnBg: 'bg-white hover:bg-primary-50',
    btnBorder: 'border-primary-300',
    btnText: 'text-primary-700',
  },
  // 2チーム目は墨（無彩色）。左右どちらのチームかを色で見分けられるよう、
  // 1チーム目の赤と濃さ・色味で対比させている。
  2: {
    bg: 'bg-gray-50',
    bgStrong: 'bg-gray-100',
    border: 'border-gray-300',
    borderStrong: 'border-gray-600',
    text: 'text-gray-700',
    textStrong: 'text-gray-800',
    grad: 'from-gray-600 to-gray-700',
    btnBg: 'bg-white hover:bg-gray-50',
    btnBorder: 'border-gray-300',
    btnText: 'text-gray-700',
  },
};

/** 選手名選択ポップアップ */
function PlayerPickerPopup({
  title, teamName, roster, current, theme, teamTheme, usedPlayers, onSelect, onClose,
  members, teamId, onUpdateDisplayName,
}: {
  title: string;
  teamName: string;
  roster: string[];
  current: string;
  theme: MatchTheme;
  teamTheme: TeamTheme;
  /** 同チームの他スロットで既に選択済みの選手名（現在編集中のスロットは除外） */
  usedPlayers: string[];
  onSelect: (name: string) => void;
  onClose: () => void;
  /** メンバー一覧（表示名編集用） */
  members?: TeamMember[];
  /** チームID（表示名編集用） */
  teamId?: string;
  /** 表示名更新コールバック */
  onUpdateDisplayName?: (teamId: string, playerName: string, displayName: string | undefined) => void;
}) {
  // 手動入力は1つの「選手名」フィールドに統一（苗字＋名前を2欄に分けると
  // ブラウザ/OSの自動補完が名前欄を苗字と同じ文字で埋めてしまうため）。
  // 同姓の区別が必要な場合は「山田 太郎」のように空白で区切って入力する。
  const [manualName, setManualName] = useState((current || '').trim());
  const [manualMode, setManualMode] = useState(false);
  const [showDisplayNameEdit, setShowDisplayNameEdit] = useState(false);
  const reactId = useId();
  const uniqueNameField = `player-manual-${reactId.replace(/:/g, '')}`;
  const manualNameRef = useRef<HTMLInputElement | null>(null);

  const usedSet = useMemo(() => new Set(usedPlayers), [usedPlayers]);
  // 手動入力値（保存・重複判定用）
  const manualCombined = manualName.trim();
  const manualTrim = manualCombined;
  const manualIsDuplicate = manualTrim.length > 0 && usedSet.has(manualTrim) && manualTrim !== current;

  const commit = (name: string) => {
    const trimmed = name.trim();
    // 重複名でもブロックしない。手動入力では注意表示のうえで確定を許可する
    // （同姓別人など、あえて同じ表示名を使いたいケースに対応）。
    onSelect(trimmed);
    onClose();
  };

  // メンバーから「保存名 → 構造（main 文字数 / sub）」マップを作る。
  // 同姓ディスアンビグの1文字名を小文字スタイルで描画するために使う。
  const partsByName = useMemo(() => {
    const m = new Map<string, { mainLen: number }>();
    if (members) {
      for (const member of members) {
        if (!member?.player) continue;
        const parts = getDisplayNameParts(member.player, members);
        if (parts.sub) m.set(parts.full, { mainLen: parts.main.length });
      }
    }
    return m;
  }, [members]);
  const partsFor = (n: string) => partsByName.get(n);

  const openManual = () => {
    setManualMode(true);
    // 次フレームでフォーカス（ユーザー操作起点なのでキーボード表示 OK）
    setTimeout(() => manualNameRef.current?.focus(), 50);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー（対戦チーム別カラー） */}
        <div className={`bg-gradient-to-br ${teamTheme.grad} px-4 py-3 text-white flex items-center justify-between shrink-0`}>
          <div className="min-w-0">
            <div className="text-[10px] opacity-90 font-bold uppercase tracking-wider">{title}</div>
            <div className="text-sm font-black truncate">{teamName}</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 候補リスト（メイン領域） */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {roster.length > 0 ? (
            <div className="p-3">
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider px-1 pb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                チーム選手（タップで選択）
              </div>
              <div className="grid grid-cols-2 gap-2">
                {roster.map(name => {
                  const isSelected = name === current;
                  const isUsed = !isSelected && usedSet.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={isUsed}
                      onClick={() => !isUsed && commit(name)}
                      className={`px-3 py-3 rounded-xl border-2 text-base font-bold transition-all text-left ${
                        isUsed
                          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                          : isSelected
                          ? `${teamTheme.bgStrong} ${teamTheme.borderStrong} ${teamTheme.textStrong} shadow-sm`
                          : `${teamTheme.btnBg} ${teamTheme.btnBorder} ${teamTheme.btnText} active:scale-95`
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                        <span className={`truncate ${isUsed ? 'line-through' : ''}`}>
                          <DisplayNameSpan name={name} mainLen={partsFor(name)?.mainLen} />
                        </span>
                        {isUsed && (
                          <span className="ml-auto text-[9px] font-bold text-gray-400 shrink-0">出場済み</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {usedSet.size > 0 && (
                <p className="mt-3 text-[10px] text-gray-400 px-1 leading-snug">
                  ※ 同じ対戦内で既に出場した選手は選択できません。
                </p>
              )}

              {/* 表示名編集セクション */}
              {members && members.length > 0 && teamId && onUpdateDisplayName && (
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowDisplayNameEdit(!showDisplayNameEdit)}
                    className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 px-1"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    表示名を編集
                    <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showDisplayNameEdit ? 'rotate-180' : ''}`} />
                  </button>
                  {showDisplayNameEdit && (
                    <div className="mt-2 space-y-1">
                      {members.map(m => {
                        const autoName = getDisplayNameParts(m.player, members);
                        return (
                          <div key={m.player.name} className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-gray-500 truncate w-16 shrink-0">{m.player.name.trim().split(/[\s\u3000]+/)[0]}</span>
                            <input
                              type="text"
                              value={m.player.displayName ?? ''}
                              onChange={e => {
                                const val = e.target.value;
                                onUpdateDisplayName(teamId, m.player.name, val || undefined);
                              }}
                              placeholder={autoName.full}
                              className={`flex-1 min-w-0 text-center text-xs font-bold border rounded px-1 py-0.5 focus:outline-none focus:ring-1 ${
                                m.player.displayName
                                  ? `${teamTheme.btnBorder} ${teamTheme.btnText} bg-white`
                                  : 'border-gray-200 text-gray-400'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-gray-400">
              チーム選手の登録がありません。<br />下から手動入力してください。
            </div>
          )}
        </div>

        {/* フッター: 手動入力 / クリア */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 p-3 space-y-2">
          {manualMode ? (
            <form
              autoComplete="off"
              onSubmit={e => { e.preventDefault(); if (manualTrim) commit(manualCombined); }}
              className="space-y-1.5"
            >
              <div className="flex gap-1.5 items-stretch">
                <input
                  ref={manualNameRef}
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="選手名（例: 山田 太郎）"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name={uniqueNameField}
                  data-lpignore="true"
                  data-form-type="other"
                  data-1p-ignore="true"
                  enterKeyHint="done"
                  className={`flex-1 px-3 py-2 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 ${
                    manualIsDuplicate ? 'border-primary-300 focus:ring-primary-300' : `border-gray-300 ${theme.ring}`
                  }`}
                />
                <button
                  type="submit"
                  disabled={!manualTrim}
                  title={manualIsDuplicate ? 'この名前はこの対戦で出場済みですが、そのまま追加できます' : undefined}
                  className={`px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-br ${manualIsDuplicate ? 'from-primary-500 to-primary-600' : teamTheme.grad} disabled:opacity-30 active:scale-95`}
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(false);
                    setManualName((current || '').trim());
                  }}
                  className="px-2 py-2 rounded-lg text-xs font-bold text-gray-500 bg-white border border-gray-200 active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 px-1">同姓の区別が必要な場合は「山田 太郎」のように空白で区切って入力してください。</p>
              {manualIsDuplicate && (
                <div className="text-[10px] font-bold text-primary-600 px-1">
                  「{manualTrim}」は既にこの対戦で出場済みです。同姓別人などの場合はこのまま追加できます。
                </div>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={openManual}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-gray-600 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-100 active:scale-[0.98]"
            >
              <Pencil className="w-3.5 h-3.5" />
              手動入力する
            </button>
          )}
          {current && !manualMode && (
            <button
              type="button"
              onClick={() => commit('')}
              className="w-full py-2 text-xs font-bold text-primary-600 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 active:scale-[0.98]"
            >
              選手名をクリア
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * 表示名レンダリング: メイン文字（苗字）+ 同姓補助文字（小さめ・下揃え）
 * - 構造が判明している場合は mainLen で main / sub を分割（同姓ディスアンビグの
 *   1文字名は小文字スタイル）
 * - 構造が不明（手動入力など）の場合は、3文字以下はそのまま、4文字以上は先頭3文字を
 *   メイン・残りをサブとして表示するフォールバック
 */
function DisplayNameSpan({
  name, mainLen, className,
}: {
  name: string;
  mainLen?: number;
  className?: string;
}) {
  if (!name) return null;
  // 構造が判明している場合は明示的に分割
  if (typeof mainLen === 'number' && mainLen > 0 && mainLen < name.length) {
    const main = name.slice(0, mainLen);
    const sub = name.slice(mainLen);
    return (
      <span className={`inline-flex items-baseline ${className || ''}`}>
        <span>{main}</span>
        <span className="text-[0.75em] ml-[1px] opacity-80">{sub}</span>
      </span>
    );
  }
  if (name.length <= 3) {
    return <span className={className}>{name}</span>;
  }
  const main = name.slice(0, 3);
  const sub = name.slice(3);
  return (
    <span className={`inline-flex items-baseline ${className || ''}`}>
      <span>{main}</span>
      <span className="text-[0.75em] ml-[1px] opacity-80">{sub}</span>
    </span>
  );
}

/** 選手名ボタン（タップでピッカー表示） */
function PlayerPickerButton({
  value, placeholder, teamTheme, onClick, mainLen,
}: {
  value: string;
  placeholder: string;
  teamTheme: TeamTheme;
  onClick: () => void;
  mainLen?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-1 text-[13px] border-2 rounded-md px-2 py-1.5 transition-all active:scale-[0.97] ${
        value
          ? `bg-white ${teamTheme.border} ${teamTheme.text} font-bold`
          : `bg-white ${teamTheme.border} text-gray-400`
      }`}
    >
      {value ? <DisplayNameSpan name={value} mainLen={mainLen} className="truncate" /> : <span className="truncate">{placeholder}</span>}
      <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
    </button>
  );
}

interface Props {
  matchId: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  subMatches: (SubMatchScore | BracketSubMatchScore)[];
  onClose: () => void;
  isBracket?: boolean;
  /** team1の選手表示名候補リスト */
  team1Roster?: string[];
  /** team2の選手表示名候補リスト */
  team2Roster?: string[];
  /** team1のメンバー（表示名生成用） */
  team1Members?: TeamMember[];
  /** team2のメンバー（表示名生成用） */
  team2Members?: TeamMember[];
  /** 1セット獲得に必要なゲーム数（6 or 8）。タイブレークは N+1 になる。 */
  winGames?: number;
}

interface SubMatchState {
  score1: string;
  score2: string;
  tiebreakScore: string;
  p1a: string;
  p1b: string;
  p2a: string;
  p2b: string;
}

/** Default winning game count for team matches（リーグ規定によって6 or 8） */
const DEFAULT_WIN_GAMES = 6;

export default function TeamScoreInput({
  matchId, team1Id, team2Id, team1Name, team2Name, subMatches, onClose, isBracket = false,
  team1Roster = [], team2Roster = [],
  team1Members = [], team2Members = [],
  winGames = DEFAULT_WIN_GAMES,
}: Props) {
  // ローカルでは WIN_GAMES として扱う（後方互換のため変数名を維持）
  const WIN_GAMES = winGames;
  const {
    updateSubMatchScore, clearSubMatchScore, updateSubMatchPlayers,
    updateBracketSubMatchScore, clearBracketSubMatchScore, updateBracketSubMatchPlayers,
    updatePlayerDisplayName,
  } = useTeamStore();

  // 試合に含まれる種目順（クラブ対抗戦は D3,D2,D1,S2,S1。ミックス大会は MIX,WD,MD）
  const matchTypeOrder = useMemo(
    () => subMatches.map(sm => sm.type),
    [subMatches],
  );

  // 各チームメンバーから「保存名 → main 文字数」マップを作成（同姓ディスアンビグ用）
  const team1PartsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const member of team1Members) {
      if (!member?.player) continue;
      const parts = getDisplayNameParts(member.player, team1Members);
      if (parts.sub) m.set(parts.full, parts.main.length);
    }
    return m;
  }, [team1Members]);
  const team2PartsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const member of team2Members) {
      if (!member?.player) continue;
      const parts = getDisplayNameParts(member.player, team2Members);
      if (parts.sub) m.set(parts.full, parts.main.length);
    }
    return m;
  }, [team2Members]);

  // 種目ごとのローカル state
  const [scores, setScores] = useState<Partial<Record<MatchType, SubMatchState>>>(() => {
    const init: Partial<Record<MatchType, SubMatchState>> = {};
    for (const mt of matchTypeOrder) {
      const sm = subMatches.find(s => s.type === mt);
      init[mt] = {
        score1: sm?.score1 !== null && sm?.score1 !== undefined && sm.score1 >= 0 ? sm.score1.toString() : '',
        score2: sm?.score2 !== null && sm?.score2 !== undefined && sm.score2 >= 0 ? sm.score2.toString() : '',
        tiebreakScore: sm?.tiebreakScore?.toString() ?? '',
        p1a: sm?.players1?.[0] ?? '',
        p1b: sm?.players1?.[1] ?? '',
        p2a: sm?.players2?.[0] ?? '',
        p2b: sm?.players2?.[1] ?? '',
      };
    }
    return init;
  });

  // 種目ごとの「打ち切り」フラグ（途中終了し勝利数にカウントしない）
  const [terminated, setTerminated] = useState<Partial<Record<MatchType, boolean>>>(() => {
    const init: Partial<Record<MatchType, boolean>> = {};
    for (const mt of matchTypeOrder) {
      const sm = subMatches.find(s => s.type === mt);
      init[mt] = !!sm?.terminated;
    }
    return init;
  });

  // 選手名はスコア決定を待たずに即時保存（団体戦リーグのみ。トーナメントは決定時に保存）
  const handlePlayerChange = useCallback((mt: MatchType, key: 'p1a'|'p1b'|'p2a'|'p2b', value: string) => {
    setScores(prev => {
      const current = (prev[mt] as SubMatchState | undefined) ?? {
        score1: '', score2: '', tiebreakScore: '',
        p1a: '', p1b: '', p2a: '', p2b: '',
      };
      const updated = { ...current, [key]: value };
      // 選手名を即時保存（リーグ・決勝トーナメント両方）。結果画像に選手名を表示するため。
      const isSingles = playersPerSubMatch(mt) === 1;
      const p1 = (isSingles ? [updated.p1a] : [updated.p1a, updated.p1b]).map(x => x.trim()).filter(Boolean);
      const p2 = (isSingles ? [updated.p2a] : [updated.p2a, updated.p2b]).map(x => x.trim()).filter(Boolean);
      if (isBracket) {
        updateBracketSubMatchPlayers(matchId, mt, p1, p2);
      } else {
        updateSubMatchPlayers(matchId, mt, p1, p2);
      }
      return { ...prev, [mt]: updated };
    });
  }, [isBracket, matchId, updateSubMatchPlayers, updateBracketSubMatchPlayers]);

  // ピッカー状態管理
  const [picker, setPicker] = useState<{
    mt: MatchType;
    key: 'p1a'|'p1b'|'p2a'|'p2b';
    side: 1 | 2;
  } | null>(null);

  // Refs for all inputs: 3 match types x 3 inputs (score1, score2, tiebreak)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setRef = useCallback((key: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  }, []);

  // 自動保存ヘルパ：指定した種目のスコア・打ち切りフラグを store に書き込む
  // （入力途中＝片側NaNや同点はスキップ。両側空＆打ち切りなしならクリア）
  const persistSubMatch = useCallback((mt: MatchType, s: SubMatchState, isTerminated: boolean) => {
    const updateFn = isBracket ? updateBracketSubMatchScore : updateSubMatchScore;
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;
    const s1Empty = s.score1 === '';
    const s2Empty = s.score2 === '';

    if (s1Empty && s2Empty && !isTerminated) {
      const existing = subMatches.find(sm => sm.type === mt);
      if (existing && (existing.score1 !== null || existing.score2 !== null || existing.terminated)) {
        clearFn(matchId, mt);
      }
      return;
    }

    const s1 = s1Empty ? (isTerminated ? 0 : NaN) : parseInt(s.score1);
    const s2 = s2Empty ? (isTerminated ? 0 : NaN) : parseInt(s.score2);
    if (isNaN(s1) || isNaN(s2)) return;
    // 範囲外（負数）はスキップ。上限は設けず、入力されたスコアをそのまま反映
    if (s1 < 0 || s2 < 0) return;
    if (!isTerminated && s1 === s2) return;

    const isTb = !isTerminated && ((s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1));
    const tb = isTb && s.tiebreakScore ? parseInt(s.tiebreakScore) : null;
    updateFn(matchId, mt, s1, s2, tb, isTerminated);
  }, [isBracket, matchId, subMatches, WIN_GAMES,
      updateSubMatchScore, clearSubMatchScore, updateBracketSubMatchScore, clearBracketSubMatchScore]);

  // 自動保存：scores / terminated 変更時に保留 onChange と整合をとる念のためのバックアップ
  useEffect(() => {
    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      persistSubMatch(mt, s, !!terminated[mt]);
    }
  }, [scores, terminated, matchTypeOrder, persistSubMatch]);

  // Auto-focus first input
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstInput = inputRefs.current[`${matchTypeOrder[0]}-score1`];
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
        firstInput.select();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [matchTypeOrder]);

  // Current time (HH:MM)
  const [nowTime, setNowTime] = useState(() => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Determine winner for each sub-match
  const subMatchWinners = useMemo(() => {
    const result: Partial<Record<MatchType, { winner: 0 | 1 | 2; isTiebreak: boolean; loserSide: 0 | 1 | 2 }>> = {};
    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      const s1 = parseInt(s.score1);
      const s2 = parseInt(s.score2);
      let winner: 0 | 1 | 2 = 0;
      let isTiebreak = false;
      let loserSide: 0 | 1 | 2 = 0;

      if (!isNaN(s1) && !isNaN(s2) && s1 !== s2) {
        winner = s1 > s2 ? 1 : 2;
      }

      // Tiebreak detection: 7-6 or 6-7
      if ((s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1)) {
        isTiebreak = true;
        loserSide = s1 > s2 ? 2 : 1;
      }

      result[mt] = { winner, isTiebreak, loserSide };
    }
    return result;
  }, [scores]);

  // 過半数（チーム勝利に必要な勝ち数）= 種目数の半分超
  const majorityWins = Math.floor(matchTypeOrder.length / 2) + 1;

  // Win tally（打ち切り種目はカウントしない）
  const winTally = useMemo(() => {
    let t1 = 0, t2 = 0;
    for (const mt of matchTypeOrder) {
      if (terminated[mt]) continue;
      const w = subMatchWinners[mt]?.winner ?? 0;
      if (w === 1) t1++;
      if (w === 2) t2++;
    }
    return { t1, t2 };
  }, [subMatchWinners, terminated, matchTypeOrder]);

  // Overall winner detection（過半数獲得で確定）
  const overallWinner = useMemo(() => {
    if (winTally.t1 >= majorityWins) return 1;
    if (winTally.t2 >= majorityWins) return 2;
    return 0;
  }, [winTally, majorityWins]);

  // Input handlers
  const handleScoreChange = useCallback((matchType: MatchType, field: 'score1' | 'score2', value: string) => {
    const raw = toHalfWidth(value).replace(/[^0-9]/g, '');
    const currentBase = (scores[matchType] as SubMatchState | undefined) ?? {
      score1: '', score2: '', tiebreakScore: '',
      p1a: '', p1b: '', p2a: '', p2b: '',
    };
    let next: SubMatchState = { ...currentBase, [field]: raw };
    // Auto-fill 仕様：1桁を入力した瞬間、相手側が空ならゲーム取得本数 (=WIN_GAMES) で埋める
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (field === 'score1' && num < WIN_GAMES && next.score2 === '') {
        next = { ...next, score2: WIN_GAMES.toString() };
      } else if (field === 'score2' && num < WIN_GAMES && next.score1 === '') {
        next = { ...next, score1: WIN_GAMES.toString() };
      }
    }
    // local state を更新（updater は純粋）
    setScores(prev => ({ ...prev, [matchType]: next }));
    // store へ即時保存（× 早押しでもイベント終了時点で書き込み済み）
    persistSubMatch(matchType, next, !!terminated[matchType]);

    // フォーカス遷移
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (field === 'score1') {
        setTimeout(() => {
          inputRefs.current[`${matchType}-score2`]?.focus();
          inputRefs.current[`${matchType}-score2`]?.select();
        }, 50);
      } else {
        const s1 = parseInt(next.score1);
        // タイブレーク時は TB 入力にフォーカス
        if ((s1 === WIN_GAMES + 1 && num === WIN_GAMES) || (s1 === WIN_GAMES && num === WIN_GAMES + 1)) {
          setTimeout(() => {
            inputRefs.current[`${matchType}-tiebreak`]?.focus();
            inputRefs.current[`${matchType}-tiebreak`]?.select();
          }, 50);
        } else {
          // 次の種目の score1 へ
          const idx = matchTypeOrder.indexOf(matchType);
          if (idx >= 0 && idx < matchTypeOrder.length - 1) {
            const nextType = matchTypeOrder[idx + 1];
            setTimeout(() => {
              inputRefs.current[`${nextType}-score1`]?.focus();
              inputRefs.current[`${nextType}-score1`]?.select();
            }, 50);
          }
        }
      }
    }
  }, [scores, matchTypeOrder, terminated, persistSubMatch, WIN_GAMES]);

  const handleTiebreakChange = useCallback((matchType: MatchType, value: string) => {
    const raw = toHalfWidth(value).replace(/[^0-9]/g, '');
    const currentBase = (scores[matchType] as SubMatchState | undefined) ?? {
      score1: '', score2: '', tiebreakScore: '',
      p1a: '', p1b: '', p2a: '', p2b: '',
    };
    const next: SubMatchState = { ...currentBase, tiebreakScore: raw };
    setScores(prev => ({ ...prev, [matchType]: next }));
    persistSubMatch(matchType, next, !!terminated[matchType]);

    // Auto-advance to next match type on tiebreak entry
    if (raw.length >= 1) {
      const idx = matchTypeOrder.indexOf(matchType);
      if (idx >= 0 && idx < matchTypeOrder.length - 1) {
        const nextType = matchTypeOrder[idx + 1];
        setTimeout(() => {
          inputRefs.current[`${nextType}-score1`]?.focus();
          inputRefs.current[`${nextType}-score1`]?.select();
        }, 100);
      }
    }
  }, [scores, matchTypeOrder, terminated, persistSubMatch, WIN_GAMES]);

  // Validate all sub-matches that have been filled
  const validate = useCallback((): boolean => {
    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      const isTerminated = terminated[mt];
      const s1 = parseInt(s.score1);
      const s2 = parseInt(s.score2);
      // Skip empty sub-matches
      if (s.score1 === '' && s.score2 === '') continue;
      // 打ち切りはスコア未入力や同点を許容
      if (isTerminated) {
        if (s.score1 !== '' && (isNaN(s1) || s1 < 0)) return false;
        if (s.score2 !== '' && (isNaN(s2) || s2 < 0)) return false;
        continue;
      }
      if (isNaN(s1) || isNaN(s2)) return false;
      if (s1 < 0 || s2 < 0) return false;
      if (s1 === s2) return false;
      // 上限は設けず、入力されたスコアをそのまま反映する
    }
    return true;
  }, [scores, terminated, matchTypeOrder]);

  // Count how many sub-matches have been filled (打ち切りも件数に含む)
  const filledCount = useMemo(() => {
    return matchTypeOrder.filter(mt => {
      if (terminated[mt]) return true;
      const s = scores[mt];
      return s ? s.score1 !== '' && s.score2 !== '' : false;
    }).length;
  }, [scores, terminated, matchTypeOrder]);

  const handleSave = useCallback(() => {
    if (!validate()) return;

    const updateFn = isBracket ? updateBracketSubMatchScore : updateSubMatchScore;
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;

    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      const isTerminated = !!terminated[mt];
      const s1raw = parseInt(s.score1);
      const s2raw = parseInt(s.score2);
      // 打ち切り時はスコア未入力を 0 として保存（カウントには影響しない）
      const s1 = s.score1 === '' ? (isTerminated ? 0 : NaN) : s1raw;
      const s2 = s.score2 === '' ? (isTerminated ? 0 : NaN) : s2raw;

      if (s.score1 === '' && s.score2 === '' && !isTerminated) {
        // Clear this sub-match if previously had score
        const existing = subMatches.find(sm => sm.type === mt);
        if (existing && (existing.score1 !== null || existing.terminated)) {
          clearFn(matchId, mt);
        }
        continue;
      }

      if (isNaN(s1) || isNaN(s2)) continue;

      const isTb = !isTerminated && ((s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1));
      const tb = isTb && s.tiebreakScore ? parseInt(s.tiebreakScore) : null;
      updateFn(matchId, mt, s1, s2, tb, isTerminated);
    }

    // 選手名を保存（リーグ・決勝トーナメント両方。シングルスは1名のみ）
    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      const isSingles = playersPerSubMatch(mt) === 1;
      const p1 = (isSingles ? [s.p1a] : [s.p1a, s.p1b]).map(x => x.trim()).filter(Boolean);
      const p2 = (isSingles ? [s.p2a] : [s.p2a, s.p2b]).map(x => x.trim()).filter(Boolean);
      if (isBracket) {
        updateBracketSubMatchPlayers(matchId, mt, p1, p2);
      } else {
        updateSubMatchPlayers(matchId, mt, p1, p2);
      }
    }

    onClose();
  }, [scores, terminated, matchId, isBracket, subMatches, onClose, validate, matchTypeOrder,
      updateSubMatchScore, clearSubMatchScore, updateBracketSubMatchScore, clearBracketSubMatchScore,
      updateSubMatchPlayers, updateBracketSubMatchPlayers]);

  const handleClearAll = useCallback(() => {
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;
    for (const mt of matchTypeOrder) {
      clearFn(matchId, mt);
    }
    onClose();
  }, [matchId, isBracket, onClose, clearSubMatchScore, clearBracketSubMatchScore, matchTypeOrder]);

  // Check if any sub-match has existing scores
  const hasExistingScores = subMatches.some(sm => sm.score1 !== null);

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[100]" onClick={onClose}>
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto z-[110]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">団体戦スコア入力</h3>
              <div className="text-xs text-gray-200 mt-0.5">3種目のスコアを入力</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* autofill 抑制用ダミー入力 */}
        <input type="text" name="fake-user" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:'-9999px',width:0,height:0,opacity:0}} autoComplete="off" />
        <input type="password" name="fake-pass" tabIndex={-1} aria-hidden="true" style={{position:'absolute',left:'-9999px',width:0,height:0,opacity:0}} autoComplete="off" />

        <form
          autoComplete="off"
          onSubmit={e => { e.preventDefault(); handleSave(); }}
          className="p-4"
        >
          {/* Team names（チーム名のみ表示 — 高さ統一） */}
          <div className="flex items-stretch gap-2 mb-2">
            <div className={`flex-1 flex flex-col items-center justify-center text-center py-2.5 px-3 rounded-xl border-2 transition-all min-h-[56px] ${
              overallWinner === 1
                ? 'bg-gradient-to-b from-primary-50 to-primary-100/60 border-primary-400 shadow-sm'
                : overallWinner === 2
                ? 'bg-gray-50 border-gray-200'
                : `${TEAM_THEME[1].bg} ${TEAM_THEME[1].border}`
            }`}>
              <div className={`font-bold text-sm truncate w-full ${
                overallWinner === 1 ? 'text-primary-800' : overallWinner === 2 ? 'text-gray-400' : TEAM_THEME[1].textStrong
              }`}>{team1Name}</div>
              <div className="h-4 flex items-center">
                {overallWinner === 1 && (
                  <span className="text-[10px] font-black text-primary-600 tracking-wider">WIN</span>
                )}
              </div>
            </div>
            <div className={`flex-1 flex flex-col items-center justify-center text-center py-2.5 px-3 rounded-xl border-2 transition-all min-h-[56px] ${
              overallWinner === 2
                ? 'bg-gradient-to-b from-primary-50 to-primary-100/60 border-primary-400 shadow-sm'
                : overallWinner === 1
                ? 'bg-gray-50 border-gray-200'
                : `${TEAM_THEME[2].bg} ${TEAM_THEME[2].border}`
            }`}>
              <div className={`font-bold text-sm truncate w-full ${
                overallWinner === 2 ? 'text-primary-800' : overallWinner === 1 ? 'text-gray-400' : TEAM_THEME[2].textStrong
              }`}>{team2Name}</div>
              <div className="h-4 flex items-center">
                {overallWinner === 2 && (
                  <span className="text-[10px] font-black text-primary-600 tracking-wider">WIN</span>
                )}
              </div>
            </div>
          </div>

          {/* 対戦スコア（大きく表示） */}
          <div className="flex justify-center mb-4">
            <div className="flex items-baseline gap-1">
              <span className={`text-5xl font-black tabular-nums leading-none ${
                overallWinner > 0
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 bg-clip-text text-transparent'
                  : 'text-gray-300'
              }`}>
                {winTally.t1}
              </span>
              <span className={`text-3xl font-black leading-none ${
                overallWinner > 0 ? 'text-gray-400' : 'text-gray-300'
              }`}>-</span>
              <span className={`text-5xl font-black tabular-nums leading-none ${
                overallWinner > 0
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 bg-clip-text text-transparent'
                  : 'text-gray-300'
              }`}>
                {winTally.t2}
              </span>
            </div>
          </div>

          {/* Sub-match score rows */}
          <div className="space-y-3 mb-4">
            {matchTypeOrder.map((mt) => {
              const s = scores[mt];
              if (!s) return null;
              const info = subMatchWinners[mt] || { winner: 0 as 0 | 1 | 2, isTiebreak: false, loserSide: 0 as 0 | 1 | 2 };
              const hasScores = s.score1 !== '' && s.score2 !== '';
              const theme = MATCH_TYPE_THEME[mt];

              const score1Class = hasScores && info.winner === 1
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-300'
                : `border-gray-300 ${theme.ring}`;
              const score2Class = hasScores && info.winner === 2
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-300'
                : `border-gray-300 ${theme.ring}`;

              return (
                <div key={mt} className={`rounded-2xl border-2 ${theme.border} ${theme.bg} p-3 shadow-sm transition-all overflow-hidden`}>
                  {/* Match type label */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center px-2.5 h-7 ${theme.badge} text-xs font-black rounded-lg shadow-sm tracking-wider`}>
                        {MATCH_TYPE_SHORT[mt]}
                      </span>
                      <span className={`text-xs font-bold ${theme.text}`}>{MATCH_TYPE_LABELS[mt]}</span>
                      {terminated[mt] && (
                        <span className="text-[9px] font-black text-primary-600 bg-primary-50 border border-primary-300 px-1.5 py-0.5 rounded-full tracking-wider">
                          打ち切り
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasScores && info.winner > 0 && !terminated[mt] && (
                        <span className="text-[10px] font-bold text-primary-600 bg-white border border-primary-300 px-2 py-0.5 rounded-full">
                          <Trophy className="w-2.5 h-2.5 inline mr-0.5" />
                          {info.winner === 1 ? team1Name : team2Name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nextTerminated = !terminated[mt];
                          setTerminated(prev => ({ ...prev, [mt]: nextTerminated }));
                          // 即時保存（×早押しでも反映）
                          const s = scores[mt];
                          if (s) persistSubMatch(mt, s, nextTerminated);
                        }}
                        className={`flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-bold border transition-colors ${
                          terminated[mt]
                            ? 'bg-primary-500 text-white border-primary-500 hover:bg-primary-600'
                            : 'bg-white text-primary-600 border-primary-200 hover:bg-primary-50'
                        }`}
                        title="この種目を打ち切り（勝利数にカウントしない）"
                      >
                        <OctagonX size={11} />
                        {terminated[mt] ? '打ち切り中' : '打ち切り'}
                      </button>
                    </div>
                  </div>

                  {/* Score inputs */}
                  <div className="flex items-center justify-center gap-2">
                    {/* Tiebreak for team1 side (when team1 lost the tiebreak) */}
                    {info.isTiebreak && info.loserSide === 1 && (
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] text-gray-500 mb-0.5">TB</div>
                        <input
                          ref={setRef(`${mt}-tiebreak`)}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={s.tiebreakScore}
                          onChange={e => handleTiebreakChange(mt, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                          name={`tb-${mt}-1-${matchId.slice(-4)}`}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-lpignore="true"
                          data-form-type="other"
                          data-1p-ignore="true"
                          className="w-9 h-12 text-center text-base font-bold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-gray-50"
                          placeholder="?"
                        />
                      </div>
                    )}

                    <input
                      ref={setRef(`${mt}-score1`)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={s.score1}
                      onChange={e => handleScoreChange(mt, 'score1', e.target.value)}
                      name={`sc-${mt}-1-${matchId.slice(-4)}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-form-type="other"
                      data-1p-ignore="true"
                      className={`w-14 h-12 text-center text-2xl font-black border-2 rounded-xl focus:outline-none focus:ring-2 transition-all ${score1Class}`}
                      placeholder="0"
                    />

                    <span className={`text-2xl font-bold ${theme.text} opacity-50`}>-</span>

                    <input
                      ref={setRef(`${mt}-score2`)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={s.score2}
                      onChange={e => handleScoreChange(mt, 'score2', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const idx = matchTypeOrder.indexOf(mt);
                          if (idx < matchTypeOrder.length - 1 && !info.isTiebreak) {
                            // Move to next row
                            const nextType = matchTypeOrder[idx + 1];
                            inputRefs.current[`${nextType}-score1`]?.focus();
                            inputRefs.current[`${nextType}-score1`]?.select();
                          } else if (idx === matchTypeOrder.length - 1 && !info.isTiebreak) {
                            handleSave();
                          }
                        }
                      }}
                      name={`sc-${mt}-2-${matchId.slice(-4)}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-form-type="other"
                      data-1p-ignore="true"
                      className={`w-14 h-12 text-center text-2xl font-black border-2 rounded-xl focus:outline-none focus:ring-2 transition-all ${score2Class}`}
                      placeholder="0"
                    />

                    {/* Tiebreak for team2 side (when team2 lost the tiebreak) */}
                    {info.isTiebreak && info.loserSide === 2 && (
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] text-gray-500 mb-0.5">TB</div>
                        <input
                          ref={setRef(`${mt}-tiebreak`)}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={s.tiebreakScore}
                          onChange={e => handleTiebreakChange(mt, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const idx = matchTypeOrder.indexOf(mt);
                              if (idx < matchTypeOrder.length - 1) {
                                const nextType = matchTypeOrder[idx + 1];
                                inputRefs.current[`${nextType}-score1`]?.focus();
                              } else {
                                handleSave();
                              }
                            }
                          }}
                          name={`tb-${mt}-2-${matchId.slice(-4)}`}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-lpignore="true"
                          data-form-type="other"
                          data-1p-ignore="true"
                          className="w-9 h-12 text-center text-base font-bold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-gray-50"
                          placeholder="?"
                        />
                      </div>
                    )}
                  </div>

                  {/* 選手名選択（対戦チーム別カラー: 左=赤, 右=墨）。
                      シングルス（S1/S2）は各チーム1名のみ選択。 */}
                  {(() => {
                    const isSingles = playersPerSubMatch(mt) === 1;
                    const slotsClass = isSingles ? 'grid-cols-1' : 'grid-cols-2';
                    return (
                      <div className="mt-3 pt-2.5 border-t border-white/60 grid grid-cols-2 gap-2">
                        <div className={`space-y-1 rounded-lg p-1.5 ${TEAM_THEME[1].bg}`}>
                          <div className={`text-[9px] font-black truncate ${TEAM_THEME[1].textStrong} uppercase tracking-wider`}>{team1Name}</div>
                          <div className={`grid ${slotsClass} gap-1`}>
                            <PlayerPickerButton
                              value={s.p1a}
                              mainLen={team1PartsMap.get(s.p1a)}
                              placeholder={isSingles ? '選手' : '選手1'}
                              teamTheme={TEAM_THEME[1]}
                              onClick={() => setPicker({ mt, key: 'p1a', side: 1 })}
                            />
                            {!isSingles && (
                              <PlayerPickerButton
                                value={s.p1b}
                                mainLen={team1PartsMap.get(s.p1b)}
                                placeholder="選手2"
                                teamTheme={TEAM_THEME[1]}
                                onClick={() => setPicker({ mt, key: 'p1b', side: 1 })}
                              />
                            )}
                          </div>
                        </div>
                        <div className={`space-y-1 rounded-lg p-1.5 ${TEAM_THEME[2].bg}`}>
                          <div className={`text-[9px] font-black truncate ${TEAM_THEME[2].textStrong} uppercase tracking-wider`}>{team2Name}</div>
                          <div className={`grid ${slotsClass} gap-1`}>
                            <PlayerPickerButton
                              value={s.p2a}
                              mainLen={team2PartsMap.get(s.p2a)}
                              placeholder={isSingles ? '選手' : '選手1'}
                              teamTheme={TEAM_THEME[2]}
                              onClick={() => setPicker({ mt, key: 'p2a', side: 2 })}
                            />
                            {!isSingles && (
                              <PlayerPickerButton
                                value={s.p2b}
                                mainLen={team2PartsMap.get(s.p2b)}
                                placeholder="選手2"
                                teamTheme={TEAM_THEME[2]}
                                onClick={() => setPicker({ mt, key: 'p2b', side: 2 })}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* 閉じるボタン（入力内容は常に自動保存されている） */}
          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded-xl transition-all shadow-md text-sm font-medium mb-3 active:scale-[0.98] bg-gradient-to-r from-gray-600 to-gray-700 text-white hover:from-gray-700 hover:to-gray-800"
          >
            <Check size={14} />
            閉じる {filledCount > 0 && `(${filledCount}/${matchTypeOrder.length} 自動保存済み)`}
          </button>

          {/* Clear / Cancel + 時刻 */}
          <div className="flex items-center gap-3">
            {hasExistingScores && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 px-4 py-2.5 min-h-[48px] bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-colors text-sm active:scale-[0.98]"
              >
                <Trash2 size={14} />クリア
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 min-h-[48px] bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm active:scale-[0.98]"
            >
              キャンセル
            </button>
            <span className="text-xs font-bold text-gray-400 tabular-nums shrink-0">{nowTime}</span>
          </div>
        </form>
      </div>

      {/* 選手名選択ポップアップ */}
      {picker && (() => {
        const pickerState = picker;
        const isTeam1 = pickerState.side === 1;
        const roster = isTeam1 ? team1Roster : team2Roster;
        const tName = isTeam1 ? team1Name : team2Name;
        const tId = isTeam1 ? team1Id : team2Id;
        const tMembers = isTeam1 ? team1Members : team2Members;
        const theme = MATCH_TYPE_THEME[pickerState.mt];
        const teamTheme = TEAM_THEME[pickerState.side];
        const current = scores[pickerState.mt][pickerState.key];

        // 同チームの他スロットで既に使っている選手名を集める
        // （現在編集中のスロット自体は除外することで、再選択・クリアが自然に動く）
        const usedPlayers: string[] = [];
        const sameSideKeys: Array<'p1a'|'p1b'|'p2a'|'p2b'> = isTeam1 ? ['p1a', 'p1b'] : ['p2a', 'p2b'];
        for (const mt of matchTypeOrder) {
          for (const k of sameSideKeys) {
            if (mt === pickerState.mt && k === pickerState.key) continue;
            const val = (scores[mt]?.[k] || '').trim();
            if (val) usedPlayers.push(val);
          }
        }

        return (
          <PlayerPickerPopup
            title={`${MATCH_TYPE_LABELS[pickerState.mt]} 選手選択`}
            teamName={tName}
            roster={roster}
            current={current}
            theme={theme}
            teamTheme={teamTheme}
            usedPlayers={usedPlayers}
            onSelect={(name) => handlePlayerChange(pickerState.mt, pickerState.key, name)}
            onClose={() => setPicker(null)}
            members={tMembers}
            teamId={tId}
            onUpdateDisplayName={!isBracket ? updatePlayerDisplayName : undefined}
          />
        );
      })()}
    </div>,
    document.body
  );
}
