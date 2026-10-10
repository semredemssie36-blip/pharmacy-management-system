import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import DashboardOverviewPage from '../pages/DashboardOverviewPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';

const mockDashboardData = {
  sales: {
    completedCount: 42,
    totalSalesAmount: 125000.5,
    grossSalesAmount: 130000.0,
    totalDiscountAmount: 4999.5,
    totalPaidAmount: 120000.0,
    averageSaleValue: 2976.2,
  },
  finance: {
    paymentCount: 50,
    totalCollected: 140000.0,
    activeReceivablesCount: 8,
    totalOutstandingReceivables: 18500.0,
    totalCreditExtended: 35000.0,
    refundCount: 2,
    totalRefunded: 2400.0,
    netCollected: 137600.0,
  },
  inventory: {
    availableQuantity: 4500,
    reservedQuantity: 200,
    quarantinedQuantity: 50,
    expiredQuantity: 25,
    physicalQuantity: 4775,
    lowStockCount: 3,
    stockoutCount: 1,
    nearExpiryBatchCount: 4,
    expiredBatchCount: 2,
  },
  operations: {
    pendingApprovalsCount: 3,
    inTransitTransfersCount: 1,
    pendingPrescriptionsCount: 6,
    activeQuarantinesCount: 2,
    activeRecallsCount: 1,
  },
  recentSales: [
    {
      id: 101,
      sale_number: 'SALE-2026-0001',
      sale_date: '2026-10-10T09:30:00Z',
      branch_name: 'Piassa Branch',
      customer_name: 'Abebe Bikila',
      total_amount: 1500.0,
      paid_amount: 1500.0,
      payment_status: 'paid',
    },
  ],
  nearExpiryBatches: [
    {
      product_name: 'Paracetamol 500mg',
      product_code: 'PARA-500',
      batch_number: 'B-PARA-01',
      expiry_date: '2026-11-15',
      days_remaining: 36,
      available_quantity: 120,
      warehouse_name: 'Main Dispensary WH',
    },
  ],
};

const mockSalesReportData = {
  summary: {
    completedCount: 42,
    grossTotal: 130000.0,
    totalDiscount: 4999.5,
    netTotal: 125000.5,
    paidTotal: 120000.0,
  },
  dailyTrend: [{ date: '2026-10-10', sales_count: 5, total_amount: 15000 }],
  byBranch: [{ branch_id: 1, branch_name: 'Piassa', sales_count: 30, total_amount: 90000 }],
  topProducts: [
    {
      product_id: 1,
      product_name: 'Amoxicillin 500mg',
      category_name: 'Antibiotics',
      total_quantity: 350,
      total_revenue: 35000,
    },
  ],
  pagination: { page: 1, limit: 15, total: 42, totalPages: 3 },
  items: [
    {
      id: 1,
      sale_number: 'SALE-2026-0001',
      sale_date: '2026-10-10',
      branch_name: 'Piassa',
      customer_name: 'Walk-in',
      subtotal: 1000,
      discount_amount: 50,
      total_amount: 950,
      paid_amount: 950,
      payment_status: 'paid',
    },
  ],
};

const mockInventoryReportData = {
  summary: {
    availableQuantity: 4500,
    reservedQuantity: 200,
    quarantinedQuantity: 50,
    expiredQuantity: 25,
    physicalQuantity: 4775,
  },
  byCategory: [{ category_name: 'Antibiotics', available_quantity: 1200 }],
  byWarehouse: [{ warehouse_id: 1, warehouse_name: 'WH 1', available_quantity: 4500 }],
  pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
  items: [
    {
      id: 1,
      product_code: 'AMX-500',
      product_name: 'Amoxicillin 500mg',
      warehouse_name: 'Main WH',
      location_name: 'Shelf A',
      batch_number: 'B-AMX-99',
      expiry_date: '2027-01-01',
      inventory_status: 'available',
      quantity: 500,
      unit_name: 'box',
      estimated_unit_cost: 45.0,
      estimated_stock_value: 22500.0,
    },
  ],
};

