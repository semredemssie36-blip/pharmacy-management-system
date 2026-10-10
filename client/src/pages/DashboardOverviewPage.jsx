/**
 * Task 21 — Operational Dashboard Page
 * Real transactional metrics scoped to user branch & organization.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import reportsApi from '../features/reports/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function DashboardOverviewPage() {
  const { user } = useAuth();

  // Date filters state
  const [datePreset, setDatePreset] = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Data state
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Set date ranges according to presets
  const applyPreset = useCallback((preset) => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7d') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === '30d') {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(todayStr);
    }
  }, []);

  useEffect(() => {
    applyPreset('30d');
  }, [applyPreset]);

  const loadDashboard = useCallback(async () => {
    if (!startDate || !endDate) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await reportsApi.getDashboard({
        startDate,
        endDate,
      });
      setData(res.data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (startDate && endDate) {
      loadDashboard();
    }
  }, [startDate, endDate, loadDashboard]);

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(num).replace('ETB', 'ETB ');
  };

  const formatNumber = (val) => {
    return new Intl.NumberFormat('en-US').format(Number(val || 0));
  };

  const sales = data?.sales || {};
  const finance = data?.finance || {};
  const inventory = data?.inventory || {};
  const operations = data?.operations || {};

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pharmacy ERP — Operational Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time multi-branch operational activity, inventory positions, and financial metrics.
          </p>
        </div>

        {/* Date presets & Custom Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                datePreset === 'today' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                datePreset === '7d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30d')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                datePreset === '30d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('this_month')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                datePreset === 'this_month' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setDatePreset('custom');
                setStartDate(e.target.value);
              }}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setDatePreset('custom');
                setEndDate(e.target.value);
              }}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1 transition"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={loadDashboard}
            className="text-xs font-bold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Completed Sales"
          value={isLoading ? '...' : formatCurrency(sales.totalSalesAmount)}
          subtitle={isLoading ? '' : `${formatNumber(sales.completedCount)} completed transactions`}
          icon="💳"
          tone="emerald"
        />
        <SummaryCard
          title="Payment Collections"
          value={isLoading ? '...' : formatCurrency(finance.totalCollected)}
          subtitle={isLoading ? '' : `Net: ${formatCurrency(finance.netCollected)} (Refunds: ${formatCurrency(finance.totalRefunded)})`}
          icon="💰"
          tone="blue"
        />
        <SummaryCard
          title="Customer Receivables"
          value={isLoading ? '...' : formatCurrency(finance.totalOutstandingReceivables)}
          subtitle={isLoading ? '' : `${formatNumber(finance.activeReceivablesCount)} active credit accounts`}
          icon="📄"
          tone="amber"
        />
        <SummaryCard
          title="Available Stock"
          value={isLoading ? '...' : `${formatNumber(inventory.availableQuantity)} units`}
          subtitle={isLoading ? '' : `Physical Total: ${formatNumber(inventory.physicalQuantity)} units`}
          icon="📦"
          tone="slate"
        />
      </div>

      {/* Secondary Operational Alerts Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Stock Alerts"
          value={isLoading ? '...' : `${inventory.lowStockCount} Low / ${inventory.stockoutCount} Out`}
          subtitle="Products below minimum threshold"
          icon="⚠️"
          tone={inventory.stockoutCount > 0 ? 'rose' : inventory.lowStockCount > 0 ? 'amber' : 'slate'}
        />
        <SummaryCard
          title="Expiry Risks"
          value={isLoading ? '...' : `${inventory.nearExpiryBatchCount} Soon / ${inventory.expiredBatchCount} Expired`}
          subtitle="Batches ≤ 90 days or expired"
          icon="⏳"
          tone={inventory.expiredBatchCount > 0 ? 'rose' : inventory.nearExpiryBatchCount > 0 ? 'amber' : 'slate'}
        />
        <SummaryCard
          title="Pending Approvals"
          value={isLoading ? '...' : formatNumber(operations.pendingApprovalsCount)}
          subtitle="Awaiting administrative sign-off"
          icon="✍️"
          tone={operations.pendingApprovalsCount > 0 ? 'blue' : 'slate'}
        />
        <SummaryCard
          title="Quarantine & Recalls"
          value={isLoading ? '...' : `${operations.activeQuarantinesCount} Holds / ${operations.activeRecallsCount} Recalls`}
          subtitle="Regulated batch isolations"
          icon="🛡️"
          tone={operations.activeRecallsCount > 0 ? 'rose' : 'slate'}
        />
      </div>

      {/* Visual Progress & Summary Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Flow Overview */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Financial Realization Breakdown
            </h2>
            <Link to="/reports?tab=finance" className="text-xs text-sky-600 hover:underline font-medium">
              View Financial Report →
            </Link>
          </div>
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Completed Sales Revenue</span>
                <span>{formatCurrency(sales.totalSalesAmount)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, sales.totalSalesAmount > 0 ? 100 : 0)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Cash & Digital Collections</span>
                <span className="text-sky-700">{formatCurrency(finance.totalCollected)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-sky-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      sales.totalSalesAmount > 0
                        ? Math.min(100, (finance.totalCollected / sales.totalSalesAmount) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Outstanding Customer Receivables</span>
                <span className="text-amber-700">{formatCurrency(finance.totalOutstandingReceivables)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      sales.totalSalesAmount > 0
                        ? Math.min(100, (finance.totalOutstandingReceivables / sales.totalSalesAmount) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 italic pt-1">
            Collections reflect real completed payment receipts within selected period. Outstanding credit reflects open customer receivable balances.
          </p>
        </div>

        {/* Inventory Stock Position Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Inventory Physical Balance Status
            </h2>
            <Link to="/reports?tab=inventory" className="text-xs text-sky-600 hover:underline font-medium">
              View Inventory Report →
            </Link>
          </div>
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Available for Dispensing & Sale
                </span>
                <span>{formatNumber(inventory.availableQuantity)} units</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      inventory.physicalQuantity > 0
                        ? (inventory.availableQuantity / inventory.physicalQuantity) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Quarantined / Regulatory Hold
                </span>
                <span className="text-amber-700">{formatNumber(inventory.quarantinedQuantity)} units</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      inventory.physicalQuantity > 0
                        ? (inventory.quarantinedQuantity / inventory.physicalQuantity) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Expired Stock (Segregated)
                </span>
                <span className="text-rose-700">{formatNumber(inventory.expiredQuantity)} units</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                <div
                  className="bg-rose-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      inventory.physicalQuantity > 0
                        ? (inventory.expiredQuantity / inventory.physicalQuantity) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 italic pt-1">
            Total physical inventory in scoped warehouses: <strong>{formatNumber(inventory.physicalQuantity)} units</strong>. Reserved & quarantined items cannot be sold.
          </p>
        </div>
      </div>

      {/* Tables Row: Recent Completed Sales & Batches Expiring Soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Completed Sales */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Recent Completed Sales
            </h2>
            <Link to="/reports?tab=sales" className="text-xs text-sky-600 hover:underline font-medium">
              All Sales Reports →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2">Sale #</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">Loading recent sales...</td>
                  </tr>
                ) : data?.recentSales?.length > 0 ? (
                  data.recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 font-mono font-medium text-slate-900">{s.sale_number}</td>
                      <td className="px-3 py-2">{s.branch_name}</td>
                      <td className="px-3 py-2">{s.customer_name || 'Walk-in'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(s.total_amount)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={s.payment_status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No completed sales in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Batches Expiring Soon */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Batches Near Expiry (≤ 90 Days)
            </h2>
            <Link to="/reports?tab=expiry" className="text-xs text-sky-600 hover:underline font-medium">
              Expiry & Recall Report →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Batch #</th>
                  <th className="px-3 py-2">Expiry Date</th>
                  <th className="px-3 py-2 text-right">Days Left</th>
                  <th className="px-3 py-2 text-right">Available Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">Checking batch expiries...</td>
                  </tr>
                ) : data?.nearExpiryBatches?.length > 0 ? (
                  data.nearExpiryBatches.map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 font-medium text-slate-900">{b.product_name}</td>
                      <td className="px-3 py-2 font-mono">{b.batch_number}</td>
                      <td className="px-3 py-2">{b.expiry_date?.slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600">
                        {b.days_remaining}d
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNumber(b.available_quantity)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No active batches expiring within 90 days.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Fast Report Category Jump Navigation Cards */}
      <div className="pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Detailed Report Categories
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link
            to="/reports?tab=sales"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">📊</div>
            <div className="text-xs font-bold text-slate-800">Sales Reports</div>
            <div className="text-[10px] text-slate-400">Daily trends & products</div>
          </Link>
          <Link
            to="/reports?tab=inventory"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">📦</div>
            <div className="text-xs font-bold text-slate-800">Inventory Stock</div>
            <div className="text-[10px] text-slate-400">Batches & valuation</div>
          </Link>
          <Link
            to="/reports?tab=finance"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">💳</div>
            <div className="text-xs font-bold text-slate-800">Financial Reports</div>
            <div className="text-[10px] text-slate-400">Collections & credit</div>
          </Link>
          <Link
            to="/reports?tab=procurement"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">🚚</div>
            <div className="text-xs font-bold text-slate-800">Procurement</div>
            <div className="text-[10px] text-slate-400">POs & goods receipt</div>
          </Link>
          <Link
            to="/reports?tab=dispensing"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">💊</div>
            <div className="text-xs font-bold text-slate-800">Dispensing & Rx</div>
            <div className="text-[10px] text-slate-400">Clinical operational volume</div>
          </Link>
          <Link
            to="/reports?tab=expiry"
            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow transition text-center space-y-1 block"
          >
            <div className="text-xl">🚨</div>
            <div className="text-xs font-bold text-slate-800">Exceptions & Risk</div>
            <div className="text-[10px] text-slate-400">Quarantine, recalls & expiry</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
