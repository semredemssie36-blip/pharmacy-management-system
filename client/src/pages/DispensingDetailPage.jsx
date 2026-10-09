import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { dispensingsApi } from '../features/clinical/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

/**
 * DispensingDetailPage: Comprehensive view of a dispensing transaction,
 * FEFO batch reservations, and Pharmacist Clinical Verification workflow.
 */
export default function DispensingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dispensing, setDispensing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Verification Modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [checklist, setChecklist] = useState({
    identityConfirmed: false,
    dosageDirectionsVerified: false,
    batchExpiriesChecked: false,
    interactionsReviewed: false,
  });

  // Rejection Modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Cancellation Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  async function loadDetail() {
    setLoading(true);
    setError(null);
    try {
      const res = await dispensingsApi.get(id);
      setDispensing(res.data.dispensing);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load dispensing details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [id]);

  // Action: Allocate stock
  async function handleAllocate() {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await dispensingsApi.allocate(id);
      setDispensing(res.data.dispensing);
      setActionSuccess('Stock allocated successfully via FEFO (Earliest Expiry First).');
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Stock allocation failed.');
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Submit for verification
  async function handleSubmitVerification() {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await dispensingsApi.submitVerification(id);
      setDispensing(res.data.dispensing);
      setActionSuccess('Dispensing order submitted for pharmacist verification.');
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Submission failed.');
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Pharmacist Verify
  async function handleConfirmVerify() {
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await dispensingsApi.verify(id, {
        verificationNotes: verificationNotes.trim() || undefined,
      });
      setDispensing(res.data.dispensing);
      setShowVerifyModal(false);
      setActionSuccess('Dispensing order clinically verified! Order is now ready for cashier checkout in Task 13 (Payments).');
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Verification failed.');
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Pharmacist Reject
  async function handleConfirmReject() {
    if (!rejectionReason.trim()) {
      setError('A mandatory rejection reason is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await dispensingsApi.reject(id, {
        rejectionReason: rejectionReason.trim(),
      });
      setDispensing(res.data.dispensing);
      setShowRejectModal(false);
      setActionSuccess('Dispensing order rejected. All reserved inventory has been released back to stock.');
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Rejection failed.');
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Cancel
  async function handleConfirmCancel() {
    if (!cancellationReason.trim()) {
      setError('A cancellation reason is required.');
      return;
    }
    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await dispensingsApi.cancel(id, {
        cancellationReason: cancellationReason.trim(),
      });
      setDispensing(res.data.dispensing);
      setShowCancelModal(false);
      setActionSuccess('Dispensing order cancelled. Stock reservations released.');
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Cancellation failed.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="mt-3 text-sm font-medium">Loading dispensing transaction...</p>
      </div>
    );
  }

  if (!dispensing) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-slate-800">Dispensing Order Not Found</h2>
        <Link to="/clinical/dispensings" className="mt-4 inline-block text-sm text-emerald-600 hover:underline">
          Return to Dispensings Directory
        </Link>
      </div>
    );
  }

  const isAllChecklistChecked =
    checklist.identityConfirmed &&
    checklist.dosageDirectionsVerified &&
    checklist.batchExpiriesChecked &&
    checklist.interactionsReviewed;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title={`Dispensing Order #${dispensing.dispensing_number}`}
        subtitle={`Prepared from Prescription #${dispensing.prescription_number}`}
        breadcrumbs={[
          { label: 'Clinical', href: '/clinical/prescriptions' },
          { label: 'Dispensings', href: '/clinical/dispensings' },
          { label: dispensing.dispensing_number },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/clinical/dispensings"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Back to Directory
            </Link>

            {/* Workflow Action Buttons */}
            {dispensing.status === 'draft' && (
              <Can permission="dispensing.allocate">
                <button
                  onClick={handleAllocate}
                  disabled={actionLoading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {actionLoading ? 'Allocating...' : 'Allocate Stock (FEFO)'}
                </button>
              </Can>
            )}

            {dispensing.status === 'stock_allocated' && (
              <Can permission="dispensing.allocate">
                <button
                  onClick={handleSubmitVerification}
                  disabled={actionLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {actionLoading ? 'Submitting...' : 'Submit for Pharmacist Review'}
                </button>
              </Can>
            )}

            {dispensing.status === 'pending_verification' && (
              <div className="flex items-center gap-2">
                <Can permission="dispensing.verify">
                  <button
                    onClick={() => setShowVerifyModal(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition"
                  >
                    Pharmacist Verify
                  </button>
                </Can>
                <Can permission="dispensing.reject">
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-rose-700 transition"
                  >
                    Reject Order
                  </button>
                </Can>
              </div>
            )}

            {['draft', 'stock_allocated', 'pending_verification'].includes(dispensing.status) && (
              <Can permission="dispensing.cancel">
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition"
                >
                  Cancel Order
                </button>
              </Can>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          {actionSuccess}
        </div>
      )}

      {/* Status & Clinical State Banner */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Status:</span>
            <StatusBadge status={dispensing.status} />
          </div>
          <div className="text-xs text-slate-500">
            Created on {new Date(dispensing.created_at).toLocaleString()} by <span className="font-medium text-slate-700">{dispensing.created_by_name || 'Staff User'}</span>
          </div>
        </div>

        {/* Verification banner */}
        {dispensing.verified_at && (
          <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
            <div className="flex items-center gap-2 font-bold">
              <svg className="h-5 w-5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Clinically Verified by Pharmacist: {dispensing.verified_by_name}
            </div>
            <div className="text-xs text-teal-800 mt-1">
              Verified at {new Date(dispensing.verified_at).toLocaleString()}
            </div>
            {dispensing.verification_notes && (
              <div className="mt-2 text-xs italic text-teal-800 bg-teal-100/60 p-2 rounded">
                Notes: {dispensing.verification_notes}
              </div>
            )}
            <div className="mt-2 text-xs text-teal-900 font-medium">
              Order status: Payment Pending. Stock remains safely reserved. Cashier can complete sale in Task 13.
            </div>
          </div>
        )}

        {/* Rejection banner */}
        {dispensing.rejected_at && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-bold flex items-center gap-2">
              <svg className="h-5 w-5 text-rose-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Order Rejected by Pharmacist: {dispensing.rejected_by_name}
            </div>
            <div className="text-xs text-rose-700 mt-1">
              Rejected at {new Date(dispensing.rejected_at).toLocaleString()}
            </div>
            <div className="mt-2 text-xs text-rose-800 bg-rose-100/60 p-2 rounded">
              Reason: {dispensing.rejection_reason}
            </div>
          </div>
        )}

        {/* Cancellation banner */}
        {dispensing.cancelled_at && (
          <div className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800">
            <div className="font-bold">Order Cancelled</div>
            <div className="text-xs text-slate-600 mt-1">
              Cancelled at {new Date(dispensing.cancelled_at).toLocaleString()} by {dispensing.cancelled_by_name}
            </div>
            {dispensing.cancellation_reason && (
              <div className="mt-2 text-xs text-slate-700 italic">
                Reason: {dispensing.cancellation_reason}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clinical Context Cards: Patient, Prescriber, Warehouse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Patient Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Information</div>
          <div className="mt-2 text-base font-bold text-slate-900">
            {dispensing.patient_first_name} {dispensing.patient_last_name}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            MRN: <span className="font-mono font-medium">{dispensing.patient_mrn || 'N/A'}</span>
          </div>
          <div className="text-xs text-slate-600">
            DOB: {dispensing.patient_dob ? new Date(dispensing.patient_dob).toLocaleDateString() : 'N/A'} | Gender: {dispensing.patient_gender || 'N/A'}
          </div>
          {dispensing.patient_allergies && (
            <div className="mt-2 rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 font-semibold">
              Allergies: {dispensing.patient_allergies}
            </div>
          )}
        </div>

        {/* Prescription Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prescription Details</div>
          <div className="mt-2 font-mono font-bold text-slate-900">
            {dispensing.prescription_number}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Prescriber: <span className="font-medium">{dispensing.prescriber_name || 'Dr. Physician'}</span>
          </div>
          <div className="text-xs text-slate-600">
            License: <span className="font-mono">{dispensing.prescriber_license_number || 'N/A'}</span>
          </div>
          <div className="text-xs text-slate-600">
            Rx Expiry: {dispensing.prescription_expiry_date ? new Date(dispensing.prescription_expiry_date).toLocaleDateString() : '-'}
          </div>
        </div>

        {/* Location & Warehouse */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dispensing Pharmacy Location</div>
          <div className="mt-2 font-bold text-slate-900">
            {dispensing.warehouse_name || 'Primary Pharmacy Warehouse'}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Branch: <span className="font-medium">{dispensing.branch_name}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Dispensing Date: {dispensing.dispensing_date ? new Date(dispensing.dispensing_date).toLocaleDateString() : '-'}
          </div>
        </div>
      </div>

      {/* Dispensing Medicine Lines Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Prescribed Items & Dispensing Quantities
          </h3>
          <span className="text-xs text-slate-500">
            {(dispensing.lines || []).length} item(s) in this order
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Clinical Instructions</th>
                <th className="px-4 py-3 text-right">Prescribed</th>
                <th className="px-4 py-3 text-right">Requested</th>
                <th className="px-4 py-3 text-right">Allocated</th>
                <th className="px-4 py-3 text-right">Dispensed</th>
                <th className="px-4 py-3">Line Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(dispensing.lines || []).map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{l.product_name}</div>
                    <div className="text-xs text-slate-500 font-mono">{l.product_code}</div>
                    {l.controlled_classification !== 'none' && (
                      <span className="inline-block mt-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                        Controlled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <div><span className="font-medium">Dose:</span> {l.dosage} ({l.frequency})</div>
                    <div><span className="font-medium">Duration:</span> {l.duration}</div>
                    {l.instructions && <div className="text-slate-500 italic mt-0.5">{l.instructions}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    {l.quantity_prescribed} {l.unit_code}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    {l.quantity_requested} {l.unit_code}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                    {l.quantity_allocated} {l.unit_code}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    {l.quantity_dispensed} {l.unit_code}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {l.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FEFO Batch Allocation Traceability Section */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Batch Allocations (FEFO Traceability)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Specific batches and physical inventory positions allocated to this order.
            </p>
          </div>
          {dispensing.status === 'draft' && (
            <span className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
              Stock Allocation Pending
            </span>
          )}
        </div>

        {/* List of allocations */}
        {(() => {
          const allAllocations = (dispensing.lines || []).flatMap((l) =>
            (l.allocations || []).map((a) => ({ ...a, productName: l.product_name, lineId: l.id })),
          );

          if (allAllocations.length === 0) {
            return (
              <div className="p-8 text-center text-sm text-slate-500">
                {dispensing.status === 'draft' ? (
                  <div>
                    <p>No batches have been allocated yet.</p>
                    <Can permission="dispensing.allocate">
                      <button
                        onClick={handleAllocate}
                        disabled={actionLoading}
                        className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition"
                      >
                        Click to Allocate Stock (FEFO)
                      </button>
                    </Can>
                  </div>
                ) : (
                  <p>No active batch allocations for this order.</p>
                )}
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Medicine</th>
                    <th className="px-4 py-3">Batch Number</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3">Storage Location</th>
                    <th className="px-4 py-3 text-right">Allocated Qty</th>
                    <th className="px-4 py-3">Reservation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allAllocations.map((a) => {
                    const expiryDate = a.expiry_date ? new Date(a.expiry_date) : null;
                    const isExpiringSoon = expiryDate && (expiryDate - new Date()) / (1000 * 60 * 60 * 24) < 90;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{a.productName}</td>
                        <td className="px-4 py-3 font-mono text-slate-900 font-bold">{a.batch_number}</td>
                        <td className="px-4 py-3">
                          <span className={isExpiringSoon ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                            {expiryDate ? expiryDate.toLocaleDateString() : '-'}
                          </span>
                          {isExpiringSoon && (
                            <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-semibold">
                              Near Expiry
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {a.storage_location_name || a.storage_location_code || 'General Storage'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                          {a.quantity} {a.unit_code}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                              a.status === 'reserved'
                                ? 'bg-cyan-100 text-cyan-800'
                                : a.status === 'consumed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Pharmacist Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pharmacist Clinical Verification
            </h3>
            <p className="text-xs text-slate-500">
              Confirm clinical correctness, dosage directions, and batch authenticity before advancing to payment readiness.
            </p>

            {/* Verification Safety Checklist */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-700">
              <div className="font-semibold uppercase text-slate-500 mb-1">Clinical Verification Checklist</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.identityConfirmed}
                  onChange={(e) => setChecklist({ ...checklist, identityConfirmed: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Patient identity & allergies confirmed ({dispensing.patient_first_name} {dispensing.patient_last_name})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.dosageDirectionsVerified}
                  onChange={(e) => setChecklist({ ...checklist, dosageDirectionsVerified: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Dosage, frequency, duration, and instructions clinically appropriate</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.batchExpiriesChecked}
                  onChange={(e) => setChecklist({ ...checklist, batchExpiriesChecked: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>FEFO allocated batches and expiry dates inspected</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.interactionsReviewed}
                  onChange={(e) => setChecklist({ ...checklist, interactionsReviewed: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>No contraindicated drug-drug interactions or safety warnings</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Pharmacist Review Notes
              </label>
              <textarea
                rows={3}
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="Optional clinical notes, patient counseling advice, or verification log..."
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !isAllChecklistChecked}
                onClick={handleConfirmVerify}
                className="rounded-md bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {actionLoading ? 'Verifying...' : 'Authorize & Verify Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pharmacist Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
              <svg className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Reject Dispensing Order
            </h3>
            <p className="text-xs text-slate-500">
              Rejecting this order releases all reserved batch inventory back to available stock. A mandatory clinical reason is required.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Clinical Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State clinical reason (e.g., contraindicated dosage, allergy conflict, expired prescription)..."
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-rose-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={handleConfirmReject}
                className="rounded-md bg-rose-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Cancel Dispensing Order</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to cancel this order? Any allocated stock will be released immediately.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Cancellation Reason *
              </label>
              <textarea
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={actionLoading || !cancellationReason.trim()}
                onClick={handleConfirmCancel}
                className="rounded-md bg-rose-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
