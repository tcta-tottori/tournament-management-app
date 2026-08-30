// =============================================================================
// 賞状印刷で使うフォント定義
//
// 賞状は毛筆（行書・楷書）で刷ることが多いが、大会や賞状用紙によって
// 明朝が合う場合もある。ここでフォントを一覧で持ち、印刷メニューから
// 選べるようにしている。
//
// Google Fonts の日本語書体はサブセット配信されるため、選んだときに初めて
// 読み込む（起動時に全部読むと重いので loadCertificateFont で都度読み込む）。
// 「PCのフォント」系は Web からは落ちてこないので、Windows に入っている
// 行書体・楷書体をそのまま使う（入っていなければ游明朝などにフォールバック）。
// =============================================================================

/** フォントの系統（選択UIのグループ見出し） */
export type CertFontGroup = '毛筆' | '楷書・手書き' | '明朝' | 'PCのフォント';

export interface CertFont {
  id: string;
  /** 選択UIに出す名前 */
  label: string;
  group: CertFontGroup;
  /** Google Fonts の family 指定（css2 の family= に渡す文字列）。内蔵フォントは undefined */
  google?: string;
  /** CSS の font-family に入れる値（フォールバック込み） */
  stack: string;
  /** 選択UIでの一言説明 */
  note?: string;
}

/** 賞状で選べるフォント一覧 */
export const CERT_FONTS: CertFont[] = [
  {
    id: 'yuji-mai',
    label: '筆行書（Yuji Mai）',
    group: '毛筆',
    google: 'Yuji+Mai',
    stack: '"Yuji Mai", "HG行書体", "HGP行書体", "游明朝", "Yu Mincho", serif',
    note: '崩し気味の行書。賞状の定番',
  },
  {
    id: 'yuji-syuku',
    label: '筆楷書（Yuji Syuku）',
    group: '毛筆',
    google: 'Yuji+Syuku',
    stack: '"Yuji Syuku", "HG正楷書体-PRO", "游明朝", "Yu Mincho", serif',
    note: '毛筆だが読みやすい楷書寄り',
  },
  {
    id: 'yuji-boku',
    label: '太筆（Yuji Boku）',
    group: '毛筆',
    google: 'Yuji+Boku',
    stack: '"Yuji Boku", "HG行書体", "游明朝", "Yu Mincho", serif',
    note: '線が太く、遠目でも映える',
  },
  {
    id: 'yusei-magic',
    label: '筆ペン風（Yusei Magic）',
    group: '毛筆',
    google: 'Yusei+Magic',
    stack: '"Yusei Magic", "HGP創英角ﾎﾟｯﾌﾟ体", sans-serif',
    note: 'やわらかい筆ペン調',
  },
  {
    id: 'klee-one',
    label: '硬筆楷書（Klee One）',
    group: '楷書・手書き',
    google: 'Klee+One:wght@400;600',
    stack: '"Klee One", "UD デジタル 教科書体 NK-R", "游教科書体", serif',
    note: '教科書体に近い手書き楷書',
  },
  {
    id: 'zen-kurenaido',
    label: '手書き（Zen Kurenaido）',
    group: '楷書・手書き',
    google: 'Zen+Kurenaido',
    stack: '"Zen Kurenaido", "游ゴシック", sans-serif',
    note: 'やわらかい手書き文字',
  },
  {
    id: 'new-tegomin',
    label: '手書き明朝（New Tegomin）',
    group: '楷書・手書き',
    google: 'New+Tegomin',
    stack: '"New Tegomin", "游明朝", "Yu Mincho", serif',
    note: '手書き感のある明朝',
  },
  {
    id: 'shippori-mincho',
    label: '明朝太（Shippori Mincho B1）',
    group: '明朝',
    google: 'Shippori+Mincho+B1:wght@400;700',
    stack: '"Shippori Mincho B1", "游明朝", "Yu Mincho", serif',
    note: '線が太めで印刷映えする明朝',
  },
  {
    id: 'zen-old-mincho',
    label: '古典明朝（Zen Old Mincho）',
    group: '明朝',
    google: 'Zen+Old+Mincho:wght@400;700;900',
    stack: '"Zen Old Mincho", "游明朝", "Yu Mincho", serif',
    note: '格式のある古風な明朝',
  },
  {
    id: 'kaisei-tokumin',
    label: '解星（Kaisei Tokumin）',
    group: '明朝',
    google: 'Kaisei+Tokumin:wght@400;700',
    stack: '"Kaisei Tokumin", "游明朝", "Yu Mincho", serif',
    note: '筆の入りが残る明朝',
  },
  {
    id: 'hina-mincho',
    label: '細明朝（Hina Mincho）',
    group: '明朝',
    google: 'Hina+Mincho',
    stack: '"Hina Mincho", "游明朝", "Yu Mincho", serif',
    note: '細くて上品な明朝',
  },
  {
    id: 'local-gyosho',
    label: 'HG行書体（PC内蔵）',
    group: 'PCのフォント',
    stack: '"HG行書体", "HGP行書体", "HGS行書体", "游明朝", "Yu Mincho", serif',
    note: 'Windowsの行書体。入っていない端末では游明朝になる',
  },
  {
    id: 'local-kaisho',
    label: 'HG正楷書体（PC内蔵）',
    group: 'PCのフォント',
    stack: '"HG正楷書体-PRO", "HG正楷書体", "游明朝", "Yu Mincho", serif',
    note: 'Windowsの正楷書体',
  },
  {
    id: 'local-mincho',
    label: '游明朝（PC内蔵）',
    group: 'PCのフォント',
    stack: '"游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", serif',
    note: 'どの端末でもほぼ確実に出る明朝',
  },
];

/** 既定フォント（従来の賞状印刷と同じ Yuji Mai） */
export const DEFAULT_CERT_FONT_ID = 'yuji-mai';

/** idからフォント定義を引く（見つからなければ既定フォント） */
export function getCertFont(id: string): CertFont {
  return CERT_FONTS.find(f => f.id === id)
    ?? CERT_FONTS.find(f => f.id === DEFAULT_CERT_FONT_ID)!;
}

/** Google Fonts の読み込みURL（内蔵フォントなら null） */
export function certFontCssUrl(font: CertFont): string | null {
  if (!font.google) return null;
  return `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
}

/**
 * 画面プレビュー用にフォントを読み込む。
 * 一度読み込んだフォントは <link> が残るので二重に足さない。
 */
export function loadCertificateFont(id: string): void {
  if (typeof document === 'undefined') return;
  const font = getCertFont(id);
  const url = certFontCssUrl(font);
  if (!url) return;
  const linkId = `cert-font-${font.id}`;
  if (document.getElementById(linkId)) return;
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
