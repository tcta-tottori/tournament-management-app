// =============================================================================
// 賞状の印刷用HTMLを組み立てる
//
// 画面プレビューと実際の印刷でズレが出ないよう、どちらも同じHTMLを使う。
// プレビューは <iframe srcdoc> に入れて縮小表示する。
// =============================================================================

import { buildFontStack, certFontCssUrls, getCertFont } from './certificateFonts';
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

/**
 * 1枚分のページHTML
 *
 * 氏名の位置を「上下位置」に固定し、賞位・クラス名・所属はその上へ積み上げる。
 * 項目を増やしても氏名が下にずれないので、賞状用紙に合わせた位置合わせが崩れない。
 */
function pageHtml(entry: CertEntry, layout: CertLayout, preview = false): string {
  // 氏名以外は「印刷する項目」で選ばれているものだけ出す（既定は氏名のみ）
  const above: string[] = [];
  if (layout.showCategory && entry.category.trim()) above.push(`<div class="cert-line cert-category">${esc(entry.category)}</div>`);
  if (layout.showRank && entry.rank.trim()) above.push(`<div class="cert-line cert-rank">${esc(entry.rank)}</div>`);
  if (layout.showAffiliation && entry.affiliation.trim()) above.push(`<div class="cert-line cert-affiliation">${esc(entry.affiliation)}</div>`);
  const nameHtml = entry.names.trim() ? `<div class="cert-line cert-name">${esc(entry.names)}</div>` : '';

  const block = nameHtml
    ? `<div class="cert-block">${above.length ? `<div class="cert-above">${above.join('')}</div>` : ''}${nameHtml}</div>`
    // 氏名が空のとき（名前を後から手書きするひな形）は、残りをそのまま基準位置に置く
    : `<div class="cert-block cert-block-flow">${above.join('')}</div>`;

  if (layout.overlay) {
    // 賞状用紙に文字だけ重ねる。
    // プレビューでは用紙の刷り込み部分を薄く敷いて、どのあたりに入るかを見せる。
    const mock = preview && layout.showPaperMock
      ? `<div class="paper-mock">${paperHtml(entry, layout)}</div>`
      : '';
    return `<div class="page">${mock}${block}</div>`;
  }

  // 枠・題字・本文まで含めて1枚に仕上げる
  return `<div class="page">${paperHtml(entry, layout)}${block}</div>`;
}

/**
 * 賞状用紙にあらかじめ刷り込まれている部分（枠・題字・本文・日付・主催者）。
 *
 * 「枠つき」で印刷するときはこれをそのまま刷り、
 * 「文字のみ印刷」のときはプレビューだけに薄く出して位置合わせの目安にする。
 */
