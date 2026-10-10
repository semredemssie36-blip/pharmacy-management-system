import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { PillCrossLogo } from '../components/common/Icons.jsx';

const DEMO_ACCOUNTS = [
  { role: 'System Administrator', email: 'admin@pharmacy.local', badge: 'Full Access', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { role: 'Branch Manager', email: 'manager@pharmacy.local', badge: 'Branch Ops', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { role: 'Pharmacist', email: 'pharmacist@pharmacy.local', badge: 'Rx & Clinical', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { role: 'Pharmacy Technician', email: 'technician@pharmacy.local', badge: 'Dispensing', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { role: 'Sales / Cashier', email: 'cashier@pharmacy.local', badge: 'POS & Billing', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { role: 'Storekeeper', email: 'storekeeper@pharmacy.local', badge: 'Inventory & GRN', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { role: 'Procurement Officer', email: 'procurement@pharmacy.local', badge: 'Purchases & Vendors', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { role: 'Finance User', email: 'finance@pharmacy.local', badge: 'Ledgers & AR/AP', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { role: 'Management / Reporting', email: 'reporting@pharmacy.local', badge: 'BI & Analytics', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [localError, setLocalError] = useState(null);

  async function performLogin(userEmail, userPassword) {
    setLocalError(null);
    setError(null);

    if (!userEmail.trim() || !userPassword) {
      setLocalError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      await login(userEmail.trim(), userPassword);
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await performLogin(email, password);
  }

  async function handleQuickDemoLogin(demoEmail) {
    setEmail(demoEmail);
    setPassword('Passw0rd!123');
    await performLogin(demoEmail, 'Passw0rd!123');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 select-none">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <PillCrossLogo className="w-12 h-12 pointer-events-none" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Pharmacy ERP
        </h1>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Enterprise Management System • EthioCodes Software Development
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-slate-200/80 space-y-6">
          {/* Main Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@pharmacy.local"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Demo: Passw0rd!123</span>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            {localError && <p className="text-xs text-amber-600 font-semibold">{localError}</p>}
            {error && <p className="text-xs text-rose-600 font-semibold" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-md disabled:opacity-50"
            >
              {submitting ? 'Authenticating…' : 'Sign In to Workspace'}
            </button>
          </form>

          {/* 1-Click Quick Demo Switcher Section */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                1-Click Demo Actor Sign In
              </span>
              <span className="text-[10px] text-slate-400 font-medium">9 Canonical Roles</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleQuickDemoLogin(acc.email)}
                  className="flex flex-col text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-xs group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-slate-800 group-hover:text-blue-700 truncate">
                      {acc.role}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${acc.color}`}>
                      {acc.badge}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 truncate mt-1">
                    {acc.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Protected by role-based access control and branch scope isolation.
        </p>
      </div>
    </div>
  );
}