vi.mock('../services/apiClient.js', () => ({
  default: {
    get: vi.fn((path) => {
      if (path.startsWith('/reports/dashboard')) {
        return Promise.resolve({ success: true, data: mockDashboardData });
      }
      if (path.startsWith('/reports/sales')) {
        return Promise.resolve({ success: true, data: mockSalesReportData });
      }
      if (path.startsWith('/reports/inventory')) {
        return Promise.resolve({ success: true, data: mockInventoryReportData });
      }
      if (path.startsWith('/reports/financial')) {
        return Promise.resolve({
          success: true,
          data: {
            summary: {
              paymentCount: 10,
              totalCollected: 50000,
              totalRefunded: 0,
              netCollections: 50000,
              activeReceivablesCount: 2,
              outstandingReceivablesBalance: 5000,
            },
            byMethod: [{ payment_method: 'cash', count: 8, total_amount: 40000 }],
            receivables: [],
            pagination: { page: 1, total: 0, totalPages: 0 },
          },
        });
      }
      if (path.startsWith('/reports/procurement')) {
        return Promise.resolve({
          success: true,
          data: {
            summary: { totalOrders: 5, totalSpend: 25000 },
            items: [],
            pagination: { page: 1, total: 0, totalPages: 0 },
          },
        });
      }
      if (path.startsWith('/reports/dispensing')) {
        return Promise.resolve({
          success: true,
          data: {
            prescriptionsByStatus: [{ status: 'validated', count: 12 }],
            dispensingsByStatus: [{ status: 'completed', count: 10, total_amount: 15000 }],
            items: [],
            pagination: { page: 1, total: 0, totalPages: 0 },
          },
        });
      }
      if (path.startsWith('/reports/expiry-quarantine')) {
        return Promise.resolve({
          success: true,
          data: {
            expiryBatches: [
              {
                product_name: 'Paracetamol',
                batch_number: 'B-01',
                branch_name: 'Piassa',
                warehouse_name: 'WH 1',
                expiry_date: '2026-11-01',
                days_remaining: 22,
                total_quantity: 100,
                unit_name: 'strip',
                inventory_status: 'available',
              },
            ],
            quarantines: [],
            recalls: [],
            pagination: { page: 1, total: 1, totalPages: 1 },
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    }),
  },
}));

const mockAuthContext = {
  user: {
    id: 1,
    name: 'Administrator',
    email: 'admin@pharmacy.com',
    permissions: [
      'report.dashboard.view',
      'report.sales.view',
      'report.inventory.view',
      'report.financial.view',
      'report.procurement.view',
      'report.dispensing.view',
      'report.expiry_quarantine.view',
    ],
  },
};

function renderDashboard() {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <BrowserRouter>
        <DashboardOverviewPage />
      </BrowserRouter>
    </AuthContext.Provider>,
  );
}

function renderReports(initialTab = 'sales') {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <MemoryRouter initialEntries={[`/reports?tab=${initialTab}`]}>
        <ReportsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('DashboardOverviewPage', () => {
  it('renders operational dashboard heading and key metrics cards', async () => {
    renderDashboard();

    expect(screen.getByText(/Pharmacy ERP — Operational Dashboard/i)).toBeInTheDocument();

    await waitFor(() => {
      // Completed Sales card title and transactions subtitle
      expect(screen.getByText('Completed Sales')).toBeInTheDocument();
      expect(screen.getByText(/42 completed transactions/i)).toBeInTheDocument();
      expect(screen.getByText('Payment Collections')).toBeInTheDocument();
      expect(screen.getByText('Customer Receivables')).toBeInTheDocument();
      expect(screen.getByText('Available Stock')).toBeInTheDocument();
    });
  });

  it('renders alert counts and recent tables', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/3 Low \/ 1 Out/i)).toBeInTheDocument();
      expect(screen.getByText(/4 Soon \/ 2 Expired/i)).toBeInTheDocument();
      expect(screen.getByText('SALE-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
    });
  });

  it('allows clicking date preset filters', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Completed Sales')).toBeInTheDocument();
    });

    const sevenDaysBtn = screen.getByRole('button', { name: '7 Days' });
    fireEvent.click(sevenDaysBtn);

    const refreshBtn = await screen.findByRole('button', { name: /Refresh/i });
    expect(refreshBtn).toBeInTheDocument();
  });
});

describe('ReportsPage', () => {
  it('renders report navigation tabs and sales summary cards', async () => {
    renderReports('sales');

    expect(screen.getByText(/Reports & Operational Analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sales & Revenue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inventory & Valuation/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Net Sales (Completed)')).toBeInTheDocument();
      expect(screen.getByText(/Amoxicillin 500mg/i)).toBeInTheDocument();
      expect(screen.getByText('SALE-2026-0001')).toBeInTheDocument();
    });
  });

  it('switches to inventory tab and displays inventory positions with valuation', async () => {
    renderReports('inventory');

    await waitFor(() => {
      expect(screen.getByText('Available Units')).toBeInTheDocument();
      expect(screen.getByText('Total Physical Stock')).toBeInTheDocument();
      expect(screen.getByText('AMX-500')).toBeInTheDocument();
      expect(screen.getByText('B-AMX-99')).toBeInTheDocument();
    });
  });

  it('switches to expiry tab and displays near expiry batches', async () => {
    renderReports('expiry');

    await waitFor(() => {
      expect(screen.getByText(/Batches Expiring Soon or Expired/i)).toBeInTheDocument();
      expect(screen.getByText('Paracetamol')).toBeInTheDocument();
      expect(screen.getByText('B-01')).toBeInTheDocument();
      expect(screen.getByText(/22d remaining/i)).toBeInTheDocument();
    });
  });
});
