import LiveDashboard from '../live/LiveDashboard';

/**
 * LIVE公開ビュー
 * 既存の LiveDashboard を読み取り専用で再利用する。
 * LiveDashboard 自体が編集UIを含まないため、そのまま表示できる。
 */
export default function PublicLiveView() {
  return (
    <div className="-mx-3 md:-mx-4">
      <LiveDashboard />
    </div>
  );
}
