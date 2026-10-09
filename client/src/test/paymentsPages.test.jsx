import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import PaymentsPage from '../pages/PaymentsPage.jsx';
import PaymentDetailPage from '../pages/PaymentDetailPage.jsx';
import ReceivablesPage from '../pages/ReceivablesPage.jsx';

const { mockPayments, mockReceivables, mockCustomerSummary } = vi.hoisted(() => ({
  mockPayments: [
    {
      id: 1,
      payment_number: 'PAY-2026-0001',
      payment_date: '2026-10-09T08:30:00Z',
      payment_method: 'cash',
      amount: '350.00',
      currency: 'ETB',
      status: 'completed',
      customer_id: 10,
      customer_name: 'Abebe Bikila',
      branch_id: 1,
      branch_name: 'Main Pharmacy Branch',
      refunded_amount: '0.00',
      allocation_count: 1,
      recorded_by_name: 'Cashier Tech',
    },
    {
      id: 2,
      payment_number: 'PAY-2026-0002',
      payment_date: '2026-10-09T09:15:00Z',
      payment_method: 'mobile_money',
      amount: '500.00',
      currency: 'ETB',
      status: 'pending',
      customer_id: null,
      customer_name: null,
      branch_id: 1,
      branch_name: 'Main Pharmacy Branch',
      refunded_amount: '0.00',
      allocation_count: 0,
      recorded_by_name: 'Cashier Tech',
    },
  ],
  mockReceivables: [
    {
      id: 1,
      receivable_number: 'REC-2026-0001',
      customer_id: 10,
      customer_name: 'Abebe Bikila',
      reference_type: 'sale',
      reference_id: 55,
      total_amount: '1200.00',
      paid_amount: '400.00',
      balance_amount: '800.00',
      due_date: '2026-11-09',
      status: 'partially_paid',
      branch_id: 1,
    },
  ],
  mockCustomerSummary: {
    customer: { id: 10, name: 'Abebe Bikila', code: 'CUST-0010', status: 'active' },
    creditLimit: 5000,
    currentBalance: 800,
    availableCredit: 4200,
    receivables: [
      { id: 1, receivable_number: 'REC-2026-0001', status: 'partially_paid', balance_amount: 800 },
    ],
  },
}));

vi.mock('../features/finance/api.js', () => ({
  paymentsApi: {
    list: vi.fn().mockResolvedValue({ data: { payments: mockPayments } }),
    get: vi.fn().mockResolvedValue({
      data: {
        payment: mockPayments[0],
        allocations: [{ id: 1, reference_type: 'sale', reference_id: 55, amount: '350.00' }],
        refunds: [],
      },
    }),
    getReceipt: vi.fn().mockResolvedValue({
      data: {
        receipt: {
          payment: mockPayments[0],
          allocations: [{ id: 1, reference_type: 'sale', reference_id: 55, amount: '350.00' }],
          refunds: [],
        },
      },
    }),
    create: vi.fn().mockResolvedValue({ data: { payment: { id: 3, payment_number: 'PAY-2026-0003' } } }),
    verify: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
    refund: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  receivablesApi: {
    list: vi.fn().mockResolvedValue({ data: { receivables: mockReceivables } }),
    get: vi.fn().mockResolvedValue({ data: { receivable: mockReceivables[0] } }),
    getCustomerSummary: vi.fn().mockResolvedValue({ data: { summary: mockCustomerSummary } }),
    creditSale: vi.fn().mockResolvedValue({ data: { success: true } }),
    creditDispensing: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  branchesApi: {
    list: vi.fn().mockResolvedValue({
      data: { branches: [{ id: 1, name: 'Main Pharmacy Branch' }] },
    }),
  },
}));

vi.mock('../features/partners/api.js', () => ({
  customersApi: {
    list: vi.fn().mockResolvedValue({
      data: { customers: [{ id: 10, name: 'Abebe Bikila' }] },
    }),
  },
}));

function renderWithAuth(ui, permissions = ['payment.view', 'payment.create', 'payment.verify', 'payment.refund', 'receivable.view']) {
  const authValue = {
    user: { id: 1, name: 'Admin Test', role: 'admin' },
    permissions,
    hasPermission: (perm) => permissions.includes(perm),
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>
  );
}

describe('Task 13 — Frontend Finance, Payments & Receivables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('PaymentsPage: renders list of payments, badges, and metric cards', async () => {
    renderWithAuth(<PaymentsPage />);

    expect(screen.getByText('Payments Directory')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('PAY-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('PAY-2026-0002')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Transactions')).toBeInTheDocument();
    expect(screen.getByText('Abebe Bikila')).toBeInTheDocument();
    expect(screen.getByText('Walk-in')).toBeInTheDocument();
  });

  test('PaymentsPage: opens receipt modal when Receipt button clicked', async () => {
    renderWithAuth(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText('PAY-2026-0001')).toBeInTheDocument();
    });

    const receiptButtons = screen.getAllByText('Receipt');
    fireEvent.click(receiptButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Payment Receipt')).toBeInTheDocument();
      expect(screen.getByText('Net Settled Amount')).toBeInTheDocument();
    });
  });

  test('PaymentDetailPage: renders full payment metadata, allocations and summary', async () => {
    const authValue = {
      user: { id: 1, name: 'Admin Test', role: 'admin' },
      permissions: ['payment.view', 'payment.refund'],
      hasPermission: (perm) => true,
    };

    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/finance/payments/1']}>
          <Routes>
            <Route path="/finance/payments/:id" element={<PaymentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Payment Information')).toBeInTheDocument();
      expect(screen.getByText('Payment Allocations')).toBeInTheDocument();
      expect(screen.getByText('Financial Summary')).toBeInTheDocument();
    });
  });

  test('ReceivablesPage: renders receivables directory, balance due, and customer profile modal', async () => {
    renderWithAuth(<ReceivablesPage />);

    expect(screen.getByText('Accounts Receivable & Customer Credit')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('REC-2026-0001')).toBeInTheDocument();
      expect(screen.getAllByText(/800\.00/).length).toBeGreaterThan(0);
    });

    // Click customer name to open profile summary
    const customerBtn = screen.getByRole('button', { name: 'Abebe Bikila' });
    fireEvent.click(customerBtn);

    await waitFor(() => {
      expect(screen.getByText('Customer Financial Profile')).toBeInTheDocument();
      expect(screen.getByText('Available Credit')).toBeInTheDocument();
      expect(screen.getByText(/4200\.00/)).toBeInTheDocument();
    });
  });
});
