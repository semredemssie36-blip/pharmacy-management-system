import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { quarantineApi } from '../features/inventory/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

export default function QuarantineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quarantine, setQuarantine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Action Modals State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');

  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [disposalReason, setDisposalReason] = useState('');

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await quarantineApi.get(id);
      setQuarantine(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to load quarantine case.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleReview(e) {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await quarantineApi.review(id, { reviewNotes: reviewNotes.trim() || undefined });
      setShowReviewModal(false);
      setSuccessMsg('Quarantine case marked under technical review.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to review case.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRelease(e) {
    e.preventDefault();
    if (!releaseReason.trim()) {
      setError('Release reason is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await quarantineApi.release(id, { releaseReason: releaseReason.trim() });
      setShowReleaseModal(false);
      setSuccessMsg('Stock successfully released from quarantine back to available inventory.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to release quarantine stock.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispose(e) {
    e.preventDefault();
    if (!disposalReason.trim()) {
      setError('Disposal reason and destruction notes are required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await quarantineApi.dispose(id, { disposalReason: disposalReason.trim() });
      setShowDisposeModal(false);
      setSuccessMsg('Stock officially written off and physically removed from inventory.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to dispose quarantined stock.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Are you sure you want to cancel this quarantine case?')) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await quarantineApi.cancel(id, { cancelReason: 'Cancelled by user' });
      setSuccessMsg('Quarantine case cancelled.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to cancel case.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm max-w-5xl mx-auto">
        Loading quarantine details...
      </div>
    );
  }

  if (!quarantine) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm max-w-5xl mx-auto">
        Quarantine case not found.
      </div>
    );
  }

  const formatReason = (r) => {
    if (!r) return '—';
    return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const isHoldActive = quarantine.status === 'quarantined' || quarantine.status === 'under_review';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-mono">
              {quarantine.case_number}
            </h1>
            <StatusBadge status={quarantine.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Quarantine Stock Hold &bull; Initiated on {new Date(quarantine.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/inventory/quarantines"
            className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition"
          >
            &larr; Back to Directory
          </Link>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded text-sm">
          {successMsg}
        </div>
      )}

      {/* Actions Toolbar */}
      {isHoldActive && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <strong>Active Stock Hold:</strong> {Number(quarantine.quantity)} units are isolated from available sales/dispensing stock.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {quarantine.status === 'quarantined' && (
              <Can permission="quarantine.review">
                <button
                  onClick={() => setShowReviewModal(true)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium rounded shadow-sm transition"
                >
                  Mark Under Review
                </button>
              </Can>
            )}
            <Can permission="quarantine.release">
              <button
                onClick={() => setShowReleaseModal(true)}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Release to Stock
              </button>
            </Can>
            <Can permission="quarantine.dispose">
              <button
                onClick={() => setShowDisposeModal(true)}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Authorize Disposal
              </button>
            </Can>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-3 py-1.5 text-xs border border-slate-300 text-slate-700 hover:bg-white font-medium rounded transition"
            >
              Cancel Hold
            </button>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Product & Batch Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 border-b pb-2">Product & Custody Location</h2>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-slate-500">Product Name:</span>
            <span className="font-semibold text-slate-900">{quarantine.product_name}</span>

            <span className="text-slate-500">Product Code:</span>
            <span className="font-mono text-slate-700">{quarantine.product_code || '—'}</span>

            <span className="text-slate-500">Batch Number:</span>
            <span className="font-mono font-bold text-indigo-700">{quarantine.batch_number}</span>

            <span className="text-slate-500">Batch Expiry Date:</span>
            <span className="font-mono text-slate-700">
              {quarantine.expiry_date ? String(quarantine.expiry_date).substring(0, 10) : '—'}
            </span>

            <span className="text-slate-500">Quarantined Quantity:</span>
            <span className="font-mono font-bold text-amber-700 text-base">{Number(quarantine.quantity)}</span>

            <span className="text-slate-500">Branch:</span>
            <span className="text-slate-800">{quarantine.branch_name || '—'}</span>

            <span className="text-slate-500">Warehouse:</span>
            <span className="text-slate-800">{quarantine.warehouse_name || '—'}</span>

            <span className="text-slate-500">Storage Location:</span>
            <span className="text-slate-800">{quarantine.storage_location_name || '—'}</span>
          </div>
        </div>

        {/* Case Justification & Custody Card */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 border-b pb-2">Reason & Audit Trail</h2>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-slate-500">Quarantine Reason:</span>
            <span className="font-medium text-slate-900">{formatReason(quarantine.reason)}</span>

            <span className="text-slate-500">Initiated By:</span>
            <span className="text-slate-800">{quarantine.created_by_name || 'System'}</span>

            <span className="text-slate-500">Initiated At:</span>
            <span className="text-slate-700">{new Date(quarantine.created_at).toLocaleString()}</span>

            {quarantine.reviewed_by && (
              <>
                <span className="text-slate-500">Reviewed By:</span>
                <span className="text-slate-800">{quarantine.reviewed_by_name || `User #${quarantine.reviewed_by}`}</span>
                <span className="text-slate-500">Reviewed At:</span>
                <span className="text-slate-700">{new Date(quarantine.reviewed_at).toLocaleString()}</span>
              </>
            )}

            {quarantine.released_by && (
              <>
                <span className="text-slate-500">Released By:</span>
                <span className="text-slate-800">{quarantine.released_by_name || `User #${quarantine.released_by}`}</span>
                <span className="text-slate-500">Released At:</span>
                <span className="text-slate-700">{new Date(quarantine.released_at).toLocaleString()}</span>
                <span className="text-slate-500">Release Reason:</span>
                <span className="text-slate-800 italic">{quarantine.release_reason || '—'}</span>
              </>
            )}

            {quarantine.disposed_by && (
              <>
                <span className="text-slate-500">Disposed By:</span>
                <span className="text-slate-800">{quarantine.disposed_by_name || `User #${quarantine.disposed_by}`}</span>
                <span className="text-slate-500">Disposed At:</span>
                <span className="text-slate-700">{new Date(quarantine.disposed_at).toLocaleString()}</span>
                <span className="text-slate-500">Disposal Notes:</span>
                <span className="text-slate-800 italic">{quarantine.disposal_reason || '—'}</span>
              </>
            )}
          </div>

          {quarantine.notes && (
            <div className="pt-2 border-t text-sm">
              <span className="text-slate-500 block text-xs font-semibold mb-1">Technical Notes:</span>
              <p className="text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-100 text-xs">
                {quarantine.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Mark Under Technical Review</h3>
            <p className="text-xs text-slate-500">
              Update case status to under review while QA or regulatory assessment is in progress.
            </p>
            <form onSubmit={handleReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Review Notes</label>
                <textarea
                  rows="3"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Sent sample to national quality lab for testing..."
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-3 py-1.5 border rounded text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                >
                  {actionLoading ? 'Updating...' : 'Confirm Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Release Quarantine Stock</h3>
            <p className="text-xs text-slate-500">
              This will return {Number(quarantine.quantity)} units back to saleable available inventory.
              Stock will NOT be released if the batch is expired or subject to an active recall.
            </p>
            <form onSubmit={handleRelease} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Justification / Release Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  placeholder="e.g. Lab results verified purity and cleared packaging issue..."
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReleaseModal(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  {actionLoading ? 'Releasing...' : 'Confirm Release to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disposal Modal */}
      {showDisposeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-rose-700">Authorize Stock Disposal</h3>
            <p className="text-xs text-slate-500">
              WARNING: This will permanently write off {Number(quarantine.quantity)} units from physical inventory
              and post an authoritative disposal entry in stock_movements ledger.
            </p>
            <form onSubmit={handleDispose} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Disposal / Destruction Protocol Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={disposalReason}
                  onChange={(e) => setDisposalReason(e.target.value)}
                  placeholder="e.g. Incineration per EFDA hazardous medical waste protocol; Certificate #..."
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDisposeModal(false)}
                  className="px-3 py-1.5 border rounded text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                >
                  {actionLoading ? 'Writing Off...' : 'Confirm Destruction & Disposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
