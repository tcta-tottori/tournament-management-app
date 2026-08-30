// =============================================================================
// 賞状の印刷用HTMLを組み立てる
//
// 画面プレビューと実際の印刷でズレが出ないよう、どちらも同じHTMLを使う。
// プレビューは <iframe srcdoc> に入れて縮小表示する。
// =============================================================================

import { certFontCssUrls, getCertFont } from './certificateFonts';
import { PAPER_SIZE, type CertEntry, type CertLayout } from './certificateTypes';

/** HTMLに埋め込む文字列をエスケープする */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 改行を <br> にする（エスケープ後） */
function nl2br(s: string): string {
  return esc(s).replace(/\r?\n/g, '<br>');
}

/** 本文テンプレートの差し込み */
export function fillBodyText(template: string, entry: CertEntry): string {
  return template
    .replace(/\{rank\}/g, entry.rank)
    .replace(/\{category\}/g, entry.category)
    .replace(/\{names\}/g, entry.names)
    .replace(/\{affiliation\}/g, entry.affiliation);
}

/** 1枚分のページHTML */
function pageHtml(entry: CertEntry, layout: CertLayout): string {
  const lines: string[] = [];
  if (entry.category.trim()) lines.push(`<div class="cert-category">${esc(entry.category)}</div>`);
  if (entry.rank.trim()) lines.push(`<div class="cert-rank">${esc(entry.rank)}</div>`);
  if (entry.affiliation.trim()) lines.push(`<div class="cert-affiliation">${esc(entry.affiliation)}</div>`);
  if (entry.names.trim()) lines.push(`<div class="cert-name">${esc(entry.names)}</div>`);
  const block = `<div class="cert-block">${lines.join('')}</div>`;

  if (layout.overlay) {
    // 賞状用紙に文字だけ重ねる
    return `<div class="page">${block}</div>`;
  }

  // 枠・題字・本文まで含めて1枚に仕上げる
  const body = fillBodyText(layout.bodyText, entry);
  return `<div class="page">
    <div class="frame-outer"></div>
    <div class="frame-inner"></div>
    <div class="cert-title">${esc(layout.title)}</div>
    ${layout.eventName.trim() ? `<div class="cert-event">${esc(layout.eventName)}</div>` : ''}
    ${block}
    <div class="cert-body">${nl2br(body)}</div>
    <div class="cert-footer">
      ${layout.dateText.trim() ? `<div class="cert-date">${esc(layout.dateText)}</div>` : ''}
      ${layout.organizer.trim() ? `<div class="cert-organizer">${esc(layout.organizer)}</div>` : ''}
    </div>
  </div>`;
}

