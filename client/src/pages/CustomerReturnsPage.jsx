import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { customerReturnsApi } from '../features/returns/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function CustomerReturnsPage() {
  const { user, can } = useAuth();
  const hasPerm = (p) =>
    (typeof can === 'function' && can(p)) ||
    user?.permissions?.includes('*') ||
    (Array.isArray(user?.permissions) && user.permissions.includes(p));
  const canViewReturns = hasPerm('customer_return.view');

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
    if (!canViewReturns) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customerReturnsApi.list({
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
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load customer returns.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canViewReturns) {
      setLoading(false);
      return;
    }
    loadData();
  }, [statusFilter, startDate, endDate, page, canViewReturns]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  // Derived KPIs
  const totalDraft = returns.filter((r) => r.status === 'draft').length;
  const totalPendingInspection = returns.filter((r) => r.status === 'submitted' || r.status === 'pending_inspection').length;
  const totalApproved = returns.filter((r) => r.status === 'approved').length;
  const totalCompleted = returns.filter((r) => r.status === 'completed').length;

  if (!canViewReturns) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200/90 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xl mb-4 select-none">
          !
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500 mt-2">
          Your active account does not have authorization to view customer return logs.
        </p>
        <div className="mt-6">
          <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-xs transition">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Returns & Returned-Stock Disposition"
        subtitle="Traceable returned-medicine workflow with pharmacist inspection, disposition, and refund settlement"
        actions={
          <Can permission="customer_return.create">
            <Link
              to="/returns/customer/new"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Customer Return
            </Link>
          </Can>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Returns Listed"
          value={totalCount}
          subtitle="Customer return requests"
          icon="document"
          variant="default"
        />
        <SummaryCard
          title="Pending Inspection"
          value={totalPendingInspection}
          subtitle="Awaiting pharmacist assessment"
          icon="clock"
          variant="warning"
        />
        <SummaryCard
          title="Approved For Settlement"
          value={totalApproved}
          subtitle="Ready for stock disposition"
          icon="check"
          variant="info"
        />
        <SummaryCard
          title="Completed & Closed"
          value={totalCompleted}
          subtitle="Stock & refund settled"
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
              placeholder="Return #, Sale #, Customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Lifecycle Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="pending_inspection">Pending Inspection</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
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
          <div className="p-8 text-center text-slate-500">Loading customer returns...</div>
        ) : returns.length === 0 ? (
          <EmptyState
            title="No customer returns found"
            description="No return requests match the selected filters or search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Return Number</th>
                  <th className="px-4 py-3">Original Sale</th>
                  <th className="px-4 py-3">Customer / Branch</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3 text-right">Refund / Value</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <Link to={`/returns/customer/${ret.id}`} className="hover:text-emerald-600">
                        {ret.return_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900 font-medium">{ret.sale_number}</div>
                      <div className="text-xs text-slate-500">{ret.line_count} line items</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{ret.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-xs text-slate-400">{ret.branch_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(ret.return_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ret.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {ret.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {Number(ret.refund_amount || 0).toFixed(2)} ETB
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/returns/customer/${ret.id}`}
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
