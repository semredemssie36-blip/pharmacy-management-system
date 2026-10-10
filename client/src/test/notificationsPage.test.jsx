import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AuthContext } from '../features/auth/AuthContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';

const { mockNotifications } = vi.hoisted(() => ({
  mockNotifications: [
    {
      id: 1,
      type: 'approval_pending',
      title: 'Pending Approval: Sales Discount Override',
      message: 'Approval request APR-2026-0001 requires your attention.',
      severity: 'warning',
      resource_type: 'approval_request',
      resource_id: 10,
      resource_reference: 'APR-2026-0001',
      action_url: '/approvals',
      is_read: false,
      read_at: null,
      created_at: '2026-10-10T08:00:00Z',
    },
    {
      id: 2,
      type: 'stock_low',
      title: 'Low Stock Warning: Amoxicillin 500mg',
      message: 'Product Amoxicillin has 12 units remaining (reorder level: 50).',
      severity: 'danger',
      resource_type: 'product',
      resource_id: 25,
      resource_reference: 'AMX-500',
      action_url: '/inventory/stock',
      is_read: true,
      read_at: '2026-10-10T08:30:00Z',
      created_at: '2026-10-10T07:30:00Z',
    },
  ],
}));

vi.mock('../services/apiClient.js', () => ({
  default: {
    get: vi.fn((path) => {
      if (path.includes('/notifications/unread-count') || path.includes('/notifications/unread')) {
        return Promise.resolve({ success: true, data: { unreadCount: 1 } });
      }
      if (path.startsWith('/notifications')) {
        return Promise.resolve({
          success: true,
          data: {
            items: mockNotifications,
            total: 2,
            unreadCount: 1,
            limit: 15,
            offset: 0,
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    }),
    patch: vi.fn((path) => {
      if (path.includes('/read-all')) {
        return Promise.resolve({ success: true, data: { markedCount: 1, unreadCount: 0 } });
      }
      return Promise.resolve({ success: true, data: { is_read: true, read_at: new Date().toISOString() } });
    }),
    post: vi.fn(() => Promise.resolve({ success: true, data: { lowStockAlerts: 1, expiryAlerts: 0 } })),
  },
}));

function renderWithProviders(ui) {
  const authValue = {
    user: { id: 1, name: 'Admin User', email: 'admin@pharmacy.et' },
    hasPermission: () => true,
    hasAnyPermission: () => true,
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>,
  );
}

describe('Task 20: NotificationBell & NotificationsPage Frontend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders NotificationBell with unread badge and opens popover on click', async () => {
    renderWithProviders(<NotificationBell />);

    // Unread badge should display '1'
    const badge = await screen.findByText('1');
    expect(badge).toBeInTheDocument();

    // Click bell icon
    const bellBtn = screen.getByRole('button', { name: /unread notification/i });
    fireEvent.click(bellBtn);

    // Popover opens
    await waitFor(() => {
      expect(screen.getByText('Pending Approval: Sales Discount Override')).toBeInTheDocument();
      expect(screen.getByText('View all notifications →')).toBeInTheDocument();
    });
  });

  it('marks single notification as read inside NotificationBell popover', async () => {
    renderWithProviders(<NotificationBell />);

    const bellBtn = await screen.findByRole('button', { name: /unread notification/i });
    fireEvent.click(bellBtn);

    const markReadBtn = await screen.findByTitle('Mark as read');
    fireEvent.click(markReadBtn);

    // Patch should be called
    const apiClient = (await import('../services/apiClient.js')).default;
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/1/read');
  });

  it('renders NotificationsPage with filter toolbar, items list, and severity badges', async () => {
    renderWithProviders(<NotificationsPage />);

    // Header
    expect(await screen.findByText(/Notifications & User Alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unread/i)).toBeInTheDocument();

    // Table / list items
    expect(screen.getByText('Pending Approval: Sales Discount Override')).toBeInTheDocument();
    expect(screen.getByText('Low Stock Warning: Amoxicillin 500mg')).toBeInTheDocument();

    // Severity badges
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('danger')).toBeInTheDocument();

    // Action url links
    const viewLinks = screen.getAllByText(/View resource/i);
    expect(viewLinks.length).toBeGreaterThan(0);
  });

  it('allows marking a notification as read on NotificationsPage', async () => {
    renderWithProviders(<NotificationsPage />);

    const markBtn = await screen.findByRole('button', { name: /Mark read/i });
    fireEvent.click(markBtn);

    const apiClient = (await import('../services/apiClient.js')).default;
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/1/read');
  });

  it('supports Scan Alerts action on NotificationsPage', async () => {
    renderWithProviders(<NotificationsPage />);

    const scanBtn = await screen.findByRole('button', { name: /Scan Alerts/i });
    fireEvent.click(scanBtn);

    const apiClient = (await import('../services/apiClient.js')).default;
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/scan-alerts');
  });
});
