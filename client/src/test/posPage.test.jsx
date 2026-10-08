import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import PosPage from '../pages/PosPage.jsx';
import SalesPage from '../pages/SalesPage.jsx';

vi.mock('../features/sales/api.js', () => ({
  salesApi: {
    searchPosProducts: vi.fn(),
    create: vi.fn(),
    confirm: vi.fn(),
    paymentPending: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    voidSale: vi.fn(),
    list: vi.fn(),
    getReceipt: vi.fn(),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  branchesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        branches: [{ id: 1, name: 'Main Pharmacy Branch', code: 'MPB', status: 'active' }],
      },
    }),
  },
  warehousesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        warehouses: [{ id: 1, branch_id: 1, name: 'Retail Dispensing Store', code: 'RDS', status: 'active' }],
      },
    }),
  },
}));

vi.mock('../features/partners/api.js', () => ({
  customersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        customers: [
          { id: 10, name: 'Abebe Bikila', customer_type: 'individual', phone: '+251911223344', status: 'active' },
        ],
      },
    }),
  },
}));

import { salesApi } from '../features/sales/api.js';

describe('POS & Sales Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithAuth = (ui, permissions = ['sale.create', 'sale.view', 'sale.confirm', 'sale.complete', 'sale.cancel', 'sale.void']) => {
    return render(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          user: { id: 1, name: 'Test Cashier', organization_id: 1, permissions },
        }}
      >
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    );
  };

  test('POS page renders barcode/search inputs and empty cart state', async () => {
    renderWithAuth(<PosPage />);

    expect(screen.getByText(/Pharmacy Point of Sale/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Scan barcode or type medicine name/i)).toBeInTheDocument();
    expect(screen.getByText(/Cart is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/Scan a medicine barcode with your scanner/i)).toBeInTheDocument();
  });

  test('Product search displays results with stock and pricing, and prevents adding out-of-stock items', async () => {
    salesApi.searchPosProducts.mockResolvedValue({
      data: {
        products: [
          {
            id: 1,
            name: 'Paracetamol 500mg',
            code: 'PARA-500',
            barcode: '8901234567890',
            strength: '500mg',
            dosage_form_name: 'Tablet',
            selling_price: 25.0,
            availableQuantity: 50,
            units: [{ unit_id: 1, name: 'Stripe', conversion_factor: 1, is_selling_unit: true }],
          },
          {
            id: 2,
            name: 'Out of Stock Syrup',
            code: 'OOS-SYR',
            barcode: '8901234567891',
            strength: '100ml',
            dosage_form_name: 'Syrup',
            selling_price: 80.0,
            availableQuantity: 0,
            units: [{ unit_id: 2, name: 'Bottle', conversion_factor: 1, is_selling_unit: true }],
          },
        ],
      },
    });

    renderWithAuth(<PosPage />);

    // Wait for branch to be selected from mock
    await waitFor(() => {
      expect(screen.getByDisplayValue(/Main Pharmacy Branch/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Scan barcode or type medicine name/i);
    fireEvent.change(searchInput, { target: { value: 'Paracetamol' } });

    await waitFor(() => {
      expect(salesApi.searchPosProducts).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Paracetamol' })
      );
    });

    // Both products appear in dropdown
    await waitFor(() => {
      expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();
      expect(screen.getByText('Out of Stock Syrup')).toBeInTheDocument();
    });

    // Check stock labels
    expect(screen.getByText(/Stock:/i)).toBeInTheDocument();
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();

    // Adding in-stock item should put it in the cart
    fireEvent.click(screen.getByText('Paracetamol 500mg'));

    await waitFor(() => {
      expect(screen.queryByText(/Cart is empty/i)).not.toBeInTheDocument();
      expect(screen.getByText('PARA-500')).toBeInTheDocument();
    });

    // Reopen search and test clicking out of stock item
    fireEvent.change(searchInput, { target: { value: 'Syrup' } });
    await waitFor(() => {
      expect(screen.getByText('Out of Stock Syrup')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Out of Stock Syrup'));

    // Warning notification appears
    await waitFor(() => {
      expect(screen.getByText(/Cannot add "Out of Stock Syrup": item is out of stock/i)).toBeInTheDocument();
    });
  });

  test('Cart quantity updates, line discount, order discount, and total recalculations', async () => {
    salesApi.searchPosProducts.mockResolvedValue({
      data: {
        products: [
          {
            id: 1,
            name: 'Amoxicillin 500mg',
            code: 'AMX-500',
            barcode: '111111',
            selling_price: 30.0,
            availableQuantity: 10,
            units: [{ unit_id: 1, name: 'Capsule', conversion_factor: 1, is_selling_unit: true }],
          },
        ],
      },
    });

    renderWithAuth(<PosPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/Main Pharmacy Branch/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Scan barcode or type medicine name/i);
    fireEvent.change(searchInput, { target: { value: 'Amoxicillin' } });

    await waitFor(() => {
      expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Amoxicillin 500mg'));

    // Cart shows subtotal 30.00
    await waitFor(() => {
      expect(screen.getAllByText('ETB 30.00').length).toBeGreaterThan(0);
    });

    // Increment qty with + button
    const incBtn = screen.getByRole('button', { name: '+' });
    fireEvent.click(incBtn);

    // Qty becomes 2, subtotal = 60.00
    await waitFor(() => {
      expect(screen.getAllByText('ETB 60.00').length).toBeGreaterThan(0);
    });

    // Apply 10 ETB discount on order
    const discountInputs = screen.getAllByRole('spinbutton');
    const orderDiscountInput = discountInputs[discountInputs.length - 1]; // order discount is last spinbutton
    fireEvent.change(orderDiscountInput, { target: { value: '10' } });

    // Net total = 50.00 (60 - 10)
    await waitFor(() => {
      expect(screen.getByText('ETB 50.00')).toBeInTheDocument();
    });
  });

  test('Completing sale calls sales API and displays receipt modal', async () => {
    salesApi.searchPosProducts.mockResolvedValue({
      data: {
        products: [
          {
            id: 1,
            name: 'Ciprofloxacin 500mg',
            code: 'CIPRO-500',
            barcode: '222222',
            selling_price: 40.0,
            availableQuantity: 20,
            units: [{ unit_id: 1, name: 'Box', conversion_factor: 1, is_selling_unit: true }],
          },
        ],
      },
    });

    salesApi.create.mockResolvedValue({
      data: {
        sale: { id: 101, sale_number: 'SALE-20261008-0001', status: 'draft' },
      },
    });

    salesApi.confirm.mockResolvedValue({
      data: {
        sale: { id: 101, sale_number: 'SALE-20261008-0001', status: 'confirmed' },
      },
    });

    salesApi.complete.mockResolvedValue({
      data: {
        sale: {
          id: 101,
          sale_number: 'SALE-20261008-0001',
          status: 'completed',
          subtotal: 40.0,
          discount_amount: 0.0,
          total_amount: 40.0,
          branch_name: 'Main Pharmacy Branch',
          cashier_name: 'Test Cashier',
          created_at: new Date().toISOString(),
          lines: [
            {
              id: 1,
              product_name: 'Ciprofloxacin 500mg',
              quantity: 1,
              unit_name: 'Box',
              unit_price: 40.0,
              line_total: 40.0,
              allocations: [{ batch_number: 'BATCH-CIP-01', quantity: 1, expiry_date: '2028-01-01' }],
            },
          ],
        },
      },
    });

    salesApi.getReceipt.mockResolvedValue({
      data: {
        receipt: {
          saleNumber: 'SALE-20261008-0001',
          saleDate: new Date().toISOString(),
          branch: { name: 'Main Pharmacy Branch' },
          customer: { name: 'Walk-in Customer' },
          cashier: { name: 'Test Cashier' },
          currency: 'ETB',
          subtotal: 40.0,
          discountAmount: 0.0,
          totalAmount: 40.0,
          lines: [
            {
              productName: 'Ciprofloxacin 500mg',
              quantity: 1,
              unitName: 'Box',
              unitPrice: 40.0,
              lineTotal: 40.0,
              batches: [{ batchNumber: 'BATCH-CIP-01', quantity: 1, expiryDate: '2028-01-01' }],
            },
          ],
        },
      },
    });

    renderWithAuth(<PosPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/Main Pharmacy Branch/i)).toBeInTheDocument();
    });

    // Add item
    const searchInput = screen.getByPlaceholderText(/Scan barcode or type medicine name/i);
    fireEvent.change(searchInput, { target: { value: 'Cipro' } });

    await waitFor(() => {
      expect(screen.getByText('Ciprofloxacin 500mg')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Ciprofloxacin 500mg'));

    // Click "Complete Sale & Dispense"
    const completeBtn = screen.getByRole('button', { name: /Complete Sale & Dispense/i });
    fireEvent.click(completeBtn);

    // Sales API create, confirm, complete called
    await waitFor(() => {
      expect(salesApi.create).toHaveBeenCalled();
      expect(salesApi.confirm).toHaveBeenCalledWith(101);
      expect(salesApi.complete).toHaveBeenCalledWith(101);
      expect(salesApi.getReceipt).toHaveBeenCalledWith(101);
    });

    // Receipt modal is shown with header and batch allocation
    await waitFor(() => {
      expect(screen.getByText('ETHIOCODES PHARMACY')).toBeInTheDocument();
      expect(screen.getByText(/BATCH-CIP-01/i)).toBeInTheDocument();
    });
  });

  test('Sales history page renders and provides receipt view and void dialog', async () => {
    salesApi.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 99,
            sale_number: 'SALE-20261008-9999',
            branch_name: 'Main Pharmacy Branch',
            customer_name: 'Abebe Bikila',
            status: 'completed',
            total_amount: 150.0,
            sale_date: '2026-10-08T12:00:00Z',
          },
        ],
        total: 1,
      },
    });

    salesApi.getReceipt.mockResolvedValue({
      data: {
        receipt: {
          saleNumber: 'SALE-20261008-9999',
          saleDate: '2026-10-08T12:00:00Z',
          branch: { name: 'Main Pharmacy Branch' },
          customer: { name: 'Abebe Bikila' },
          cashier: { name: 'Test Cashier' },
          currency: 'ETB',
          subtotal: 150.0,
          discountAmount: 0.0,
          totalAmount: 150.0,
          lines: [
            {
              productName: 'Paracetamol',
              quantity: 2,
              unitName: 'Strip',
              unitPrice: 75.0,
              lineTotal: 150.0,
              batches: [{ batchNumber: 'B-100', expiryDate: '2027-10-10', quantity: 2 }],
            },
          ],
        },
      },
    });

    renderWithAuth(<SalesPage />);

    await waitFor(() => {
      expect(screen.getByText('SALE-20261008-9999')).toBeInTheDocument();
      expect(screen.getByText('Abebe Bikila')).toBeInTheDocument();
      expect(screen.getByText('ETB 150.00')).toBeInTheDocument();
    });

    // Click Receipt button
    const receiptBtn = screen.getByRole('button', { name: 'Receipt' });
    fireEvent.click(receiptBtn);

    await waitFor(() => {
      expect(salesApi.getReceipt).toHaveBeenCalledWith(99);
      expect(screen.getByText('ETHIOCODES PHARMACY')).toBeInTheDocument();
      expect(screen.getByText(/B-100/i)).toBeInTheDocument();
    });

    // Close receipt modal
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    // Click Void button
    const voidBtn = screen.getByRole('button', { name: 'Void' });
    fireEvent.click(voidBtn);

    await waitFor(() => {
      expect(screen.getByText('Void Completed Sale')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter regulatory or operational reason/i)).toBeInTheDocument();
    });
  });
});
