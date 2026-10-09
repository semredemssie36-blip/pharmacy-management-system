import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import DispensingsPage from '../pages/DispensingsPage.jsx';
import DispensingCreatePage from '../pages/DispensingCreatePage.jsx';
import DispensingDetailPage from '../pages/DispensingDetailPage.jsx';

const { mockDispensing } = vi.hoisted(() => ({
  mockDispensing: {
    id: 1,
    organization_id: 1,
    branch_id: 1,
    warehouse_id: 1,
    prescription_id: 1,
    patient_id: 1,
    dispensing_number: 'DISP-2026-0001',
    prescription_number: 'RX-2026-0001',
    patient_first_name: 'Sara',
    patient_last_name: 'Tesfaye',
    patient_mrn: 'MRN-1001',
    patient_gender: 'female',
    patient_dob: '1995-04-12',
    patient_allergies: 'Penicillin (Mild rash)',
    prescriber_name: 'Dr. Daniel Girma',
    prescriber_license_number: 'MD-10293',
    prescription_expiry_date: '2027-01-01',
    branch_name: 'Addis Ababa Central Branch',
    warehouse_name: 'Main Pharmacy Store',
    dispensing_date: '2026-10-09',
    status: 'pending_verification',
    notes: 'Prepare for patient discharge',
    created_by_name: 'Tech User',
    created_at: '2026-10-09T08:00:00Z',
    lines: [
      {
        id: 10,
        dispensing_id: 1,
        prescription_line_id: 101,
        product_id: 5,
        unit_id: 1,
        product_name: 'Amoxicillin 500mg Caps',
        product_code: 'AMX-500',
        prescription_classification: 'prescription',
        controlled_classification: 'none',
        dosage: '1 capsule',
        frequency: 'TID',
        duration: '7 days',
        instructions: 'Take with food',
        quantity_prescribed: '21.000',
        quantity_requested: '10.000',
        quantity_allocated: '10.000',
        quantity_dispensed: '0.000',
        unit_code: 'CAP',
        notes: 'First week partial dispense',
        allocations: [
          {
            id: 101,
            batch_id: 201,
            batch_number: 'BAT-AMX-2026A',
            expiry_date: '2027-06-01',
            storage_location_name: 'Shelf A1',
            quantity: '10.000',
            unit_code: 'CAP',
            status: 'reserved',
          },
        ],
      },
    ],
  },
}));

vi.mock('../features/clinical/api.js', () => ({
  dispensingsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [mockDispensing],
        total: 1,
      },
    }),
    get: vi.fn().mockResolvedValue({
      data: {
        dispensing: mockDispensing,
      },
    }),
    create: vi.fn().mockResolvedValue({
      data: {
        dispensing: { id: 2, dispensing_number: 'DISP-2026-0002' },
      },
    }),
    allocate: vi.fn().mockResolvedValue({
      data: {
        dispensing: { ...mockDispensing, status: 'stock_allocated' },
      },
    }),
    submitVerification: vi.fn().mockResolvedValue({
      data: {
        dispensing: { ...mockDispensing, status: 'pending_verification' },
      },
    }),
    verify: vi.fn().mockResolvedValue({
      data: {
        dispensing: {
          ...mockDispensing,
          status: 'payment_pending',
          verified_by_name: 'Lead Pharmacist',
          verified_at: '2026-10-09T08:30:00Z',
          verification_notes: 'All checks passed',
        },
      },
    }),
    reject: vi.fn().mockResolvedValue({
      data: {
        dispensing: {
          ...mockDispensing,
          status: 'rejected',
          rejected_by_name: 'Lead Pharmacist',
          rejected_at: '2026-10-09T08:35:00Z',
          rejection_reason: 'Allergy warning override required',
        },
      },
    }),
    cancel: vi.fn().mockResolvedValue({
      data: {
        dispensing: {
          ...mockDispensing,
          status: 'cancelled',
          cancelled_by_name: 'Tech User',
          cancelled_at: '2026-10-09T08:40:00Z',
          cancellation_reason: 'Patient changed prescription',
        },
      },
    }),
  },
  prescriptionsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            prescription_number: 'RX-2026-0001',
            patient_first_name: 'Sara',
            patient_last_name: 'Tesfaye',
            status: 'validated',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn().mockResolvedValue({
      data: {
        prescription: {
          id: 1,
          prescription_number: 'RX-2026-0001',
          branch_id: 1,
          patient_first_name: 'Sara',
          patient_last_name: 'Tesfaye',
          patient_mrn: 'MRN-1001',
          patient_allergies: 'Penicillin',
          prescriber_name: 'Dr. Daniel Girma',
          prescriber_license_number: 'MD-10293',
          prescription_date: '2026-10-08',
          expiry_date: '2027-01-01',
          lines: [
            {
              id: 101,
              product_id: 5,
              product_name: 'Amoxicillin 500mg Caps',
              product_code: 'AMX-500',
              quantity_prescribed: 21,
              quantity_dispensed: 0,
              quantity_remaining: 21,
              dosage: '1 cap',
              frequency: 'TID',
              duration: '7 days',
              instructions: 'With meals',
              controlled_classification: 'none',
              unit_name: 'Capsule',
            },
          ],
        },
      },
    }),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  warehousesApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        warehouses: [{ id: 1, name: 'Main Pharmacy Store', code: 'W-01' }],
      },
    }),
  },
}));

