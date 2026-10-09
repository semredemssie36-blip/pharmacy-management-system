import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { paymentsApi } from '../features/finance/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function PaymentsPage() {
  const { user } = useAuth();

  const [payments, setPayments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [pRes, bRes] = await Promise.all([
        paymentsApi.list({
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          paymentMethod: methodFilter || undefined,
          branchId: branchFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        branchesApi.list({ status: 'active' }).catch(() => ({ data: [] })),
      ]);

      setPayments(pRes.data?.payments || []);
      const bList = bRes.data?.branches || bRes.data?.items || bRes.data || [];
      setBranches(bList);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, methodFilter, branchFilter, startDate, endDate]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadData();
  }

  // Verify pending payment
  async function handleVerifyPayment(paymentId) {
    if (!window.confirm('Are you sure you want to verify this payment as completed?')) return;
    try {
      await paymentsApi.verify(paymentId);
      setSuccessMessage('Payment verified successfully.');
      loadData();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to verify payment.');
    }
  }

  // Cancel pending payment
  async function handleCancelPayment(paymentId) {
    const reason = window.prompt('Please provide a reason for cancelling this payment:');
    if (!reason) return;
    try {
      await paymentsApi.cancel(paymentId, { reason });
      setSuccessMessage('Payment cancelled.');
      loadData();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to cancel payment.');
    }
  }

  // Open refund modal
  function openRefundModal(payment) {
    setSelectedPaymentForRefund(payment);
    const maxRefundable = Math.max(0, Number(payment.amount) - Number(payment.refunded_amount || 0));
    setRefundAmount(maxRefundable.toFixed(2));
    setRefundMethod(payment.payment_method === 'credit_adjustment' ? 'credit_adjustment' : payment.payment_method || 'cash');
    setRefundReason('');
    setRefundError('');
    setRefundModalOpen(true);
  }

  async function handleExecuteRefund(e) {
    e.preventDefault();
    if (!refundReason.trim()) {
      setRefundError('Mandatory refund reason is required.');
      return;
    }
    const numAmount = parseFloat(refundAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setRefundError('Enter a valid refund amount greater than 0.');
      return;
    }

    setRefundLoading(true);
    setRefundError('');
    try {
      await paymentsApi.refund(selectedPaymentForRefund.id, {
        amount: numAmount,
        refundMethod,
        reason: refundReason.trim(),
      });
      setSuccessMessage(`Refund of ${numAmount.toFixed(2)} ETB processed successfully.`);
      setRefundModalOpen(false);
      loadData();
    } catch (err) {
      setRefundError(err?.response?.data?.error?.message || err.message || 'Refund processing failed.');
    } finally {
      setRefundLoading(false);
    }
  }

  // Open receipt modal
  async function openReceiptModal(paymentId) {
    setReceiptLoading(true);
    setReceiptModalOpen(true);
    try {
      const res = await paymentsApi.getReceipt(paymentId);
      setReceiptData(res.data?.receipt);
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to load receipt.');
      setReceiptModalOpen(false);
    } finally {
      setReceiptLoading(false);
    }
  }

  // Summary Metrics
  const totalCollected = payments
    .filter((p) => p.status === 'completed' || p.status === 'partially_refunded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalRefunded = payments.reduce((sum, p) => sum + Number(p.refunded_amount || 0), 0);
  const pendingCount = payments.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Directory"
        subtitle="Authoritative financial records for POS sales, dispensing orders, and accounts receivable settlements."
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
          title="Total Transactions"
          value={payments.length}
          description="All recorded payments"
        />
        <SummaryCard
          title="Total Collected"
          value={`${totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          description="Completed settled funds"
        />
        <SummaryCard
          title="Pending Verification"
          value={pendingCount}
          description="Awaiting manual clearance"
        />
        <SummaryCard
          title="Total Refunded"
          value={`${totalRefunded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          description="Authoritatively reversed"
        />
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search payment # or reference..."
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
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="mobile_money">Mobile Money</option>
          </select>

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

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title="From Date"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title="To Date"
          />

          <button
            type="submit"
            className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-700 transition"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading payments...</div>
        ) : payments.length === 0 ? (
          <EmptyState
            title="No payments found"
            description="No payment records match your selected filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Payment #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Customer / Obligation</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const maxRefundable = Math.max(0, Number(p.amount) - Number(p.refunded_amount || 0));
                  const isEligibleForRefund =
                    (p.status === 'completed' || p.status === 'partially_refunded') && maxRefundable > 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link
                          to={`/finance/payments/${p.id}`}
                          className="text-emerald-600 hover:text-emerald-800 hover:underline"
                        >
                          {p.payment_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(p.payment_date || p.created_at).toLocaleDateString()}{' '}
                        <span className="text-xs text-slate-400">
                          {new Date(p.payment_date || p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">{p.branch_name || `Branch #${p.branch_id}`}</td>
                      <td className="px-4 py-3 capitalize">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                          {p.payment_method?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.customer_name ? (
                          <span className="font-medium text-slate-800">{p.customer_name}</span>
                        ) : (
                          <span className="text-slate-400 italic">Walk-in</span>
                        )}
                        {p.allocation_count > 0 && (
                          <span className="ml-1 text-xs text-slate-400">({p.allocation_count} linked)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {Number(p.amount).toFixed(2)} {p.currency || 'ETB'}
                        {Number(p.refunded_amount || 0) > 0 && (
                          <div className="text-xs text-rose-500">
                            -{Number(p.refunded_amount).toFixed(2)} ref
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => openReceiptModal(p.id)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition"
                          title="View Receipt"
                        >
                          Receipt
                        </button>

                        {p.status === 'pending' && (
                          <Can permission="payment.verify">
                            <button
                              onClick={() => handleVerifyPayment(p.id)}
                              className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => handleCancelPayment(p.id)}
                              className="text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition"
                            >
                              Cancel
                            </button>
                          </Can>
                        )}

                        {isEligibleForRefund && (
                          <Can permission="payment.refund">
                            <button
                              onClick={() => openRefundModal(p)}
                              className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded transition"
                            >
                              Refund
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

      {/* Refund Modal */}
      {refundModalOpen && selectedPaymentForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Process Authorized Refund</h3>
            <p className="text-xs text-slate-500">
              Refund against payment <strong>{selectedPaymentForRefund.payment_number}</strong>. Note:
              financial refunds adjust customer and transaction accounts; they do NOT automatically restock uninspected medicines.
            </p>

            {refundError && (
              <div className="p-3 rounded bg-red-50 text-red-700 text-xs">{refundError}</div>
            )}

            <form onSubmit={handleExecuteRefund} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Refund Amount (Max:{' '}
                  {(
                    Number(selectedPaymentForRefund.amount) -
                    Number(selectedPaymentForRefund.refunded_amount || 0)
                  ).toFixed(2)}{' '}
                  ETB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={(
                    Number(selectedPaymentForRefund.amount) -
                    Number(selectedPaymentForRefund.refunded_amount || 0)
                  ).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Refund Method</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="credit_adjustment">Credit Ledger Adjustment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Refund (Mandatory audit trail)
                </label>
                <textarea
                  rows="3"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Prescribed item cancelled before physical dispensing handover..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                >
                  {refundLoading ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Payment Receipt</h3>
              <button
                onClick={() => setReceiptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {receiptLoading || !receiptData ? (
              <div className="p-8 text-center text-slate-500">Loading receipt details...</div>
            ) : (
              <div className="space-y-4 text-sm text-slate-700">
                <div className="bg-slate-50 p-3 rounded-lg flex justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{receiptData.payment.payment_number}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(receiptData.payment.payment_date).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={receiptData.payment.status} />
                    <div className="text-xs text-slate-500 mt-1 capitalize">
                      Method: {receiptData.payment.payment_method?.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Allocated Financial Obligations
                  </div>
                  {receiptData.allocations?.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No specific obligations linked.</div>
                  ) : (
                    receiptData.allocations.map((a) => (
                      <div key={a.id} className="flex justify-between items-center text-xs">
                        <span className="capitalize">
                          {a.reference_type} #{a.reference_id}
                        </span>
                        <span className="font-medium text-slate-900">
                          {Number(a.amount).toFixed(2)} ETB
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {receiptData.refunds?.length > 0 && (
                  <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-rose-600 uppercase tracking-wide">
                      Authoritative Refunds
                    </div>
                    {receiptData.refunds.map((r) => (
                      <div key={r.id} className="flex justify-between items-center text-xs text-rose-700">
                        <span>
                          {r.refund_number} ({r.reason})
                        </span>
                        <span className="font-bold">-{Number(r.amount).toFixed(2)} ETB</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-3 flex justify-between items-center text-base font-bold text-slate-900">
                  <span>Net Settled Amount</span>
                  <span>
                    {(
                      Number(receiptData.payment.amount) -
                      Number(receiptData.payment.refunded_amount || 0)
                    ).toFixed(2)}{' '}
                    {receiptData.payment.currency || 'ETB'}
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
                  >
                    Print Receipt
                  </button>
                  <button
                    onClick={() => setReceiptModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
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
