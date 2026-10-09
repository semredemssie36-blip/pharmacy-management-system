import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { customerReturnsApi } from '../features/returns/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function CustomerReturnDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [returnRecord, setReturnRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectionLines, setInspectionLines] = useState([]);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState('');

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveOutcome, setApproveOutcome] = useState('refund');
  const [approveRefundAmount, setApproveRefundAmount] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState('');

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState('');

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const [completing, setCompleting] = useState(false);

  async function loadReturn() {
    setLoading(true);
    setError(null);
    try {
      const res = await customerReturnsApi.get(id);
      const data = res.data?.customerReturn;
      setReturnRecord(data);

      // Pre-seed inspection lines
      if (data?.lines) {
        setInspectionLines(
          data.lines.map((l) => ({
            id: l.id,
            product_name: l.product_name,
            batch_number: l.batch_number,
            quantity: l.quantity,
            conditionState: l.condition_state || 'sealed_intact',
            disposition: l.disposition !== 'none' ? l.disposition : 'quarantine',
            dispositionNotes: l.disposition_notes || '',
          })),
        );
      }
      setApproveRefundAmount(String(data?.refund_amount || ''));
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load customer return details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReturn();
  }, [id]);

  async function handleSubmitReturn() {
    if (!window.confirm('Submit this return for inspection?')) return;
    try {
      await customerReturnsApi.submit(id);
      setActionSuccess('Return submitted for inspection.');
      loadReturn();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Submit failed.');
    }
  }

  async function handleInspectSubmit(e) {
    e.preventDefault();
    setInspectLoading(true);
    setInspectError('');
    try {
      // Validate inspection safety
      for (const l of inspectionLines) {
        if (l.disposition === 'return_to_stock' && l.conditionState !== 'sealed_intact') {
          throw new Error(`Item ${l.product_name} cannot be returned to stock because it is not sealed intact.`);
        }
      }

      await customerReturnsApi.inspect(id, {
        lines: inspectionLines.map((l) => ({
          id: l.id,
          conditionState: l.conditionState,
          disposition: l.disposition,
          dispositionNotes: l.dispositionNotes || undefined,
        })),
        notes: inspectionNotes || undefined,
      });

      setInspectModalOpen(false);
      setActionSuccess('Inspection and stock disposition recommendations saved.');
      loadReturn();
    } catch (err) {
      setInspectError(err?.response?.data?.error?.message || err.message || 'Inspection update failed.');
    } finally {
      setInspectLoading(false);
    }
  }

  async function handleApproveSubmit(e) {
    e.preventDefault();
    setApproveLoading(true);
    setApproveError('');
    try {
      await customerReturnsApi.approve(id, {
        outcome: approveOutcome,
        refundAmount: approveRefundAmount ? Number(approveRefundAmount) : undefined,
      });

      setApproveModalOpen(false);
      setActionSuccess('Customer return approved.');
      loadReturn();
    } catch (err) {
      setApproveError(err?.response?.data?.error?.message || err.message || 'Approval failed.');
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRejectSubmit(e) {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setRejectError('Rejection reason is required.');
      return;
    }
    setRejectLoading(true);
    setRejectError('');
    try {
      await customerReturnsApi.reject(id, {
        rejectionReason: rejectionReason.trim(),
      });

      setRejectModalOpen(false);
      setActionSuccess('Customer return rejected.');
      loadReturn();
    } catch (err) {
      setRejectError(err?.response?.data?.error?.message || err.message || 'Rejection failed.');
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleCompleteReturn() {
    if (!window.confirm('Complete return? This will commit physical inventory disposition and execute financial refund/credit adjustments.')) {
      return;
    }
    setCompleting(true);
    try {
      await customerReturnsApi.complete(id);
      setActionSuccess('Return completed successfully. Inventory disposition and refund settlement applied.');
      loadReturn();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Completion failed.');
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
      await customerReturnsApi.cancel(id, {
        reason: cancellationReason.trim(),
      });

      setCancelModalOpen(false);
      setActionSuccess('Customer return cancelled.');
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
          {error || 'Return not found'}
        </div>
        <Link to="/returns/customer" className="mt-4 inline-block text-emerald-600 hover:underline">
          ← Back to Returns
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title={`Return #${returnRecord.return_number}`}
        subtitle={`Linked to Sale #${returnRecord.sale_number} • Created ${new Date(returnRecord.created_at).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/returns/customer"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              ← Back
            </Link>

            {returnRecord.status === 'draft' && (
              <Can permission="customer_return.create">
                <button
                  onClick={handleSubmitReturn}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Submit for Inspection
                </button>
              </Can>
            )}

            {(returnRecord.status === 'submitted' || returnRecord.status === 'pending_inspection') && (
              <Can permission="customer_return.inspect">
                <button
                  onClick={() => setInspectModalOpen(true)}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
                >
                  Inspect & Set Disposition
                </button>
              </Can>
            )}

            {(returnRecord.status === 'pending_inspection' || returnRecord.status === 'submitted') && (
              <>
                <Can permission="customer_return.approve">
                  <button
                    onClick={() => setApproveModalOpen(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Approve Return
                  </button>
                </Can>
                <Can permission="customer_return.reject">
                  <button
                    onClick={() => setRejectModalOpen(true)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition"
                  >
                    Reject
                  </button>
                </Can>
              </>
            )}

            {returnRecord.status === 'approved' && (
              <Can permission="customer_return.complete">
                <button
                  disabled={completing}
                  onClick={handleCompleteReturn}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  {completing ? 'Completing...' : 'Complete & Commit Return'}
                </button>
              </Can>
            )}

            {returnRecord.status !== 'completed' && returnRecord.status !== 'cancelled' && returnRecord.status !== 'rejected' && (
              <Can permission="customer_return.cancel">
                <button
                  onClick={() => setCancelModalOpen(true)}
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition"
                >
                  Cancel Return
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

      {/* Meta Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold uppercase text-slate-500">Lifecycle State</span>
            <StatusBadge status={returnRecord.status} />
          </div>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Customer:</span>
              <span className="font-semibold text-slate-900">{returnRecord.customer_name || 'Walk-in Customer'}</span>
              {returnRecord.customer_telephone && <span className="text-xs text-slate-500 block">{returnRecord.customer_telephone}</span>}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Branch & Warehouse:</span>
              <span className="font-medium text-slate-800">{returnRecord.branch_name} • {returnRecord.warehouse_name}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Created By:</span>
              <span className="text-slate-800">{returnRecord.creator_name}</span>
            </div>
          </div>
        </div>

        {/* Reason & Outcome */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
            Decision & Reason
          </h4>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Stated Reason:</span>
              <p className="text-slate-900 font-medium italic">"{returnRecord.reason}"</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Approved Outcome:</span>
              <span className="capitalize font-semibold text-slate-900">{returnRecord.outcome}</span>
            </div>
            {returnRecord.notes && (
              <div>
                <span className="text-slate-500 text-xs block">Internal Notes:</span>
                <span className="text-slate-700 text-xs">{returnRecord.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Financial Settlement */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
            Financial Settlement
          </h4>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-slate-500 text-xs block">Refund / Value Amount:</span>
              <span className="text-lg font-bold text-emerald-700">
                {Number(returnRecord.refund_amount || 0).toFixed(2)} ETB
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Refund Transaction:</span>
              {returnRecord.refund_id ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ Refund Issued (#{returnRecord.refund_id})
                </span>
              ) : returnRecord.status === 'completed' && returnRecord.outcome === 'refund' ? (
                <span className="text-xs text-amber-700 font-medium">
                  Adjusted against unpaid customer credit balance
                </span>
              ) : (
                <span className="text-xs text-slate-400">Pending return completion</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Original Sale Paid Amount:</span>
              <span className="text-slate-800 text-xs">
                {Number(returnRecord.sale_paid_amount || 0).toFixed(2)} ETB ({returnRecord.sale_payment_status})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Returned Medicines & Inspection Dispositions
          </h3>
          <span className="text-xs text-slate-500">
            {returnRecord.lines?.length || 0} items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Batch & Expiry</th>
                <th className="px-4 py-3 text-center">Returned Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Line Total</th>
                <th className="px-4 py-3">Condition State</th>
                <th className="px-4 py-3">Stock Disposition</th>
                <th className="px-4 py-3">Disposition Notes</th>
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
                  <td className="px-4 py-3">
                    <span className="capitalize text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {line.condition_state?.replace(/_/g, ' ') || 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {line.disposition && line.disposition !== 'none' ? (
                      <StatusBadge status={line.disposition} />
                    ) : (
                      <span className="text-xs text-slate-400 italic">Not inspected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                    {line.disposition_notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traceability / Audit Trail */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <h4 className="text-xs font-semibold uppercase text-slate-500 border-b border-slate-100 pb-2">
          Audit History & Actors
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block">Inspected By:</span>
            <span className="font-medium text-slate-800">
              {returnRecord.inspector_name ? `${returnRecord.inspector_name} at ${new Date(returnRecord.inspected_at).toLocaleString()}` : 'Not inspected yet'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Approved By:</span>
            <span className="font-medium text-slate-800">
              {returnRecord.approver_name ? `${returnRecord.approver_name} at ${new Date(returnRecord.approved_at).toLocaleString()}` : 'Not approved yet'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Exceptions / Rejection:</span>
            <span className="text-rose-600 font-medium">
              {returnRecord.rejection_reason || returnRecord.cancelled_reason || 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Modal: Inspection & Disposition */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">
              Pharmacist Inspection & Stock Disposition
            </h3>
            <p className="text-xs text-slate-500">
              Inspect physical medicine condition. Unsealed or compromised medicine cannot be returned to available stock.
            </p>

            <form onSubmit={handleInspectSubmit} className="space-y-4">
              <div className="space-y-4 divide-y divide-slate-100">
                {inspectionLines.map((line, idx) => (
                  <div key={line.id} className="pt-3 first:pt-0 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm text-slate-800">
                        {line.product_name} ({line.quantity} units, Batch {line.batch_number})
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Condition State *
                        </label>
                        <select
                          value={line.conditionState}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInspectionLines((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, conditionState: val } : item)),
                            );
                          }}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="sealed_intact">Sealed & Intact</option>
                          <option value="opened">Opened</option>
                          <option value="damaged">Damaged</option>
                          <option value="expired">Expired</option>
                          <option value="unknown">Unknown / Suspect</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Stock Disposition Decision *
                        </label>
                        <select
                          value={line.disposition}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInspectionLines((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, disposition: val } : item)),
                            );
                          }}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="quarantine">Quarantine (Recommended)</option>
                          <option value="return_to_stock">Return to Available Stock (Sealed Only)</option>
                          <option value="damaged">Classify as Damaged Stock</option>
                          <option value="awaiting_disposal">Awaiting Disposal</option>
                          <option value="none">None (No inventory change)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Inspector notes for this item (e.g. foil intact, batch seal verified)..."
                        value={line.dispositionNotes}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInspectionLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, dispositionNotes: val } : item)),
                          );
                        }}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Overall Inspection Summary
                </label>
                <textarea
                  rows="2"
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder="Clinical assessment observations..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {inspectError && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                  {inspectError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setInspectModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inspectLoading}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  {inspectLoading ? 'Saving...' : 'Submit Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Approve */}
      {approveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Approve Customer Return</h3>
            <form onSubmit={handleApproveSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
                <select
                  value={approveOutcome}
                  onChange={(e) => setApproveOutcome(e.target.value)}
                  className="w-full rounded border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="refund">Approved Refund</option>
                  <option value="exchange">Exchange / Replacement</option>
                  <option value="no_refund">Approved Without Refund</option>
                </select>
              </div>

              {approveOutcome === 'refund' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Refund Amount (ETB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={approveRefundAmount}
                    onChange={(e) => setApproveRefundAmount(e.target.value)}
                    className="w-full rounded border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              )}

              {approveError && (
                <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
                  {approveError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={approveLoading}
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {approveLoading ? 'Approving...' : 'Confirm Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reject */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reject Customer Return</h3>
            <form onSubmit={handleRejectSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows="3"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Mandatory reason for rejecting customer return..."
                  className="w-full rounded border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {rejectError && (
                <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
                  {rejectError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectLoading}
                  className="rounded bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  {rejectLoading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cancel */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Customer Return</h3>
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Cancellation Reason *
                </label>
                <textarea
                  rows="3"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Reason for cancelling return request..."
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
