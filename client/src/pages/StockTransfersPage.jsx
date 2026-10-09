import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { stockTransfersApi } from '../features/inventory/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasDiscrepancyFilter, setHasDiscrepancyFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await stockTransfersApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        hasDiscrepancy: hasDiscrepancyFilter ? hasDiscrepancyFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      });
      setTransfers(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load stock transfers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, hasDiscrepancyFilter, startDate, endDate, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('');
    setHasDiscrepancyFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  // KPIs
  const totalInTransit = transfers.filter((t) => t.status === 'in_transit' || t.status === 'partially_received').length;
  const totalDiscrepancies = transfers.filter((t) => Number(t.has_discrepancy) === 1 && !t.discrepancy_resolved).length;
  const totalCompleted = transfers.filter((t) => t.status === 'completed').length;
  const totalPendingAction = transfers.filter((t) => ['draft', 'submitted', 'approved'].includes(t.status)).length;

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Transfers Between Branches & Warehouses"
        subtitle="Manage inter-branch and inter-warehouse stock movements with multi-step dispatch and receipt verification"
        actions={
          <Can permission="stock_transfer.create">
            <Link
              to="/inventory/transfers/new"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Stock Transfer
            </Link>
          </Can>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Transfers"
          value={totalCount}
          subtitle="All recorded transfers"
          icon="document"
          variant="default"
        />
        <SummaryCard
          title="In Transit"
          value={totalInTransit}
          subtitle="Stock en-route between warehouses"
          icon="refresh"
          variant="warning"
        />
        <SummaryCard
          title="Pending Approval / Dispatch"
          value={totalPendingAction}
          subtitle="Drafts, submitted or approved"
          icon="clock"
          variant="primary"
        />
        <SummaryCard
          title="Discrepancies Flagged"
          value={totalDiscrepancies}
          subtitle="Damaged, short, or lost stock"
          icon="alert"
          variant="danger"
        />
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Search</label>
            <input
              type="text"
              placeholder="Search transfer # or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="in_transit">In Transit</option>
              <option value="partially_received">Partially Received</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Discrepancy</label>
            <select
              value={hasDiscrepancyFilter}
              onChange={(e) => {
                setHasDiscrepancyFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Transfers</option>
              <option value="true">Flagged Discrepancy Only</option>
              <option value="false">No Discrepancy</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-1 flex gap-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
              title="Search"
            >
              Filter
            </button>
          </div>
        </form>

        {(search || statusFilter || hasDiscrepancyFilter || startDate || endDate) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Filtered results active</span>
            <button
              onClick={handleResetFilters}
              className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadData} className="font-semibold underline ml-4">
            Retry
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
            <p className="text-sm font-medium">Loading stock transfers...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No Stock Transfers Found"
              description="No transfers match your current filter parameters or none have been recorded yet."
              action={
                <Can permission="stock_transfer.create">
                  <Link
                    to="/inventory/transfers/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    Create First Transfer
                  </Link>
                </Can>
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Transfer #</th>
                    <th className="px-4 py-3">Source Warehouse</th>
                    <th className="px-4 py-3">Destination Warehouse</th>
                    <th className="px-4 py-3 text-center">Lines / Qty</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {transfers.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/inventory/transfers/${item.id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-600 flex items-center gap-1.5"
                        >
                          {item.transfer_number}
                          {Number(item.has_discrepancy) === 1 && (
                            <span
                              title={item.discrepancy_resolved ? 'Discrepancy resolved' : 'Discrepancy pending resolution'}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.discrepancy_resolved
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800 animate-pulse'
                              }`}
                            >
                              {item.discrepancy_resolved ? 'RESOLVED' : 'DISCREPANCY'}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800">{item.source_warehouse_name}</div>
                        <div className="text-xs text-slate-400">{item.source_branch_name}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800">{item.destination_warehouse_name}</div>
                        <div className="text-xs text-slate-400">{item.destination_branch_name}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-medium text-slate-800">{item.total_items || 0} items</span>
                        <div className="text-xs text-slate-400">
                          Req: {Number(item.total_requested_quantity || 0)} | Disp: {Number(item.total_dispatched_quantity || 0)} | Rec: {Number(item.total_received_quantity || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-800">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                        </div>
                        <div className="text-xs text-slate-400">{item.created_by_name || 'System'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          to={`/inventory/transfers/${item.id}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                        >
                          View
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <div>
                  Showing Page <span className="font-bold">{page}</span> of{' '}
                  <span className="font-bold">{totalPages}</span> ({totalCount} total transfers)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
