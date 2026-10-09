import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supplierReturnsApi } from '../features/returns/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function SupplierReturnDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [returnRecord, setReturnRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);

  async function loadReturn() {
    setLoading(true);
    setError(null);
    try {
      const res = await supplierReturnsApi.get(id);
      setReturnRecord(res.data?.supplierReturn);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load supplier return details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReturn();
  }, [id]);

  async function handleSubmitOrder() {
    if (!window.confirm('Submit this return order for review?')) return;
    setSubmitting(true);
    try {
      await supplierReturnsApi.submit(id);
      setActionSuccess('Supplier return order submitted.');
      loadReturn();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproveOrder() {
    if (!window.confirm('Approve this supplier return order for dispatch?')) return;
    setApproving(true);
    try {
      await supplierReturnsApi.approve(id);
      setActionSuccess('Supplier return order approved.');
      loadReturn();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Approval failed.');
    } finally {
      setApproving(false);
    }
  }

  async function handleCompleteOrder() {
    if (!window.confirm('Dispatch return goods to supplier? This will deduct physical inventory and record signed stock movements.')) {
      return;
    }
    setCompleting(true);
    try {
      await supplierReturnsApi.complete(id);
      setActionSuccess('Supplier return completed. Physical inventory has been deducted.');
      loadReturn();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Dispatch completion failed.');
    } finally {
      setCompleting(false);
    }
  }

  async function handleCancelSubmit(e) {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setCancelError('Cancellation reason is required.');
      return;
    }
    setCancelLoading(true);
    setCancelError('');
    try {
      await supplierReturnsApi.cancel(id, {
        reason: cancellationReason.trim(),
      });
      setCancelModalOpen(false);
      setActionSuccess('Supplier return cancelled.');
      loadReturn();
    } catch (err) {
      setCancelError(err?.response?.data?.error?.message || err.message || 'Cancellation failed.');
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading return details...</div>;
  }

  if (error || !returnRecord) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-700">
          {error || 'Return order not found'}
        </div>
        <Link to="/returns/supplier" className="mt-4 inline-block text-emerald-600 hover:underline">
          ← Back to Supplier Returns
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={`Supplier Return #${returnRecord.return_number}`}
        subtitle={`Linked to Receipt #${returnRecord.receipt_number} • Created ${new Date(returnRecord.created_at).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/returns/supplier"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ← Back
            </Link>

            {returnRecord.status === 'draft' && (
              <Can permission="supplier_return.create">
                <button
                  disabled={submitting}
                  onClick={handleSubmitOrder}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  {submitting ? 'Submitting...' : 'Submit Order'}
                </button>
              </Can>
            )}

            {(returnRecord.status === 'draft' || returnRecord.status === 'submitted') && (
              <Can permission="supplier_return.approve">
                <button
                  disabled={approving}
                  onClick={handleApproveOrder}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  {approving ? 'Approving...' : 'Approve Order'}
                </button>
              </Can>
            )}

            {returnRecord.status === 'approved' && (
              <Can permission="supplier_return.complete">
                <button
                  disabled={completing}
                  onClick={handleCompleteOrder}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  {completing ? 'Deducting Stock...' : 'Dispatch & Complete Return'}
                </button>
              </Can>
            )}

            {returnRecord.status !== 'completed' && returnRecord.status !== 'cancelled' && (
              <Can permission="supplier_return.cancel">
                <button
                  onClick={() => setCancelModalOpen(true)}
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition"
                >
                  Cancel Order
                </button>
              </Can>
            )}
          </div>
        }
      />

      {actionSuccess && (
        <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Meta Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core State */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold uppercase text-slate-500">Status</span>
            <StatusBadge status={returnRecord.status} />
          </div>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Supplier:</span>
              <span className="font-semibold text-slate-900">{returnRecord.supplier_name}</span>
              {returnRecord.supplier_telephone && <span className="text-xs text-slate-500 block">{returnRecord.supplier_telephone}</span>}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Branch & Warehouse:</span>
              <span className="font-medium text-slate-800">{returnRecord.branch_name} • {returnRecord.warehouse_name}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Original Goods Receipt:</span>
              <span className="text-slate-800">{returnRecord.receipt_number} (dated {new Date(returnRecord.receipt_date).toLocaleDateString()})</span>
            </div>
          </div>
        </div>

        {/* Reason & Notes */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
            Return Justification
          </h4>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Reason:</span>
              <p className="text-slate-900 font-medium italic">"{returnRecord.reason}"</p>
            </div>
            {returnRecord.notes && (
              <div>
                <span className="text-slate-500 text-xs block">Notes / Shipping Ref:</span>
                <span className="text-slate-700 text-xs">{returnRecord.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Financial Reference */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
            Order Value & AP Boundary
          </h4>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Total Return Value:</span>
              <span className="text-lg font-bold text-slate-900">
                {Number(returnRecord.total_amount || 0).toFixed(2)} ETB
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Accounts Payable Settlement:</span>
              <span className="text-xs text-slate-500 block">
                Deferred. Records physical return order and stock movements; supplier debit note adjustment is tracked in procurement reconciliation.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lines Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Items Dispatched to Supplier
          </h3>
          <span className="text-xs text-slate-500">
            {returnRecord.lines?.length || 0} line items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Batch & Expiry</th>
                <th className="px-4 py-3 text-center">Return Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Line Total</th>
                <th className="px-4 py-3">Defect / Return Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {returnRecord.lines?.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{line.product_name}</div>
                    <div className="text-xs text-slate-500">{line.product_code} • {line.unit_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-900">{line.batch_number}</div>
                    <div className="text-xs text-slate-400">Exp: {new Date(line.expiry_date).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-900">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {Number(line.unit_price).toFixed(2)} ETB
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {Number(line.line_total).toFixed(2)} ETB
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {line.reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit History Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
          Audit History & Actors
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block">Created By:</span>
            <span className="font-medium text-slate-800">{returnRecord.creator_name}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Approved By:</span>
            <span className="font-medium text-slate-800">
              {returnRecord.approver_name ? `${returnRecord.approver_name} at ${new Date(returnRecord.approved_at).toLocaleString()}` : 'Not approved yet'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Completed By:</span>
            <span className="font-medium text-slate-800">
              {returnRecord.completer_name ? `${returnRecord.completer_name} at ${new Date(returnRecord.completed_at).toLocaleString()}` : 'Not dispatched yet'}
            </span>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Supplier Return Order</h3>
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Cancellation Reason *
                </label>
                <textarea
                  rows="3"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Reason for cancelling supplier return order..."
                  className="w-full rounded border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {cancelError && (
                <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
                  {cancelError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="rounded bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  {cancelLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
