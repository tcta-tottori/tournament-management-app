/**
 * scheduleEngine.ts - 試合スケジュール自動生成エンジン
 * 確定済みドローから試合一覧を抽出し、コート・時間枠に自動配置する
 * 純粋ロジックモジュール（DOM/window/AppConfig 依存なし）
 */

// =========================================================================
//  入力データ型（データベースから取得する構造）
// =========================================================================

export interface DrawSlot {
  position: number;
  entryId: string | null;
  seed: number;
  isBye: boolean;
}

export interface Draw {
  eventId: string;
  drawSize: number;
  slots: DrawSlot[];
}

export interface Entry {
  entryId: string;
  playerId: string;
  partnerId?: string;
}

export interface Player {
  playerId: string;
  name: string;
}

// =========================================================================
//  出力・中間データ型
// =========================================================================

/** extractMatchesFromDraw が生成する試合オブジェクト */
export interface ScheduleMatch {
  matchId: string;
  eventCode: string;
  eventName: string;
  eventOrder: number;
  round: number;
  roundLabel: string;
  matchNumInRound: number;
  halfLabel: string;
  players: string[];
  hasByeAdvance: boolean;
  drawSize: number;
  dependsOn: string[];
}

/** autoSchedule の設定 */
export interface ScheduleConfig {
  courtCount: number;
  courtNames: string[];
  matchDuration: number;
  startTime: string; // 'HH:MM'
}

/** autoSchedule が生成するスロット */
export interface ScheduleSlot {
  matchId: string;
  courtIndex: number;
  courtName: string;
  timeSlotIndex: number;
  startTime: string;
  eventCode: string;
  roundLabel: string;
}

/** extractMatchesFromDraw に渡す種目情報 */
export interface EventInfo {
  eventCode: string;
  eventName: string;
  eventOrder: number;
}

// =========================================================================
//  内部型
// =========================================================================

interface R1Result {
  matchId: string | null;
  isByeAdvance: boolean;
  advancingPlayer: string | null;
}

// =========================================================================
//  getRoundLabel - ラウンド表記を返す
// =========================================================================

/**
 * ラウンド番号からラベル文字列を生成する
 * @param round ラウンド番号（1始まり）
 * @param totalRounds 総ラウンド数 = log2(drawSize)
 * @returns 'F', 'SF', 'QF', または '{round}R'
 */
export function getRoundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'F';
  if (round === totalRounds - 1) return 'SF';
  if (round === totalRounds - 2) return 'QF';
  return round + 'R';
}

// =========================================================================
//  calcTimeString - 時刻文字列を計算
// =========================================================================

/**
 * 開始時刻とスロットインデックスから時刻文字列を計算する
 * @param startTimeStr 開始時刻 'HH:MM'
 * @param slotIndex スロットインデックス（0始まり）
 * @param durationMinutes 1試合の所要時間（分）
 * @returns 'HH:MM' 形式の時刻文字列
 */
