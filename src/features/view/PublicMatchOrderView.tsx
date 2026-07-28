import MatchManager from '../referee/MatchManager';

/**
 * 対戦順 公開ビュー（個人戦）
 * 運営用の「対戦順」画面（MatchManager）を読み取り専用で再利用する。
 * readOnly により、コントロールパネル・コール・印刷・スコア入力などの操作を無効化し、
 * 観戦者は対戦順・コート・進行状況（試合中/控え/終了）を閲覧できる。
 */
export default function PublicMatchOrderView() {
  return (
    <div className="h-[calc(100dvh-92px)] min-h-[420px] overflow-auto">
      <MatchManager readOnly />
    </div>
  );
}
