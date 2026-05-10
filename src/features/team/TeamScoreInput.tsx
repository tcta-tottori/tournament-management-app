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

const MATCH_TYPE_THEME: Record<MatchType, MatchTheme> = {
  MIX: {
    grad: 'from-violet-500 to-fuchsia-500',
    bg: 'bg-gradient-to-br from-violet-50 to-fuchsia-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    badge: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
    ring: 'focus:ring-violet-400 focus:border-violet-500',
    accentBorder: 'border-violet-300',
    softBg: 'bg-violet-100/60',
    btn: 'bg-white hover:bg-violet-50 border-violet-200 text-violet-700',
  },
  WD: {
    grad: 'from-pink-500 to-rose-500',
    bg: 'bg-gradient-to-br from-pink-50 to-rose-50',
    border: 'border-pink-200',
    text: 'text-pink-700',
    badge: 'bg-gradient-to-br from-pink-500 to-rose-500 text-white',
    ring: 'focus:ring-pink-400 focus:border-pink-500',
    accentBorder: 'border-pink-300',
    softBg: 'bg-pink-100/60',
    btn: 'bg-white hover:bg-pink-50 border-pink-200 text-pink-700',
  },
  MD: {
    grad: 'from-sky-500 to-blue-500',
    bg: 'bg-gradient-to-br from-sky-50 to-blue-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    badge: 'bg-gradient-to-br from-sky-500 to-blue-500 text-white',
    ring: 'focus:ring-sky-400 focus:border-sky-500',
    accentBorder: 'border-sky-300',
    softBg: 'bg-sky-100/60',
    btn: 'bg-white hover:bg-sky-50 border-sky-200 text-sky-700',
  },
  D3: {
    grad: 'from-blue-500 to-indigo-500',
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white',
    ring: 'focus:ring-blue-400 focus:border-blue-500',
    accentBorder: 'border-blue-300',
    softBg: 'bg-blue-100/60',
    btn: 'bg-white hover:bg-blue-50 border-blue-200 text-blue-700',
  },
  D2: {
    grad: 'from-cyan-500 to-blue-500',
    bg: 'bg-gradient-to-br from-cyan-50 to-blue-50',
    border: 'border-cyan-200',
    text: 'text-cyan-700',
    badge: 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white',
    ring: 'focus:ring-cyan-400 focus:border-cyan-500',
    accentBorder: 'border-cyan-300',
    softBg: 'bg-cyan-100/60',
    btn: 'bg-white hover:bg-cyan-50 border-cyan-200 text-cyan-700',
  },
  D1: {
    grad: 'from-teal-500 to-cyan-500',
    bg: 'bg-gradient-to-br from-teal-50 to-cyan-50',
    border: 'border-teal-200',
    text: 'text-teal-700',
    badge: 'bg-gradient-to-br from-teal-500 to-cyan-500 text-white',
    ring: 'focus:ring-teal-400 focus:border-teal-500',
    accentBorder: 'border-teal-300',
    softBg: 'bg-teal-100/60',
    btn: 'bg-white hover:bg-teal-50 border-teal-200 text-teal-700',
  },
  S2: {
    grad: 'from-amber-500 to-orange-500',
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
    ring: 'focus:ring-amber-400 focus:border-amber-500',
    accentBorder: 'border-amber-300',
    softBg: 'bg-amber-100/60',
    btn: 'bg-white hover:bg-amber-50 border-amber-200 text-amber-700',
  },
  S1: {
    grad: 'from-red-500 to-rose-500',
    bg: 'bg-gradient-to-br from-red-50 to-rose-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-gradient-to-br from-red-500 to-rose-500 text-white',
    ring: 'focus:ring-red-400 focus:border-red-500',
    accentBorder: 'border-red-300',
    softBg: 'bg-red-100/60',
    btn: 'bg-white hover:bg-red-50 border-red-200 text-red-700',
  },
};

