import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { productsApi } from '../features/products/api.js';
import { organizationsApi } from '../features/organizations/api.js';
import { Can } from '../features/auth/Can.jsx';
import { brandsApi, categoriesApi, dosageFormsApi, genericsApi, manufacturersApi, routesApi, therapeuticCategoriesApi } from './productMasterApis.js';

const PRESCRIPTION_OPTIONS = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'otc', label: 'OTC' },
];

const CONTROLLED_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'controlled', label: 'Controlled' },
  { value: 'restricted', label: 'Restricted' },
];

const ANTIBIOTIC_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'antibiotic', label: 'Antibiotic' },
];

const STORAGE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'controlled', label: 'Controlled' },
];

/** Products list + create + edit + deactivate/activate (backend-authorized). */
function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [prescriptionClassification, setPrescriptionClassification] = useState('');
  const [sort, setSort] = useState('name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [brands, setBrands] = useState([]);
  const [generics, setGenerics] = useState([]);
  const [dosageForms, setDosageForms] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [therapeuticCategories, setTherapeuticCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);

  async function loadMasters() {
    const [o, b, g, df, r, c, tc, m] = await Promise.all([
      organizationsApi.list(),
      brandsApi.list(),
      genericsApi.list(),
      dosageFormsApi.list(),
      routesApi.list(),
      categoriesApi.list(),
      therapeuticCategoriesApi.list(),
      manufacturersApi.list(),
    ]);
    setOrgs(o.data.organizations);
    setBrands(b.data.items);
    setGenerics(g.data.items);
    setDosageForms(df.data.items);
    setRoutes(r.data.items);
    setCategories(c.data.items);
    setTherapeuticCategories(tc.data.items);
    setManufacturers(m.data.items);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = { search, status, sort, page, limit };
      if (prescriptionClassification) params.prescriptionClassification = prescriptionClassification;
      const res = await productsApi.list(params);
      setProducts(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMasters().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort]);

  function openCreate() {
    setEditing(null);
    setForm({ status: 'active', prescriptionClassification: 'prescription', controlledClassification: 'none', antibioticClassification: 'none', storageRequirement: 'normal' });
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  function openEdit(product) {
    setEditing(product);
    setForm({
      organizationId: product.organization_id,
      name: product.name,
      code: product.code,
      barcode: product.barcode || '',
      description: product.description || '',
      brandId: product.brand_id || '',
      genericId: product.generic_id || '',
      dosageFormId: product.dosage_form_id || '',
      routeId: product.route_id || '',
      categoryId: product.category_id || '',
      therapeuticCategoryId: product.therapeutic_category_id || '',
      manufacturerId: product.manufacturer_id || '',
      registrationNumber: product.registration_number || '',
      prescriptionClassification: product.prescription_classification,
      controlledClassification: product.controlled_classification,
      antibioticClassification: product.antibiotic_classification,
      storageRequirement: product.storage_requirement,
      minStockLevel: product.min_stock_level ?? '',
      maxStockLevel: product.max_stock_level ?? '',
      reorderLevel: product.reorder_level ?? '',
      status: product.status,
    });
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!form.organizationId || !form.name?.trim() || !form.code?.trim()) {
      setError('Organization, name, and code are required.');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await productsApi.update(editing.id, {
          name: form.name.trim(),
          code: form.code.trim(),
          barcode: form.barcode?.trim() || null,
          description: form.description || null,
          brandId: form.brandId || null,
          genericId: form.genericId || null,
          dosageFormId: form.dosageFormId || null,
          routeId: form.routeId || null,
          categoryId: form.categoryId || null,
          therapeuticCategoryId: form.therapeuticCategoryId || null,
          manufacturerId: form.manufacturerId || null,
          registrationNumber: form.registrationNumber || null,
          prescriptionClassification: form.prescriptionClassification,
          controlledClassification: form.controlledClassification,
          antibioticClassification: form.antibioticClassification,
          storageRequirement: form.storageRequirement,
          minStockLevel: form.minStockLevel === '' ? null : Number(form.minStockLevel),
          maxStockLevel: form.maxStockLevel === '' ? null : Number(form.maxStockLevel),
          reorderLevel: form.reorderLevel === '' ? null : Number(form.reorderLevel),
          status: form.status,
        });
        setNotice('Product updated.');
      } else {
        await productsApi.create({
          organizationId: Number(form.organizationId),
          name: form.name.trim(),
          code: form.code.trim(),
          barcode: form.barcode?.trim() || null,
          description: form.description || null,
          brandId: form.brandId || null,
          genericId: form.genericId || null,
          dosageFormId: form.dosageFormId || null,
          routeId: form.routeId || null,
          categoryId: form.categoryId || null,
          therapeuticCategoryId: form.therapeuticCategoryId || null,
          manufacturerId: form.manufacturerId || null,
          registrationNumber: form.registrationNumber || null,
          prescriptionClassification: form.prescriptionClassification,
          controlledClassification: form.controlledClassification,
          antibioticClassification: form.antibioticClassification,
          storageRequirement: form.storageRequirement,
          minStockLevel: form.minStockLevel === '' ? null : Number(form.minStockLevel),
          maxStockLevel: form.maxStockLevel === '' ? null : Number(form.maxStockLevel),
          reorderLevel: form.reorderLevel === '' ? null : Number(form.reorderLevel),
        });
        setNotice('Product created.');
      }
      setShowForm(false);
      setForm({});
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(product) {
    setError(null);
    setNotice(null);
    try {
      if (product.status === 'active') {
        await productsApi.deactivate(product.id);
        setNotice('Product deactivated.');
      } else {
        await productsApi.activate(product.id);
        setNotice('Product reactivated.');
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Products</h1>
        <Can permission="product.create">
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition">+ New product</button>
        </Can>
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-4 grid grid-cols-6 gap-2 items-end">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code/name/barcode/brand/generic/ingredient…"
          className="col-span-2 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={prescriptionClassification} onChange={(e) => setPrescriptionClassification(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All classifications</option>
          <option value="prescription">Prescription</option>
          <option value="otc">OTC</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="name">Sort: Name</option>
          <option value="code">Sort: Code</option>
          <option value="created_at">Sort: Created</option>
        </select>
        <button onClick={load} className="border border-slate-300 rounded px-3 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-lg shadow p-5 space-y-5">
          <fieldset>
            <legend className="font-semibold text-slate-800">Basic Identity</legend>
            <div className="mt-2 grid grid-cols-2 gap-4">
              {!editing && (
                <select value={form.organizationId ?? ''} onChange={(e) => setForm({ ...form, organizationId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                  <option value="">Organization…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <input placeholder="Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
              <input placeholder="Code / SKU" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
              <input placeholder="Barcode" value={form.barcode ?? ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
              <input placeholder="Description" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold text-slate-800">Pharmaceutical Information</legend>
            <div className="mt-2 grid grid-cols-3 gap-4">
              <select value={form.brandId ?? ''} onChange={(e) => setForm({ ...form, brandId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Brand…</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={form.genericId ?? ''} onChange={(e) => setForm({ ...form, genericId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Generic…</option>
                {generics.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={form.dosageFormId ?? ''} onChange={(e) => setForm({ ...form, dosageFormId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Dosage form…</option>
                {dosageForms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={form.routeId ?? ''} onChange={(e) => setForm({ ...form, routeId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Route…</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={form.therapeuticCategoryId ?? ''} onChange={(e) => setForm({ ...form, therapeuticCategoryId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Therapeutic category…</option>
                {therapeuticCategories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={form.manufacturerId ?? ''} onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Manufacturer…</option>
                {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold text-slate-800">Classification &amp; Regulatory</legend>
            <div className="mt-2 grid grid-cols-4 gap-4">
              <select value={form.prescriptionClassification ?? 'prescription'} onChange={(e) => setForm({ ...form, prescriptionClassification: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                {PRESCRIPTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={form.controlledClassification ?? 'none'} onChange={(e) => setForm({ ...form, controlledClassification: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                {CONTROLLED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={form.antibioticClassification ?? 'none'} onChange={(e) => setForm({ ...form, antibioticClassification: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                {ANTIBIOTIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input placeholder="Registration number" value={form.registrationNumber ?? ''} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold text-slate-800">Storage Requirement / Stock Policy</legend>
            <div className="mt-2 grid grid-cols-4 gap-4">
              <select value={form.storageRequirement ?? 'normal'} onChange={(e) => setForm({ ...form, storageRequirement: e.target.value })} className="rounded border border-slate-300 px-3 py-2">
                {STORAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="number" placeholder="Min stock level" value={form.minStockLevel ?? ''} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
              <input type="number" placeholder="Max stock level" value={form.maxStockLevel ?? ''} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
              <input type="number" placeholder="Reorder level" value={form.reorderLevel ?? ''} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className="rounded border border-slate-300 px-3 py-2" />
            </div>
          </fieldset>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition disabled:opacity-50">
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-2 text-sm transition">Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && products.length === 0 && <p className="p-5 text-slate-500">No products found.</p>}
        {!loading && products.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="p-3 font-medium">Code</th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Brand</th>
                  <th className="p-3 font-medium">Generic</th>
                  <th className="p-3 font-medium">Classification</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 font-mono text-xs">{p.code}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.brand_name || '—'}</td>
                    <td className="p-3">{p.generic_name || '—'}</td>
                    <td className="p-3">{p.prescription_classification}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{p.status}</span>
                    </td>
                    <td className="p-3 space-x-2">
                      <Link to={`/master-data/products/${p.id}`} className="text-sky-700 hover:underline">View</Link>
                      <Can permission="product.update">
                        <button onClick={() => openEdit(p)} className="text-sky-700 hover:underline">Edit</button>
                      </Can>
                      <Can permission="product.deactivate">
                        <button onClick={() => toggleStatus(p)} className="text-slate-700 hover:underline">
                          {p.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </Can>
                    </td>
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

export default ProductsPage;
