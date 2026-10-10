import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { stockCountsApi } from '../features/inventory/api.js';
import { warehousesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function StockCountsPage() {
  const [counts, setCounts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [countTypeFilter, setCountTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadWarehouses() {
    try {
      const res = await warehousesApi.list();
      const list = res.data?.warehouses || res.data?.items || (Array.isArray(res.data) ? res.data : []);
      setWarehouses(Array.isArray(list) ? list : []);
    } catch {
      setWarehouses([]);
    }
  }

  async function loadCounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await stockCountsApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        warehouseId: warehouseFilter || undefined,
        countType: countTypeFilter || undefined,
        page,
        limit,
      });
      setCounts(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load stock count sessions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    loadCounts();
  }, [statusFilter, warehouseFilter, countTypeFilter, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadCounts();
  }

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('');
    setWarehouseFilter('');
    setCountTypeFilter('');
    setPage(1);
  }

  // KPIs
  const totalActive = counts.filter((c) => ['draft', 'in_progress'].includes(c.status)).length;
  const totalPendingReview = counts.filter((c) => ['submitted', 'pending_review', 'pending_approval'].includes(c.status)).length;
  const totalDiscrepancies = counts.filter((c) => Number(c.discrepancy_lines_count) > 0).length;
  const totalCompleted = counts.filter((c) => c.status === 'completed').length;

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Counts & Inventory Adjustments"
        subtitle="Perform physical cycle counts, verify variances, investigate discrepancies, and apply authorized stock adjustments"
        actions={
          <Can permission="stock_count.create">
            <Link
              to="/inventory/stock-counts/new"
              className="inline-flex items-center px-4 py-2 rounded-xl shadow-xs text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
            >
              + New Stock Count Session
            </Link>
          </Can>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Active Sessions"
          value={totalActive}
          subtitle="Draft or in-progress counts"
          color="blue"
        />
        <SummaryCard
          title="Pending Review / Approval"
          value={totalPendingReview}
          subtitle="Awaiting supervisor signoff"
          color="amber"
        />
        <SummaryCard
          title="With Discrepancies"
          value={totalDiscrepancies}
          subtitle="Sessions flagged with variance"
          color="rose"
        />
        <SummaryCard
          title="Completed & Adjusted"
          value={totalCompleted}
          subtitle="Stock reconciled & posted"
          color="emerald"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by count number, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Warehouse</label>
            <select
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
            >
              <option value="">All Warehouses</option>
              {(warehouses || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Count Scope</label>
            <select
              value={countTypeFilter}
              onChange={(e) => {
                setCountTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
            >
              <option value="">All Types</option>
              <option value="full">Full Warehouse</option>
              <option value="location">Storage Location</option>
              <option value="product">Specific Products</option>
              <option value="batch">Specific Batches</option>
            </select>
          </div>
        </form>

        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
          >
            Reset Filters
          </button>
          <button
            type="button"
            onClick={handleSearchSubmit}
            className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-xs transition"
          >
            Search
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg border border-slate-200">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading stock count sessions...</div>
        ) : counts.length === 0 ? (
          <EmptyState
            title="No stock counts found"
            message="No stock count sessions match your search or filter criteria. Start a new stock count session to conduct an inventory audit."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Count # / Scope
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Warehouse & Branch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Discrepancies
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Created By & Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {counts.map((c) => {
                  const totalLines = Number(c.total_lines_count || 0);
                  const countedLines = Number(c.counted_lines_count || 0);
                  const discLines = Number(c.discrepancy_lines_count || 0);
                  const pct = totalLines > 0 ? Math.round((countedLines / totalLines) * 100) : 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          to={`/inventory/stock-counts/${c.id}`}
                          className="text-sm font-semibold text-indigo-600 hover:text-indigo-900 block"
                        >
                          {c.count_number}
                        </Link>
                        <span className="inline-block px-2 py-0.5 mt-1 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize">
                          {c.count_type} Count
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        <div className="font-medium">{c.warehouse_name}</div>
                        <div className="text-xs text-slate-500">{c.branch_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div>
                          {countedLines} of {totalLines} lines ({pct}%)
                        </div>
                        <div className="w-24 bg-slate-200 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              pct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {discLines > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                            {discLines} Variance{discLines > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">None detected</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        <div>{c.created_by_name || 'System'}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(c.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/inventory/stock-counts/${c.id}`}
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-lg font-medium transition"
                        >
                          View Details →
                        </Link>
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
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-slate-200 sm:px-6">
            <div className="text-sm text-slate-700">
              Showing page <span className="font-medium">{page}</span> of{' '}
              <span className="font-medium">{totalPages}</span> ({totalCount} total sessions)
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
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
