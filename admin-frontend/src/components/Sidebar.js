import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();

  const menuItems = [
    { icon: <LayoutDashboard size={20} />, label: '대시보드', path: '/dashboard' },
    { icon: <Users size={20} />, label: '사용자 관리', path: '/users' },
    { icon: <FileText size={20} />, label: 'KYC 관리', path: '/kyc' },
    { icon: <Settings size={20} />, label: '설정', path: '/settings' },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-screen transition-all duration-300 bg-gray-900 text-white
          ${isOpen ? 'w-64' : 'w-20'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
          {isOpen && <h1 className="text-xl font-bold">KONET Admin</h1>}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}
                  ${!isOpen && 'justify-center'}`}
              >
                {item.icon}
                {isOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
