import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { recallsApi } from '../features/inventory/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';

export default function RecallDetailPage() {
  const { id } = useParams();

  const [recall, setRecall] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Action Modals State
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('returned_to_supplier');
  const [actionBranchId, setActionBranchId] = useState('');
  const [actionBatchId, setActionBatchId] = useState('');
  const [actionQuantity, setActionQuantity] = useState('');
  const [actionDestination, setActionDestination] = useState('');
  const [actionNotes, setActionNotes] = useState('');

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [recRes, bRes] = await Promise.all([
        recallsApi.get(id),
        branchesApi.list(),
      ]);
      setRecall(recRes.data);
      setBranches(bRes.data?.items || bRes.data || []);
      if (recRes.data?.affected_batches?.length > 0) {
        setActionBatchId(String(recRes.data.affected_batches[0].batch_id));
      }
    } catch (err) {
      setError(err?.message || 'Failed to load recall case details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleApprove() {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await recallsApi.approve(id, { reviewNotes: 'Approved by clinical safety review.' });
      setSuccessMsg('Recall case reviewed and approved for activation.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to approve recall.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleActivate() {
    if (!window.confirm('Activate recall containment? This will deactivate affected batches and isolate on-hand stock across all branches!')) {
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await recallsApi.activate(id);
      setSuccessMsg(res.message || 'Recall activated and containment holds enforced.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to activate recall.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecordAction(e) {
    e.preventDefault();
    const qty = parseFloat(actionQuantity);
    if (!qty || qty <= 0) {
      setError('Please provide a valid quantity.');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await recallsApi.recordAction(id, {
        batchId: actionBatchId ? parseInt(actionBatchId, 10) : undefined,
        branchId: actionBranchId ? parseInt(actionBranchId, 10) : undefined,
        actionType,
        quantity: qty,
        destinationOrParty: actionDestination.trim() || undefined,
        notes: actionNotes.trim() || undefined,
      });
      setShowActionModal(false);
      setActionQuantity('');
      setActionDestination('');
      setActionNotes('');
      setSuccessMsg('Recall containment action recorded successfully.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to record recall action.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseRecall(e) {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      setError('Resolution and closure audit notes are required.');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await recallsApi.close(id, { resolutionNotes: resolutionNotes.trim() });
      setShowCloseModal(false);
      setSuccessMsg('Recall case officially resolved and closed.');
      loadData();
    } catch (err) {
      setError(err?.message || 'Failed to close recall case.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm max-w-7xl mx-auto">
        Loading product recall details...
      </div>
    );
  }

  if (!recall) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm max-w-7xl mx-auto">
        Recall case not found.
      </div>
    );
  }

  const formatReason = (r) => {
    if (!r) return '—';
    return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const batches = recall.affected_batches || [];
  const actions = recall.actions || [];
  const stockSummary = recall.affected_stock_summary || {};

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 font-mono">
              {recall.recall_number}
            </h1>
            <StatusBadge status={recall.status} />
            <StatusBadge status={recall.severity} />
          </div>
          <h2 className="text-base text-slate-700 font-semibold mt-1">{recall.title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Initiator: {recall.initiating_party || 'Internal Safety Team'} &bull; Created: {new Date(recall.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/inventory/recalls"
            className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition"
          >
            &larr; Back to Recalls
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

      {/* Traceability Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="On-Hand Physical Stock"
          value={stockSummary.total_on_hand_stock ?? 0}
          description="Total physical units in stock"
          variant="info"
        />
        <SummaryCard
          title="Quarantined / Contained"
          value={stockSummary.total_quarantined_or_recalled ?? 0}
          description="Stock placed on containment hold"
          variant="warning"
        />
        <SummaryCard
          title="Dispensed / Sold History"
          value={stockSummary.total_dispensed_or_sold ?? 0}
          description="Confirmed dispensed units traced"
          variant="danger"
        />
        <SummaryCard
          title="Disposed / Written Off"
          value={stockSummary.total_disposed ?? 0}
          description="Destroyed under safety protocol"
        />
      </div>

      {/* Lifecycle Control Bar */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <strong>Current Lifecycle Stage:</strong> <span className="font-semibold uppercase text-slate-800">{recall.status.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {recall.status === 'draft' && (
            <Can permission="recall.approve">
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Approve Recall Case
              </button>
            </Can>
          )}

          {recall.status === 'under_review' && (
            <Can permission="recall.activate">
              <button
                onClick={handleActivate}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Activate Recall & Contain Stock
              </button>
            </Can>
          )}

          {(recall.status === 'active' || recall.status === 'monitoring') && (
            <>
              <Can permission="recall.action">
                <button
                  onClick={() => setShowActionModal(true)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition"
                >
                  Record Containment Action
                </button>
              </Can>
              <Can permission="recall.close">
                <button
                  onClick={() => setShowCloseModal(true)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-xs transition"
                >
                  Close Recall Case
                </button>
              </Can>
            </>
          )}
        </div>
      </div>

      {/* Affected Batches Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            Affected Batches ({batches.length})
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            Scope: {recall.scope ? recall.scope.replace(/_/g, ' ') : 'batch specific'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Batch #</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Expiry Date</th>
                <th className="px-4 py-3 text-center">Batch Status</th>
                <th className="px-4 py-3 text-right">Physical On Hand</th>
                <th className="px-4 py-3 text-right">Held / Recalled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.batch_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{b.batch_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{b.product_name}</div>
                    <div className="text-xs text-slate-400">{b.product_code}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {b.expiry_date ? String(b.expiry_date).substring(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        b.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {b.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                    {Number(b.physical_on_hand || 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">
                    {Number(b.quarantined_or_recalled || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Containment Actions Audit Trail */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            Containment Actions & Chain of Custody ({actions.length})
          </h3>
        </div>
        {actions.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No containment actions recorded yet for this recall case.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Action Type</th>
                  <th className="px-4 py-3 text-left">Batch #</th>
                  <th className="px-4 py-3 text-left">Branch</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-left">Destination / Party</th>
                  <th className="px-4 py-3 text-left">Performed By</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {actions.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">
                        {act.action_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {act.notes && (
                        <div className="text-xs text-slate-400 italic">{act.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{act.batch_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{act.branch_name || 'All'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                      {Number(act.quantity)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{act.destination_or_party || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{act.performed_by_name || 'System'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {act.created_at ? new Date(act.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Recall Containment Action</h3>
            <p className="text-xs text-slate-500">
              Log physical custody movement, supplier return dispatch, destruction, or patient notification.
            </p>
            <form onSubmit={handleRecordAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Action Type</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="quarantined_on_hand">Quarantined On Hand</option>
                    <option value="returned_to_supplier">Returned to Supplier</option>
                    <option value="disposed">Disposed / Incinerated</option>
                    <option value="released_authorized">Authorized Release</option>
                    <option value="dispensed_notified">Patient Dispensing Notified</option>
                    <option value="investigated">Investigation Note</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Affected Batch</label>
                  <select
                    value={actionBatchId}
                    onChange={(e) => setActionBatchId(e.target.value)}
                    className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    {batches.map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_number} ({b.product_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={actionQuantity}
                    onChange={(e) => setActionQuantity(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <select
                    value={actionBranchId}
                    onChange={(e) => setActionBranchId(e.target.value)}
                    className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination / Receiving Party</label>
                <input
                  type="text"
                  value={actionDestination}
                  onChange={(e) => setActionDestination(e.target.value)}
                  placeholder="e.g. Supplier XYZ Ltd, Waste Management Plant, Patient Clinic"
                  className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Notes</label>
                <textarea
                  rows="2"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Include invoice, dispatch note #, or incident observations..."
                  className="w-full text-xs border rounded p-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowActionModal(false)}
                  className="px-3 py-1.5 border rounded text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                >
                  {actionLoading ? 'Saving...' : 'Record Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Recall Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-teal-800">Close Product Recall Case</h3>
            <p className="text-xs text-slate-500">
              Provide closure audit summary. Ensure all physical stock has been accounted for, quarantined,
              or authorized dispositions completed.
            </p>
            <form onSubmit={handleCloseRecall} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resolution & Audit Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. 100% of affected stock returned to supplier; safety clearance received from EFDA..."
                  className="w-full text-sm border rounded p-2 focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  {actionLoading ? 'Closing...' : 'Confirm Case Closure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
