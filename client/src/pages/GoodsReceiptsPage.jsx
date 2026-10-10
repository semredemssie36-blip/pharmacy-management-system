import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { goodsReceiptsApi } from '../features/procurement/api.js';
import { branchesApi, warehousesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { ReceiptIcon, ClockIcon, CheckCircleIcon, WarningIcon, BoxIcon } from '../components/common/Icons.jsx';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'receiving', label: 'Receiving' },
  { value: 'completed', label: 'Completed' },
  { value: 'discrepancy', label: 'Discrepancy' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * GoodsReceiptsPage: Master directory for Goods Receiving and Stock Intake.
 */
function GoodsReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Stats computed from loaded data or API
  const [stats, setStats] = useState({ total: 0, completed: 0, inProgress: 0, discrepancy: 0 });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;
      if (branchId) params.branchId = branchId;
      if (warehouseId) params.warehouseId = warehouseId;

      const res = await goodsReceiptsApi.list(params);
      const items = res.data.items || [];
      setReceipts(items);
      setTotal(res.data.total || 0);

      // Compute summary stats from items
      const completedCount = items.filter((r) => r.status === 'completed').length;
      const inProgressCount = items.filter((r) => ['draft', 'receiving'].includes(r.status)).length;
      const discrepancyCount = items.filter((r) => r.status === 'discrepancy').length;

      setStats({
        total: res.data.total || 0,
        completed: completedCount,
        inProgress: inProgressCount,
        discrepancy: discrepancyCount,
      });
    } catch (err) {
      setError(err.message || 'Failed to load goods receipts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    branchesApi.list().then((res) => setBranches(res.data.branches || [])).catch(() => setBranches([]));
    warehousesApi.list().then((res) => setWarehouses(res.data.warehouses || [])).catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  function handleResetFilters() {
    setSearch('');
    setStatus('');
    setBranchId('');
    setWarehouseId('');
    setPage(1);
    // Reload will trigger via page change if not already 1
    if (page === 1) {
      goodsReceiptsApi.list({ page: 1, limit }).then((res) => {
        setReceipts(res.data.items || []);
        setTotal(res.data.total || 0);
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const filteredWarehouses = branchId
    ? warehouses.filter((w) => String(w.branch_id) === String(branchId))
    : warehouses;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Goods Receiving & Stock Intake"
        subtitle="Manage and track incoming pharmaceutical shipments against approved Purchase Orders"
        actions={
          <Can permission="goods_receipt.create">
            <Link
              to="/procurement/goods-receipts/new"
              data-testid="new-goods-receipt-button"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-all"
            >
              <span>+</span> New Goods Receipt
            </Link>
          </Can>
        }
      />

      {/* Summary metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Receipts"
          value={stats.total}
          subtitle="All recorded receipts"
          icon={<ReceiptIcon className="w-5 h-5 text-slate-600" />}
          tone="slate"
        />
        <SummaryCard
          title="In Progress"
          value={stats.inProgress}
          subtitle="Draft or currently receiving"
          icon={<ClockIcon className="w-5 h-5 text-blue-600" />}
          tone="blue"
        />
        <SummaryCard
          title="Completed"
          value={stats.completed}
          subtitle="Stock intake posted to inventory"
          icon={<CheckCircleIcon className="w-5 h-5 text-emerald-600" />}
          tone="emerald"
        />
        <SummaryCard
          title="Discrepancies"
          value={stats.discrepancy}
          subtitle="Requires inspection or resolution"
          icon={<WarningIcon className="w-5 h-5 text-amber-600" />}
          tone="amber"
        />
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleFilterSubmit} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by receipt #, PO #, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          />
        </div>

        <div className="w-full md:w-44">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-44">
          <select
            value={branchId}
            onChange={(e) => { setBranchId(e.target.value); setWarehouseId(''); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-44">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          >
            <option value="">All Warehouses</option>
            {filteredWarehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>
      </form>

      {/* Alerts */}
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={loadData} className="font-semibold underline ml-2">Retry</button>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading && (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
            <p className="text-sm">Loading goods receipts…</p>
          </div>
        )}

        {!loading && receipts.length === 0 && (
          <div className="p-6">
            <EmptyState
              icon={<BoxIcon className="w-8 h-8 text-slate-400" />}
              title="No goods receipts found"
              description="No receipts matched your search or filters. You can record a new stock intake against an approved PO."
              action={
                <Can permission="goods_receipt.create">
                  <Link
                    to="/procurement/goods-receipts/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs transition"
                  >
                    Create Goods Receipt
                  </Link>
                </Can>
              }
            />
          </div>
        )}

        {!loading && receipts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="goods-receipts-table">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Purchase Order</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Branch / Warehouse</th>
                  <th className="py-3 px-4">Receipt Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Received By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      <Link
                        to={`/procurement/goods-receipts/${row.id}`}
                        className="text-sky-700 hover:text-sky-900 hover:underline"
                      >
                        {row.receipt_number}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      <Link
                        to={`/procurement/purchase-orders/${row.purchase_order_id}`}
                        className="text-slate-700 hover:text-sky-700 hover:underline font-mono text-xs"
                      >
                        {row.po_number}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {row.supplier_name || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <div className="font-medium text-slate-800">{row.branch_name}</div>
                      <div className="text-slate-500">{row.warehouse_name}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {row.receipt_date ? new Date(row.receipt_date).toISOString().slice(0, 10) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      {row.received_by_name || `User #${row.received_by}`}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/procurement/goods-receipts/${row.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
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

        {/* Pagination Bar */}
        {!loading && total > 0 && (
          <div className="p-4 bg-slate-50/50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {receipts.length} of {total} receipts
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <span className="font-medium text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
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

export default GoodsReceiptsPage;
