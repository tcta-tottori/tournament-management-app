// =============================================================================
// 賞状印刷のデータ型
// =============================================================================

/** 賞状1枚分の中身 */
export interface CertEntry {
  id: string;
  /** 印刷対象にするか */
  selected: boolean;
  /** クラス・種目名（例: 一般女子ダブルス / 1位トーナメント） */
  category: string;
  /** 賞位（例: 優勝・準優勝・第3位） */
  rank: string;
  /** 所属・チーム名（任意・氏名の上に小さく入る） */
  affiliation: string;
  /** 氏名（例: 田中・山本　組） */
  names: string;
}

/** 用紙サイズ */
export type CertPaper = 'a4-portrait' | 'a4-landscape' | 'b4-portrait' | 'b4-landscape' | 'b5-portrait' | 'b5-landscape';

/** 用紙サイズの実寸(mm) */
export const PAPER_SIZE: Record<CertPaper, { label: string; width: number; height: number; css: string }> = {
  'a4-portrait': { label: 'A4 縦', width: 210, height: 297, css: 'A4 portrait' },
  'a4-landscape': { label: 'A4 横', width: 297, height: 210, css: 'A4 landscape' },
  'b4-portrait': { label: 'B4 縦', width: 257, height: 364, css: 'B4 portrait' },
  'b4-landscape': { label: 'B4 横', width: 364, height: 257, css: 'B4 landscape' },
  'b5-portrait': { label: 'B5 縦', width: 182, height: 257, css: 'B5 portrait' },
  'b5-landscape': { label: 'B5 横', width: 257, height: 182, css: 'B5 landscape' },
};

/**
 * 賞状のレイアウト設定。
 *
 * `overlay = true`（既定）は、市販の賞状用紙に文字だけを重ねて刷るモード。
 * `overlay = false` にすると枠・「表彰状」の題字・本文・主催者名まで
 * まとめて印刷する（白紙から1枚仕上げたいとき用）。
 */
export interface CertLayout {
  fontId: string;
  paper: CertPaper;
  /** 文字だけ印刷（賞状用紙に重ねる） */
  overlay: boolean;
  /** 縦書きにする */
  vertical: boolean;
  /** 題字（overlay=false のとき印刷） */
  title: string;
  /** 本文テンプレート。{rank} {category} {names} {affiliation} を差し込める */
  bodyText: string;
  /** 大会名（overlay=false のとき本文の上に入る） */
  eventName: string;
  /** 日付 */
  dateText: string;
  /** 主催者名 */
  organizer: string;
  /** 印字ブロックの上端位置（用紙高さに対する%） */
  blockTop: number;
  /** 左右方向の微調整(mm)。プラスで右へ */
  offsetX: number;
  /** 文字サイズ(pt) */
  categorySize: number;
  rankSize: number;
  nameSize: number;
  affiliationSize: number;
  /** 字間(em) */
  tracking: number;
  /** 行間(mm) */
  lineGap: number;
}

/** 既定のレイアウト（従来の賞状印刷に合わせた値） */
export const DEFAULT_CERT_LAYOUT: CertLayout = {
  fontId: 'yuji-mai',
  paper: 'a4-portrait',
  overlay: true,
  vertical: false,
  title: '表 彰 状',
  bodyText: 'あなたは本大会において\n頭書のとおり優秀な成績を収められました\nよってここにこれを賞します',
  eventName: '',
  dateText: '',
  organizer: '鳥取市テニス協会',
  blockTop: 35,
  offsetX: 0,
  categorySize: 28,
  rankSize: 32,
  nameSize: 36,
  affiliationSize: 16,
  tracking: 0.4,
  lineGap: 5,
};

/** 空の賞状エントリーを作る */
export function newCertEntry(patch: Partial<CertEntry> = {}): CertEntry {
  return {
    id: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    selected: true,
    category: '',
    rank: '優勝',
    affiliation: '',
    names: '',
    ...patch,
  };
}
