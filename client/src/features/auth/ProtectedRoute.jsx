import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext.jsx';

/**
 * Protected route mechanism.
 * Unauthenticated users are redirected to /login; authenticated users
 * see the wrapped content. No permission/scope checks here yet.
 */
function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading session…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
