import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import AuditLogsPage from '../pages/AuditLogsPage.jsx';

const { mockLogs, mockStats, mockLogDetail } = vi.hoisted(() => ({
  mockLogs: [
    {
      id: 101,
      action: 'sale.completed',
      outcome: 'success',
      resource_type: 'sale',
      resource_id: 55,
      resource_reference: 'SALE-2026-0089',
      actor_name: 'Abebe Cashier',
      actor_email: 'abebe@pharmacy.et',
      branch_name: 'Piassa Main Branch',
      warehouse_name: 'Front Store',
      created_at: '2026-10-09T10:00:00Z',
    },
    {
      id: 102,
      action: 'auth.failed_login',
      outcome: 'failure',
      resource_type: 'auth',
      resource_id: null,
      resource_reference: null,
      actor_name: 'Unknown User',
      actor_email: 'hacker@suspicious.org',
      branch_name: null,
      warehouse_name: null,
      created_at: '2026-10-09T11:00:00Z',
    },
  ],
  mockStats: {
    totalEvents: 42,
    failedEvents: 3,
    securityEvents: 12,
    inventoryEvents: 15,
    financialEvents: 12,
  },
  mockLogDetail: {
    id: 101,
    action: 'sale.completed',
    outcome: 'success',
    resource_type: 'sale',
    resource_id: 55,
    resource_reference: 'SALE-2026-0089',
    actor_name: 'Abebe Cashier',
    actor_email: 'abebe@pharmacy.et',
    ip_address: '192.168.1.50',
    organization_id: 1,
    organization_name: 'EthioCodes Central Pharmacy',
    branch_name: 'Piassa Main Branch',
    warehouse_name: 'Front Store',
    reason: 'Standard customer OTC prescription checkout',
    created_at: '2026-10-09T10:00:00Z',
    before_values: { status: 'draft', total_amount: 150 },
    after_values: { status: 'completed', total_amount: 150 },
    details: { paymentMethod: 'cash', itemsCount: 2 },
  },
}));

vi.mock('../features/audit/api.js', () => ({
  auditApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: mockLogs,
        pagination: {
          total: 2,
          page: 1,
          limit: 25,
          totalPages: 1,
        },
      },
    }),
    getStats: vi.fn().mockResolvedValue({
      data: mockStats,
    }),
    get: vi.fn().mockResolvedValue({
      data: mockLogDetail,
    }),
    exportCsv: vi.fn().mockResolvedValue(),
  },
}));

function renderWithAuth(ui, { user = { id: 1, name: 'System Auditor', permissions: ['audit.view', 'audit.export'] } } = {}) {
  return render(
    <AuthContext.Provider value={{ user, status: 'authenticated' }}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>,
  );
}

describe('AuditLogsPage Frontend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders directory with KPI cards and table data', async () => {
    renderWithAuth(<AuditLogsPage />);

    // Check Header
    expect(screen.getByText('Audit Trail & Activity History')).toBeInTheDocument();

    // Check KPI summary values
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument(); // Total events
      expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1); // Security & Financial
      expect(screen.getByText('15')).toBeInTheDocument(); // Inventory
    });

    // Check Table rows
    expect(screen.getByText('sale.completed')).toBeInTheDocument();
    expect(screen.getByText('auth.failed_login')).toBeInTheDocument();
    expect(screen.getByText('SALE-2026-0089')).toBeInTheDocument();
    expect(screen.getByText('Abebe Cashier')).toBeInTheDocument();
  });

  it('filters trigger API query updates', async () => {
    const { auditApi } = await import('../features/audit/api.js');
    renderWithAuth(<AuditLogsPage />);

    await waitFor(() => expect(auditApi.list).toHaveBeenCalled());

    // Search input
    const searchInput = screen.getByPlaceholderText(/Search by reference/i);
    fireEvent.change(searchInput, { target: { value: 'SALE-2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Filter/i }));

    await waitFor(() => {
      expect(auditApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'SALE-2026' }),
      );
    });
  });

  it('opens event detail inspection modal with before/after diffs', async () => {
    const { auditApi } = await import('../features/audit/api.js');
    renderWithAuth(<AuditLogsPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /Inspect/i })[0]).toBeInTheDocument());

    const inspectButtons = screen.getAllByRole('button', { name: /Inspect/i });
    fireEvent.click(inspectButtons[0]);

    await waitFor(() => {
      expect(auditApi.get).toHaveBeenCalledWith(101);
      expect(screen.getByText('Audit Event #101')).toBeInTheDocument();
      expect(screen.getByText('Previous State (Before)')).toBeInTheDocument();
      expect(screen.getByText('New State (After)')).toBeInTheDocument();
      expect(screen.getByText(/Standard customer OTC prescription checkout/i)).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    await waitFor(() => {
      expect(screen.queryByText('Audit Event #101')).not.toBeInTheDocument();
    });
  });

  it('renders Export CSV button only for users with audit.export permission', async () => {
    const { auditApi } = await import('../features/audit/api.js');

    // 1. With audit.export
    const { unmount } = renderWithAuth(<AuditLogsPage />, {
      user: { id: 1, permissions: ['audit.view', 'audit.export'] },
    });

    // Wait until loading finishes so button is not disabled
    await waitFor(() => expect(screen.getByText('sale.completed')).toBeInTheDocument());

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);
    await waitFor(() => {
      expect(auditApi.exportCsv).toHaveBeenCalled();
    });

    unmount();

    // 2. Without audit.export
    renderWithAuth(<AuditLogsPage />, {
      user: { id: 2, permissions: ['audit.view'] },
    });
    expect(screen.queryByRole('button', { name: /Export CSV/i })).not.toBeInTheDocument();
  });

  it('enforces append-only nature: no edit or delete controls exist', async () => {
    renderWithAuth(<AuditLogsPage />);

    await waitFor(() => expect(screen.getByText('sale.completed')).toBeInTheDocument());

    // Ensure no edit or delete buttons exist on page
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('displays empty state when no records match filter', async () => {
    const { auditApi } = await import('../features/audit/api.js');
    auditApi.list.mockResolvedValueOnce({
      data: {
        items: [],
        pagination: { total: 0, page: 1, limit: 25, totalPages: 1 },
      },
    });

    renderWithAuth(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('No audit records found')).toBeInTheDocument();
    });
  });
});
