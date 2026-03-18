import { Database as DatabaseIcon, ListChecks } from 'lucide-react';
import TournamentManager from './TournamentManager';
import PlayerDataList from './PlayerDataList';
import DataImport from './DrawMeetingImport';
import DataSync from './DataSync';

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
            ドロー会議システムからのデータ読込み、大会マスタの管理、所属・ふりがなの管理を行います。
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

      {/* 所属・ふりがな一覧パネル */}
      <section className="mt-6 bg-white rounded-xl card-tottori overflow-hidden">
        <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">所属・ふりがな一覧</h2>
        </div>
        <div className="p-5">
          <PlayerDataList />
        </div>
      </section>
    </div>
  );
}