/** レイアウトからCSSを組み立てる */
function styleHtml(layout: CertLayout): string {
  const paper = PAPER_SIZE[layout.paper];
  const font = getCertFont(layout.fontId);
  const vertical = layout.vertical;

  // 縦書きは列が右→左に進む。縦に伸びるぶん、下端が本文とぶつからないよう
  // 「文字のみ」なら用紙の下まで、枠つきなら本文の手前までを列の高さにする。
  const verticalBottom = layout.overlay ? 92 : 70;
  const blockPosition = vertical
    ? `top:${layout.blockTop}%; left:50%; transform:translateX(calc(-50% + ${layout.offsetX}mm));
       height:${Math.max(20, verticalBottom - layout.blockTop)}%; width:auto;
       writing-mode:vertical-rl; text-orientation:upright;
       display:flex; flex-direction:column; align-items:center; justify-content:flex-start;`
    : `top:${layout.blockTop}%; left:50%; transform:translateX(calc(-50% + ${layout.offsetX}mm));
       width:86%;
       display:flex; flex-direction:column; align-items:center; justify-content:flex-start;`;

  const gapRule = vertical
    ? `margin-left:${layout.lineGap}mm;`
    : `margin-bottom:${layout.lineGap}mm;`;

  /**
   * 字間を付けた行のセンタリング補正。
   * letter-spacing は最後の1文字のうしろにも隙間を作るため、そのままだと
   * 文字全体が半分ぶん左へずれる。同じ量の text-indent を入れて中央に戻す。
   * （字間をマイナスにしたときも同じ理屈で右にずれるのを防げる）
   */
  const spacing = (em: number) => `letter-spacing:${em}em; text-indent:${em}em;`;

  // 毛筆フォントは太さ違いが無いものが多いので、輪郭を太らせて調整できるようにする
  const strokeRule = layout.strokeWidth > 0
    ? `-webkit-text-stroke:${layout.strokeWidth}px currentColor; paint-order:stroke fill;`
    : '';

  return `
  @page { size: ${paper.css}; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: ${font.stack}; color: #000;
    font-weight: ${layout.fontWeight};
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: ${paper.width}mm; height: ${paper.height}mm;
    position: relative; overflow: hidden;
    page-break-after: always; break-after: page;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  .cert-block { position: absolute; ${blockPosition} }
  /* 縦書きで折り返すと行が重なって読めなくなるので、縦書きのときは折り返さない
     （長すぎる場合は文字サイズを下げて調整する） */
  .cert-block > div { white-space: ${vertical ? 'nowrap' : 'pre-wrap'}; text-align: center; ${gapRule} }
  .cert-block > div:last-child { margin: 0; }

  .cert-block > div { ${strokeRule} }
  .cert-category { font-size: ${layout.categorySize}pt; ${spacing(layout.tracking)} }
  .cert-rank { font-size: ${layout.rankSize}pt; ${spacing(layout.tracking + 0.2)} }
  .cert-affiliation { font-size: ${layout.affiliationSize}pt; ${spacing(layout.tracking)} }
  .cert-name { font-size: ${layout.nameSize}pt; ${spacing(layout.tracking)} }

  /* 枠・題字（overlay=false のときだけ使う） */
  .frame-outer { position: absolute; inset: 10mm; border: 2.5mm double #b08b2e; }
  .frame-inner { position: absolute; inset: 14mm; border: 0.4mm solid #d9c07a; }
  .cert-title {
    position: absolute; top: 8%; left: 0; right: 0; text-align: center;
    font-size: ${Math.round(layout.nameSize * 1.15)}pt; ${spacing(0.5)}
    ${strokeRule}
  }
  .cert-event {
    position: absolute; top: 20%; left: 0; right: 0; text-align: center;
    font-size: ${Math.round(layout.categorySize * 0.6)}pt; letter-spacing: 0.25em; color: #333;
  }
  .cert-body {
    position: absolute; bottom: 26%; left: 14%; right: 14%;
    text-align: center; line-height: 2;
    font-size: ${Math.round(layout.categorySize * 0.55)}pt; letter-spacing: 0.12em;
  }
  .cert-footer {
    position: absolute; bottom: 12%; left: 0; right: 0; text-align: center;
    line-height: 2.1;
  }
  .cert-date { font-size: ${Math.round(layout.categorySize * 0.5)}pt; letter-spacing: 0.2em; color: #333; }
  .cert-organizer { font-size: ${Math.round(layout.categorySize * 0.65)}pt; letter-spacing: 0.35em; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }`;
}

/** 印刷用の完全なHTMLを組み立てる */
export function buildCertificateHtml(entries: CertEntry[], layout: CertLayout): string {
  const font = getCertFont(layout.fontId);
  const fontUrls = certFontCssUrls(font);
  // 会場のネット回線が細い／オフラインのときに読み込みで画面が真っ白にならないよう、
  // フォントCSSは描画をブロックしない形（media="print" → onloadで all）で読み込む。
  // 届くまではフォールバック（游明朝など端末内のフォント）で表示される。
  const fontLink = fontUrls.length > 0
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
       <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
       ${fontUrls.map(u => `<link rel="stylesheet" href="${u}" media="print" onload="this.media='all'">
       <noscript><link rel="stylesheet" href="${u}"></noscript>`).join('\n       ')}`
    : '';
  const pages = entries.map(e => pageHtml(e, layout)).join('\n');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>賞状印刷</title>
${fontLink}
<style>${styleHtml(layout)}</style>
</head><body>${pages}</body></html>`;
}

/**
 * プレビュー用HTML（1枚だけ）。
 * 用紙の縁が分かるように薄い枠を足し、iframe に収まるよう縮小する。
 */
export function buildCertificatePreviewHtml(entry: CertEntry, layout: CertLayout): string {
  const base = buildCertificateHtml([entry], layout);
  return base.replace(
    '</style>',
    `
  html, body { background: #f1f5f9; }
  .page { box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
  /* 印字ブロックの位置が分かるよう、プレビューだけ薄いガイドを出す */
  .cert-block::before {
    content: ''; position: absolute; inset: -3mm -4mm;
    border: 0.3mm dashed rgba(217,119,6,0.45); border-radius: 2mm;
    pointer-events: none;
  }
  </style>`,
  );
}