/** 対戦チーム別テーマ（左=オレンジ、右=グリーン） */
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
    bg: 'bg-orange-50',
    bgStrong: 'bg-orange-100',
    border: 'border-orange-300',
    borderStrong: 'border-orange-500',
    text: 'text-orange-700',
    textStrong: 'text-orange-800',
    grad: 'from-orange-500 to-amber-500',
    btnBg: 'bg-white hover:bg-orange-50',
    btnBorder: 'border-orange-300',
    btnText: 'text-orange-700',
  },
  2: {
    bg: 'bg-emerald-50',
    bgStrong: 'bg-emerald-100',
    border: 'border-emerald-300',
    borderStrong: 'border-emerald-500',
    text: 'text-emerald-700',
    textStrong: 'text-emerald-800',
    grad: 'from-emerald-500 to-teal-500',
    btnBg: 'bg-white hover:bg-emerald-50',
    btnBorder: 'border-emerald-300',
    btnText: 'text-emerald-700',
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
  // 既存値を「苗字 / 名前」に分解（空白区切りの先頭=苗字、残り=名前）
  const initParts = (current || '').trim().split(/[\s　]+/);
  const [manualSurname, setManualSurname] = useState(initParts[0] || '');
  const [manualGiven, setManualGiven] = useState(initParts.slice(1).join(' ') || '');
  const [manualMode, setManualMode] = useState(false);
  const [showDisplayNameEdit, setShowDisplayNameEdit] = useState(false);
  const reactId = useId();
  const uniqueNameSurname = `player-manual-sn-${reactId.replace(/:/g, '')}`;
  const uniqueNameGiven = `player-manual-gn-${reactId.replace(/:/g, '')}`;
  const manualSurnameRef = useRef<HTMLInputElement | null>(null);
  const manualGivenRef = useRef<HTMLInputElement | null>(null);

  const usedSet = useMemo(() => new Set(usedPlayers), [usedPlayers]);
  // 苗字＋名前を結合した手動入力値（保存・重複判定用）
  const manualCombined = (() => {
    const sn = manualSurname.trim();
    const gn = manualGiven.trim();
    if (!sn && !gn) return '';
    return gn ? `${sn} ${gn}` : sn;
  })();
  const manualTrim = manualCombined;
  const manualIsDuplicate = manualTrim.length > 0 && usedSet.has(manualTrim) && manualTrim !== current;

  const commit = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && usedSet.has(trimmed) && trimmed !== current) return;
    onSelect(trimmed);
    onClose();
  };

  const openManual = () => {
    setManualMode(true);
    // 次フレームでフォーカス（ユーザー操作起点なのでキーボード表示 OK）
    setTimeout(() => manualSurnameRef.current?.focus(), 50);
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
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1 pb-2 flex items-center gap-1">
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
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                          : isSelected
                          ? `${teamTheme.bgStrong} ${teamTheme.borderStrong} ${teamTheme.textStrong} shadow-sm`
                          : `${teamTheme.btnBg} ${teamTheme.btnBorder} ${teamTheme.btnText} active:scale-95`
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                        <span className={`truncate ${isUsed ? 'line-through' : ''}`}>
                          <DisplayNameSpan name={name} />
                        </span>
                        {isUsed && (
                          <span className="ml-auto text-[9px] font-bold text-slate-400 shrink-0">出場済み</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {usedSet.size > 0 && (
                <p className="mt-3 text-[10px] text-slate-400 px-1 leading-snug">
                  ※ 同じ対戦内で既に出場した選手は選択できません。
                </p>
              )}

              {/* 表示名編集セクション */}
              {members && members.length > 0 && teamId && onUpdateDisplayName && (
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDisplayNameEdit(!showDisplayNameEdit)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 px-1"
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
                            <span className="text-slate-500 truncate w-16 shrink-0">{m.player.name.trim().split(/[\s\u3000]+/)[0]}</span>
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
                                  : 'border-slate-200 text-slate-400'
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
            <div className="p-6 text-center text-sm text-slate-400">
              チーム選手の登録がありません。<br />下から手動入力してください。
            </div>
          )}
        </div>

        {/* フッター: 手動入力 / クリア */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 space-y-2">
          {manualMode ? (
            <form
              autoComplete="off"
              onSubmit={e => { e.preventDefault(); if (manualTrim && !manualIsDuplicate) commit(manualCombined); }}
              className="space-y-1.5"
            >
              <div className="flex gap-1.5 items-stretch">
                <div className="flex-1 grid grid-cols-2 gap-1.5">
                  <input
                    ref={manualSurnameRef}
                    type="text"
                    value={manualSurname}
                    onChange={e => setManualSurname(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        manualGivenRef.current?.focus();
                      }
                    }}
                    placeholder="苗字"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name={uniqueNameSurname}
                    data-lpignore="true"
                    data-form-type="other"
                    data-1p-ignore="true"
                    enterKeyHint="next"
                    className={`px-3 py-2 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 ${
                      manualIsDuplicate ? 'border-rose-300 focus:ring-rose-300' : `border-slate-300 ${theme.ring}`
                    }`}
                  />
                  <input
                    ref={manualGivenRef}
                    type="text"
                    value={manualGiven}
                    onChange={e => setManualGiven(e.target.value)}
                    placeholder="名前（任意）"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    name={uniqueNameGiven}
                    data-lpignore="true"
                    data-form-type="other"
                    data-1p-ignore="true"
                    enterKeyHint="done"
                    className={`px-3 py-2 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 border-slate-300 ${theme.ring}`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualTrim || manualIsDuplicate}
                  className={`px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-br ${teamTheme.grad} disabled:opacity-30 active:scale-95`}
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(false);
                    const parts = (current || '').trim().split(/[\s　]+/);
                    setManualSurname(parts[0] || '');
                    setManualGiven(parts.slice(1).join(' ') || '');
                  }}
                  className="px-2 py-2 rounded-lg text-xs font-bold text-slate-500 bg-white border border-slate-200 active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {manualIsDuplicate && (
                <div className="text-[10px] font-bold text-rose-500 px-1">
                  「{manualTrim}」は既にこの対戦で出場済みです。
                </div>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={openManual}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-slate-600 bg-white border-2 border-slate-200 rounded-lg hover:bg-slate-100 active:scale-[0.98]"
            >
              <Pencil className="w-3.5 h-3.5" />
              手動入力する
            </button>
          )}
          {current && !manualMode && (
            <button
              type="button"
              onClick={() => commit('')}
              className="w-full py-2 text-xs font-bold text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 active:scale-[0.98]"
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
 * 表示名レンダリング: メイン文字（苗字、最大3文字）+ 同姓補助文字（小さめ・下揃え）
 * - 3文字以下はそのまま表示
 * - 4文字以上は先頭3文字をメイン、残りを小さいサブ文字として表示
 */
function DisplayNameSpan({ name, className }: { name: string; className?: string }) {
  if (!name) return null;
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
  value, placeholder, teamTheme, onClick,
}: {
  value: string;
  placeholder: string;
  teamTheme: TeamTheme;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-1 text-[11px] border-2 rounded-md px-2 py-1.5 transition-all active:scale-[0.97] ${
        value
          ? `bg-white ${teamTheme.border} ${teamTheme.text} font-bold`
          : `bg-white ${teamTheme.border} text-slate-400`
      }`}
    >
      {value ? <DisplayNameSpan name={value} className="truncate" /> : <span className="truncate">{placeholder}</span>}
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

/** Default winning game count for team matches */
const WIN_GAMES = 6;

export default function TeamScoreInput({
  matchId, team1Id, team2Id, team1Name, team2Name, subMatches, onClose, isBracket = false,
  team1Roster = [], team2Roster = [],
  team1Members = [], team2Members = [],
}: Props) {
  const {
    updateSubMatchScore, clearSubMatchScore, updateSubMatchPlayers,
    updateBracketSubMatchScore, clearBracketSubMatchScore,
    updatePlayerDisplayName,
  } = useTeamStore();

  // 試合に含まれる種目順（クラブ対抗戦は D3,D2,D1,S2,S1。ミックス大会は MIX,WD,MD）
  const matchTypeOrder = useMemo(
    () => subMatches.map(sm => sm.type),
    [subMatches],
  );

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
      if (!isBracket) {
        const isSingles = playersPerSubMatch(mt) === 1;
        const p1 = (isSingles ? [updated.p1a] : [updated.p1a, updated.p1b]).map(x => x.trim()).filter(Boolean);
        const p2 = (isSingles ? [updated.p2a] : [updated.p2a, updated.p2b]).map(x => x.trim()).filter(Boolean);
        updateSubMatchPlayers(matchId, mt, p1, p2);
      }
      return { ...prev, [mt]: updated };
    });
  }, [isBracket, matchId, updateSubMatchPlayers]);

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

  // 自動保存：スコア・打ち切りフラグの変更を即時 store に反映（リーグ・トーナメント共通）。
  // 不完全（片側のみ・同点）な状態はスキップし、完全に空＆打ち切りなしならクリアする。
  useEffect(() => {
    const updateFn = isBracket ? updateBracketSubMatchScore : updateSubMatchScore;
    const clearFn = isBracket ? clearBracketSubMatchScore : clearSubMatchScore;
    for (const mt of matchTypeOrder) {
      const s = scores[mt];
      if (!s) continue;
      const existing = subMatches.find(sm => sm.type === mt);
      if (!existing) continue;
      const isTerminated = !!terminated[mt];
      const s1Empty = s.score1 === '';
      const s2Empty = s.score2 === '';

      // 完全に空 + 打ち切りなし → 既に保存済みならクリア
      if (s1Empty && s2Empty && !isTerminated) {
        if (existing.score1 !== null || existing.score2 !== null || existing.terminated) {
          clearFn(matchId, mt);
        }
        continue;
      }

      const s1 = s1Empty ? (isTerminated ? 0 : NaN) : parseInt(s.score1);
      const s2 = s2Empty ? (isTerminated ? 0 : NaN) : parseInt(s.score2);
      // 入力途中（NaN）はスキップ
      if (isNaN(s1) || isNaN(s2)) continue;
      // 範囲外もスキップ
      if (s1 < 0 || s2 < 0 || s1 > WIN_GAMES + 1 || s2 > WIN_GAMES + 1) continue;
      // 同点（打ち切り以外）はスキップ
      if (!isTerminated && s1 === s2) continue;

      const isTb = !isTerminated && ((s1 === WIN_GAMES + 1 && s2 === WIN_GAMES) || (s1 === WIN_GAMES && s2 === WIN_GAMES + 1));
      const tb = isTb && s.tiebreakScore ? parseInt(s.tiebreakScore) : null;

      // 既存値と同じなら何もしない（無駄な書き込み回避）
      if (
        existing.score1 === s1 &&
        existing.score2 === s2 &&
        (existing.tiebreakScore ?? null) === tb &&
        (existing.terminated ?? false) === isTerminated
      ) {
        continue;
      }
      updateFn(matchId, mt, s1, s2, tb, isTerminated);
    }
  }, [scores, terminated, isBracket, matchTypeOrder, subMatches, matchId,
      updateSubMatchScore, clearSubMatchScore, updateBracketSubMatchScore, clearBracketSubMatchScore]);

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
    setScores(prev => ({
      ...prev,
      [matchType]: { ...(prev[matchType] as SubMatchState), [field]: raw },
    }));

    // Auto-advance focus
    if (raw.length === 1 && /^[0-9]$/.test(raw)) {
      const num = parseInt(raw);
      if (field === 'score1') {
        // Auto-fill opponent score if lower score entered
        if (num < WIN_GAMES) {
          setScores(prev => {
            const current = prev[matchType] as SubMatchState;
            if (current.score2 === '') {
              return { ...prev, [matchType]: { ...current, score1: raw, score2: WIN_GAMES.toString() } };
            }
            return { ...prev, [matchType]: { ...current, score1: raw } };
          });
        }
        setTimeout(() => {
          inputRefs.current[`${matchType}-score2`]?.focus();
          inputRefs.current[`${matchType}-score2`]?.select();
        }, 50);
      } else {
        // score2 changed
        // Auto-fill score1 if needed
        setScores(prev => {
          const current = prev[matchType] as SubMatchState;
          if (num < WIN_GAMES && current.score1 === '') {
            return { ...prev, [matchType]: { ...current, score2: raw, score1: WIN_GAMES.toString() } };
          }
          return { ...prev, [matchType]: { ...current, score2: raw } };
        });

        const s1 = parseInt((scores[matchType] as SubMatchState | undefined)?.score1 ?? '');
        // Check if tiebreak
        if ((s1 === WIN_GAMES + 1 && num === WIN_GAMES) || (s1 === WIN_GAMES && num === WIN_GAMES + 1)) {
          setTimeout(() => {
            inputRefs.current[`${matchType}-tiebreak`]?.focus();
            inputRefs.current[`${matchType}-tiebreak`]?.select();
          }, 50);
        } else {
          // Advance to next match type's score1
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
  }, [scores, matchTypeOrder]);

  const handleTiebreakChange = useCallback((matchType: MatchType, value: string) => {
    const raw = toHalfWidth(value).replace(/[^0-9]/g, '');
    setScores(prev => ({
      ...prev,
      [matchType]: { ...(prev[matchType] as SubMatchState), tiebreakScore: raw },
    }));

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
  }, [matchTypeOrder]);

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
      if (s1 > WIN_GAMES + 1 || s2 > WIN_GAMES + 1) return false;
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

    // 選手名は団体戦リーグのみ保存（シングルスは1名のみ）
    if (!isBracket) {
      for (const mt of matchTypeOrder) {
        const s = scores[mt];
        if (!s) continue;
        const isSingles = playersPerSubMatch(mt) === 1;
        const p1 = (isSingles ? [s.p1a] : [s.p1a, s.p1b]).map(x => x.trim()).filter(Boolean);
        const p2 = (isSingles ? [s.p2a] : [s.p2a, s.p2b]).map(x => x.trim()).filter(Boolean);
        updateSubMatchPlayers(matchId, mt, p1, p2);
      }
    }

    onClose();
  }, [scores, terminated, matchId, isBracket, subMatches, onClose, validate, matchTypeOrder,
      updateSubMatchScore, clearSubMatchScore, updateBracketSubMatchScore, clearBracketSubMatchScore, updateSubMatchPlayers]);

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
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">団体戦スコア入力</h3>
              <div className="text-xs text-indigo-200 mt-0.5">3種目のスコアを入力</div>
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
                ? 'bg-gradient-to-b from-amber-50 to-amber-100/60 border-amber-400 shadow-sm'
                : overallWinner === 2
                ? 'bg-slate-50 border-slate-200'
                : `${TEAM_THEME[1].bg} ${TEAM_THEME[1].border}`
            }`}>
              <div className={`font-bold text-sm truncate w-full ${
                overallWinner === 1 ? 'text-amber-800' : overallWinner === 2 ? 'text-slate-400' : TEAM_THEME[1].textStrong
              }`}>{team1Name}</div>
              <div className="h-4 flex items-center">
                {overallWinner === 1 && (
                  <span className="text-[10px] font-black text-amber-600 tracking-wider">WIN</span>
                )}
              </div>
            </div>
            <div className={`flex-1 flex flex-col items-center justify-center text-center py-2.5 px-3 rounded-xl border-2 transition-all min-h-[56px] ${
              overallWinner === 2
                ? 'bg-gradient-to-b from-amber-50 to-amber-100/60 border-amber-400 shadow-sm'
                : overallWinner === 1
                ? 'bg-slate-50 border-slate-200'
                : `${TEAM_THEME[2].bg} ${TEAM_THEME[2].border}`
            }`}>
              <div className={`font-bold text-sm truncate w-full ${
                overallWinner === 2 ? 'text-amber-800' : overallWinner === 1 ? 'text-slate-400' : TEAM_THEME[2].textStrong
              }`}>{team2Name}</div>
              <div className="h-4 flex items-center">
                {overallWinner === 2 && (
                  <span className="text-[10px] font-black text-amber-600 tracking-wider">WIN</span>
                )}
              </div>
            </div>
          </div>

          {/* 対戦スコア（大きく表示） */}
          <div className="flex justify-center mb-4">
            <div className="flex items-baseline gap-1">
              <span className={`text-5xl font-black tabular-nums leading-none ${
                overallWinner > 0
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent'
                  : 'text-slate-300'
              }`}>
                {winTally.t1}
              </span>
              <span className={`text-3xl font-black leading-none ${
                overallWinner > 0 ? 'text-slate-400' : 'text-slate-300'
              }`}>-</span>
              <span className={`text-5xl font-black tabular-nums leading-none ${
                overallWinner > 0
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent'
                  : 'text-slate-300'
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
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                : `border-slate-300 ${theme.ring}`;
              const score2Class = hasScores && info.winner === 2
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                : `border-slate-300 ${theme.ring}`;

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
                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded-full tracking-wider">
                          打ち切り
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasScores && info.winner > 0 && !terminated[mt] && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-white border border-emerald-300 px-2 py-0.5 rounded-full">
                          <Trophy className="w-2.5 h-2.5 inline mr-0.5" />
                          {info.winner === 1 ? team1Name : team2Name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setTerminated(prev => ({ ...prev, [mt]: !prev[mt] }))}
                        className={`flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-bold border transition-colors ${
                          terminated[mt]
                            ? 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600'
                            : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
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
                        <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
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
                          className="w-9 h-12 text-center text-base font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
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
                        <div className="text-[9px] text-blue-500 mb-0.5">TB</div>
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
                          className="w-9 h-12 text-center text-base font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
                          placeholder="?"
                        />
                      </div>
                    )}
                  </div>

                  {/* 選手名選択（対戦チーム別カラー: 左=オレンジ, 右=グリーン）。
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
                              placeholder={isSingles ? '選手' : '選手1'}
                              teamTheme={TEAM_THEME[1]}
                              onClick={() => setPicker({ mt, key: 'p1a', side: 1 })}
                            />
                            {!isSingles && (
                              <PlayerPickerButton
                                value={s.p1b}
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
                              placeholder={isSingles ? '選手' : '選手1'}
                              teamTheme={TEAM_THEME[2]}
                              onClick={() => setPicker({ mt, key: 'p2a', side: 2 })}
                            />
                            {!isSingles && (
                              <PlayerPickerButton
                                value={s.p2b}
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

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={filledCount === 0 || !validate()}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded-xl transition-all shadow-md text-sm font-medium mb-3 active:scale-[0.98] ${
              filledCount > 0 && validate()
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save size={14} />
            決定 {filledCount > 0 && `(${filledCount}/${matchTypeOrder.length})`}
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
            <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">{nowTime}</span>
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
