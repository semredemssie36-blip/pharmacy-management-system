import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supplierReturnsApi } from '../features/returns/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function SupplierReturnsPage() {
  const { user } = useAuth();

  const [returns, setReturns] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await supplierReturnsApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 25,
      });
      setReturns(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load supplier returns.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, startDate, endDate, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  const totalDraft = returns.filter((r) => r.status === 'draft').length;
  const totalApproved = returns.filter((r) => r.status === 'approved').length;
  const totalCompleted = returns.filter((r) => r.status === 'completed').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Returns & Stock Dispatch"
        subtitle="Return defective, near-expiry, or recalled batches against original goods receipts"
        actions={
          <Can permission="supplier_return.create">
            <Link
              to="/returns/supplier/new"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Supplier Return
            </Link>
          </Can>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Supplier Returns"
          value={totalCount}
          subtitle="Orders logged"
          icon="document"
          variant="default"
        />
        <SummaryCard
          title="Draft Orders"
          value={totalDraft}
          subtitle="Being assembled"
          icon="clock"
          variant="warning"
        />
        <SummaryCard
          title="Approved For Dispatch"
          value={totalApproved}
          subtitle="Ready for physical deduction"
          icon="check"
          variant="info"
        />
        <SummaryCard
          title="Completed & Dispatched"
          value={totalCompleted}
          subtitle="Stock deducted & ledger updated"
          icon="check-circle"
          variant="success"
        />
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Return #, Receipt #, Supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading supplier returns...</div>
        ) : returns.length === 0 ? (
          <EmptyState
            title="No supplier returns found"
            description="No return orders match the selected filters or search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Return Number</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Goods Receipt</th>
                  <th className="px-4 py-3">Branch / Warehouse</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Order Value</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <Link to={`/returns/supplier/${ret.id}`} className="hover:text-emerald-600">
                        {ret.return_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {ret.supplier_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-800">{ret.receipt_number}</span>
                      <span className="text-xs text-slate-400 block">{ret.line_count} line items</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {ret.branch_name} • {ret.warehouse_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(ret.return_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ret.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {Number(ret.total_amount || 0).toFixed(2)} ETB
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/returns/supplier/${ret.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
