import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { PillCrossLogo } from '../components/common/Icons.jsx';

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
      setError(err.response?.data?.message || err.message || 'Login failed. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await performLogin(email, password);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 select-none">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200/80">
            <PillCrossLogo className="w-10 h-10 pointer-events-none" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Pharmacy ERP
        </h1>
        <p className="mt-1.5 text-xs text-slate-500 font-medium">
          Authoritative Healthcare & Pharmacy Operations Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-slate-200/80">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter your organizational credentials to continue</p>
          </div>

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
                placeholder="user@pharmacy.local"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
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
              className="w-full mt-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.99] transition shadow-md disabled:opacity-50"
            >
              {submitting ? 'Authenticating…' : 'Sign In to Workspace'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Identity Service Online
            </span>
            <span>TLS 1.3 Encrypted</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Protected by role-based access control and branch scope isolation.
        </p>
      </div>
    </div>
  );
}
