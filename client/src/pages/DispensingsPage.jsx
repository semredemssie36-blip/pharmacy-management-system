import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { dispensingsApi } from '../features/clinical/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'stock_allocated', label: 'Stock Allocated' },
  { value: 'pending_verification', label: 'Pending Pharmacist Review' },
  { value: 'verified', label: 'Verified' },
  { value: 'payment_pending', label: 'Payment Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * DispensingsPage: Directory of dispensing transactions, status tracking,
 * clinical verification states, and initiation of new dispensings.
 */
export default function DispensingsPage() {
  const navigate = useNavigate();
  const [dispensings, setDispensings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadDispensings() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;

      const res = await dispensingsApi.list(params);
      setDispensings(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load dispensing records');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDispensings();
  }, [page, status]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadDispensings();
  }

  const draftCount = dispensings.filter((d) => d.status === 'draft').length;
  const allocatedCount = dispensings.filter((d) => d.status === 'stock_allocated').length;
  const pendingReviewCount = dispensings.filter((d) => d.status === 'pending_verification').length;
  const verifiedCount = dispensings.filter((d) => d.status === 'verified' || d.status === 'payment_pending').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispensing Operations"
        subtitle="Manage pharmacy dispensing orders, FEFO stock allocations, and pharmacist clinical verifications"
        breadcrumbs={[
          { label: 'Clinical', href: '/clinical/prescriptions' },
          { label: 'Dispensings' },
        ]}
        actions={
          <Can permission="dispensing.create">
            <Link
              to="/clinical/dispensings/new"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Dispensing Order
            </Link>
          </Can>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total In Queue"
          value={total}
          subtitle="All recorded dispensings"
          icon={
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <SummaryCard
          title="Stock Allocated"
          value={allocatedCount}
          subtitle="Batches reserved via FEFO"
          color="cyan"
          icon={
            <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <SummaryCard
          title="Pending Verification"
          value={pendingReviewCount}
          subtitle="Awaiting pharmacist review"
          color="amber"
          icon={
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <SummaryCard
          title="Verified / Payment Ready"
          value={verifiedCount}
          subtitle="Ready for payment completion"
          color="emerald"
          icon={
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by Dispensing #, Rx #, or Patient name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Status:</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 py-2 pl-3 pr-8 text-sm focus:border-emerald-500 focus:outline-none"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Dispensings Directory Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-2 text-sm">Loading dispensing orders...</p>
          </div>
        ) : dispensings.length === 0 ? (
          <EmptyState
            title="No Dispensing Orders Found"
            message={search || status ? 'No dispensing orders match your active search filters.' : 'No pharmacy dispensing orders created yet.'}
            action={
              <Can permission="dispensing.create">
                <Link
                  to="/clinical/dispensings/new"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                >
                  Create Dispensing Order
                </Link>
              </Can>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Dispensing #</th>
                  <th className="px-4 py-3">Prescription #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Warehouse / Branch</th>
                  <th className="px-4 py-3">Dispensing Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verification Details</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dispensings.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <Link
                        to={`/clinical/dispensings/${d.id}`}
                        className="text-emerald-700 hover:text-emerald-900 hover:underline"
                      >
                        {d.dispensing_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/clinical/prescriptions`}
                        className="font-mono text-xs text-slate-700 hover:underline"
                      >
                        {d.prescription_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {d.patient_first_name} {d.patient_last_name}
                      </div>
                      <div className="text-xs text-slate-500">MRN: {d.patient_mrn || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{d.warehouse_name || 'Primary'}</div>
                      <div className="text-xs text-slate-500">{d.branch_name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {d.dispensing_date ? new Date(d.dispensing_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {d.verified_by_name ? (
                        <div>
                          <span className="font-medium text-teal-800">Verified by:</span> {d.verified_by_name}
                          <div className="text-[11px] text-slate-400">
                            {new Date(d.verified_at).toLocaleString()}
                          </div>
                        </div>
                      ) : d.status === 'rejected' ? (
                        <span className="text-rose-700 font-medium truncate block max-w-xs" title={d.rejection_reason}>
                          Rejected: {d.rejection_reason}
                        </span>
                      ) : d.status === 'pending_verification' ? (
                        <span className="text-amber-700 font-medium">Awaiting Pharmacist</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/clinical/dispensings/${d.id}`}
                        className="inline-flex items-center rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        Manage Order
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} orders
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage(page + 1)}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
