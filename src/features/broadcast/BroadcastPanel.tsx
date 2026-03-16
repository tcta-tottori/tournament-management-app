import { useState, useCallback, useMemo, useRef } from 'react';
import { Volume2, Upload, Square, Play, History, Settings2, ChevronDown, ChevronRight, Mic } from 'lucide-react';
import type { MatchCall, CallLogEntry, VoiceSettings } from './types';
import { buildCallText } from './callTextBuilder';
import { useSpeechSynthesis } from './useSpeechSynthesis';

// CSVパーサー
function parseCSV(text: string): { type: 'singles' | 'doubles'; matches: MatchCall[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { type: 'singles', matches: [] };

  const header = lines[0].split(',').map(h => h.trim());
  const isDoubles = header.length >= 16 || header.some(h => h.includes('ペア'));
  const matches: MatchCall[] = [];

  for (let i = 1; i < lines.length; i++) {
    // CSV内のカンマ処理（引用符対応）
    const cols = parseCSVLine(lines[i]);
    if (!cols[0]?.trim()) continue;

    if (isDoubles) {
      matches.push({
        id: i,
        eventName: cols[0]?.trim() || '',
        round: cols[1]?.trim() || '',
        numberA: parseInt(cols[2]) || 0,
        nameA: cols[3]?.trim() || '',
        affA: cols[4]?.trim() || '',
        pairNameA: cols[5]?.trim() || '',
        pairAffA: cols[6]?.trim() || '',
        numberB: parseInt(cols[7]) || 0,
        nameB: cols[8]?.trim() || '',
        affB: cols[9]?.trim() || '',
        pairNameB: cols[10]?.trim() || '',
        pairAffB: cols[11]?.trim() || '',
        type: 'doubles',
        status: 'pending',
        courtNumber: '',
        startTime: '',
      });
    } else {
      matches.push({
        id: i,
        eventName: cols[0]?.trim() || '',
        round: cols[1]?.trim() || '',
        numberA: parseInt(cols[2]) || 0,
        nameA: cols[3]?.trim() || '',
        affA: cols[4]?.trim() || '',
        numberB: parseInt(cols[5]) || 0,
        nameB: cols[6]?.trim() || '',
        affB: cols[7]?.trim() || '',
        type: 'singles',
        status: 'pending',
        courtNumber: '',
        startTime: '',
      });
    }
  }

  return { type: isDoubles ? 'doubles' : 'singles', matches };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export default function BroadcastPanel() {
  const [matches, setMatches] = useState<MatchCall[]>([]);
  const [dataType, setDataType] = useState<'singles' | 'doubles'>('singles');
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>({
    rate: 0.85,
    pitch: 1.0,
    volume: 1.0,
    repeatCount: 2,
  });
  const [speakingMatchId, setSpeakingMatchId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [lastCourtNumber, setLastCourtNumber] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { isSpeaking, speak, stop, testVoice } = useSpeechSynthesis();

  // 種目タブ（順序を安定化）
  const eventNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of matches) {
      if (!seen.has(m.eventName)) {
        seen.add(m.eventName);
        names.push(m.eventName);
      }
    }
    return names;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (activeTab === 'all') return matches;
    return matches.filter(m => m.eventName === activeTab);
  }, [matches, activeTab]);

  const pendingMatches = filteredMatches.filter(m => m.status === 'pending');
  const doneMatches = filteredMatches.filter(m => m.status === 'done');

  // CSVインポート
  const handleFileImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const result = parseCSV(text);
      setMatches(result.matches);
      setDataType(result.type);
      setActiveTab('all');
      setCallLog([]);
    };
    // UTF-8で読む。Shift-JISの場合はTextDecoderで対応
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileImport(file);
    e.target.value = '';
  }, [handleFileImport]);

  // ドラッグ＆ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileImport(file);
    }
  }, [handleFileImport]);

  // コート番号・時間の更新
  const updateMatch = useCallback((id: number, field: 'courtNumber' | 'startTime', value: string) => {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    if (field === 'courtNumber' && value) {
      setLastCourtNumber(value);
    }
  }, []);

  // コール実行
  const handleCall = useCallback((match: MatchCall) => {
    if (!match.courtNumber) return;

    const text = buildCallText(match, match.courtNumber, match.startTime);
    setSpeakingMatchId(match.id);
    setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'speaking' as const } : m));

    speak(text, settings, () => {
      setSpeakingMatchId(null);
      setMatches(prev => prev.map(m =>
        m.id === match.id ? { ...m, status: 'done' as const, calledAt: new Date() } : m
      ));
      setCallLog(prev => [{
        timestamp: new Date(),
        courtNumber: match.courtNumber,
        eventName: match.eventName,
        round: match.round,
        text,
        matchId: match.id,
      }, ...prev]);
    });
  }, [settings, speak]);

  // 再コール
  const handleRecall = useCallback((match: MatchCall) => {
    setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'pending' as const } : m));
  }, []);

  // 停止
  const handleStop = useCallback(() => {
    stop();
    setSpeakingMatchId(null);
    setMatches(prev => prev.map(m =>
      m.status === 'speaking' ? { ...m, status: 'pending' as const } : m
    ));
  }, [stop]);

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* ヘッダー */}
      <header className="bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#111827] flex items-center gap-2">
              <Volume2 className="w-6 h-6 text-[#2e7d32]" />
              放送コールシステム
            </h1>
            <p className="text-sm text-[#6b7280] mt-1">
              CSVインポート → コート指定 → ワンクリックで試合コール放送
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2e7d32] text-white rounded-lg text-sm font-medium hover:bg-[#1b5e20] transition-colors"
            >
              <Upload className="w-4 h-4" />
              CSVインポート
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* データ情報 */}
        {matches.length > 0 && (
          <div className="mt-3 flex items-center gap-3 text-sm text-[#6b7280]">
            <span className="bg-[#e8f5e9] text-[#2e7d32] px-2 py-0.5 rounded font-medium">
              {dataType === 'doubles' ? 'ダブルス' : 'シングルス'}
            </span>
            <span>{matches.length}試合読込</span>
            <span className="text-[#16a34a] font-medium">
              {matches.filter(m => m.status === 'done').length}件コール済
            </span>
          </div>
        )}
      </header>

      {/* 設定パネル */}
      <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-[#111827] hover:bg-[#f1f8e9] transition-colors"
        >
          {showSettings ? <ChevronDown className="w-4 h-4 text-[#6b7280]" /> : <ChevronRight className="w-4 h-4 text-[#6b7280]" />}
          <Settings2 className="w-4 h-4 text-[#2e7d32]" />
          音声設定
        </button>
        {showSettings && (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 速度 */}
              <div>
                <label className="block text-xs font-medium text-[#6b7280] mb-1">
                  読み上げ速度: {settings.rate.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.2"
                  step="0.05"
                  value={settings.rate}
                  onChange={e => setSettings(s => ({ ...s, rate: parseFloat(e.target.value) }))}
                  className="w-full accent-[#2e7d32]"
                />
                <div className="flex justify-between text-[10px] text-[#6b7280]">
                  <span>遅い</span><span>標準</span><span>速い</span>
                </div>
              </div>

              {/* 繰り返し回数 */}
              <div>
                <label className="block text-xs font-medium text-[#6b7280] mb-1">繰り返し回数</label>
                <div className="flex gap-1">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setSettings(s => ({ ...s, repeatCount: n }))}
                      className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                        settings.repeatCount === n
                          ? 'bg-[#2e7d32] text-white'
                          : 'bg-[#f1f8e9] text-[#6b7280] hover:bg-[#e8f5e9]'
                      }`}
                    >
                      {n}回
                    </button>
                  ))}
                </div>
              </div>

              {/* 音声テスト */}
              <div className="flex items-end gap-2">
                <button
                  onClick={() => testVoice(settings.rate)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#f1f8e9] text-[#2e7d32] rounded-lg text-sm font-medium hover:bg-[#e8f5e9] transition-colors"
                >
                  <Mic className="w-4 h-4" />
                  音声テスト
                </button>
                {isSpeaking && (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    停止
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 min-h-0 flex flex-col">
        {matches.length === 0 ? (
          /* ドロップゾーン */
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex-1 flex flex-col items-center justify-center bg-white rounded-[10px] border-2 border-dashed border-[#e0e7ef] p-12 text-center hover:border-[#2e7d32] hover:bg-[#f1f8e9] transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-[#6b7280] mb-4 opacity-40" />
            <p className="text-lg font-bold text-[#111827] mb-2">CSVファイルをドラッグ＆ドロップ</p>
            <p className="text-sm text-[#6b7280] mb-4">またはクリックしてファイルを選択</p>
            <div className="text-xs text-[#6b7280] space-y-1">
              <p>対応形式: シングルス（12列） / ダブルス（16列）</p>
              <p>Google Sheets「対戦順」シートからCSVダウンロードしたファイル</p>
            </div>
          </div>
        ) : (
          <>
            {/* 種目タブ */}
            {eventNames.length > 1 && (
              <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === 'all'
                      ? 'bg-[#2e7d32] text-white'
                      : 'bg-white text-[#6b7280] border border-[#e0e7ef] hover:bg-[#f1f8e9]'
                  }`}
                >
                  全て ({matches.length})
                </button>
                {eventNames.map(name => (
                  <button
                    key={name}
                    onClick={() => setActiveTab(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === name
                        ? 'bg-[#2e7d32] text-white'
                        : 'bg-white text-[#6b7280] border border-[#e0e7ef] hover:bg-[#f1f8e9]'
                    }`}
                  >
                    {name} ({matches.filter(m => m.eventName === name).length})
                  </button>
                ))}
              </div>
            )}

            {/* 試合カードリスト */}
            <div className="flex-1 overflow-auto space-y-3">
              {/* 未コール */}
              {pendingMatches.length > 0 && (
                <div className="space-y-2">
                  {pendingMatches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isSpeaking={speakingMatchId === match.id}
                      lastCourtNumber={lastCourtNumber}
                      onUpdateMatch={updateMatch}
                      onCall={handleCall}
                      onStop={handleStop}
                    />
                  ))}
                </div>
              )}

              {/* コール済 */}
              {doneMatches.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mt-4">コール済み</h3>
                  {doneMatches.map(match => (
                    <div
                      key={match.id}
                      className="bg-[#FFF8F0] rounded-[10px] border border-[#F9CB9C] p-3 opacity-70"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-[#6b7280]">
                            <span className="font-medium">{match.eventName}</span>
                            <span>{match.round}</span>
                            <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              コール済
                            </span>
                          </div>
                          <p className="text-sm font-medium text-[#111827] mt-0.5 truncate">
                            {match.numberA}番 {match.nameA}
                            {match.type === 'doubles' && ` / ${match.pairNameA}`}
                            <span className="text-[#6b7280] mx-1">vs</span>
                            {match.numberB}番 {match.nameB}
                            {match.type === 'doubles' && ` / ${match.pairNameB}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRecall(match)}
                          className="ml-2 px-3 py-1.5 bg-white border border-[#e0e7ef] rounded-lg text-xs font-medium text-[#6b7280] hover:bg-[#f1f8e9] transition-colors shrink-0"
                        >
                          再コール
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* コール履歴 */}
      {callLog.length > 0 && (
        <div className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef]">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-[#111827] hover:bg-[#f1f8e9] transition-colors"
          >
            {showLog ? <ChevronDown className="w-4 h-4 text-[#6b7280]" /> : <ChevronRight className="w-4 h-4 text-[#6b7280]" />}
            <History className="w-4 h-4 text-[#2e7d32]" />
            コール履歴 ({callLog.length}件)
          </button>
          {showLog && (
            <div className="px-4 pb-3 max-h-48 overflow-auto">
              <div className="space-y-1">
                {callLog.map((log) => (
                  <div key={`${log.matchId}-${log.timestamp.getTime()}`} className="flex items-start gap-2 text-xs text-[#6b7280] py-1 border-b border-[#f1f8e9] last:border-0">
                    <span className="font-mono text-[#111827] shrink-0">
                      {log.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="bg-[#e8f5e9] text-[#2e7d32] px-1.5 rounded shrink-0">
                      {log.courtNumber}番
                    </span>
                    <span className="truncate">{log.eventName} {log.round}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 試合カードコンポーネント
function MatchCard({
  match,
  isSpeaking,
  lastCourtNumber: _lastCourtNumber,
  onUpdateMatch,
  onCall,
  onStop,
}: {
  match: MatchCall;
  isSpeaking: boolean;
  lastCourtNumber: string;
  onUpdateMatch: (id: number, field: 'courtNumber' | 'startTime', value: string) => void;
  onCall: (match: MatchCall) => void;
  onStop: () => void;
}) {
  const bgClass = isSpeaking
    ? 'bg-[#FFF3CD] border-[#FFD93D] animate-pulse'
    : 'bg-white border-[#e0e7ef]';

  // コート番号が未設定で前回の値がある場合、自動設定
  const courtValue = match.courtNumber || '';

  return (
    <div className={`rounded-[10px] shadow-sm border p-4 transition-all ${bgClass}`}>
      {/* 上部：種目・回線 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-[#2e7d32]">{match.eventName}</span>
        <span className="text-xs text-[#6b7280]">{match.round}</span>
        {isSpeaking && (
          <span className="flex items-center gap-1 text-xs text-orange-600 font-medium ml-auto">
            <Volume2 className="w-3 h-3 animate-pulse" />
            コール中...
          </span>
        )}
      </div>

      {/* 中央：選手情報 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3">
        {/* Player A */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-mono text-[#2e7d32] shrink-0">{match.numberA}番</span>
            <span className="font-bold text-[#111827] text-sm truncate">{match.nameA}</span>
          </div>
          {match.type === 'doubles' && match.pairNameA && (
            <p className="text-xs text-[#6b7280] truncate ml-6">{match.pairNameA}</p>
          )}
          <p className="text-xs text-[#6b7280] truncate ml-6">{match.affA}</p>
        </div>

        <span className="text-xs font-bold text-[#6b7280] px-2">VS</span>

        {/* Player B */}
        <div className="min-w-0 text-right">
          <div className="flex items-baseline gap-1 justify-end">
            <span className="font-bold text-[#111827] text-sm truncate">{match.nameB}</span>
            <span className="text-xs font-mono text-[#2e7d32] shrink-0">{match.numberB}番</span>
          </div>
          {match.type === 'doubles' && match.pairNameB && (
            <p className="text-xs text-[#6b7280] truncate mr-6">{match.pairNameB}</p>
          )}
          <p className="text-xs text-[#6b7280] truncate mr-6">{match.affB}</p>
        </div>
      </div>

      {/* 下部：コート・時間・コールボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">コート:</label>
          <select
            value={courtValue}
            onChange={e => onUpdateMatch(match.id, 'courtNumber', e.target.value)}
            className="border border-[#e0e7ef] rounded px-2 py-1 text-sm w-20 bg-white"
          >
            <option value="">--</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
              <option key={n} value={String(n)}>{n}番</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-xs text-[#6b7280]">時間:</label>
          <input
            type="time"
            value={match.startTime}
            onChange={e => onUpdateMatch(match.id, 'startTime', e.target.value)}
            className="border border-[#e0e7ef] rounded px-2 py-1 text-sm w-28 bg-white"
          />
        </div>

        <div className="flex-1" />

        {isSpeaking ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <Square className="w-4 h-4" />
            停止
          </button>
        ) : (
          <button
            onClick={() => onCall(match)}
            disabled={!match.courtNumber}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              match.courtNumber
                ? 'bg-[#16a34a] text-white hover:bg-[#15803d]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4" />
            コール
          </button>
        )}
      </div>
    </div>
  );
}
