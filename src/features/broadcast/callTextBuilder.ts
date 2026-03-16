import type { MatchCall } from './types';

export function buildCallText(match: MatchCall, courtNumber: string, startTime: string): string {
  const younger = match.numberA < match.numberB
    ? { num: match.numberA, name: match.nameA }
    : { num: match.numberB, name: match.nameB };

  const parts: string[] = [];

  // 種目・回線
  parts.push(`${match.eventName}、${match.round}。`);

  // 選手情報
  if (match.type === 'doubles') {
    parts.push(`${match.numberA}番、${match.nameA}さん、${match.pairNameA}さん ペア、${match.affA}。`);
    parts.push(`${match.numberB}番、${match.nameB}さん、${match.pairNameB}さん ペア、${match.affB}。`);
  } else {
    parts.push(`${match.numberA}番、${match.nameA}さん、${match.affA}。`);
    parts.push(`${match.numberB}番、${match.nameB}さん、${match.affB}。`);
  }

  // コート指定
  let courtText = `この試合を、${courtNumber}番コートで`;
  if (startTime) {
    const [h, m] = startTime.split(':');
    courtText += `、${parseInt(h)}時${parseInt(m)}分より`;
  }
  courtText += '、行ってください。';
  parts.push(courtText);

  // ボール受け取り指示
  parts.push(`ボールは、${younger.num}番、${younger.name}さんが、本部まで取りに来てください。`);

  return parts.join(' ');
}
