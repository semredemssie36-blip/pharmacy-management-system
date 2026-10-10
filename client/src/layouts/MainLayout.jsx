import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/navigation/Sidebar.jsx';
import TopNavigation from '../components/navigation/TopNavigation.jsx';

/**
 * Enterprise Main Shell
 * Integrates role-filtered collapsible sidebar, TopNavigation with quick switcher,
 * and high-aesthetics content viewport.
 */
function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex antialiased">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopNavigation onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
