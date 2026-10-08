import { useEffect, useState } from 'react';

import { prescriptionsApi, patientsApi, prescribersApi } from '../features/clinical/api.js';
import { productsApi } from '../features/products/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Verification' },
  { value: 'validated', label: 'Validated' },
  { value: 'partially_dispensed', label: 'Partially Dispensed' },
  { value: 'fully_dispensed', label: 'Fully Dispensed' },
  { value: 'refill_available', label: 'Refill Available' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * PrescriptionsPage: Prescription registration, multi-line medicines,
 * clinical verification, lifecycle transitions, and cancellation.
 */
function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail Modal
  const [selectedRx, setSelectedRx] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create Prescription Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientsList, setPatientsList] = useState([]);
  const [prescribersList, setPrescribersList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [savingRx, setSavingRx] = useState(false);
  const [createError, setCreateError] = useState(null);

  const initialRxForm = {
    patientId: '',
    prescriberId: '',
    prescriptionDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
    diagnosis: '',
    notes: '',
    supportingDocumentUrl: '',
    lines: [
      {
        productId: '',
        quantityPrescribed: 1,
        dosage: '1 tablet',
        frequency: 'Once daily',
        duration: '7 days',
        instructions: 'Take after meals',
        refillsAllowed: 0,
      },
    ],
  };
  const [newRx, setNewRx] = useState(initialRxForm);

  // Validation modal / action
  const [rxToValidate, setRxToValidate] = useState(null);
  const [validationNotes, setValidationNotes] = useState('');
  const [validating, setValidating] = useState(false);

  // Cancellation modal / action
  const [rxToCancel, setRxToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function loadPrescriptions() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;

      const res = await prescriptionsApi.list(params);
      setPrescriptions(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPrescriptions();
  }, [page, status]);

  async function openCreateModal() {
    setNewRx(initialRxForm);
    setCreateError(null);
    setShowCreateModal(true);

    try {
      const [patRes, docRes, prodRes] = await Promise.all([
        patientsApi.list({ status: 'active', limit: 100 }),
        prescribersApi.list({ status: 'active', limit: 100 }),
        productsApi.list({ status: 'active', limit: 100 }),
      ]);
      setPatientsList(patRes.data.items || []);
      setPrescribersList(docRes.data.items || []);
      setProductsList(prodRes.data.items || []);
    } catch (err) {
      // Background master list failure
    }
  }

  async function openDetailModal(rxId) {
    setLoadingDetail(true);
    setSelectedRx(null);
    try {
      const res = await prescriptionsApi.get(rxId);
      setSelectedRx(res.data.prescription);
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to load prescription details');
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleLineChange(index, field, value) {
    const updated = [...newRx.lines];
    updated[index] = { ...updated[index], [field]: value };
    setNewRx({ ...newRx, lines: updated });
  }

  function addLine() {
    setNewRx({
      ...newRx,
      lines: [
        ...newRx.lines,
        {
          productId: '',
          quantityPrescribed: 1,
          dosage: '1 tablet',
          frequency: 'Once daily',
          duration: '7 days',
          instructions: 'Take after meals',
          refillsAllowed: 0,
        },
      ],
    });
  }

  function removeLine(index) {
    if (newRx.lines.length <= 1) return;
    const updated = newRx.lines.filter((_, i) => i !== index);
    setNewRx({ ...newRx, lines: updated });
  }

  async function handleCreatePrescription(e) {
    e.preventDefault();
    setSavingRx(true);
    setCreateError(null);
    try {
      // Validate line inputs
      for (const line of newRx.lines) {
        if (!line.productId) {
          throw new Error('Please select a medicine for every prescription line');
        }
        if (Number(line.quantityPrescribed) <= 0) {
          throw new Error('Prescribed quantity must be greater than zero');
        }
      }

      await prescriptionsApi.create(newRx);
      setShowCreateModal(false);
      setNewRx(initialRxForm);
      setPage(1);
      loadPrescriptions();
    } catch (err) {
      setCreateError(err?.response?.data?.error?.message || err.message || 'Failed to register prescription');
    } finally {
      setSavingRx(false);
    }
  }

  async function handleSubmitForVerification(rxId) {
    try {
      await prescriptionsApi.submit(rxId);
      loadPrescriptions();
      if (selectedRx?.id === rxId) {
        openDetailModal(rxId);
      }
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to submit prescription');
    }
  }

  async function handleValidatePrescription() {
    if (!rxToValidate) return;
    setValidating(true);
    try {
      await prescriptionsApi.validate(rxToValidate.id, { validationNotes });
      setRxToValidate(null);
      setValidationNotes('');
      loadPrescriptions();
      if (selectedRx?.id === rxToValidate.id) {
        openDetailModal(rxToValidate.id);
      }
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  }

  async function handleCancelPrescription() {
    if (!rxToCancel) return;
    if (!cancelReason.trim()) {
      alert('Please provide a reason for cancelling this prescription');
      return;
    }
    setCancelling(true);
    try {
      await prescriptionsApi.cancel(rxToCancel.id, { reason: cancelReason });
      setRxToCancel(null);
      setCancelReason('');
      loadPrescriptions();
      if (selectedRx?.id === rxToCancel.id) {
        openDetailModal(rxToCancel.id);
      }
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Cancellation failed');
    } finally {
      setCancelling(false);
    }
  }

  const draftCount = prescriptions.filter((r) => r.status === 'draft').length;
  const pendingCount = prescriptions.filter((r) => r.status === 'pending').length;
  const validatedCount = prescriptions.filter((r) => r.status === 'validated').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescriptions"
        subtitle="Clinical prescription registration, pharmacist verification, and dispensing readiness"
        actions={
          <Can permission="prescription.create">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-700 shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Prescription
            </button>
          </Can>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Prescriptions"
          value={total}
          subtitle="Registered prescriptions"
          color="slate"
        />
        <SummaryCard
          title="Draft Orders"
          value={draftCount}
          subtitle="Unsubmitted draft prescriptions"
          color="slate"
        />
        <SummaryCard
          title="Pending Verification"
          value={pendingCount}
          subtitle="Awaiting clinical review"
          color="amber"
        />
        <SummaryCard
          title="Validated Prescriptions"
          value={validatedCount}
          subtitle="Ready for Task 12 dispensing"
          color="teal"
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            loadPrescriptions();
          }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Rx Number, Patient Name, Doctor, or National ID..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z" />
            </svg>
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Prescriptions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading prescriptions...</div>
        ) : prescriptions.length === 0 ? (
          <EmptyState
            title="No Prescriptions Found"
            message={search ? 'No prescriptions matched your search criteria.' : 'No prescriptions recorded in the system yet.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Rx Number</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Prescriber / Doctor</th>
                  <th className="py-3 px-4">Prescription Date</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions.map((rx) => (
                  <tr key={rx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-sky-700">
                      {rx.prescription_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{rx.patient_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{rx.patient_number}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{rx.prescriber_name}</div>
                      {rx.prescriber_license && (
                        <div className="text-xs text-slate-400 font-mono">{rx.prescriber_license}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {rx.prescription_date ? new Date(rx.prescription_date).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {rx.expiry_date ? new Date(rx.expiry_date).toISOString().split('T')[0] : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={rx.status} />
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600 font-medium">
                      {rx.lines_count || 1}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => openDetailModal(rx.id)}
                        className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                      >
                        View Details
                      </button>

                      {rx.status === 'draft' && (
                        <Can permission="prescription.update">
                          <button
                            onClick={() => handleSubmitForVerification(rx.id)}
                            className="text-xs text-amber-600 hover:text-amber-800 font-medium ml-2"
                          >
                            Submit
                          </button>
                        </Can>
                      )}

                      {['draft', 'pending'].includes(rx.status) && (
                        <Can permission="prescription.validate">
                          <button
                            onClick={() => {
                              setRxToValidate(rx);
                              setValidationNotes('');
                            }}
                            className="text-xs text-teal-600 hover:text-teal-800 font-medium ml-2"
                          >
                            Validate
                          </button>
                        </Can>
                      )}

                      {['draft', 'pending', 'validated'].includes(rx.status) && (
                        <Can permission="prescription.cancel">
                          <button
                            onClick={() => {
                              setRxToCancel(rx);
                              setCancelReason('');
                            }}
                            className="text-xs text-rose-600 hover:text-rose-800 font-medium ml-2"
                          >
                            Cancel
                          </button>
                        </Can>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > limit && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} prescriptions
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Prescription Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg">New Prescription Order</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreatePrescription} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {createError}
                </div>
              )}

              {/* Patient & Prescriber Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Patient <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={newRx.patientId}
                    onChange={(e) => setNewRx({ ...newRx, patientId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="">-- Choose Patient --</option>
                    {patientsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_number} — {p.first_name} {p.last_name} ({p.phone || 'No phone'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Prescriber / Doctor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={newRx.prescriberId}
                    onChange={(e) => setNewRx({ ...newRx, prescriberId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="">-- Choose Prescriber --</option>
                    {prescribersList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.specialty ? `(${d.specialty})` : ''} {d.license_number ? `[${d.license_number}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prescription Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Prescription Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newRx.prescriptionDate}
                    onChange={(e) => setNewRx({ ...newRx, prescriptionDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={newRx.expiryDate}
                    onChange={(e) => setNewRx({ ...newRx, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Clinical Diagnosis
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acute Bronchitis"
                    value={newRx.diagnosis}
                    onChange={(e) => setNewRx({ ...newRx, diagnosis: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Prescribed Medicines (Multi-line) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
                    Prescribed Medicines ({newRx.lines.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-800 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Another Medicine
                  </button>
                </div>

                <div className="space-y-4">
                  {newRx.lines.map((line, idx) => {
                    const selectedProd = productsList.find((p) => String(p.id) === String(line.productId));
                    return (
                      <div key={idx} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                              Medicine / Product <span className="text-rose-500">*</span>
                            </label>
                            <select
                              required
                              value={line.productId}
                              onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            >
                              <option value="">-- Choose Product Master --</option>
                              {productsList.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} {p.code ? `[${p.code}]` : ''} — {p.prescription_classification || 'prescription'}
                                </option>
                              ))}
                            </select>
                            {selectedProd && (
                              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="px-2 py-0.5 bg-slate-200 rounded font-medium">
                                  Class: {selectedProd.prescription_classification || 'OTC'}
                                </span>
                                {selectedProd.is_controlled && (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-semibold">
                                    Controlled Substance
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {newRx.lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="mt-6 text-rose-500 hover:text-rose-700 p-1"
                              title="Remove Medicine Line"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {/* Dosage details */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                              Quantity Prescribed <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={line.quantityPrescribed}
                              onChange={(e) => handleLineChange(idx, 'quantityPrescribed', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                              Dosage <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. 1 cap"
                              value={line.dosage}
                              onChange={(e) => handleLineChange(idx, 'dosage', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                              Frequency <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. TID / 3x daily"
                              value={line.frequency}
                              onChange={(e) => handleLineChange(idx, 'frequency', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                              Duration <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. 7 days"
                              value={line.duration}
                              onChange={(e) => handleLineChange(idx, 'duration', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                              Refills Allowed
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={line.refillsAllowed}
                              onChange={(e) => handleLineChange(idx, 'refillsAllowed', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Specific Patient Instructions
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Take with food, finish complete course"
                            value={line.instructions}
                            onChange={(e) => handleLineChange(idx, 'instructions', e.target.value)}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Supporting document / Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Supporting Prescription Document / Reference URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://storage... or document ref#"
                    value={newRx.supportingDocumentUrl}
                    onChange={(e) => setNewRx({ ...newRx, supportingDocumentUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Prescription Notes
                  </label>
                  <input
                    type="text"
                    value={newRx.notes}
                    onChange={(e) => setNewRx({ ...newRx, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRx}
                  className="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  {savingRx ? 'Creating Prescription...' : 'Register Prescription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prescription Detail Modal */}
      {selectedRx && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-900 text-lg">
                  Prescription {selectedRx.prescription_number}
                </h3>
                <StatusBadge status={selectedRx.status} />
              </div>
              <button
                onClick={() => setSelectedRx(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Patient & Doctor summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl text-sm">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Patient</span>
                  <div className="font-medium text-slate-900">{selectedRx.patient_name}</div>
                  <div className="text-xs text-slate-500 font-mono">{selectedRx.patient_number}</div>
                  {selectedRx.patient_allergies && (
                    <div className="text-xs text-rose-600 mt-1">Allergies: {selectedRx.patient_allergies}</div>
                  )}
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Prescriber</span>
                  <div className="font-medium text-slate-900">{selectedRx.prescriber_name}</div>
                  <div className="text-xs text-slate-500 font-mono">{selectedRx.prescriber_license || 'No license#'}</div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Prescription Date</span>
                  <div className="font-medium text-slate-800">
                    {selectedRx.prescription_date ? new Date(selectedRx.prescription_date).toISOString().split('T')[0] : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Expiry Date</span>
                  <div className="font-medium text-slate-800">
                    {selectedRx.expiry_date ? new Date(selectedRx.expiry_date).toISOString().split('T')[0] : '—'}
                  </div>
                </div>
              </div>

              {/* Diagnosis & Attachment */}
              {(selectedRx.diagnosis || selectedRx.supporting_document_url) && (
                <div className="text-sm p-4 bg-slate-50 rounded-xl space-y-2">
                  {selectedRx.diagnosis && (
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Diagnosis</span>
                      <span className="text-slate-800 font-medium">{selectedRx.diagnosis}</span>
                    </div>
                  )}
                  {selectedRx.supporting_document_url && (
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Supporting Document</span>
                      <a
                        href={selectedRx.supporting_document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:underline font-mono text-xs"
                      >
                        {selectedRx.supporting_document_url}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Prescribed Items Table */}
              <div>
                <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wide mb-3">
                  Prescription Lines
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3">Medicine</th>
                        <th className="py-2.5 px-3">Dosage / Form</th>
                        <th className="py-2.5 px-3">Regimen</th>
                        <th className="py-2.5 px-3 text-center">Prescribed</th>
                        <th className="py-2.5 px-3 text-center">Dispensed</th>
                        <th className="py-2.5 px-3 text-center">Remaining</th>
                        <th className="py-2.5 px-3 text-center">Refills</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedRx.lines || []).map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            <div>{line.product_name}</div>
                            {line.instructions && (
                              <div className="text-xs text-slate-400 italic">{line.instructions}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-xs">
                            <div>{line.prescribed_strength || '—'}</div>
                            <div className="text-slate-400">{line.prescribed_dosage_form || '—'} ({line.prescribed_route || 'Oral'})</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-xs">
                            <div>{line.dosage} • {line.frequency}</div>
                            <div className="text-slate-400">{line.duration}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-slate-800">
                            {line.quantity_prescribed}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-500">
                            {line.quantity_dispensed}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-sky-700">
                            {line.quantity_remaining}
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                            {line.refills_allowed > 0 ? (
                              <span>{line.refills_remaining} of {line.refills_allowed}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit / Validation Trail */}
              {selectedRx.validated_at && (
                <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl text-xs text-teal-800 space-y-1">
                  <div className="font-semibold text-teal-900 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Validated Clinical Prescription
                  </div>
                  <div>Validated at: {new Date(selectedRx.validated_at).toLocaleString()}</div>
                  {selectedRx.validation_notes && (
                    <div>Pharmacist Note: {selectedRx.validation_notes}</div>
                  )}
                </div>
              )}

              {selectedRx.cancelled_at && (
                <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Prescription Cancelled
                  </div>
                  <div>Cancelled at: {new Date(selectedRx.cancelled_at).toLocaleString()}</div>
                  <div>Reason: {selectedRx.cancelled_reason || 'Discontinued'}</div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                Prescription ID #{selectedRx.id}
              </span>
              <div className="flex items-center gap-2">
                {selectedRx.status === 'draft' && (
                  <Can permission="prescription.update">
                    <button
                      onClick={() => handleSubmitForVerification(selectedRx.id)}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                    >
                      Submit for Verification
                    </button>
                  </Can>
                )}

                {['draft', 'pending'].includes(selectedRx.status) && (
                  <Can permission="prescription.validate">
                    <button
                      onClick={() => {
                        setRxToValidate(selectedRx);
                        setValidationNotes('');
                      }}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700"
                    >
                      Validate Prescription
                    </button>
                  </Can>
                )}

                {['draft', 'pending', 'validated'].includes(selectedRx.status) && (
                  <Can permission="prescription.cancel">
                    <button
                      onClick={() => {
                        setRxToCancel(selectedRx);
                        setCancelReason('');
                      }}
                      className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700"
                    >
                      Cancel Prescription
                    </button>
                  </Can>
                )}

                <button
                  onClick={() => setSelectedRx(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Validation Action Dialog */}
      {rxToValidate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-teal-50 flex items-center justify-between">
              <h3 className="font-semibold text-teal-900 text-base flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Validate Prescription
              </h3>
              <button onClick={() => setRxToValidate(null)} className="text-teal-700 hover:text-teal-900">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                You are performing authoritative clinical validation for prescription{' '}
                <span className="font-mono font-medium text-slate-900">{rxToValidate.prescription_number}</span>.
                The server will verify that patient, doctor, and medicine statuses are active and dates are valid.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Pharmacist Clinical Review Notes
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Dosage verified against renal function, no interactions found."
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRxToValidate(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={validating}
                  onClick={handleValidatePrescription}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {validating ? 'Validating...' : 'Approve & Validate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Cancellation Action Dialog */}
      {rxToCancel && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-rose-50 flex items-center justify-between">
              <h3 className="font-semibold text-rose-900 text-base flex items-center gap-2">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Cancel Prescription
              </h3>
              <button onClick={() => setRxToCancel(null)} className="text-rose-700 hover:text-rose-900">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Cancelling prescription{' '}
                <span className="font-mono font-medium text-slate-900">{rxToCancel.prescription_number}</span> will
                prevent any future dispensing. Historical records will be retained.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Doctor cancelled therapy, dosage change, patient adverse event."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRxToCancel(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={cancelling || !cancelReason.trim()}
                  onClick={handleCancelPrescription}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrescriptionsPage;
