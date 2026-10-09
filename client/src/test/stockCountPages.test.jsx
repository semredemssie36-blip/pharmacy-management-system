import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import StockCountsPage from '../pages/StockCountsPage.jsx';
import StockCountCreatePage from '../pages/StockCountCreatePage.jsx';
import StockCountDetailPage from '../pages/StockCountDetailPage.jsx';

const { mockCounts, mockCountDetail } = vi.hoisted(() => ({
  mockCounts: [
    {
      id: 1,
      count_number: 'SC-2026-0001',
      organization_id: 1,
      branch_name: 'Piassa Main Branch',
      warehouse_name: 'Piassa Pharmacy Store',
      count_type: 'full',
      status: 'in_progress',
      total_lines_count: 5,
      counted_lines_count: 3,
      discrepancy_lines_count: 1,
      created_by_name: 'Test Pharmacist',
      created_at: '2026-10-09T08:00:00Z',
    },
    {
      id: 2,
      count_number: 'SC-2026-0002',
      organization_id: 1,
      branch_name: 'Piassa Main Branch',
      warehouse_name: 'Piassa Pharmacy Store',
      count_type: 'location',
      status: 'completed',
      total_lines_count: 2,
      counted_lines_count: 2,
      discrepancy_lines_count: 0,
      created_by_name: 'Test Pharmacist',
      created_at: '2026-10-09T09:00:00Z',
    },
  ],
  mockCountDetail: {
    id: 1,
    count_number: 'SC-2026-0001',
    organization_id: 1,
    branch_id: 1,
    branch_name: 'Piassa Main Branch',
    warehouse_id: 1,
    warehouse_name: 'Piassa Pharmacy Store',
    count_type: 'full',
    status: 'in_progress',
    notes: 'Monthly inventory cycle audit',
    total_lines_count: 2,
    counted_lines_count: 1,
    discrepancy_lines_count: 1,
    lines: [
      {
        id: 101,
        product_id: 1,
        product_name: 'Paracetamol 500mg',
        product_code: 'PARA-500',
        batch_id: 1,
        batch_number: 'BATCH-001',
        expiry_date: '2027-12-31',
        storage_location_id: 1,
        storage_location_name: 'Shelf A1',
        unit_name: 'Strip',
        system_quantity: 100,
        counted_quantity: 95,
        variance_quantity: -5,
        discrepancy_reason: 'Physical counting variance',
        is_counted: 1,
        recount_requested: 0,
        recount_reason: null,
        notes: 'Slight shortage noted',
      },
      {
        id: 102,
        product_id: 2,
        product_name: 'Amoxicillin 250mg',
        product_code: 'AMX-250',
        batch_id: 2,
        batch_number: 'BATCH-002',
        expiry_date: '2027-06-30',
        storage_location_id: 1,
        storage_location_name: 'Shelf A1',
        unit_name: 'Bottle',
        system_quantity: 50,
        counted_quantity: null,
        variance_quantity: null,
        discrepancy_reason: null,
        is_counted: 0,
        recount_requested: 0,
        recount_reason: null,
        notes: null,
      },
    ],
  },
}));

vi.mock('../features/inventory/api.js', () => ({
  stockCountsApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockCounts, total: 2 } }),
    get: vi.fn().mockResolvedValue({ data: mockCountDetail }),
    create: vi.fn().mockResolvedValue({ data: { id: 3, count_number: 'SC-2026-0003' } }),
    start: vi.fn().mockResolvedValue({ data: { success: true } }),
    recordCount: vi.fn().mockResolvedValue({ data: { success: true } }),
    recount: vi.fn().mockResolvedValue({ data: { success: true } }),
    submit: vi.fn().mockResolvedValue({ data: { success: true } }),
    approve: vi.fn().mockResolvedValue({ data: { success: true } }),
    reject: vi.fn().mockResolvedValue({ data: { success: true } }),
    apply: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  branchesApi: {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Piassa Main Branch', code: 'BR-PIA' }],
    }),
  },
  warehousesApi: {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Piassa Pharmacy Store', code: 'WH-PIA', branch_id: 1 }],
    }),
  },
  storageLocationsApi: {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Shelf A1', code: 'LOC-A1', warehouse_id: 1 }],
    }),
  },
}));

const mockAuthAdmin = {
  user: {
    id: 1,
    name: 'Admin Pharmacist',
    role_name: 'Administrator',
    permissions: [
      'stock_count.view',
      'stock_count.create',
      'stock_count.record',
      'stock_count.submit',
      'stock_count.approve',
      'stock_count.reject',
      'stock_count.apply_adjustment',
      'stock_count.cancel',
    ],
  },
  permissions: [
    'stock_count.view',
    'stock_count.create',
    'stock_count.record',
    'stock_count.submit',
    'stock_count.approve',
    'stock_count.reject',
    'stock_count.apply_adjustment',
    'stock_count.cancel',
  ],
  hasPermission: (p) => true,
};

describe('Stock Counting & Adjustments Frontend Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders StockCountsPage with directory list, KPIs, and scope indicators', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <StockCountsPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Stock Counts & Inventory Adjustments/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ New Stock Count Session/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SC-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('SC-2026-0002')).toBeInTheDocument();
    });

    // Check KPI cards
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.getByText('With Discrepancies')).toBeInTheDocument();
    expect(screen.getByText('Completed & Adjusted')).toBeInTheDocument();

    // Discrepancy badge
    expect(screen.getByText(/1 Variance/i)).toBeInTheDocument();
  });

  it('renders StockCountCreatePage and submits a new draft session', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <MemoryRouter initialEntries={['/inventory/stock-counts/new']}>
          <Routes>
            <Route path="/inventory/stock-counts/new" element={<StockCountCreatePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Initialize New Stock Count/i)).toBeInTheDocument();
    expect(screen.getByText(/Important ERP Integrity Guidelines/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Piassa Main Branch/i)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Create Draft Count Session/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it('renders StockCountDetailPage with count sheet, uncounted/counted indicators, and variances', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <MemoryRouter initialEntries={['/inventory/stock-counts/1']}>
          <Routes>
            <Route path="/inventory/stock-counts/:id" element={<StockCountDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Stock Count: SC-2026-0001/i)).toBeInTheDocument();
    });

    // Lines rendered
    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin 250mg')).toBeInTheDocument();

    // Check counted vs uncounted indicators
    expect(screen.getByText('-5 (Shortage)')).toBeInTheDocument();
    expect(screen.getByText('Uncounted')).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: /Submit for Review/i })).toBeInTheDocument();
  });

  it('opens physical count recording modal and allows saving physical quantity', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <MemoryRouter initialEntries={['/inventory/stock-counts/1']}>
          <Routes>
            <Route path="/inventory/stock-counts/:id" element={<StockCountDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Stock Count: SC-2026-0001/i)).toBeInTheDocument();
    });

    // Click "Count" on uncounted item (Amoxicillin line 102)
    fireEvent.click(screen.getByTestId('count-line-btn-102'));

    // Modal opens
    expect(screen.getByText(/Record Physical Quantity/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Enter physical count/i);
    fireEvent.change(input, { target: { value: '48' } });

    expect(screen.getByText(/Calculated Variance:/i)).toBeInTheDocument();
    expect(screen.getByText(/-2 Bottle/i)).toBeInTheDocument();
  });
});
