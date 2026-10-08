import { useContext } from 'react';

import { AuthContext } from './AuthContext.jsx';

/** Returns true if the current user holds the given permission code. */
export function useCan() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useCan must be used inside <AuthProvider>');
  return (permission) =>
    Array.isArray(ctx.user?.permissions) && ctx.user.permissions.includes(permission);
}

/** Renders children only when the current user holds the permission. */
export function Can({ permission, children, fallback = null }) {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('Can must be used inside <AuthProvider>');
  const allowed = Array.isArray(ctx.user?.permissions) && ctx.user.permissions.includes(permission);
  return allowed ? children : fallback;
}
