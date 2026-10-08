import { render, screen } from '@testing-library/react';

import { AuthContext } from '../features/auth/AuthContext.jsx';

vi.mock('../features/procurement/api.js', () => ({
  purchaseOrdersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, organization_id: 1, branch_id: 1, supplier_id: 1, po_number: 'PO-1-20261008-1234', order_date: '2026-10-08T00:00:00Z', expected_delivery_date: null, status: 'draft', currency: 'ETB', total_amount: 100, supplier_name: 'MedSupply', branch_name: 'Piassa' },
        ],
        total: 1,
      },
    }),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../features/partners/api.js', () => ({
  suppliersApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
  customersApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
}));

vi.mock('../features/products/api.js', () => ({
  productsApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
}));

vi.mock('../features/organizations/api.js', () => ({
  organizationsApi: { list: vi.fn().mockResolvedValue({ data: { organizations: [], total: 0 } }) },
  branchesApi: { list: vi.fn().mockResolvedValue({ data: { branches: [], total: 0 } }) },
  warehousesApi: { list: vi.fn().mockResolvedValue({ data: { warehouses: [], total: 0 } }) },
}));

import { MemoryRouter } from 'react-router-dom';
import PurchaseOrdersPage from '../pages/PurchaseOrdersPage.jsx';

test('purchase orders page renders API rows and gates New button', async () => {
  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['purchase_order.view', 'purchase_order.create'] } }}>
      <MemoryRouter>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('PO-1-20261008-1234')).toBeInTheDocument();
  expect(screen.getByText('MedSupply')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /New Purchase Order/i })).toBeInTheDocument();
});

test('purchase orders page hides New button for view-only users', async () => {
  const { purchaseOrdersApi } = await import('../features/procurement/api.js');
  purchaseOrdersApi.list.mockResolvedValue({ data: { items: [], total: 0 } });

  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['purchase_order.view'] } }}>
      <MemoryRouter>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('No purchase orders found.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /New Purchase Order/i })).not.toBeInTheDocument();
});
