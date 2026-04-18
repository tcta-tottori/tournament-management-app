import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { geminiTts, type GeminiTtsState } from '../../features/broadcast/geminiTts';

/**
 * Gemini TTS が音声を取得中の間、画面右下に小さくステータスを表示する。
 * ボタン押下から再生開始までの間（ネットワーク待ち）に何も変化が無いと
 * ユーザーが二度押ししてしまうため、視覚的フィードバックを提供する。
 */
export default function GeminiLoadingIndicator() {
  const [state, setState] = useState<GeminiTtsState>(geminiTts.state);

  useEffect(() => geminiTts.subscribe(setState), []);

  if (!state.isLoading) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full shadow-lg text-sm font-medium">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>音声を準備中...</span>
      </div>
    </div>
  );
}
