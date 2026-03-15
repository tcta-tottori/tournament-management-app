import { Outlet, NavLink } from 'react-router-dom';
import { 
  Database, Users, List, Dices, Trophy, 
  ClipboardList, MonitorPlay, CalendarDays, BarChart2, 
  Save, HelpCircle, FileText
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'S-01', path: '/data', label: 'データ', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', icon: Users },
  { id: 'S-03', path: '/entry-list', label: 'リスト', icon: List },
  { id: 'S-04', path: '/draw-lot', label: '抽選', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', icon: Trophy },
  { id: 'S-06', path: '/referee', label: '対戦/審判', icon: ClipboardList, isRun: true },
  { id: 'S-07', path: '/score', label: 'スコア', icon: MonitorPlay, isRun: true },
  { id: 'S-08', path: '/schedule', label: '時間割', icon: CalendarDays, isRun: true },
  { id: 'S-09', path: '/dashboard', label: 'LIVE', icon: BarChart2, isRun: true },
  { id: 'S-10', path: '/backup', label: 'バックアップ', icon: Save },
  { id: 'S-11', path: '/manual', label: 'マニュアル', icon: HelpCircle },
];

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50 flex-col md:flex-row overflow-hidden">
      
      {/* 💻 PC用サイドバー */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 shadow-sm z-10">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-primary-600 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            大会運営システム
          </h1>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <FileText className="w-3 h-3" /> 要件定義 V1.0 準拠
          </p>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-2">
          {/* 大会準備フェーズ */}
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            準備・抽選
          </div>
          <ul className="space-y-1 px-2 mb-4">
            {NAV_ITEMS.filter(item => !item.isRun && item.id !== 'S-10' && item.id !== 'S-11').map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                      isActive 
                        ? 'bg-primary-50 text-primary-600' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* 当日運営フェーズ */}
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            当日運営
          </div>
          <ul className="space-y-1 px-2 mb-4">
            {NAV_ITEMS.filter(item => item.isRun).map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                      isActive 
                        ? 'bg-secondary-50 text-secondary-600' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* システム管理 */}
          <div className="border-t border-gray-200 mt-2 pt-2 px-2 space-y-1">
            {NAV_ITEMS.filter(item => item.id === 'S-10' || item.id === 'S-11').map((item) => (
               <NavLink
                 key={item.id}
                 to={item.path}
                 className={({ isActive }) =>
                   `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                     isActive 
                       ? 'bg-gray-200 text-gray-900' 
                       : 'text-gray-600 hover:bg-gray-100'
                   }`
                 }
               >
                 <item.icon className="w-4 h-4" />
                 {item.label}
               </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      {/* 📱 メインコンテンツ */}
      <main className="flex-1 overflow-y-auto relative bg-gray-50 pb-16 md:pb-0 h-full">
        {/* モバイル用ヘッダー（仮） */}
        <header className="md:hidden bg-white border-b border-gray-200 p-3 flex justify-between items-center shadow-sm z-10 sticky top-0">
           <h1 className="text-md font-bold text-primary-600 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            大会運営統合Web
          </h1>
        </header>
        
        <Outlet />
      </main>

      {/* 📱 モバイル用ボトムナビゲーション */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
        <div className="flex justify-around">
          {/* ボトムナビは主要なものを抜粋 */}
          {[
            NAV_ITEMS.find(n => n.id === 'S-01'),
            NAV_ITEMS.find(n => n.id === 'S-02'),
            NAV_ITEMS.find(n => n.id === 'S-04'),
            NAV_ITEMS.find(n => n.id === 'S-05'),
            NAV_ITEMS.find(n => n.id === 'S-06'),
          ].map((item) => (
            item && (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center w-full py-2 transition-colors ${
                    isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-900'
                  }`
                }
              >
                <item.icon className={`w-5 h-5 ${item.isRun && 'text-secondary-500'}`} />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </NavLink>
            )
          ))}
        </div>
      </nav>
    </div>
  );
}
