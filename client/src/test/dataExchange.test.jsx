import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import GlobalSearchBar from '../components/GlobalSearchBar.jsx';
import DataExchangePage from '../pages/DataExchangePage.jsx';
import * as dataExchangeApi from '../features/dataExchange/api.js';

// Mock data exchange API
vi.mock('../features/dataExchange/api.js', () => ({
  globalSearch: vi.fn(),
  downloadImportTemplate: vi.fn(),
  previewImport: vi.fn(),
  commitImport: vi.fn(),
  getImportJobs: vi.fn(),
  exportCsv: vi.fn(),
}));

const mockAuthUser = {
  id: 1,
  username: 'admin',
  role: 'SYSTEM_ADMINISTRATOR',
  permissions: [
    'search.view',
    'data.import.view',
    'data.import.execute',
    'data.export.view',
    'data.export.execute',
    'report.sales.view',
    'report.inventory.view',
  ],
};

const renderWithAuth = (component, authState = { user: mockAuthUser, hasPermission: () => true }) => {
  return render(
    <AuthContext.Provider value={authState}>
      <MemoryRouter>
        {component}
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

describe('Task 22: Global Search and Data Exchange UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GlobalSearchBar Component', () => {
    it('renders global search input with accessible placeholder and shortcut', () => {
      renderWithAuth(<GlobalSearchBar />);
      const input = screen.getByPlaceholderText(/global search/i);
      expect(input).toBeInTheDocument();
    });

    it('performs debounced search and displays grouped results', async () => {
      dataExchangeApi.globalSearch.mockResolvedValueOnce({
        totalMatches: 2,
        results: {
          products: [
            {
              id: 10,
              title: 'Amoxicillin 500mg',
              subtitle: 'Code: AMOX-01 | Generic: Amoxicillin',
              badge: 'Product',
              route: '/products',
            },
          ],
          suppliers: [
            {
              id: 20,
              title: 'Ethiopian Pharmaceuticals SC',
              subtitle: 'Code: EPS-001',
              badge: 'Supplier',
              route: '/procurement/suppliers',
            },
          ],
        },
      });

      renderWithAuth(<GlobalSearchBar />);
      const input = screen.getByPlaceholderText(/global search/i);

      fireEvent.change(input, { target: { value: 'Amox' } });

      await waitFor(() => {
        expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument();
        expect(screen.getByText('Ethiopian Pharmaceuticals SC')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('displays no results notice when search finds no items', async () => {
      dataExchangeApi.globalSearch.mockResolvedValueOnce({
        totalMatches: 0,
        results: {},
      });

      renderWithAuth(<GlobalSearchBar />);
      const input = screen.getByPlaceholderText(/global search/i);

      fireEvent.change(input, { target: { value: 'UnmatchedQuery123' } });

      await waitFor(() => {
        expect(screen.getByText(/no records found matching/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('DataExchangePage Component', () => {
    beforeEach(() => {
      dataExchangeApi.getImportJobs.mockResolvedValue({
        items: [
          {
            id: 1,
            job_uuid: 'job-12345',
            import_type: 'products',
            original_filename: 'catalog.csv',
            status: 'completed',
            total_rows: 50,
            successful_rows: 50,
            skipped_rows: 0,
            failed_rows: 0,
            started_at: '2026-10-10T08:00:00Z',
            completed_at: '2026-10-10T08:01:00Z',
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('renders tabs for Data Import and Data Export, and job audit log', async () => {
      renderWithAuth(<DataExchangePage />);
      expect(screen.getByText('Data Import & Export Center')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Data Import' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Data Export' })).toBeInTheDocument();
      expect(screen.getByText('Import Job Audit Log')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('catalog.csv')).toBeInTheDocument();
        expect(screen.getByText('job-12345')).toBeInTheDocument();
      });
    });

    it('allows selecting entity type and triggers template download', async () => {
      dataExchangeApi.downloadImportTemplate.mockResolvedValueOnce();

      renderWithAuth(<DataExchangePage />);
      expect(screen.getByText('Products Master')).toBeInTheDocument();

      // Click Suppliers Directory entity card
      const suppliersCard = screen.getByText('Suppliers Directory');
      fireEvent.click(suppliersCard);

      expect(screen.getByText(/Template Specifications: Suppliers Directory/i)).toBeInTheDocument();

      const downloadBtn = screen.getByRole('button', { name: /Download CSV Template/i });
      fireEvent.click(downloadBtn);

      expect(dataExchangeApi.downloadImportTemplate).toHaveBeenCalledWith('suppliers');
    });

    it('previews uploaded CSV and reports row-level errors', async () => {
      const originalFileReader = window.FileReader;
      const csvMockData = 'code,name,prescription_classification\nAMOX-01,Amoxicillin,prescription\nAMOX-02,,prescription';
      window.FileReader = class {
        readAsText() {
          this.onload({ target: { result: csvMockData } });
        }
      };

      dataExchangeApi.previewImport.mockResolvedValueOnce({
        importType: 'products',
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 0,
        isValid: false,
        rows: [
          { rowNumber: 2, data: { code: 'AMOX-01', name: 'Amoxicillin' }, action: 'create', isValid: true, errors: [] },
          { rowNumber: 3, data: { code: 'AMOX-02', name: '' }, action: 'create', isValid: false, errors: ['Field "name" is required'] },
        ],
      });

      renderWithAuth(<DataExchangePage />);

      // Create a mock file and simulate change
      const file = new File([csvMockData], 'test.csv', { type: 'text/csv' });
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Click Validate & Preview button once enabled
      const validateBtn = screen.getByRole('button', { name: /Validate & Preview/i });
      await waitFor(() => {
        expect(validateBtn).not.toBeDisabled();
      });
      fireEvent.click(validateBtn);

      await waitFor(() => {
        expect(screen.getByText('Valid Rows')).toBeInTheDocument();
        expect(screen.getByText('Invalid Rows')).toBeInTheDocument();
        expect(screen.getByText('Field "name" is required')).toBeInTheDocument();
        expect(screen.getByText(/Fix all 1 validation errors/i)).toBeInTheDocument();
      });

      // Commit button should be disabled because invalidRows > 0
      const commitBtn = screen.getByRole('button', { name: /Commit 1 Records \(Atomic\)/i });
      expect(commitBtn).toBeDisabled();

      window.FileReader = originalFileReader;
    });

    it('switches to Export tab and shows supported export modules', async () => {
      renderWithAuth(<DataExchangePage />);

      const exportTab = screen.getByRole('button', { name: 'Data Export' });
      fireEvent.click(exportTab);

      expect(screen.getByText('Products Catalog')).toBeInTheDocument();
      expect(screen.getByText('Inventory Stock Snapshot')).toBeInTheDocument();
      expect(screen.getByText('Sales Transactions')).toBeInTheDocument();
      expect(screen.getByText('Suppliers Directory')).toBeInTheDocument();
    });
  });
});
