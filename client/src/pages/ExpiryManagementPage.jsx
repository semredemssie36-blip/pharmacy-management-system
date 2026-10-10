import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { expiryApi } from '../features/inventory/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function ExpiryManagementPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [thresholdDays, setThresholdDays] = useState('30');
  const [branchFilter, setBranchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadBranches() {
    try {
      const res = await branchesApi.list();
      setBranches(res.data?.branches || res.data?.items || (Array.isArray(res.data) ? res.data : []));
    } catch {
      setBranches([]);
    }
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, batchRes] = await Promise.all([
        expiryApi.getSummary({ branchId: branchFilter || undefined }),
        expiryApi.listBatches({
          status: statusFilter || undefined,
          thresholdDays: thresholdDays || undefined,
          branchId: branchFilter || undefined,
          search: search.trim() || undefined,
          page,
          limit,
        }),
      ]);
      setSummary(sumRes.data || null);
      setBatches(batchRes.data?.items || []);
      setTotalCount(batchRes.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load expiry data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadData();
  }, [statusFilter, thresholdDays, branchFilter, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  async function handleSegregate(batch) {
    if (!window.confirm(`Segregate ${batch.available_stock || batch.total_stock} units of expired batch ${batch.batch_number} from available inventory?`)) {
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await expiryApi.segregateExpired({
        batchId: batch.batch_id,
        branchId: batch.branch_id,
        warehouseId: batch.warehouse_id,
      });
      setSuccessMsg(res.message || `Successfully segregated ${batch.batch_number} to expired status.`);
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to segregate expired stock.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Expiry Management & Monitoring"
        subtitle="Track expired and expiring-soon pharmaceuticals, isolate compromised inventory, and prevent unauthorized dispensing."
      />

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded text-sm">
          {successMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Expired Batches"
          value={summary ? summary.expired_batches_count : '—'}
          description="Past official expiry date"
          variant="danger"
        />
        <SummaryCard
          title="Expiring in 30 Days"
          value={summary ? summary.expiring_30_days_count : '—'}
          description="Immediate attention required"
          variant="warning"
        />
        <SummaryCard
          title="Expiring in 60 Days"
          value={summary ? summary.expiring_60_days_count : '—'}
          description="Medium-term monitoring"
          variant="info"
        />
        <SummaryCard
          title="Expiring in 90 Days"
          value={summary ? summary.expiring_90_days_count : '—'}
          description="Advisory planning window"
        />
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Search Product / Batch</label>
            <input
              type="text"
              placeholder="e.g. Paracetamol or BATCH-..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Monitored Batches</option>
              <option value="expired">Expired Only</option>
              <option value="near_expiry">Near Expiry Only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Warning Window</label>
            <select
              value={thresholdDays}
              onChange={(e) => { setThresholdDays(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="30">Within 30 Days</option>
              <option value="60">Within 60 Days</option>
              <option value="90">Within 90 Days</option>
              <option value="180">Within 180 Days</option>
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
              {(Array.isArray(branches) ? branches : []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading batch expiry records...</div>
        ) : batches.length === 0 ? (
          <EmptyState
            title="No Expiry Alerts"
            description="No batches match your selected expiry status and window filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Batch #</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Expiry Date</th>
                  <th className="px-4 py-3 text-center">Days Left</th>
                  <th className="px-4 py-3 text-right">Avail / Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => {
                  const days = Number(b.days_to_expiry);
                  const isExpired = days < 0;
                  const isCritical = !isExpired && days <= 30;

                  return (
                    <tr key={`${b.batch_id}-${b.branch_id || ''}-${b.warehouse_id || ''}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.product_name}</div>
                        <div className="text-xs text-slate-400">{b.product_code}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">{b.batch_number}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{b.branch_name || b.warehouse_name || 'All'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {b.expiry_date ? String(b.expiry_date).substring(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            isExpired
                              ? 'bg-rose-100 text-rose-800'
                              : isCritical
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isExpired ? `${Math.abs(days)}d Overdue` : `${days}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className="text-emerald-700 font-semibold">{Number(b.available_stock || 0)}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-slate-700">{Number(b.total_stock || 0)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {isExpired && Number(b.available_stock || 0) > 0 && (
                          <Can permission="quarantine.create">
                            <button
                              onClick={() => handleSegregate(b)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium rounded transition"
                              title="Segregate available expired stock into expired inventory status"
                            >
                              Segregate
                            </button>
                          </Can>
                        )}
                        <Can permission="quarantine.create">
                          <button
                            onClick={() => navigate(`/inventory/quarantines/new?batchId=${b.batch_id}&branchId=${b.branch_id || ''}&warehouseId=${b.warehouse_id || ''}`)}
                            className="px-2.5 py-1 text-xs border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-medium rounded transition"
                            title="Place suspicious or expiring batch into controlled quarantine hold"
                          >
                            Hold
                          </button>
                        </Can>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalCount > limit && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center text-sm text-slate-600">
            <div>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} batches
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
