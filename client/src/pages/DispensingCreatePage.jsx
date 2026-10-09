import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

import { dispensingsApi, prescriptionsApi } from '../features/clinical/api.js';
import { warehousesApi } from '../features/organizations/api.js';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

/**
 * DispensingCreatePage: Initiates a new pharmacy dispensing order
 * against an eligible validated prescription.
 */
export default function DispensingCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRxId = searchParams.get('prescriptionId') || '';

  const [eligiblePrescriptions, setEligiblePrescriptions] = useState([]);
  const [selectedRxId, setSelectedRxId] = useState(initialRxId);
  const [selectedRx, setSelectedRx] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [dispensingNotes, setDispensingNotes] = useState('');
  const [lines, setLines] = useState([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingRx, setLoadingRx] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load eligible prescriptions (validated, partially_dispensed, refill_available)
  useEffect(() => {
    async function loadPrescriptions() {
      setLoadingList(true);
      try {
        const [valRes, partRes, refRes] = await Promise.all([
          prescriptionsApi.list({ status: 'validated', limit: 50 }),
          prescriptionsApi.list({ status: 'partially_dispensed', limit: 50 }),
          prescriptionsApi.list({ status: 'refill_available', limit: 50 }),
        ]);

        const combined = [
          ...(valRes.data.items || []),
          ...(partRes.data.items || []),
          ...(refRes.data.items || []),
        ];
        // Deduplicate
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        setEligiblePrescriptions(unique);
      } catch (err) {
        setError('Failed to load eligible prescriptions list');
      } finally {
        setLoadingList(false);
      }
    }
    loadPrescriptions();
  }, []);

  // When prescription is selected, fetch full details & eligible warehouses
  useEffect(() => {
    if (!selectedRxId) {
      setSelectedRx(null);
      setLines([]);
      setWarehouses([]);
      setSelectedWarehouseId('');
      return;
    }

    async function loadRxDetail() {
      setLoadingRx(true);
      setError(null);
      try {
        const res = await prescriptionsApi.get(selectedRxId);
        const rx = res.data.prescription;
        setSelectedRx(rx);

        // Pre-populate lines with available remaining quantity
        const prepLines = (rx.lines || [])
          .filter((l) => Number(l.quantity_remaining) > 0)
          .map((l) => ({
            prescriptionLineId: l.id,
            productId: l.product_id,
            productName: l.product_name,
            productCode: l.product_code,
            prescribedStrength: l.prescribed_strength,
            dosage: l.dosage,
            frequency: l.frequency,
            duration: l.duration,
            instructions: l.instructions,
            prescriptionClassification: l.prescription_classification,
            controlledClassification: l.controlled_classification,
            unitName: l.unit_name || 'Units',
            quantityPrescribed: Number(l.quantity_prescribed),
            quantityDispensed: Number(l.quantity_dispensed),
            quantityRemaining: Number(l.quantity_remaining),
            quantityRequested: Number(l.quantity_remaining),
            notes: '',
            included: true,
          }));

        setLines(prepLines);

        // Load warehouses for prescription's branch
        if (rx.branch_id) {
          const whRes = await warehousesApi.list({ branchId: rx.branch_id });
          const whList = whRes.data.warehouses || whRes.data.items || [];
          setWarehouses(whList);
          if (whList.length > 0) {
            setSelectedWarehouseId(String(whList[0].id));
          }
        }
      } catch (err) {
        setError(err?.response?.data?.error?.message || err.message || 'Failed to load prescription details');
      } finally {
        setLoadingRx(false);
      }
    }

    loadRxDetail();
  }, [selectedRxId]);

  function handleQuantityChange(pLineId, val) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.prescriptionLineId === pLineId) {
          return { ...l, quantityRequested: val };
        }
        return l;
      }),
    );
  }

  function handleLineNotesChange(pLineId, val) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.prescriptionLineId === pLineId) {
          return { ...l, notes: val };
        }
        return l;
      }),
    );
  }

  function handleLineToggle(pLineId) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.prescriptionLineId === pLineId) {
          return { ...l, included: !l.included };
        }
        return l;
      }),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!selectedRxId) {
      setError('Please select an active prescription.');
      return;
    }
    if (!selectedWarehouseId) {
      setError('Please select an authorized dispensing warehouse.');
      return;
    }

    const activeLines = lines.filter((l) => l.included);
    if (activeLines.length === 0) {
      setError('At least one medicine line must be selected for dispensing.');
      return;
    }

    for (const l of activeLines) {
      const q = Number(l.quantityRequested);
      if (!Number.isFinite(q) || q <= 0) {
        setError(`Please enter a valid positive quantity for ${l.productName}.`);
        return;
      }
      if (q > l.quantityRemaining) {
        setError(`Quantity requested for ${l.productName} (${q}) cannot exceed remaining prescribed (${l.quantityRemaining}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        prescriptionId: Number(selectedRxId),
        warehouseId: Number(selectedWarehouseId),
        notes: dispensingNotes.trim() || undefined,
        lines: activeLines.map((l) => ({
          prescriptionLineId: l.prescriptionLineId,
          quantityRequested: Number(l.quantityRequested),
          notes: l.notes.trim() || undefined,
        })),
      };

      const res = await dispensingsApi.create(payload);
      const newDispensing = res.data.dispensing;
      // Navigate directly to detail page to perform FEFO stock allocation
      navigate(`/clinical/dispensings/${newDispensing.id}`);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to create dispensing order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Prepare Dispensing Order"
        subtitle="Select a clinically validated prescription to allocate stock and prepare for pharmacist verification"
        breadcrumbs={[
          { label: 'Clinical', href: '/clinical/prescriptions' },
          { label: 'Dispensings', href: '/clinical/dispensings' },
          { label: 'New Order' },
        ]}
      />

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Select Prescription */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
              1
            </span>
            Prescription Selection
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Prescription (Validated / Ready to Dispense) *
              </label>
              {loadingList ? (
                <div className="text-xs text-slate-500 py-2">Loading active prescriptions...</div>
              ) : (
                <select
                  value={selectedRxId}
                  onChange={(e) => setSelectedRxId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">-- Choose Prescription --</option>
                  {eligiblePrescriptions.map((rx) => (
                    <option key={rx.id} value={rx.id}>
                      {rx.prescription_number} — {rx.patient_first_name} {rx.patient_last_name} ({rx.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Dispensing Warehouse *
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={warehouses.length === 0}
                className="w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                required
              >
                <option value="">-- Choose Warehouse --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Clinical Details Context Card */}
        {loadingRx && (
          <div className="p-8 text-center text-slate-500 bg-white rounded-lg border border-slate-200">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-2 text-sm">Loading clinical details and remaining quantities...</p>
          </div>
        )}

        {selectedRx && !loadingRx && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                2
              </span>
              Clinical Context & Patient Safety
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Patient Information</div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {selectedRx.patient_first_name} {selectedRx.patient_last_name}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  MRN: <span className="font-mono font-medium">{selectedRx.patient_mrn || 'N/A'}</span>
                </div>
                {selectedRx.patient_allergies && (
                  <div className="mt-2 rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 font-medium">
                    Allergies: {selectedRx.patient_allergies}
                  </div>
                )}
              </div>

              {/* Prescriber Card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Prescribing Clinician</div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {selectedRx.prescriber_name || 'Dr. Clinical Provider'}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  License: <span className="font-mono">{selectedRx.prescriber_license_number || 'N/A'}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Rx Date: {selectedRx.prescription_date ? new Date(selectedRx.prescription_date).toLocaleDateString() : '-'} | Expiry: {selectedRx.expiry_date ? new Date(selectedRx.expiry_date).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Medicine Selection & Quantity Input */}
        {selectedRx && !loadingRx && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                3
              </span>
              Prescribed Medicines & Quantities to Dispense
            </h2>

            {lines.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center">
                No eligible medicines with remaining quantity found on this prescription.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-3 w-10">Include</th>
                      <th className="px-3 py-3">Medicine & Strength</th>
                      <th className="px-3 py-3">Directions / Frequency</th>
                      <th className="px-3 py-3 text-right">Prescribed</th>
                      <th className="px-3 py-3 text-right">Prev. Dispensed</th>
                      <th className="px-3 py-3 text-right">Remaining</th>
                      <th className="px-3 py-3 text-right w-36">Dispense Now *</th>
                      <th className="px-3 py-3">Line Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {lines.map((l) => (
                      <tr key={l.prescriptionLineId} className={l.included ? 'hover:bg-slate-50' : 'bg-slate-50 opacity-60'}>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={l.included}
                            onChange={() => handleLineToggle(l.prescriptionLineId)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{l.productName}</div>
                          <div className="text-xs text-slate-500 font-mono">{l.productCode}</div>
                          {l.controlledClassification !== 'none' && (
                            <span className="inline-block mt-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                              Controlled Drug
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          <div><span className="font-medium">Dose:</span> {l.dosage} ({l.frequency})</div>
                          <div><span className="font-medium">Duration:</span> {l.duration}</div>
                          {l.instructions && <div className="text-slate-500 italic mt-0.5">{l.instructions}</div>}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-700">
                          {l.quantityPrescribed}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-500">
                          {l.quantityDispensed}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                          {l.quantityRemaining}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min="0.001"
                            max={l.quantityRemaining}
                            step="any"
                            disabled={!l.included}
                            value={l.quantityRequested}
                            onChange={(e) => handleQuantityChange(l.prescriptionLineId, e.target.value)}
                            className="w-28 rounded-md border border-slate-300 py-1 px-2 text-right text-sm font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                            required={l.included}
                          />
                          {Number(l.quantityRequested) < l.quantityRemaining && (
                            <div className="text-[11px] text-amber-700 mt-1 font-medium">Partial Dispense</div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            placeholder="Optional notes..."
                            disabled={!l.included}
                            value={l.notes}
                            onChange={(e) => handleLineNotesChange(l.prescriptionLineId, e.target.value)}
                            className="w-full rounded-md border border-slate-200 py-1 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Order Notes / Dispensing Instructions
              </label>
              <textarea
                rows={2}
                value={dispensingNotes}
                onChange={(e) => setDispensingNotes(e.target.value)}
                placeholder="Optional overall dispensing preparation notes..."
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <Link
            to="/clinical/dispensings"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !selectedRx || lines.filter((l) => l.included).length === 0}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
          >
            {submitting && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Create Order & Proceed to Stock Allocation
          </button>
        </div>
      </form>
    </div>
  );
}
