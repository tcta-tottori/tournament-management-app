// =============================================
// サーバーURL自動検出
//
// 開発時: Vite dev server 内蔵の中継サーバー (同一ホスト)
// 本番時: 同一ホスト名のポート 8787 (ローカルネットワーク想定)
// =============================================

/** 中継サーバーURLを自動検出する */
export function getAutoServerUrl(): string {
  // 開発モード: Vite プラグインの中継サーバーを使う
  if (import.meta.env.DEV) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws-sync`;
  }

  // 本番: ローカルネットワークのIPなら同ホストのポート8787を使う
  const hostname = location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.match(/^172\.(1[6-9]|2\d|3[01])\./) ||
    hostname.endsWith('.local');

  if (isLocal) {
    return `ws://${hostname}:8787`;
  }

  // パブリックドメイン (GitHub Pages等) では自動検出不可
  return '';
}
