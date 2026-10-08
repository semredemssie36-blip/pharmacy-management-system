import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';

function renderWithAuth(authValue) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Secret area</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

test('unauthenticated users are redirected to login', () => {
  renderWithAuth({ status: 'unauthenticated', user: null });
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(screen.queryByText('Secret area')).not.toBeInTheDocument();
});

test('authenticated users see the protected content', () => {
  renderWithAuth({ status: 'authenticated', user: { email: 'a@b.c' } });
  expect(screen.getByText('Secret area')).toBeInTheDocument();
});

test('loading state is shown while session is checked', () => {
  renderWithAuth({ status: 'loading', user: null });
  expect(screen.getByText(/Loading session/i)).toBeInTheDocument();
});
