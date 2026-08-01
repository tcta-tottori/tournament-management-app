/**
 * 「大会一覧」フォルダに置かれた大会日程表（年度の主催大会一覧）を読み取る。
 *
 * 想定フォーマット（鳥取市テニス協会の年間日程表）:
 *   № / 大会名 / 試合種目 / 期日 / (曜) / 予備日 / 会場 / 予備日会場 / 締切
 *   （見出しセルには全角スペースが入るため、比較時は空白を除去して判定する）
 *
 * ドローファイルの大会名はファイル名由来で表記ゆれが出るため、
 * この一覧から「正式な大会名」を選べるようにするために使う。
 */
import * as XLSX from 'xlsx';

export interface OfficialTournament {
  /** 一覧の № （空欄のこともある） */
  no: string;
  /** 正式な大会名 */
  name: string;
  /** 試合種目（男女シングルス・団体戦 など） */
  category: string;
  /** 期日（M/D（曜）形式に正規化。解釈できなければ原文） */
  date: string;
  /** 予備日（同上。「荒天中止」などの文言が入ることもある） */
  reserveDate: string;
  /** 会場（判別できない場合は空文字） */
  venue: string;
  /** 予備日会場（同上） */
  reserveVenue: string;
  /** 申込締切 */
  deadline: string;
  /** 年度見出し（「令和９年度大会名」などのヘッダーがある場合） */
  season: string;
}

/** ファイル名が「大会日程表」らしいか（ドローファイルと区別する） */
export function isTournamentListFileName(fileName: string): boolean {
  const n = fileName.normalize('NFC').replace(/[\s\u3000]+/g, '');
  return /(大会日程|年間日程|日程表|大会予定|大会一覧|主催大会)/.test(n);
}

/** セル値を1行の文字列に整える（改行は空白へ、前後の全角空白も除去） */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateCell(v);
  return String(v)
    .split(/\r?\n/)
    .map(s => s.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))
    .filter(Boolean)
    .join(' ');
}

/** 比較用キー（空白を除去） */
function key(v: unknown): string {
  return cellText(v).replace(/[\s\u3000]+/g, '');
}

/** Date → 「M/D（曜）」 */
function formatDateCell(d: Date): string {
  if (isNaN(d.getTime())) return '';
  const wd = '日月火水木金土'[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${wd}）`;
}

/** 会場名の正規化。判別できない表記（「テニスコート」だけ等）は空にする */
function normalizeVenue(raw: string): string {
  const t = raw.replace(/[\s\u3000]+/g, '');
  if (!t) return '';
  if (t.includes('ヤマタ')) return 'ヤマタスポーツパーク';
  if (t.includes('千代')) return '千代テニス場';
  // 「テニスコート」のみなど、会場を特定できない文言は採用しない
  if (/^テニスコート$/.test(t)) return '';
  return raw;
}

interface ColMap {
  no: number;
  name: number;
  category: number;
  date: number;
  reserveDate: number;
  venue: number;
  reserveVenue: number;
  deadline: number;
}

/** ヘッダー行から列位置を割り出す（大会名の列が無ければ null） */
function detectColumns(row: unknown[]): ColMap | null {
  const map: ColMap = { no: -1, name: -1, category: -1, date: -1, reserveDate: -1, venue: -1, reserveVenue: -1, deadline: -1 };
  for (let c = 0; c < row.length; c++) {
    const t = key(row[c]);
    if (!t) continue;
    if (map.name < 0 && /大会名$/.test(t)) map.name = c;
    else if (map.category < 0 && /種目/.test(t)) map.category = c;
    else if (map.reserveVenue < 0 && /予備日会場/.test(t)) map.reserveVenue = c;
    else if (map.reserveDate < 0 && /予備日/.test(t)) map.reserveDate = c;
    else if (map.date < 0 && /^期日$/.test(t)) map.date = c;
    else if (map.venue < 0 && /^会場$/.test(t)) map.venue = c;
    else if (map.deadline < 0 && /^締切$/.test(t)) map.deadline = c;
    else if (map.no < 0 && /^(№|no\.?|番号)$/i.test(t)) map.no = c;
  }
  return map.name >= 0 ? map : null;
}

/** ヘッダー行の「令和９年度大会名」から年度を取り出す */
function seasonOf(row: unknown[], nameCol: number): string {
  const t = cellText(row[nameCol]).replace(/[\s\u3000]+/g, '');
  const m = t.match(/^((?:令和|平成|R|H)?[０-９0-9〇一二三四五六七八九十]+年度)/);
  return m ? m[1] : '';
}

/** 期日セル（+ 隣の曜日セル）を読む */
function readDate(row: unknown[], col: number): string {
  if (col < 0) return '';
  const raw = row[col];
  if (raw instanceof Date) return formatDateCell(raw);
  const text = cellText(raw);
  if (!text) return '';
  // 「（日）」のような曜日セルが右隣にある場合は連結する
  const next = cellText(row[col + 1]);
  if (/^[（(].[)）]$/.test(next) && !/[（(].[)）]/.test(text)) return `${text}${next}`;
  return text;
}

/**
 * 大会日程表の Excel を読み、大会一覧を返す。
 * ヘッダー行（「大会名」を含む行）を見つけ、それ以降の行を大会として読み取る。
 * 年度が変わってヘッダーが再登場する場合にも対応する。
 */
export function parseTournamentListExcel(buffer: ArrayBuffer): OfficialTournament[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const results: OfficialTournament[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false, defval: null });

    let cols: ColMap | null = null;
    let season = '';
    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;

      // 表題行（「令和８年度 …大会日程」）から既定の年度を拾う
      if (!cols && !season) {
        const title = row.map(cellText).join(' ').replace(/[\s\u3000]+/g, '');
        const m = title.match(/(?:令和|平成)[０-９0-9〇一二三四五六七八九十]+年度/);
        if (m) season = m[0];
      }

      // ヘッダー行（年度が変わると再登場する）
      const header = detectColumns(row);
      if (header && /大会名$/.test(key(row[header.name]))) {
        cols = header;
        season = seasonOf(row, header.name) || season;
        continue;
      }
      if (!cols) continue;

      const name = cellText(row[cols.name]);
      if (!name) continue;
      // 注意書き行（「〜が必要な大会です。」など）は除外する
      if (/大会です|参加できます|別記のとおり/.test(name)) continue;

      results.push({
        no: cellText(row[cols.no]),
        name,
        category: cellText(row[cols.category]),
        date: readDate(row, cols.date),
        reserveDate: readDate(row, cols.reserveDate),
        venue: normalizeVenue(cellText(row[cols.venue])),
        reserveVenue: normalizeVenue(cellText(row[cols.reserveVenue])),
        deadline: cellText(row[cols.deadline]),
        season,
      });
    }
  }

  return results;
}
