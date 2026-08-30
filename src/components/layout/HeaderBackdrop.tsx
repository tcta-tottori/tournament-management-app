// ヘッダー背景の意匠（赤と白のキューブが流れるアニメーション）。
// メインアプリ(AppLayout)と観戦用ページ(PublicLayout)で共通利用し、見た目を統一する。
//
// 協会サイトのキービジュアル（白地に赤・淡赤・白の四角がランダムに浮かぶ構図）を、
// キューブの群れごと右下へゆっくり流している。ひとつずつ現れて消えるのではなく、
// 絵全体が同じ速さで流れるので、動きが途切れずに続いて見える。
//
// ＜継ぎ目なく永久に流すしくみ＞
// 四角の並びを TILE_W × TILE_H の「タイル」1枚として作り、それを SVG の pattern で
// 縦横に敷き詰めている。流す距離をちょうどタイル1枚ぶん（右へ TILE_W・下へ TILE_H）に
// すると、流し終わった瞬間の絵は流し始めの絵とまったく同じになる。そのまま先頭に
// 戻してもどこにも継ぎ目が出ないので、ずっと流しっぱなしにできる。

import { memo } from 'react';

/** 四角の見た目のバリエーション（キービジュアルと同じ種類） */
type MotifKind = 'red' | 'white' | 'plate' | 'frame' | 'line' | 'dots';

interface Motif {
  kind: MotifKind;
  /** タイル内の置き場所(px) */
  x: number;
  y: number;
  /** 一辺の大きさ(px) */
  size: number;
}

/**
 * 敷き詰めるタイルの大きさ(px)。
 * 幅はヘッダー幅と同じくらい大きく取り、同じ並びが横に何度も出て見えないようにする。
 * 高さと幅の比（0.15）がそのまま流れる向き＝右へ進みながら少し下がる角度になる。
 */
const TILE_W = 1120;
const TILE_H = 168;

/** タイル1枚ぶん流れきるのにかける秒数（＝ループ1周） */
const FLOW_DURATION = 40;

/** 決まった並びを毎回同じに作るための擬似乱数（mulberry32） */
function createRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * タイル1枚ぶんの四角の並びを作る。
 * 升目をひとつずつ埋めながら位置と大きさをばらすことで、
 * キービジュアルのようなランダムな粗密（大きいキューブの間に小さな粒）を作っている。
 */
function buildTile(): Motif[] {
  const rand = createRandom(20250830);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const items: Motif[] = [];

  // --- 主役の四角（中〜大）: 12列×4行の升目にひとつずつ ---
  const mainKinds: MotifKind[] = [
    'red', 'red', 'red', 'white', 'white', 'white', 'plate', 'plate', 'frame', 'line',
  ];
  const cols = 12;
  const rows = 4;
  const cellW = TILE_W / cols;
  const cellH = TILE_H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kind = pick(mainKinds);
      // 大きいものはたまに、ほとんどは中くらい。手前と奥の遠近を出す
      const depth = rand();
      const base = depth > 0.9 ? 28 + rand() * 12 : depth > 0.6 ? 20 + rand() * 10 : 11 + rand() * 10;
      const size = kind === 'frame' || kind === 'line' ? base * 0.8 : base;
      items.push({
        kind,
        x: c * cellW + rand() * (cellW - size * 0.5),
        y: r * cellH + rand() * (cellH - size * 0.5),
        size,
      });
    }
  }

  // --- 脇役の小さな粒: 16列×3行の升目に散らす ---
  const dustKinds: MotifKind[] = ['red', 'red', 'white', 'white', 'plate', 'line'];
  const dustCols = 16;
  const dustRows = 3;
  const dustW = TILE_W / dustCols;
  const dustH = TILE_H / dustRows;
  for (let r = 0; r < dustRows; r++) {
    for (let c = 0; c < dustCols; c++) {
      items.push({
        kind: pick(dustKinds),
        x: c * dustW + rand() * dustW * 0.7,
        y: r * dustH + rand() * dustH * 0.85,
        size: 4 + rand() * 7,
      });
    }
  }

  // --- 赤いドットの面（キービジュアルの網点）---
  for (let i = 0; i < 5; i++) {
    items.push({
      kind: 'dots',
      x: (i + rand() * 0.8) * (TILE_W / 5),
      y: rand() * (TILE_H - 26),
      size: 20 + rand() * 8,
    });
  }

  return items;
}

/**
 * タイルの端にかかる四角を、隣のタイルからはみ出してくるぶんとして複製する。
 * pattern はタイルの外側を切り落とすので、これをやらないと端の四角が欠けてしまう。
 */
function wrapAcrossEdges(items: Motif[]): Motif[] {
  const wrapped: Motif[] = [];
  for (const m of items) {
    // 立体の厚みぶん右下に張り出すので、判定は少し大きめに取る
    const pad = m.size * 1.25 + 4;
    for (const ox of [-1, 0, 1]) {
      for (const oy of [-1, 0, 1]) {
        const x = m.x + ox * TILE_W;
        const y = m.y + oy * TILE_H;
        if (x + pad <= 0 || x >= TILE_W || y + pad <= 0 || y >= TILE_H) continue;
        wrapped.push({ ...m, x, y });
      }
    }
  }
  return wrapped;
}

