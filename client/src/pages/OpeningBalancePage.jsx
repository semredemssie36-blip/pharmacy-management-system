import { useEffect, useState } from 'react';

import { inventoryApi } from '../features/inventory/api.js';
import { organizationsApi } from '../features/organizations/api.js';
import { branchesApi, warehousesApi } from '../features/organizations/api.js';
import { productsApi } from '../features/products/api.js';
import { unitsApi } from './productMasterApis.js';
import { storageLocationsApi } from '../features/organizations/api.js';

/** Opening balance — a controlled inventory transaction (not a quantity overwrite). */
function OpeningBalancePage() {
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);

  const [form, setForm] = useState({
    organizationId: '', branchId: '', warehouseId: '', storageLocationId: '',
    productId: '', unitId: '', batchNumber: '', expiryDate: '', quantity: '', reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    async function loadMasters() {
      const [o, b, w, l, p, u] = await Promise.all([
        organizationsApi.list(),
        branchesApi.list(),
        warehousesApi.list(),
        storageLocationsApi.list(),
        productsApi.list({ limit: 100 }),
        unitsApi.list({ limit: 100 }),
      ]);
      setOrgs(o.data.organizations);
      setBranches(b.data.branches);
      setWarehouses(w.data.warehouses);
      setLocations(l.data.storageLocations);
      setProducts(p.data.items);
      setUnits(u.data.items);
    }
    loadMasters().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!form.organizationId || !form.branchId || !form.warehouseId || !form.storageLocationId || !form.productId || !form.unitId || !form.batchNumber.trim() || !form.expiryDate || !form.quantity) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    try {
      await inventoryApi.createOpeningBalance({
        organizationId: Number(form.organizationId),
        branchId: Number(form.branchId),
        warehouseId: Number(form.warehouseId),
        storageLocationId: Number(form.storageLocationId),
        productId: Number(form.productId),
        unitId: Number(form.unitId),
        batchNumber: form.batchNumber.trim(),
        expiryDate: form.expiryDate,
        quantity: Number(form.quantity),
        reason: form.reason || undefined,
      });
      setNotice('Opening balance recorded.');
      setForm({ organizationId: '', branchId: '', warehouseId: '', storageLocationId: '', productId: '', unitId: '', batchNumber: '', expiryDate: '', quantity: '', reason: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const branchOptions = branches.filter((b) => b.organization_id === Number(form.organizationId));
  const warehouseOptions = warehouses.filter((w) => w.branch_id === Number(form.branchId));
  const locationOptions = locations.filter((l) => l.warehouse_id === Number(form.warehouseId));
  const productOptions = products;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900">Opening Balance</h1>
      <p className="mt-1 text-sm text-slate-500">Establishes initial stock through the controlled inventory service.</p>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-lg shadow p-5 space-y-4">
        <select value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Organization…</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Branch…</option>
          {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Warehouse…</option>
          {warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={form.storageLocationId} onChange={(e) => setForm({ ...form, storageLocationId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Storage location…</option>
          {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Product…</option>
          {productOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
        <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="">Unit…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input placeholder="Batch number" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2" />
        <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2" />
        <input type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2" />
        <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded border border-slate-300 px-3 py-2" />
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {loading ? 'Saving…' : 'Record opening balance'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default OpeningBalancePage;
