// =============================================
// 回戦ごとのゲームルール解決
//
// 種目に登録された回戦別ルール（「1～3回戦 8ゲームマッチ」「準々決勝以降 6ゲームマッチ」等）
// から、対象の回戦に適用されるルールを取り出す。
// ドロー画面・ライブ配信画面など、試合を開始する場面で共通して使う。
// =============================================

import type { Event, MatchFormatType, RoundGameRule } from '../../db/database';

/** 回戦名（決勝・準決勝・準々決勝・N回戦） */
export function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/**
 * 表示範囲の切り替え用の短い回戦名（F / SF / QF / 3R …）。
 * 「準々決勝以降」のように文字数が変わるとボタンの位置が動くため、
 * 幅の変わりにくい短い表記にする。
 */
export function getShortRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'F';
  if (round === totalRounds - 1) return 'SF';
  if (round === totalRounds - 2) return 'QF';
  return `${round}R`;
}

/** 回戦に応じたゲームルールを取得 */
export function getGameRuleForRound(
  evt: Event | undefined, round: number, totalRounds: number,
): RoundGameRule | null {
  if (!evt) return null;
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) return null;
  if (rules.length === 1) return rules[0];
  const roundName = getRoundName(round, totalRounds);
  for (const rule of rules) {
    const label = rule.roundLabel;
    if (label === '全回戦') continue;
    const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]), to = parseInt(rangeMatch[2]);
      if (round >= from && round <= to) return rule;
      continue;
    }
    if (label.includes('以降')) {
      const cleanLabel = label.replace('以降', '');
      if (cleanLabel.includes('準々決勝') && round >= totalRounds - 2) return rule;
      if (cleanLabel.includes('準決勝') && round >= totalRounds - 1) return rule;
      if (cleanLabel.includes('決勝') && !cleanLabel.includes('準') && round >= totalRounds) return rule;
      const roundNumMatch = cleanLabel.match(/(\d+)回戦/);
      if (roundNumMatch && round >= parseInt(roundNumMatch[1])) return rule;
      continue;
    }
    if (roundName === label || label.includes(roundName)) return rule;
  }
  return rules[0];
}

/** 回戦に応じたルール文（審判用紙・ライブスコアの表示に使う） */
export function getGameRuleText(evt: Event | undefined, round: number, totalRounds: number): string {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  if (rule) return rule.ruleText;
  const g = evt?.gameRules?.games ?? 6;
  return `${g}ゲームマッチ（${g}-${g}タイブレーク）`;
}

/** 回戦に応じた試合方式 */
export function getMatchFormat(evt: Event | undefined, round: number, totalRounds: number): MatchFormatType {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  return rule?.matchFormat || 'game';
}

/** 種目全体のルール文（見出し表示用） */
export function getGameRulesText(evt: Event | undefined): string {
  if (!evt) return '';
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) {
    const g = evt.gameRules?.games ?? 6;
    return `${g}ゲームマッチ`;
  }
  return rules.map(r => `${r.roundLabel}: ${r.ruleText}`).join(' / ');
}
