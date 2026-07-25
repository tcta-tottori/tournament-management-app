import type { MatchCall } from './types';

/**
 * カタカナをひらがなへ変換する
 */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

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

/**
 * フルネームから苗字のみを取得する
 * スペース（全角・半角）区切りで最初の部分を返す
 */
export function familyName(name: string): string {
  if (!name) return '';
  return name.trim().split(/[\s　]+/)[0];
}

/**
 * ふりがな（カタカナ/ひらがな、スペース区切りの場合あり）から苗字の読みを取得する。
 * スペースで区切られていれば先頭（苗字）を、区切りが無ければ読みを特定できないため空文字を返す。
 * （空文字の場合は漢字の苗字をそのまま表示・読み上げる）
 */
export function familyReading(furigana: string): string {
  if (!furigana) return '';
  const hira = kataToHira(furigana.trim());
  const parts = hira.split(/[\s　]+/);
  // スペースで苗字と名前が分かれている場合のみ苗字の読みを特定できる
  if (parts.length > 1 && parts[0]) return parts[0];
  return '';
}

// ---------------------------------------------------------------------------
// ふりがな注釈（漢字（かな）表示 ＋ 実際の読み上げはかなを使う仕組み）
// ---------------------------------------------------------------------------

/**
 * 大会用語の読み辞書。種目名・定型文の漢字にふりがなを付ける。
 */
const TERM_READINGS: Record<string, string> = {
  '準々決勝': 'じゅんじゅんけっしょう',
  '準決勝': 'じゅんけっしょう',
  '決勝': 'けっしょう',
  '回戦': 'かいせん',
  '歳以上': 'さいいじょう',
  '試合': 'しあい',
  '本部': 'ほんぶ',
  '男子': 'だんし',
  '女子': 'じょし',
  '混合': 'こんごう',
  '団体': 'だんたい',
  '一般': 'いっぱん',
  '番': 'ばん',
  '時': 'じ',
  '分': 'ふん',
};
// 注: 「A級」「B部」等の級・部は、直前の英字（級のグレード）を読み上げるため注釈しない
//     （TTSがそのまま正しく読む）。

