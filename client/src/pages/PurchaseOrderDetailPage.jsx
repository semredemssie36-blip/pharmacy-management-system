import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { purchaseOrdersApi } from '../features/procurement/api.js';
import { Can } from '../features/auth/Can.jsx';

/** Purchase Order detail view + lifecycle actions. */
function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await purchaseOrdersApi.get(id);
      setPo(res.data.purchaseOrder);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(fn, successMessage) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fn();
      setPo(res.data.purchaseOrder);
      setNotice(successMessage);
      setReason('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!po) return <p className="text-red-600">{error || 'Purchase order not found.'}</p>;

  const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '—');

  return (
    <div className="max-w-4xl">
      <Link to="/procurement/purchase-orders" className="text-sky-700 hover:underline">← Back to purchase orders</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{po.po_number}</h1>
      <p className="text-sm text-slate-500">{po.status} · {po.supplier_name} · {po.branch_name}</p>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      <Section title="Header">
        <Info label="PO #" value={po.po_number} />
        <Info label="Supplier" value={po.supplier_name} />
        <Info label="Branch" value={po.branch_name} />
        <Info label="Order date" value={fmtDate(po.order_date)} />
        <Info label="Expected delivery" value={fmtDate(po.expected_delivery_date)} />
        <Info label="Currency" value={po.currency} />
        <Info label="Notes" value={po.notes || '—'} />
        {po.rejection_reason && <Info label="Rejection reason" value={po.rejection_reason} />}
        {po.cancelled_reason && <Info label="Cancellation reason" value={po.cancelled_reason} />}
      </Section>

      <Section title="Lines">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600 border-b border-slate-200">
              <th className="p-2">Product</th>
              <th className="p-2">Unit</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Unit price</th>
              <th className="p-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {(po.lines || []).map((line) => (
              <tr key={line.id} className="border-b border-slate-100 last:border-0">
                <td className="p-2">{line.product_name}</td>
                <td className="p-2">{line.unit_name}</td>
                <td className="p-2 text-right">{Number(line.ordered_quantity)}</td>
                <td className="p-2 text-right">{Number(line.unit_price).toFixed(2)}</td>
                <td className="p-2 text-right font-mono">{Number(line.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-right font-semibold">Total: {Number(po.total_amount).toFixed(2)} {po.currency}</div>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap gap-3 items-center">
          <Can permission="purchase_order.submit">
            {po.status === 'draft' && (
              <button disabled={busy} onClick={() => action(() => purchaseOrdersApi.submit(po.id), 'Submitted for approval.')} className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Submit</button>
            )}
          </Can>

          <Can permission="purchase_order.approve">
            {po.status === 'pending_approval' && (
              <>
                <button disabled={busy} onClick={() => action(() => purchaseOrdersApi.approve(po.id), 'Purchase order approved.')} className="bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Approve</button>
                <input placeholder="Rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm" />
                <button disabled={busy} onClick={() => reason && action(() => purchaseOrdersApi.reject(po.id, reason), 'Purchase order rejected.')} className="bg-red-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Reject</button>
              </>
            )}
          </Can>

          <Can permission="purchase_order.cancel">
            {['draft', 'submitted', 'pending_approval', 'approved', 'partially_received'].includes(po.status) && (
              <>
                <input placeholder="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm" />
                <button disabled={busy} onClick={() => reason && action(() => purchaseOrdersApi.cancel(po.id, reason), 'Purchase order cancelled.')} className="bg-amber-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
              </>
            )}
          </Can>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-6 bg-white rounded-lg shadow p-5">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <div className="mt-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="font-medium text-slate-500">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

export default PurchaseOrderDetailPage;