export function calcTimeString(
  startTimeStr: string,
  slotIndex: number,
  durationMinutes: number,
): string {
  const parts = startTimeStr.split(':');
  const startHour = parseInt(parts[0], 10);
  const startMin = parseInt(parts[1], 10);
  const totalMinutes = startHour * 60 + startMin + slotIndex * durationMinutes;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// =========================================================================
//  内部ヘルパー
// =========================================================================

function calcTotalMinutes(
  startTime: string,
  slotIndex: number,
  durationMinutes: number,
): number {
  const parts = startTime.split(':');
  const startHour = parseInt(parts[0], 10);
  const startMin = parseInt(parts[1], 10);
  return startHour * 60 + startMin + slotIndex * durationMinutes;
}

function hasPlayerConflict(
  match: ScheduleMatch,
  slot: number,
  slotPlayers: Map<number, Set<string>>,
): boolean {
  const playersInSlot = slotPlayers.get(slot);
  if (!playersInSlot) return false;
  for (const player of match.players) {
    if (player && playersInSlot.has(player)) {
      return true;
    }
  }
  return false;
}

/**
 * ドローのスロット配列とエントリ・選手情報から、
 * 指定ポジションの選手名を返す。
 * BYEや該当なしの場合は null を返す。
 */
function resolvePlayerName(
  drawSlot: DrawSlot,
  entriesMap: Map<string, Entry>,
  playersMap: Map<string, Player>,
): string | null {
  if (drawSlot.isBye || !drawSlot.entryId) return null;
  const entry = entriesMap.get(drawSlot.entryId);
  if (!entry) return null;

  const player = playersMap.get(entry.playerId);
  const playerName = player?.name ?? entry.playerId;

  if (entry.partnerId) {
    const partner = playersMap.get(entry.partnerId);
    const partnerName = partner?.name ?? entry.partnerId;
    return `${playerName}/${partnerName}`;
  }
  return playerName;
}

// =========================================================================
//  extractMatchesFromDraw - ドロー結果から試合一覧を抽出
// =========================================================================

/**
 * 確定済みドローから全ラウンドの試合（ScheduleMatch）を抽出する
 *
 * @param draw ドローデータ（DB構造）
 * @param entries エントリ一覧（entryId でルックアップ）
 * @param players 選手一覧（playerId でルックアップ）
 * @param eventInfo 種目情報（コード・名前・表示順）
 * @returns ScheduleMatch 配列
 */
export function extractMatchesFromDraw(
  draw: Draw,
  entries: Entry[],
  players: Player[],
  eventInfo: EventInfo,
): ScheduleMatch[] {
  const { drawSize, slots } = draw;
  const { eventCode, eventName, eventOrder } = eventInfo;
  const totalRounds = Math.log2(drawSize);
  const halfSize = drawSize / 2;
  const matches: ScheduleMatch[] = [];

  // エントリ・選手をマップ化
  const entriesMap = new Map<string, Entry>();
  for (const e of entries) {
    entriesMap.set(e.entryId, e);
  }
  const playersMap = new Map<string, Player>();
  for (const p of players) {
    playersMap.set(p.playerId, p);
  }

  // ドローのスロットをポジション順に並べる
  const sortedSlots = [...slots].sort((a, b) => a.position - b.position);

  // -----------------------------------------------------------------
  //  1回戦（R1）: ドロー配列のペアを走査
  // -----------------------------------------------------------------
  const r1Results: R1Result[] = [];

  for (let pairIdx = 0; pairIdx < drawSize / 2; pairIdx++) {
    const idx1 = pairIdx * 2;
    const idx2 = pairIdx * 2 + 1;
    const s1 = sortedSlots[idx1];
    const s2 = sortedSlots[idx2];

    const halfLabel = pairIdx < halfSize / 2 ? 'L' : 'R';
    const matchNumInHalf =
      halfLabel === 'L'
        ? pairIdx + 1
        : pairIdx - Math.floor(halfSize / 2) + 1;

    const p1Bye = s1.isBye || !s1.entryId;
    const p2Bye = s2.isBye || !s2.entryId;
    const bothBye = p1Bye && p2Bye;
    const oneBye = p1Bye !== p2Bye;

    if (bothBye) {
      r1Results.push({ matchId: null, isByeAdvance: true, advancingPlayer: null });
      continue;
    }

    if (oneBye) {
      const advancerSlot = p1Bye ? s2 : s1;
      const advancerName = resolvePlayerName(advancerSlot, entriesMap, playersMap);
      const matchId = `${eventCode}-R1-${halfLabel}${matchNumInHalf}`;
      r1Results.push({
        matchId,
        isByeAdvance: true,
        advancingPlayer: advancerName,
      });
      continue;
    }

    // 実試合
    const matchId = `${eventCode}-R1-${halfLabel}${matchNumInHalf}`;
    const p1Name = resolvePlayerName(s1, entriesMap, playersMap);
    const p2Name = resolvePlayerName(s2, entriesMap, playersMap);
    const matchPlayers: string[] = [];
    if (p1Name) matchPlayers.push(p1Name);
    if (p2Name) matchPlayers.push(p2Name);

    const match: ScheduleMatch = {
      matchId,
      eventCode,
      eventName,
      eventOrder,
      round: 1,
      roundLabel: getRoundLabel(1, totalRounds),
      matchNumInRound: pairIdx + 1,
      halfLabel,
      players: matchPlayers,
      hasByeAdvance: false,
      drawSize,
      dependsOn: [],
    };
    matches.push(match);

    r1Results.push({
      matchId,
      isByeAdvance: false,
      advancingPlayer: null,
    });
  }

  // -----------------------------------------------------------------
  //  2回戦以降: トーナメントツリーを辿る
  // -----------------------------------------------------------------
  let prevRoundSlots: R1Result[] = r1Results;

  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = drawSize / Math.pow(2, round);
    const currentRoundSlots: R1Result[] = [];

    for (let slotIdx = 0; slotIdx < matchesInRound; slotIdx++) {
      const feederA = prevRoundSlots[slotIdx * 2];
      const feederB = prevRoundSlots[slotIdx * 2 + 1];

      const totalSlotsInHalf = matchesInRound / 2;
      let halfLabel: string | null;
      let matchNumInHalf: number | null;

      if (round === totalRounds) {
        halfLabel = null;
        matchNumInHalf = null;
      } else {
        halfLabel = slotIdx < totalSlotsInHalf ? 'L' : 'R';
        matchNumInHalf =
          halfLabel === 'L'
            ? slotIdx + 1
            : slotIdx - totalSlotsInHalf + 1;
      }

      const matchId =
        round === totalRounds
          ? `${eventCode}-F`
          : `${eventCode}-R${round}-${halfLabel}${matchNumInHalf}`;

      const dependsOn: string[] = [];
      const hasByeAdvance = feederA.isByeAdvance || feederB.isByeAdvance;
      const matchPlayers: string[] = [];

      if (feederA.matchId && !feederA.isByeAdvance) {
        dependsOn.push(feederA.matchId);
      } else if (feederA.isByeAdvance && feederA.advancingPlayer) {
        matchPlayers.push(feederA.advancingPlayer);
      }

      if (feederB.matchId && !feederB.isByeAdvance) {
        dependsOn.push(feederB.matchId);
      } else if (feederB.isByeAdvance && feederB.advancingPlayer) {
        matchPlayers.push(feederB.advancingPlayer);
      }

      const match: ScheduleMatch = {
        matchId,
        eventCode,
        eventName,
        eventOrder,
        round,
        roundLabel: getRoundLabel(round, totalRounds),
        matchNumInRound: slotIdx + 1,
        halfLabel: halfLabel ?? 'F',
        players: matchPlayers,
        hasByeAdvance,
        drawSize,
        dependsOn,
      };
      matches.push(match);

      currentRoundSlots.push({
        matchId,
        isByeAdvance: false,
        advancingPlayer: null,
      });
    }

    prevRoundSlots = currentRoundSlots;
  }

  return matches;
}