const authContextWithAllPerms = {
  user: {
    id: 1,
    name: 'Admin Pharmacist',
    role: 'pharmacist',
    permissions: [
      'dispensing.view',
      'dispensing.create',
      'dispensing.update',
      'dispensing.allocate',
      'dispensing.verify',
      'dispensing.reject',
      'dispensing.cancel',
    ],
  },
  hasPermission: (perm) => true,
};

const authContextTechOnly = {
  user: {
    id: 2,
    name: 'Pharmacy Tech',
    role: 'technician',
    permissions: ['dispensing.view', 'dispensing.create', 'dispensing.allocate'],
  },
  hasPermission: (perm) => ['dispensing.view', 'dispensing.create', 'dispensing.allocate'].includes(perm),
};

describe('Dispensings Module Frontend', () => {
  test('Dispensings directory renders table, summary KPIs, and action buttons', async () => {
    render(
      <AuthContext.Provider value={authContextWithAllPerms}>
        <BrowserRouter>
          <DispensingsPage />
        </BrowserRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Dispensing Operations')).toBeInTheDocument();
    expect(screen.getByText('New Dispensing Order')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('DISP-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('RX-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('Sara Tesfaye')).toBeInTheDocument();
      expect(screen.getByText('Main Pharmacy Store')).toBeInTheDocument();
    });
  });

  test('Dispensing Create Page loads eligible prescription and shows clinical context', async () => {
    render(
      <AuthContext.Provider value={authContextWithAllPerms}>
        <MemoryRouter initialEntries={['/clinical/dispensings/new?prescriptionId=1']}>
          <Routes>
            <Route path="/clinical/dispensings/new" element={<DispensingCreatePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Prepare Dispensing Order')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Patient Information/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr. Daniel Girma/i)).toBeInTheDocument();
      expect(screen.getByText('Amoxicillin 500mg Caps')).toBeInTheDocument();
    });
  });

  test('Dispensing Detail Page displays batch allocations and Pharmacist verification modal', async () => {
    render(
      <AuthContext.Provider value={authContextWithAllPerms}>
        <MemoryRouter initialEntries={['/clinical/dispensings/1']}>
          <Routes>
            <Route path="/clinical/dispensings/:id" element={<DispensingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Dispensing Order #DISP-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('BAT-AMX-2026A')).toBeInTheDocument();
      expect(screen.getByText('Shelf A1')).toBeInTheDocument();
      expect(screen.getByText('Pharmacist Verify')).toBeInTheDocument();
    });

    // Click Pharmacist Verify button
    fireEvent.click(screen.getByText('Pharmacist Verify'));
    expect(screen.getByText('Pharmacist Clinical Verification')).toBeInTheDocument();
    expect(screen.getByText(/Clinical Verification Checklist/i)).toBeInTheDocument();

    // Check all 4 checklist items
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb));

    // Verify button is now enabled
    const verifyBtn = screen.getByText('Authorize & Verify Order');
    expect(verifyBtn).not.toBeDisabled();
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Dispensing order clinically verified!/i)).toBeInTheDocument();
    });
  });

  test('Pharmacy Technician without dispensing.verify cannot see Pharmacist Verify button', async () => {
    render(
      <AuthContext.Provider value={authContextTechOnly}>
        <MemoryRouter initialEntries={['/clinical/dispensings/1']}>
          <Routes>
            <Route path="/clinical/dispensings/:id" element={<DispensingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Dispensing Order #DISP-2026-0001')).toBeInTheDocument();
    });

    expect(screen.queryByText('Pharmacist Verify')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject Order')).not.toBeInTheDocument();
  });
});
