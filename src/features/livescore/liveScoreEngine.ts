// =============================================
// ライブスコア — 進行ロジック（純粋関数）
//
// テニスのポイント／ゲーム／セットの進行をすべてここで完結させる。
// DB や React に依存しないので、UI からも同期からも安全に使える。
// =============================================

import type { LiveScore, LiveScoreConfig, LiveScoreSet, MatchFormatType } from '../../db/database';

/** 進行に必要な最小限の状態（LiveScore の部分集合） */
export type ScoreState = Pick<
  LiveScore,
  'sets' | 'p1Points' | 'p2Points' | 'isTiebreak' | 'isSuperTiebreak' | 'server' | 'status' | 'winner'
  | 'lastPointBy' | 'tiebreakFirstServer'
>;

const POINT_LABELS = ['0', '15', '30', '40'];

/** 既定のライブスコア設定 */
export const DEFAULT_LIVE_CONFIG: LiveScoreConfig = {
  format: 'game',
  targetGames: 8,
  noAd: false,
  tiebreakTo: 7,
  superTiebreakTo: 10,
};

/**
 * 種目のルール文・規定ゲーム数・試合方式からライブスコア設定を組み立てる。
 * 「ノーアド」の記載があればデュース無しとして扱う。
 */
export function buildConfig(params: {
  gameRuleText?: string | null;
  requiredGames?: number | null;
  matchFormat?: MatchFormatType;
}): LiveScoreConfig {
  const text = params.gameRuleText || '';
  const format: MatchFormatType = params.matchFormat || 'game';
  // 2セットマッチ＋ファイナル10ポイントSTB は 1セット6ゲーム固定
  const targetGames = format === 'twoSetsSuper10'
    ? 6
    : (params.requiredGames && params.requiredGames > 0 ? params.requiredGames : 8);
  const noAd = /ノーアド|ノーアドバンテージ|no\s*-?\s*ad/i.test(text);
  // 「8-8タイブレーク」等の記載からタイブレーク目標点は変えない（通常7ポイント）。
  return {
    format,
    targetGames,
    noAd,
    tiebreakTo: 7,
    superTiebreakTo: 10,
  };
}

/** 新規試合の初期状態 */
export function createInitialState(server: 1 | 2 = 1): ScoreState {
  return {
    sets: [{ p1: 0, p2: 0 }],
    p1Points: 0,
    p2Points: 0,
    isTiebreak: false,
    isSuperTiebreak: false,
    server,
    status: 'live',
    winner: null,
    lastPointBy: null,
    tiebreakFirstServer: null,
  };
}

/** 勝つのに必要なセット数 */
export function setsToWin(config: LiveScoreConfig): number {
  return config.format === 'twoSetsSuper10' ? 2 : 1;
}

/** 指定セットが「ファイナル10ポイントSTB」のセットか */
export function isSuperTiebreakSet(config: LiveScoreConfig, setIndex: number): boolean {
  return config.format === 'twoSetsSuper10' && setIndex === 2;
}

/** 指定セットの必要ゲーム数 */
function setTargetGames(config: LiveScoreConfig): number {
  return config.targetGames;
}

function clone(state: ScoreState): ScoreState {
  return {
    ...state,
    sets: state.sets.map(s => ({ ...s, tb: s.tb ? { ...s.tb } : undefined })),
  };
}

function other(player: 1 | 2): 1 | 2 {
  return player === 1 ? 2 : 1;
}

/** 完了済みセットの取得数を数える（引数の sets はすべて完了済みとみなす） */
function countSets(sets: LiveScoreSet[]): { p1: number; p2: number } {
  let p1 = 0, p2 = 0;
  for (const s of sets) {
    if (s.p1 > s.p2) p1++;
    else if (s.p2 > s.p1) p2++;
  }
  return { p1, p2 };
}

/**
 * 現時点で確定しているセット取得数。
 * 進行中の試合では末尾のセットは進行中なので除外する。
 */
