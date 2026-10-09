import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import CustomerReturnsPage from '../pages/CustomerReturnsPage.jsx';
import CustomerReturnDetailPage from '../pages/CustomerReturnDetailPage.jsx';
import SupplierReturnsPage from '../pages/SupplierReturnsPage.jsx';
import SupplierReturnDetailPage from '../pages/SupplierReturnDetailPage.jsx';

const { mockCustomerReturns, mockCustomerReturnDetail, mockSupplierReturns, mockSupplierReturnDetail } = vi.hoisted(() => ({
  mockCustomerReturns: [
    {
      id: 1,
      return_number: 'CR-2026-0001',
      return_date: '2026-10-09T09:00:00Z',
      sale_id: 10,
      sale_number: 'SALE-2026-0010',
      customer_id: 5,
      customer_name: 'Almaz Ayana',
      branch_name: 'Main Branch',
      status: 'pending_inspection',
      outcome: 'refund',
      refund_amount: '240.00',
      line_count: 1,
    },
    {
      id: 2,
      return_number: 'CR-2026-0002',
      return_date: '2026-10-09T10:00:00Z',
      sale_id: 11,
      sale_number: 'SALE-2026-0011',
      customer_id: null,
      customer_name: null,
      branch_name: 'Main Branch',
      status: 'completed',
      outcome: 'refund',
      refund_amount: '120.00',
      line_count: 1,
    },
  ],
  mockCustomerReturnDetail: {
    id: 1,
    return_number: 'CR-2026-0001',
    return_date: '2026-10-09T09:00:00Z',
    status: 'pending_inspection',
    reason: 'Mild allergic reaction, sealed box remaining',
    outcome: 'refund',
    refund_amount: '240.00',
    refund_id: null,
    sale_id: 10,
    sale_number: 'SALE-2026-0010',
    sale_paid_amount: '480.00',
    sale_payment_status: 'paid',
    customer_name: 'Almaz Ayana',
    customer_telephone: '+251911223344',
    branch_name: 'Main Branch',
    warehouse_name: 'Central Warehouse',
    creator_name: 'Tech Cashier',
    inspector_name: 'Pharmacist Dave',
    inspected_at: '2026-10-09T09:30:00Z',
    lines: [
      {
        id: 101,
        product_name: 'Amoxicillin 250mg',
        product_code: 'AMX-250',
        unit_name: 'Piece',
        batch_number: 'BATCH-AMX-01',
        expiry_date: '2028-12-31',
        quantity: 2,
        unit_price: '120.00',
        line_total: '240.00',
        condition_state: 'sealed_intact',
        disposition: 'quarantine',
        disposition_notes: 'Foil seal intact. Placed in quarantine.',
      },
    ],
  },
  mockSupplierReturns: [
    {
      id: 1,
      return_number: 'SR-2026-0001',
      return_date: '2026-10-09T08:00:00Z',
      supplier_name: 'Apex Pharmaceuticals',
      receipt_number: 'GR-2026-0050',
      branch_name: 'Main Branch',
      warehouse_name: 'Central Warehouse',
      status: 'approved',
      total_amount: '320.00',
      line_count: 1,
    },
  ],
  mockSupplierReturnDetail: {
    id: 1,
    return_number: 'SR-2026-0001',
    return_date: '2026-10-09T08:00:00Z',
    supplier_name: 'Apex Pharmaceuticals',
    supplier_telephone: '+251111223344',
    receipt_number: 'GR-2026-0050',
    receipt_date: '2026-10-01',
    branch_name: 'Main Branch',
    warehouse_name: 'Central Warehouse',
    status: 'approved',
    reason: 'Short expiry on delivery',
    total_amount: '320.00',
    creator_name: 'Warehouse Lead',
    lines: [
      {
        id: 201,
        product_name: 'Paracetamol 500mg',
        product_code: 'PCM-500',
        unit_name: 'Piece',
        batch_number: 'BATCH-PCM-01',
        expiry_date: '2028-06-30',
        quantity: 4,
        unit_price: '80.00',
        line_total: '320.00',
        reason: 'Near-expiry packaging',
      },
    ],
  },
}));

