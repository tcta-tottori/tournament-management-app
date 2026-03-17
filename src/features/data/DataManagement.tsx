import { Database as DatabaseIcon, CalendarDays, Info, Zap } from 'lucide-react';
import TournamentManager from './TournamentManager';
import FuriganaManager from './FuriganaManager';
import DataImport from './DrawMeetingImport';
import DataSync from './DataSync';
import ScheduleImport from './ScheduleImport';
import ScheduleGenerator from './ScheduleGenerator';
import TournamentInfo from './TournamentInfo';

export default function DataManagement() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto h-full flex flex-col">
      <header className="mb-6 bg-white p-4 rounded-[10px] shadow-sm border border-[#e0e7ef]">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DatabaseIcon className="w-6 h-6 text-[#2e7d32]" />
            データ管理
          </h1>
          <p className="text-sm text-[#6b7280] mt-1">
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
        <section className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex items-center gap-2">
            <DatabaseIcon className="w-5 h-5 text-[#2e7d32]" />
            <h2 className="font-semibold text-[#1b5e20]">データ読込</h2>
          </div>
          <div className="p-4">
            <DataImport />
          </div>
        </section>

        {/* 大会マスタ管理パネル */}
        <section className="bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden flex flex-col h-[500px] hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="bg-[#f1f8e9] px-4 py-3 border-b border-[#e0e7ef]">
             <h2 className="font-semibold text-[#111827]">大会マスタ管理</h2>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
             <TournamentManager />
          </div>
        </section>
      </div>

      {/* スケジュール自動生成パネル */}
      <section className="mt-6 bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
        <div className="bg-[#e3f2fd] px-4 py-3 border-b border-[#e0e7ef] flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#1565c0]" />
          <h2 className="font-semibold text-[#0d47a1]">スケジュール自動生成</h2>
        </div>
        <div className="p-5">
          <ScheduleGenerator />
        </div>
      </section>

      {/* 時間割インポートパネル */}
      <section className="mt-6 bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
        <div className="bg-[#e3f2fd] px-4 py-3 border-b border-[#e0e7ef] flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#1565c0]" />
          <h2 className="font-semibold text-[#0d47a1]">時間割インポート（Excel/CSV）</h2>
        </div>
        <div className="p-5">
          <ScheduleImport />
        </div>
      </section>

      {/* 大会情報パネル */}
      <section className="mt-6 bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
        <div className="bg-[#fff8e1] px-4 py-3 border-b border-[#e0e7ef] flex items-center gap-2">
          <Info className="w-5 h-5 text-[#f57f17]" />
          <h2 className="font-semibold text-[#e65100]">大会情報（ドロー会議システム）</h2>
        </div>
        <div className="p-5">
          <TournamentInfo />
        </div>
      </section>

      {/* ふりがなDB管理パネル */}
      <section className="mt-6 bg-white rounded-[10px] shadow-sm border border-[#e0e7ef] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">
        <div className="bg-[#e8f5e9] px-4 py-3 border-b border-[#e0e7ef] flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5 text-[#2e7d32]" />
          <h2 className="font-semibold text-[#1b5e20]">ふりがなデータベース管理</h2>
        </div>
        <div className="p-5">
           <FuriganaManager />
        </div>
      </section>
    </div>
  );
}
