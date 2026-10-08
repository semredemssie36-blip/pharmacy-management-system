import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import LoginPage from '../pages/LoginPage.jsx';

function renderLogin(loginImpl) {
  return render(
    <AuthContext.Provider value={{ status: 'unauthenticated', user: null, login: loginImpl }}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

test('login page renders the expected fields', () => {
  renderLogin(vi.fn());
  expect(screen.getByText('Pharmacy ERP')).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});

test('shows validation feedback when fields are empty', async () => {
  renderLogin(vi.fn());
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(screen.getByText(/Email and password are required/i)).toBeInTheDocument();
});

test('shows authentication error feedback on failed login', async () => {
  const login = vi.fn().mockRejectedValue(new Error('Invalid email or password'));
  renderLogin(login);

  await userEvent.type(screen.getByLabelText(/email/i), 'a@b.c');
  await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
});

test('successful login calls the login handler', async () => {
  const login = vi.fn().mockResolvedValue({ email: 'a@b.c' });
  renderLogin(login);

  await userEvent.type(screen.getByLabelText(/email/i), 'a@b.c');
  await userEvent.type(screen.getByLabelText(/password/i), 'Secret123!');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

  expect(login).toHaveBeenCalledWith('a@b.c', 'Secret123!');
});
