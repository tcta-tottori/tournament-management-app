import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { callTts, type CallTtsState } from '../../features/broadcast/callTts';

/**
 * コール音声（Gemini TTS）の生成待ちの間、画面下部に小さくステータスを表示する。
 * ブラウザ内蔵音声は生成待ちが無いため、この表示は出ない。
 * ボタン押下から再生開始までの間（ネットワーク待ち）に何も変化が無いと
 * ユーザーが二度押ししてしまうため、視覚的フィードバックを提供する。
 */
export default function VoiceLoadingIndicator() {
  const [state, setState] = useState<CallTtsState>(callTts.state);

  useEffect(() => callTts.subscribe(setState), []);

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
