import { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { approvalsApi } from '../features/approvals/api.js';
import { AuthContext } from '../features/auth/AuthContext.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';
import { ShieldIcon, WarningIcon, CheckCircleIcon } from '../components/common/Icons.jsx';

const CATEGORY_LABELS = {
  sale_discount: 'Sale Discount',
  credit_limit_override: 'Credit Limit Override',
  stock_adjustment: 'Stock Adjustment',
  quarantine_release: 'Quarantine Release',
  price_change: 'Selling Price Change',
  purchase_order: 'Purchase Order Approval',
};

const ACTION_COLORS = {
  created: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
  invalidated: 'bg-amber-100 text-amber-800 border-amber-200',
  executed: 'bg-teal-100 text-teal-800 border-teal-200',
};

export default function ApprovalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog state
  const [dialog, setDialog] = useState({
    isOpen: false,
    action: null, // 'approve' | 'reject' | 'cancel'
    reason: '',
    busy: false,
    error: null,
  });

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.get(id);
      setRequest(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to load approval request details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [id]);

  function openActionDialog(action) {
    setDialog({
      isOpen: true,
      action,
      reason: action === 'approve' ? 'Approved' : '',
      busy: false,
      error: null,
    });
  }

  async function handleConfirmAction() {
    const { action, reason } = dialog;
    if (action === 'reject' && !reason.trim()) {
      setDialog((prev) => ({ ...prev, error: 'Rejection reason is mandatory.' }));
      return;
    }

    setDialog((prev) => ({ ...prev, busy: true, error: null }));
    try {
      if (action === 'approve') {
        await approvalsApi.approve(id, { decisionReason: reason.trim() || 'Approved' });
      } else if (action === 'reject') {
        await approvalsApi.reject(id, { decisionReason: reason.trim() });
      } else if (action === 'cancel') {
        await approvalsApi.cancel(id, { cancelReason: reason.trim() || 'Cancelled by requester' });
      }

      setDialog({ isOpen: false, action: null, reason: '', busy: false, error: null });
      loadDetail();
    } catch (err) {
      setDialog((prev) => ({ ...prev, busy: false, error: err?.message || 'Failed to execute decision.' }));
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-slate-500 text-sm">Loading approval request details…</div>;
  }

  if (error || !request) {
    return (
      <div className="space-y-4">
        <Link to="/approvals" className="text-sm text-indigo-600 hover:underline">
          ← Back to Approvals
        </Link>
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
          {error || 'Approval request not found.'}
        </div>
      </div>
    );
  }

  const isRequester = Number(request.requester_id) === Number(user?.id);
  const isPending = request.status === 'pending';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Approval Request ${request.request_number}`}
        subtitle={`${CATEGORY_LABELS[request.category] || request.category} — Submitted by ${request.requester_name || 'User'}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Approvals & Overrides', to: '/approvals' },
          { label: request.request_number },
        ]}
        actions={
          <div className="flex gap-2">
            <Link
              to="/approvals"
              className="px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
            >
              Back to Inbox
            </Link>
            {isPending && isRequester && (
              <button
                onClick={() => openActionDialog('cancel')}
                className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel Request
              </button>
            )}
            {isPending && !isRequester && (
              <>
                <button
                  onClick={() => openActionDialog('reject')}
                  className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => openActionDialog('approve')}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  Approve
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Status Banners */}
      {isPending && isRequester && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-start gap-3">
          <ShieldIcon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Separation of Duties Enforced</div>
            <div>
              You created this request. As a matter of compliance and internal controls, requesters cannot approve their own requests. An eligible supervisor or manager must review and authorize this action.
            </div>
          </div>
        </div>
      )}

      {request.status === 'expired' && (
        <div className="p-4 bg-gray-100 border border-gray-300 rounded-xl text-gray-800 text-sm flex items-start gap-3">
          <WarningIcon className="w-6 h-6 text-gray-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Request Invalidated (Stale Data Detected)</div>
            <div>
              {request.decision_reason || 'The underlying business record was modified after this approval request was created. The request has been invalidated to prevent inconsistent financial or inventory mutations.'}
            </div>
          </div>
        </div>
      )}

      {request.status === 'approved' && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-sm flex items-start gap-3">
          <CheckCircleIcon className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Approved and Awaiting Operation Execution</div>
            <div>
              This request has been authorized by {request.approver_name || 'a supervisor'}. The protected business operation can now proceed to completion.
            </div>
          </div>
        </div>
      )}

      {request.status === 'executed' && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-sm flex items-start gap-3">
          <CheckCircleIcon className="w-6 h-6 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Override Successfully Executed</div>
            <div>
              The business transaction was authorized and completed at {new Date(request.executed_at).toLocaleString()}.
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Core Context */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Request Overview */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Request Overview</h3>
              <StatusBadge status={request.status} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Category</span>
                <div className="font-medium text-slate-900 mt-0.5">
                  {CATEGORY_LABELS[request.category] || request.category}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Target Entity</span>
                <div className="font-medium text-slate-900 mt-0.5 capitalize">
                  {request.target_entity_type} #{request.target_entity_id}
                  {request.target_reference && ` (${request.target_reference})`}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Original / Base Value</span>
                <div className="font-medium text-slate-900 mt-0.5">
                  {request.original_value !== null ? `${request.original_value}${request.category === 'sale_discount' ? '%' : ' ETB'}` : '—'}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Requested Override Value</span>
                <div className="font-bold text-indigo-700 mt-0.5">
                  {request.requested_value !== null ? `${request.requested_value}${request.category === 'sale_discount' ? '%' : ' ETB'}` : '—'}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Requester</span>
                <div className="font-medium text-slate-900 mt-0.5">{request.requester_name || 'System User'}</div>
                <div className="text-xs text-slate-500">{request.requester_email}</div>
              </div>
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Branch Context</span>
                <div className="font-medium text-slate-900 mt-0.5">{request.branch_name || 'All Branches'}</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-400 uppercase font-semibold">Business Justification Reason</span>
              <p className="mt-1 p-3 bg-slate-50 rounded-lg text-sm text-slate-800 border border-slate-200">
                {request.reason}
              </p>
            </div>

            {request.notes && (
              <div>
                <span className="text-xs text-slate-400 uppercase font-semibold">Supporting Notes</span>
                <p className="mt-1 p-3 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-200">
                  {request.notes}
                </p>
              </div>
            )}
          </div>

          {/* Card: Immutable Decision History Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decision & Event History</h3>
            <p className="text-xs text-slate-500">
              All events, status transitions, and reviewer decisions are immutably logged with timestamps and actor identities.
            </p>

            <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 mt-4">
              {request.history && request.history.length > 0 ? (
                request.history.map((h) => (
                  <div key={h.id} className="relative group">
                    <span className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 border-white bg-slate-400 group-hover:bg-indigo-600 transition-colors" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border ${ACTION_COLORS[h.action] || 'bg-slate-100 text-slate-700'}`}>
                          {h.action}
                        </span>
                        <span className="font-semibold text-sm text-slate-900">
                          {h.actor_name || 'System Actor'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(h.created_at).toLocaleString()}
                      </span>
                    </div>
                    {h.notes && (
                      <p className="mt-1 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        {h.notes}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400">No events logged yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Governance & Decision Status */}
        <div className="space-y-6">
          {/* Card: Policy & Authority Governance */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Governance & Authority</h3>

            <div className="space-y-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 uppercase font-semibold">Separation of Duties</div>
                <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600" /> Requester cannot approve
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 uppercase font-semibold">Stale Snapshot Hash</div>
                <div className="font-mono text-xs text-slate-600 break-all mt-1">
                  {request.stale_fingerprint ? `${request.stale_fingerprint.slice(0, 24)}…` : 'No snapshot fingerprint'}
                </div>
              </div>
            </div>
          </div>

          {/* Card: Decision Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Decision Status</h3>

            {request.decision_at ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Decided By</span>
                  <div className="font-medium text-slate-900">{request.approver_name || 'Authorized Supervisor'}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Decision Date</span>
                  <div className="font-medium text-slate-900">{new Date(request.decision_at).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Decision Reason</span>
                  <div className="mt-1 p-2 bg-slate-50 rounded text-slate-800 text-xs border border-slate-200">
                    {request.decision_reason || 'No decision reason recorded'}
                  </div>
                </div>
                {request.executed_at && (
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Execution Timestamp</span>
                    <div className="font-medium text-teal-800">{new Date(request.executed_at).toLocaleString()}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                This request is currently <strong className="text-amber-700">pending</strong> review by an authorized supervisor.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decision Dialog */}
      <ConfirmationDialog
        isOpen={dialog.isOpen}
        title={
          dialog.action === 'approve'
            ? 'Confirm Approval'
            : dialog.action === 'reject'
            ? 'Reject Request'
            : 'Cancel Request'
        }
        message={
          dialog.action === 'approve'
            ? `Authorize ${request.request_number}? This will allow the requested operation to be completed.`
            : dialog.action === 'reject'
            ? `Please specify the mandatory reason for rejecting ${request.request_number}.`
            : `Are you sure you want to cancel ${request.request_number}?`
        }
        confirmLabel={
          dialog.action === 'approve' ? 'Approve' : dialog.action === 'reject' ? 'Reject' : 'Cancel Request'
        }
        confirmTone={dialog.action === 'approve' ? 'primary' : 'danger'}
        busy={dialog.busy}
        onConfirm={handleConfirmAction}
        onCancel={() => setDialog({ isOpen: false, action: null, reason: '', busy: false, error: null })}
      >
        <div className="space-y-3">
          {dialog.error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {dialog.error}
            </div>
          )}
          <label className="block text-xs font-semibold text-slate-700">
            {dialog.action === 'approve'
              ? 'Review Notes (Optional)'
              : dialog.action === 'reject'
              ? 'Rejection Reason (Mandatory) *'
              : 'Cancellation Reason'}
          </label>
          <textarea
            rows={3}
            value={dialog.reason}
            onChange={(e) => setDialog((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder={
              dialog.action === 'approve'
                ? 'Optional approval comments...'
                : 'State required justification for rejection...'
            }
            className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </ConfirmationDialog>
    </div>
  );
}