// 長い語を優先してマッチさせる
const TERM_KEYS = Object.keys(TERM_READINGS).sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(TERM_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

/**
 * 漢字にふりがなを付けて `漢字（かな）` 形式にする。
 * かなが空、または漢字と同じ場合は漢字のまま返す。
 */
function annotate(kanji: string, kana: string): string {
  if (!kanji) return '';
  const k = (kana || '').trim();
  if (!k || k === kanji) return kanji;
  return `${kanji}（${k}）`;
}

/**
 * 大会用語辞書を使って、テキスト中の漢字に `漢字（かな）` 注釈を付ける。
 * （名前・所属には適用しない。個別に annotate する）
 */
function annotateTerms(text: string): string {
  return text.replace(TERM_RE, m => `${m}（${TERM_READINGS[m]}）`);
}

/**
 * `漢字（かな）` 注釈付きテキストを、実際に読み上げる（TTSへ渡す）かな主体のテキストへ変換する。
 * 漢字部分を捨て、かっこ内のかなを読む。注釈の無い漢字はそのまま（TTSが読む）。
 * 例: "田中（たなか）さん" → "たなかさん"
 */
export function toSpeechText(text: string): string {
  // 「注釈対象（漢字・カタカナ・英字の連続。数字は除く）」+（かな） → かな
  // 数字を除くのは「9番（ばん）」の 9 を残すため。英字を含むのは「小山池TC（…）」等の所属に対応するため。
  return text.replace(/[一-鿿々〆ヶ〇ァ-ヶーa-zA-ZＡ-Ｚａ-ｚ]+（([ぁ-ゖァ-ヶーゝゞ・]+)）/g, '$1');
}

// ---------------------------------------------------------------------------
// コールテキスト生成
// ---------------------------------------------------------------------------

/**
 * 選手名を `苗字漢字（苗字かな）` 注釈付きで返す。
 * 読みが不明な場合は漢字の苗字のみ。
 */
function nameToken(kanjiName: string, reading?: string): string {
  return annotate(familyName(kanjiName), reading || '');
}

/**
 * 所属を `所属漢字（所属かな）` 注釈付きで返す。
 */
function affToken(affiliationKanji: string, furiganaMap: Record<string, string>): string {
  if (!affiliationKanji) return '';
  const reading = resolveAffiliation(affiliationKanji, furiganaMap);
  return annotate(affiliationKanji, reading);
}

export function buildCallText(
  match: MatchCall,
  courtNumber: string,
  startTime: string,
  affiliationFuriganaMap: Record<string, string> = {},
  skipTime?: boolean,
): string {
  const younger = match.numberA < match.numberB
    ? { num: match.numberA, name: match.nameA, reading: match.nameAReading }
    : { num: match.numberB, name: match.nameB, reading: match.nameBReading };

  const parts: string[] = [];

  // 冒頭の案内
  parts.push(`${annotate('試合', 'しあい')}のコールをします。`);

  // 種目・回戦（#番号を除去、級の前にポーズ）
  parts.push(`${annotateTerms(addGradePause(match.eventName))}、${annotateTerms(removePositionNumber(match.round))}。`);

  // 選手情報（名前は苗字のみ・漢字（かな）、所属もふりがな注釈）
  if (match.type === 'doubles') {
    const affTextA = affToken(match.affA, affiliationFuriganaMap);
    const pairAffAText = affToken(match.pairAffA || '', affiliationFuriganaMap);
    const affTextB = affToken(match.affB, affiliationFuriganaMap);
    const pairAffBText = affToken(match.pairAffB || '', affiliationFuriganaMap);
    // ダブルスの所属表示：ペア所属が異なる場合は両方、同じなら1つ
    const combinedAffA = pairAffAText && pairAffAText !== affTextA ? `${affTextA}、${pairAffAText}` : affTextA;
    const combinedAffB = pairAffBText && pairAffBText !== affTextB ? `${affTextB}、${pairAffBText}` : affTextB;
    parts.push(`${match.numberA}${annotate('番', 'ばん')}、${nameToken(match.nameA, match.nameAReading)}さん、${nameToken(match.pairNameA || '', match.pairNameAReading)}さん ペア、${combinedAffA}。`);
    parts.push(`${match.numberB}${annotate('番', 'ばん')}、${nameToken(match.nameB, match.nameBReading)}さん、${nameToken(match.pairNameB || '', match.pairNameBReading)}さん ペア、${combinedAffB}。`);
  } else {
    parts.push(`${match.numberA}${annotate('番', 'ばん')}、${nameToken(match.nameA, match.nameAReading)}さん、${affToken(match.affA, affiliationFuriganaMap)}。`);
    parts.push(`${match.numberB}${annotate('番', 'ばん')}、${nameToken(match.nameB, match.nameBReading)}さん、${affToken(match.affB, affiliationFuriganaMap)}。`);
  }

  // コート指定（「行ってください」→「おこなってください」）
  let courtText = `この${annotate('試合', 'しあい')}を、${courtNumber}${annotate('番', 'ばん')}コートで`;
  if (startTime && !skipTime) {
    const [h, m] = startTime.split(':');
    const minutes = parseInt(m);
    courtText += minutes === 0
      ? `、${parseInt(h)}${annotate('時', 'じ')}より`
      : `、${parseInt(h)}${annotate('時', 'じ')}${minutes}${annotate('分', 'ふん')}より`;
  }
  courtText += '、おこなってください。';
  parts.push(courtText);

  // ボール受け取り指示
  parts.push(`ボールは、${younger.num}${annotate('番', 'ばん')}、${nameToken(younger.name, younger.reading)}さんが、${annotate('本部', 'ほんぶ')}まで${annotate('取', 'と')}りに${annotate('来', 'き')}てください。`);

  return parts.join(' ');
}

/**
 * ウォークオーバー（W.O）コールテキストを生成
 */
export function buildWalkoverCallText(
  match: MatchCall,
  woPlayerNum: number,
  woPlayerName: string,
  winnerNum: number,
  winnerName: string,
  affiliationFuriganaMap: Record<string, string> = {},
): string {
  const parts: string[] = [];

  parts.push(`${annotate('試合', 'しあい')}のコールをします。`);
  parts.push(`${annotateTerms(addGradePause(match.eventName))}、${annotateTerms(removePositionNumber(match.round))}。`);
  parts.push(`${match.numberA}${annotate('番', 'ばん')}、${nameToken(match.nameA, match.nameAReading)}さん、${affToken(match.affA, affiliationFuriganaMap)}。`);
  parts.push(`${match.numberB}${annotate('番', 'ばん')}、${nameToken(match.nameB, match.nameBReading)}さん、${affToken(match.affB, affiliationFuriganaMap)}。`);
  parts.push(`この${annotate('試合', 'しあい')}は、${woPlayerNum}${annotate('番', 'ばん')}、${nameToken(woPlayerName)}さんのウォークオーバーのため、${winnerNum}${annotate('番', 'ばん')}、${nameToken(winnerName)}さんの${annotate('勝利', 'しょうり')}とします。`);

  return parts.join(' ');
}

/**
 * リタイア（途中棄権）コールテキストを生成
 */
export function buildRetirementCallText(
  match: MatchCall,
  retPlayerNum: number,
  retPlayerName: string,
  winnerNum: number,
  winnerName: string,
  affiliationFuriganaMap: Record<string, string> = {},
): string {
  const parts: string[] = [];

  parts.push(`${annotate('試合', 'しあい')}のコールをします。`);
  parts.push(`${annotateTerms(addGradePause(match.eventName))}、${annotateTerms(removePositionNumber(match.round))}。`);
  parts.push(`${match.numberA}${annotate('番', 'ばん')}、${nameToken(match.nameA, match.nameAReading)}さん、${affToken(match.affA, affiliationFuriganaMap)}。`);
  parts.push(`${match.numberB}${annotate('番', 'ばん')}、${nameToken(match.nameB, match.nameBReading)}さん、${affToken(match.affB, affiliationFuriganaMap)}。`);
  parts.push(`この${annotate('試合', 'しあい')}は、${retPlayerNum}${annotate('番', 'ばん')}、${nameToken(retPlayerName)}さんのリタイアのため、${winnerNum}${annotate('番', 'ばん')}、${nameToken(winnerName)}さんの${annotate('勝利', 'しょうり')}とします。`);

  return parts.join(' ');
}
