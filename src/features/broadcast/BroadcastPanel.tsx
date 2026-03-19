import { useState, useCallback, useMemo, useRef } from 'react';
import { Volume2, Upload, Square, Play, History, Settings2, ChevronDown, ChevronRight, Mic, Database } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
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

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

export default function BroadcastPanel() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [matches, setMatches] = useState<MatchCall[]>([]);
  const [dataType, setDataType] = useState<'singles' | 'doubles'>('singles');
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>({
    rate: 0.95,
    pitch: 1.0,
    volume: 1.0,
    repeatCount: 1,
  });
  const [speakingMatchId, setSpeakingMatchId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [lastCourtNumber, setLastCourtNumber] = useState('');
  const [dbLoading, setDbLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { isSpeaking, voiceName, speak, stop, testVoice } = useSpeechSynthesis();

  // データベースから種目一覧を取得
  const dbEvents = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // 所属ふりがなマップを取得
  const affiliationFuriganaMap = useLiveQuery(
    async () => {
      const entries = await db.affiliationFurigana.toArray();
      const map: Record<string, string> = {};
      for (const entry of entries) {
        map[entry.name] = entry.furigana;
      }
      return map;
    },
    []
  ) || {};

  // データベースから試合データを読み込む
  const handleLoadFromDB = useCallback(async () => {
    if (!currentTournamentId) {
      alert('大会が選択されていません。ホーム画面で大会を選択してください。');
      return;
    }
    setDbLoading(true);
    try {
      const events = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
      if (events.length === 0) {
        alert('この大会には種目が登録されていません。');
        setDbLoading(false);
        return;
      }

      const allMatchCalls: MatchCall[] = [];
      let idCounter = 1;
      let hasDoubles = false;

      // entryId → Player レコードのキャッシュ（DB参照を減らす）
      const playerCache = new Map<string, { furigana: string; affiliation: string }>();
      async function resolvePlayer(entryId: string | null): Promise<{ name: string; affiliation: string } | null> {
        if (!entryId) return null;
        if (playerCache.has(entryId)) return { name: playerCache.get(entryId)!.furigana, affiliation: playerCache.get(entryId)!.affiliation };
        const entry = await db.entries.where('entryId').equals(entryId).first();
        if (!entry) return null;
        const player = await db.players.where('playerId').equals(entry.playerId).first();
        if (!player) return null;
        const resolved = { furigana: player.furigana || player.name, affiliation: player.affiliation };
        playerCache.set(entryId, resolved);
        return { name: resolved.furigana, affiliation: resolved.affiliation };
      }

      for (const event of events) {
        const eventMatches = await db.matches.where('eventId').equals(event.eventId).toArray();
        const drawData = await db.draws.where('eventId').equals(event.eventId).first();
        const totalRounds = drawData ? Math.log2(drawData.drawSize) : 1;

        // ドロースロットからentryId→ドロー番号のマップを構築
        const entryPositionMap = new Map<string, number>();
        if (drawData?.slots) {
          for (const slot of drawData.slots) {
            if (slot.entryId) {
              entryPositionMap.set(slot.entryId, slot.position);
            }
          }
        }

        // 両選手が埋まっている待機中/準備完了の試合のみ
        const validMatches = eventMatches.filter(
          m => (m.status === 'waiting' || m.status === 'ready') &&
               m.player1Name && m.player2Name &&
               m.player1Name !== 'BYE' && m.player2Name !== 'BYE'
        );

        const isDoubles = event.type === 'Doubles';
        if (isDoubles) hasDoubles = true;

        for (const m of validMatches) {
          const roundName = getRoundName(m.round, totalRounds);
          const posA = m.player1EntryId ? (entryPositionMap.get(m.player1EntryId) ?? 0) : 0;
          const posB = m.player2EntryId ? (entryPositionMap.get(m.player2EntryId) ?? 0) : 0;

          if (isDoubles) {
            // ダブルスの場合: entryIdからペアの選手情報を解決
            const playerA = await resolvePlayer(m.player1EntryId);
            const playerB = await resolvePlayer(m.player2EntryId);

            // ダブルスのパートナー情報も解決
            let partnerA: { name: string; affiliation: string } | null = null;
            let partnerB: { name: string; affiliation: string } | null = null;
            if (m.player1EntryId) {
              const entry1 = await db.entries.where('entryId').equals(m.player1EntryId).first();
              if (entry1?.partnerId) {
                const partner = await db.players.where('playerId').equals(entry1.partnerId).first();
                if (partner) partnerA = { name: partner.furigana || partner.name, affiliation: partner.affiliation };
              }
            }
            if (m.player2EntryId) {
              const entry2 = await db.entries.where('entryId').equals(m.player2EntryId).first();
              if (entry2?.partnerId) {
                const partner = await db.players.where('playerId').equals(entry2.partnerId).first();
                if (partner) partnerB = { name: partner.furigana || partner.name, affiliation: partner.affiliation };
              }
            }

            // フォールバック: db.playersにデータがない場合はmatchレコードの値を使用
            const [fallbackNameA, fallbackPairNameA] = m.player1Name.includes(' / ')
              ? m.player1Name.split(' / ')
              : [m.player1Name, ''];
            const [fallbackNameB, fallbackPairNameB] = m.player2Name.includes(' / ')
              ? m.player2Name.split(' / ')
              : [m.player2Name, ''];
            const [fallbackAffA, fallbackPairAffA] = m.player1Affiliation.includes(' / ')
              ? m.player1Affiliation.split(' / ')
              : [m.player1Affiliation, m.player1Affiliation];
            const [fallbackAffB, fallbackPairAffB] = m.player2Affiliation.includes(' / ')
              ? m.player2Affiliation.split(' / ')
              : [m.player2Affiliation, m.player2Affiliation];

            allMatchCalls.push({
              id: idCounter++,
              eventName: event.name,
              round: `${roundName} #${m.position}`,
              numberA: posA,
              nameA: (playerA?.name || fallbackNameA).trim(),
              affA: (playerA?.affiliation || fallbackAffA).trim(),
              pairNameA: (partnerA?.name || fallbackPairNameA).trim(),
              pairAffA: (partnerA?.affiliation || fallbackPairAffA).trim(),
              numberB: posB,
              nameB: (playerB?.name || fallbackNameB).trim(),
              affB: (playerB?.affiliation || fallbackAffB).trim(),
              pairNameB: (partnerB?.name || fallbackPairNameB).trim(),
              pairAffB: (partnerB?.affiliation || fallbackPairAffB).trim(),
              type: 'doubles',
              status: 'pending',
              courtNumber: m.courtId || '',
              startTime: m.scheduledTime || '',
            });
          } else {
            // シングルス: db.playersからふりがな・所属を取得
            const playerA = await resolvePlayer(m.player1EntryId);
            const playerB = await resolvePlayer(m.player2EntryId);

            allMatchCalls.push({
              id: idCounter++,
              eventName: event.name,
              round: `${roundName} #${m.position}`,
              numberA: posA,
              nameA: playerA?.name || m.player1Name,
              affA: playerA?.affiliation || m.player1Affiliation,
              numberB: posB,
              nameB: playerB?.name || m.player2Name,
              affB: playerB?.affiliation || m.player2Affiliation,
              type: 'singles',
              status: 'pending',
              courtNumber: m.courtId || '',
              startTime: m.scheduledTime || '',
            });
          }
        }
      }

      if (allMatchCalls.length === 0) {
        alert('放送対象の試合がありません。\n試合が生成されているか、選手名が入力されているか確認してください。');
        setDbLoading(false);
        return;
      }

      setMatches(allMatchCalls);
      setDataType(hasDoubles ? 'doubles' : 'singles');
      setActiveTab('all');
      setCallLog([]);
    } catch (err) {
      console.error(err);
      alert('データベースからの読み込みに失敗しました。');
    } finally {
      setDbLoading(false);
    }
  }, [currentTournamentId]);

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

  // pending + speaking はアクティブリストに表示（コール中もその場に留まる）
  const activeMatches = filteredMatches.filter(m => m.status === 'pending' || m.status === 'speaking');
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

    const text = buildCallText(match, match.courtNumber, match.startTime, affiliationFuriganaMap);
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
  }, [settings, speak, affiliationFuriganaMap]);

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
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Volume2 className="w-6 h-6 text-primary-500" />
              放送コールシステム
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              試合データ読込 → コート指定 → ワンクリックで試合コール放送
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleLoadFromDB}
              disabled={dbLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-ocean text-white rounded-lg text-sm font-medium hover:bg-blue-900 transition-colors disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {dbLoading ? '読込中...' : '試合データから読込'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-500 border border-border-main rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors"
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
          <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
            <span className="bg-primary-50 text-primary-500 px-2 py-0.5 rounded font-medium">
              {dataType === 'doubles' ? 'ダブルス' : 'シングルス'}
            </span>
            <span>{matches.length}試合読込</span>
            <span className="text-green-600 font-medium">
              {matches.filter(m => m.status === 'done').length}件コール済
            </span>
          </div>
        )}
      </header>

      {/* 設定パネル */}
      <div className="bg-white rounded-xl shadow-sm border border-border-main">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-900 hover:bg-primary-50 transition-colors"
        >
          {showSettings ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <Settings2 className="w-4 h-4 text-primary-500" />
          音声設定
        </button>
        {showSettings && (
          <div className="px-4 pb-4 space-y-4">
            {/* 音声情報 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-pink-50 rounded-lg border border-pink-200">
              <span className="text-lg">👩</span>
              <div>
                <div className="text-sm font-medium text-pink-700">女性音声</div>
                <div className="text-[10px] text-pink-500">{voiceName}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 速度 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  読み上げ速度: {settings.rate.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.2"
                  step="0.05"
                  value={settings.rate}
                  onChange={e => setSettings(s => ({ ...s, rate: parseFloat(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>遅い</span><span>標準</span><span>速い</span>
                </div>
              </div>

              {/* 繰り返し回数 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">繰り返し回数</label>
                <div className="flex gap-1">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setSettings(s => ({ ...s, repeatCount: n }))}
                      className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                        settings.repeatCount === n
                          ? 'bg-primary-500 text-white'
                          : 'bg-primary-50 text-gray-500 hover:bg-primary-100'
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
                  onClick={() => testVoice(settings)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-50 text-primary-500 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
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
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border-2 border-dashed border-border-main p-12 text-center">
            {/* データベースから読込（メイン） */}
            <Database className="w-12 h-12 text-ocean mb-4 opacity-60" />
            <p className="text-lg font-bold text-gray-900 mb-2">データベースから試合データを読み込む</p>
            <p className="text-sm text-gray-500 mb-4">
              エントリー・ドロー作成後、試合が生成されていればすぐに放送できます
            </p>
            <button
              onClick={handleLoadFromDB}
              disabled={dbLoading}
              className="flex items-center gap-2 px-6 py-3 bg-ocean text-white rounded-lg text-base font-medium hover:bg-blue-900 transition-colors disabled:opacity-50 mb-6"
            >
              <Database className="w-5 h-5" />
              {dbLoading ? '読込中...' : '試合データから読込'}
            </button>

            {dbEvents.length > 0 && (
              <p className="text-xs text-gray-500 mb-6">
                現在の大会: {dbEvents.length}種目が登録されています
              </p>
            )}

            {/* CSV読込（代替手段） */}
            <div className="border-t border-border-main pt-4 w-full max-w-md">
              <p className="text-xs text-gray-500 mb-2">または</p>
              <div
                ref={dropRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-border-main rounded-lg text-sm text-gray-500 hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                CSVファイルをドラッグ＆ドロップ / クリックで選択
              </div>
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
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-500 border border-border-main hover:bg-primary-50'
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
                        ? 'bg-primary-500 text-white'
                        : 'bg-white text-gray-500 border border-border-main hover:bg-primary-50'
                    }`}
                  >
                    {name} ({matches.filter(m => m.eventName === name).length})
                  </button>
                ))}
              </div>
            )}

            {/* 試合カードリスト */}
            <div className="flex-1 overflow-auto space-y-3">
              {/* アクティブ（未コール + コール中） */}
              {activeMatches.length > 0 && (
                <div className="space-y-2">
                  {activeMatches.map(match => (
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

              {/* コール済み — 同じカード表示で再コール可能 */}
              {doneMatches.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">コール済み</h3>
                  {doneMatches.map(match => (
                    <DoneMatchCard
                      key={match.id}
                      match={match}
                      onRecall={handleRecall}
                      onCall={handleCall}
                      isSpeaking={speakingMatchId === match.id}
                      onStop={handleStop}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* コール履歴 */}
      {callLog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-border-main">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-900 hover:bg-primary-50 transition-colors"
          >
            {showLog ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <History className="w-4 h-4 text-primary-500" />
            コール履歴 ({callLog.length}件)
          </button>
          {showLog && (
            <div className="px-4 pb-3 max-h-48 overflow-auto">
              <div className="space-y-1">
                {callLog.map((log) => (
                  <div key={`${log.matchId}-${log.timestamp.getTime()}`} className="flex items-start gap-2 text-xs text-gray-500 py-1 border-b border-primary-50 last:border-0">
                    <span className="font-mono text-gray-900 shrink-0">
                      {log.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="bg-primary-50 text-primary-500 px-1.5 rounded shrink-0">
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

/** 選手情報の共通表示 */
function PlayerInfo({ match }: { match: MatchCall }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
      {/* Player A */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-mono text-primary-500 shrink-0">{match.numberA}番</span>
          <span className="font-bold text-gray-900 text-sm truncate whitespace-nowrap">{match.nameA}</span>
        </div>
        {match.type === 'doubles' && match.pairNameA && (
          <p className="text-xs text-gray-500 truncate whitespace-nowrap ml-6">{match.pairNameA}</p>
        )}
        <p className="text-xs text-gray-500 truncate ml-6">{match.affA}</p>
      </div>

      <span className="text-xs font-bold text-gray-500 px-2">VS</span>

      {/* Player B */}
      <div className="min-w-0 text-right">
        <div className="flex items-baseline gap-1 justify-end">
          <span className="font-bold text-gray-900 text-sm truncate whitespace-nowrap">{match.nameB}</span>
          <span className="text-xs font-mono text-primary-500 shrink-0">{match.numberB}番</span>
        </div>
        {match.type === 'doubles' && match.pairNameB && (
          <p className="text-xs text-gray-500 truncate whitespace-nowrap mr-6">{match.pairNameB}</p>
        )}
        <p className="text-xs text-gray-500 truncate mr-6">{match.affB}</p>
      </div>
    </div>
  );
}

// アクティブ試合カードコンポーネント（未コール + コール中）
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
    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
    : 'bg-white border-border-main';

  const courtValue = match.courtNumber || '';

  return (
    <div className={`rounded-xl shadow-sm border p-4 transition-all ${bgClass}`}>
      {/* 上部：種目・回戦 + コール中表示 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-primary-500">{match.eventName}</span>
        <span className="text-xs text-gray-500">{match.round}</span>
        {isSpeaking && (
          <span className="flex items-center gap-1 text-xs text-orange-600 font-bold ml-auto">
            <Volume2 className="w-4 h-4 animate-pulse" />
            コール中...
          </span>
        )}
      </div>

      {/* 中央：選手情報 */}
      <div className="mb-3">
        <PlayerInfo match={match} />
      </div>

      {/* 下部：コート・時間・コールボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">コート:</label>
          <select
            value={courtValue}
            onChange={e => onUpdateMatch(match.id, 'courtNumber', e.target.value)}
            className="border border-border-main rounded px-2 py-1 text-sm w-20 bg-white"
          >
            <option value="">--</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
              <option key={n} value={String(n)}>{n}番</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">時間:</label>
          <input
            type="time"
            value={match.startTime}
            onChange={e => onUpdateMatch(match.id, 'startTime', e.target.value)}
            className="border border-border-main rounded px-2 py-1 text-sm w-28 bg-white"
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
                ? 'bg-green-600 text-white hover:bg-green-700'
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

// コール済みカード — 同じ詳細表示 + 再コールボタン
function DoneMatchCard({
  match,
  onRecall,
  onCall,
  isSpeaking,
  onStop,
}: {
  match: MatchCall;
  onRecall: (match: MatchCall) => void;
  onCall: (match: MatchCall) => void;
  isSpeaking: boolean;
  onStop: () => void;
}) {
  const bgClass = isSpeaking
    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
    : 'bg-gray-50 border-border-main opacity-80';

  return (
    <div className={`rounded-xl shadow-sm border p-4 transition-all ${bgClass}`}>
      {/* 上部：種目・回戦 + コール済バッジ */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-primary-500">{match.eventName}</span>
        <span className="text-xs text-gray-500">{match.round}</span>
        {isSpeaking ? (
          <span className="flex items-center gap-1 text-xs text-orange-600 font-bold ml-auto">
            <Volume2 className="w-4 h-4 animate-pulse" />
            コール中...
          </span>
        ) : (
          <span className="ml-auto bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
            コール済
          </span>
        )}
      </div>

      {/* 中央：選手情報 */}
      <div className="mb-3">
        <PlayerInfo match={match} />
      </div>

      {/* 下部：コート・時間情報 + 再コールボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        {match.courtNumber && (
          <span className="text-xs bg-primary-50 text-primary-500 px-2 py-0.5 rounded font-medium">
            {match.courtNumber}番コート
          </span>
        )}
        {match.startTime && (
          <span className="text-xs text-gray-500">{match.startTime}</span>
        )}
        {match.calledAt && (
          <span className="text-xs text-gray-400">
            {match.calledAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}にコール
          </span>
        )}

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
            onClick={() => {
              onRecall(match);
              // 少し遅延させてからコール（stateが更新されるのを待つ）
              setTimeout(() => onCall({ ...match, status: 'pending' }), 50);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border-main rounded-lg text-xs font-medium text-gray-600 hover:bg-orange-50 hover:border-orange-300 transition-colors"
          >
            <Play className="w-3 h-3" />
            再コール
          </button>
        )}
      </div>
    </div>
  );
}
