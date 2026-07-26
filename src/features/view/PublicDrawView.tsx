import CourtBracketPage from '../court-bracket/CourtBracketPage';

/**
 * ドロー公開ビュー（個人戦）
 * 運営用の「ドロー」画面（CourtBracketPage）を読み取り専用で再利用する。
 * enableScoreInput=false によりスコア入力は無効（観戦者は閲覧のみ）。
 */
export default function PublicDrawView() {
  // ヘッダー(56px)＋ティッカー(36px)を差し引いた高さでドロー画面を表示
  return (
    <div className="h-[calc(100vh-92px)] min-h-[420px]">
      <CourtBracketPage enableScoreInput={false} />
    </div>
  );
}
