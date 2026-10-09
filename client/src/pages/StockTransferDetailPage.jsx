import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { stockTransfersApi } from '../features/inventory/api.js';
import { storageLocationsApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function StockTransferDetailPage() {
  const { id } = useParams();

  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Modals state
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approvalLines, setApprovalLines] = useState([]);
  const [approvalNotes, setApprovalNotes] = useState('');

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [dispatchAllocations, setDispatchAllocations] = useState([]);
  const [dispatchNotes, setDispatchNotes] = useState('');

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [destLocations, setDestLocations] = useState([]);
  const [receiptAllocations, setReceiptAllocations] = useState([]);
  const [isFinalReceiving, setIsFinalReceiving] = useState(true);
  const [receivingNotes, setReceivingNotes] = useState('');

  const [discrepancyModalOpen, setDiscrepancyModalOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  async function loadTransfer() {
    setLoading(true);
    setError(null);
    try {
      const res = await stockTransfersApi.get(id);
      const data = res.data;
      setTransfer(data);

      // Pre-seed approval lines
      if (data?.lines) {
        setApprovalLines(
          data.lines.map((l) => ({
            lineId: l.id,
            productId: l.product_id,
            productName: l.product_name,
            productCode: l.product_code,
            unitName: l.unit_name,
            quantityRequested: Number(l.quantity_requested),
            quantityApproved: Number(l.quantity_approved || l.quantity_requested),
          }))
        );
      }
    } catch (err) {
      setError(err?.message || 'Failed to load transfer details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransfer();
  }, [id]);

  // Submit action
  async function handleSubmit() {
    if (!window.confirm('Submit this transfer for supervisor approval?')) return;
    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.submit(id);
      setActionSuccess('Stock transfer submitted for approval.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Failed to submit transfer.');
    } finally {
      setBusy(false);
    }
  }

  // Approve action
  async function handleApproveSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.approve(id, {
        approvedLines: approvalLines.map((l) => ({
          lineId: l.lineId,
          quantityApproved: Number(l.quantityApproved),
        })),
        approvalNotes: approvalNotes.trim() || undefined,
      });
      setApproveModalOpen(false);
      setActionSuccess('Stock transfer approved successfully.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  // Reject action
  async function handleRejectSubmit(e) {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejecting this transfer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.reject(id, {
        rejectionReason: rejectionReason.trim(),
      });
      setRejectModalOpen(false);
      setActionSuccess('Stock transfer rejected.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Rejection failed.');
    } finally {
      setBusy(false);
    }
  }

  // Cancel action
  async function handleCancelSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.cancel(id, {
        cancellationReason: cancellationReason.trim() || undefined,
      });
      setCancelModalOpen(false);
      setActionSuccess('Stock transfer cancelled.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  }

  // Open Dispatch Modal
  async function openDispatchModal() {
    setError(null);
    setBusy(true);
    try {
      const res = await stockTransfersApi.getAvailableBatches(id);
      const batches = res.data?.batches || [];
      setAvailableBatches(batches);

      // Pre-seed dispatch allocations for each approved line
      const initialAllocs = [];
      (transfer.lines || []).forEach((line) => {
        const approvedQty = Number(line.quantity_approved || line.quantity_requested);
        const matchingBatches = batches.filter((b) => b.product_id === line.product_id);
        if (matchingBatches.length > 0) {
          const firstBatch = matchingBatches[0];
          initialAllocs.push({
            transferLineId: line.id,
            productName: line.product_name,
            productCode: line.product_code,
            unitName: line.unit_name,
            batchId: firstBatch.batch_id,
            sourceStorageLocationId: firstBatch.storage_location_id,
            quantity: Math.min(approvedQty, Number(firstBatch.available_quantity)),
            maxAllowed: approvedQty,
          });
        }
      });
      setDispatchAllocations(initialAllocs);
      setDispatchModalOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to load available batches for dispatch.');
    } finally {
      setBusy(false);
    }
  }

  function handleAddDispatchRow(line) {
    const matchingBatches = availableBatches.filter((b) => b.product_id === line.product_id);
    if (matchingBatches.length === 0) return;
    const firstBatch = matchingBatches[0];
    setDispatchAllocations([
      ...dispatchAllocations,
      {
        transferLineId: line.id,
        productName: line.product_name,
        productCode: line.product_code,
        unitName: line.unit_name,
        batchId: firstBatch.batch_id,
        sourceStorageLocationId: firstBatch.storage_location_id,
        quantity: 1,
        maxAllowed: Number(line.quantity_approved),
      },
    ]);
  }

  function handleRemoveDispatchRow(idx) {
    setDispatchAllocations(dispatchAllocations.filter((_, i) => i !== idx));
  }

  function handleDispatchRowChange(idx, field, value) {
    const updated = [...dispatchAllocations];
    updated[idx][field] = value;
    if (field === 'batchId') {
      const b = availableBatches.find((item) => Number(item.batch_id) === Number(value));
      if (b) {
        updated[idx].sourceStorageLocationId = b.storage_location_id;
      }
    }
    setDispatchAllocations(updated);
  }

  async function handleDispatchSubmit(e) {
    e.preventDefault();
    if (dispatchAllocations.length === 0) {
      setError('At least one batch allocation is required for dispatch.');
      return;
    }

    for (let i = 0; i < dispatchAllocations.length; i++) {
      const a = dispatchAllocations[i];
      if (!a.batchId || !a.sourceStorageLocationId) {
        setError(`Allocation #${i + 1}: Batch and source location must be specified.`);
        return;
      }
      if (Number(a.quantity) <= 0) {
        setError(`Allocation #${i + 1}: Quantity must be greater than 0.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.dispatch(id, {
        allocations: dispatchAllocations.map((a) => ({
          transferLineId: Number(a.transferLineId),
          batchId: Number(a.batchId),
          sourceStorageLocationId: Number(a.sourceStorageLocationId),
          quantity: Number(a.quantity),
        })),
        dispatchNotes: dispatchNotes.trim() || undefined,
      });
      setDispatchModalOpen(false);
      setActionSuccess('Stock transfer dispatched! Stock is now in transit.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Dispatch failed.');
    } finally {
      setBusy(false);
    }
  }

  // Open Receive Modal
  async function openReceiveModal() {
    setError(null);
    setBusy(true);
    try {
      // Fetch destination warehouse storage locations
      const locRes = await storageLocationsApi.list({
        warehouseId: transfer.destination_warehouse_id,
        status: 'active',
        limit: 100,
      });
      const locations = locRes.data?.items || [];
      setDestLocations(locations);

      const defaultLocId = locations.length > 0 ? String(locations[0].id) : '';

      // Map batch allocations that have pending in-transit quantities
      const initialReceipts = (transfer.batch_allocations || [])
        .filter((a) => {
          const remaining = Number(a.quantity_dispatched) - Number(a.quantity_received) - Number(a.quantity_discrepancy);
          return remaining > 0;
        })
        .map((a) => {
          const remaining = Number(a.quantity_dispatched) - Number(a.quantity_received) - Number(a.quantity_discrepancy);
          return {
            batchAllocationId: a.id,
            batchNumber: a.batch_number,
            productName: a.product_name,
            productCode: a.product_code,
            quantityDispatched: Number(a.quantity_dispatched),
            remainingInTransit: remaining,
            quantityReceived: remaining,
            destinationStorageLocationId: defaultLocId,
            condition: 'good',
            discrepancyReason: '',
            isFinal: true,
          };
        });

      setReceiptAllocations(initialReceipts);
      setReceiveModalOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to prepare receipt modal.');
    } finally {
      setBusy(false);
    }
  }

  function handleReceiptChange(idx, field, value) {
    const updated = [...receiptAllocations];
    updated[idx][field] = value;
    setReceiptAllocations(updated);
  }

  async function handleReceiveSubmit(e) {
    e.preventDefault();
    if (receiptAllocations.length === 0) {
      setError('No items available to receive.');
      return;
    }

    for (let i = 0; i < receiptAllocations.length; i++) {
      const r = receiptAllocations[i];
      if (!r.destinationStorageLocationId) {
        setError(`Row #${i + 1} (${r.batchNumber}): Please select a destination storage location.`);
        return;
      }
      const qtyRec = Number(r.quantityReceived);
      if (qtyRec < 0 || qtyRec > r.remainingInTransit) {
        setError(`Row #${i + 1} (${r.batchNumber}): Received quantity must be between 0 and ${r.remainingInTransit}.`);
        return;
      }
      if (qtyRec < r.remainingInTransit && !r.discrepancyReason.trim()) {
        setError(`Row #${i + 1} (${r.batchNumber}): Shortage detected (${r.remainingInTransit - qtyRec} units missing). Please provide a discrepancy reason.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.receive(id, {
        receipts: receiptAllocations.map((r) => ({
          batchAllocationId: Number(r.batchAllocationId),
          destinationStorageLocationId: Number(r.destinationStorageLocationId),
          quantityReceived: Number(r.quantityReceived),
          condition: r.condition,
          discrepancyReason: r.discrepancyReason?.trim() || undefined,
          isFinal: Boolean(isFinalReceiving),
        })),
        isFinalReceiving: Boolean(isFinalReceiving),
        receivingNotes: receivingNotes.trim() || undefined,
      });
      setReceiveModalOpen(false);
      setActionSuccess('Stock transfer receipt recorded successfully!');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Receipt failed.');
    } finally {
      setBusy(false);
    }
  }

  // Resolve Discrepancy action
  async function handleResolveDiscrepancySubmit(e) {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      setError('Please provide resolution details/notes.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stockTransfersApi.resolveDiscrepancy(id, {
        resolutionNotes: resolutionNotes.trim(),
      });
      setDiscrepancyModalOpen(false);
      setActionSuccess('Stock discrepancy marked as resolved.');
      loadTransfer();
    } catch (err) {
      setError(err?.message || 'Failed to resolve discrepancy.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
        <p className="text-sm font-medium">Loading transfer details...</p>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Transfer record not found.</p>
        <Link to="/inventory/transfers" className="text-emerald-600 font-semibold underline mt-2 inline-block">
          Return to Transfers
        </Link>
      </div>
    );
  }

  // Stepper helper
  const steps = [
    { key: 'draft', label: '1. Draft', timestamp: transfer.created_at },
    { key: 'submitted', label: '2. Submitted', timestamp: transfer.submitted_at },
    { key: 'approved', label: '3. Approved', timestamp: transfer.approved_at },
    { key: 'in_transit', label: '4. In Transit', timestamp: transfer.dispatched_at },
    { key: 'completed', label: '5. Received', timestamp: transfer.received_at },
  ];

  const statusOrder = ['draft', 'submitted', 'approved', 'in_transit', 'completed'];
  const currentStatusIdx = statusOrder.indexOf(
    transfer.status === 'partially_received' ? 'in_transit' : transfer.status
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Link to="/inventory/transfers" className="hover:text-emerald-600">
            Stock Transfers
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-bold">{transfer.transfer_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={transfer.status} />
          {Number(transfer.has_discrepancy) === 1 && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                transfer.discrepancy_resolved
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800 animate-pulse'
              }`}
            >
              {transfer.discrepancy_resolved ? 'Discrepancy Resolved' : 'Discrepancy Flagged'}
            </span>
          )}
        </div>
      </div>

      {/* Page Header with Action Buttons */}
      <PageHeader
        title={`Transfer ${transfer.transfer_number}`}
        subtitle={`Inter-warehouse transfer from ${transfer.source_warehouse_name} to ${transfer.destination_warehouse_name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Submit Button (if draft) */}
            {transfer.status === 'draft' && (
              <Can permission="stock_transfer.submit">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSubmit}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
                >
                  Submit for Approval
                </button>
              </Can>
            )}

            {/* Approve / Reject Buttons (if submitted) */}
            {transfer.status === 'submitted' && (
              <>
                <Can permission="stock_transfer.approve">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setApproveModalOpen(true)}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 shadow-sm transition disabled:opacity-50"
                  >
                    Approve Transfer
                  </button>
                </Can>
                <Can permission="stock_transfer.reject">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejectModalOpen(true)}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </Can>
              </>
            )}

            {/* Dispatch Button (if approved) */}
            {transfer.status === 'approved' && (
              <Can permission="stock_transfer.dispatch">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openDispatchModal}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  Dispatch Transfer
                </button>
              </Can>
            )}

            {/* Receive Button (if in_transit or partially_received) */}
            {['in_transit', 'partially_received'].includes(transfer.status) && (
              <Can permission="stock_transfer.receive">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openReceiveModal}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Receive Stock
                </button>
              </Can>
            )}

            {/* Resolve Discrepancy Button (if flagged & unresolved) */}
            {Number(transfer.has_discrepancy) === 1 && !transfer.discrepancy_resolved && (
              <Can permission="stock_transfer.resolve_discrepancy">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDiscrepancyModalOpen(true)}
                  className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700 shadow-sm transition disabled:opacity-50"
                >
                  Resolve Discrepancy
                </button>
              </Can>
            )}

            {/* Cancel Button (permitted only before dispatch: draft, submitted, approved) */}
            {['draft', 'submitted', 'approved'].includes(transfer.status) && (
              <Can permission="stock_transfer.cancel">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelModalOpen(true)}
                  className="rounded-lg border border-rose-300 text-rose-700 bg-white px-3 py-2 text-sm font-medium hover:bg-rose-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </Can>
            )}
          </div>
        }
      />

      {/* Success Notification */}
      {actionSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-600 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Lifecycle Stepper Card */}
      {!['rejected', 'cancelled'].includes(transfer.status) ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="grid grid-cols-5 gap-2 relative">
            {steps.map((st, i) => {
              const isPastOrCurrent = currentStatusIdx >= i;
              const isCurrent = currentStatusIdx === i;
              return (
                <div key={st.key} className="text-center relative">
                  <div
                    className={`h-2 rounded-full mb-3 transition-colors ${
                      isPastOrCurrent ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`text-xs font-semibold ${
                      isCurrent
                        ? 'text-emerald-700'
                        : isPastOrCurrent
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {st.label}
                  </div>
                  {st.timestamp && (
                    <div className="text-[10px] text-slate-400 mt-1">
                      {new Date(st.timestamp).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={`p-4 rounded-xl border font-medium text-sm flex items-center gap-3 ${
            transfer.status === 'rejected'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-slate-100 border-slate-300 text-slate-700'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            Transfer {transfer.status.toUpperCase()}:{' '}
            {transfer.rejection_reason || transfer.cancellation_reason || 'No specific reason provided.'}
          </div>
        </div>
      )}

      {/* Discrepancy Alert Banner */}
      {Number(transfer.has_discrepancy) === 1 && (
        <div
          className={`p-4 rounded-xl border ${
            transfer.discrepancy_resolved
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>{transfer.discrepancy_resolved ? 'Discrepancy Resolved' : 'Transit Discrepancy Flagged'}</span>
              </div>
              <p className="text-xs mt-1">
                {transfer.discrepancy_resolved
                  ? `Resolution Notes: ${transfer.discrepancy_resolution_notes || 'Resolved without extra notes.'}`
                  : 'A discrepancy exists between dispatched and received quantities. Please review batch allocation discrepancies below.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Location & Metadata Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Origin Location
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{transfer.source_warehouse_name}</div>
            <div className="text-xs text-slate-500">Branch: {transfer.source_branch_name}</div>
          </div>
          <div className="text-xs text-slate-600 border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400 block">Created By:</span>
              <span className="font-medium text-slate-700">{transfer.created_by_name || 'System'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Dispatched By:</span>
              <span className="font-medium text-slate-700">
                {transfer.dispatched_by_name || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Destination Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Destination Location
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{transfer.destination_warehouse_name}</div>
            <div className="text-xs text-slate-500">Branch: {transfer.destination_branch_name}</div>
          </div>
          <div className="text-xs text-slate-600 border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400 block">Approved By:</span>
              <span className="font-medium text-slate-700">{transfer.approved_by_name || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Received By:</span>
              <span className="font-medium text-slate-700">{transfer.received_by_name || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes / Reason */}
      {(transfer.notes || transfer.approval_notes || transfer.dispatch_notes || transfer.receiving_notes) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Transfer Notes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {transfer.notes && (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                <span className="font-semibold text-slate-600 block mb-0.5">Transfer Reason / Request Notes:</span>
                <span className="text-slate-800">{transfer.notes}</span>
              </div>
            )}
            {transfer.approval_notes && (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                <span className="font-semibold text-slate-600 block mb-0.5">Approval Notes:</span>
                <span className="text-slate-800">{transfer.approval_notes}</span>
              </div>
            )}
            {transfer.dispatch_notes && (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                <span className="font-semibold text-slate-600 block mb-0.5">Dispatch Notes:</span>
                <span className="text-slate-800">{transfer.dispatch_notes}</span>
              </div>
            )}
            {transfer.receiving_notes && (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                <span className="font-semibold text-slate-600 block mb-0.5">Receiving Notes:</span>
                <span className="text-slate-800">{transfer.receiving_notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Lines Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-800 border-b border-slate-100 pb-3">
          Transfer Product Lines
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5">Unit</th>
                <th className="px-3 py-2.5 text-right">Requested</th>
                <th className="px-3 py-2.5 text-right">Approved</th>
                <th className="px-3 py-2.5 text-right">Dispatched</th>
                <th className="px-3 py-2.5 text-right">Received</th>
                <th className="px-3 py-2.5 text-right">Discrepancy</th>
                <th className="px-3 py-2.5 text-right">In Transit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {(transfer.lines || []).map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{line.product_name}</div>
                    <div className="text-xs text-slate-400">{line.product_code}</div>
                  </td>
                  <td className="px-3 py-3">{line.unit_name}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-800">
                    {Number(line.quantity_requested)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {line.quantity_approved !== null ? Number(line.quantity_approved) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {Number(line.quantity_dispatched || 0)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                    {Number(line.quantity_received || 0)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-rose-600">
                    {Number(line.quantity_discrepancy || 0)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-sky-700">
                    {Number(line.quantity_in_transit || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Allocations Table */}
      {(transfer.batch_allocations || []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Batch Allocations & Tracking</h2>
              <p className="text-xs text-slate-500">
                Itemized batch numbers, physical storage locations, and dispatch/receipt logs
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Batch #</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Expiry Date</th>
                  <th className="px-3 py-2.5">Source Location</th>
                  <th className="px-3 py-2.5">Dest Location</th>
                  <th className="px-3 py-2.5 text-right">Dispatched</th>
                  <th className="px-3 py-2.5 text-right">Received</th>
                  <th className="px-3 py-2.5 text-right">Discrepancy</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {transfer.batch_allocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{alloc.batch_number}</td>
                    <td className="px-3 py-2.5">{alloc.product_name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {alloc.expiry_date ? new Date(alloc.expiry_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">
                      {alloc.source_location_name || 'Default Source'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">
                      {alloc.destination_location_name || 'Pending Receipt'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                      {Number(alloc.quantity_dispatched)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      {Number(alloc.quantity_received)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-rose-600">
                      {Number(alloc.quantity_discrepancy) > 0 ? (
                        <span title={alloc.discrepancy_reason || 'Discrepancy'}>
                          {Number(alloc.quantity_discrepancy)}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={alloc.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Movement Ledger History */}
      {(transfer.movements || []).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b border-slate-100 pb-3">
            Inventory Movement Ledger (Audit Trail)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Movement Type</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Batch #</th>
                  <th className="px-3 py-2">Warehouse</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {transfer.movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.movement_type === 'transfer_in'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-slate-800">{m.product_name}</td>
                    <td className="px-3 py-2">{m.batch_number}</td>
                    <td className="px-3 py-2 font-sans text-slate-700">{m.warehouse_name}</td>
                    <td
                      className={`px-3 py-2 text-right font-bold ${
                        Number(m.quantity) > 0 ? 'text-emerald-700' : 'text-slate-800'
                      }`}
                    >
                      {Number(m.quantity) > 0 ? `+${Number(m.quantity)}` : Number(m.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------- MODALS -------------------- */}

      {/* APPROVE MODAL */}
      {approveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Approve Stock Transfer
            </h3>
            <form onSubmit={handleApproveSubmit} className="space-y-4">
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5">Requested</th>
                      <th className="p-2.5 w-32">Approved Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvalLines.map((line, idx) => (
                      <tr key={line.lineId}>
                        <td className="p-2.5">
                          <div className="font-semibold text-slate-800">{line.productName}</div>
                          <div className="text-slate-400">{line.unitName}</div>
                        </td>
                        <td className="p-2.5 font-medium">{line.quantityRequested}</td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantityApproved}
                            onChange={(e) => {
                              const updated = [...approvalLines];
                              updated[idx].quantityApproved = e.target.value;
                              setApprovalLines(updated);
                            }}
                            required
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:ring-1 focus:ring-teal-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Approval Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Notes for source warehouse dispatchers..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  Confirm Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Reject Stock Transfer
            </h3>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this transfer is rejected..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Cancel Stock Transfer
            </h3>
            <p className="text-xs text-slate-500">
              Note: Transfers cannot be cancelled once dispatched because physical stock has already left the origin warehouse.
            </p>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Cancellation Reason (Optional)
                </label>
                <textarea
                  rows="3"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Reason for cancelling this transfer..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISPATCH MODAL */}
      {dispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-lg font-bold text-slate-900">Dispatch Stock Transfer</h3>
              <span className="text-xs text-slate-400">Allocate batches from source warehouse</span>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Line Product</th>
                      <th className="p-2.5">Batch & Stock (FEFO)</th>
                      <th className="p-2.5 w-28">Quantity</th>
                      <th className="p-2.5 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatchAllocations.map((alloc, idx) => {
                      const line = (transfer.lines || []).find((l) => l.id === alloc.transferLineId);
                      const matchingBatches = availableBatches.filter(
                        (b) => b.product_id === line?.product_id
                      );

                      return (
                        <tr key={idx}>
                          <td className="p-2.5">
                            <div className="font-semibold text-slate-800">{alloc.productName}</div>
                            <div className="text-[11px] text-slate-500">
                              Approved: {alloc.maxAllowed} {alloc.unitName}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <select
                              value={alloc.batchId}
                              onChange={(e) => handleDispatchRowChange(idx, 'batchId', e.target.value)}
                              required
                              className="w-full rounded border border-slate-300 p-1.5 text-xs bg-white"
                            >
                              {matchingBatches.map((b) => (
                                <option key={b.batch_id} value={b.batch_id}>
                                  Batch {b.batch_number} (Avail: {b.available_quantity}, Exp:{' '}
                                  {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={alloc.quantity}
                              onChange={(e) => handleDispatchRowChange(idx, 'quantity', e.target.value)}
                              required
                              className="w-full rounded border border-slate-300 p-1.5 text-xs"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveDispatchRow(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add Split Allocation for lines */}
              <div className="flex flex-wrap gap-2 text-xs">
                {(transfer.lines || []).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleAddDispatchRow(l)}
                    className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 hover:bg-slate-100 text-slate-700"
                  >
                    + Split batch for {l.product_name}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Dispatch Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Carrier tracking #, driver name, vehicle info..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDispatchModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  Confirm & Dispatch Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIVE MODAL */}
      {receiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-lg font-bold text-slate-900">Receive Inbound Stock</h3>
              <span className="text-xs text-slate-400">Destination Warehouse: {transfer.destination_warehouse_name}</span>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Batch / Product</th>
                      <th className="p-2.5 w-24">In Transit</th>
                      <th className="p-2.5 w-24">Qty Received</th>
                      <th className="p-2.5 w-44">Target Storage Loc</th>
                      <th className="p-2.5 w-28">Condition</th>
                      <th className="p-2.5">Discrepancy Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receiptAllocations.map((item, idx) => (
                      <tr key={item.batchAllocationId}>
                        <td className="p-2.5">
                          <div className="font-mono font-semibold text-slate-800">{item.batchNumber}</div>
                          <div className="text-slate-500">{item.productName}</div>
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">{item.remainingInTransit}</td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0"
                            max={item.remainingInTransit}
                            step="any"
                            value={item.quantityReceived}
                            onChange={(e) => handleReceiptChange(idx, 'quantityReceived', e.target.value)}
                            required
                            className="w-full rounded border border-slate-300 p-1.5 text-xs font-semibold text-emerald-800"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.destinationStorageLocationId}
                            onChange={(e) =>
                              handleReceiptChange(idx, 'destinationStorageLocationId', e.target.value)
                            }
                            required
                            className="w-full rounded border border-slate-300 p-1.5 text-xs bg-white"
                          >
                            <option value="">Select location...</option>
                            {destLocations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.condition}
                            onChange={(e) => handleReceiptChange(idx, 'condition', e.target.value)}
                            className="w-full rounded border border-slate-300 p-1.5 text-xs bg-white"
                          >
                            <option value="good">Good</option>
                            <option value="damaged">Damaged</option>
                            <option value="shortage">Shortage</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            placeholder="Reason if short/damaged"
                            value={item.discrepancyReason}
                            onChange={(e) => handleReceiptChange(idx, 'discrepancyReason', e.target.value)}
                            className="w-full rounded border border-slate-300 p-1.5 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="finalRec"
                  checked={isFinalReceiving}
                  onChange={(e) => setIsFinalReceiving(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="finalRec" className="text-xs font-medium text-slate-700">
                  Mark as Final Receiving (Closes transfer; any unreceived balance recorded as discrepancy)
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Receiving Inspection Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  value={receivingNotes}
                  onChange={(e) => setReceivingNotes(e.target.value)}
                  placeholder="Notes on packaging, seal integrity, temperature during transit..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReceiveModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Confirm & Post Received Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOLVE DISCREPANCY MODAL */}
      {discrepancyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Resolve Transfer Discrepancy
            </h3>
            <form onSubmit={handleResolveDiscrepancySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Resolution Disposition & Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Document courier claim, loss write-off, or investigation outcome..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDiscrepancyModalOpen(false)}
                  className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Mark Discrepancy Resolved
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
