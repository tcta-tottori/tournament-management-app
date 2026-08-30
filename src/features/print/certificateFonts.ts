// =============================================================================
// 賞状印刷で使うフォント定義
//
// 賞状は毛筆（行書・楷書）で刷ることが多いが、大会や賞状用紙によって
// 明朝が合う場合もある。ここでフォントを一覧で持ち、印刷メニューから
// 選べるようにしている。
//
// Google Fonts の日本語書体はサブセット配信されるため、選んだときに初めて
// 読み込む（起動時に全部読むと重いので loadCertificateFont で都度読み込む）。
// 「PCのフォント」系は Web からは落ちてこないので、Windows / Mac に入っている
// 行書体・楷書体をそのまま使う（入っていなければ游明朝などにフォールバック）。
// =============================================================================

/** フォントの系統（選択UIのグループ見出し） */
export type CertFontGroup = '毛筆' | '楷書・手書き' | '明朝' | 'PCのフォント';

export interface CertFont {
  id: string;
  /** 選択UIに出す名前 */
  label: string;
  group: CertFontGroup;
  /**
   * Google Fonts の family 指定（css2 の family= に渡す文字列）。内蔵フォントは undefined。
   * ウェイト軸を付けない「素の family」も別リンクで必ず読み込むので、
   * ここのウェイト指定が万一使えなくても標準の太さでは表示される。
   */
  google?: string;
  /** 太さ違いが実際に配信されるフォントか（UIの補足表示用） */
  hasRealWeights?: boolean;
  /** CSS の font-family に入れる値（フォールバック込み） */
  stack: string;
  /** 選択UIでの一言説明 */
  note?: string;
}

