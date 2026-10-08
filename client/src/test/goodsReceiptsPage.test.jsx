import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import GoodsReceiptsPage from '../pages/GoodsReceiptsPage.jsx';
import GoodsReceiptCreatePage from '../pages/GoodsReceiptCreatePage.jsx';
import GoodsReceiptDetailPage from '../pages/GoodsReceiptDetailPage.jsx';

vi.mock('../features/procurement/api.js', () => ({
  purchaseOrdersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 10,
            po_number: 'PO-2026-001',
            status: 'approved',
            supplier_name: 'PharmaCorp',
            branch_id: 1,
            branch_name: 'Piassa Branch',
            total_amount: 5000,
            currency: 'ETB',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn().mockResolvedValue({
      data: {
        purchaseOrder: {
          id: 10,
          po_number: 'PO-2026-001',
          status: 'approved',
          organization_id: 1,
          branch_id: 1,
          branch_name: 'Piassa Branch',
          supplier_name: 'PharmaCorp',
          total_amount: 5000,
          currency: 'ETB',
          lines: [
            {
              id: 101,
              product_id: 1,
              product_name: 'Amoxicillin 500mg',
              product_code: 'AMX-500',
              unit_id: 1,
              unit_name: 'Box',
              ordered_quantity: 100,
              received_quantity: 20,
              remaining_quantity: 80,
            },
          ],
        },
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
  goodsReceiptsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            receipt_number: 'GR-1-20261008-5555',
            purchase_order_id: 10,
            po_number: 'PO-2026-001',
            supplier_name: 'PharmaCorp',
            branch_name: 'Piassa',
            warehouse_name: 'Main Warehouse',
            receipt_date: '2026-10-08T00:00:00Z',
            status: 'draft',
            received_by: 1,
            received_by_name: 'Admin User',
            created_at: '2026-10-08T10:00:00Z',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn().mockResolvedValue({
      data: {
        goodsReceipt: {
          id: 1,
          receipt_number: 'GR-1-20261008-5555',
          purchase_order_id: 10,
          po_number: 'PO-2026-001',
          supplier_name: 'PharmaCorp',
          branch_name: 'Piassa',
          warehouse_name: 'Main Warehouse',
          receipt_date: '2026-10-08T00:00:00Z',
          status: 'receiving',
          received_by: 1,
          received_by_name: 'Admin User',
          notes: 'Test shipment notes',
          lines: [
            {
              id: 501,
              purchase_order_line_id: 101,
              product_id: 1,
              product_name: 'Amoxicillin 500mg',
              product_code: 'AMX-500',
              unit_name: 'Box',
              ordered_quantity: 100,
              received_quantity: 80,
              batch_number: 'BATCH-AMX-99',
              expiry_date: '2028-06-30',
              storage_location_name: 'Shelf A1',
              notes: 'Inspected ok',
            },
          ],
        },
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    discrepancy: vi.fn(),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  branchesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        branches: [{ id: 1, name: 'Piassa Branch', code: 'PB', status: 'active' }],
      },
    }),
  },
  warehousesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        warehouses: [{ id: 1, branch_id: 1, name: 'Main Warehouse', code: 'MWH', status: 'active' }],
      },
    }),
  },
  storageLocationsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        storage_locations: [{ id: 1, warehouse_id: 1, name: 'Shelf A1', code: 'SA1', status: 'active' }],
      },
    }),
  },
}));

describe('Goods Receiving Pages', () => {
  test('Goods Receipts list page renders receipts from API and shows New button for authorized user', async () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { permissions: ['goods_receipt.view', 'goods_receipt.create'] },
        }}
      >
        <MemoryRouter>
          <GoodsReceiptsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(await screen.findByText('GR-1-20261008-5555')).toBeInTheDocument();
    expect(screen.getByText('PharmaCorp')).toBeInTheDocument();
    expect(screen.getByTestId('new-goods-receipt-button')).toBeInTheDocument();
  });

  test('Goods Receipts list page hides New button for view-only user', async () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { permissions: ['goods_receipt.view'] },
        }}
      >
        <MemoryRouter>
          <GoodsReceiptsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(await screen.findByText('GR-1-20261008-5555')).toBeInTheDocument();
    expect(screen.queryByTestId('new-goods-receipt-button')).not.toBeInTheDocument();
  });

  test('Goods Receipt Create page renders PO lines with ordered, received, and remaining quantities', async () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { permissions: ['goods_receipt.view', 'goods_receipt.create'] },
        }}
      >
        <MemoryRouter initialEntries={['/procurement/goods-receipts/new?purchaseOrderId=10']}>
          <Routes>
            <Route path="/procurement/goods-receipts/new" element={<GoodsReceiptCreatePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(await screen.findByText('Amoxicillin 500mg')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // ordered
    expect(screen.getByText('20')).toBeInTheDocument();  // previously received
    expect(screen.getByText('80')).toBeInTheDocument();  // remaining
    expect(screen.getByTestId('save-draft-button')).toBeInTheDocument();
    expect(screen.getByTestId('complete-directly-button')).toBeInTheDocument();
  });

  test('Goods Receipt Detail page renders line details and lifecycle actions', async () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: {
            permissions: [
              'goods_receipt.view',
              'goods_receipt.update',
              'goods_receipt.complete',
              'goods_receipt.cancel',
            ],
          },
        }}
      >
        <MemoryRouter initialEntries={['/procurement/goods-receipts/1']}>
          <Routes>
            <Route path="/procurement/goods-receipts/:id" element={<GoodsReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(await screen.findByText('GR-1-20261008-5555')).toBeInTheDocument();
    expect(screen.getByText('BATCH-AMX-99')).toBeInTheDocument();
    expect(screen.getByText('Shelf A1')).toBeInTheDocument();
    expect(screen.getByTestId('complete-receipt-button')).toBeInTheDocument();
    expect(screen.getByTestId('record-discrepancy-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-receipt-button')).toBeInTheDocument();
  });
});