export function wonSets(state: ScoreState): { p1: number; p2: number } {
  const completed = state.status === 'finished' ? state.sets : state.sets.slice(0, -1);
  return countSets(completed);
}

/** ポイント表示（0 / 15 / 30 / 40 / AD、タイブレーク中は実点数） */
export function pointLabel(state: ScoreState, player: 1 | 2): string {
  const mine = player === 1 ? state.p1Points : state.p2Points;
  const opp = player === 1 ? state.p2Points : state.p1Points;

  if (state.isSuperTiebreak) {
    const cur = state.sets[state.sets.length - 1];
    if (!cur) return '0';
    return String(player === 1 ? cur.p1 : cur.p2);
  }
  if (state.isTiebreak) return String(mine);
  if (mine >= 3 && opp >= 3) {
    if (mine === opp) return '40';
    return mine > opp ? 'AD' : '40';
  }
  return POINT_LABELS[mine] ?? '40';
}

/** 現在のセットのゲーム数 */
export function currentGames(state: ScoreState): { p1: number; p2: number } {
  const cur = state.sets[state.sets.length - 1];
  return cur ? { p1: cur.p1, p2: cur.p2 } : { p1: 0, p2: 0 };
}

/** 試合を終了状態にする */
function finishMatch(s: ScoreState, winner: 1 | 2): void {
  s.status = 'finished';
  s.winner = winner;
  s.isTiebreak = false;
  s.isSuperTiebreak = false;
  s.tiebreakFirstServer = null;
  s.p1Points = 0;
  s.p2Points = 0;
}

/**
 * タイブレークを終えたときの次のサーブ側。
 * ルール: タイブレークで最初にサーブした側が、次セットの第1ゲームをレシーブする。
 * （タイブレーク中のサーブ順から単純に交代させると1つずれるため、開始時の
 *   サーブ側を基準に決める）
 */
function serverAfterTiebreak(s: ScoreState): 1 | 2 {
  const first = s.tiebreakFirstServer;
  return first ? other(first) : s.server;
}

/** タイブレーク（通常・スーパー）を開始する。開始時のサーブ側を記録しておく */
function beginTiebreak(s: ScoreState, kind: 'tiebreak' | 'super'): void {
  if (kind === 'super') s.isSuperTiebreak = true;
  else s.isTiebreak = true;
  s.tiebreakFirstServer = s.server;
}

/** セットが完了したときの処理（勝敗判定 / 次セットの用意） */
function completeSet(s: ScoreState, config: LiveScoreConfig): void {
  // completeSet 到達時点で sets の全要素が完了済み
  const won = countSets(s.sets);
  const need = setsToWin(config);
  if (won.p1 >= need) return finishMatch(s, 1);
  if (won.p2 >= need) return finishMatch(s, 2);

  s.sets.push({ p1: 0, p2: 0 });
  s.p1Points = 0;
  s.p2Points = 0;
  s.isTiebreak = false;
  s.isSuperTiebreak = false;
  s.tiebreakFirstServer = null;
  // 次がファイナル10ポイントSTBなら、そのまま突入する
  if (isSuperTiebreakSet(config, s.sets.length - 1)) beginTiebreak(s, 'super');
}

/** 1ゲーム獲得時の処理 */
function winGame(s: ScoreState, config: LiveScoreConfig, player: 1 | 2): void {
  const cur = s.sets[s.sets.length - 1];
  const wasTiebreak = s.isTiebreak;
  if (wasTiebreak) {
    cur.tb = { p1: s.p1Points, p2: s.p2Points };
  }
  if (player === 1) cur.p1++; else cur.p2++;

  s.p1Points = 0;
  s.p2Points = 0;
  s.isTiebreak = false;
  // サーブ交代: 通常ゲームは1ゲーム毎、タイブレーク後は
  // 「タイブレークで先にサーブした側がレシーブ」から次セットを始める
  s.server = wasTiebreak ? serverAfterTiebreak(s) : other(s.server);
  s.tiebreakFirstServer = null;

  const target = setTargetGames(config);
  const top = Math.max(cur.p1, cur.p2);
  const diff = Math.abs(cur.p1 - cur.p2);
  const setDone = wasTiebreak || (top >= target && diff >= 2);

  if (setDone) {
    completeSet(s, config);
  } else if (cur.p1 === target && cur.p2 === target) {
    // N-N でタイブレーク突入
    beginTiebreak(s, 'tiebreak');
  }
}

