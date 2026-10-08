import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

import { purchaseOrdersApi, goodsReceiptsApi } from '../features/procurement/api.js';
import { warehousesApi, storageLocationsApi } from '../features/organizations/api.js';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';

/**
 * GoodsReceiptCreatePage: Record incoming shipment against an approved or partially received PO.
 */
function GoodsReceiptCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPoId = searchParams.get('purchaseOrderId');

  const [availablePos, setAvailablePos] = useState([]);
  const [selectedPoId, setSelectedPoId] = useState(preselectedPoId || '');
  const [poDetails, setPoDetails] = useState(null);

  const [warehouses, setWarehouses] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [headerForm, setHeaderForm] = useState({
    warehouseId: '',
    receiptDate: todayStr,
    notes: '',
  });

  const [lines, setLines] = useState([]);
  const [loadingPos, setLoadingPos] = useState(true);
  const [loadingPoDetails, setLoadingPoDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // 1. Fetch available POs (approved or partially_received)
  useEffect(() => {
    async function loadPos() {
      setLoadingPos(true);
      try {
        const res = await purchaseOrdersApi.list({ status: 'approved,partially_received', limit: 100 });
        setAvailablePos(res.data.items || []);
      } catch (err) {
        setError(err.message || 'Failed to load purchase orders');
      } finally {
        setLoadingPos(false);
      }
    }
    loadPos();
  }, []);

  // 2. When a PO is selected, load its full details and branch warehouses
  useEffect(() => {
    if (!selectedPoId) {
      setPoDetails(null);
      setLines([]);
      setWarehouses([]);
      return;
    }

    async function loadPo() {
      setLoadingPoDetails(true);
      setError(null);
      try {
        const res = await purchaseOrdersApi.get(selectedPoId);
        const po = res.data.purchaseOrder;
        setPoDetails(po);

        // Fetch warehouses for this PO's branch
        const whRes = await warehousesApi.list({ branchId: po.branch_id });
        const whList = (whRes.data.warehouses || []).filter((w) => w.status === 'active');
        setWarehouses(whList);

        // Pre-select first warehouse if available
        const defaultWhId = whList.length > 0 ? String(whList[0].id) : '';
        setHeaderForm((prev) => ({ ...prev, warehouseId: defaultWhId }));

        // Map PO lines to receiving lines
        const initialLines = (po.lines || []).map((pol) => {
          const ordered = Number(pol.ordered_quantity);
          const received = Number(pol.received_quantity || 0);
          const remaining = pol.remaining_quantity !== undefined ? Number(pol.remaining_quantity) : Math.max(0, ordered - received);

          return {
            purchaseOrderLineId: pol.id,
            productId: pol.product_id,
            productName: pol.product_name,
            productCode: pol.product_code || '',
            unitId: pol.unit_id,
            unitName: pol.unit_name,
            orderedQuantity: ordered,
            previouslyReceivedQuantity: received,
            remainingQuantity: remaining,
            receivedQuantity: remaining > 0 ? remaining : 1,
            batchNumber: '',
            expiryDate: '',
            storageLocationId: '',
            notes: '',
            included: remaining > 0,
          };
        });
        setLines(initialLines);
      } catch (err) {
        setError(err.message || 'Failed to load purchase order details');
      } finally {
        setLoadingPoDetails(false);
      }
    }

    loadPo();
  }, [selectedPoId]);

  // 3. When warehouseId changes, fetch storage locations for that warehouse
  useEffect(() => {
    if (!headerForm.warehouseId) {
      setStorageLocations([]);
      return;
    }

    async function loadLocations() {
      try {
        const res = await storageLocationsApi.list({ warehouseId: headerForm.warehouseId });
        const locList = (res.data.storage_locations || []).filter((l) => l.status === 'active');
        setStorageLocations(locList);

        // Automatically assign first active location to lines that lack one
        if (locList.length > 0) {
          const firstLocId = locList[0].id;
          setLines((prev) =>
            prev.map((l) => ({
              ...l,
              storageLocationId: l.storageLocationId || String(firstLocId),
            }))
          );
        }
      } catch {
        setStorageLocations([]);
      }
    }

    loadLocations();
  }, [headerForm.warehouseId]);

  function handleLineChange(idx, field, value) {
    setLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line))
    );
  }

  function validatePayload() {
    if (!selectedPoId || !poDetails) {
      return 'Please select a Purchase Order.';
    }
    if (!headerForm.warehouseId) {
      return 'Please select a destination Warehouse.';
    }
    if (!headerForm.receiptDate) {
      return 'Please specify a valid Receipt Date.';
    }

    const activeLines = lines.filter((l) => l.included);
    if (activeLines.length === 0) {
      return 'Please include at least one receiving line.';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < activeLines.length; i += 1) {
      const l = activeLines[i];
      const qty = Number(l.receivedQuantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return `Line ${i + 1} (${l.productName}): Received quantity must be positive.`;
      }
      if (qty > l.remainingQuantity) {
        return `Line ${i + 1} (${l.productName}): Received quantity (${qty}) exceeds remaining (${l.remainingQuantity}).`;
      }
      if (!l.batchNumber.trim()) {
        return `Line ${i + 1} (${l.productName}): Batch number is required for pharmaceutical intake.`;
      }
      if (!l.expiryDate) {
        return `Line ${i + 1} (${l.productName}): Expiry date is required.`;
      }
      const exp = new Date(l.expiryDate);
      if (Number.isNaN(exp.getTime()) || exp < today) {
        return `Line ${i + 1} (${l.productName}): Expiry date must be a valid future date.`;
      }
      if (!l.storageLocationId) {
        return `Line ${i + 1} (${l.productName}): Storage location must be selected.`;
      }
    }

    return null;
  }

  async function handleSubmit(shouldCompleteDirectly = false) {
    setError(null);
    const validationError = validatePayload();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const activeLines = lines.filter((l) => l.included).map((l) => ({
        purchaseOrderLineId: Number(l.purchaseOrderLineId),
        productId: Number(l.productId),
        unitId: Number(l.unitId),
        orderedQuantity: Number(l.orderedQuantity),
        receivedQuantity: Number(l.receivedQuantity),
        batchNumber: l.batchNumber.trim(),
        expiryDate: l.expiryDate,
        storageLocationId: Number(l.storageLocationId),
        notes: l.notes || undefined,
      }));

      const payload = {
        organizationId: Number(poDetails.organization_id),
        branchId: Number(poDetails.branch_id),
        warehouseId: Number(headerForm.warehouseId),
        purchaseOrderId: Number(selectedPoId),
        receiptDate: headerForm.receiptDate,
        notes: headerForm.notes || undefined,
        lines: activeLines,
      };

      const res = await goodsReceiptsApi.create(payload);
      const newGr = res.data.goodsReceipt;

      if (shouldCompleteDirectly) {
        // Start and Complete
        await goodsReceiptsApi.start(newGr.id);
        await goodsReceiptsApi.complete(newGr.id);
      }

      navigate(`/procurement/goods-receipts/${newGr.id}`);
    } catch (err) {
      setError(err.message || 'Failed to submit goods receipt');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="New Goods Receipt"
        subtitle="Capture delivered quantities, batches, and shelf locations against an approved Purchase Order"
        backLink="/procurement/goods-receipts"
        backLabel="Back to Goods Receipts"
      />

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Step 1: Purchase Order Selection */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">1</span>
          Select Purchase Order
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Approved Purchase Order *
            </label>
            <select
              data-testid="po-select"
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              disabled={loadingPos}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="">-- Choose an approved or partially received PO --</option>
              {availablePos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number} · {po.supplier_name} ({po.status})
                </option>
              ))}
            </select>
          </div>

          {loadingPoDetails && (
            <p className="text-xs text-slate-500 animate-pulse">Loading PO details and line items…</p>
          )}
        </div>

        {/* PO Summary Card if selected */}
        {poDetails && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-medium block">Supplier</span>
              <span className="text-slate-900 font-semibold text-sm">{poDetails.supplier_name}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Branch</span>
              <span className="text-slate-900 font-semibold text-sm">{poDetails.branch_name}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">PO Status</span>
              <div className="mt-0.5"><StatusBadge status={poDetails.status} /></div>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Total Amount</span>
              <span className="text-slate-900 font-semibold text-sm font-mono">
                {Number(poDetails.total_amount).toFixed(2)} {poDetails.currency}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Destination Warehouse & Header Details */}
      {poDetails && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">2</span>
            Receipt Location & Metadata
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Destination Warehouse *
              </label>
              <select
                data-testid="warehouse-select"
                value={headerForm.warehouseId}
                onChange={(e) => setHeaderForm({ ...headerForm, warehouseId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              >
                <option value="">-- Select Warehouse --</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Receipt Date *
              </label>
              <input
                type="date"
                value={headerForm.receiptDate}
                onChange={(e) => setHeaderForm({ ...headerForm, receiptDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Receiving Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Delivery note #DN-884, sealed boxes"
                value={headerForm.notes}
                onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Product Receiving Lines Table */}
      {poDetails && lines.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">3</span>
              Receiving Lines (Quantities, Batches, Shelf Locations)
            </h2>
            <span className="text-xs text-slate-500">
              {lines.filter((l) => l.included).length} line(s) selected
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="receiving-lines-table">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">Receive?</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Ordered</th>
                  <th className="p-3 text-right">Previously Recv</th>
                  <th className="p-3 text-right">Remaining</th>
                  <th className="p-3 w-28">Receive Now *</th>
                  <th className="p-3 w-36">Batch # *</th>
                  <th className="p-3 w-36">Expiry Date *</th>
                  <th className="p-3 w-40">Storage Location *</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const isOver = Number(line.receivedQuantity) > line.remainingQuantity;

                  return (
                    <tr
                      key={line.purchaseOrderLineId}
                      className={line.included ? 'bg-white' : 'bg-slate-50/60 opacity-60'}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={line.included}
                          onChange={(e) => handleLineChange(idx, 'included', e.target.checked)}
                          className="w-4 h-4 rounded text-slate-900 focus:ring-sky-500"
                        />
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {line.productName}
                        {line.productCode && <span className="block text-slate-400 font-mono text-[11px]">{line.productCode}</span>}
                      </td>
                      <td className="p-3 text-slate-600">{line.unitName}</td>
                      <td className="p-3 text-right font-mono text-slate-700">{line.orderedQuantity}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{line.previouslyReceivedQuantity}</td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-900">{line.remainingQuantity}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0.001"
                          max={line.remainingQuantity}
                          step="any"
                          disabled={!line.included}
                          value={line.receivedQuantity}
                          onChange={(e) => handleLineChange(idx, 'receivedQuantity', e.target.value)}
                          className={`w-full rounded border px-2 py-1.5 text-xs font-mono text-right focus:outline-none ${
                            isOver ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-300'
                          }`}
                        />
                        {isOver && <span className="text-[10px] text-red-600 block mt-0.5">Exceeds remaining</span>}
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="e.g. B-2026-X"
                          disabled={!line.included}
                          value={line.batchNumber}
                          onChange={(e) => handleLineChange(idx, 'batchNumber', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          disabled={!line.included}
                          value={line.expiryDate}
                          onChange={(e) => handleLineChange(idx, 'expiryDate', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </td>
                      <td className="p-3">
                        <select
                          disabled={!line.included || storageLocations.length === 0}
                          value={line.storageLocationId}
                          onChange={(e) => handleLineChange(idx, 'storageLocationId', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">-- Choose shelf --</option>
                          {storageLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Footer */}
      {poDetails && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <Link
            to="/procurement/goods-receipts"
            className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            data-testid="save-draft-button"
            className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save as Draft'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
            data-testid="complete-directly-button"
            className="px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? 'Processing…' : 'Start & Complete Receipt (Post Stock)'}
          </button>
        </div>
      )}
    </div>
  );
}

export default GoodsReceiptCreatePage;
