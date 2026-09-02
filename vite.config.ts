import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// ビルド時のタイムスタンプを環境変数として埋め込み
const buildTimestamp = new Date().toLocaleString('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

// https://vite.dev/config/
export default defineConfig({
  base: '/tournament-management-app/',
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 既定の2MiBではメインバンドルがプリキャッシュ対象から外れ、
        // オフライン起動できなくなるため上限を引き上げる。
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // ナビゲーションリクエストはネットワーク優先でキャッシュの陳腐化を防ぐ
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'static-resources',
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      includeAssets: [
        'favicon.ico',
        'favicon-96.png',
        'apple-touch-icon.png',
        'logo.png',
      ],
      manifest: {
        name: '大会運営統合Webアプリケーション',
        short_name: '大会運営アプリ',
        description: '鳥取県テニス協会 大会運営統合Webアプリケーション',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // Android のアダプティブアイコン用（中央80%の安全領域に収めた白背景版）
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
})
