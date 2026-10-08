import { render, screen } from '@testing-library/react';

import { AuthContext } from '../features/auth/AuthContext.jsx';

vi.mock('../features/inventory/api.js', () => ({
  inventoryApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, organization_id: 1, branch_id: 1, warehouse_id: 1, storage_location_id: 1,
            product_id: 1, batch_id: 1, unit_id: 1, status: 'available', quantity: 100,
            product_name: 'Amoxicillin 500mg', product_code: 'AMOX500', batch_number: 'B001',
            expiry_date: '2028-12-31', branch_name: 'Piassa', warehouse_name: 'Main WH',
            storage_location_name: 'Shelf A', unit_name: 'BOX',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn(),
    createOpeningBalance: vi.fn(),
  },
  batchesApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }), get: vi.fn() },
  stockMovementsApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }), get: vi.fn() },
}));

import StockOverviewPage from '../pages/StockOverviewPage.jsx';

test('stock overview renders inventory rows from the API', async () => {
  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['inventory.view'] } }}>
      <StockOverviewPage />
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('Amoxicillin 500mg')).toBeInTheDocument();
  expect(screen.getByText('B001')).toBeInTheDocument();
  expect(screen.getByText('available')).toBeInTheDocument();
  expect(screen.getByText('Total: 1')).toBeInTheDocument();
});

test('stock overview empty state renders when no stock records', async () => {
  const { inventoryApi } = await import('../features/inventory/api.js');
  inventoryApi.list.mockResolvedValueOnce({ data: { items: [], total: 0 } });

  render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions: ['inventory.view'] } }}>
      <StockOverviewPage />
    </AuthContext.Provider>,
  );

  expect(await screen.findByText('No stock records found.')).toBeInTheDocument();
});
