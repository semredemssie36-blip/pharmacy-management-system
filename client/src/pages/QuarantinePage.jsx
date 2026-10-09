import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quarantineApi } from '../features/inventory/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function QuarantinePage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadBranches() {
    try {
      const res = await branchesApi.list();
      setBranches(res.data?.items || res.data || []);
    } catch {
      // Non-blocking
    }
  }

  async function loadCases() {
    setLoading(true);
    setError(null);
    try {
      const res = await quarantineApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        reason: reasonFilter || undefined,
        branchId: branchFilter || undefined,
        page,
        limit,
      });
      setCases(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load quarantine cases.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadCases();
  }, [statusFilter, reasonFilter, branchFilter, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadCases();
  }

  const formatReason = (r) => {
    if (!r) return '—';
    return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Quarantine Holds"
          subtitle="Manage controlled isolation holds on suspicious, damaged, or regulatory-flagged inventory."
        />
        <Can permission="quarantine.create">
          <button
            onClick={() => navigate('/inventory/quarantines/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            <span>+</span> Place Stock On Hold
          </button>
        </Can>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Search Case / Batch / Product</label>
            <input
              type="text"
              placeholder="e.g. QRN-..., Batch #, or Drug name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="quarantined">Quarantined (Active Hold)</option>
              <option value="under_review">Under Review</option>
              <option value="released">Released to Available</option>
              <option value="disposed">Disposed (Written Off)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Reason</label>
            <select
              value={reasonFilter}
              onChange={(e) => { setReasonFilter(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Reasons</option>
              <option value="suspected_quality_defect">Suspected Quality Defect</option>
              <option value="contamination_or_damage">Contamination or Damage</option>
              <option value="temperature_excursion">Temperature Excursion</option>
              <option value="suspected_counterfeit">Suspected Counterfeit</option>
              <option value="customer_complaint">Customer Complaint</option>
              <option value="expiry_investigation">Expiry Investigation</option>
              <option value="supplier_notification">Supplier Notification</option>
              <option value="recall_investigation">Recall Investigation</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Cases Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading quarantine cases...</div>
        ) : cases.length === 0 ? (
          <EmptyState
            title="No Quarantine Holds"
            description="No quarantine records match your search criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Case #</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Batch #</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-right">Hold Qty</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium text-indigo-600">
                      <Link to={`/inventory/quarantines/${c.id}`} className="hover:underline">
                        {c.case_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.product_name}</div>
                      <div className="text-xs text-slate-400">{c.product_code}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{c.batch_number}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{c.branch_name || c.warehouse_name || '—'}</div>
                      {c.storage_location_name && (
                        <div className="text-xs text-slate-400">{c.storage_location_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {Number(c.quantity)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatReason(c.reason)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
                      <div className="text-slate-400">{c.created_by_name || 'System'}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/inventory/quarantines/${c.id}`}
                        className="px-2.5 py-1 text-xs border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium rounded transition"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalCount > limit && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm text-slate-600">
            <div>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} cases
            </div>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= totalCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40"
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
