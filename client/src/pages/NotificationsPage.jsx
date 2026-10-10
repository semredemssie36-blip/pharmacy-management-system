import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient.js';

function formatDateTime(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSeverityBadge(severity) {
  switch (severity) {
    case 'danger':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'info':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  // Filters & Pagination
  const [readFilter, setReadFilter] = useState('all'); // 'all', 'unread', 'read'
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('offset', (page - 1) * limit);

      if (readFilter === 'unread') params.append('isRead', '0');
      if (readFilter === 'read') params.append('isRead', '1');
      if (severityFilter) params.append('severity', severityFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await apiClient.get(`/notifications?${params.toString()}`);
      if (res?.data) {
        setNotifications(res.data.items || []);
        setTotal(res.data.total || 0);
        if (res.data.unreadCount !== undefined) {
          setUnreadCount(Number(res.data.unreadCount));
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, readFilter, severityFilter, search]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleMarkAsRead(id) {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setActionMessage('Notification marked as read.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to mark notification as read.');
    }
  }

  async function handleMarkAllAsRead() {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() })),
      );
      setUnreadCount(0);
      setActionMessage('All notifications marked as read.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to mark all as read.');
    }
  }

  async function handleScanAlerts() {
    try {
      setActionMessage('Scanning inventory & expiry thresholds...');
      const res = await apiClient.post('/notifications/scan-alerts');
      const data = res?.data || {};
      setActionMessage(
        `Scan complete: ${data.lowStockAlerts || 0} low-stock alerts, ${data.expiryAlerts || 0} expiry alerts generated.`,
      );
      fetchNotifications();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to run alert scan.');
    }
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            Notifications & User Alerts
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 rounded-full border border-rose-200">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            System alerts, pending approvals, stock warnings, and activity notifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScanAlerts}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors border border-slate-300 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Scan Alerts
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Action / Success Banner */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Read / Unread Filter Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => { setReadFilter('all'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              readFilter === 'all'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => { setReadFilter('unread'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              readFilter === 'unread'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => { setReadFilter('read'); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              readFilter === 'read'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Read
          </button>
        </div>

        {/* Severity & Search */}
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl">
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="danger">Danger</option>
            <option value="success">Success</option>
          </select>

          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search title, message, reference..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-2.5 top-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <svg
              className="animate-spin h-6 w-6 text-blue-600 mx-auto mb-2"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-12 h-12 mx-auto mb-3 text-slate-300">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">No notifications found</p>
            <p className="text-xs text-slate-400 mt-1">
              {readFilter !== 'all' || severityFilter || search
                ? 'Try adjusting your filters.'
                : 'You have no alerts at this time.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 transition-colors flex items-start gap-4 ${
                  !n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                {/* Status Dot */}
                <span
                  className={`mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    !n.is_read ? 'bg-blue-600 shadow-sm' : 'bg-transparent'
                  }`}
                />

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border capitalize font-medium ${getSeverityBadge(
                        n.severity,
                      )}`}
                    >
                      {n.severity}
                    </span>

                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {n.type.replace(/_/g, ' ')}
                    </span>

                    <span className="text-xs font-semibold text-slate-900">
                      {n.title}
                    </span>

                    {n.resource_reference && (
                      <span className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {n.resource_reference}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                    {n.message}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                    <span>Created: {formatDateTime(n.created_at)}</span>
                    {n.is_read && n.read_at && (
                      <span>Read: {formatDateTime(n.read_at)}</span>
                    )}
                    {n.action_url && (
                      <button
                        type="button"
                        onClick={() => navigate(n.action_url)}
                        className="text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-1"
                      >
                        View resource &rarr;
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!n.is_read && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(n.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded bg-white hover:bg-blue-50 border border-slate-200 transition-colors shadow-xs"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Showing {notifications.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
            {Math.min(page * limit, total)} of {total} notifications
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="font-medium text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
