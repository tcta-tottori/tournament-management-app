import type { MatchCall } from './types';

/**
 * 所属名をふりがなに変換する（マップにあれば）
 */
function resolveAffiliation(affiliation: string, furiganaMap: Record<string, string>): string {
  if (!affiliation) return '';
  const reading = furiganaMap[affiliation];
  return reading || affiliation;
}

/**
 * 回戦テキストから " #数字" 部分を除去する（例: "1回戦 #3" → "1回戦"）
 */
function removePositionNumber(text: string): string {
  return text.replace(/\s*#\d+/, '').trim();
}

/**
 * 種目名の級・部の前にポーズ（読点）を挿入する
 * 例: "男子シングルスA級" → "男子シングルス、A級"
 */
function addGradePause(eventName: string): string {
  return eventName.replace(/([ルスス体])([A-ZＡ-Ｚa-zａ-ｚ0-9０-９][級部])/, '$1、$2');
}

export function buildCallText(
  match: MatchCall,
  courtNumber: string,
  startTime: string,
  affiliationFuriganaMap: Record<string, string> = {},
): string {
  const younger = match.numberA < match.numberB
    ? { num: match.numberA, name: match.nameA }
    : { num: match.numberB, name: match.nameB };

  const parts: string[] = [];

  // 種目・回戦（#番号を除去、級の前にポーズ）
  parts.push(`${addGradePause(match.eventName)}、${removePositionNumber(match.round)}。`);

  // 選手情報（所属はふりがなマップで変換）
  if (match.type === 'doubles') {
    const affA = resolveAffiliation(match.affA, affiliationFuriganaMap);
    const pairAffA = resolveAffiliation(match.pairAffA || '', affiliationFuriganaMap);
    const affB = resolveAffiliation(match.affB, affiliationFuriganaMap);
    const pairAffB = resolveAffiliation(match.pairAffB || '', affiliationFuriganaMap);
    // ダブルスの所属表示：ペア所属が異なる場合は両方、同じなら1つ
    const affTextA = pairAffA && pairAffA !== affA ? `${affA}、${pairAffA}` : affA;
    const affTextB = pairAffB && pairAffB !== affB ? `${affB}、${pairAffB}` : affB;
    parts.push(`${match.numberA}番、${match.nameA}さん、${match.pairNameA}さん ペア、${affTextA}。`);
    parts.push(`${match.numberB}番、${match.nameB}さん、${match.pairNameB}さん ペア、${affTextB}。`);
  } else {
    const affA = resolveAffiliation(match.affA, affiliationFuriganaMap);
    const affB = resolveAffiliation(match.affB, affiliationFuriganaMap);
    parts.push(`${match.numberA}番、${match.nameA}さん、${affA}。`);
    parts.push(`${match.numberB}番、${match.nameB}さん、${affB}。`);
  }

  // コート指定（「行ってください」→「おこなってください」）
  let courtText = `この試合を、${courtNumber}番コートで`;
  if (startTime) {
    const [h, m] = startTime.split(':');
    const minutes = parseInt(m);
    courtText += minutes === 0
      ? `、${parseInt(h)}時より`
      : `、${parseInt(h)}時${minutes}分より`;
  }
  courtText += '、おこなってください。';
  parts.push(courtText);

  // ボール受け取り指示
  parts.push(`ボールは、${younger.num}番、${younger.name}さんが、本部まで取りに来てください。`);

  return parts.join(' ');
}
