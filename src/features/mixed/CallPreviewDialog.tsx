import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, Edit3, Save, X } from 'lucide-react';
import { db } from '../../db/database';
import { geminiTts } from '../broadcast/geminiTts';
import {
  buildSurnameReadingMap,
  collectKnownSurnames,
  estimateSurnameReading,
  extractSurname,
} from '../broadcast/surnameReading';
import type { BracketMatch, PlacementCategory, MixedTeam } from './types';

const CATEGORY_LABELS_FULL: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

/**
 * 苗字のみ取得。
 * 「西山 英汰」のようにスペース区切りならその前を、
 * 「西山英汰」のように区切りが無い場合は先頭2文字を苗字とみなす。
 */
export const familyName = (name: string) => extractSurname(name);

/** カタカナ→ひらがな変換 */
const kataToHira = (s: string) => s.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** コート名を番コート形式に変換 */
export const toCourtCallName = (courtName: string) => {
  const m = courtName.match(/^(\d+)\s*コート$/);
  return m ? `${m[1]}番コート` : courtName;
};

/** コールテキスト生成（苗字+所属フォーマット） */
export function buildCallText(
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

  const t1MaleName = resolve('t1m_name', familyName(team1.male.name));
  const t1FemaleName = resolve('t1f_name', familyName(team1.female.name));
  const t2MaleName = resolve('t2m_name', familyName(team2.male.name));
  const t2FemaleName = resolve('t2f_name', familyName(team2.female.name));
  const t1MaleAff = resolve('t1m_aff', team1.male.affiliation);
  const t1FemaleAff = resolve('t1f_aff', team1.female.affiliation);
  const t2MaleAff = resolve('t2m_aff', team2.male.affiliation);
  const t2FemaleAff = resolve('t2f_aff', team2.female.affiliation);

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
  parts.push(`ボールは${team1.pairNumber}番${t1MaleName}さん、${t1FemaleName}さんお願い致します。`);

  return parts.join(' ');
}

interface CallEntry {
  key: string;
  label: string;
  fullName: string;
  displayName: string;
  furigana: string;
  type: 'name' | 'affiliation';
}

