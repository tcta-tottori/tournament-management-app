import { useState } from 'react';
import { useMixedStore } from './mixedStore';
import { FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';

export default function MixedExcelViewer() {
  const { rawExcelSheets } = useMixedStore();
  const [open, setOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);

  if (rawExcelSheets.length === 0) return null;

  const sheet = rawExcelSheets[activeSheet];
  // 空行を末尾からトリム
  const data = sheet?.data || [];
  let lastNonEmpty = data.length - 1;
  while (lastNonEmpty >= 0 && data[lastNonEmpty].every(c => !c)) lastNonEmpty--;
  const trimmedData = data.slice(0, lastNonEmpty + 1);

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        {open ? <ChevronDown size={16} className="text-blue-600" /> : <ChevronRight size={16} className="text-blue-600" />}
        <FileSpreadsheet size={16} className="text-blue-600" />
        <span className="font-semibold text-blue-700 text-sm">読込Excelデータ</span>
        <span className="text-xs text-blue-400 ml-1">{rawExcelSheets.length}シート</span>
      </button>

      {open && (
        <div className="p-3">
          {/* シートタブ */}
          <div className="flex gap-1 mb-3 overflow-x-auto">
            {rawExcelSheets.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSheet(i)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSheet === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* テーブル表示 */}
          <div className="overflow-auto max-h-[500px] border border-gray-200 rounded-lg">
            <table className="text-[10px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100">
                  <th className="px-1.5 py-1 text-gray-400 border-r border-b border-gray-200 font-mono w-8">#</th>
                  {trimmedData[0]?.map((_, ci) => (
                    <th key={ci} className="px-1.5 py-1 text-gray-400 border-r border-b border-gray-200 font-mono min-w-[60px]">
                      {String.fromCharCode(65 + (ci % 26))}{ci >= 26 ? Math.floor(ci / 26) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trimmedData.map((row, ri) => (
                  <tr key={ri} className="hover:bg-blue-50/30">
                    <td className="px-1.5 py-0.5 text-gray-400 font-mono border-r border-b border-gray-100 text-center bg-gray-50">{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-1.5 py-0.5 border-r border-b border-gray-100 whitespace-nowrap text-gray-700 max-w-[200px] truncate" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
