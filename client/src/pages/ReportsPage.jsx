/**
 * Task 21 — Comprehensive Reports & Analytics Page
 * Supports Sales, Inventory, Finance, Procurement, Dispensing, and Expiry/Exceptions reports.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import reportsApi from '../features/reports/api.js';
import { exportCsv } from '../features/dataExchange/api.js';
import { useCan } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import {
  SalesIcon,
  InventoryIcon,
  AccountingIcon,
  PurchaseIcon,
  ClinicalIcon,
  WarningIcon,
  BoxIcon,
  LockIcon,
  ShieldIcon,
  StopIcon,
  CheckCircleIcon,
  ClockIcon,
  TagIcon,
  BuildingIcon,
  FileTextIcon,
  DollarIcon,
  ReportsIcon,
} from '../components/common/Icons.jsx';

export default function ReportsPage() {
  const can = useCan();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab selection
  const activeTab = searchParams.get('tab') || 'sales';

  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Secondary filters
  const [paymentStatus, setPaymentStatus] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState('');
  const [isLowStock, setIsLowStock] = useState(false);
  const [poStatus, setPoStatus] = useState('');
  const [expiryDays, setExpiryDays] = useState('90');

  // Pagination
  const [page, setPage] = useState(1);

  // Data & loading state
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleTabChange = (tab) => {
    setSearchParams({ tab });
    setPage(1);
    setReportData(null);
    setErrorMessage('');
  };

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      let res;
      if (activeTab === 'sales') {
        res = await reportsApi.getSales({
          startDate,
          endDate,
          paymentStatus: paymentStatus || undefined,
          page,
          limit: 15,
        });
      } else if (activeTab === 'inventory') {
        res = await reportsApi.getInventory({
          status: inventoryStatus || undefined,
          isLowStock: isLowStock ? 'true' : undefined,
          page,
          limit: 15,
        });
      } else if (activeTab === 'finance') {
        res = await reportsApi.getFinancial({
          startDate,
          endDate,
          page,
          limit: 15,
        });
      } else if (activeTab === 'procurement') {
        res = await reportsApi.getProcurement({
          startDate,
          endDate,
          status: poStatus || undefined,
          page,
          limit: 15,
        });
      } else if (activeTab === 'dispensing') {
        res = await reportsApi.getDispensing({
          startDate,
          endDate,
          page,
          limit: 15,
        });
      } else if (activeTab === 'expiry') {
        res = await reportsApi.getExpiryQuarantine({
          daysThreshold: expiryDays,
          page,
          limit: 15,
        });
      }
      if (res?.data) {
        setReportData(res.data);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load report data');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, startDate, endDate, paymentStatus, inventoryStatus, isLowStock, poStatus, expiryDays, page]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleResetFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setStartDate(d.toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setPaymentStatus('');
    setInventoryStatus('');
    setIsLowStock(false);
    setPoStatus('');
    setExpiryDays('90');
    setPage(1);
  };

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(num).replace('ETB', 'ETB ');
  };

  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(Number(val || 0));

  const [isExporting, setIsExporting] = useState(false);
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      let exportType = 'reports_sales';
      if (activeTab === 'inventory') exportType = 'reports_inventory';
      else if (activeTab === 'finance') exportType = 'reports_financial';
      await exportCsv(exportType, { startDate, endDate, status: inventoryStatus });
    } catch (err) {
      setErrorMessage(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Operational Analytics"
        subtitle="Audited, permission-aware business intelligence and compliance reports generated directly from real transactional ledger data."
      />

      {/* Report Categories Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2 overflow-x-auto pb-px" aria-label="Tabs">
          <button
            type="button"
            onClick={() => handleTabChange('sales')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'sales'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <SalesIcon className="w-4 h-4 pointer-events-none" />
            <span>Sales & Revenue</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('inventory')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'inventory'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <InventoryIcon className="w-4 h-4 pointer-events-none" />
            <span>Inventory & Valuation</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('finance')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'finance'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <AccountingIcon className="w-4 h-4 pointer-events-none" />
            <span>Collections & Receivables</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('procurement')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'procurement'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <PurchaseIcon className="w-4 h-4 pointer-events-none" />
            <span>Procurement Fulfillment</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('dispensing')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'dispensing'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <ClinicalIcon className="w-4 h-4 pointer-events-none" />
            <span>Clinical Dispensing</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('expiry')}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition ${
              activeTab === 'expiry'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <WarningIcon className="w-4 h-4 pointer-events-none" />
            <span>Expiry, Quarantine & Recalls</span>
          </button>
        </nav>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {activeTab !== 'inventory' && activeTab !== 'expiry' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">Start Date:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">End Date:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>
            </>
          )}

          {activeTab === 'sales' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Payment Status:</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
              >
                <option value="">All Payment Statuses</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          )}

          {activeTab === 'inventory' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600">Stock Status:</span>
                <select
                  value={inventoryStatus}
                  onChange={(e) => setInventoryStatus(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="">All Positions</option>
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="quarantined">Quarantined</option>
                  <option value="expired">Expired</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isLowStock}
                  onChange={(e) => setIsLowStock(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-0"
                />
                <span className="font-semibold text-slate-700">Low Stock Only</span>
              </label>
            </>
          )}

          {activeTab === 'procurement' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">PO Status:</span>
              <select
                value={poStatus}
                onChange={(e) => setPoStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
              >
                <option value="">All PO Statuses</option>
                <option value="approved">Approved</option>
                <option value="partially_received">Partially Received</option>
                <option value="fully_received">Fully Received</option>
                <option value="submitted">Submitted</option>
              </select>
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Horizon:</span>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
              >
                <option value="30">Within 30 Days</option>
                <option value="60">Within 60 Days</option>
                <option value="90">Within 90 Days</option>
                <option value="180">Within 180 Days</option>
                <option value="365">Within 1 Year</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="px-3 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 font-semibold rounded-lg border border-slate-300 shadow-sm flex items-center gap-1.5 transition"
            title="Export Report to CSV"
          >
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={loadReport}
            disabled={isLoading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
          >
            {isLoading ? 'Updating...' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
          {errorMessage}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: SALES & REVENUE REPORT                                  */}
      {/* ============================================================== */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              title="Net Sales (Completed)"
              value={formatCurrency(reportData?.summary?.netTotal)}
              subtitle={`${formatNumber(reportData?.summary?.completedCount)} completed orders`}
              icon={<DollarIcon className="w-5 h-5 text-emerald-600" />}
              tone="emerald"
            />
            <SummaryCard
              title="Gross Sales"
              value={formatCurrency(reportData?.summary?.grossTotal)}
              subtitle="Before discounts and concessions"
              icon={<ReportsIcon className="w-5 h-5 text-slate-600" />}
              tone="slate"
            />
            <SummaryCard
              title="Total Discounts Granted"
              value={formatCurrency(reportData?.summary?.totalDiscount)}
              subtitle="Promotional & authorized discounts"
              icon={<TagIcon className="w-5 h-5 text-amber-600" />}
              tone="amber"
            />
            <SummaryCard
              title="Paid In Full"
              value={formatCurrency(reportData?.summary?.paidTotal)}
              subtitle="Cleared customer payments"
              icon={<CheckCircleIcon className="w-5 h-5 text-blue-600" />}
              tone="blue"
            />
          </div>

          {/* Top Products Breakdown */}
          {reportData?.topProducts?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Top Products by Revenue (Completed Sales)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {reportData.topProducts.slice(0, 5).map((p) => (
                  <div key={p.product_id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-slate-900 truncate" title={p.product_name}>
                      {p.product_name}
                    </div>
                    <div className="text-[11px] text-slate-500">{p.category_name}</div>
                    <div className="text-sm font-black text-emerald-700">{formatCurrency(p.total_revenue)}</div>
                    <div className="text-[10px] text-slate-400">{formatNumber(p.total_quantity)} units sold</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Completed Sales Transactions</h2>
              <span className="text-xs text-slate-500">
                Showing {reportData?.items?.length || 0} of {reportData?.pagination?.total || 0} records
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Sale #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Total Net</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.items?.length > 0 ? (
                    reportData.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{row.sale_number}</td>
                        <td className="px-4 py-2.5">{row.sale_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5">{row.branch_name}</td>
                        <td className="px-4 py-2.5">{row.customer_name || 'Walk-in'}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(row.subtotal)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600">{formatCurrency(row.discount_amount)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(row.total_amount)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{formatCurrency(row.paid_amount)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.payment_status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No completed sales found for the selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {reportData?.pagination?.totalPages > 1 && (
              <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Page {reportData.pagination.page} of {reportData.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= reportData.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: INVENTORY & VALUATION REPORT                             */}
      {/* ============================================================== */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard
              title="Available Units"
              value={formatNumber(reportData?.summary?.availableQuantity)}
              subtitle="Unencumbered, ready for sale"
              icon={<BoxIcon className="w-5 h-5 text-emerald-600" />}
              tone="emerald"
            />
            <SummaryCard
              title="Reserved Stock"
              value={formatNumber(reportData?.summary?.reservedQuantity)}
              subtitle="Allocated to active orders"
              icon={<LockIcon className="w-5 h-5 text-blue-600" />}
              tone="blue"
            />
            <SummaryCard
              title="Quarantined Stock"
              value={formatNumber(reportData?.summary?.quarantinedQuantity)}
              subtitle="Held under regulatory review"
              icon={<ShieldIcon className="w-5 h-5 text-amber-600" />}
              tone="amber"
            />
            <SummaryCard
              title="Expired Units"
              value={formatNumber(reportData?.summary?.expiredQuantity)}
              subtitle="Segregated from usable stock"
              icon={<StopIcon className="w-5 h-5 text-rose-600" />}
              tone="rose"
            />
            <SummaryCard
              title="Total Physical Stock"
              value={formatNumber(reportData?.summary?.physicalQuantity)}
              subtitle="Sum of all positions in warehouse"
              icon={<BuildingIcon className="w-5 h-5 text-slate-600" />}
              tone="slate"
            />
          </div>

          {/* Inventory Positions Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Inventory Positions & Valuation Basis</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Valuation is estimated from latest confirmed purchase receipt cost per unit.
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {reportData?.pagination?.total || 0} distinct positions
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3">Warehouse / Location</th>
                    <th className="px-4 py-3">Batch #</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Unit Cost Basis</th>
                    <th className="px-4 py-3 text-right">Est. Position Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.items?.length > 0 ? (
                    reportData.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{row.product_code}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">{row.product_name}</td>
                        <td className="px-4 py-2.5">
                          {row.warehouse_name} <span className="text-slate-400">({row.location_name})</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono">{row.batch_number}</td>
                        <td className="px-4 py-2.5">{row.expiry_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.inventory_status} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-slate-900">
                          {formatNumber(row.quantity)} <span className="font-normal text-slate-400">{row.unit_name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500">
                          {row.estimated_unit_cost !== null ? formatCurrency(row.estimated_unit_cost) : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                          {row.estimated_stock_value !== null ? formatCurrency(row.estimated_stock_value) : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No inventory positions match the filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {reportData?.pagination?.totalPages > 1 && (
              <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Page {reportData.pagination.page} of {reportData.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= reportData.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: FINANCIAL COLLECTIONS & RECEIVABLES                     */}
      {/* ============================================================== */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              title="Gross Collections"
              value={formatCurrency(reportData?.summary?.totalCollected)}
              subtitle={`${formatNumber(reportData?.summary?.paymentCount)} completed payments`}
              icon={<DollarIcon className="w-5 h-5 text-emerald-600" />}
              tone="emerald"
            />
            <SummaryCard
              title="Refunds Paid"
              value={formatCurrency(reportData?.summary?.totalRefunded)}
              subtitle={`${formatNumber(reportData?.summary?.refundCount)} return settlements`}
              icon={<StopIcon className="w-5 h-5 text-rose-600" />}
              tone="rose"
            />
            <SummaryCard
              title="Net Cash Realization"
              value={formatCurrency(reportData?.summary?.netCollections)}
              subtitle="Collections less completed refunds"
              icon={<ReportsIcon className="w-5 h-5 text-blue-600" />}
              tone="blue"
            />
            <SummaryCard
              title="Outstanding Receivables"
              value={formatCurrency(reportData?.summary?.outstandingReceivablesBalance)}
              subtitle={`${formatNumber(reportData?.summary?.activeReceivablesCount)} open credit accounts`}
              icon={<FileTextIcon className="w-5 h-5 text-amber-600" />}
              tone="amber"
            />
          </div>

          {/* Collections by Payment Method */}
          {reportData?.byMethod?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Collections Breakdown by Settlement Method
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {reportData.byMethod.map((m) => (
                  <div key={m.payment_method} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                    <div className="text-xs font-bold text-slate-700 capitalize flex items-center justify-between">
                      <span>{m.payment_method.replace('_', ' ')}</span>
                      <span className="text-slate-400 font-normal">{m.count} txns</span>
                    </div>
                    <div className="text-base font-black text-slate-900">{formatCurrency(m.total_amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Receivables Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Customer Accounts Receivable Ledger</h2>
              <span className="text-xs text-slate-500">
                {reportData?.pagination?.total || 0} customer receivables
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Receivable #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">Total Credit</th>
                    <th className="px-4 py-3 text-right">Settled Amount</th>
                    <th className="px-4 py-3 text-right">Remaining Balance</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.receivables?.length > 0 ? (
                    reportData.receivables.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{row.receivable_number}</td>
                        <td className="px-4 py-2.5 font-medium">{row.customer_name}</td>
                        <td className="px-4 py-2.5">{row.branch_name}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(row.total_amount)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">{formatCurrency(row.paid_amount)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-700">{formatCurrency(row.balance_amount)}</td>
                        <td className="px-4 py-2.5 text-slate-500">{row.due_date || 'None'}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No customer accounts receivable found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: PROCUREMENT & SUPPLIER FULFILLMENT                      */}
      {/* ============================================================== */}
      {activeTab === 'procurement' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              title="Total PO Spend"
              value={formatCurrency(reportData?.summary?.totalSpend)}
              subtitle={`${formatNumber(reportData?.summary?.totalOrders)} purchase orders placed`}
              icon={<FileTextIcon className="w-5 h-5 text-slate-600" />}
              tone="slate"
            />
            <SummaryCard
              title="Fully Received"
              value={formatNumber(reportData?.summary?.fullyReceivedCount)}
              subtitle="Orders 100% delivered to warehouse"
              icon={<BoxIcon className="w-5 h-5 text-emerald-600" />}
              tone="emerald"
            />
            <SummaryCard
              title="Partially Received"
              value={formatNumber(reportData?.summary?.partiallyReceivedCount)}
              subtitle="Awaiting remaining deliveries"
              icon={<ClockIcon className="w-5 h-5 text-amber-600" />}
              tone="amber"
            />
            <SummaryCard
              title="Discrepant Receipts"
              value={formatNumber(reportData?.summary?.discrepancyReceiptsCount)}
              subtitle="Goods receipts with count variances"
              icon={<WarningIcon className="w-5 h-5 text-rose-600" />}
              tone="rose"
            />
          </div>

          {/* Spend by Supplier */}
          {reportData?.bySupplier?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Top Suppliers by Committed Procurement Spend
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {reportData.bySupplier.slice(0, 5).map((s) => (
                  <div key={s.supplier_id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-slate-900 truncate">{s.supplier_name}</div>
                    <div className="text-base font-black text-slate-900">{formatCurrency(s.total_spend)}</div>
                    <div className="text-[10px] text-slate-400">{s.order_count} purchase orders</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fulfillment Comparison Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Purchase Orders vs Received Fulfillment</h2>
              <span className="text-xs text-slate-500">
                {reportData?.pagination?.total || 0} orders
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">PO #</th>
                    <th className="px-4 py-3">Order Date</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">Committed Value</th>
                    <th className="px-4 py-3 text-right">Ordered Units</th>
                    <th className="px-4 py-3 text-right">Received Units</th>
                    <th className="px-4 py-3 text-right">Fulfillment</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.items?.length > 0 ? (
                    reportData.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{row.po_number}</td>
                        <td className="px-4 py-2.5">{row.order_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5 font-medium">{row.supplier_name}</td>
                        <td className="px-4 py-2.5">{row.branch_name}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(row.total_amount)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-700">{formatNumber(row.total_ordered_qty)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{formatNumber(row.total_received_qty)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              row.fulfillment_rate_percent >= 100
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.fulfillment_rate_percent > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {row.fulfillment_rate_percent}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No purchase orders found for the selected dates.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: CLINICAL & DISPENSING OPERATIONAL                       */}
      {/* ============================================================== */}
      {activeTab === 'dispensing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prescriptions by Status */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Prescription Intake by Lifecycle Status
              </h2>
              <div className="space-y-2">
                {reportData?.prescriptionsByStatus?.map((rx) => (
                  <div key={rx.status} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                    <span className="capitalize font-medium text-slate-700">{rx.status.replace('_', ' ')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-900">
                      {formatNumber(rx.count)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dispensings by Status */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Dispensing Execution Throughput
              </h2>
              <div className="space-y-2">
                {reportData?.dispensingsByStatus?.map((dp) => (
                  <div key={dp.status} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                    <div className="space-x-2">
                      <span className="capitalize font-medium text-slate-700">{dp.status.replace('_', ' ')}</span>
                      <span className="text-slate-400">({formatNumber(dp.count)} orders)</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatCurrency(dp.total_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Dispensings Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Dispensing Operations Activity</h2>
              <span className="text-xs text-slate-500">{reportData?.pagination?.total || 0} events</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Dispensing #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Rx #</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Dispensing Status</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.items?.length > 0 ? (
                    reportData.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{row.dispensing_number}</td>
                        <td className="px-4 py-2.5">{row.dispensing_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5">{row.branch_name}</td>
                        <td className="px-4 py-2.5 font-mono">{row.prescription_number || 'N/A'}</td>
                        <td className="px-4 py-2.5 font-medium">{row.patient_name || 'Anonymous'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(row.total_amount)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.payment_status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No dispensing records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 6: EXPIRY, QUARANTINE & RECALLS                            */}
      {/* ============================================================== */}
      {activeTab === 'expiry' && (
        <div className="space-y-6">
          {/* Batches Near Expiry Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Batches Expiring Soon or Expired</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Filtered by horizon: ≤ {expiryDays} days. Includes batches with active inventory.
                </p>
              </div>
              <span className="text-xs text-slate-500">{reportData?.pagination?.total || 0} batches</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Batch #</th>
                    <th className="px-4 py-3">Branch / Warehouse</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Days Left</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData?.expiryBatches?.length > 0 ? (
                    reportData.expiryBatches.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5 font-bold text-slate-900">{b.product_name}</td>
                        <td className="px-4 py-2.5 font-mono">{b.batch_number}</td>
                        <td className="px-4 py-2.5">
                          {b.branch_name} • {b.warehouse_name}
                        </td>
                        <td className="px-4 py-2.5">{b.expiry_date?.slice(0, 10)}</td>
                        <td className="px-4 py-2.5 text-right font-black">
                          {b.days_remaining < 0 ? (
                            <span className="text-rose-600">EXPIRED ({Math.abs(b.days_remaining)}d ago)</span>
                          ) : (
                            <span className="text-amber-600">{b.days_remaining}d remaining</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          {formatNumber(b.total_quantity)} {b.unit_name}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={b.inventory_status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No batches expiring within {expiryDays} days found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Quarantines & Recalls in Two Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Quarantines */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Active Quarantine Holds</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2">Quarantine #</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Hold Qty</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData?.quarantines?.length > 0 ? (
                      reportData.quarantines.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold">{q.quarantine_number}</td>
                          <td className="px-3 py-2">{q.product_name}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700">{formatNumber(q.quantity)}</td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-[150px]" title={q.reason}>{q.reason}</td>
                          <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">No active quarantine holds.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Recalls */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Active Product Recalls</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2">Recall #</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData?.recalls?.length > 0 ? (
                      reportData.recalls.map((rc) => (
                        <tr key={rc.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold">{rc.recall_number}</td>
                          <td className="px-3 py-2">{rc.product_name}</td>
                          <td className="px-3 py-2 uppercase font-black text-rose-600">{rc.severity?.replace('_', ' ')}</td>
                          <td className="px-3 py-2"><StatusBadge status={rc.status} /></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400">No active product recalls.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
