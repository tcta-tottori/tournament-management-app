// =============================================
// 同期設定パネル
// ルームの作成・参加、接続設定、接続端末一覧
// =============================================

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Wifi, WifiOff, Monitor, Smartphone,
  Copy, Check, Play, Square, Settings2,
  Users, RefreshCw, AlertCircle, Info,
} from 'lucide-react';
import { useSyncStore, generateRoomCode } from './syncStore';
import { syncEngine } from './syncEngine';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SyncPanel({ open, onClose }: Props) {
  const {
    deviceName, serverUrl, connectionState, roomCode,
    peers, syncEnabled, lastSyncAt, error, lastRoomCode,
    deviceId,
    setDeviceName, setServerUrl,
  } = useSyncStore();

  const [editingServerUrl, setEditingServerUrl] = useState(serverUrl);
  const [editingDeviceName, setEditingDeviceName] = useState(deviceName);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ルーム作成
  const handleCreateRoom = useCallback(() => {
    const code = generateRoomCode();
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(code, editingServerUrl || undefined);
  }, [editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // ルーム参加
  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(code, editingServerUrl || undefined);
  }, [joinCode, editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // 前回のルームに再接続
  const handleRejoin = useCallback(() => {
    if (!lastRoomCode) return;
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(lastRoomCode, editingServerUrl || undefined);
  }, [lastRoomCode, editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // 切断
  const handleDisconnect = useCallback(() => {
    syncEngine.stop();
  }, []);

  // ルームコードをコピー
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  if (!open) return null;

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-[min(92vw,440px)] max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="flex items-center gap-2.5">
            {isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5 opacity-60" />}
            <div>
              <h2 className="text-base font-bold">マルチデバイス同期</h2>
              <p className="text-[10px] text-white/70 mt-0.5">複数端末でリアルタイム編集</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* 接続中の場合 */}
          {syncEnabled ? (
            <>
              {/* 接続ステータス */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                isConnected
                  ? 'bg-emerald-50 border-emerald-200'
                  : isConnecting
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${
                    isConnected ? 'text-emerald-700' : isConnecting ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {isConnected ? '接続中' : isConnecting ? '接続中...' : '切断'}
                  </p>
                  {lastSyncAt && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      最終同期: {new Date(lastSyncAt).toLocaleTimeString('ja-JP')}
                    </p>
                  )}
                </div>
              </div>

              {/* ルームコード */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">ルームコード</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-2xl font-mono font-bold text-slate-800 tracking-[0.3em]">
                    {roomCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'コピー済' : 'コピー'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  他の端末でこのコードを入力して同じルームに参加できます
                </p>
              </div>

              {/* 接続中の端末一覧 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-600">
                    接続端末 ({peers.length + 1})
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {/* 自分自身 */}
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <Monitor className="w-4 h-4 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {deviceName} <span className="text-blue-500">(この端末)</span>
                      </p>
                      <p className="text-[10px] text-slate-400">{deviceId.slice(0, 12)}...</p>
                    </div>
                  </div>
                  {/* ピア */}
                  {peers.map((peer) => (
                    <div key={peer.deviceId} className="flex items-center gap-3 px-4 py-2.5">
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{peer.deviceName}</p>
                        <p className="text-[10px] text-slate-400">
                          最終通信: {new Date(peer.lastSeen).toLocaleTimeString('ja-JP')}
                        </p>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                  {peers.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center">
                      他の端末が参加するのを待っています...
                    </div>
                  )}
                </div>
              </div>

              {/* エラー表示 */}
              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm border bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1 text-xs">{error}</span>
                </div>
              )}

              {/* 切断ボタン */}
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 transition-all active:scale-[0.98]"
              >
                <Square className="w-4 h-4" />
                <span>同期を停止</span>
              </button>
            </>
          ) : (
            <>
              {/* 未接続の場合 */}
              {/* 端末名 */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  この端末の名前
                </label>
                <input
                  type="text"
                  value={editingDeviceName}
                  onChange={(e) => setEditingDeviceName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all"
                  placeholder="例: 受付iPad"
                />
              </div>

              {/* ルーム作成 */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <h3 className="text-xs font-bold text-blue-800 mb-2">新しいルームを作成</h3>
                <p className="text-[10px] text-blue-600 mb-3">
                  最初の端末でルームを作成し、他の端末にルームコードを共有します
                </p>
                <button
                  onClick={handleCreateRoom}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md transition-all active:scale-[0.98]"
                >
                  <Play className="w-4 h-4" />
                  <span>ルームを作成</span>
                </button>
              </div>

              {/* ルーム参加 */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 mb-2">既存のルームに参加</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 text-sm font-mono tracking-wider rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all uppercase"
                    placeholder="コードを入力"
                    maxLength={8}
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={joinCode.trim().length < 4}
                    className="px-4 py-2 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-800 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    参加
                  </button>
                </div>
              </div>

              {/* 前回のルームに再接続 */}
              {lastRoomCode && (
                <button
                  onClick={handleRejoin}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>前回のルーム ({lastRoomCode}) に再接続</span>
                </button>
              )}

              {/* 詳細設定 */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                <span>詳細設定 {showAdvanced ? '▲' : '▼'}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      中継サーバーURL (別端末同期用)
                    </label>
                    <input
                      type="text"
                      value={editingServerUrl}
                      onChange={(e) => setEditingServerUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all"
                      placeholder="ws://192.168.1.100:8787"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      未設定の場合、同一端末の複数タブ間のみ同期されます
                    </p>
                  </div>
                </div>
              )}

              {/* 説明 */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-amber-700 leading-relaxed">
                  <p className="font-bold mb-0.5">マルチデバイス同期について</p>
                  <p>同じルームに接続した端末間で、エントリー・スコア等のデータがリアルタイムに同期されます。</p>
                  <p className="mt-1">別端末間の同期には中継サーバーが必要です。同一端末の別タブ間はサーバー不要で同期できます。</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
