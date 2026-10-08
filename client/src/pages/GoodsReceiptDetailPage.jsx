import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { goodsReceiptsApi } from '../features/procurement/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';

/**
 * GoodsReceiptDetailPage: Detailed view of a Goods Receipt with lifecycle actions.
 */
function GoodsReceiptDetailPage() {
  const { id } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  // Dialog state
  const [dialogConfig, setDialogConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: '',
    confirmTone: 'primary',
    actionFn: null,
    requiresReason: false,
    reasonInput: '',
  });

  async function loadReceipt() {
    setLoading(true);
    setError(null);
    try {
      const res = await goodsReceiptsApi.get(id);
      setReceipt(res.data.goodsReceipt);
    } catch (err) {
      setError(err.message || 'Failed to load goods receipt');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function executeAction(actionFn, successMsg) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await actionFn();
      setReceipt(res.data.goodsReceipt);
      setNotice(successMsg);
      setDialogConfig((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  function openCompleteDialog() {
    setDialogConfig({
      isOpen: true,
      title: 'Complete Goods Receipt',
      message:
        'Completing this receipt will post physical stock to inventory, create immutable stock movements, and update the purchase order status. Are you sure you want to proceed?',
      confirmLabel: 'Complete & Post Stock',
      confirmTone: 'primary',
      requiresReason: false,
      reasonInput: '',
      actionFn: () => goodsReceiptsApi.complete(receipt.id),
      successMsg: 'Goods receipt completed successfully! Stock posted to inventory.',
    });
  }

  function openCancelDialog() {
    setDialogConfig({
      isOpen: true,
      title: 'Cancel Goods Receipt',
      message: 'Provide an optional cancellation reason. No inventory movements will be affected.',
      confirmLabel: 'Cancel Receipt',
      confirmTone: 'danger',
      requiresReason: true,
      reasonInput: '',
      actionFn: (reason) => goodsReceiptsApi.cancel(receipt.id, { reason }),
      successMsg: 'Goods receipt cancelled.',
    });
  }

  function openDiscrepancyDialog() {
    setDialogConfig({
      isOpen: true,
      title: 'Record Discrepancy',
      message: 'Describe the discrepancy encountered (e.g. damaged goods, missing units, packaging issues).',
      confirmLabel: 'Flag Discrepancy',
      confirmTone: 'warning',
      requiresReason: true,
      reasonInput: '',
      actionFn: (notes) => goodsReceiptsApi.discrepancy(receipt.id, { notes }),
      successMsg: 'Discrepancy recorded.',
    });
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mb-3" />
        <p className="text-sm">Loading receipt details…</p>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-xl border border-red-200 text-center">
        <h2 className="text-lg font-bold text-red-700">Goods Receipt Not Found</h2>
        <p className="mt-2 text-sm text-slate-600">{error || 'The requested receipt could not be retrieved.'}</p>
        <Link to="/procurement/goods-receipts" className="mt-4 inline-block text-sm text-sky-700 hover:underline">
          ← Return to Goods Receipts
        </Link>
      </div>
    );
  }

  const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '—');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={receipt.receipt_number}
        subtitle={`Recorded on ${fmtDate(receipt.receipt_date)} by ${receipt.received_by_name || `User #${receipt.received_by}`}`}
        backLink="/procurement/goods-receipts"
        backLabel="Back to Goods Receipts"
        actions={<StatusBadge status={receipt.status} />}
      />

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 font-medium">
          ✅ {notice}
        </div>
      )}

      {/* Completion Banner */}
      {receipt.status === 'completed' && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-bold">Stock Intake Finalized:</span> All items below have been posted to physical inventory and append-only stock movement ledger entries have been recorded.
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/inventory/stock"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors"
            >
              Stock Overview →
            </Link>
            <Link
              to="/inventory/stock-movements"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-400 text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              Ledger Movements →
            </Link>
          </div>
        </div>
      )}

      {/* Header Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: PO & Supplier */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Source Order</span>
          <div>
            <span className="text-xs text-slate-500 block">Purchase Order</span>
            <Link
              to={`/procurement/purchase-orders/${receipt.purchase_order_id}`}
              className="font-mono text-sm font-bold text-sky-700 hover:underline"
            >
              {receipt.po_number}
            </Link>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">Supplier</span>
            <span className="text-sm font-medium text-slate-800">{receipt.supplier_name}</span>
          </div>
        </div>

        {/* Card 2: Branch & Warehouse */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Intake Location</span>
          <div>
            <span className="text-xs text-slate-500 block">Branch</span>
            <span className="text-sm font-medium text-slate-800">{receipt.branch_name}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">Destination Warehouse</span>
            <span className="text-sm font-medium text-slate-800">{receipt.warehouse_name}</span>
          </div>
        </div>

        {/* Card 3: Status & Notes */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Receipt Metadata</span>
          <div>
            <span className="text-xs text-slate-500 block">Receipt Date</span>
            <span className="text-sm font-medium text-slate-800">{fmtDate(receipt.receipt_date)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">Notes</span>
            <span className="text-xs text-slate-700 whitespace-pre-wrap">{receipt.notes || '—'}</span>
          </div>
        </div>
      </div>

      {/* Lines Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Received Line Items</h2>
          <span className="text-xs text-slate-500 font-mono">{(receipt.lines || []).length} lines</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="receipt-lines-table">
            <thead className="bg-slate-50/50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">PO Ordered</th>
                <th className="py-3 px-4 text-right">Received Qty</th>
                <th className="py-3 px-4">Batch Number</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Storage Location</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(receipt.lines || []).map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-800">
                    <div>{line.product_name}</div>
                    {line.product_code && <span className="text-[11px] font-mono text-slate-400">{line.product_code}</span>}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{line.unit_name}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">{Number(line.ordered_quantity)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                    {Number(line.received_quantity)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded font-mono text-xs bg-slate-100 text-slate-800 font-semibold border border-slate-200">
                      {line.batch_number}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {fmtDate(line.expiry_date)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 font-medium">
                    {line.storage_location_name || `Location #${line.storage_location_id}`}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-xs">{line.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lifecycle Actions Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-slate-500">
          Current state: <strong className="text-slate-800">{receipt.status}</strong>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {receipt.status === 'draft' && (
            <>
              <Can permission="goods_receipt.update">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => executeAction(() => goodsReceiptsApi.start(receipt.id), 'Receiving started.')}
                  data-testid="start-receiving-button"
                  className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Start Receiving
                </button>
              </Can>

              <Can permission="goods_receipt.complete">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCompleteDialog}
                  data-testid="complete-receipt-button"
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Complete Receipt
                </button>
              </Can>

              <Can permission="goods_receipt.cancel">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCancelDialog}
                  data-testid="cancel-receipt-button"
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel Receipt
                </button>
              </Can>
            </>
          )}

          {receipt.status === 'receiving' && (
            <>
              <Can permission="goods_receipt.complete">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCompleteDialog}
                  data-testid="complete-receipt-button"
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Complete Receipt (Post Stock)
                </button>
              </Can>

              <Can permission="goods_receipt.update">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openDiscrepancyDialog}
                  data-testid="record-discrepancy-button"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Record Discrepancy
                </button>
              </Can>

              <Can permission="goods_receipt.cancel">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCancelDialog}
                  data-testid="cancel-receipt-button"
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel Receipt
                </button>
              </Can>
            </>
          )}

          {receipt.status === 'discrepancy' && (
            <>
              <Can permission="goods_receipt.update">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => executeAction(() => goodsReceiptsApi.start(receipt.id), 'Resumed receiving.')}
                  data-testid="resume-receiving-button"
                  className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Resume Receiving
                </button>
              </Can>

              <Can permission="goods_receipt.cancel">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCancelDialog}
                  data-testid="cancel-receipt-button"
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel Receipt
                </button>
              </Can>
            </>
          )}
        </div>
      </div>

      {/* Reusable Action Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        confirmLabel={dialogConfig.confirmLabel}
        confirmTone={dialogConfig.confirmTone}
        busy={busy}
        onCancel={() => setDialogConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          if (dialogConfig.requiresReason) {
            executeAction(() => dialogConfig.actionFn(dialogConfig.reasonInput), dialogConfig.successMsg);
          } else {
            executeAction(dialogConfig.actionFn, dialogConfig.successMsg);
          }
        }}
      >
        {dialogConfig.requiresReason && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Reason / Notes
            </label>
            <textarea
              rows={3}
              placeholder="Enter details..."
              value={dialogConfig.reasonInput}
              onChange={(e) => setDialogConfig((prev) => ({ ...prev, reasonInput: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>
        )}
      </ConfirmationDialog>
    </div>
  );
}

export default GoodsReceiptDetailPage;
