import { useState, useEffect, useCallback } from 'react';
import { Volume2, Edit3, Save, X } from 'lucide-react';
import { db } from '../../db/database';
import type { BracketMatch, PlacementCategory, MixedTeam } from './types';

const CATEGORY_LABELS_FULL: Record<PlacementCategory, string> = {
  '1st': '1位トーナメント', '2nd': '2位トーナメント', '3rd': '3位トーナメント', '4th': '4・5位トーナメント',
};

/** 苗字のみ取得 */
export const familyName = (name: string) => name.trim().split(/[\s　]+/)[0] || name;

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

  const t1Parts = team1.teamName.split('・');
  const t2Parts = team2.teamName.split('・');
  const t1MaleName = resolve('t1m_name', t1Parts[0] || familyName(team1.male.name));
  const t1FemaleName = resolve('t1f_name', t1Parts[1] || familyName(team1.female.name));
  const t2MaleName = resolve('t2m_name', t2Parts[0] || familyName(team2.male.name));
  const t2FemaleName = resolve('t2f_name', t2Parts[1] || familyName(team2.female.name));
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
      // teamNameから苗字を確実に取得（"竹安・楠瀬" → ["竹安", "楠瀬"]）
      const t1Parts = team1.teamName.split('・');
      const t2Parts = team2.teamName.split('・');
      const maleFN1 = t1Parts[0] || familyName(team1.male.name);
      const femaleFN1 = t1Parts[1] || familyName(team1.female.name);
      const maleFN2 = t2Parts[0] || familyName(team2.male.name);
      const femaleFN2 = t2Parts[1] || familyName(team2.female.name);

      // 苗字キーと全名キーの両方で辞書を検索
      const familyKeys = [maleFN1, femaleFN1, maleFN2, femaleFN2].map(n => n.replace(/\s/g, ''));
      const fullNameKeys = [
        team1.male.name, team1.female.name,
        team2.male.name, team2.female.name,
      ].map(n => n.replace(/\s/g, ''));
      const allKeys = [...new Set([...familyKeys, ...fullNameKeys])];
      const nameFuriganas = await db.furiganaDict.where('name').anyOf(allKeys).toArray();
      const nameMap = new Map(nameFuriganas.map(f => [f.name, f.furigana]));

      const affKeys = [
        team1.male.affiliation, team1.female.affiliation,
        team2.male.affiliation, team2.female.affiliation,
      ].filter(Boolean);
      const affFuriganas = await db.affiliationFurigana.where('name').anyOf(affKeys).toArray();
      const affMap = new Map(affFuriganas.map(f => [f.name, f.furigana]));

      // 苗字のふりがなを取得: 苗字キー→全名キー（スペース区切りで先頭部分）の順で検索
      const getFamilyFurigana = (familyNameKanji: string, fullName: string): string => {
        // まず苗字キーで辞書を検索（前回保存分）
        const fnKey = familyNameKanji.replace(/\s/g, '');
        const fnFurigana = nameMap.get(fnKey);
        if (fnFurigana) return fnFurigana;
        // 全名キーで検索し、スペース区切りで先頭部分を返す
        const fullKey = fullName.replace(/\s/g, '');
        const fullFurigana = nameMap.get(fullKey);
        if (fullFurigana) {
          const parts = fullFurigana.trim().split(/[\s　]+/);
          if (parts.length > 1) return parts[0];
          // スペースなしの全名ふりがな → 苗字漢字をデフォルトにする
          return familyNameKanji;
        }
        return familyNameKanji;
      };

      setEntries([
        { key: 't1m_name', label: 'チーム1 男子 名前', displayName: maleFN1, furigana: getFamilyFurigana(maleFN1, team1.male.name), type: 'name' },
        { key: 't1m_aff', label: 'チーム1 男子 所属', displayName: team1.male.affiliation, furigana: affMap.get(team1.male.affiliation) || team1.male.affiliation, type: 'affiliation' },
        { key: 't1f_name', label: 'チーム1 女子 名前', displayName: femaleFN1, furigana: getFamilyFurigana(femaleFN1, team1.female.name), type: 'name' },
        { key: 't1f_aff', label: 'チーム1 女子 所属', displayName: team1.female.affiliation, furigana: affMap.get(team1.female.affiliation) || team1.female.affiliation, type: 'affiliation' },
        { key: 't2m_name', label: 'チーム2 男子 名前', displayName: maleFN2, furigana: getFamilyFurigana(maleFN2, team2.male.name), type: 'name' },
        { key: 't2m_aff', label: 'チーム2 男子 所属', displayName: team2.male.affiliation, furigana: affMap.get(team2.male.affiliation) || team2.male.affiliation, type: 'affiliation' },
        { key: 't2f_name', label: 'チーム2 女子 名前', displayName: femaleFN2, furigana: getFamilyFurigana(femaleFN2, team2.female.name), type: 'name' },
        { key: 't2f_aff', label: 'チーム2 女子 所属', displayName: team2.female.affiliation, furigana: affMap.get(team2.female.affiliation) || team2.female.affiliation, type: 'affiliation' },
      ]);
    };
    init();
  }, [team1, team2]);

  const updateFurigana = useCallback((key: string, value: string) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, furigana: value } : e));
  }, []);

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

    const overrides: Record<string, string> = {};
    for (const entry of entries) overrides[entry.key] = entry.furigana;
    const text = buildCallText(match, allTeams, category, roundLabel, courtName, startTime, overrides);
    onConfirm(text, overrides);
  };

  const catLabel = CATEGORY_LABELS_FULL[category];
  const overrides: Record<string, string> = {};
  for (const entry of entries) overrides[entry.key] = entry.furigana;
  const previewText = buildCallText(match, allTeams, category, roundLabel, courtName, startTime, overrides);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-[10px] text-gray-500">読み仮名を確認・修正してください。修正内容はデータベースに保存されます。</p>

          {[{ team: team1, prefix: 't1', league: match.team1League },
            { team: team2, prefix: 't2', league: match.team2League }].map(({ team, prefix, league }) => (
            <div key={prefix} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] font-bold text-gray-600">{team.pairNumber}番 ({league}リーグ)</span>
              </div>
              {entries.filter(e => e.key.startsWith(prefix)).map(entry => (
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
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-blue-600 mb-1">読み上げテキスト</p>
            <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{previewText}</p>
          </div>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSaveAndSpeak} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
            {saving ? <><Save size={12} />保存中...</> : <><Volume2 size={12} />保存してコール</>}
          </button>
        </div>
      </div>
    </div>
  );
}
