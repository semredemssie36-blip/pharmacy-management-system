import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { receivablesApi, paymentsApi } from '../features/finance/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { customersApi } from '../features/partners/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function ReceivablesPage() {
  const { user } = useAuth();

  const [receivables, setReceivables] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  // Payment Settlement Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  // Customer Summary Modal
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [customerSummary, setCustomerSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [rRes, bRes, cRes] = await Promise.all([
        receivablesApi.list({
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          branchId: branchFilter || undefined,
          customerId: customerFilter || undefined,
        }),
        branchesApi.list({ status: 'active' }).catch(() => ({ data: [] })),
        customersApi.list({ status: 'active' }).catch(() => ({ data: [] })),
      ]);

      setReceivables(rRes.data?.receivables || []);
      setBranches(bRes.data?.branches || bRes.data?.items || bRes.data || []);
      setCustomers(cRes.data?.customers || cRes.data?.items || cRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load accounts receivable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, branchFilter, customerFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadData();
  }

  // Open Payment Settlement Modal
  function openPayModal(rec) {
    setSelectedReceivable(rec);
    setPayAmount(Number(rec.balance_amount).toFixed(2));
    setPayMethod('cash');
    setPayNotes('');
    setPayError('');
    setPayModalOpen(true);
  }

  async function handleExecutePayment(e) {
    e.preventDefault();
    const numAmount = parseFloat(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setPayError('Please enter a valid amount greater than 0.');
      return;
    }
    if (numAmount > Number(selectedReceivable.balance_amount)) {
      setPayError(
        `Amount cannot exceed the current outstanding balance of ${Number(
          selectedReceivable.balance_amount
        ).toFixed(2)} ETB.`
      );
      return;
    }

    setPayLoading(true);
    setPayError('');
    try {
      await paymentsApi.create({
        referenceType: 'receivable',
        referenceId: selectedReceivable.id,
        amount: numAmount,
        paymentMethod: payMethod,
        notes: payNotes.trim() || undefined,
      });

      setSuccessMessage(
        `Payment of ${numAmount.toFixed(2)} ETB recorded against obligation ${
          selectedReceivable.receivable_number
        }.`
      );
      setPayModalOpen(false);
      loadData();
    } catch (err) {
      setPayError(err?.response?.data?.error?.message || err.message || 'Failed to record payment.');
    } finally {
      setPayLoading(false);
    }
  }

  // Open Customer Financial Summary Modal
  async function openCustomerSummary(customerId) {
    setSummaryLoading(true);
    setSummaryModalOpen(true);
    try {
      const res = await receivablesApi.getCustomerSummary(customerId);
      setCustomerSummary(res.data?.summary);
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to load customer summary.');
      setSummaryModalOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  }

  // Calculations
  const totalBalance = receivables.reduce((sum, r) => sum + Number(r.balance_amount || 0), 0);
  const totalOriginal = receivables.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const openReceivablesCount = receivables.filter((r) => r.status !== 'paid' && r.status !== 'cancelled').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable & Customer Credit"
        subtitle="Manage customer credit obligations, enforce credit limits, track balances, and allocate settlements."
      />

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">&times;</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex justify-between items-center">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="font-bold">&times;</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Outstanding"
          value={`${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          description="Open exposure across all accounts"
        />
        <SummaryCard
          title="Open Obligations"
          value={openReceivablesCount}
          description="Unpaid or partially paid items"
        />
        <SummaryCard
          title="Total Credit Extended"
          value={`${totalOriginal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          description="Cumulative credit sales"
        />
        <SummaryCard
          title="Total Obligations"
          value={receivables.length}
          description="Total records tracked"
        />
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search receivable # or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Fully Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {customers.length > 0 && (
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="submit"
            className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-700 transition"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Receivables Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading accounts receivable...</div>
        ) : receivables.length === 0 ? (
          <EmptyState
            title="No receivables found"
            description="No accounts receivable match your filter criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Receivable #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Origin</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivables.map((r) => {
                  const isOverdue =
                    r.due_date &&
                    new Date(r.due_date) < new Date() &&
                    r.status !== 'paid' &&
                    r.status !== 'cancelled';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {r.receivable_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <button
                          onClick={() => openCustomerSummary(r.customer_id)}
                          className="text-emerald-700 hover:text-emerald-900 hover:underline text-left font-semibold"
                        >
                          {r.customer_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 capitalize text-xs">
                        {r.reference_type === 'dispensing' ? (
                          <Link
                            to={`/clinical/dispensings/${r.reference_id}`}
                            className="text-emerald-600 hover:underline"
                          >
                            Dispensing #{r.reference_id}
                          </Link>
                        ) : (
                          <span className="text-slate-700">Sale #{r.reference_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.due_date ? (
                          <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {new Date(r.due_date).toLocaleDateString()}
                            {isOverdue && ' (Overdue)'}
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">
                        {Number(r.total_amount).toFixed(2)} ETB
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {Number(r.paid_amount).toFixed(2)} ETB
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {Number(r.balance_amount).toFixed(2)} ETB
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {r.status !== 'paid' && r.status !== 'cancelled' && (
                          <Can permission="payment.create">
                            <button
                              onClick={() => openPayModal(r)}
                              className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-xs transition"
                            >
                              Collect Payment
                            </button>
                          </Can>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settle Payment Modal */}
      {payModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Collect Receivable Settlement</h3>
            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-bold text-slate-800">{selectedReceivable.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Receivable:</span>
                <span className="font-mono text-slate-800">{selectedReceivable.receivable_number}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-semibold pt-1 border-t">
                <span>Current Balance Due:</span>
                <span>{Number(selectedReceivable.balance_amount).toFixed(2)} ETB</span>
              </div>
            </div>

            {payError && <div className="p-3 rounded bg-red-50 text-red-700 text-xs">{payError}</div>}

            <form onSubmit={handleExecutePayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Amount (ETB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={Number(selectedReceivable.balance_amount).toFixed(2)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Settlement Notes / Reference
                </label>
                <textarea
                  rows="2"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional reference notes..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payLoading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition disabled:opacity-50"
                >
                  {payLoading ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Financial Profile Modal */}
      {summaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Customer Financial Profile</h3>
              <button
                onClick={() => setSummaryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {summaryLoading || !customerSummary ? (
              <div className="p-8 text-center text-slate-500">Loading customer financial profile...</div>
            ) : (
              <div className="space-y-4 text-sm text-slate-700">
                <div className="bg-slate-50 p-4 rounded-xl space-y-2">
                  <div className="font-bold text-base text-slate-900">
                    {customerSummary.customer.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    Account: {customerSummary.customer.code} | Status:{' '}
                    <span className="capitalize font-semibold text-slate-700">
                      {customerSummary.customer.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 border rounded-lg bg-white">
                    <span className="text-xs text-slate-500 block">Credit Limit</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {Number(customerSummary.creditLimit || 0).toFixed(2)} ETB
                    </span>
                  </div>
                  <div className="p-3 border rounded-lg bg-white">
                    <span className="text-xs text-slate-500 block">Current Balance</span>
                    <span className="font-bold text-rose-600 text-sm">
                      {Number(customerSummary.currentBalance || 0).toFixed(2)} ETB
                    </span>
                  </div>
                  <div className="p-3 border rounded-lg bg-white">
                    <span className="text-xs text-slate-500 block">Available Credit</span>
                    <span className="font-bold text-emerald-600 text-sm">
                      {Number(customerSummary.availableCredit || 0).toFixed(2)} ETB
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Active Receivables ({customerSummary.receivables?.length || 0})
                  </div>
                  {customerSummary.receivables?.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No active receivables.</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {customerSummary.receivables.map((r) => (
                        <div key={r.id} className="py-1.5 flex justify-between items-center">
                          <div>
                            <span className="font-mono font-medium">{r.receivable_number}</span>
                            <span className="ml-2 text-slate-400 capitalize">({r.status})</span>
                          </div>
                          <span className="font-bold text-slate-900">
                            {Number(r.balance_amount).toFixed(2)} ETB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSummaryModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
