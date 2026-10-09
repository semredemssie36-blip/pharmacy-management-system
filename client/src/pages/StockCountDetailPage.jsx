import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { stockCountsApi } from '../features/inventory/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function StockCountDetailPage() {
  const { id } = useParams();

  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Line count modal state
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [activeLine, setActiveLine] = useState(null);
  const [countInputQty, setCountInputQty] = useState('');
  const [countReason, setCountReason] = useState('Physical counting variance');
  const [countNotes, setCountNotes] = useState('');

  // Recount modal state
  const [recountModalOpen, setRecountModalOpen] = useState(false);
  const [recountLine, setRecountLine] = useState(null);
  const [recountReason, setRecountReason] = useState('');

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Filter lines state in UI
  const [lineFilter, setLineFilter] = useState('all'); // all, uncounted, counted, discrepancy

  async function loadCount() {
    setLoading(true);
    setError(null);
    try {
      const res = await stockCountsApi.get(id);
      setCount(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to load stock count session.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCount();
  }, [id]);

  // Actions
  async function handleStartCount() {
    if (!window.confirm('Start stock count? This will freeze the initial snapshot of stock balances for eligible batches.')) {
      return;
    }
    setBusy(true);
    setError(null);
    setActionSuccess('');
    try {
      await stockCountsApi.start(id);
      setActionSuccess('Stock count session started and inventory snapshot generated successfully.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to start count session.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitCount() {
    const uncounted = (count?.lines || []).filter((l) => Number(l.is_counted) !== 1).length;
    if (uncounted > 0) {
      if (!window.confirm(`Warning: There are ${uncounted} UNCOUNTED lines. These will be left unadjusted. Do you want to submit for supervisor review?`)) {
        return;
      }
    } else {
      if (!window.confirm('Submit this stock count for supervisor review? Count inputs will be locked.')) {
        return;
      }
    }

    setBusy(true);
    setError(null);
    setActionSuccess('');
    try {
      await stockCountsApi.submit(id);
      setActionSuccess('Stock count submitted for supervisor approval.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to submit stock count.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!window.confirm('Approve all verified variances for this stock count?')) return;
    setBusy(true);
    setError(null);
    setActionSuccess('');
    try {
      await stockCountsApi.approve(id);
      setActionSuccess('Stock count variances approved. You may now apply stock adjustments.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to approve stock count.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyAdjustments() {
    if (!window.confirm('AUTHORITATIVE ACTION: Apply stock adjustments to inventory ledger? Positive variances will increase stock and negative variances will decrease stock.')) {
      return;
    }
    setBusy(true);
    setError(null);
    setActionSuccess('');
    try {
      await stockCountsApi.apply(id);
      setActionSuccess('Stock adjustments successfully applied to inventory records and stock ledger.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to apply stock adjustments.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectSubmit(e) {
    e.preventDefault();
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejecting the stock count.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stockCountsApi.reject(id, { reason: rejectReason.trim() });
      setRejectModalOpen(false);
      setRejectReason('');
      setActionSuccess('Stock count rejected.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to reject stock count.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await stockCountsApi.cancel(id, { reason: cancelReason.trim() || undefined });
      setCancelModalOpen(false);
      setCancelReason('');
      setActionSuccess('Stock count cancelled.');
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to cancel stock count.');
    } finally {
      setBusy(false);
    }
  }

  function openRecordCountModal(line) {
    setActiveLine(line);
    setCountInputQty(line.counted_quantity !== null ? String(line.counted_quantity) : '');
    setCountReason(line.discrepancy_reason || 'Physical counting variance');
    setCountNotes(line.notes || '');
    setCountModalOpen(true);
  }

  async function handleSaveCountEntry(e) {
    e.preventDefault();
    if (countInputQty === '' || isNaN(Number(countInputQty)) || Number(countInputQty) < 0) {
      alert('Please provide a valid non-negative physical count quantity.');
      return;
    }

    const qty = Number(countInputQty);
    const variance = qty - Number(activeLine.system_quantity);

    if (variance !== 0 && !countReason.trim()) {
      alert('A discrepancy reason is required when counted quantity differs from system balance.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await stockCountsApi.recordCount(id, {
        lineId: activeLine.id,
        countedQuantity: qty,
        discrepancyReason: variance !== 0 ? countReason : undefined,
        notes: countNotes.trim() || undefined,
      });
      setCountModalOpen(false);
      setActiveLine(null);
      setActionSuccess(`Count recorded for ${activeLine.product_name} (${qty} units).`);
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to record count entry.');
    } finally {
      setBusy(false);
    }
  }

  async function handleZeroCountQuick(line) {
    if (!window.confirm(`Mark ${line.product_name} (Batch: ${line.batch_number}) as EXPLICIT ZERO (empty shelf)?`)) return;
    setBusy(true);
    setError(null);
    try {
      await stockCountsApi.recordCount(id, {
        lineId: line.id,
        countedQuantity: 0,
        discrepancyReason: Number(line.system_quantity) > 0 ? 'Missing or misplaced stock' : 'Zero physical balance confirmed',
        notes: 'Quick zero count confirmed by counter',
      });
      setActionSuccess(`Marked ${line.product_name} as explicit 0 count.`);
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to mark zero count.');
    } finally {
      setBusy(false);
    }
  }

  function openRecountModal(line) {
    setRecountLine(line);
    setRecountReason('');
    setRecountModalOpen(true);
  }

  async function handleSaveRecount(e) {
    e.preventDefault();
    if (!recountReason.trim()) {
      alert('Please provide a reason requesting a recount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stockCountsApi.recount(id, {
        lineId: recountLine.id,
        reason: recountReason.trim(),
      });
      setRecountModalOpen(false);
      setRecountLine(null);
      setActionSuccess(`Line flagged for recount.`);
      loadCount();
    } catch (err) {
      setError(err?.message || 'Failed to request recount.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Loading stock count details...</div>;
  }

  if (!count) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-semibold mb-4">Stock count session not found.</p>
        <Link to="/inventory/stock-counts" className="text-indigo-600 underline">
          Return to Stock Counts Directory
        </Link>
      </div>
    );
  }

  // Filter lines for display
  const lines = count.lines || [];
  const filteredLines = lines.filter((l) => {
    if (lineFilter === 'uncounted') return Number(l.is_counted) !== 1;
    if (lineFilter === 'counted') return Number(l.is_counted) === 1;
    if (lineFilter === 'discrepancy') return Number(l.is_counted) === 1 && Number(l.variance_quantity) !== 0;
    return true;
  });

  const totalLines = lines.length;
  const countedLines = lines.filter((l) => Number(l.is_counted) === 1).length;
  const zeroCountedLines = lines.filter((l) => Number(l.is_counted) === 1 && Number(l.counted_quantity) === 0).length;
  const discrepancyLines = lines.filter((l) => Number(l.is_counted) === 1 && Number(l.variance_quantity) !== 0).length;
  const progressPct = totalLines > 0 ? Math.round((countedLines / totalLines) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        title={`Stock Count: ${count.count_number}`}
        subtitle={`Audit session for ${count.warehouse_name} (${count.branch_name}) • Scope: ${count.count_type.toUpperCase()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/inventory/stock-counts"
              className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
            >
              ← Back to List
            </Link>

            {/* Start Button */}
            {count.status === 'draft' && (
              <Can permission="stock_count.record">
                <button
                  onClick={handleStartCount}
                  disabled={busy}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  ▶ Start Counting & Freeze Snapshot
                </button>
              </Can>
            )}

            {/* Submit Button */}
            {count.status === 'in_progress' && (
              <Can permission="stock_count.submit">
                <button
                  onClick={handleSubmitCount}
                  disabled={busy}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  ✓ Submit for Review
                </button>
              </Can>
            )}

            {/* Supervisor Approve Button */}
            {count.status === 'submitted' && (
              <Can permission="stock_count.approve">
                <button
                  onClick={handleApprove}
                  disabled={busy}
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  ✓ Approve Variances
                </button>
              </Can>
            )}

            {/* Supervisor Reject Button */}
            {count.status === 'submitted' && (
              <Can permission="stock_count.reject">
                <button
                  onClick={() => setRejectModalOpen(true)}
                  disabled={busy}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  ✕ Reject Session
                </button>
              </Can>
            )}

            {/* Apply Adjustments Button */}
            {count.status === 'approved' && (
              <Can permission="stock_count.apply_adjustment">
                <button
                  onClick={handleApplyAdjustments}
                  disabled={busy}
                  className="px-5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-bold shadow-md disabled:opacity-50 animate-pulse"
                >
                  ⚡ Apply Authorized Stock Adjustments
                </button>
              </Can>
            )}

            {/* Cancel Button */}
            {!['completed', 'cancelled', 'rejected'].includes(count.status) && (
              <Can permission="stock_count.cancel">
                <button
                  onClick={() => setCancelModalOpen(true)}
                  disabled={busy}
                  className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel Session
                </button>
              </Can>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 font-bold ml-2">×</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-600 font-bold ml-2">×</button>
        </div>
      )}

      {/* Lifecycle Stepper */}
      <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
          <span>Audit Progression</span>
          <StatusBadge status={count.status} />
        </div>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 -z-0" />
          
          {['draft', 'in_progress', 'submitted', 'approved', 'completed'].map((st, idx) => {
            const stepOrder = ['draft', 'in_progress', 'submitted', 'approved', 'completed'];
            const currentIdx = stepOrder.indexOf(count.status);
            const isCompleted = currentIdx >= idx;
            const isCurrent = count.status === st;

            return (
              <div key={st} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isCurrent
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white border-2 border-slate-300 text-slate-400'
                  }`}
                >
                  {isCompleted && !isCurrent ? '✓' : idx + 1}
                </div>
                <span className="text-[11px] font-medium text-slate-600 capitalize mt-1">
                  {st.replace(/_/g, ' ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overview Metadata & KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Session Scope</div>
          <div className="text-lg font-bold text-slate-900 mt-1 capitalize">{count.count_type} Count</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {count.storage_location_name ? `Zone: ${count.storage_location_name}` : 'Entire Warehouse'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Count Progress</div>
          <div className="text-lg font-bold text-slate-900 mt-1">
            {countedLines} / {totalLines} Lines ({progressPct}%)
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Zero Counts</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{zeroCountedLines} Lines</div>
          <div className="text-xs text-slate-500 mt-0.5">Explicitly verified empty shelves</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Variances Flagged</div>
          <div className="text-lg font-bold text-slate-900 mt-1">
            {discrepancyLines > 0 ? (
              <span className="text-rose-600">⚠ {discrepancyLines} Items</span>
            ) : (
              <span className="text-emerald-600">0 Discrepancies</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {count.status === 'approved' ? 'Approved for posting' : count.status === 'completed' ? 'Reconciled & Ledger Updated' : 'Pending review'}
          </div>
        </div>
      </div>

      {/* Main Count Sheet Table */}
      <div className="bg-white shadow rounded-lg border border-slate-200 overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">Count Sheet Entries</span>
            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
              {filteredLines.length} displayed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLineFilter('all')}
              className={`px-3 py-1 text-xs rounded-md font-medium ${
                lineFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All ({totalLines})
            </button>
            <button
              onClick={() => setLineFilter('uncounted')}
              className={`px-3 py-1 text-xs rounded-md font-medium ${
                lineFilter === 'uncounted'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Uncounted ({totalLines - countedLines})
            </button>
            <button
              onClick={() => setLineFilter('counted')}
              className={`px-3 py-1 text-xs rounded-md font-medium ${
                lineFilter === 'counted'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Counted ({countedLines})
            </button>
            <button
              onClick={() => setLineFilter('discrepancy')}
              className={`px-3 py-1 text-xs rounded-md font-medium ${
                lineFilter === 'discrepancy'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Variances ({discrepancyLines})
            </button>
          </div>
        </div>

        {/* Lines Table */}
        {filteredLines.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {count.status === 'draft'
              ? 'Click "Start Counting & Freeze Snapshot" above to generate the inventory audit sheet.'
              : 'No lines match the selected filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Product / Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Batch & Expiry
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Location
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                    System Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                    Physical Count
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Discrepancy Justification
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredLines.map((line) => {
                  const isCounted = Number(line.is_counted) === 1;
                  const variance = isCounted ? Number(line.variance_quantity) : null;
                  const hasVariance = variance !== null && variance !== 0;

                  return (
                    <tr
                      key={line.id}
                      className={`hover:bg-slate-50 ${
                        line.recount_requested ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-sm">
                        <div className="font-semibold text-slate-900">{line.product_name}</div>
                        <div className="text-xs text-slate-500">Code: {line.product_code}</div>
                        {line.recount_requested && (
                          <span className="inline-block mt-1 px-2 py-0.5 text-[11px] font-bold bg-amber-200 text-amber-900 rounded">
                            ⟳ Recount Requested: {line.recount_reason}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="font-mono text-xs font-medium">{line.batch_number}</div>
                        <div className="text-xs text-slate-500">
                          Exp: {line.expiry_date ? new Date(line.expiry_date).toLocaleDateString() : 'N/A'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div>{line.storage_location_name || 'General Shelf'}</div>
                        <div className="text-xs text-slate-400">{line.unit_name}</div>
                      </td>

                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                        {Number(line.system_quantity)} {line.unit_name}
                      </td>

                      <td className="px-4 py-3 text-sm text-right">
                        {isCounted ? (
                          <div>
                            <span className="font-bold text-slate-900">
                              {Number(line.counted_quantity)}
                            </span>{' '}
                            <span className="text-xs text-slate-500">{line.unit_name}</span>
                            {Number(line.counted_quantity) === 0 && (
                              <span className="block text-[11px] font-semibold text-slate-400">
                                (Explicit Zero)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 rounded">
                            Uncounted
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {variance === null ? (
                          <span className="text-slate-300">—</span>
                        ) : variance === 0 ? (
                          <span className="text-emerald-600 font-semibold">0 (Exact)</span>
                        ) : variance > 0 ? (
                          <span className="text-blue-600 font-bold">+{variance} (Surplus)</span>
                        ) : (
                          <span className="text-rose-600 font-bold">{variance} (Shortage)</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-600">
                        {hasVariance ? (
                          <div>
                            <span className="font-medium text-amber-900 text-xs">
                              {line.discrepancy_reason || 'Reason missing'}
                            </span>
                            {line.notes && (
                              <div className="text-xs text-slate-500 italic mt-0.5">{line.notes}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-center">
                        {count.status === 'in_progress' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Can permission="stock_count.record">
                              <button
                                data-testid={`count-line-btn-${line.id}`}
                                onClick={() => openRecordCountModal(line)}
                                className="px-2.5 py-1 text-xs bg-indigo-50 text-indigo-700 font-medium rounded hover:bg-indigo-100"
                              >
                                {isCounted ? 'Edit' : 'Count'}
                              </button>
                            </Can>

                            {!isCounted && (
                              <Can permission="stock_count.record">
                                <button
                                  onClick={() => handleZeroCountQuick(line)}
                                  title="Mark as 0 physical count"
                                  className="px-2 py-1 text-xs bg-slate-100 text-slate-600 font-medium rounded hover:bg-slate-200"
                                >
                                  0
                                </button>
                              </Can>
                            )}

                            {isCounted && !line.recount_requested && (
                              <Can permission="stock_count.record">
                                <button
                                  onClick={() => openRecountModal(line)}
                                  title="Flag for recount"
                                  className="px-2 py-1 text-xs bg-amber-50 text-amber-700 font-medium rounded hover:bg-amber-100"
                                >
                                  ⟳
                                </button>
                              </Can>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Locked</span>
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

      {/* Record Physical Count Modal */}
      {countModalOpen && activeLine && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">
              Record Physical Quantity
            </h3>

            <div className="bg-slate-50 p-3 rounded text-sm space-y-1">
              <div>
                <span className="text-slate-500 font-medium">Product:</span>{' '}
                <span className="font-semibold">{activeLine.product_name}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Batch:</span>{' '}
                <span className="font-mono">{activeLine.batch_number}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">System Balance:</span>{' '}
                <span className="font-bold text-slate-800">
                  {Number(activeLine.system_quantity)} {activeLine.unit_name}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveCountEntry} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Counted Physical Quantity <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={countInputQty}
                    onChange={(e) => setCountInputQty(e.target.value)}
                    className="flex-1 text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border font-bold"
                    placeholder="Enter physical count"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setCountInputQty('0')}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                  >
                    Set 0
                  </button>
                </div>
              </div>

              {/* Real-time Variance preview */}
              {countInputQty !== '' && !isNaN(Number(countInputQty)) && (
                <div className="p-3 bg-indigo-50/60 rounded border border-indigo-100 text-sm">
                  <span className="text-slate-600">Calculated Variance: </span>
                  <span
                    className={`font-bold font-mono ${
                      Number(countInputQty) - Number(activeLine.system_quantity) > 0
                        ? 'text-blue-600'
                        : Number(countInputQty) - Number(activeLine.system_quantity) < 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {Number(countInputQty) - Number(activeLine.system_quantity) > 0 ? '+' : ''}
                    {Number(countInputQty) - Number(activeLine.system_quantity)} {activeLine.unit_name}
                  </span>
                </div>
              )}

              {/* Discrepancy Reason if variance != 0 */}
              {countInputQty !== '' &&
                !isNaN(Number(countInputQty)) &&
                Number(countInputQty) !== Number(activeLine.system_quantity) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Discrepancy Justification <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={countReason}
                      onChange={(e) => setCountReason(e.target.value)}
                      className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
                      required
                    >
                      <option value="Physical counting variance">Physical counting variance</option>
                      <option value="Damaged stock identified during counting">
                        Damaged stock identified during counting
                      </option>
                      <option value="Missing or misplaced stock">Missing or misplaced stock</option>
                      <option value="Data-entry or recording discrepancy">
                        Data-entry or recording discrepancy
                      </option>
                      <option value="Expiry-related discrepancy">Expiry-related discrepancy</option>
                      <option value="Other">Other (documented below)</option>
                    </select>
                  </div>
                )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Counter Notes (Optional)
                </label>
                <input
                  type="text"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  placeholder="Shelf location, damaged packaging notes..."
                  className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setCountModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium shadow-sm"
                >
                  Save Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recount Request Modal */}
      {recountModalOpen && recountLine && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">
              Request Recount for {recountLine.product_name}
            </h3>

            <p className="text-sm text-slate-600">
              Flagging this item for recount will preserve the prior audit event and permit the counter
              to re-verify the physical shelf quantity.
            </p>

            <form onSubmit={handleSaveRecount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for Recount <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={recountReason}
                  onChange={(e) => setRecountReason(e.target.value)}
                  placeholder="e.g. Discrepancy exceeds tolerance, check second rack bin..."
                  className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRecountModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-medium shadow-sm"
                >
                  Confirm Recount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-rose-700 border-b pb-2">
              Reject Stock Count Session
            </h3>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide detailed justification for rejecting count findings..."
                  className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium shadow-sm"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">
              Cancel Stock Count Session
            </h3>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cancellation Reason
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for terminating session..."
                  className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium shadow-sm"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
