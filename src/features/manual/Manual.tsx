import { useState } from 'react';
import { HelpCircle, Database, Users, List, Dices, Trophy, ClipboardList, MonitorPlay, CalendarDays, BarChart2, Save, Volume2, ChevronDown, ChevronRight } from 'lucide-react';

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  content: string[];
}

const SECTIONS: Section[] = [
  {
    id: 'S-01', icon: Database, title: 'データ管理',
    content: [
      '大会の基本情報（大会名、日程、会場）を登録・管理します。',
      '選手マスタデータは、県テニス協会のランキングExcelファイル（.xlsx）をアップロードして一括登録できます。',
      'ふりがな辞書機能により、kuromoji（形態素解析）を使った自動ふりがな付与や、Excel経由での手動修正が可能です。',
      '【操作手順】\n1. 「大会情報」タブで大会を作成\n2. 「マスタデータ」タブでランキングExcelをアップロード\n3. 「ふりがな管理」タブで選手のふりがなを確認・修正',
    ]
  },
  {
    id: 'S-02', icon: Users, title: 'エントリー登録',
    content: [
      '各種目に対して選手のエントリーを登録します。',
      '左パネルの選手マスタから選手を検索し、クリックで種目にエントリーできます。',
      'ダブルスの場合は、2人の選手を順番に選択してペアを組みます。',
      'Excel一括インポート機能により、まとめてエントリーを登録することも可能です。',
    ]
  },
  {
    id: 'S-03', icon: List, title: 'エントリーリスト',
    content: [
      '種目の追加・削除とエントリー一覧の確認を行います。',
      '種目を選択すると、その種目にエントリーしている選手一覧が表示されます。',
      'エントリーの状態を「active（有効）」「withdrawn（棄権）」に切り替えられます。',
      '棄権した選手はドロー生成時に除外されます。',
    ]
  },
  {
    id: 'S-04', icon: Dices, title: '抽選・ドロー作成',
    content: [
      'JTA（日本テニス協会）のルールに準拠した自動ドロー生成を行います。',
      '【自動処理】\n・ドローサイズの自動決定（4/8/16/32/64/128）\n・ポイント順のシード配置\n・BYEの均等分散（シード対抗位置優先）\n・同所属選手の1回戦対戦回避（スワップアルゴリズム）',
      '抽選結果はテーブル形式でプレビューでき、問題なければ「確定して保存」で保存します。',
      '保存後もドロー表画面（S-05）で手動調整が可能です。',
    ]
  },
  {
    id: 'S-05', icon: Trophy, title: 'ドロー表プレビュー・調整',
    content: [
      '保存済みのドローをトーナメントブラケット形式で表示します。',
      '1回戦の枠はドラッグ＆ドロップで位置を入れ替えることができます。',
      '調整後は「変更を保存」ボタンで保存してください。',
    ]
  },
  {
    id: 'S-06', icon: ClipboardList, title: '対戦順・審判用紙',
    content: [
      'ドローから試合一覧を自動生成します。',
      '1回戦の全対戦カードと、2回戦以降の空枠が作成されます。',
      'BYE対戦（不戦勝）は自動的にwalkover状態となります。',
      '「審判用紙印刷」ボタンで、各試合の審判用紙をA4形式で印刷できます。',
    ]
  },
  {
    id: 'S-07', icon: MonitorPlay, title: 'スコアボード',
    content: [
      '試合の進行管理とスコア入力を行う当日運営用画面です。',
      '【試合の流れ】\n1. 待機中の試合を「準備完了」に変更\n2. 「開始」ボタンで試合開始\n3. 「結果入力」でスコアと勝者を記録\n4. 勝者は自動的に次のラウンドに進出',
      '待機中の画面でコートの割り当ても行えます。',
    ]
  },
  {
    id: 'S-08', icon: CalendarDays, title: 'コート・時間割',
    content: [
      'コートの登録と試合のコート割り当て・時間管理を行います。',
      '左パネルでコートを追加（名前・サーフェス）し、利用可能/不可を切り替えられます。',
      '未割当の試合リストから、各コートに試合を割り当てることができます。',
      '各試合に開始予定時刻を設定できます。',
    ]
  },
  {
    id: 'S-09', icon: BarChart2, title: 'ライブダッシュボード',
    content: [
      '大会全体の進行状況をリアルタイムで一覧表示します。',
      '【表示内容】\n・全試合数/試合中/終了/待機中のサマリー\n・全体進捗バー\n・コートごとの現在の試合状況\n・種目別の進行状況とプログレスバー',
      'IndexedDBのリアルタイムクエリにより、データが更新されると自動的に画面に反映されます。',
    ]
  },
  {
    id: 'S-10', icon: Save, title: 'バックアップ・復元',
    content: [
      '全データのエクスポート（JSON）とインポート（復元）機能です。',
      '大会前や重要な操作の前にバックアップを取ることを強く推奨します。',
      'インポート時は現在のデータが全て上書きされますのでご注意ください。',
      '「全データ削除」で初期状態に戻すことも可能です（二重確認あり）。',
    ]
  },
  {
    id: 'S-12', icon: Volume2, title: '放送コールシステム',
    content: [
      'CSVデータを取り込み、Web Speech APIで試合コールを自動放送する機能です。',
      '【使い方】\n1. Google Sheetsの「対戦順」シートからCSVをダウンロード\n2. CSVファイルをドラッグ＆ドロップでインポート\n3. 各試合にコート番号（必須）と開始時間（任意）を入力\n4. 「コール」ボタンで音声放送を実行',
      'シングルス（12列CSV）とダブルス（16列CSV）を自動判別します。',
      '読み上げ速度や繰り返し回数は設定パネルで調整できます。',
      '推奨環境: Chrome（PC）を外部スピーカーに接続して使用してください。',
    ]
  },
];

export default function Manual() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAll = () => setOpenSections(new Set(SECTIONS.map(s => s.id)));
  const closeAll = () => setOpenSections(new Set());

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header className="bg-white p-4 rounded-xl shadow-sm border border-border-main">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-primary-500" />
          操作マニュアル
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          各機能の使い方を確認できます。
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={openAll} className="text-xs bg-primary-50 hover:bg-primary-50 text-primary-500 px-3 py-1 rounded-md font-medium">
            全て開く
          </button>
          <button onClick={closeAll} className="text-xs bg-primary-50 hover:bg-primary-50 text-primary-500 px-3 py-1 rounded-md font-medium">
            全て閉じる
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto space-y-3">
        {SECTIONS.map(section => {
          const isOpen = openSections.has(section.id);
          const Icon = section.icon;
          return (
            <div key={section.id} className="bg-white rounded-xl shadow-sm border border-border-main overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-primary-50 transition-colors"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                <Icon className="w-5 h-5 text-primary-500 shrink-0" />
                <span className="font-bold text-gray-900">{section.title}</span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pl-12 space-y-3">
                  {section.content.map((text, i) => (
                    <div key={i} className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">
                      {text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="bg-primary-50 rounded-xl p-4 text-center text-xs text-gray-500">
        大会運営システム - 鳥取市テニス協会
      </footer>
    </div>
  );
}
