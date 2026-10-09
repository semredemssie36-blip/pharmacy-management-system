import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { recallsApi } from '../features/inventory/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function RecallsPage() {
  const navigate = useNavigate();
  const [recalls, setRecalls] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadRecalls() {
    setLoading(true);
    setError(null);
    try {
      const res = await recallsApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        page,
        limit,
      });
      setRecalls(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load recall cases.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecalls();
  }, [statusFilter, severityFilter, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadRecalls();
  }

  const formatReason = (r) => {
    if (!r) return '—';
    return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Product Recalls"
          subtitle="Enterprise safety coordination, multi-batch containment holds, and supply-chain traceability."
        />
        <Can permission="recall.create">
          <button
            onClick={() => navigate('/inventory/recalls/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            <span>+</span> Initiate Product Recall
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
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Search Recall / Title / Notes</label>
            <input
              type="text"
              placeholder="e.g. RCL-... or Product name"
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
              <option value="draft">Draft</option>
              <option value="under_review">Under Review</option>
              <option value="active">Active (Enforced Hold)</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved & Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              className="w-full text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical (Class I)</option>
              <option value="high">High (Class II)</option>
              <option value="medium">Medium (Class III)</option>
              <option value="low">Low (Advisory)</option>
            </select>
          </div>
        </form>
      </div>

      {/* Recalls Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading product recall cases...</div>
        ) : recalls.length === 0 ? (
          <EmptyState
            title="No Product Recalls"
            description="No recall cases match your selected filter criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Recall #</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-center">Severity</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-center">Batches</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Initiated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recalls.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium text-rose-600">
                      <Link to={`/inventory/recalls/${r.id}`} className="hover:underline">
                        {r.recall_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.title}</div>
                      <div className="text-xs text-slate-400 truncate max-w-xs">{r.initiating_party || 'Internal Safety Team'}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.severity} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatReason(r.reason)}</td>
                    <td className="px-4 py-3 text-center font-mono font-medium text-slate-800">
                      {r.batches_count || 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</div>
                      <div className="text-slate-400">{r.created_by_name || 'System'}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/inventory/recalls/${r.id}`}
                        className="px-2.5 py-1 text-xs border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium rounded transition"
                      >
                        View Details
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
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} recalls
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
