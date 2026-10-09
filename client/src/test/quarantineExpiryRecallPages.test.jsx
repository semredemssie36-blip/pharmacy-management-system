import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import ExpiryManagementPage from '../pages/ExpiryManagementPage.jsx';
import QuarantinePage from '../pages/QuarantinePage.jsx';
import QuarantineCreatePage from '../pages/QuarantineCreatePage.jsx';
import QuarantineDetailPage from '../pages/QuarantineDetailPage.jsx';
import RecallsPage from '../pages/RecallsPage.jsx';
import RecallCreatePage from '../pages/RecallCreatePage.jsx';
import RecallDetailPage from '../pages/RecallDetailPage.jsx';

const {
  mockExpirySummary,
  mockExpiryBatches,
  mockQuarantines,
  mockQuarantineDetail,
  mockRecalls,
  mockRecallDetail,
} = vi.hoisted(() => ({
  mockExpirySummary: {
    expired_batches_count: 2,
    expiring_30_days_count: 5,
    expiring_60_days_count: 8,
    expiring_90_days_count: 12,
  },
  mockExpiryBatches: [
    {
      batch_id: 1,
      batch_number: 'EXP-B1',
      product_name: 'Amoxicillin 500mg',
      product_code: 'AMX-500',
      branch_id: 1,
      branch_name: 'Piassa Main Branch',
      warehouse_id: 1,
      warehouse_name: 'Main Store',
      expiry_date: '2026-09-01',
      days_to_expiry: -38,
      available_stock: 40,
      total_stock: 40,
      status: 'expired',
    },
    {
      batch_id: 2,
      batch_number: 'NEAR-B2',
      product_name: 'Paracetamol 500mg',
      product_code: 'PARA-500',
      branch_id: 1,
      branch_name: 'Piassa Main Branch',
      warehouse_id: 1,
      warehouse_name: 'Main Store',
      expiry_date: '2026-10-25',
      days_to_expiry: 16,
      available_stock: 100,
      total_stock: 100,
      status: 'near_expiry',
    },
  ],
  mockQuarantines: [
    {
      id: 1,
      case_number: 'QRN-2026-0001',
      branch_name: 'Piassa Main Branch',
      warehouse_name: 'Main Store',
      storage_location_name: 'Shelf A',
      product_name: 'Amoxicillin 500mg',
      product_code: 'AMX-500',
      batch_number: 'EXP-B1',
      quantity: 25,
      reason: 'suspected_quality_defect',
      status: 'quarantined',
      created_by_name: 'Lead Pharmacist',
      created_at: '2026-10-09T10:00:00Z',
    },
  ],
  mockQuarantineDetail: {
    id: 1,
    case_number: 'QRN-2026-0001',
    branch_id: 1,
    branch_name: 'Piassa Main Branch',
    warehouse_id: 1,
    warehouse_name: 'Main Store',
    storage_location_id: 1,
    storage_location_name: 'Shelf A',
    product_name: 'Amoxicillin 500mg',
    product_code: 'AMX-500',
    batch_id: 1,
    batch_number: 'EXP-B1',
    expiry_date: '2026-09-01',
    quantity: 25,
    reason: 'suspected_quality_defect',
    notes: 'Discolored packaging observed during intake',
    status: 'quarantined',
    created_by_name: 'Lead Pharmacist',
    created_at: '2026-10-09T10:00:00Z',
    reviewed_by: null,
    released_by: null,
    disposed_by: null,
  },
  mockRecalls: [
    {
      id: 1,
      recall_number: 'RCL-2026-0001',
      title: 'EFDA Solvents Containment',
      reason: 'quality_defect',
      severity: 'critical',
      status: 'active',
      batches_count: 2,
      initiating_party: 'EFDA Alert #44',
      created_by_name: 'Safety Officer',
      created_at: '2026-10-09T08:00:00Z',
    },
  ],
  mockRecallDetail: {
    id: 1,
    recall_number: 'RCL-2026-0001',
    title: 'EFDA Solvents Containment',
    reason: 'quality_defect',
    severity: 'critical',
    status: 'active',
    scope: 'batch_specific',
    initiating_party: 'EFDA Alert #44',
    description: 'Immediate quarantine required for all solvent lots',
    created_by_name: 'Safety Officer',
    created_at: '2026-10-09T08:00:00Z',
    affected_stock_summary: {
      total_on_hand_stock: 120,
      total_quarantined_or_recalled: 100,
      total_dispensed_or_sold: 20,
      total_disposed: 0,
    },
    affected_batches: [
      {
        batch_id: 1,
        batch_number: 'EXP-B1',
        product_name: 'Amoxicillin 500mg',
        product_code: 'AMX-500',
        expiry_date: '2026-09-01',
        is_active: 0,
        physical_on_hand: 50,
        quarantined_or_recalled: 50,
      },
    ],
    actions: [
      {
        id: 1,
        action_type: 'quarantined_on_hand',
        batch_number: 'EXP-B1',
        branch_name: 'Piassa Main Branch',
        quantity: 50,
        destination_or_party: 'Branch Hold Room',
        performed_by_name: 'Safety Officer',
        created_at: '2026-10-09T08:30:00Z',
        notes: 'Locked in hazardous quarantine cabinet',
      },
    ],
  },
}));

