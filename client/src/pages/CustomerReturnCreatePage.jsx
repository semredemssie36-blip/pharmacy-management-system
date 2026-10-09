import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { customerReturnsApi } from '../features/returns/api.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function CustomerReturnCreatePage() {
  const navigate = useNavigate();

  const [saleInput, setSaleInput] = useState('');
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [eligibilityData, setEligibilityData] = useState(null);

  // Form State
  const [selectedLines, setSelectedLines] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleFetchSale(e) {
    e.preventDefault();
    const idOrNum = saleInput.trim();
    if (!idOrNum) return;

    setSaleLoading(true);
    setSaleError('');
    setEligibilityData(null);
    setSelectedLines({});

    try {
      const res = await customerReturnsApi.getSaleEligibility(idOrNum);
      const data = res.data;
      setEligibilityData(data);

      // Pre-populate empty line states
      const initialMap = {};
      data.lines.forEach((l) => {
        if (l.is_returnable && l.allocations?.length > 0) {
          initialMap[l.id] = {
            selected: false,
            quantity: 1,
            batchId: l.allocations[0].batch_id,
            storageLocationId: l.allocations[0].storage_location_id,
          };
        }
      });
      setSelectedLines(initialMap);
    } catch (err) {
      setSaleError(err?.response?.data?.error?.message || err.message || 'Failed to fetch sale eligibility.');
    } finally {
      setSaleLoading(false);
    }
  }

  function handleLineCheck(lineId, checked) {
    setSelectedLines((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        selected: checked,
      },
    }));
  }

  function handleLineQtyChange(lineId, qty, maxQty) {
    const num = Math.max(1, Math.min(Number(qty) || 1, maxQty));
    setSelectedLines((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        quantity: num,
      },
    }));
  }

  function handleBatchChange(lineId, batchId) {
    setSelectedLines((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        batchId: Number(batchId),
      },
    }));
  }

  async function handleSubmit(shouldSubmitRightAway) {
    setFormError('');

    if (!returnReason.trim()) {
      setFormError('A clear return reason is required.');
      return;
    }

    const linesToReturn = [];
    Object.entries(selectedLines).forEach(([lineId, item]) => {
      if (item.selected) {
        linesToReturn.push({
          saleLineId: Number(lineId),
          batchId: item.batchId,
          quantity: item.quantity,
          storageLocationId: item.storageLocationId,
        });
      }
    });

    if (linesToReturn.length === 0) {
      setFormError('Please select at least one item to return.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await customerReturnsApi.create({
        saleId: eligibilityData.sale.id,
        reason: returnReason.trim(),
        notes: notes.trim() || undefined,
        lines: linesToReturn,
        submit: shouldSubmitRightAway,
      });

      const newReturn = res.data?.customerReturn;
      navigate(`/returns/customer/${newReturn.id}`);
    } catch (err) {
      setFormError(err?.response?.data?.error?.message || err.message || 'Failed to create customer return.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Create Customer Return"
        subtitle="Initiate a traceable return linked to an original completed POS sale"
        actions={
          <Link
            to="/returns/customer"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            ← Back to Directory
          </Link>
        }
      />

      {/* Step 1: Sale Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">
          Step 1: Select Original Sale Transaction
        </h3>
        <p className="text-sm text-slate-500">
          Enter the Sale ID or POS invoice reference to verify return eligibility, line items, and batch allocations.
        </p>

        <form onSubmit={handleFetchSale} className="flex gap-3 max-w-md">
          <input
            type="text"
            placeholder="Sale ID (e.g. 101)"
            value={saleInput}
            onChange={(e) => setSaleInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saleLoading || !saleInput.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {saleLoading ? 'Checking...' : 'Verify Sale'}
          </button>
        </form>

        {saleError && (
          <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-700 text-sm">
            {saleError}
          </div>
        )}
      </div>

      {/* Step 2: Sale Details & Returnable Items */}
      {eligibilityData && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Original Sale Summary
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block">Sale Reference:</span>
                <span className="font-semibold text-slate-900">{eligibilityData.sale.sale_number}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Customer:</span>
                <span className="font-semibold text-slate-900">{eligibilityData.sale.customer_name || 'Walk-in'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Branch / Location:</span>
                <span className="font-semibold text-slate-900">{eligibilityData.sale.branch_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Paid:</span>
                <span className="font-semibold text-emerald-700">
                  {Number(eligibilityData.sale.paid_amount || 0).toFixed(2)} ETB
                </span>
              </div>
            </div>
          </div>

          {/* Line Items Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Step 2: Select Items & Return Quantities
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-center">Select</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Unit Price</th>
                    <th className="px-4 py-3 text-center">Sold Qty</th>
                    <th className="px-4 py-3 text-center">Already Returned</th>
                    <th className="px-4 py-3 text-center">Remaining Eligible</th>
                    <th className="px-4 py-3">Allocated Batch</th>
                    <th className="px-4 py-3 text-center">Return Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {eligibilityData.lines.map((line) => {
                    const isSelected = selectedLines[line.id]?.selected || false;
                    const maxQty = line.remaining_returnable_quantity;
                    const currentQty = selectedLines[line.id]?.quantity || 1;

                    return (
                      <tr key={line.id} className={!line.is_returnable ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            disabled={!line.is_returnable}
                            checked={isSelected}
                            onChange={(e) => handleLineCheck(line.id, e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{line.product_name}</div>
                          <div className="text-xs text-slate-500">{line.product_code} • {line.unit_name}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {Number(line.unit_price).toFixed(2)} ETB
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800">
                          {line.quantity}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          {line.already_returned_quantity}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-700">
                          {maxQty}
                        </td>
                        <td className="px-4 py-3">
                          {line.allocations && line.allocations.length > 0 ? (
                            <select
                              disabled={!isSelected}
                              value={selectedLines[line.id]?.batchId || line.allocations[0].batch_id}
                              onChange={(e) => handleBatchChange(line.id, e.target.value)}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                            >
                              {line.allocations.map((a) => (
                                <option key={a.id} value={a.batch_id}>
                                  {a.batch_number} (Exp: {new Date(a.expiry_date).toLocaleDateString()})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-rose-500">No batch allocation</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="1"
                            max={maxQty}
                            disabled={!isSelected}
                            value={currentQty}
                            onChange={(e) => handleLineQtyChange(line.id, e.target.value, maxQty)}
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs text-center focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 3: Return Reason & Submission */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Step 3: Reason & Submission
            </h3>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Reason for Return *
              </label>
              <textarea
                rows="3"
                placeholder="State clinical or customer reason (e.g. wrong item prescribed, patient allergy, sealed packaging)..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Additional Internal Notes
              </label>
              <input
                type="text"
                placeholder="Optional notes for inspector..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {formError && (
              <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-700 text-sm">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
              >
                {submitting ? 'Creating...' : 'Submit for Inspection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
