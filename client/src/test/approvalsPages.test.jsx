import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import ApprovalsPage from '../pages/ApprovalsPage.jsx';
import ApprovalDetailPage from '../pages/ApprovalDetailPage.jsx';

const { mockRequests, mockDetail } = vi.hoisted(() => ({
  mockRequests: [
    {
      id: 1,
      request_number: 'APR-2026-0001',
      organization_id: 1,
      branch_id: 1,
      branch_name: 'Piassa Main Branch',
      category: 'sale_discount',
      target_entity_type: 'sale',
      target_entity_id: 501,
      target_reference: 'SALE-2026-0045',
      requested_value: 25.00,
      original_value: 15.00,
      reason: '25% staff family emergency discount',
      requester_id: 10,
      requester_name: 'Abebe Cashier',
      status: 'pending',
      created_at: '2026-10-09T08:00:00Z',
    },
    {
      id: 2,
      request_number: 'APR-2026-0002',
      organization_id: 1,
      branch_id: 1,
      branch_name: 'Piassa Main Branch',
      category: 'credit_limit_override',
      target_entity_type: 'customer',
      target_entity_id: 12,
      target_reference: 'CUST-012',
      requested_value: 700.00,
      original_value: 500.00,
      reason: 'Urgent hospital admission credit',
      requester_id: 10,
      requester_name: 'Abebe Cashier',
      status: 'approved',
      approver_name: 'Taye Manager',
      created_at: '2026-10-09T09:00:00Z',
    },
  ],
  mockDetail: {
    id: 1,
    request_number: 'APR-2026-0001',
    organization_id: 1,
    branch_id: 1,
    branch_name: 'Piassa Main Branch',
    category: 'sale_discount',
    target_entity_type: 'sale',
    target_entity_id: 501,
    target_reference: 'SALE-2026-0045',
    requested_value: 25.00,
    original_value: 15.00,
    reason: '25% staff family emergency discount',
    notes: 'Approved verbally by Dr. Haile',
    requester_id: 10,
    requester_name: 'Abebe Cashier',
    requester_email: 'abebe@pharmacy.et',
    status: 'pending',
    stale_fingerprint: 'a1b2c3d4e5f6789012345678abcdef12',
    created_at: '2026-10-09T08:00:00Z',
    history: [
      {
        id: 101,
        approval_request_id: 1,
        action: 'created',
        actor_id: 10,
        actor_name: 'Abebe Cashier',
        notes: 'Approval request created: 25% staff family emergency discount',
        created_at: '2026-10-09T08:00:00Z',
      },
    ],
  },
}));

vi.mock('../features/approvals/api.js', () => ({
  approvalsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: mockRequests,
        total: 2,
      },
    }),
    get: vi.fn().mockImplementation((id) =>
      Promise.resolve({
        data: {
          ...mockDetail,
          id: Number(id),
        },
      }),
    ),
    create: vi.fn().mockResolvedValue({ data: { id: 3, request_number: 'APR-2026-0003' } }),
    approve: vi.fn().mockResolvedValue({ data: { id: 1, status: 'approved' } }),
    reject: vi.fn().mockResolvedValue({ data: { id: 1, status: 'rejected' } }),
    cancel: vi.fn().mockResolvedValue({ data: { id: 1, status: 'cancelled' } }),
    listPolicies: vi.fn().mockResolvedValue({ data: [] }),
    upsertPolicy: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function renderWithAuth(ui, { user = { id: 99, name: 'Supervisor User', permissions: ['approval.view', 'approval.discount', 'approval.credit'] } } = {}) {
  return render(
    <AuthContext.Provider value={{ user, status: 'authenticated' }}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>,
  );
}

describe('ApprovalsPage & ApprovalDetailPage Frontend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ApprovalsPage inbox, KPI cards, and request table', async () => {
    renderWithAuth(<ApprovalsPage />);

    expect(screen.getByText(/Approvals & Authorized Overrides/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('APR-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('APR-2026-0002')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('700 ETB')).toBeInTheDocument();
    });

    // Check KPIs
    expect(screen.getByText('Pending Requests')).toBeInTheDocument();
    expect(screen.getByText('Approved / Executed')).toBeInTheDocument();
  });

  it('displays quick Approve & Reject buttons for eligible supervisors (non-requesters)', async () => {
    renderWithAuth(<ApprovalsPage />, {
      user: { id: 99, name: 'Supervisor User', permissions: ['approval.view', 'approval.discount'] },
    });

    await waitFor(() => {
      expect(screen.getByText('APR-2026-0001')).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByRole('button', { name: /^approve$/i });
    expect(approveButtons.length).toBeGreaterThan(0);

    // Click Approve button to open confirmation dialog
    fireEvent.click(approveButtons[0]);
    expect(screen.getByText(/Approve Override Request/i)).toBeInTheDocument();
  });

  it('enforces mandatory rejection reason in decision dialog', async () => {
    renderWithAuth(<ApprovalsPage />, {
      user: { id: 99, name: 'Supervisor User', permissions: ['approval.view', 'approval.discount'] },
    });

    await waitFor(() => {
      expect(screen.getByText('APR-2026-0001')).toBeInTheDocument();
    });

    const rejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
    fireEvent.click(rejectButtons[0]);

    expect(screen.getByText(/Reject Override Request/i)).toBeInTheDocument();

    // Confirm button without reason should display error
    const confirmReject = screen.getByRole('button', { name: /Reject Request/i });
    fireEvent.click(confirmReject);

    await waitFor(() => {
      expect(screen.getByText(/Rejection reason is mandatory/i)).toBeInTheDocument();
    });
  });

  it('renders ApprovalDetailPage with overview, timeline, and separation of duties warning for requester', async () => {
    render(
      <AuthContext.Provider
        value={{
          user: { id: 10, name: 'Abebe Cashier', permissions: ['approval.view', 'approval.create'] },
          status: 'authenticated',
        }}
      >
        <MemoryRouter initialEntries={['/approvals/1']}>
          <Routes>
            <Route path="/approvals/:id" element={<ApprovalDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approval Request APR-2026-0001')).toBeInTheDocument();
      expect(screen.getAllByText(/25% staff family emergency discount/i).length).toBeGreaterThan(0);
    });

    // Separation of duties alert displayed for requester
    expect(screen.getByText(/Separation of Duties Enforced/i)).toBeInTheDocument();
    expect(screen.getByText(/Cancel Request/i)).toBeInTheDocument();

    // Decision event history timeline
    expect(screen.getByText(/Decision & Event History/i)).toBeInTheDocument();
    expect(screen.getByText(/Approval request created: 25% staff family emergency discount/i)).toBeInTheDocument();
  });

  it('renders Approve and Reject action buttons in detail page for authorized supervisor', async () => {
    render(
      <AuthContext.Provider
        value={{
          user: { id: 99, name: 'Supervisor User', permissions: ['approval.view', 'approval.discount'] },
          status: 'authenticated',
        }}
      >
        <MemoryRouter initialEntries={['/approvals/1']}>
          <Routes>
            <Route path="/approvals/:id" element={<ApprovalDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Approval Request APR-2026-0001')).toBeInTheDocument();
    });

    // Supervisor has Approve and Reject actions
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
  });
});