export default function CallPreviewDialog({
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

  useEffect(() => {
    const init = async () => {
      // Playerテーブルからスペース付き名前とふりがなを取得
      const players = await db.players.toArray();
      // キー: スペース除去した名前 → { name: スペース付き名前, furigana: カタカナふりがな }
      const playerMap = new Map(players.map(p => [p.name.replace(/\s+/g, ''), { name: p.name, furigana: p.furigana }]));
      // 名簿から拾える苗字（「佐々木」のような3文字姓を2文字で切らないために使う）
      const knownSurnames = collectKnownSurnames(players.map(p => p.name));
      // 苗字漢字 → 苗字の読み（同姓選手の読みの共通部分から推定）
      const surnameReadingMap = buildSurnameReadingMap(players);
      // 過去にこのダイアログで手修正した読み（苗字がキー）を最優先で使う
      const manualDict = new Map(
        (await db.furiganaDict.toArray()).map(d => [d.name, d.furigana]),
      );

      // Playerテーブルのスペース付き名前から苗字漢字を取得
      const getKanjiFamily = (mixedName: string): string => {
        const key = mixedName.replace(/\s+/g, '');
        const player = playerMap.get(key);
        if (player) {
          // Playerテーブルの名前はスペース区切り（"岸本 健悟"）
          const parts = player.name.trim().split(/[\s\u3000]+/);
          if (parts.length > 1) return parts[0];
        }
        // MixedPlayer名にスペースがある場合／区切りが無い場合
        return extractSurname(mixedName, knownSurnames);
      };

      const maleFN1 = getKanjiFamily(team1.male.name);
      const femaleFN1 = getKanjiFamily(team1.female.name);
      const maleFN2 = getKanjiFamily(team2.male.name);
      const femaleFN2 = getKanjiFamily(team2.female.name);

      const affKeys = [
        team1.male.affiliation, team1.female.affiliation,
        team2.male.affiliation, team2.female.affiliation,
      ].filter(Boolean);
      const affFuriganas = await db.affiliationFurigana.where('name').anyOf(affKeys).toArray();
      const affMap = new Map(affFuriganas.map(f => [f.name, f.furigana]));

      // 苗字のひらがな読みを取得。
      // コールは苗字のみで行うため、フルネームの読み（"にしやまえいた"）を
      // そのまま返してはいけない。苗字部分だけを特定できないときは漢字の苗字に落とす。
      const getFamilyFurigana = (mixedName: string): string => {
        const kanjiFamily = getKanjiFamily(mixedName);
        // 1) 手修正済みの読み
        const manual = manualDict.get(kanjiFamily);
        if (manual) return kataToHira(manual);
        // 2) 選手名簿のふりがなが「スペース区切り」なら苗字の読みが確定する
        const player = playerMap.get(mixedName.replace(/\s+/g, ''));
        if (player?.furigana) {
          const parts = kataToHira(player.furigana).trim().split(/[\s\u3000]+/);
          if (parts.length > 1 && parts[0]) return parts[0];
        }
        // 3) 同姓選手の読みの共通部分／全国名簿から苗字の読みを推定
        const estimated = surnameReadingMap[kanjiFamily] || estimateSurnameReading(kanjiFamily);
        if (estimated) return estimated;
        // 4) 推定できなければ漢字の苗字のまま（TTSに読ませる）
        return kanjiFamily;
      };

      setEntries([
        { key: 't1m_name', label: 'チーム1 男子', fullName: team1.male.name, displayName: maleFN1, furigana: getFamilyFurigana(team1.male.name), type: 'name' },
        { key: 't1m_aff', label: 'チーム1 男子 所属', fullName: '', displayName: team1.male.affiliation, furigana: affMap.get(team1.male.affiliation) || team1.male.affiliation, type: 'affiliation' },
        { key: 't1f_name', label: 'チーム1 女子', fullName: team1.female.name, displayName: femaleFN1, furigana: getFamilyFurigana(team1.female.name), type: 'name' },
        { key: 't1f_aff', label: 'チーム1 女子 所属', fullName: '', displayName: team1.female.affiliation, furigana: affMap.get(team1.female.affiliation) || team1.female.affiliation, type: 'affiliation' },
        { key: 't2m_name', label: 'チーム2 男子', fullName: team2.male.name, displayName: maleFN2, furigana: getFamilyFurigana(team2.male.name), type: 'name' },
        { key: 't2m_aff', label: 'チーム2 男子 所属', fullName: '', displayName: team2.male.affiliation, furigana: affMap.get(team2.male.affiliation) || team2.male.affiliation, type: 'affiliation' },
        { key: 't2f_name', label: 'チーム2 女子', fullName: team2.female.name, displayName: femaleFN2, furigana: getFamilyFurigana(team2.female.name), type: 'name' },
        { key: 't2f_aff', label: 'チーム2 女子 所属', fullName: '', displayName: team2.female.affiliation, furigana: affMap.get(team2.female.affiliation) || team2.female.affiliation, type: 'affiliation' },
      ]);
    };
    init();
  }, [team1, team2]);

  const updateFurigana = useCallback((key: string, value: string) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, furigana: value } : e));
  }, []);

  const overrides: Record<string, string> = {};
  for (const entry of entries) overrides[entry.key] = entry.furigana;
  const previewText = buildCallText(match, allTeams, category, roundLabel, courtName, startTime, overrides);

  // 読み上げテキストが落ち着いたら裏で音声を作っておく。
  // 「保存してコール」を押してから音が出るまでの待ち時間をなくすため。
  useEffect(() => {
    if (!previewText) return;
    const t = setTimeout(() => geminiTts.prefetch(previewText), 600);
    return () => clearTimeout(t);
  }, [previewText]);

  const handleSaveAndSpeak = async () => {
    setSaving(true);
    try {
      for (const entry of entries) {
        if (entry.type === 'name') {
          const nameKey = entry.displayName.replace(/\s/g, '');
          await db.furiganaDict.put({
            name: nameKey,
            furigana: entry.furigana,
            type: 'manual',
            updatedAt: Date.now(),
          });
        } else {
          const existing = await db.affiliationFurigana.where('name').equals(entry.displayName).first();
          if (existing) {
            await db.affiliationFurigana.update(existing.id!, { furigana: entry.furigana, updatedAt: Date.now() });
          } else {
            await db.affiliationFurigana.add({ name: entry.displayName, furigana: entry.furigana, updatedAt: Date.now() });
          }
        }
      }
    } catch (e) {
      console.error('ふりがな保存エラー:', e);
    }
    setSaving(false);

    onConfirm(previewText, overrides);
  };

  const catLabel = CATEGORY_LABELS_FULL[category];

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onClose}>
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[92vw] max-w-lg max-h-[85vh] overflow-hidden flex flex-col z-[210]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 bg-blue-600 text-white flex items-center justify-between shrink-0">
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

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          <p className="text-[10px] text-gray-500">苗字の読み仮名を確認・修正してください。コールは<span className="font-bold text-amber-600">苗字のみ</span>で行います。</p>

          {[{ team: team1, prefix: 't1', league: match.team1League },
            { team: team2, prefix: 't2', league: match.team2League }].map(({ team, prefix, league }) => (
            <div key={prefix} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1 bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] font-bold text-gray-600">{team.pairNumber}番 ({league}リーグ)</span>
              </div>
              {entries.filter(e => e.key.startsWith(prefix)).map(entry => (
                <div key={entry.key} className="px-3 py-1.5 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 shrink-0">{entry.label}</span>
                    {entry.type === 'name' && entry.fullName ? (
                      <span className="text-xs text-gray-800">
                        <span className="font-bold">{entry.displayName}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-gray-800">{entry.displayName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Edit3 size={10} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      value={entry.furigana}
                      onChange={e => updateFurigana(entry.key, e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                      placeholder={entry.type === 'name' ? '苗字の読み仮名' : '読み仮名'}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <p className="text-[10px] font-bold text-blue-600 mb-1">読み上げテキスト</p>
            <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap">{previewText}</p>
          </div>
        </div>

        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSaveAndSpeak} disabled={saving}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
            {saving ? <><Save size={12} />保存中...</> : <><Volume2 size={12} />保存してコール</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
