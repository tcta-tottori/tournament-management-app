import { Database as DatabaseIcon, CalendarDays, Info, Zap, MapPin } from 'lucide-react';
import TournamentManager from './TournamentManager';
import FuriganaManager from './FuriganaManager';
import AffiliationFuriganaManager from './AffiliationFuriganaManager';
import DataImport from './DrawMeetingImport';
import DataSync from './DataSync';
import ScheduleImport from './ScheduleImport';
import ScheduleGenerator from './ScheduleGenerator';
import TournamentInfo from './TournamentInfo';

export default function DataManagement() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto h-full flex flex-col">
      <header className="mb-6 bg-white p-4 rounded-xl card-tottori">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DatabaseIcon className="w-6 h-6 text-primary-500" />
            データ管理
          </h1>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">
            ドロー会議システムからのデータ読込み、大会マスタの管理、ふりがなDBの管理を行います。
          </p>
        </div>
      </header>

      {/* データ同期パネル（フルwidth） */}
      <div className="mb-6">
        <DataSync />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ドロー会議システム読込パネル */}
        <section className="bg-white rounded-xl card-tottori overflow-hidden">
          <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
            <DatabaseIcon className="w-5 h-5 text-primary-500" />
            <h2 className="font-semibold text-primary-600">データ読込</h2>
          </div>
          <div className="p-4">
            <DataImport />
          </div>
        </section>

        {/* 大会マスタ管理パネル */}
        <section className="bg-white rounded-xl card-tottori overflow-hidden flex flex-col h-[350px] md:h-[500px]">
          <div className="bg-primary-50 px-4 py-3 border-b border-border-main">
             <h2 className="font-semibold text-gray-900">大会マスタ管理</h2>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
             <TournamentManager />
          </div>
        </section>
      </div>

      {/* スケジュール自動生成パネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-sky px-4 py-3 border-b border-border-main flex items-center gap-2">
          <Zap className="w-5 h-5 text-ocean" />
          <h2 className="font-semibold text-ocean">スケジュール自動生成</h2>
        </div>
        <div className="p-5">
          <ScheduleGenerator />
        </div>
      </section>

      {/* 時間割インポートパネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-sky px-4 py-3 border-b border-border-main flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-ocean" />
          <h2 className="font-semibold text-ocean">時間割インポート（Excel/CSV）</h2>
        </div>
        <div className="p-5">
          <ScheduleImport />
        </div>
      </section>

      {/* 大会情報パネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-secondary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <Info className="w-5 h-5 text-secondary-600" />
          <h2 className="font-semibold text-secondary-700">大会情報（ドロー会議システム）</h2>
        </div>
        <div className="p-5">
          <TournamentInfo />
        </div>
      </section>

      {/* ふりがなDB管理パネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">ふりがなデータベース管理</h2>
        </div>
        <div className="p-5">
           <FuriganaManager />
        </div>
      </section>

      {/* 所属ふりがな管理パネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">所属ふりがな管理</h2>
        </div>
        <div className="p-5">
          <AffiliationFuriganaManager />
        </div>
      </section>
    </div>
  );
}
