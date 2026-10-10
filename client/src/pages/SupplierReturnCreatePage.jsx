import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supplierReturnsApi } from '../features/returns/api.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function SupplierReturnCreatePage() {
  const navigate = useNavigate();

  const [receiptInput, setReceiptInput] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [eligibilityData, setEligibilityData] = useState(null);

  // Form State
  const [selectedLines, setSelectedLines] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleFetchReceipt(e) {
    e.preventDefault();
    const idVal = receiptInput.trim();
    if (!idVal) return;

    setReceiptLoading(true);
    setReceiptError('');
    setEligibilityData(null);
    setSelectedLines({});

    try {
      const res = await supplierReturnsApi.getReceiptEligibility(idVal);
      const data = res.data;
      setEligibilityData(data);

      const initialMap = {};
      data.lines.forEach((l) => {
        if (l.is_returnable) {
          initialMap[l.id] = {
            selected: false,
            quantity: 1,
            batchId: l.batch_id,
            reason: '',
          };
        }
      });
      setSelectedLines(initialMap);
    } catch (err) {
      setReceiptError(err?.response?.data?.error?.message || err.message || 'Failed to fetch goods receipt eligibility.');
    } finally {
      setReceiptLoading(false);
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

  function handleLineReasonChange(lineId, reason) {
    setSelectedLines((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        reason,
      },
    }));
  }

  async function handleSubmit(shouldSubmitRightAway) {
    setFormError('');

    if (!returnReason.trim()) {
      setFormError('Return reason is required.');
      return;
    }

    const linesToReturn = [];
    Object.entries(selectedLines).forEach(([lineId, item]) => {
      if (item.selected) {
        linesToReturn.push({
          goodsReceiptLineId: Number(lineId),
          batchId: item.batchId,
          quantity: item.quantity,
          reason: item.reason || returnReason,
        });
      }
    });

    if (linesToReturn.length === 0) {
      setFormError('Please select at least one item to return to supplier.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await supplierReturnsApi.create({
        goodsReceiptId: eligibilityData.receipt.id,
        reason: returnReason.trim(),
        notes: notes.trim() || undefined,
        lines: linesToReturn,
        submit: shouldSubmitRightAway,
      });

      const newReturn = res.data?.supplierReturn;
      navigate(`/returns/supplier/${newReturn.id}`);
    } catch (err) {
      setFormError(err?.response?.data?.error?.message || err.message || 'Failed to create supplier return.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Create Supplier Return Order"
        subtitle="Return received products and batches against an original completed Goods Receipt"
        actions={
          <Link
            to="/returns/supplier"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            ← Back to Directory
          </Link>
        }
      />

      {/* Step 1: Receipt Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">
          Step 1: Select Original Goods Receipt
        </h3>
        <p className="text-sm text-slate-500">
          Enter Goods Receipt ID to view received items, remaining returnable quantities, and batches.
        </p>

        <form onSubmit={handleFetchReceipt} className="flex gap-3 max-w-md">
          <input
            type="text"
            placeholder="Goods Receipt ID (e.g. 50)"
            value={receiptInput}
            onChange={(e) => setReceiptInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={receiptLoading || !receiptInput.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 shadow-xs"
          >
            {receiptLoading ? 'Loading...' : 'Verify Receipt'}
          </button>
        </form>

        {receiptError && (
          <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-700 text-sm">
            {receiptError}
          </div>
        )}
      </div>

      {/* Step 2: Receipt Details & Lines */}
      {eligibilityData && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Original Goods Receipt Summary
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block">Receipt Number:</span>
                <span className="font-semibold text-slate-900">{eligibilityData.receipt.receipt_number}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Supplier:</span>
                <span className="font-semibold text-slate-900">{eligibilityData.receipt.supplier_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Branch & Warehouse:</span>
                <span className="font-semibold text-slate-900">
                  {eligibilityData.receipt.branch_name} • {eligibilityData.receipt.warehouse_name}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Receipt Date:</span>
                <span className="font-medium text-slate-800">
                  {new Date(eligibilityData.receipt.receipt_date).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Line Items Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                Step 2: Select Items to Return
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-center">Select</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Batch & Expiry</th>
                    <th className="px-4 py-3 text-center">Received Qty</th>
                    <th className="px-4 py-3 text-center">Already Returned</th>
                    <th className="px-4 py-3 text-center">Eligible Remaining</th>
                    <th className="px-4 py-3 text-center">Return Qty</th>
                    <th className="px-4 py-3">Defect / Return Reason</th>
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
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-slate-900">{line.batch_number}</div>
                          <div className="text-xs text-slate-400">Exp: {new Date(line.expiry_date).toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800">
                          {line.received_quantity}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          {line.already_returned_quantity}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-700">
                          {maxQty}
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
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            placeholder="Defect, recall, short expiry..."
                            disabled={!isSelected}
                            value={selectedLines[line.id]?.reason || ''}
                            onChange={(e) => handleLineReasonChange(line.id, e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 3: Overall Reason & Submission */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Step 3: Supplier Reason & Submission
            </h3>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                General Reason for Supplier Return *
              </label>
              <textarea
                rows="3"
                placeholder="State reason (e.g. manufacturer recall, packaging damage on arrival, temperature excursion during transit)..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Logistics / Notes
              </label>
              <input
                type="text"
                placeholder="Waybill, courier, or supplier RMA reference..."
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
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 shadow-xs"
              >
                {submitting ? 'Creating...' : 'Submit Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