/**
 * 1ポイント加算した新しい状態を返す（元の状態は変更しない）。
 * 試合終了後は何もしない。
 */
export function awardPoint(state: ScoreState, config: LiveScoreConfig, player: 1 | 2): ScoreState {
  if (state.status === 'finished') return state;
  const s = clone(state);
  s.lastPointBy = player;

  // --- ファイナル10ポイントスーパータイブレーク ---
  if (s.isSuperTiebreak) {
    const cur = s.sets[s.sets.length - 1];
    if (player === 1) cur.p1++; else cur.p2++;
    // サーブ交代: 最初の1ポイントだけ1本、以降は2ポイント毎
    // （通算ポイントが奇数になったところで交代 = 1, 3, 5, ... 本目の後）
    if ((cur.p1 + cur.p2) % 2 === 1) s.server = other(s.server);
    const top = Math.max(cur.p1, cur.p2);
    const diff = Math.abs(cur.p1 - cur.p2);
    if (top >= config.superTiebreakTo && diff >= 2) {
      cur.tb = { p1: cur.p1, p2: cur.p2 };
      s.server = serverAfterTiebreak(s);
      completeSet(s, config);
    }
    return s;
  }

  // --- 通常タイブレーク ---
  if (s.isTiebreak) {
    if (player === 1) s.p1Points++; else s.p2Points++;
    // サーブ交代: 最初の1ポイントだけ1本、以降は2ポイント毎
    if ((s.p1Points + s.p2Points) % 2 === 1) s.server = other(s.server);
    const top = Math.max(s.p1Points, s.p2Points);
    const diff = Math.abs(s.p1Points - s.p2Points);
    if (top >= config.tiebreakTo && diff >= 2) {
      winGame(s, config, player);
    }
    return s;
  }

  // --- 通常ゲーム ---
  if (player === 1) s.p1Points++; else s.p2Points++;
  const mine = player === 1 ? s.p1Points : s.p2Points;
  const opp = player === 1 ? s.p2Points : s.p1Points;

  if (config.noAd) {
    // ノーアド: 40-40 の次のポイントで即決着
    if (mine >= 4) {
      winGame(s, config, player);
      return s;
    }
  } else {
    if (mine >= 4 && mine - opp >= 2) {
      winGame(s, config, player);
      return s;
    }
    // アドバンテージを取り返したらデュースに戻す
    if (mine >= 4 && opp >= 4) {
      s.p1Points = 3;
      s.p2Points = 3;
    }
  }
  return s;
}

/**
 * 現在のセットのゲーム数を手動修正する（誤入力の訂正用）。
 * ポイントはリセットし、セット・試合の完了判定は行わない
 * （運営が意図的に途中経過を直すためのもの）。
 */
export function adjustGames(state: ScoreState, player: 1 | 2, delta: number): ScoreState {
  if (state.status === 'finished') return state;
  const s = clone(state);
  const cur = s.sets[s.sets.length - 1];
  if (!cur) return s;
  if (player === 1) cur.p1 = Math.max(0, cur.p1 + delta);
  else cur.p2 = Math.max(0, cur.p2 + delta);
  s.p1Points = 0;
  s.p2Points = 0;
  s.isTiebreak = false;
  s.tiebreakFirstServer = null;
  return s;
}

/** サーブ側を入れ替える */
export function toggleServer(state: ScoreState): ScoreState {
  const s = clone(state);
  s.server = other(s.server);
  // タイブレーク中の訂正なら「最初にサーブした側」も合わせてずらす
  // （次セットの先サーブが1つずれないようにする）
  if (s.tiebreakFirstServer) s.tiebreakFirstServer = other(s.tiebreakFirstServer);
  return s;
}

