// ヘッダー背景の意匠（赤と白のキューブが流れるアニメーション）。
// メインアプリ(AppLayout)と観戦用ページ(PublicLayout)で共通利用し、見た目を統一する。
//
// 協会サイトのキービジュアル（白地に赤・淡赤・白の四角がランダムに浮かぶ構図）を
// そのまま動かしたもの。四角はひとつずつ左から右へ流れ、大きくなって消えるもの・
// 小さくなって消えるもの・道半ばから現れるものを混ぜている。
// ヘッダーの文字を邪魔しないよう淡く敷いている。

/** 四角の見た目のバリエーション（キービジュアルと同じ5種類） */
type MotifKind = 'solid' | 'white' | 'soft' | 'outline' | 'dots';

/**
 * 動きのバリエーション。
 * grow=大きくなって消える / shrink=小さくなって消える / late=途中から現れる
 */
type MotifMove = 'grow' | 'shrink' | 'late';

interface MotifItem {
  kind: MotifKind;
  move: MotifMove;
  /** 置き場所（ヘッダー幅・高さに対する％） */
  x: number;
  y: number;
  /** 一辺の大きさ(px) */
  size: number;
  /** いちばん濃いときの不透明度 */
  opacity: number;
  /** 1周にかかる秒数 */
  duration: number;
  /** 開始をずらす秒数（負の値で「途中から」始める） */
  delay: number;
}

/**
 * 四角の配置。
 * 毎回同じ絵になるよう固定値で持ち、大小・種類・速さ・動き方をばらけさせて
 * キービジュアルのランダムな粗密を再現している。
 * y は縦にはみ出す値も混ぜて、奥行きのある散らばりに見せる。
 */
const MOTIF_ITEMS: MotifItem[] = [
  { kind: 'soft',    move: 'grow',   x: 2,  y: -18, size: 34, opacity: 0.9,  duration: 15, delay: -2 },
  { kind: 'solid',   move: 'shrink', x: 7,  y: 52,  size: 11, opacity: 1,    duration: 10, delay: -6 },
  { kind: 'white',   move: 'grow',   x: 11, y: 8,   size: 26, opacity: 1,    duration: 13, delay: -9 },
  { kind: 'dots',    move: 'late',   x: 16, y: 24,  size: 26, opacity: 0.8,  duration: 12, delay: -3 },
  { kind: 'outline', move: 'shrink', x: 21, y: 58,  size: 18, opacity: 0.9,  duration: 11, delay: -7 },
  { kind: 'soft',    move: 'grow',   x: 25, y: -8,  size: 22, opacity: 0.85, duration: 14, delay: -11 },
  { kind: 'solid',   move: 'late',   x: 30, y: 34,  size: 8,  opacity: 1,    duration: 9,  delay: -2 },
  { kind: 'white',   move: 'shrink', x: 34, y: 62,  size: 14, opacity: 1,    duration: 12, delay: -8 },
  { kind: 'soft',    move: 'shrink', x: 39, y: 12,  size: 30, opacity: 0.8,  duration: 16, delay: -4 },
  { kind: 'solid',   move: 'grow',   x: 44, y: 40,  size: 20, opacity: 1,    duration: 13, delay: -10 },
  { kind: 'dots',    move: 'grow',   x: 49, y: -6,  size: 22, opacity: 0.75, duration: 11, delay: -6 },
  { kind: 'outline', move: 'late',   x: 53, y: 46,  size: 22, opacity: 0.9,  duration: 13, delay: -12 },
  { kind: 'white',   move: 'grow',   x: 58, y: 18,  size: 18, opacity: 1,    duration: 12, delay: -1 },
  { kind: 'solid',   move: 'shrink', x: 62, y: 66,  size: 9,  opacity: 1,    duration: 9,  delay: -7 },
  { kind: 'soft',    move: 'grow',   x: 66, y: -14, size: 32, opacity: 0.85, duration: 15, delay: -4 },
  { kind: 'white',   move: 'late',   x: 71, y: 36,  size: 24, opacity: 1,    duration: 12, delay: -10 },
  { kind: 'dots',    move: 'shrink', x: 76, y: 56,  size: 24, opacity: 0.8,  duration: 11, delay: -5 },
  { kind: 'soft',    move: 'late',   x: 80, y: 4,   size: 20, opacity: 0.8,  duration: 14, delay: -13 },
  { kind: 'solid',   move: 'grow',   x: 84, y: 44,  size: 13, opacity: 1,    duration: 10, delay: -2 },
  { kind: 'outline', move: 'grow',   x: 88, y: -4,  size: 16, opacity: 0.9,  duration: 12, delay: -8 },
  { kind: 'white',   move: 'shrink', x: 92, y: 60,  size: 12, opacity: 1,    duration: 9,  delay: -4 },
  { kind: 'soft',    move: 'late',   x: 96, y: 20,  size: 28, opacity: 0.85, duration: 15, delay: -11 },
];

export default function HeaderBackdrop() {
  return (
    <div className="header-motif" aria-hidden="true">
      <div className="header-motif-layer">
        {MOTIF_ITEMS.map((item, i) => (
          <span
            key={i}
            className={`header-motif-item header-motif-${item.kind} header-motif-${item.move}`}
            style={{
              '--x': `${item.x}%`,
              '--y': `${item.y}%`,
              '--s': `${item.size}px`,
              '--o': item.opacity,
              '--dur': `${item.duration}s`,
              '--delay': `${item.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