vi.mock('../features/inventory/api.js', () => ({
  expiryApi: {
    getSummary: vi.fn().mockResolvedValue({ data: mockExpirySummary }),
    listBatches: vi.fn().mockResolvedValue({ data: { items: mockExpiryBatches, total: 2 } }),
    segregateExpired: vi.fn().mockResolvedValue({ success: true, message: 'Stock segregated' }),
  },
  quarantineApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockQuarantines, total: 1 } }),
    get: vi.fn().mockResolvedValue({ data: mockQuarantineDetail }),
    create: vi.fn().mockResolvedValue({ data: { id: 2, case_number: 'QRN-2026-0002' } }),
    review: vi.fn().mockResolvedValue({ data: { success: true } }),
    release: vi.fn().mockResolvedValue({ data: { success: true } }),
    dispose: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  recallsApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockRecalls, total: 1 } }),
    get: vi.fn().mockResolvedValue({ data: mockRecallDetail }),
    create: vi.fn().mockResolvedValue({ data: { id: 2, recall_number: 'RCL-2026-0002' } }),
    approve: vi.fn().mockResolvedValue({ data: { success: true } }),
    activate: vi.fn().mockResolvedValue({ data: { success: true } }),
    recordAction: vi.fn().mockResolvedValue({ data: { success: true } }),
    close: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  batchesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, batch_number: 'EXP-B1', product_name: 'Amoxicillin 500mg', expiry_date: '2026-09-01' },
          { id: 2, batch_number: 'NEAR-B2', product_name: 'Paracetamol 500mg', expiry_date: '2026-10-25' },
        ],
      },
    }),
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
      data: [{ id: 1, name: 'Main Store', code: 'WH-MAIN', branch_id: 1 }],
    }),
  },
}));

const mockAuthAdmin = {
  user: {
    id: 1,
    name: 'Admin Pharmacist',
    role_name: 'Administrator',
    permissions: [
      'expiry.view',
      'quarantine.view',
      'quarantine.create',
      'quarantine.review',
      'quarantine.release',
      'quarantine.dispose',
      'recall.view',
      'recall.create',
      'recall.approve',
      'recall.activate',
      'recall.action',
      'recall.close',
    ],
  },
  permissions: [
    'expiry.view',
    'quarantine.view',
    'quarantine.create',
    'quarantine.review',
    'quarantine.release',
    'quarantine.dispose',
    'recall.view',
    'recall.create',
    'recall.approve',
    'recall.activate',
    'recall.action',
    'recall.close',
  ],
  hasPermission: () => true,
};

describe('Task 17: Expiry, Quarantine, and Product Recall Frontend Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ExpiryManagementPage with metrics, batch table, and segregation action', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <ExpiryManagementPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Expiry Management & Monitoring/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
      expect(screen.getByText('EXP-B1')).toBeInTheDocument();
      expect(screen.getByText('NEAR-B2')).toBeInTheDocument();
    });

    const segregateBtn = screen.getByRole('button', { name: /Segregate/i });
    expect(segregateBtn).toBeInTheDocument();
  });

  it('renders QuarantinePage with directory list and Place Stock On Hold button', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <QuarantinePage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Quarantine Holds/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Place Stock On Hold/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('QRN-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
    });
  });

  it('renders QuarantineCreatePage with custody fields and inputs', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <QuarantineCreatePage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Place Stock on Quarantine Hold/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm Quarantine Hold/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Select Batch.../i)).toBeInTheDocument();
    });
  });

  it('renders QuarantineDetailPage with case data, custody details, and workflow actions', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <MemoryRouter initialEntries={['/inventory/quarantines/1']}>
          <Routes>
            <Route path="/inventory/quarantines/:id" element={<QuarantineDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('QRN-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Release to Stock')).toBeInTheDocument();
      expect(screen.getByText('Authorize Disposal')).toBeInTheDocument();
      expect(screen.getByText('Mark Under Review')).toBeInTheDocument();
    });
  });

  it('renders RecallsPage with case list and Initiate Product Recall button', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <RecallsPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Product Recalls/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Initiate Product Recall/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('RCL-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('EFDA Solvents Containment')).toBeInTheDocument();
    });
  });

  it('renders RecallCreatePage with multi-batch selector and severity options', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <BrowserRouter>
          <RecallCreatePage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Initiate Product Recall/i)).toBeInTheDocument();
    expect(screen.getByText(/Create Recall Case/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('EXP-B1')).toBeInTheDocument();
      expect(screen.getByText('NEAR-B2')).toBeInTheDocument();
    });
  });

  it('renders RecallDetailPage with traceability dashboard and action logging', async () => {
    render(
      <AuthContext.Provider value={mockAuthAdmin}>
        <MemoryRouter initialEntries={['/inventory/recalls/1']}>
          <Routes>
            <Route path="/inventory/recalls/:id" element={<RecallDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('RCL-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('EFDA Solvents Containment')).toBeInTheDocument();
      expect(screen.getByText(/Record Containment Action/i)).toBeInTheDocument();
      expect(screen.getByText(/Close Recall Case/i)).toBeInTheDocument();
      expect(screen.getByText(/On-Hand Physical Stock/i)).toBeInTheDocument();
    });
  });
});
