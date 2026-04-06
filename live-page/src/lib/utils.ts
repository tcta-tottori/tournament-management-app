/**
 * 共通ユーティリティ
 */

/** ステータスの日本語表示 */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    waiting: '待機中',
    ready: '準備完了',
    playing: '試合中',
    finished: '終了',
    walkover: '不戦勝',
    bye: 'BYE',
  };
  return labels[status] || status;
}

/** ステータスの色クラス */
export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    waiting: 'text-gray-400',
    ready: 'text-blue-400',
    playing: 'text-orange-400',
    finished: 'text-emerald-400',
    walkover: 'text-gray-500',
  };
  return colors[status] || 'text-gray-400';
}

/** ステータスのバッジ色クラス */
export function statusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    waiting: 'bg-gray-500/20 text-gray-400',
    ready: 'bg-blue-500/20 text-blue-400',
    playing: 'bg-orange-500/20 text-orange-400',
    finished: 'bg-emerald-500/20 text-emerald-400',
    walkover: 'bg-gray-500/20 text-gray-500',
  };
  return classes[status] || 'bg-gray-500/20 text-gray-400';
}

/** 時刻フォーマット（Firestore Timestamp → HH:MM:SS） */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** 日付フォーマット */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  } catch {
    return dateStr;
  }
}

/** 経過時間（分） */
export function elapsedMinutes(updatedAt: number): number {
  return Math.floor((Date.now() - updatedAt) / 60000);
}
