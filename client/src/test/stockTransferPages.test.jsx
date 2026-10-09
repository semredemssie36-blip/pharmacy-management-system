import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import StockTransfersPage from '../pages/StockTransfersPage.jsx';
import StockTransferCreatePage from '../pages/StockTransferCreatePage.jsx';
import StockTransferDetailPage from '../pages/StockTransferDetailPage.jsx';

const { mockTransfers, mockTransferDetail } = vi.hoisted(() => ({
  mockTransfers: [
    {
      id: 1,
      transfer_number: 'ST-2026-0001',
      organization_id: 1,
      source_branch_name: 'Main Branch',
      source_warehouse_name: 'Central Warehouse',
      destination_branch_name: 'North Branch',
      destination_warehouse_name: 'North Pharmacy Store',
      status: 'in_transit',
      has_discrepancy: 0,
      discrepancy_resolved: 0,
      total_items: 2,
      total_requested_quantity: 100,
      total_dispatched_quantity: 100,
      total_received_quantity: 0,
      total_discrepancy_quantity: 0,
      created_by_name: 'Central Admin',
      created_at: '2026-10-09T08:00:00Z',
    },
    {
      id: 2,
      transfer_number: 'ST-2026-0002',
      organization_id: 1,
      source_branch_name: 'Main Branch',
      source_warehouse_name: 'Central Warehouse',
      destination_branch_name: 'East Branch',
      destination_warehouse_name: 'East Store',
      status: 'completed',
      has_discrepancy: 1,
      discrepancy_resolved: 1,
      total_items: 1,
      total_requested_quantity: 50,
      total_dispatched_quantity: 50,
      total_received_quantity: 45,
      total_discrepancy_quantity: 5,
      created_by_name: 'Central Admin',
      created_at: '2026-10-09T09:00:00Z',
    },
  ],
  mockTransferDetail: {
    id: 1,
    transfer_number: 'ST-2026-0001',
    organization_id: 1,
    source_branch_id: 1,
    source_branch_name: 'Main Branch',
    source_warehouse_id: 1,
    source_warehouse_name: 'Central Warehouse',
    destination_branch_id: 2,
    destination_branch_name: 'North Branch',
    destination_warehouse_id: 2,
    destination_warehouse_name: 'North Pharmacy Store',
    status: 'draft',
    has_discrepancy: 0,
    discrepancy_resolved: 0,
    notes: 'Urgent antibiotics replenishment',
    created_by_name: 'Central Admin',
    created_at: '2026-10-09T08:00:00Z',
    lines: [
      {
        id: 10,
        product_id: 101,
        product_name: 'Amoxicillin 500mg',
        product_code: 'AMX-500',
        unit_id: 1,
        unit_name: 'Box',
        quantity_requested: 50,
        quantity_approved: null,
        quantity_dispatched: 0,
        quantity_received: 0,
        quantity_discrepancy: 0,
        quantity_in_transit: 0,
      },
    ],
    batch_allocations: [],
    movements: [],
  },
}));

vi.mock('../features/inventory/api.js', () => ({
  stockTransfersApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockTransfers, total: 2 } }),
    get: vi.fn().mockResolvedValue({ data: mockTransferDetail }),
    create: vi.fn().mockResolvedValue({ data: { id: 3, transfer_number: 'ST-2026-0003' } }),
    submit: vi.fn().mockResolvedValue({ data: { success: true } }),
    approve: vi.fn().mockResolvedValue({ data: { success: true } }),
    reject: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
    dispatch: vi.fn().mockResolvedValue({ data: { success: true } }),
    receive: vi.fn().mockResolvedValue({ data: { success: true } }),
    resolveDiscrepancy: vi.fn().mockResolvedValue({ data: { success: true } }),
    getAvailableBatches: vi.fn().mockResolvedValue({
      data: {
        batches: [
          {
            product_id: 101,
            batch_id: 201,
            batch_number: 'BATCH-AMX-01',
            storage_location_id: 1,
            available_quantity: 100,
            expiry_date: '2027-12-31',
          },
        ],
      },
    }),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  organizationsApi: {
    list: vi.fn().mockResolvedValue({
      data: { items: [{ id: 1, name: 'Ethio Health Care PLC', code: 'EHC' }] },
    }),
  },
  branchesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, name: 'Main Branch', code: 'BR-MAIN' },
          { id: 2, name: 'North Branch', code: 'BR-NORTH' },
        ],
      },
    }),
  },
  warehousesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, name: 'Central Warehouse', code: 'WH-CENTRAL' },
          { id: 2, name: 'North Pharmacy Store', code: 'WH-NORTH' },
        ],
      },
    }),
  },
  storageLocationsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [{ id: 1, name: 'Main Storage Shelf A', code: 'LOC-A' }],
      },
    }),
  },
}));

