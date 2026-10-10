import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import GlobalSearchBar from '../GlobalSearchBar.jsx';
import NotificationBell from '../NotificationBell.jsx';
import { MenuIcon, ChevronDownIcon } from '../common/Icons.jsx';

export default function TopNavigation({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // Derive display initials
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const userRole = user?.roles?.[0]?.name || user?.roles?.[0]?.code || 'Staff Member';

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/90 flex items-center justify-between px-4 sm:px-6 select-none shrink-0">
      {/* Left: Mobile hamburger & Search bar */}
      <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-xl">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none"
        >
          <MenuIcon className="w-5 h-5 pointer-events-none" />
        </button>

        <div className="flex-1">
          <GlobalSearchBar />
        </div>
      </div>

      {/* Right controls: Branch indicator, Notifications, Profile */}
      <div className="flex items-center gap-3 sm:gap-4 ml-4">
        {/* Branch / Org Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 border border-slate-200 rounded-full text-xs text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse pointer-events-none"></span>
          <span className="font-semibold text-slate-800">
            {user?.branch_name || 'Piassa Main Branch'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            {user?.organization_name || 'EthioCodes Central Pharmacy'}
          </span>
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* User Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100/80 transition-colors focus:outline-none"
            title="User Profile & Settings"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs pointer-events-none select-none">
              {initials}
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {user?.name || user?.email || 'User'}
              </span>
              <span className="text-[11px] text-blue-600 font-medium leading-none">
                {userRole}
              </span>
            </div>
            <ChevronDownIcon className="w-4 h-4 text-slate-400 pointer-events-none" />
          </button>

          {/* Profile Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden z-50 animate-fadeIn">
              {/* Current user header */}
              <div className="p-4 bg-slate-50/90 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-xs pointer-events-none shrink-0">
                    {initials}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {user?.name || 'Authorized User'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-700">
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation links */}
              <div className="p-2 space-y-1">
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>My Profile & Account</span>
                </Link>

                <Link
                  to="/profile#security"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Security & Password</span>
                </Link>

                <Link
                  to="/profile#permissions"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Active Permissions ({user?.permissions?.length || 0})</span>
                </Link>
              </div>

              {/* Sign out */}
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
