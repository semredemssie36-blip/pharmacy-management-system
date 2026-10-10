import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from './authApi.js';

export const AuthContext = createContext(null);



/**
 * Authentication provider.
 * The backend is authoritative: on mount we ask /api/auth/me whether a
 * valid session exists instead of trusting any client-side token.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authenticated | unauthenticated
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.getCurrentUser();
      setUser(res.data.user);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    setUser(res.data.user);
    setStatus('authenticated');
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const can = useCallback(
    (permission) =>
      user?.permissions?.includes('*') ||
      (Array.isArray(user?.permissions) && user.permissions.includes(permission)),
    [user]
  );

  const value = useMemo(
    () => ({ status, user, login, logout, refresh, can }),
    [status, user, login, logout, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
