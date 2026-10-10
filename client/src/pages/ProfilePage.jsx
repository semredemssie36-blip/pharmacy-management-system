import { useState } from 'react';
import { useAuth } from '../features/auth/AuthContext.jsx';
import * as authApi from '../features/auth/authApi.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function ProfilePage() {
  const { user, refresh } = useAuth();

  // Profile edit state
  const [name, setName] = useState(user?.name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdError, setPwdError] = useState(null);

  // Search filter for permissions
  const [permSearch, setPermSearch] = useState('');

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const userRoles = user?.roles || [];
  const permissions = user?.permissions || [];

  const filteredPerms = permissions.filter((p) =>
    p.toLowerCase().includes(permSearch.toLowerCase().trim())
  );

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileError(null);

    if (!name.trim()) {
      setProfileError('Full name cannot be blank.');
      return;
    }

    setProfileSaving(true);
    try {
      await authApi.updateProfile({ name: name.trim() });
      await refresh();
      setProfileMsg('Profile updated successfully.');
    } catch (err) {
      setProfileError(err.response?.data?.message || err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwdMsg(null);
    setPwdError(null);

    if (!currentPassword) {
      setPwdError('Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    setPwdSaving(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPwdMsg('Password updated successfully. Use your new password on next sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err.response?.data?.message || err.message || 'Failed to change password.');
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-12 select-none">
      <PageHeader
        title="My Profile & Security"
        description="Manage your account profile, credentials, and view active role permissions."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Profile' },
        ]}
      />

      {/* Profile Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900 truncate">
                {user?.name || 'Staff Member'}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Active Account
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {userRoles.map((r) => (
                <span
                  key={r.id || r.code}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                >
                  {r.name || r.code}
                </span>
              ))}
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                Branch: {user?.branch_name || 'Piassa Main Branch'}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                Org: {user?.organization_name || 'EthioCodes Central Pharmacy'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Details Form */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
          <div className="border-b border-slate-100 pb-4 mb-5">
            <h3 className="text-base font-bold text-slate-900">Personal Information</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your basic display information across the pharmacy platform.
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Full Name"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Email addresses are bound to your organizational directory account.
              </span>
            </div>

            {profileMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                {profileMsg}
              </div>
            )}
            {profileError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-semibold border border-rose-200">
                {profileError}
              </div>
            )}

            <button
              type="submit"
              disabled={profileSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm shadow-xs transition disabled:opacity-50"
            >
              {profileSaving ? 'Saving…' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        {/* Change Password Form */}
        <div id="security" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
          <div className="border-b border-slate-100 pb-4 mb-5">
            <h3 className="text-base font-bold text-slate-900">Security & Password</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Change your password regularly to secure access to pharmacy clinical & financial data.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>

            {pwdMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                {pwdMsg}
              </div>
            )}
            {pwdError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-semibold border border-rose-200">
                {pwdError}
              </div>
            )}

            <button
              type="submit"
              disabled={pwdSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm shadow-xs transition disabled:opacity-50"
            >
              {pwdSaving ? 'Updating Password…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Role & Effective Permissions Inspector */}
      <div id="permissions" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Active Role Permissions ({permissions.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative capabilities assigned to your account through active organizational roles.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="search"
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
              placeholder="Search permissions…"
              className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>
        </div>

        {filteredPerms.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No matching permissions found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
            {filteredPerms.map((code) => (
              <div
                key={code}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs text-slate-700"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                <span className="font-mono text-[11px] truncate">{code}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
