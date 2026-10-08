import { RouterProvider } from 'react-router-dom';

import router from '../../routes/router.jsx';
import { AuthProvider } from '../../features/auth/AuthContext.jsx';

/** Application providers: auth state + router + (later) theme/query providers. */
function AppProviders() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default AppProviders;