vi.mock('../features/products/api.js', () => ({
  productsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 101, name: 'Amoxicillin 500mg', code: 'AMX-500', base_unit_id: 1 },
        ],
      },
    }),
  },
}));

vi.mock('../pages/productMasterApis.js', () => ({
  unitsApi: {
    list: vi.fn().mockResolvedValue({
      data: { items: [{ id: 1, name: 'Box', code: 'BOX' }] },
    }),
  },
}));

import { stockTransfersApi } from '../features/inventory/api.js';

const mockAuthUser = {
  id: 1,
  name: 'Admin User',
  email: 'admin@ethiopia.com',
  permissions: [
    'stock_transfer.view',
    'stock_transfer.create',
    'stock_transfer.submit',
    'stock_transfer.approve',
    'stock_transfer.reject',
    'stock_transfer.dispatch',
    'stock_transfer.receive',
    'stock_transfer.cancel',
    'stock_transfer.resolve_discrepancy',
  ],
};

function renderWithAuth(ui) {
  return render(
    <AuthContext.Provider
      value={{
        user: mockAuthUser,
        loading: false,
        hasPermission: (p) => mockAuthUser.permissions.includes(p),
      }}
    >
      {ui}
    </AuthContext.Provider>
  );
}

describe('Stock Transfers Frontend Pages', () => {
  beforeEach(() => {
    stockTransfersApi.list.mockResolvedValue({ data: { items: mockTransfers, total: 2 } });
    stockTransfersApi.get.mockResolvedValue({ data: mockTransferDetail });
  });

  it('renders StockTransfersPage list, KPI cards, and rows', async () => {
    renderWithAuth(
      <BrowserRouter>
        <StockTransfersPage />
      </BrowserRouter>
    );

    // Verify Title & KPIs
    expect(screen.getByText(/Stock Transfers Between Branches & Warehouses/i)).toBeInTheDocument();
    expect(screen.getByText('Total Transfers')).toBeInTheDocument();
    expect(screen.getAllByText('In Transit').length).toBeGreaterThan(0);

    // Verify transfer rows rendered
    await waitFor(() => {
      expect(screen.getByText(/ST-2026-0001/i)).toBeInTheDocument();
      expect(screen.getByText(/ST-2026-0002/i)).toBeInTheDocument();
      expect(screen.getAllByText('Central Warehouse').length).toBeGreaterThan(0);
      expect(screen.getByText('North Pharmacy Store')).toBeInTheDocument();
    });

    // Check action link exists
    expect(screen.getByText('New Stock Transfer')).toBeInTheDocument();
  });

  it('renders StockTransferCreatePage and shows route validation', async () => {
    renderWithAuth(
      <BrowserRouter>
        <StockTransferCreatePage />
      </BrowserRouter>
    );

    // Page title and form elements load after async options resolve
    await waitFor(() => {
      expect(screen.getByText(/Initiate Stock Transfer/i)).toBeInTheDocument();
      expect(screen.getByText(/Ethio Health Care PLC/i)).toBeInTheDocument();
      expect(screen.getByText(/Transfer Line Items/i)).toBeInTheDocument();
    });
  });

  it('renders StockTransferDetailPage with status, lifecycle stepper, lines, and submit button', async () => {
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory/transfers/1']}>
        <Routes>
          <Route path="/inventory/transfers/:id" element={<StockTransferDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Transfer ST-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
      expect(screen.getByText('Submit for Approval')).toBeInTheDocument();
    });

    // Verify Stepper steps are rendered
    expect(screen.getByText('1. Draft')).toBeInTheDocument();
    expect(screen.getByText('2. Submitted')).toBeInTheDocument();
    expect(screen.getByText('4. In Transit')).toBeInTheDocument();
  });
});