/** 賞状で選べるフォント一覧 */
export const CERT_FONTS: CertFont[] = [
  // ── 毛筆（習字らしい書体） ────────────────────────────────
  {
    id: 'yuji-syuku',
    label: '筆楷書（Yuji Syuku）',
    group: '毛筆',
    google: 'Yuji+Syuku',
    stack: '"Yuji Syuku", "HG正楷書体-PRO", "游明朝", "Yu Mincho", serif',
    note: '毛筆だが読みやすい楷書寄り。賞状の標準',
  },
  {
    id: 'yuji-mai',
    label: '筆行書（Yuji Mai）',
    group: '毛筆',
    google: 'Yuji+Mai',
    stack: '"Yuji Mai", "HG行書体", "HGP行書体", "游明朝", "Yu Mincho", serif',
    note: '崩し気味の行書。流れのある賞状向き',
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
    id: 'reggae-one',
    label: '極太筆（Reggae One）',
    group: '毛筆',
    google: 'Reggae+One',
    stack: '"Reggae One", "HGP創英角ﾎﾟｯﾌﾟ体", "游ゴシック", sans-serif',
    note: 'かすれのある極太の筆文字',
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
    id: 'stick',
    label: '一筆書き（Stick）',
    group: '毛筆',
    google: 'Stick',
    stack: '"Stick", "游ゴシック", sans-serif',
    note: '線の細い一筆書き風',
  },

  // ── 楷書・手書き ─────────────────────────────────────────
  {
    id: 'klee-one',
    label: '硬筆楷書（Klee One）',
    group: '楷書・手書き',
    google: 'Klee+One:wght@400;600',
    hasRealWeights: true,
    stack: '"Klee One", "UD デジタル 教科書体 NK-R", "游教科書体", serif',
    note: '教科書体に近い手書き楷書',
  },
  {
    id: 'yomogi',
    label: '手書き楷書（Yomogi）',
    group: '楷書・手書き',
    google: 'Yomogi',
    stack: '"Yomogi", "游教科書体", "Klee One", serif',
    note: 'やわらかい手書きの楷書',
  },
  {
    id: 'zen-kurenaido',
    label: '手書き（Zen Kurenaido）',
    group: '楷書・手書き',
    google: 'Zen+Kurenaido',
    stack: '"Zen Kurenaido", "游ゴシック", sans-serif',
    note: 'ペン書きのような手書き文字',
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
    id: 'kiwi-maru',
    label: 'やわらか（Kiwi Maru）',
    group: '楷書・手書き',
    google: 'Kiwi+Maru:wght@300;400;500',
    hasRealWeights: true,
    stack: '"Kiwi Maru", "游明朝", "Yu Mincho", serif',
    note: '角のとれたやさしい書体',
  },

  // ── 明朝（筆の入りが残るものを中心に） ──────────────────────
  {
    id: 'shippori-mincho',
    label: '明朝太（Shippori Mincho B1）',
    group: '明朝',
    google: 'Shippori+Mincho+B1:wght@400;500;600;700;800',
    hasRealWeights: true,
    stack: '"Shippori Mincho B1", "游明朝", "Yu Mincho", serif',
    note: '線が太めで印刷映えする明朝',
  },
  {
    id: 'shippori-mincho-std',
    label: '明朝（Shippori Mincho）',
    group: '明朝',
    google: 'Shippori+Mincho:wght@400;500;600;700;800',
    hasRealWeights: true,
    stack: '"Shippori Mincho", "游明朝", "Yu Mincho", serif',
    note: '筆の運びが残る標準的な明朝',
  },
  {
    id: 'zen-old-mincho',
    label: '古典明朝（Zen Old Mincho）',
    group: '明朝',
    google: 'Zen+Old+Mincho:wght@400;500;600;700;900',
    hasRealWeights: true,
    stack: '"Zen Old Mincho", "游明朝", "Yu Mincho", serif',
    note: '格式のある古風な明朝。太さの幅が広い',
  },
  {
    id: 'noto-serif-jp',
    label: '明朝（Noto Serif JP）',
    group: '明朝',
    google: 'Noto+Serif+JP:wght@200..900',
    hasRealWeights: true,
    stack: '"Noto Serif JP", "游明朝", "Yu Mincho", serif',
    note: '細字から極太まで自由に調整できる',
  },
  {
    id: 'kaisei-tokumin',
    label: '解星 特ミン（Kaisei Tokumin）',
    group: '明朝',
    google: 'Kaisei+Tokumin:wght@400;500;700;800',
    hasRealWeights: true,
    stack: '"Kaisei Tokumin", "游明朝", "Yu Mincho", serif',
    note: '筆の入りが強く残る明朝',
  },
  {
    id: 'kaisei-harunoumi',
    label: '解星 春の海（Kaisei HarunoUmi）',
    group: '明朝',
    google: 'Kaisei+HarunoUmi:wght@400;500;700',
    hasRealWeights: true,
    stack: '"Kaisei HarunoUmi", "游明朝", "Yu Mincho", serif',
    note: 'やわらかく筆味のある明朝',
  },
  {
    id: 'kaisei-opti',
    label: '解星 オプティ（Kaisei Opti）',
    group: '明朝',
    google: 'Kaisei+Opti:wght@400;500;700',
    hasRealWeights: true,
    stack: '"Kaisei Opti", "游明朝", "Yu Mincho", serif',
    note: 'すっきりした筆味の明朝',
  },
  {
    id: 'zen-antique',
    label: '古印風（Zen Antique）',
    group: '明朝',
    google: 'Zen+Antique',
    stack: '"Zen Antique", "游明朝", "Yu Mincho", serif',
    note: '活版のようなレトロな明朝',
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
    id: 'biz-udmincho',
    label: 'UD明朝（BIZ UDMincho）',
    group: '明朝',
    google: 'BIZ+UDMincho',
    stack: '"BIZ UDMincho", "BIZ UDPMincho", "游明朝", "Yu Mincho", serif',
    note: '読みやすさ重視のユニバーサル明朝',
  },

  // ── PCに入っているフォント（Web読み込み不要） ────────────────
  {
    id: 'local-gyosho',
    label: 'HG行書体（PC内蔵）',
    group: 'PCのフォント',
    stack: '"HG行書体", "HGP行書体", "HGS行書体", "游明朝", "Yu Mincho", serif',
    note: 'Windowsの行書体。賞状の定番',
  },
  {
    id: 'local-kaisho',
    label: 'HG正楷書体（PC内蔵）',
    group: 'PCのフォント',
    stack: '"HG正楷書体-PRO", "HG正楷書体", "游明朝", "Yu Mincho", serif',
    note: 'Windowsの正楷書体',
  },
  {
    id: 'local-kyokasho',
    label: '教科書体（PC内蔵）',
    group: 'PCのフォント',
    stack: '"UD デジタル 教科書体 NK-B", "UD デジタル 教科書体 NK-R", "HG教科書体", "游教科書体", serif',
    note: '手本のような楷書。名前が読みやすい',
  },
  {
    id: 'local-mincho-e',
    label: '太明朝（HGP明朝E）',
    group: 'PCのフォント',
    stack: '"HGP明朝E", "HG明朝E", "游明朝 Demibold", "ヒラギノ明朝 ProN W6", serif',
    note: 'Windowsの太い明朝。賞状によく使われる',
  },
  {
    id: 'local-mincho',
    label: '游明朝（PC内蔵）',
    group: 'PCのフォント',
    stack: '"游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", serif',
    note: 'どの端末でもほぼ確実に出る明朝',
  },
];

/** 既定フォント（現行の賞状印刷の設定に合わせた筆楷書） */
export const DEFAULT_CERT_FONT_ID = 'yuji-syuku';

/** idからフォント定義を引く（見つからなければ既定フォント） */
export function getCertFont(id: string): CertFont {
  return CERT_FONTS.find(f => f.id === id)
    ?? CERT_FONTS.find(f => f.id === DEFAULT_CERT_FONT_ID)!;
}

/**
 * Google Fonts の読み込みURL（内蔵フォントなら空配列）。
 *
 * 太さ違いを指定したURLは、そのウェイトが配信されていないと
 * CSSごと読み込めずフォント自体が出なくなる。保険として
 * 「ウェイト指定なしのURL」も必ず併せて読み込み、最低でも標準の太さは出るようにする。
 */
export function certFontCssUrls(font: CertFont): string[] {
  if (!font.google) return [];
  const base = font.google.split(':')[0];
  const urls = [`https://fonts.googleapis.com/css2?family=${base}&display=swap`];
  if (font.google !== base) {
    urls.push(`https://fonts.googleapis.com/css2?family=${font.google}&display=swap`);
  }
  return urls;
}

/**
 * 画面プレビュー用にフォントを読み込む。
 * 一度読み込んだフォントは <link> が残るので二重に足さない。
 */
export function loadCertificateFont(id: string): void {
  if (typeof document === 'undefined') return;
  const font = getCertFont(id);
  certFontCssUrls(font).forEach((url, i) => {
    const linkId = `cert-font-${font.id}-${i}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  });
}
