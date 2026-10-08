import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';

function renderCan(permission, userPermissions) {
  return render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: userPermissions } }}>
      <Can permission={permission}>
        <span>secret action</span>
      </Can>
    </AuthContext.Provider>,
  );
}

test('Can renders children when the user holds the permission', () => {
  renderCan('organization.create', ['organization.create']);
  expect(screen.getByText('secret action')).toBeInTheDocument();
});

test('Can hides children when the user lacks the permission', () => {
  renderCan('organization.create', ['organization.view']);
  expect(screen.queryByText('secret action')).not.toBeInTheDocument();
});

test('main layout shows permission-appropriate nav links', async () => {
  const { default: MainLayout } = await import('../layouts/MainLayout.jsx');

  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { name: 'T', permissions: ['branch.view', 'user.view'] } }}>
      <MemoryRouter>
        <MainLayout />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  expect(screen.getByText('Branches')).toBeInTheDocument();
  expect(screen.getByText('Users')).toBeInTheDocument();
  expect(screen.queryByText('Warehouses')).not.toBeInTheDocument();
  expect(screen.queryByText('Roles')).not.toBeInTheDocument();
});