const TILE_ITEMS = wrapAcrossEdges(buildTile());

/** 座標の桁を落として書き出す（描画結果は変わらず、DOM が軽くなる） */
const n = (v: number) => Math.round(v * 10) / 10;

/** 四角ひとつぶんの描画。solid は立体（右下に厚みと影）に見せる */
function renderMotif(m: Motif, key: string, redFill: string, whiteFill: string) {
  const { x, y } = m;
  const s = n(m.size);

  switch (m.kind) {
    // 赤・白のキューブ（右下に厚みを付け、うっすら影を落とす）
    case 'red':
    case 'white': {
      const red = m.kind === 'red';
      const d = Math.max(1.5, m.size * 0.14);
      const x0 = n(x);
      const y0 = n(y);
      const x1 = n(x + m.size);
      const y1 = n(y + m.size);
      const x2 = n(x + m.size + d);
      const y2 = n(y + m.size + d);
      return (
        <g key={key}>
          <rect
            x={n(x + d * 1.2)} y={n(y + d * 1.6)} width={s} height={s}
            fill={red ? '#8c2220' : '#141414'} opacity={red ? 0.1 : 0.07}
          />
          {/* 右の側面 */}
          <path d={`M${x1} ${y0}L${x2} ${n(y + d)}L${x2} ${y2}L${x1} ${y1}Z`} fill={red ? '#ad2c29' : '#eaeaea'} />
          {/* 下の側面 */}
          <path d={`M${x0} ${y1}L${x1} ${y1}L${x2} ${y2}L${n(x + d)} ${y2}Z`} fill={red ? '#9c2724' : '#dcdcdc'} />
          {/* 手前の面 */}
          <rect x={x0} y={y0} width={s} height={s} fill={red ? redFill : whiteFill} />
        </g>
      );
    }

    // 半透明の淡い赤の板
    case 'plate':
      return (
        <rect
          key={key} x={n(x)} y={n(y)} width={s} height={s}
          fill="rgba(198, 56, 52, 0.2)" stroke="rgba(198, 56, 52, 0.26)" strokeWidth={1}
        />
      );

    // 太い赤の枠（奥にもう一枚重ねて厚みを出す）
    case 'frame': {
      const w = Math.max(2, m.size * 0.2);
      const d = Math.max(1, m.size * 0.09);
      return (
        <g key={key}>
          <rect x={n(x + d)} y={n(y + d)} width={s} height={s} fill="none" stroke="#9c2724" strokeWidth={n(w)} />
          <rect x={n(x)} y={n(y)} width={s} height={s} fill="none" stroke="#c63834" strokeWidth={n(w)} />
        </g>
      );
    }

    // 細い赤の線だけの四角
    case 'line':
      return (
        <rect
          key={key} x={n(x)} y={n(y)} width={s} height={s}
          fill="none" stroke="#c63834" strokeWidth={1} opacity={0.7}
        />
      );

    // 赤い網点
    case 'dots': {
      const step = 5;
      const count = Math.max(3, Math.round(m.size / step));
      const dots = [];
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          dots.push(
            <circle key={`${r}-${c}`} cx={n(x + c * step)} cy={n(y + r * step)} r={0.9} />,
          );
        }
      }
      return <g key={key} fill="#c63834" opacity={0.5}>{dots}</g>;
    }
  }
}

function HeaderBackdrop() {
  // 同じページに2つ置かれても参照が混ざらないよう、id はこのファイル内で固定の接頭辞にする
  const patternId = 'header-motif-tile';
  const redId = 'header-motif-red';
  const whiteId = 'header-motif-white';

  return (
    <div className="header-motif" aria-hidden="true">
      <svg
        className="header-motif-flow"
        style={{
          '--tile-w': `${TILE_W}px`,
          '--tile-h': `${TILE_H}px`,
          '--flow-dur': `${FLOW_DURATION}s`,
        } as React.CSSProperties}
      >
        <defs>
          <linearGradient id={redId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e04a46" />
            <stop offset="100%" stopColor="#c63834" />
          </linearGradient>
          <linearGradient id={whiteId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f2f2f2" />
          </linearGradient>
          {/* タイル1枚を縦横に敷き詰める。流す距離をタイル1枚ぶんにするとループが繋がる */}
          <pattern id={patternId} patternUnits="userSpaceOnUse" width={TILE_W} height={TILE_H}>
            {TILE_ITEMS.map((m, i) => renderMotif(m, String(i), `url(#${redId})`, `url(#${whiteId})`))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

// 中身は固定の絵なので、親（ヘッダー）が再描画されても作り直さない
export default memo(HeaderBackdrop);
