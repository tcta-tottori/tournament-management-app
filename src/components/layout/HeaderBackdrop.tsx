// ヘッダー背景の装飾。
// メインアプリ(AppLayout)と観戦用ページ(PublicLayout)で共通利用し、見た目を統一する。
//
// トンマナは協会サイトと同じ「白ベース＋赤の差し色」。
// 地は白のまま、右側にごく淡い赤のグラデーションを敷くだけにしている。
export default function HeaderBackdrop() {
  return <div className="header-accent-wash" aria-hidden="true" />;
}
