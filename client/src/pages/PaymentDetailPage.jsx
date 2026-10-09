import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { paymentsApi } from '../features/finance/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [payment, setPayment] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const res = await paymentsApi.get(id);
      setPayment(res.data?.payment);
      setAllocations(res.data?.allocations || []);
      setRefunds(res.data?.refunds || []);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load payment detail.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [id]);

  async function handleVerify() {
    if (!window.confirm('Verify this payment as settled?')) return;
    try {
      await paymentsApi.verify(id);
      setSuccessMessage('Payment verified successfully.');
      loadDetail();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Verification failed.');
    }
  }

  async function handleCancel() {
    const reason = window.prompt('Enter cancellation reason:');
    if (!reason) return;
    try {
      await paymentsApi.cancel(id, { reason });
      setSuccessMessage('Payment cancelled.');
      loadDetail();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Cancellation failed.');
    }
  }

  function openRefund() {
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
      await paymentsApi.refund(id, {
        amount: numAmount,
        refundMethod,
        reason: refundReason.trim(),
      });
      setSuccessMessage(`Refund of ${numAmount.toFixed(2)} ETB processed successfully.`);
      setRefundModalOpen(false);
      loadDetail();
    } catch (err) {
      setRefundError(err?.response?.data?.error?.message || err.message || 'Refund processing failed.');
    } finally {
      setRefundLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading payment details...</div>;
  }

  if (error || !payment) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <h3 className="font-bold text-lg">Payment Not Found</h3>
        <p className="text-sm mt-1">{error || 'The requested payment could not be found.'}</p>
        <Link to="/finance/payments" className="inline-block mt-4 text-sm font-semibold underline">
          &larr; Back to Payments
        </Link>
      </div>
    );
  }

  const maxRefundable = Math.max(0, Number(payment.amount) - Number(payment.refunded_amount || 0));
  const isEligibleForRefund =
    (payment.status === 'completed' || payment.status === 'partially_refunded') && maxRefundable > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/finance/payments"
              className="text-slate-400 hover:text-slate-600 text-sm font-medium"
            >
              &larr; Payments
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-500">{payment.payment_number}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-3">
            Payment {payment.payment_number}
            <StatusBadge status={payment.status} />
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {payment.status === 'pending' && (
            <Can permission="payment.verify">
              <button
                onClick={handleVerify}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
              >
                Verify Payment
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition"
              >
                Cancel Payment
              </button>
            </Can>
          )}

          {isEligibleForRefund && (
            <Can permission="payment.refund">
              <button
                onClick={openRefund}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
              >
                Process Refund
              </button>
            </Can>
          )}

          <button
            onClick={() => window.print()}
            className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition"
          >
            Print Receipt
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          {successMessage}
        </div>
      )}

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Transaction Metadata */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Payment Information</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">Amount</span>
                <span className="text-lg font-bold text-slate-900">
                  {Number(payment.amount).toFixed(2)} {payment.currency || 'ETB'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Payment Method</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {payment.payment_method?.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Payment Date</span>
                <span className="font-medium text-slate-800">
                  {new Date(payment.payment_date || payment.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Branch</span>
                <span className="font-medium text-slate-800">
                  {payment.branch_name || `Branch #${payment.branch_id}`}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Recorded By</span>
                <span className="font-medium text-slate-800">
                  {payment.recorder_name || `User #${payment.recorded_by}`}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">External Reference</span>
                <span className="font-mono text-slate-800">{payment.external_reference || '—'}</span>
              </div>
            </div>

            {payment.notes && (
              <div className="border-t pt-3 text-xs text-slate-600">
                <span className="font-semibold block text-slate-700">Notes:</span>
                <p className="mt-0.5">{payment.notes}</p>
              </div>
            )}
          </div>

          {/* Allocations */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Payment Allocations</h2>
            <p className="text-xs text-slate-500">
              Distribution of funds to underlying financial obligations.
            </p>

            {allocations.length === 0 ? (
              <div className="text-sm text-slate-400 italic">No allocations recorded.</div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                  <tr>
                    <th className="px-3 py-2">Obligation Type</th>
                    <th className="px-3 py-2">Reference ID</th>
                    <th className="px-3 py-2 text-right">Allocated Amount</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocations.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 capitalize font-medium text-slate-800">
                        {a.reference_type}
                      </td>
                      <td className="px-3 py-2 font-mono">#{a.reference_id}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900">
                        {Number(a.amount).toFixed(2)} ETB
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.reference_type === 'dispensing' ? (
                          <Link
                            to={`/clinical/dispensings/${a.reference_id}`}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            View Dispensing &rarr;
                          </Link>
                        ) : a.reference_type === 'sale' ? (
                          <Link
                            to="/sales"
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            View Sale &rarr;
                          </Link>
                        ) : (
                          <Link
                            to="/finance/receivables"
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            View Receivable &rarr;
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Refund History */}
          {refunds.length > 0 && (
            <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-bold text-rose-900">Refunds History</h2>
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-rose-50 text-rose-800 font-semibold border-b border-rose-100">
                  <tr>
                    <th className="px-3 py-2">Refund #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono font-medium text-slate-900">
                        {r.refund_number}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 capitalize">{r.refund_method?.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 text-slate-700">{r.reason}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-600">
                        -{Number(r.amount).toFixed(2)} ETB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Financial Summary Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Financial Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Gross Paid</span>
                <span className="font-semibold text-slate-900">
                  {Number(payment.amount).toFixed(2)} ETB
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Refunded Total</span>
                <span className="font-semibold text-rose-600">
                  -{Number(payment.refunded_amount || 0).toFixed(2)} ETB
                </span>
              </div>
              <div className="flex justify-between py-1 font-bold text-base text-slate-900 pt-1">
                <span>Net Settled</span>
                <span>
                  {(
                    Number(payment.amount) - Number(payment.refunded_amount || 0)
                  ).toFixed(2)}{' '}
                  ETB
                </span>
              </div>
            </div>

            {payment.customer_id && (
              <div className="pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500 block uppercase font-semibold">
                  Linked Customer
                </span>
                <span className="font-medium text-slate-800 text-sm">
                  {payment.customer_name || `Customer #${payment.customer_id}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {refundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Process Authorized Refund</h3>
            <p className="text-xs text-slate-500">
              Record financial refund against payment <strong>{payment.payment_number}</strong>.
            </p>

            {refundError && (
              <div className="p-3 rounded bg-red-50 text-red-700 text-xs">{refundError}</div>
            )}

            <form onSubmit={handleExecuteRefund} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Refund Amount (Max: {maxRefundable.toFixed(2)} ETB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={maxRefundable.toFixed(2)}
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
                  Reason for Refund (Mandatory audit log)
                </label>
                <textarea
                  rows="3"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Explain why this refund is being issued..."
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
    </div>
  );
}
