// ヘッダー背景の装飾（ゴールド波型ライン＋金の砂粒）。
// メインアプリ(AppLayout)と観戦用ページ(PublicLayout)で共通利用し、見た目を統一する。

// 金の微粒子 — 空気中に漂う細かい金色パーティクル
// type: 0=微粒子(1-1.5px), 1=小粒子(1.5-2.5px), 2=中粒子(2.5-3.5px, キラッと光る)
const GOLD_DUST_PARTICLES: { x: number; y: number; s: number; o: number; t: number }[] = [];

for (let i = 0; i < 55; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 1.82 + ((i * 7 + 3) % 11) * 0.3) % 100,
    y: ((i * 13 + 5) % 59) + 1,
    s: 1 + ((i * 3) % 4) * 0.15,
    o: 0.5 + ((i * 7) % 5) * 0.06,
    t: 0,
  });
}
for (let i = 0; i < 30; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 3.33 + ((i * 11 + 7) % 13) * 0.5) % 100,
    y: ((i * 17 + 3) % 55) + 3,
    s: 1.5 + ((i * 5) % 5) * 0.2,
    o: 0.5 + ((i * 3) % 6) * 0.06,
    t: 1,
  });
}
for (let i = 0; i < 10; i++) {
  GOLD_DUST_PARTICLES.push({
    x: (i * 10 + ((i * 5 + 2) % 7) * 1.5) % 100,
    y: ((i * 19 + 7) % 50) + 5,
    s: 2.5 + ((i * 3) % 4) * 0.3,
    o: 0.6 + ((i * 7) % 4) * 0.06,
    t: 2,
  });
}

export default function HeaderBackdrop() {
  return (
    <>
      {/* 動的ゴールド波型ライン — アニメーション付き */}
      <div className="header-gold-waves-container">
        <svg className="header-wave header-wave-1" viewBox="0 0 2880 56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gw1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(218,185,92,0.12)" />
              <stop offset="25%" stopColor="rgba(255,215,120,0.28)" />
              <stop offset="50%" stopColor="rgba(218,185,92,0.08)" />
              <stop offset="75%" stopColor="rgba(255,215,120,0.25)" />
              <stop offset="100%" stopColor="rgba(218,185,92,0.12)" />
            </linearGradient>
          </defs>
          <path d="M0,10 C120,4 240,18 360,10 C480,2 600,16 720,8 C840,0 960,18 1080,12 C1200,6 1320,20 1440,10 C1560,4 1680,18 1800,10 C1920,2 2040,16 2160,8 C2280,0 2400,18 2520,12 C2640,6 2760,20 2880,10" fill="none" stroke="url(#gw1)" strokeWidth="1.5" />
          <path d="M0,30 C100,22 200,38 300,28 C400,18 500,40 600,30 C700,20 800,38 900,28 C1000,18 1100,40 1200,30 C1300,22 1400,38 1500,28 C1600,18 1700,40 1800,30 C1900,20 2000,38 2100,28 C2200,18 2300,40 2400,30 C2500,22 2600,38 2700,28 C2800,18 2880,32 2880,30" fill="none" stroke="url(#gw1)" strokeWidth="1" opacity="0.6" />
        </svg>
        <svg className="header-wave header-wave-2" viewBox="0 0 2880 56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gw2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,215,120,0.08)" />
              <stop offset="30%" stopColor="rgba(218,185,92,0.2)" />
              <stop offset="60%" stopColor="rgba(255,215,120,0.15)" />
              <stop offset="100%" stopColor="rgba(218,185,92,0.08)" />
            </linearGradient>
          </defs>
          <path d="M0,20 C180,14 360,28 540,18 C720,8 900,30 1080,22 C1260,14 1440,28 1620,18 C1800,8 1980,30 2160,22 C2340,14 2520,28 2700,18 C2880,8 2880,20 2880,20" fill="none" stroke="url(#gw2)" strokeWidth="1.2" />
          <path d="M0,44 C200,38 400,50 600,42 C800,34 1000,52 1200,44 C1400,36 1600,50 1800,42 C2000,34 2200,52 2400,44 C2600,36 2800,50 2880,44" fill="none" stroke="url(#gw2)" strokeWidth="0.8" opacity="0.5" />
        </svg>
        <svg className="header-wave header-wave-3" viewBox="0 0 1440 56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gw3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(218,185,92,0)" />
              <stop offset="40%" stopColor="rgba(255,225,140,0.18)" />
              <stop offset="60%" stopColor="rgba(255,225,140,0.18)" />
              <stop offset="100%" stopColor="rgba(218,185,92,0)" />
            </linearGradient>
          </defs>
          <path d="M0,28 C240,16 480,40 720,28 C960,16 1200,40 1440,28" fill="none" stroke="url(#gw3)" strokeWidth="1.8" opacity="0.4" />
        </svg>
      </div>

      {/* 金の砂粒エフェクト */}
      <div className="header-gold-dust">
        {GOLD_DUST_PARTICLES.map((p, i) => (
          <span key={i} className={`dust dust-t${p.t}`} style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.s, height: p.s, opacity: p.o,
          }} />
        ))}
      </div>
    </>
  );
}