/**
 * 試合途中でゲームルール（試合方式・規定ゲーム数など）を変更したときに、
 * 現在の進行状態を新しいルールへ合わせ直す。
 *
 * - 規定ゲーム数を増やした → タイブレーク中なら通常ゲームへ戻す
 * - 規定ゲーム数を減らした（既に N-N に達している）→ タイブレークへ入る
 * - ファイナル10ポイントSTB のセットに該当するかを取り直す
 * すでに終わったセットのスコアや、試合の勝敗判定には手を加えない。
 */
export function applyConfig(state: ScoreState, config: LiveScoreConfig): ScoreState {
  if (state.status === 'finished') return state;
  const s = clone(state);
  const idx = s.sets.length - 1;
  const cur = s.sets[idx];
  if (!cur) return s;

  const shouldBeSuper = isSuperTiebreakSet(config, idx);
  if (shouldBeSuper !== s.isSuperTiebreak) {
    s.isSuperTiebreak = shouldBeSuper;
    s.isTiebreak = false;
    s.p1Points = 0;
    s.p2Points = 0;
    s.tiebreakFirstServer = shouldBeSuper ? s.server : null;
    return s;
  }
  if (s.isSuperTiebreak) return s;

  const target = setTargetGames(config);
  const atTarget = cur.p1 === target && cur.p2 === target;
  if (s.isTiebreak && !atTarget) {
    // 規定ゲーム数が変わってタイブレークの条件から外れた
    s.isTiebreak = false;
    s.p1Points = 0;
    s.p2Points = 0;
    s.tiebreakFirstServer = null;
  } else if (!s.isTiebreak && atTarget) {
    s.p1Points = 0;
    s.p2Points = 0;
    beginTiebreak(s, 'tiebreak');
  }
  return s;
}

/** 表示用のルール説明文 */
export function describeConfig(config: LiveScoreConfig): string {
  const base = config.format === 'twoSetsSuper10'
    ? `2セットマッチ＋ファイナル${config.superTiebreakTo}ポイントSTB（1セット${config.targetGames}ゲーム）`
    : `${config.targetGames}ゲームマッチ（${config.targetGames}-${config.targetGames}タイブレーク${config.tiebreakTo}ポイント）`;
  return base + (config.noAd ? '・ノーアド' : '');
}

/**
 * 現在のセットスコアから、Match.score へ保存するスコア文字列を作る。
 * 既存のスコア入力ダイアログと同じ書式:
 *   "6-4" / "9-8(5)" / "6-4 4-6 [10-8]"
 */
export function buildScoreString(state: ScoreState, config: LiveScoreConfig): string {
  const sets = state.status === 'finished' ? state.sets : state.sets.filter(s => s.p1 + s.p2 > 0);
  return sets
    .map((set, i) => {
      if (isSuperTiebreakSet(config, i)) return `[${set.p1}-${set.p2}]`;
      if (set.tb) return `${set.p1}-${set.p2}(${Math.min(set.tb.p1, set.tb.p2)})`;
      return `${set.p1}-${set.p2}`;
    })
    .join(' ');
}

/** 現在の状況を一行で表す（ダッシュボード等の簡易表示用） */
export function summarize(state: ScoreState, config: LiveScoreConfig): string {
  const parts: string[] = [];
  state.sets.forEach((set, i) => {
    if (state.status !== 'finished' && i === state.sets.length - 1 && set.p1 + set.p2 === 0) return;
    parts.push(isSuperTiebreakSet(config, i) ? `[${set.p1}-${set.p2}]` : `${set.p1}-${set.p2}`);
  });
  if (state.status === 'finished') return parts.join(' ') || '—';
  const pts = `${pointLabel(state, 1)}-${pointLabel(state, 2)}`;
  return [parts.join(' '), pts].filter(Boolean).join(' / ');
}
