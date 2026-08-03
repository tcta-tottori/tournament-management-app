// =============================================
// ライブスコア 埋め込みページ（HP貼り付け用）
//
// 運営メニュー・ヘッダー・大会情報を一切出さず、ライブスコアだけを表示する。
// 協会HPの記事内に <iframe> で貼り付けたり、URLをそのまま案内したりする用途。
//
// URL: /embed/livescore?room=XXXX&server=YYY&theme=light|dark|transparent
//   room / server … 運営端末の同期ルーム（省略時は既定の公開ルーム）
//   theme         … 背景色。貼り付け先のページに合わせて選ぶ
// =============================================

import { useSearchParams } from 'react-router-dom';
import LiveScoreBoard from '../livescore/LiveScoreBoard';
import { useVisibleLiveScores } from '../livescore/useVisibleLiveScores';
import { usePublicSync } from './usePublicSync';

export type EmbedTheme = 'light' | 'dark' | 'transparent';

const THEME: Record<EmbedTheme, { wrap: string; text: string }> = {
  light: { wrap: 'bg-white', text: 'text-gray-500' },
  dark: { wrap: 'bg-[#0f3326]', text: 'text-white/60' },
  transparent: { wrap: 'bg-transparent', text: 'text-gray-500' },
};

export default function EmbedLiveScoreView() {
  const [params] = useSearchParams();
  // URL の room / server で運営端末のルームに観戦モードで接続する
  const sync = usePublicSync();
  const { visible } = useVisibleLiveScores();

  const theme = THEME[(params.get('theme') || 'light') as EmbedTheme] ?? THEME.light;
  const connected = sync.connectionState === 'connected';

  return (
    <div className={`min-h-[100dvh] w-full px-2 py-2 ${theme.wrap}`}>
      <div className="max-w-3xl mx-auto space-y-4">
        {visible.length === 0 ? (
          <p className={`py-8 text-center text-sm leading-relaxed ${theme.text}`}>
            {connected
              ? '現在ライブスコアを配信中の試合はありません。'
              : '中継サーバーに接続しています...'}
          </p>
        ) : (
          visible.map(l => (
            <LiveScoreBoard key={`${l.eventId}-${l.matchId}`} live={l} size="md" />
          ))
        )}
      </div>
    </div>
  );
}