vi.mock('../features/returns/api.js', () => ({
  customerReturnsApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockCustomerReturns, total: 2 } }),
    get: vi.fn().mockResolvedValue({ data: { customerReturn: mockCustomerReturnDetail } }),
    getSaleEligibility: vi.fn().mockResolvedValue({
      data: {
        sale: { id: 10, sale_number: 'SALE-2026-0010', paid_amount: '480.00' },
        lines: [
          {
            id: 50,
            product_name: 'Amoxicillin 250mg',
            product_code: 'AMX-250',
            unit_name: 'Piece',
            unit_price: '120.00',
            quantity: 4,
            already_returned_quantity: 0,
            remaining_returnable_quantity: 4,
            is_returnable: true,
            allocations: [{ id: 1, batch_id: 15, batch_number: 'BATCH-AMX-01', expiry_date: '2028-12-31' }],
          },
        ],
      },
    }),
    create: vi.fn().mockResolvedValue({ data: { customerReturn: { id: 3, return_number: 'CR-2026-0003' } } }),
    submit: vi.fn().mockResolvedValue({ data: { success: true } }),
    inspect: vi.fn().mockResolvedValue({ data: { success: true } }),
    approve: vi.fn().mockResolvedValue({ data: { success: true } }),
    reject: vi.fn().mockResolvedValue({ data: { success: true } }),
    complete: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  supplierReturnsApi: {
    list: vi.fn().mockResolvedValue({ data: { items: mockSupplierReturns, total: 1 } }),
    get: vi.fn().mockResolvedValue({ data: { supplierReturn: mockSupplierReturnDetail } }),
    getReceiptEligibility: vi.fn().mockResolvedValue({
      data: {
        receipt: { id: 50, receipt_number: 'GR-2026-0050', supplier_name: 'Apex Pharmaceuticals' },
        lines: [
          {
            id: 80,
            product_name: 'Paracetamol 500mg',
            batch_id: 20,
            batch_number: 'BATCH-PCM-01',
            received_quantity: 10,
            already_returned_quantity: 0,
            remaining_returnable_quantity: 10,
            is_returnable: true,
          },
        ],
      },
    }),
    create: vi.fn().mockResolvedValue({ data: { supplierReturn: { id: 2, return_number: 'SR-2026-0002' } } }),
    submit: vi.fn().mockResolvedValue({ data: { success: true } }),
    approve: vi.fn().mockResolvedValue({ data: { success: true } }),
    complete: vi.fn().mockResolvedValue({ data: { success: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

const mockAuthUser = {
  id: 1,
  name: 'Admin Pharmacist',
  permissions: [
    'customer_return.view', 'customer_return.create', 'customer_return.inspect',
    'customer_return.approve', 'customer_return.reject', 'customer_return.complete', 'customer_return.cancel',
    'supplier_return.view', 'supplier_return.create', 'supplier_return.approve',
    'supplier_return.complete', 'supplier_return.cancel',
  ],
};

function renderWithAuth(ui) {
  return render(
    <AuthContext.Provider value={{ user: mockAuthUser, hasPermission: (p) => mockAuthUser.permissions.includes(p) }}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>,
  );
}

describe('Task 14 — Customer Returns & Supplier Returns Pages', () => {
  it('renders CustomerReturnsPage with summary cards and table rows', async () => {
    renderWithAuth(<CustomerReturnsPage />);

    expect(screen.getByText('Customer Returns & Returned-Stock Disposition')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('CR-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('CR-2026-0002')).toBeInTheDocument();
      expect(screen.getByText('Almaz Ayana')).toBeInTheDocument();
    });
  });

  it('renders CustomerReturnDetailPage with inspection details, lines, and actions', async () => {
    render(
      <AuthContext.Provider value={{ user: mockAuthUser, hasPermission: (p) => mockAuthUser.permissions.includes(p) }}>
        <MemoryRouter initialEntries={['/returns/customer/1']}>
          <Routes>
            <Route path="/returns/customer/:id" element={<CustomerReturnDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Return #CR-2026-0001')).toBeInTheDocument();
      expect(screen.getByText(/Amoxicillin 250mg/i)).toBeInTheDocument();
      expect(screen.getByText(/BATCH-AMX-01/i)).toBeInTheDocument();
      expect(screen.getAllByText(/240.00 ETB/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Inspect & Set Disposition')).toBeInTheDocument();
      expect(screen.getByText('Approve Return')).toBeInTheDocument();
    });
  });

  it('renders SupplierReturnsPage with orders and summary cards', async () => {
    renderWithAuth(<SupplierReturnsPage />);

    expect(screen.getByText('Supplier Returns & Stock Dispatch')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SR-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Apex Pharmaceuticals')).toBeInTheDocument();
      expect(screen.getByText('320.00 ETB')).toBeInTheDocument();
    });
  });

  it('renders SupplierReturnDetailPage with dispatch complete button and item lines', async () => {
    render(
      <AuthContext.Provider value={{ user: mockAuthUser, hasPermission: (p) => mockAuthUser.permissions.includes(p) }}>
        <MemoryRouter initialEntries={['/returns/supplier/1']}>
          <Routes>
            <Route path="/returns/supplier/:id" element={<SupplierReturnDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Supplier Return #SR-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Apex Pharmaceuticals')).toBeInTheDocument();
      expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
      expect(screen.getByText('Dispatch & Complete Return')).toBeInTheDocument();
    });
  });
});
