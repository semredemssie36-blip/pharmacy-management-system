import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { approvalsApi } from '../features/approvals/api.js';
import { AuthContext } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';

const CATEGORY_LABELS = {
  sale_discount: 'Sale Discount',
  credit_limit_override: 'Credit Limit Override',
  stock_adjustment: 'Stock Adjustment',
  quarantine_release: 'Quarantine Release',
  price_change: 'Selling Price Change',
  purchase_order: 'Purchase Order Approval',
};

export default function ApprovalsPage() {
  const { user } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [tab, setTab] = useState('all'); // 'all' | 'awaiting' | 'my'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState({
    isOpen: false,
    type: null, // 'approve' | 'reject'
    request: null,
    reason: '',
    busy: false,
    error: null,
  });

  // New Request Modal State
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    category: 'sale_discount',
    targetEntityType: 'sale',
    targetEntityId: '',
    targetReference: '',
    requestedValue: '',
    originalValue: '',
    reason: '',
    notes: '',
  });
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newError, setNewError] = useState(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const params = {
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        page,
        limit,
      };

      if (tab === 'my' && user?.id) {
        params.requesterId = user.id;
      }

      const res = await approvalsApi.list(params);
      const items = res.data?.items || [];
      setRequests(items);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load approval requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [tab, statusFilter, categoryFilter, page]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadRequests();
  }

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('');
    setCategoryFilter('');
    setPage(1);
  }

  // Quick Decision Handlers
  function openApproveDialog(req, e) {
    e.stopPropagation();
    setDecisionModal({
      isOpen: true,
      type: 'approve',
      request: req,
      reason: 'Approved',
      busy: false,
      error: null,
    });
  }

  function openRejectDialog(req, e) {
    e.stopPropagation();
    setDecisionModal({
      isOpen: true,
      type: 'reject',
      request: req,
      reason: '',
      busy: false,
      error: null,
    });
  }

  async function handleConfirmDecision() {
    const { type, request, reason } = decisionModal;
    if (type === 'reject' && !reason.trim()) {
      setDecisionModal((prev) => ({ ...prev, error: 'Rejection reason is mandatory.' }));
      return;
    }

    setDecisionModal((prev) => ({ ...prev, busy: true, error: null }));
    try {
      if (type === 'approve') {
        await approvalsApi.approve(request.id, { decisionReason: reason.trim() || 'Approved' });
      } else {
        await approvalsApi.reject(request.id, { decisionReason: reason.trim() });
      }
      setDecisionModal({ isOpen: false, type: null, request: null, reason: '', busy: false, error: null });
      loadRequests();
    } catch (err) {
      setDecisionModal((prev) => ({ ...prev, busy: false, error: err?.message || 'Failed to submit decision.' }));
    }
  }

  // Create Request Submit
  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!newForm.reason.trim() || !newForm.targetEntityId) {
      setNewError('Target entity ID and justification reason are required.');
      return;
    }

    setNewSubmitting(true);
    setNewError(null);
    try {
      await approvalsApi.create({
        organizationId: user?.organization_id || 1,
        branchId: user?.branch_id || null,
        category: newForm.category,
        targetEntityType: newForm.targetEntityType,
        targetEntityId: parseInt(newForm.targetEntityId, 10),
        targetReference: newForm.targetReference.trim() || null,
        requestedValue: newForm.requestedValue !== '' ? parseFloat(newForm.requestedValue) : null,
        originalValue: newForm.originalValue !== '' ? parseFloat(newForm.originalValue) : null,
        reason: newForm.reason.trim(),
        notes: newForm.notes.trim() || null,
      });
      setNewModalOpen(false);
      setNewForm({
        category: 'sale_discount',
        targetEntityType: 'sale',
        targetEntityId: '',
        targetReference: '',
        requestedValue: '',
        originalValue: '',
        reason: '',
        notes: '',
      });
      loadRequests();
    } catch (err) {
      setNewError(err?.message || 'Failed to create approval request.');
    } finally {
      setNewSubmitting(false);
    }
  }

  // Filtering for "Awaiting My Decision" tab client-side refinement
  const displayedRequests = requests.filter((r) => {
    if (tab === 'awaiting') {
      return r.status === 'pending' && Number(r.requester_id) !== Number(user?.id);
    }
    return true;
  });

  // KPI Calculations
  const totalPending = requests.filter((r) => r.status === 'pending').length;
  const totalApproved = requests.filter((r) => r.status === 'approved' || r.status === 'executed').length;
  const totalRejected = requests.filter((r) => r.status === 'rejected').length;
  const totalInvalidated = requests.filter((r) => r.status === 'expired' || r.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals & Authorized Overrides"
        subtitle="Review, approve, or reject sensitive financial, clinical, and inventory overrides with immutable audit trails"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Administration', to: '/administration/users' },
          { label: 'Approvals & Overrides' },
        ]}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => loadRequests()}
              className="px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
            >
              Refresh
            </button>
            <Can permission="approval.create">
              <button
                onClick={() => setNewModalOpen(true)}
                className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
              >
                + New Request
              </button>
            </Can>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Pending Requests"
          value={totalPending}
          tone="warning"
          description="Awaiting reviewer decision"
        />
        <SummaryCard
          title="Approved / Executed"
          value={totalApproved}
          tone="success"
          description="Authorized operational overrides"
        />
        <SummaryCard
          title="Rejected Requests"
          value={totalRejected}
          tone="danger"
          description="Disallowed by policy authority"
        />
        <SummaryCard
          title="Expired / Cancelled"
          value={totalInvalidated}
          tone="neutral"
          description="Stale data or requester retracted"
        />
      </div>

      {/* Workspace Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-4 pt-2">
          <button
            onClick={() => { setTab('all'); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'all'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            All Requests ({totalCount})
          </button>
          <button
            onClick={() => { setTab('awaiting'); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'awaiting'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Awaiting Review</span>
            {totalPending > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                {totalPending}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab('my'); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'my'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            My Submitted Requests
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-200">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[220px]">
              <input
                type="text"
                placeholder="Search request #, reference, reason, requester..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Categories</option>
              <option value="sale_discount">Sale Discount</option>
              <option value="credit_limit_override">Credit Limit Override</option>
              <option value="stock_adjustment">Stock Adjustment</option>
              <option value="quarantine_release">Quarantine Release</option>
              <option value="price_change">Price Change</option>
              <option value="purchase_order">Purchase Order</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="executed">Executed</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired / Stale</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              Filter
            </button>
            {(search || statusFilter || categoryFilter) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {/* Requests Table */}
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">Loading approval requests…</div>
        ) : displayedRequests.length === 0 ? (
          <EmptyState
            title="No approval requests found"
            description={
              tab === 'awaiting'
                ? 'You have no pending requests requiring your review.'
                : 'No approval requests match your search and filter criteria.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Request #</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Target Entity</th>
                  <th className="px-4 py-3">Requested Value</th>
                  <th className="px-4 py-3">Requester & Branch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRequests.map((req) => {
                  const isRequester = Number(req.requester_id) === Number(user?.id);
                  const isPending = req.status === 'pending';

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-slate-50/75 transition-colors cursor-pointer"
                      onClick={() => {}}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <Link
                          to={`/approvals/${req.id}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {req.request_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {CATEGORY_LABELS[req.category] || req.category}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          {req.target_entity_type} #{req.target_entity_id}
                        </span>
                        {req.target_reference && (
                          <div className="text-xs text-slate-400 mt-0.5">{req.target_reference}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {req.requested_value !== null ? (
                          <div>
                            <span className="font-semibold text-slate-900">
                              {req.requested_value}
                              {req.category === 'sale_discount' ? '%' : ' ETB'}
                            </span>
                            {req.original_value !== null && (
                              <span className="text-xs text-slate-400 ml-1.5">
                                (was {req.original_value}
                                {req.category === 'sale_discount' ? '%' : ' ETB'})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{req.requester_name || 'System User'}</div>
                        <div className="text-xs text-slate-500">{req.branch_name || 'All Branches'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(req.created_at).toLocaleDateString()}
                        <div className="text-[11px] text-slate-400">
                          {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <Link
                            to={`/approvals/${req.id}`}
                            className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            Details
                          </Link>
                          {isPending && !isRequester && (
                            <>
                              <button
                                onClick={(e) => openApproveDialog(req, e)}
                                className="px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={(e) => openRejectDialog(req, e)}
                                className="px-2.5 py-1 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decision Confirmation Modal */}
      <ConfirmationDialog
        isOpen={decisionModal.isOpen}
        title={decisionModal.type === 'approve' ? 'Approve Override Request' : 'Reject Override Request'}
        message={
          decisionModal.type === 'approve'
            ? `Are you sure you want to approve ${decisionModal.request?.request_number}? This will authorize the requested business action.`
            : `Please provide a mandatory reason for rejecting ${decisionModal.request?.request_number}.`
        }
        confirmLabel={decisionModal.type === 'approve' ? 'Confirm Approval' : 'Reject Request'}
        confirmTone={decisionModal.type === 'approve' ? 'primary' : 'danger'}
        busy={decisionModal.busy}
        onConfirm={handleConfirmDecision}
        onCancel={() => setDecisionModal({ isOpen: false, type: null, request: null, reason: '', busy: false, error: null })}
      >
        <div className="space-y-3">
          {decisionModal.error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {decisionModal.error}
            </div>
          )}
          <label className="block text-xs font-semibold text-slate-700">
            {decisionModal.type === 'approve' ? 'Decision Notes (Optional)' : 'Rejection Reason (Mandatory)'}
          </label>
          <textarea
            rows={3}
            value={decisionModal.reason}
            onChange={(e) => setDecisionModal((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder={
              decisionModal.type === 'approve'
                ? 'Optional review notes or compliance reference...'
                : 'State explicit justification for rejecting this request...'
            }
            className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </ConfirmationDialog>

      {/* New Approval Request Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Create Approval Request</h3>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              {newError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {newError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Approval Category</label>
                <select
                  value={newForm.category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    const entityType =
                      cat === 'sale_discount' ? 'sale' :
                      cat === 'credit_limit_override' ? 'customer' :
                      cat === 'stock_adjustment' ? 'inventory' :
                      cat === 'quarantine_release' ? 'quarantine' :
                      cat === 'purchase_order' ? 'purchase_order' : 'product';
                    setNewForm((prev) => ({ ...prev, category: cat, targetEntityType: entityType }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="sale_discount">Sale Discount (Exceeding 15%)</option>
                  <option value="credit_limit_override">Customer Credit Limit Override</option>
                  <option value="stock_adjustment">Stock Adjustment (Physical Count Variance)</option>
                  <option value="quarantine_release">Quarantine Batch Release</option>
                  <option value="price_change">Product Selling Price Change</option>
                  <option value="purchase_order">Purchase Order Authorization</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Entity Type</label>
                  <input
                    type="text"
                    disabled
                    value={newForm.targetEntityType}
                    className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded-lg text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Entity ID *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 101"
                    value={newForm.targetEntityId}
                    onChange={(e) => setNewForm((prev) => ({ ...prev, targetEntityId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SALE-2026-0045, CUST-012"
                  value={newForm.targetReference}
                  onChange={(e) => setNewForm((prev) => ({ ...prev, targetReference: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Original / Base Value</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 15.00 or 500.00"
                    value={newForm.originalValue}
                    onChange={(e) => setNewForm((prev) => ({ ...prev, originalValue: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Requested Override Value</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 25.00 or 700.00"
                    value={newForm.requestedValue}
                    onChange={(e) => setNewForm((prev) => ({ ...prev, requestedValue: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Justification Reason *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why this policy override is necessary..."
                  value={newForm.reason}
                  onChange={(e) => setNewForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supporting Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional context, medical director authorization notes..."
                  value={newForm.notes}
                  onChange={(e) => setNewForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={newSubmitting}
                  onClick={() => setNewModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {newSubmitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
