import { render, screen } from '@testing-library/react';

import { AuthContext } from '../features/auth/AuthContext.jsx';

vi.mock('../features/partners/api.js', () => ({
  suppliersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, organization_id: 1, name: 'MedSupply Ethiopia', code: 'MED1', status: 'active', contact_person: 'Liya', telephone: '0911-111111' },
        ],
        total: 1,
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
  customersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, organization_id: 1, name: 'Kebede Retail Pharmacy', code: 'KRP', status: 'active', customer_type: 'business', telephone: '0922-222222', credit_limit: 2500 },
        ],
        total: 1,
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
  partnerResourceApi: vi.fn(),
}));

vi.mock('../features/organizations/api.js', () => ({
  organizationsApi: { list: vi.fn().mockResolvedValue({ data: { organizations: [], total: 0 } }) },
}));

import SuppliersPage from '../pages/SuppliersPage.jsx';
import CustomersPage from '../pages/CustomersPage.jsx';

test('suppliers page renders API rows and shows New button with permission', async () => {
  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['supplier.view', 'supplier.create', 'supplier.update', 'supplier.deactivate'] } }}>
      <SuppliersPage />
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('MedSupply Ethiopia')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /\+ New/i })).toBeInTheDocument();
});

test('suppliers page hides New button without permission', async () => {
  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['supplier.view'] } }}>
      <SuppliersPage />
    </AuthContext.Provider>,
  );

  await screen.findByText('MedSupply Ethiopia');
  expect(screen.queryByRole('button', { name: /\+ New/i })).not.toBeInTheDocument();
});

test('customers page renders API rows', async () => {
  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['customer.view', 'customer.create', 'customer.update', 'customer.deactivate'] } }}>
      <CustomersPage />
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('Kebede Retail Pharmacy')).toBeInTheDocument();
  expect(screen.getByText('business')).toBeInTheDocument();
});
