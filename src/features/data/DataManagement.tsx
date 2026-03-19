import { Database as DatabaseIcon, ListChecks } from 'lucide-react';
import PlayerDataList from './PlayerDataList';
import DataImport from './DrawMeetingImport';
import DataSync from './DataSync';

export default function DataManagement() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <header className="bg-white p-4 rounded-xl card-tottori">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DatabaseIcon className="w-6 h-6 text-primary-500" />
            データ管理
          </h1>
          <p className="text-sm text-gray-500 mt-1 hidden sm:block">
            ドロー会議システムからのデータ読込み、所属・ふりがなの管理を行います。
          </p>
        </div>
      </header>

      {/* データ同期パネル */}
      <div>
        <DataSync />
      </div>

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

      {/* 所属・ふりがな一覧パネル */}
      <section className="bg-white rounded-xl card-tottori overflow-hidden">
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
