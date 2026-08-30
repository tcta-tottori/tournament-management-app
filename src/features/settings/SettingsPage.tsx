// =============================================================================
// 設定ページ
//
// メニュー下部に散らばっていた「同期」「観戦用ページ」「音声」を1か所にまとめ、
// バックアップもこのページに集約する。メニューの下部は協会ロゴとバージョンだけにする。
// =============================================================================

import { useMemo, useState } from 'react';
import {
  Settings, Wifi, WifiOff, Loader2, AlertTriangle, Eye, Volume2,
  ExternalLink, Copy, Check, Shield, ChevronRight,
} from 'lucide-react';
import { useSyncStore, DEFAULT_SERVER_URL, PUBLIC_ROOM } from '../sync/syncStore';
import SyncPanel from '../sync/SyncPanel';
import VoiceSettingsDialog from '../../components/ui/VoiceSettingsDialog';
import BackupPage from '../backup/BackupPage';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { getVoiceSettings } from '../broadcast/voiceConfig';

/** セクションの共通枠（バックアップ画面と同じ体裁） */
function SectionCard({
  icon, title, description, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-white text-gray-600 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

/** 設定を開くボタン（セクション内の主ボタン） */
function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl font-semibold bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
    >
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 shrink-0" />
    </button>
  );
}

export default function SettingsPage() {
  const [syncOpen, setSyncOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { syncEnabled, connectionState, roomCode, serverUrl, peers, pendingChanges } = useSyncStore();
  const isMixedImported = useMixedStore((s) => s.isImported);
  const isTeamImported = useTeamStore((s) => s.isImported);

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isDisconnectedWarn = syncEnabled && connectionState === 'disconnected';

  const syncText = isDisconnectedWarn
    ? `同期が切断されています${pendingChanges > 0 ? `（未送信 ${pendingChanges}件）` : ''}`
    : isConnecting
      ? '接続中…'
      : isConnected
        ? `同期中（この端末を含め ${peers.length + 1}台）${pendingChanges > 0 ? ` / 未送信 ${pendingChanges}件` : ''}`
        : '同期していません（この端末だけで動いています）';

  // 観戦用ページのURL。同期ルームに入っていれば、その部屋を見られるURLにする。
  const publicUrl = useMemo(() => {
    const viewPath = isMixedImported || isTeamImported ? '/view/league' : '/view/draw';
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const qs = new URLSearchParams();
    if (syncEnabled && roomCode) {
      if (roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
      if (serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
    }
    const q = qs.toString();
    return `${window.location.origin}${base}${viewPath}${q ? `?${q}` : ''}`;
  }, [isMixedImported, isTeamImported, syncEnabled, roomCode, serverUrl]);

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      // クリップボードが使えない端末向け
      const el = document.createElement('textarea');
      el.value = publicUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const voice = getVoiceSettings();
  const voiceText = voice.engine === 'browser'
    ? '端末内蔵の音声で読み上げます'
    : `Gemini 音声で読み上げます（${voice.voiceName || '既定の声'}）`;

  return (
    <div className="min-h-full bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* ヘッダー */}
        <header className="relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-lg">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          </div>
          <div className="relative px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm">
                <Settings className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">設定</h1>
                <p className="text-sm text-primary-50 mt-0.5">同期・観戦用ページ・音声・バックアップ</p>
              </div>
            </div>
          </div>
        </header>

        {/* 同期 */}
        <SectionCard
          icon={
            isDisconnectedWarn ? <AlertTriangle className="w-5 h-5 text-primary-500" />
              : isConnecting ? <Loader2 className="w-5 h-5 animate-spin" />
                : isConnected ? <Wifi className="w-5 h-5 text-primary-500" />
                  : <WifiOff className="w-5 h-5" />
          }
          title="同期"
          description="複数の端末で同じ大会データを共有する"
        >
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700">
            <span className="flex-1">{syncText}</span>
            {syncEnabled && roomCode && (
              <span className="shrink-0 font-mono font-bold text-gray-900">{roomCode}</span>
            )}
          </div>
          <OpenButton label="同期設定を開く" onClick={() => setSyncOpen(true)} />
        </SectionCard>

        {/* 観戦用ページ */}
        <SectionCard
          icon={<Eye className="w-5 h-5" />}
          title="観戦用ページ"
          description="参加者・協会HP向けの読み取り専用ページ"
        >
          <div className="px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">URL</div>
            <div className="text-xs text-gray-700 break-all font-mono">{publicUrl}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>観戦用ページを開く</span>
            </a>
            <button
              onClick={copyPublicUrl}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
            >
              {copied ? <Check className="w-4 h-4 text-primary-500" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'コピーしました' : 'URLをコピー'}</span>
            </button>
          </div>
          {!syncEnabled && (
            <p className="text-xs text-gray-500">
              ほかの端末から見てもらうには、上の「同期」を開始してください。
            </p>
          )}
        </SectionCard>

        {/* 音声 */}
        <SectionCard
          icon={<Volume2 className="w-5 h-5" />}
          title="音声（コール読み上げ）"
          description="呼び出しの声・読み上げ方法を選ぶ"
        >
          <div className="px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700">
            {voiceText}
          </div>
          <OpenButton label="音声設定を開く" onClick={() => setVoiceOpen(true)} />
        </SectionCard>

        {/* バックアップ（バックアップ画面をそのまま取り込む） */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-white text-gray-600 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800">バックアップ</h2>
              <p className="text-xs text-gray-500">大会データをまとめて安全に保存・復元</p>
            </div>
          </div>
          <div className="p-5">
            <BackupPage embedded />
          </div>
        </section>
      </div>

      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
      <VoiceSettingsDialog open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}
