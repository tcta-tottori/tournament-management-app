import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, RefreshCw, Square, Volume2, X } from 'lucide-react';
import {
  GEMINI_VOICES,
  getVoiceSettings,
  setVoiceSettings,
} from '../../features/broadcast/voiceConfig';
import { geminiTts } from '../../features/broadcast/geminiTts';
import { useGeminiTts } from '../../features/broadcast/useGeminiTts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function VoiceSettingsDialog({ open, onClose }: Props) {
  const initial = getVoiceSettings();
  const [serverUrl, setServerUrl] = useState(initial.serverUrl);
  const [voiceName, setVoiceName] = useState(initial.voiceName);
  const [styleInstruction, setStyleInstruction] = useState(initial.styleInstruction);
  const [status, setStatus] = useState<{ available: boolean; model?: string; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const { isSpeaking, speak, stop } = useGeminiTts();

  // 開くたびに最新の設定を反映
  useEffect(() => {
    if (open) {
      const cur = getVoiceSettings();
      setServerUrl(cur.serverUrl);
      setVoiceName(cur.voiceName);
      setStyleInstruction(cur.styleInstruction);
    }
  }, [open]);

  const persist = useCallback((patch: Partial<{ serverUrl: string; voiceName: string; styleInstruction: string }>) => {
    setVoiceSettings(patch);
  }, []);

  const handleCheck = useCallback(async () => {
    // 一旦保存してから接続確認
    persist({ serverUrl });
    setChecking(true);
    try {
      const res = await geminiTts.checkAvailability();
      setStatus(res);
    } finally {
      setChecking(false);
    }
  }, [persist, serverUrl]);

  useEffect(() => {
    if (open) handleCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleTest = () => {
    persist({ serverUrl, voiceName, styleInstruction });
    speak('音声テストです。放送コールシステムをご利用いただきありがとうございます。', { repeatCount: 1 });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            <h3 className="font-black">音声設定（Gemini TTS）</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* 接続ステータス */}
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
            status?.available ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
          }`}>
            <span className="text-lg">{status?.available ? '\u2728' : '\u26A0\uFE0F'}</span>
            <div className="flex-1 text-xs">
              {status === null ? (
                <span className="text-gray-500">接続確認中...</span>
              ) : status.available ? (
                <>
                  <div className="font-bold text-emerald-700">接続OK</div>
                  <div className="text-emerald-600">{status.model || 'Gemini TTS'}</div>
                </>
              ) : (
                <>
                  <div className="font-bold text-red-700">未接続</div>
                  <div className="text-red-600 break-all">
                    {status.error ? `エラー: ${status.error}` : 'GEMINI_API_KEY が未設定か、中継サーバーに接続できません'}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleCheck}
              disabled={checking}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
              確認
            </button>
          </div>

          {/* 中継サーバーURL */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">中継サーバーURL</label>
            <input
              type="text"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              onBlur={() => persist({ serverUrl })}
              placeholder="http://192.168.1.100:8787"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              GEMINI_API_KEY を設定した sync-server の HTTP URL を指定します。
            </p>
          </div>

          {/* 音声選択 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">音声</label>
            <select
              value={voiceName}
              onChange={e => { setVoiceName(e.target.value); persist({ voiceName: e.target.value }); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            >
              {GEMINI_VOICES.map(v => (
                <option key={v.name} value={v.name}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* スタイル指示 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">話し方の指示（自然言語）</label>
            <textarea
              value={styleInstruction}
              onChange={e => setStyleInstruction(e.target.value)}
              onBlur={() => persist({ styleInstruction })}
              rows={3}
              placeholder="例: 落ち着いた女性アナウンサーの声で、はっきりと丁寧に読み上げてください"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-y"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              感情・話速・トーンなどを自然言語で指定できます（例:「明るく元気に」）。
            </p>
          </div>

          {/* テスト / 停止 */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {isSpeaking ? (
              <button
                onClick={stop}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors"
              >
                <Square className="w-4 h-4" />
                停止
              </button>
            ) : (
              <button
                onClick={handleTest}
                disabled={!status?.available}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className="w-4 h-4" />
                音声テスト
              </button>
            )}
          </div>

          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-snug">
            HTTPS でホストされたアプリから HTTP の sync-server へは接続できません（mixed content）。
            大会当日はローカルで <code className="bg-amber-100 px-1 rounded">npm run dev</code> を実行するか、
            sync-server を HTTPS でホストしてください。
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