// =========================================================================
//  autoSchedule - 試合を自動スケジューリング
// =========================================================================

/**
 * 試合一覧をコート×時間枠のグリッドに自動配置する
 * 照明制約・コート集約ロジック付き
 *
 * ソート: ラウンド昇順 → ドローサイズ降順 → 種目順（eventOrder）
 * 照明制約: コート 1-8 は 18:00 以降使用不可、コート 9-16 は 21:00 まで
 *
 * @param matches ScheduleMatch 配列（複数種目を含む）
 * @param config スケジュール設定
 * @returns ScheduleSlot 配列
 */
export function autoSchedule(
  matches: ScheduleMatch[],
  config: ScheduleConfig,
): ScheduleSlot[] {
  const { courtCount, courtNames, matchDuration, startTime } = config;

  // ソート: ラウンド昇順 → ドローサイズ降順 → 種目順 → 左山(L)→右山(R) → 上から下(matchNumInRound)
  // これにより対戦順（matchOrder）と同じ並びでタイムテーブルに配置される
  const sorted = [...matches].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.drawSize !== b.drawSize) return b.drawSize - a.drawSize;
    if (a.eventOrder !== b.eventOrder) return a.eventOrder - b.eventOrder;
    // 左山(L) → 右山(R) → 決勝(F) の順
    const halfOrder = (h: string) => h === 'L' ? 0 : h === 'R' ? 1 : 2;
    if (a.halfLabel !== b.halfLabel) return halfOrder(a.halfLabel) - halfOrder(b.halfLabel);
    // 同じ山の中で上から下へ
    return a.matchNumInRound - b.matchNumInRound;
  });

  // 最大ラウンドを算出（後半判定に使用）
  const maxRound = Math.max(...sorted.map((m) => m.round), 1);

  // グリッドとスケジュール管理
  const maxSlots = 200;
  const grid: (string | null)[][] = [];
  for (let c = 0; c < courtCount; c++) {
    grid.push(new Array<string | null>(maxSlots).fill(null));
  }

  const completionSlot = new Map<string, number>();
  const slotPlayers = new Map<number, Set<string>>();
  const result: ScheduleSlot[] = [];

  // 照明制約チェック
  const isCourtAvailable = (courtNum: number, slotIdx: number): boolean => {
    const totalMinutes = calcTotalMinutes(startTime, slotIdx, matchDuration);
    const hour = totalMinutes / 60;
    if (courtNum >= 1 && courtNum <= 8) {
      return hour < 18;
    }
    if (courtNum >= 9 && courtNum <= 16) {
      return hour < 21;
    }
    return true;
  };

  // コート優先順序を決定する
  const getCourtOrder = (match: ScheduleMatch): number[] => {
    const isLateRound =
      match.round >= maxRound - 1 || match.round / maxRound > 0.6;
    const indices: number[] = [];

    if (isLateRound) {
      const preferred: number[] = [];
      const secondary: number[] = [];
      const tertiary: number[] = [];

      for (let i = 0; i < courtCount; i++) {
        const num = parseInt(courtNames[i], 10);
        if (num === 5 || num === 9) {
          preferred.push(i);
        } else if ((num >= 6 && num <= 8) || (num >= 10 && num <= 12)) {
          secondary.push(i);
        } else {
          tertiary.push(i);
        }
      }
      indices.push(...preferred, ...secondary, ...tertiary);
    } else {
      for (let i = 0; i < courtCount; i++) {
        indices.push(i);
      }
    }
    return indices;
  };

  // 試合配置ループ
  for (const match of sorted) {
    let minSlot = 0;
    for (const depId of match.dependsOn) {
      const depSlot = completionSlot.get(depId);
      if (depSlot !== undefined) {
        minSlot = Math.max(minSlot, depSlot + 1);
      }
    }

    let assigned = false;
    const courtOrder = getCourtOrder(match);

    for (let slot = minSlot; slot < maxSlots; slot++) {
      if (hasPlayerConflict(match, slot, slotPlayers)) {
        continue;
      }

      for (const courtIdx of courtOrder) {
        const courtNum = parseInt(courtNames[courtIdx], 10);

        if (!isCourtAvailable(courtNum, slot)) {
          continue;
        }

        if (grid[courtIdx][slot] === null) {
          grid[courtIdx][slot] = match.matchId;
          completionSlot.set(match.matchId, slot);

          let playersSet = slotPlayers.get(slot);
          if (!playersSet) {
            playersSet = new Set<string>();
            slotPlayers.set(slot, playersSet);
          }
          for (const player of match.players) {
            if (player) playersSet.add(player);
          }

          result.push({
            matchId: match.matchId,
            courtIndex: courtIdx,
            courtName: courtNames[courtIdx] || String(courtIdx + 1),
            timeSlotIndex: slot,
            startTime: calcTimeString(startTime, slot, matchDuration),
            eventCode: match.eventCode,
            roundLabel: match.roundLabel,
          });
          assigned = true;
          break;
        }
      }
      if (assigned) break;
    }

    if (!assigned) {
      console.warn(`スケジュール配置失敗: ${match.matchId}`);
    }
  }

  return result;
}
