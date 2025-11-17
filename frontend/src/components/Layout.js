import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Home,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Repeat,
  Bridge,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';

/**
 * 메인 레이아웃
 */
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const navigation = [
    { name: '대시보드', to: '/', icon: Home },
    { name: '지갑', to: '/wallet', icon: Wallet },
    { name: '보내기', to: '/send', icon: ArrowUpRight },
    { name: '받기', to: '/receive', icon: ArrowDownLeft },
    { name: '스왑', to: '/swap', icon: Repeat },
    { name: '브릿지', to: '/bridge', icon: Bridge },
    { name: '스테이킹', to: '/staking', icon: TrendingUp },
    { name: '설정', to: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg" />
              <span className="text-xl font-bold">KONET</span>
            </div>
            <button
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.name}
                  to={item.to}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                    ${isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{user?.email || 'User'}</div>
                <div className="text-xs text-gray-500">사용자</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b h-16">
          <div className="flex items-center justify-between h-full px-4 lg:px-8">
            <button
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>

            <div className="flex-1" />

            {/* Notifications, etc */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-sm text-gray-600">
                KONET Blockchain
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
