import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import GlobalSearchBar from '../GlobalSearchBar.jsx';
import NotificationBell from '../NotificationBell.jsx';
import { MenuIcon, ChevronDownIcon } from '../common/Icons.jsx';

const DEMO_ACTORS = [
  {
    role: 'System Administrator',
    email: 'admin@pharmacy.local',
    badge: 'Super Admin',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    avatar: 'AD',
  },
  {
    role: 'Branch Manager',
    email: 'manager@pharmacy.local',
    badge: 'Operations',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    avatar: 'BM',
  },
  {
    role: 'Pharmacist',
    email: 'pharmacist@pharmacy.local',
    badge: 'Dispensing & Clinical',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    avatar: 'PH',
  },
  {
    role: 'Pharmacy Technician',
    email: 'technician@pharmacy.local',
    badge: 'Dispense Assist',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    avatar: 'PT',
  },
  {
    role: 'Cashier',
    email: 'cashier@pharmacy.local',
    badge: 'Sales & POS',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    avatar: 'CS',
  },
  {
    role: 'Storekeeper',
    email: 'storekeeper@pharmacy.local',
    badge: 'Inventory & GRN',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    avatar: 'SK',
  },
  {
    role: 'Procurement Officer',
    email: 'procurement@pharmacy.local',
    badge: 'Purchasing & Vendors',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    avatar: 'PO',
  },
  {
    role: 'Finance User',
    email: 'finance@pharmacy.local',
    badge: 'AR / AP & Ledgers',
    color: 'bg-rose-100 text-rose-700 border-rose-200',
    avatar: 'FU',
  },
  {
    role: 'Management / Reporting',
    email: 'reporting@pharmacy.local',
    badge: 'Analytics & BI',
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    avatar: 'MR',
  },
];

export default function TopNavigation({ onToggleSidebar }) {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(null);

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

  async function handleQuickSwitch(actorEmail) {
    if (user?.email === actorEmail) {
      setProfileOpen(false);
      return;
    }
    try {
      setSwitching(true);
      setSwitchError(null);
      await login(actorEmail, 'Passw0rd!123');
      setProfileOpen(false);
      navigate('/', { replace: true });
    } catch (err) {
      setSwitchError('Failed to switch actor: ' + (err.response?.data?.message || err.message));
    } finally {
      setSwitching(false);
    }
  }

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

  const userRole = user?.roles?.[0]?.name || user?.roles?.[0]?.code || 'Staff';

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/90 flex items-center justify-between px-4 sm:px-6 select-none">
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

      {/* Right controls: Branch indicator, Notifications, Profile & Actor Switcher */}
      <div className="flex items-center gap-3 sm:gap-4 ml-4">
        {/* Branch / Org Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 border border-slate-200 rounded-full text-xs text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse pointer-events-none"></span>
          <span className="font-semibold text-slate-800">
            {user?.branch_name || 'Piassa Branch'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">
            {user?.organization_name || 'EthioCodes Pharma'}
          </span>
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* User profile dropdown & Actor switcher */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100/80 transition-colors focus:outline-none"
            title="Profile & Actor Switcher"
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
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden z-50 animate-fadeIn">
              {/* Current user header */}
              <div className="p-4 bg-slate-50/90 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-xs pointer-events-none">
                    {initials}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {user?.name || 'Authorized User'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actor Switcher Section */}
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Quick Actor Switcher
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">9 Canonical Roles</span>
                </div>

                {switchError && (
                  <div className="mb-2 p-2 rounded bg-rose-50 text-rose-700 text-xs border border-rose-200">
                    {switchError}
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {DEMO_ACTORS.map((actor) => {
                    const isCurrent = user?.email === actor.email;
                    return (
                      <button
                        key={actor.email}
                        disabled={switching}
                        onClick={() => handleQuickSwitch(actor.email)}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors text-left ${
                          isCurrent
                            ? 'bg-blue-50 border border-blue-200 text-blue-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 pointer-events-none">
                            {actor.avatar}
                          </span>
                          <div className="truncate">
                            <span className="block font-medium truncate">{actor.role}</span>
                            <span className="block text-[10px] text-slate-400 truncate">
                              {actor.email}
                            </span>
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                            Active
                          </span>
                        ) : (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${actor.color}`}
                          >
                            Switch
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sign out */}
              <div className="p-2 bg-slate-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  Sign Out from Pharmacy ERP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
