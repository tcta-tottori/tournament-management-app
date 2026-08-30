// =============================================
// 観戦用URL発行ダイアログ
// 現在のルーム/サーバー情報を埋め込んだ URL を生成し、
// クリップボードコピー用に表示する
// =============================================

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Share2, Info, ExternalLink } from 'lucide-react';
import { DEFAULT_SERVER_URL, PUBLIC_ROOM } from './syncStore';

interface Props {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  serverUrl: string;
}

/**
 * 現在のオリジン + アプリのベースパス + /view/league を組み立てる。
 * ルーム/サーバーがビルド埋め込みの既定値と同じ場合はクエリを省略し、
 * HP に貼りっぱなしにできる短い固定URLを返す。
 */
function buildPublicUrl(roomCode: string, serverUrl: string): string {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (roomCode && roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
  if (serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
  const q = qs.toString();
  return `${origin}${base}/view/league${q ? `?${q}` : ''}`;
}

export default function PublicShareDialog({ open, onClose, roomCode, serverUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => buildPublicUrl(roomCode, serverUrl), [roomCode, serverUrl]);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 古いブラウザ対応
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const share = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: '大会観戦用URL',
        text: '予選リーグ・決勝トーナメント・LIVE を観戦できます',
        url,
      });
    } catch {
      // ユーザーがキャンセルした場合は無視
    }
  };

  const effectiveServer = serverUrl || DEFAULT_SERVER_URL;
  const noServerWarning = !effectiveServer;
  // 既定サーバー & 固定公開ルームでの配信なら、URL は貼りっぱなしにできる固定URL
  const isFixedUrl = !!effectiveServer && (!PUBLIC_ROOM || roomCode === PUBLIC_ROOM);

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-[min(94vw,460px)] max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5" />
            <div>
              <h2 className="text-base font-bold">観戦用URLを発行</h2>
              <p className="text-[10px] text-white/80 mt-0.5">
                参加者・HP掲載向けのURLを共有します
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {noServerWarning && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary-50 border border-primary-200">
              <Info className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <div className="text-[11px] text-primary-700 leading-relaxed">
                <p className="font-bold mb-0.5">中継サーバー未設定</p>
                <p>
                  別端末からの観戦にはWebSocket中継サーバーが必要です。
                  同期設定の「詳細設定」からサーバーURLを入力してください。
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              ルームコード
            </p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <span className="flex-1 text-xl font-mono font-bold text-gray-800 tracking-[0.3em]">
                {roomCode || '未接続'}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                観戦用URL
              </p>
              {isFixedUrl && (
                <span className="text-[9px] font-bold text-primary-700 bg-primary-100 border border-primary-200 rounded-full px-2 py-0.5">
                  固定URL・HP貼りっぱなしOK
                </span>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs font-mono text-gray-800 break-all leading-relaxed">
                {url}
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={copy}
                disabled={!roomCode}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>コピー済</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>URLをコピー</span>
                  </>
                )}
              </button>
              {canShare && (
                <button
                  onClick={share}
                  disabled={!roomCode}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm bg-white border border-gray-200 hover:border-primary-300 hover:text-primary-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Share2 className="w-4 h-4" />
                  <span>共有</span>
                </button>
              )}
              <a
                href={roomCode ? url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm bg-white border border-gray-200 hover:border-primary-300 hover:text-primary-600 transition-all ${
                  !roomCode ? 'pointer-events-none opacity-40' : ''
                }`}
              >
                <ExternalLink className="w-4 h-4" />
                <span>開く</span>
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary-50 border border-primary-100">
            <Info className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-primary-700 leading-relaxed">
              <p className="font-bold mb-0.5">使い方</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>このURLをHPやSNSに掲載、もしくはQRコードに変換して案内できます</li>
                <li>アクセスした端末は読み取り専用で、予選リーグ・決勝トーナメント・LIVEを閲覧できます</li>
                <li>運営端末でスコア等を更新すると、観戦側にもリアルタイム反映されます</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