function paperHtml(entry: CertEntry, layout: CertLayout): string {
  const body = fillBodyText(layout.bodyText, entry);
  return `<div class="frame-outer"></div>
    <div class="frame-inner"></div>
    <div class="cert-title">${esc(layout.title)}</div>
    ${layout.eventName.trim() ? `<div class="cert-event">${esc(layout.eventName)}</div>` : ''}
    <div class="cert-body">${nl2br(body)}</div>
    <div class="cert-footer">
      ${layout.dateText.trim() ? `<div class="cert-date">${esc(layout.dateText)}</div>` : ''}
      ${layout.organizer.trim() ? `<div class="cert-organizer">${esc(layout.organizer)}</div>` : ''}
      ${layout.signerName.trim() ? `<div class="cert-signer">${esc(layout.signerName)}</div>` : ''}
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
       writing-mode:vertical-rl; text-orientation:upright;`
    : `top:${layout.blockTop}%; left:50%; transform:translateX(calc(-50% + ${layout.offsetX}mm));
       width:86%;`;

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
    font-family: ${buildFontStack(font, layout.customFont)}; color: #000;
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

  /* 氏名の位置がそのまま「上下位置」になる（このブロックは氏名だけを持つ） */
  .cert-block { position: absolute; ${blockPosition} }
  /* 縦書きで折り返すと行が重なって読めなくなるので、縦書きのときは折り返さない
     （長すぎる場合は文字サイズを下げて調整する） */
  .cert-line { white-space: ${vertical ? 'nowrap' : 'pre-wrap'}; text-align: center; ${strokeRule} }

  /* 賞位・クラス名・所属は氏名のすぐ上（縦書きでは右）へ積み上げる。
     論理プロパティなので、横書き・縦書きのどちらでも同じ指定で効く。 */
  .cert-above {
    position: absolute;
    inset-block-end: 100%;
    inset-inline-start: 0; inset-inline-end: 0;
    padding-block-end: ${layout.lineGap}mm;
    display: flex; flex-direction: column; align-items: center;
  }
  .cert-above > .cert-line { margin-block-end: ${layout.lineGap}mm; }
  .cert-above > .cert-line:last-child { margin-block-end: 0; }

  /* 氏名が無いとき（ひな形）は、残りの行をそのまま基準位置に並べる */
  .cert-block-flow { display: flex; flex-direction: column; align-items: center; }
  .cert-block-flow > .cert-line { margin-block-end: ${layout.lineGap}mm; }
  .cert-block-flow > .cert-line:last-child { margin-block-end: 0; }
  .cert-category { font-size: ${layout.categorySize}pt; ${spacing(layout.tracking)} }
  .cert-rank { font-size: ${layout.rankSize}pt; ${spacing(layout.tracking + 0.2)} }
  .cert-affiliation { font-size: ${layout.affiliationSize}pt; ${spacing(layout.tracking)} }
  .cert-name { font-size: ${layout.nameSize}pt; ${spacing(layout.tracking)} }

  /* 枠・題字（overlay=false のときだけ使う） */
  .frame-outer { position: absolute; inset: 10mm; border: 2.5mm double #b08b2e; }
  .frame-inner { position: absolute; inset: 14mm; border: 0.4mm solid #d9c07a; }
  /* 賞状用紙の刷り込み部分。市販の用紙に近い位置に置いてある
     （題字は上から2割、本文は氏名の下、日付・主催者はさらに下） */
  .cert-title {
    position: absolute; top: 18%; left: 0; right: 0; text-align: center;
    font-size: ${Math.round(layout.nameSize * 1.15)}pt; ${spacing(0.5)}
    ${strokeRule}
  }
  .cert-event {
    position: absolute; top: 29%; left: 0; right: 0; text-align: center;
    font-size: ${Math.round(layout.categorySize * 0.6)}pt; letter-spacing: 0.25em; color: #333;
  }
  .cert-body {
    position: absolute; top: 56%; left: 13%; right: 13%;
    text-align: center; line-height: 1.9;
    font-size: ${Math.round(layout.categorySize * 0.6)}pt; letter-spacing: 0.1em;
  }
  .cert-footer {
    position: absolute; top: 70%; left: 0; right: 0; text-align: center;
    line-height: 2.1;
  }
  .cert-date { font-size: ${Math.round(layout.categorySize * 0.5)}pt; letter-spacing: 0.2em; color: #333; }
  .cert-organizer { font-size: ${Math.round(layout.categorySize * 0.6)}pt; letter-spacing: 0.3em; }
  .cert-signer { font-size: ${Math.round(layout.categorySize * 0.8)}pt; letter-spacing: 0.4em; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }`;
}

/** 印刷用の完全なHTMLを組み立てる */
export function buildCertificateHtml(entries: CertEntry[], layout: CertLayout, preview = false): string {
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
  const pages = entries.map(e => pageHtml(e, layout, preview)).join('\n');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>賞状印刷</title>
${fontLink}
<style>${styleHtml(layout)}</style>
</head><body>${pages}</body></html>`;
}

/**
 * プレビュー用HTML（1枚だけ）。
 *
 * 賞状用紙の刷り込み部分（題字・本文・日付・主催者）を薄く敷いて、
 * 実際に刷ったときに文字がどのあたりに入るかを見られるようにしている。
 *
 * @param paperImage 実物の賞状用紙を撮った画像（data URL）。あれば下地として敷く
 */
export function buildCertificatePreviewHtml(
  entry: CertEntry,
  layout: CertLayout,
  paperImage?: string,
): string {
  const base = buildCertificateHtml([entry], layout, true);
  // 実物の写真があるときは、そちらを下地にして作り物の再現は出さない
  const photo = paperImage
    ? `.page::before {
         content: ''; position: absolute; inset: 0;
         background-image: url("${paperImage}");
         background-size: 100% 100%; background-repeat: no-repeat;
         opacity: 0.55; pointer-events: none;
       }
       .paper-mock { display: none; }`
    : '';
  return base.replace(
    '</style>',
    `
  html, body { background: #f4f4f4; }
  .page { box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
  ${photo}
  /* 賞状用紙の刷り込み部分の再現。印刷には出ないので薄く敷くだけ */
  .paper-mock { position: absolute; inset: 0; opacity: 0.3; pointer-events: none; }
  /* 印字位置が分かるよう、プレビューだけ薄いガイドを出す（氏名と、その上の行） */
  .cert-block::before, .cert-above::before {
    content: ''; position: absolute; inset: -3mm -4mm;
    border: 0.3mm dashed rgba(190,30,45,0.5); border-radius: 2mm;
    pointer-events: none;
  }

  </style>`,
  );
}
