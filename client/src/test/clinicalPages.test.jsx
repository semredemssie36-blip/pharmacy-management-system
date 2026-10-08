import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';

vi.mock('../features/clinical/api.js', () => ({
  patientsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            organization_id: 1,
            patient_number: 'PAT-001',
            first_name: 'Sara',
            last_name: 'Tesfaye',
            gender: 'female',
            date_of_birth: '1995-04-12',
            age: 31,
            phone: '+251911223344',
            status: 'active',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn().mockResolvedValue({
      data: {
        patient: {
          id: 1,
          organization_id: 1,
          patient_number: 'PAT-001',
          first_name: 'Sara',
          last_name: 'Tesfaye',
          gender: 'female',
          date_of_birth: '1995-04-12',
          age: 31,
          phone: '+251911223344',
          status: 'active',
          prescriptionHistory: [],
        },
      },
    }),
    checkDuplicates: vi.fn().mockResolvedValue({ data: { duplicates: [] } }),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
  prescribersApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            organization_id: 1,
            prescriber_number: 'DOC-001',
            name: 'Dr. Daniel Girma',
            licenseNumber: 'MD-10293',
            license_number: 'MD-10293',
            specialty: 'Internal Medicine',
            workplace: 'St. Paul Hospital',
            phone: '+251922334455',
            status: 'active',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
  prescriptionsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            organization_id: 1,
            prescription_number: 'RX-2026-0001',
            patient_id: 1,
            patient_name: 'Sara Tesfaye',
            patient_number: 'PAT-001',
            prescriber_id: 1,
            prescriber_name: 'Dr. Daniel Girma',
            prescription_date: '2026-10-08',
            expiry_date: '2026-12-31',
            status: 'pending',
            lines_count: 2,
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
          patient_name: 'Sara Tesfaye',
          prescriber_name: 'Dr. Daniel Girma',
          status: 'pending',
          lines: [
            {
              id: 1,
              product_name: 'Amoxicillin 500mg',
              prescribed_strength: '500mg',
              quantity_prescribed: 21,
              quantity_dispensed: 0,
              quantity_remaining: 21,
              dosage: '1 capsule',
              frequency: 'TID',
              duration: '7 days',
              refills_allowed: 1,
              refills_remaining: 1,
            },
          ],
        },
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    validate: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../features/products/api.js', () => ({
  productsApi: {
    list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  },
}));

import PatientsPage from '../pages/PatientsPage.jsx';
import PrescribersPage from '../pages/PrescribersPage.jsx';
import PrescriptionsPage from '../pages/PrescriptionsPage.jsx';

describe('Clinical Management Pages (Task 11)', () => {
  test('PatientsPage renders patient records and shows Register button with permission', async () => {
    render(
      <BrowserRouter>
        <AuthContext.Provider
          value={{
            status: 'authenticated',
            user: { permissions: ['patient.view', 'patient.create', 'patient.update', 'patient.deactivate'] },
          }}
        >
          <PatientsPage />
        </AuthContext.Provider>
      </BrowserRouter>,
    );

    expect(await screen.findByText('Sara Tesfaye')).toBeInTheDocument();
    expect(screen.getByText('PAT-001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Register New Patient/i })).toBeInTheDocument();
  });

  test('PatientsPage hides Register button when patient.create is missing', async () => {
    render(
      <BrowserRouter>
        <AuthContext.Provider
          value={{
            status: 'authenticated',
            user: { permissions: ['patient.view'] },
          }}
        >
          <PatientsPage />
        </AuthContext.Provider>
      </BrowserRouter>,
    );

    expect(await screen.findByText('Sara Tesfaye')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register New Patient/i })).not.toBeInTheDocument();
  });

  test('PrescribersPage renders doctor directory and respects prescriber.create permission', async () => {
    render(
      <BrowserRouter>
        <AuthContext.Provider
          value={{
            status: 'authenticated',
            user: { permissions: ['prescriber.view', 'prescriber.create', 'prescriber.update'] },
          }}
        >
          <PrescribersPage />
        </AuthContext.Provider>
      </BrowserRouter>,
    );

    expect(await screen.findByText('Dr. Daniel Girma')).toBeInTheDocument();
    expect(screen.getByText('Internal Medicine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Prescriber/i })).toBeInTheDocument();
  });

  test('PrescriptionsPage renders prescriptions and shows New Prescription button', async () => {
    render(
      <BrowserRouter>
        <AuthContext.Provider
          value={{
            status: 'authenticated',
            user: { permissions: ['prescription.view', 'prescription.create', 'prescription.validate', 'prescription.cancel'] },
          }}
        >
          <PrescriptionsPage />
        </AuthContext.Provider>
      </BrowserRouter>,
    );

    expect(await screen.findByText('RX-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Prescription/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });
});
