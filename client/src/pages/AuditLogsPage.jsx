import { useState, useEffect, useContext } from 'react';
import { auditApi } from '../features/audit/api.js';
import { AuthContext } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { LockIcon } from '../components/common/Icons.jsx';

export default function AuditLogsPage() {
  const { user } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stats KPI state
  const [stats, setStats] = useState({
    totalEvents: 0,
    failedEvents: 0,
    securityEvents: 0,
    inventoryEvents: 0,
    financialEvents: 0,
  });

  // Filter state
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Export State
  const [exporting, setExporting] = useState(false);

  async function loadStats() {
    try {
      const res = await auditApi.getStats();
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      // Non-critical metric failure
      console.warn('Failed to load audit stats:', err);
    }
  }

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = {
        search: search.trim() || undefined,
        action: actionFilter || undefined,
        resourceType: resourceTypeFilter || undefined,
        outcome: outcomeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit,
      };

      const res = await auditApi.list(params);
      const items = res.data?.items || [];
      setLogs(items);
      setTotalCount(res.data?.pagination?.total || 0);
      setTotalPages(res.data?.pagination?.totalPages || 1);
    } catch (err) {
      setError(err?.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [actionFilter, resourceTypeFilter, outcomeFilter, fromDate, toDate, page, limit]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadLogs();
  }

  function handleResetFilters() {
    setSearch('');
    setActionFilter('');
    setResourceTypeFilter('');
    setOutcomeFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  async function handleOpenDetail(id) {
    setDetailLoading(true);
    setDetailModalOpen(true);
    try {
      const res = await auditApi.get(id);
      setSelectedLog(res.data);
    } catch (err) {
      setError('Failed to fetch event detail: ' + err.message);
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await auditApi.exportCsv({
        search: search.trim() || undefined,
        action: actionFilter || undefined,
        resourceType: resourceTypeFilter || undefined,
        outcome: outcomeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 1000,
      });
    } catch (err) {
      alert('Export failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  }

  function formatTimestamp(isoStr) {
    if (!isoStr) return '—';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString();
    } catch {
      return isoStr;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Audit Trail & Activity History"
        subtitle="Immutable ledger of sensitive operations, data mutations, security access, and approvals"
        actions={
          <Can permission="audit.export">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <svg className="w-4 h-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </Can>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="Total Events"
          value={stats.totalEvents.toLocaleString()}
          subtitle="Scoped audit volume"
          variant="default"
        />
        <SummaryCard
          title="Security Actions"
          value={stats.securityEvents.toLocaleString()}
          subtitle="Logins, auth & RBAC"
          variant="indigo"
        />
        <SummaryCard
          title="Inventory Changes"
          value={stats.inventoryEvents.toLocaleString()}
          subtitle="Counts, holds, recalls"
          variant="blue"
        />
        <SummaryCard
          title="Financial Events"
          value={stats.financialEvents.toLocaleString()}
          subtitle="Sales, refunds, approvals"
          variant="emerald"
        />
        <SummaryCard
          title="Failed Attempts"
          value={stats.failedEvents.toLocaleString()}
          subtitle="Security & auth failures"
          variant={stats.failedEvents > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            {/* Search Input */}
            <div className="sm:col-span-2">
              <label htmlFor="audit-search" className="block text-xs font-medium text-slate-700">Search Reference / Keyword</label>
              <input
                id="audit-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by reference, user or reason..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Action Filter */}
            <div>
              <label htmlFor="action-filter" className="block text-xs font-medium text-slate-700">Action / Event</label>
              <input
                id="action-filter"
                type="text"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. auth.login, sale.completed"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Resource Type */}
            <div>
              <label htmlFor="resource-type-filter" className="block text-xs font-medium text-slate-700">Resource Type</label>
              <select
                id="resource-type-filter"
                value={resourceTypeFilter}
                onChange={(e) => {
                  setResourceTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All Resources</option>
                <option value="auth">Authentication</option>
                <option value="product">Product Master</option>
                <option value="stock_count">Stock Count</option>
                <option value="quarantine">Quarantine</option>
                <option value="recall">Recall</option>
                <option value="approval_request">Approval Request</option>
                <option value="sale">Sale Order</option>
                <option value="payment">Payment & Settlement</option>
                <option value="customer_return">Customer Return</option>
                <option value="supplier_return">Supplier Return</option>
              </select>
            </div>

            {/* Outcome */}
            <div>
              <label htmlFor="outcome-filter" className="block text-xs font-medium text-slate-700">Outcome</label>
              <select
                id="outcome-filter"
                value={outcomeFilter}
                onChange={(e) => {
                  setOutcomeFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All Outcomes</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </div>

            {/* Date Range: From */}
            <div>
              <label htmlFor="from-date" className="block text-xs font-medium text-slate-700">From Date</label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <label htmlFor="to-date" className="text-xs font-medium text-slate-700">To Date:</label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Filter
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Error loading audit records</p>
          <p>{error}</p>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-slate-500">
              <svg className="h-6 w-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Loading audit logs...</span>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No audit records found"
            description="No logged activities match your filter criteria or authorized organization scope."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Branch / Location</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={log.outcome === 'success' ? 'active' : 'inactive'}
                        label={log.outcome === 'success' ? 'Success' : 'Failure'}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="capitalize">{log.resource_type?.replace(/_/g, ' ')}</span>
                      {log.resource_id && (
                        <span className="ml-1 text-xs text-slate-400">#{log.resource_id}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                      {log.resource_reference || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>
                        <div className="font-medium text-slate-900">{log.actor_name || 'System / Unauth'}</div>
                        {log.actor_email && (
                          <div className="text-xs text-slate-500">{log.actor_email}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.branch_name ? (
                        <span>{log.branch_name} {log.warehouse_name ? `(${log.warehouse_name})` : ''}</span>
                      ) : (
                        <span className="text-slate-400">Organization-wide</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(log.id)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div>
            Showing <span className="font-semibold">{logs.length}</span> of{' '}
            <span className="font-semibold">{totalCount}</span> events (Page{' '}
            <span className="font-semibold">{page}</span> of{' '}
            <span className="font-semibold">{totalPages}</span>)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Event Detail Inspection Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Audit Event #{selectedLog?.id}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedLog?.created_at ? formatTimestamp(selectedLog.created_at) : 'Loading...'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {detailLoading || !selectedLog ? (
              <div className="flex h-48 items-center justify-center text-slate-500">
                <span>Loading event details...</span>
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                {/* Meta summary badges */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 block">Action</span>
                    <span className="font-semibold font-mono text-slate-800">{selectedLog.action}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Outcome</span>
                    <StatusBadge
                      status={selectedLog.outcome === 'success' ? 'active' : 'inactive'}
                      label={selectedLog.outcome === 'success' ? 'Success' : 'Failure'}
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block">Resource Type</span>
                    <span className="font-semibold capitalize text-slate-800">{selectedLog.resource_type}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Reference</span>
                    <span className="font-mono font-semibold text-slate-800">{selectedLog.resource_reference || 'N/A'}</span>
                  </div>
                </div>

                {/* Actor & Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Actor Identity</h4>
                    <p className="font-medium text-slate-900">{selectedLog.actor_name || 'System / Anonymous'}</p>
                    {selectedLog.actor_email && <p className="text-xs text-slate-500">{selectedLog.actor_email}</p>}
                    {selectedLog.ip_address && <p className="text-xs text-slate-400 mt-1">IP: {selectedLog.ip_address}</p>}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Location & Scope</h4>
                    <p className="font-medium text-slate-900">{selectedLog.organization_name || `Org #${selectedLog.organization_id}`}</p>
                    <p className="text-xs text-slate-600">
                      {selectedLog.branch_name ? `Branch: ${selectedLog.branch_name}` : 'Organization-Wide Scope'}
                    </p>
                    {selectedLog.warehouse_name && (
                      <p className="text-xs text-slate-500">Warehouse: {selectedLog.warehouse_name}</p>
                    )}
                  </div>
                </div>

                {/* Reason / Justification */}
                {selectedLog.reason && (
                  <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 text-sm">
                    <span className="block font-semibold text-amber-800 text-xs uppercase mb-1">Reason / Justification</span>
                    <p className="text-amber-900">{selectedLog.reason}</p>
                  </div>
                )}

                {/* Before / After State Diff */}
                {(selectedLog.before_values || selectedLog.after_values) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      State Mutation Diff
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                        <span className="block text-xs font-bold text-red-700 mb-2">Previous State (Before)</span>
                        <pre className="text-xs font-mono text-slate-800 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.before_values, null, 2) || 'None'}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                        <span className="block text-xs font-bold text-emerald-700 mb-2">New State (After)</span>
                        <pre className="text-xs font-mono text-slate-800 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.after_values, null, 2) || 'None'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Details & Metadata */}
                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Metadata & Execution Context
                    </h4>
                    <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs font-mono text-emerald-400 overflow-x-auto">
                      <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {/* Immutability Notice */}
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-600">
                  <LockIcon className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    This audit entry is permanently immutable and cannot be updated or deleted from the operational application.
                  </span>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
