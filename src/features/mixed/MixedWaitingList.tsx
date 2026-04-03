import { useState, useMemo, useEffect, useCallback } from 'react';
import { ClipboardList, Printer, Volume2, VolumeX, Play, Edit3, Save, X, MapPin } from 'lucide-react';
import { useMixedStore } from './mixedStore';
import type { BracketMatch, PlacementCategory, MixedTeam } from './types';
import { useSpeechSynthesis } from '../broadcast/useSpeechSynthesis';
import db from '../../db/database';

/** リーグバッジの色 */
const LEAGUE_BADGE_COLORS: Record<string, string> = {
  'A': 'bg-emerald-100 text-emerald-700', 'B': 'bg-blue-100 text-blue-700',
  'C': 'bg-purple-100 text-purple-700', 'D': 'bg-rose-100 text-rose-700',
  'E': 'bg-amber-100 text-amber-700', 'F': 'bg-cyan-100 text-cyan-700',
  'G': 'bg-lime-100 text-lime-700', 'H': 'bg-fuchsia-100 text-fuchsia-700',
  'I': 'bg-emerald-100 text-emerald-700', 'J': 'bg-blue-100 text-blue-700',
  'K': 'bg-purple-100 text-purple-700', 'L': 'bg-rose-100 text-rose-700',
  'M': 'bg-amber-100 text-amber-700',
};

const CATEGORY_LABELS: Record<PlacementCategory, string> = {
  '1st': '1位T', '2nd': '2位T', '3rd': '3位T', '4th': '4・5位T',
};

const CATEGORY_LABELS_FULL: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

const CATEGORY_COLORS: Record<PlacementCategory, string> = {
  '1st': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  '2nd': 'bg-gray-100 text-gray-700 border-gray-300',
  '3rd': 'bg-orange-100 text-orange-700 border-orange-300',
  '4th': 'bg-slate-100 text-slate-600 border-slate-300',
};

function getRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${round}回戦`;
}

/** 審判用紙を印刷 */
function printRefereeSheet(
  match: BracketMatch,
  allTeams: MixedTeam[],
  tournamentName: string,
  catLabel: string,
  roundLabel: string,
  courtName: string,
) {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  body { font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; margin: 0; padding: 15px; }
  .header { text-align: center; margin-bottom: 12px; }
  .header h2 { margin: 0; font-size: 16px; }
  .header .sub { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #333; padding: 6px 10px; font-size: 13px; }
  th { background: #f0f0f0; width: 80px; text-align: center; }
  .player-name { font-size: 16px; font-weight: bold; }
  .score-area { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
  .score-box { width: 50px; height: 50px; border: 2px solid #333; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
  .dash { font-size: 28px; font-weight: bold; display: inline-flex; align-items: center; }
  .court-line { margin-top: 12px; font-size: 13px; }
</style>
</head><body>
<div class="header">
  <h2>${tournamentName}</h2>
  <div class="sub">${catLabel}　${roundLabel}　${courtName ? 'コート: ' + courtName : ''}</div>
</div>
<table>
  <tr><th rowspan="2">チーム1</th><td class="player-name">${team1.male.name}</td><td>${team1.male.affiliation}</td><td rowspan="2" style="text-align:center;font-weight:bold;font-size:14px;">${match.team1League}リーグ</td></tr>
  <tr><td class="player-name">${team1.female.name}</td><td>${team1.female.affiliation}</td></tr>
  <tr><th rowspan="2">チーム2</th><td class="player-name">${team2.male.name}</td><td>${team2.male.affiliation}</td><td rowspan="2" style="text-align:center;font-weight:bold;font-size:14px;">${match.team2League}リーグ</td></tr>
  <tr><td class="player-name">${team2.female.name}</td><td>${team2.female.affiliation}</td></tr>
</table>
<div style="text-align:center;">
  <div class="score-area">
    <div class="score-box"></div><div class="dash">−</div><div class="score-box"></div>
  </div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=800,height=600');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
}

/** 苗字のみ取得 */
const familyName = (name: string) => name.trim().split(/[\s　]+/)[0] || name;

/** コート名を番コート形式に変換 (例: "1コート" → "1番コート") */
const toCourtCallName = (courtName: string) => {
  const m = courtName.match(/^(\d+)\s*コート$/);
  return m ? `${m[1]}番コート` : courtName;
};

/** コールテキスト生成（新フォーマット） */
function buildCallText(
  match: BracketMatch,
  allTeams: MixedTeam[],
  category: PlacementCategory,
  roundLabel: string,
  courtName: string,
  startTime: string,
  furiganaOverrides: Record<string, string>,
): string {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return '';

  const resolve = (key: string, fallback: string) => furiganaOverrides[key] || fallback;

  const catLabel = CATEGORY_LABELS_FULL[category];
  const courtCallName = toCourtCallName(courtName);

  // 名前読み解決
  const t1MaleName = resolve(`t1m_name`, familyName(team1.male.name));
  const t1FemaleName = resolve(`t1f_name`, familyName(team1.female.name));
  const t2MaleName = resolve(`t2m_name`, familyName(team2.male.name));
  const t2FemaleName = resolve(`t2f_name`, familyName(team2.female.name));

  // 所属読み解決
  const t1MaleAff = resolve(`t1m_aff`, team1.male.affiliation);
  const t1FemaleAff = resolve(`t1f_aff`, team1.female.affiliation);
  const t2MaleAff = resolve(`t2m_aff`, team2.male.affiliation);
  const t2FemaleAff = resolve(`t2f_aff`, team2.female.affiliation);

  const parts: string[] = [
    '試合のコールをします。',
    `${catLabel}、${roundLabel}。`,
    `${team1.pairNumber}番、${t1MaleName}さん、${t1MaleAff}、${t1FemaleName}さん、${t1FemaleAff}。`,
    `${team2.pairNumber}番、${t2MaleName}さん、${t2MaleAff}、${t2FemaleName}さん、${t2FemaleAff}。`,
  ];

  let ct = `この試合を${courtCallName}で`;
  if (startTime) {
    const [h, m] = startTime.split(':');
    ct += parseInt(m) === 0 ? `、${parseInt(h)}時より` : `、${parseInt(h)}時${parseInt(m)}分より`;
  }
  ct += '、おこなってください。';
  parts.push(ct);

  // ボール担当（チーム1）
  parts.push(`ボールは${team1.pairNumber}番${t1MaleName}さん、${t1FemaleName}さんお願い致します。`);

  return parts.join(' ');
}

/** コールプレビューで使うエントリ */
interface CallEntry {
  key: string;
  label: string;
  displayName: string;
  furigana: string;
  type: 'name' | 'affiliation';
}

/** コールプレビューダイアログ */
function CallPreviewDialog({
  match,
  team1,
  team2,
  category,
  roundLabel,
  courtName,
  startTime,
  allTeams,
  onConfirm,
  onClose,
}: {
  match: BracketMatch;
  team1: MixedTeam;
  team2: MixedTeam;
  category: PlacementCategory;
  roundLabel: string;
  courtName: string;
  startTime: string;
  allTeams: MixedTeam[];
  onConfirm: (text: string, overrides: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // 初期化: DB からふりがなを取得して各エントリを構築
  useEffect(() => {
    const init = async () => {
      // 名前ふりがな辞書を取得
      const nameKeys = [
        team1.male.name, team1.female.name,
        team2.male.name, team2.female.name,
      ].map(n => n.replace(/\s/g, ''));
      const nameFuriganas = await db.furiganaDict.where('name').anyOf(nameKeys).toArray();
      const nameMap = new Map(nameFuriganas.map(f => [f.name, f.furigana]));

      // 所属ふりがな辞書を取得
      const affKeys = [
        team1.male.affiliation, team1.female.affiliation,
        team2.male.affiliation, team2.female.affiliation,
      ].filter(Boolean);
      const affFuriganas = await db.affiliationFurigana.where('name').anyOf(affKeys).toArray();
      const affMap = new Map(affFuriganas.map(f => [f.name, f.furigana]));

      // 苗字のふりがなを推定（フルネームのふりがなから先頭部分）
      const getFamilyFurigana = (fullName: string): string => {
        const key = fullName.replace(/\s/g, '');
        const fullFurigana = nameMap.get(key);
        if (!fullFurigana) return familyName(fullName);
        // フルネームのスペース区切りから苗字部分を取得
        const parts = fullFurigana.trim().split(/[\s　]+/);
        return parts[0] || fullFurigana;
      };

      const newEntries: CallEntry[] = [
        { key: 't1m_name', label: `チーム1 男子 名前`, displayName: familyName(team1.male.name), furigana: getFamilyFurigana(team1.male.name), type: 'name' },
        { key: 't1m_aff', label: `チーム1 男子 所属`, displayName: team1.male.affiliation, furigana: affMap.get(team1.male.affiliation) || team1.male.affiliation, type: 'affiliation' },
        { key: 't1f_name', label: `チーム1 女子 名前`, displayName: familyName(team1.female.name), furigana: getFamilyFurigana(team1.female.name), type: 'name' },
        { key: 't1f_aff', label: `チーム1 女子 所属`, displayName: team1.female.affiliation, furigana: affMap.get(team1.female.affiliation) || team1.female.affiliation, type: 'affiliation' },
        { key: 't2m_name', label: `チーム2 男子 名前`, displayName: familyName(team2.male.name), furigana: getFamilyFurigana(team2.male.name), type: 'name' },
        { key: 't2m_aff', label: `チーム2 男子 所属`, displayName: team2.male.affiliation, furigana: affMap.get(team2.male.affiliation) || team2.male.affiliation, type: 'affiliation' },
        { key: 't2f_name', label: `チーム2 女子 名前`, displayName: familyName(team2.female.name), furigana: getFamilyFurigana(team2.female.name), type: 'name' },
        { key: 't2f_aff', label: `チーム2 女子 所属`, displayName: team2.female.affiliation, furigana: affMap.get(team2.female.affiliation) || team2.female.affiliation, type: 'affiliation' },
      ];
      setEntries(newEntries);
    };
    init();
  }, [team1, team2]);

  const updateFurigana = useCallback((key: string, value: string) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, furigana: value } : e));
  }, []);

  const handleSaveAndSpeak = async () => {
    setSaving(true);
    try {
      // ふりがなをDBに保存
      for (const entry of entries) {
        if (entry.type === 'name') {
          // 名前ふりがな: フルネームのキーで保存（苗字部分のみ更新は複雑なのでスキップ）
          // 代わりにfamilyName用の個別キーで保存
          const nameKey = entry.displayName.replace(/\s/g, '');
          await db.furiganaDict.put({
            name: nameKey,
            furigana: entry.furigana,
            type: 'manual',
            updatedAt: Date.now(),
          });
        } else {
          // 所属ふりがな
          const existing = await db.affiliationFurigana.where('name').equals(entry.displayName).first();
          if (existing) {
            await db.affiliationFurigana.update(existing.id!, {
              furigana: entry.furigana,
              updatedAt: Date.now(),
            });
          } else {
            await db.affiliationFurigana.add({
              name: entry.displayName,
              furigana: entry.furigana,
              updatedAt: Date.now(),
            });
          }
        }
      }
    } catch (e) {
      console.error('ふりがな保存エラー:', e);
    }
    setSaving(false);

    // ふりがなオーバーライドマップを構築
    const overrides: Record<string, string> = {};
    for (const entry of entries) {
      overrides[entry.key] = entry.furigana;
    }

    const text = buildCallText(match, allTeams, category, roundLabel, courtName, startTime, overrides);
    onConfirm(text, overrides);
  };

  const catLabel = CATEGORY_LABELS_FULL[category];

  // プレビューテキスト生成
  const overrides: Record<string, string> = {};
  for (const entry of entries) {
    overrides[entry.key] = entry.furigana;
  }
  const previewText = buildCallText(match, allTeams, category, roundLabel, courtName, startTime, overrides);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Volume2 size={14} />
              コールプレビュー
            </h3>
            <p className="text-[10px] text-blue-200 mt-0.5">{catLabel} {roundLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 読みふりがな編集 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-[10px] text-gray-500">読み仮名を確認・修正してください。修正内容はデータベースに保存されます。</p>

          {/* チーム1 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-600">{team1.pairNumber}番 ({match.team1League}リーグ)</span>
            </div>
            {entries.filter(e => e.key.startsWith('t1')).map(entry => (
              <div key={entry.key} className="px-3 py-2 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-400">{entry.label}</span>
                  <span className="text-xs font-bold text-gray-800">{entry.displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Edit3 size={10} className="text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={entry.furigana}
                    onChange={e => updateFurigana(entry.key, e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                    placeholder="読み仮名"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* チーム2 */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-600">{team2.pairNumber}番 ({match.team2League}リーグ)</span>
            </div>
            {entries.filter(e => e.key.startsWith('t2')).map(entry => (
              <div key={entry.key} className="px-3 py-2 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-400">{entry.label}</span>
                  <span className="text-xs font-bold text-gray-800">{entry.displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Edit3 size={10} className="text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={entry.furigana}
                    onChange={e => updateFurigana(entry.key, e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                    placeholder="読み仮名"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* プレビュー */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-blue-600 mb-1">読み上げテキスト</p>
            <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{previewText}</p>
          </div>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSaveAndSpeak}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <><Save size={12} />保存中...</>
            ) : (
              <><Volume2 size={12} />保存してコール</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface WaitingMatch {
  match: BracketMatch;
  category: PlacementCategory;
  totalRounds: number;
  priority: number; // lower = higher priority
}

export default function MixedWaitingList() {
  const { brackets, allTeams, leagues, tournamentInfo, assignBracketMatchToCourt, bracketCourtAssignments } = useMixedStore();
  const { speak, stop, isSpeaking } = useSpeechSynthesis();
  const [speakingMatchId, setSpeakingMatchId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<Record<string, string>>({});

  // コート割当ポップアップ state
  const [courtAssignWm, setCourtAssignWm] = useState<WaitingMatch | null>(null);
  const [courtAssignValue, setCourtAssignValue] = useState('');

  // コールプレビュー state
  const [previewMatch, setPreviewMatch] = useState<WaitingMatch | null>(null);
  const [previewCourt, setPreviewCourt] = useState('');

  // 使用中コートを計算
  const usedCourts = useMemo(() => {
    const set = new Set<string>();
    for (const ca of Object.values(bracketCourtAssignments)) {
      set.add(ca.courtName);
    }
    // 予選リーグ進行中のコートも除外
    for (const l of leagues) {
      const lm = useMixedStore.getState().leagueMatches.filter(m => m.leagueId === l.leagueId);
      if (lm.some(m => m.status !== 'finished')) {
        const nums = l.courtName?.match(/\d+/g);
        if (nums) for (const n of nums) set.add(`${n}コート`);
      }
    }
    return set;
  }, [bracketCourtAssignments, leagues]);

  const courtOpts = Array.from({ length: 16 }, (_, i) => `${i + 1}コート`);

  // 全ブラケットから対戦可能な試合を収集
  const waitingMatches = useMemo(() => {
    const result: WaitingMatch[] = [];
    for (const bracket of brackets) {
      const totalRounds = Math.log2(bracket.drawSize);
      for (const match of bracket.matches) {
        if (match.status === 'ready' && match.team1Id && match.team2Id && !match.isBye) {
          const priority = match.round * 1000 + match.position;
          result.push({ match, category: bracket.category, totalRounds, priority });
        }
      }
    }
    return result.sort((a, b) => a.priority - b.priority);
  }, [brackets]);

  // コート入れボタン → ポップアップ表示
  const handleOpenCourtAssign = (wm: WaitingMatch) => {
    setCourtAssignWm(wm);
    setCourtAssignValue('');
  };

  // コート割当確定 → コート入れ＋コールプレビューへ
  const handleCourtAssignConfirm = () => {
    if (!courtAssignWm || !courtAssignValue) return;
    assignBracketMatchToCourt(courtAssignWm.match.matchId, courtAssignValue);
    // コールプレビューへ遷移
    setPreviewMatch(courtAssignWm);
    setPreviewCourt(courtAssignValue);
    setCourtAssignWm(null);
  };

  const handleConfirmCall = (text: string, _overrides: Record<string, string>) => {
    if (!text || !previewMatch) return;
    setSpeakingMatchId(previewMatch.match.matchId);
    setPreviewMatch(null);
    speak(text, { rate: 0.9, pitch: 1.0, volume: 1.0, repeatCount: 1 }, () => setSpeakingMatchId(null));
  };

  const handlePrint = (wm: WaitingMatch) => {
    const catLabel = CATEGORY_LABELS[wm.category];
    const roundLabel = getRoundLabel(wm.match.round, wm.totalRounds);
    printRefereeSheet(wm.match, allTeams, tournamentInfo?.name || '', catLabel, roundLabel, '');
  };

  if (waitingMatches.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <ClipboardList size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">対戦可能な試合がありません</p>
        <p className="text-sm mt-2">決勝トーナメントで両チームが確定した試合がここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <ClipboardList size={16} />
          控えリスト
          <span className="text-xs font-normal text-gray-400">({waitingMatches.length}試合)</span>
        </h2>
        {isSpeaking && (
          <button onClick={() => { stop(); setSpeakingMatchId(null); }} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">
            <VolumeX size={12} />音声停止
          </button>
        )}
      </div>

      {waitingMatches.map((wm) => {
        const { match, category, totalRounds } = wm;
        const team1 = allTeams.find(t => t.teamId === match.team1Id);
        const team2 = allTeams.find(t => t.teamId === match.team2Id);
        const roundLabel = getRoundLabel(match.round, totalRounds);
        const isSpeakingThis = speakingMatchId === match.matchId;

        return (
          <div key={match.matchId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* ヘッダー: カテゴリ + 回戦 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[category]}`}>
                {CATEGORY_LABELS[category]}
              </span>
              <span className="text-xs font-medium text-gray-600">{roundLabel}</span>
              <span className="text-[10px] text-gray-400">#{match.position}</span>
            </div>

            {/* 対戦チーム */}
            <div className="px-3 py-2">
              {[
                { team: team1, league: match.team1League },
                { team: team2, league: match.team2League },
              ].map((side, idx) => (
                <div key={idx} className={`flex items-center gap-2 ${idx === 0 ? 'pb-1.5 border-b border-gray-100 mb-1.5' : ''}`}>
                  <span className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${LEAGUE_BADGE_COLORS[side.league?.trim()] || 'bg-gray-100 text-gray-600'}`}>
                    {side.league}
                  </span>
                  {side.team ? (
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="shrink-0" style={{ width: 110 }}>
                        <div className="text-xs font-bold text-gray-800 truncate">{side.team.male.name}</div>
                        <div className="text-xs text-gray-600 truncate">{side.team.female.name}</div>
                      </div>
                      <div className="w-px h-6 bg-gray-200 mx-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-gray-400 truncate">{side.team.male.affiliation}</div>
                        <div className="text-[10px] text-gray-400 truncate">{side.team.female.affiliation}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">{side.league}リーグ</span>
                  )}
                </div>
              ))}
            </div>

            {/* アクション: コート入れ + 時間 + 印刷 */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-[10px] text-gray-500 font-medium shrink-0">開始時間:</label>
                <input type="time" value={selectedTime[match.matchId] || ''} onChange={e => setSelectedTime(prev => ({ ...prev, [match.matchId]: e.target.value }))}
                  className="px-1.5 py-0.5 border border-gray-200 rounded text-[10px] w-20" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => handleOpenCourtAssign(wm)} disabled={isSpeaking}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    isSpeakingThis ? 'bg-blue-600 text-white animate-pulse' :
                    'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                  {isSpeakingThis ? <><Volume2 size={12} />コール中...</> : <><MapPin size={12} />コート入れ &amp; コール</>}
                </button>
                <button onClick={() => handlePrint(wm)}
                  className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-all">
                  <Printer size={12} />印刷
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ===== コート割当ポップアップ（トーナメント表と同じ形式） ===== */}
      {courtAssignWm && (() => {
        const t1 = allTeams.find(t => t.teamId === courtAssignWm.match.team1Id);
        const t2 = allTeams.find(t => t.teamId === courtAssignWm.match.team2Id);
        const catLabel = CATEGORY_LABELS[courtAssignWm.category];
        const roundLabel = getRoundLabel(courtAssignWm.match.round, courtAssignWm.totalRounds);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto" onClick={() => setCourtAssignWm(null)}>
            <div className="min-h-full flex items-start justify-center py-[10vh] px-4">
              <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-full p-5 z-50" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-gray-800 mb-3">コートを決定</h3>
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs">
                  <div className="text-gray-500 mb-1.5">{catLabel} {roundLabel}</div>
                  <div className="flex items-center gap-2 mb-1">
                    {courtAssignWm.match.team1League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignWm.match.team1League}</span>}
                    <span className="font-bold">{t1?.teamName || courtAssignWm.match.team1Name}</span>
                  </div>
                  <div className="text-gray-400 text-[9px] my-0.5">vs</div>
                  <div className="flex items-center gap-2">
                    {courtAssignWm.match.team2League && <span className="w-4 h-4 rounded bg-gray-200 text-[8px] font-bold text-gray-600 flex items-center justify-center">{courtAssignWm.match.team2League}</span>}
                    <span className="font-bold">{t2?.teamName || courtAssignWm.match.team2Name}</span>
                  </div>
                </div>
                <label className="text-xs font-bold text-gray-600 block mb-2">コートを選択 <span className="text-gray-400 font-normal">（使用中は選択不可）</span></label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {courtOpts.map(c => {
                    const isUsed = usedCourts.has(c);
                    return (
                      <button key={c} onClick={() => !isUsed && setCourtAssignValue(c)}
                        disabled={isUsed}
                        className={`py-2 text-xs font-bold rounded-lg border-2 transition-all
                          ${isUsed ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed' :
                            courtAssignValue === c ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                            'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >{c.replace('コート', '')}{isUsed && <span className="block text-[7px] text-gray-300">使用中</span>}</button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCourtAssignWm(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">キャンセル</button>
                  <button onClick={handleCourtAssignConfirm} disabled={!courtAssignValue}
                    className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >決定 &amp; コール</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== コールプレビューダイアログ ===== */}
      {previewMatch && (() => {
        const team1 = allTeams.find(t => t.teamId === previewMatch.match.team1Id);
        const team2 = allTeams.find(t => t.teamId === previewMatch.match.team2Id);
        if (!team1 || !team2) return null;
        const time = selectedTime[previewMatch.match.matchId] || '';
        const roundLabel = getRoundLabel(previewMatch.match.round, previewMatch.totalRounds);
        return (
          <CallPreviewDialog
            match={previewMatch.match}
            team1={team1}
            team2={team2}
            category={previewMatch.category}
            roundLabel={roundLabel}
            courtName={previewCourt}
            startTime={time}
            allTeams={allTeams}
            onConfirm={handleConfirmCall}
            onClose={() => setPreviewMatch(null)}
          />
        );
      })()}
    </div>
  );
}
