import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { purchaseOrdersApi } from '../features/procurement/api.js';
import { suppliersApi, customersApi } from '../features/partners/api.js';
import { productsApi } from '../features/products/api.js';
import { organizationsApi, branchesApi, warehousesApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';

const STATUS_OPTIONS = ['draft', 'submitted', 'pending_approval', 'approved', 'partially_received', 'fully_received', 'rejected', 'cancelled'];

/** Purchase Orders list with server-side search/filters/pagination. */
function PurchaseOrdersPage() {
  const [pos, setPos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ organizationId: '', branchId: '', supplierId: '', expectedDeliveryDate: '', notes: '', currency: 'ETB', lines: [{ productId: '', unitId: '', quantity: 1, unitPrice: 0 }] });
  const [products, setProducts] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;
      if (supplierId) params.supplierId = supplierId;
      const res = await purchaseOrdersApi.list(params);
      setPos(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    suppliersApi.list().then((res) => setSuppliers(res.data.items)).catch(() => setSuppliers([]));
    productsApi.list({ limit: 100 }).then((res) => setProducts(res.data.items)).catch(() => setProducts([]));
    organizationsApi.list().then((res) => setOrgs(res.data.organizations)).catch(() => setOrgs([]));
    branchesApi.list().then((res) => setBranches(res.data.branches)).catch(() => setBranches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { productId: '', unitId: '', quantity: 1, unitPrice: 0 }] });
  }

  function removeLine(i) {
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  }

  function updateLine(i, patch) {
    setForm({ ...form, lines: form.lines.map((line, idx) => (idx === i ? { ...line, ...patch } : line)) });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!form.organizationId || !form.branchId || !form.supplierId) {
      setError('Organization, branch, and supplier are required.');
      return;
    }
    if (form.lines.length === 0 || form.lines.some((l) => !l.productId || !l.unitId || !l.quantity)) {
      setError('At least one valid line is required.');
      return;
    }
    setSubmitting(true);
    try {
      await purchaseOrdersApi.create({
        organizationId: Number(form.organizationId),
        branchId: Number(form.branchId),
        supplierId: Number(form.supplierId),
        expectedDeliveryDate: form.expectedDeliveryDate || undefined,
        notes: form.notes || undefined,
        currency: form.currency || 'ETB',
        lines: form.lines.map((l) => ({
          productId: Number(l.productId),
          unitId: Number(l.unitId),
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice || 0),
          notes: l.notes || undefined,
        })),
      });
      setNotice('Purchase order created.');
      setShowForm(false);
      setForm({ organizationId: '', branchId: '', supplierId: '', expectedDeliveryDate: '', notes: '', currency: 'ETB', lines: [{ productId: '', unitId: '', quantity: 1, unitPrice: 0 }] });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Purchase Orders</h1>
        <Can permission="purchase_order.create">
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition">
            {showForm ? 'Close' : '+ New Purchase Order'}
          </button>
        </Can>
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-4 flex gap-2 items-end flex-wrap">
        <input placeholder="PO number or supplier name" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[160px] rounded border border-slate-300 px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={load} className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 bg-white rounded-lg shadow p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Organization…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Branch…</option>
              {branches.filter((b) => b.organization_id === Number(form.organizationId)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">Supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" placeholder="Expected delivery" value={form.expectedDeliveryDate} onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Lines</p>
            {form.lines.map((line, i) => (
              <div key={i} className="mt-2 grid grid-cols-5 gap-2 items-center">
                <select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="">Product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" placeholder="Unit ID" value={line.unitId} onChange={(e) => updateLine(i, { unitId: e.target.value })} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                <input type="number" placeholder="Quantity" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                <input type="number" step="0.01" placeholder="Unit price" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                <button type="button" onClick={() => removeLine(i)} className="text-sm text-red-600 hover:underline">Remove</button>
              </div>
            ))}
            <button type="button" onClick={addLine} className="mt-2 text-sm text-sky-700 hover:underline">+ Add line</button>
          </div>

          <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs disabled:opacity-50 transition">
            {submitting ? 'Saving…' : 'Create Purchase Order'}
          </button>
        </form>
      )}

      <div className="mt-4 bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && pos.length === 0 && <p className="p-5 text-slate-500">No purchase orders found.</p>}
        {!loading && pos.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="p-3 font-medium">PO #</th>
                  <th className="p-3 font-medium">Supplier</th>
                  <th className="p-3 font-medium">Branch</th>
                  <th className="p-3 font-medium">Order Date</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Total</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={po.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 font-mono text-xs">{po.po_number}</td>
                    <td className="p-3">{po.supplier_name}</td>
                    <td className="p-3">{po.branch_name}</td>
                    <td className="p-3 text-xs">{po.order_date ? new Date(po.order_date).toISOString().slice(0, 10) : '—'}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{po.status}</span></td>
                    <td className="p-3 text-right font-mono">{Number(po.total_amount).toFixed(2)}</td>
                    <td className="p-3"><Link to={`/procurement/purchase-orders/${po.id}`} className="text-sky-700 hover:underline">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between p-3 text-sm text-slate-600">
              <span>Total: {total}</span>
              <div className="space-x-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PurchaseOrdersPage;
