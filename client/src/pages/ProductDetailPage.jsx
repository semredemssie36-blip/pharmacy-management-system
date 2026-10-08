import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { productsApi } from '../features/products/api.js';
import { activeIngredientsApi, unitsApi } from './productMasterApis.js';

const RELATIONSHIP_TYPES = [
  { value: 'equivalent', label: 'Equivalent' },
  { value: 'alternative', label: 'Alternative' },
  { value: 'different_strength', label: 'Different Strength' },
  { value: 'different_dosage_form', label: 'Different Dosage Form' },
];

/** Product detail: organized sections + nested master-data management. */
function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [ingredients, setIngredients] = useState([]); // master ingredient options
  const [unitOptions, setUnitOptions] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  // nested editor states
  const [ingredientRows, setIngredientRows] = useState([]);
  const [unitRows, setUnitRows] = useState([]);
  const [conversionRows, setConversionRows] = useState([]);
  const [relationshipRows, setRelationshipRows] = useState([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.get(id);
      const p = res.data.product;
      setProduct(p);
      setIngredientRows(p.ingredients || []);
      setUnitRows((p.units || []).map((u) => ({ ...u, is_base_unit: u.is_base_unit === 1, is_purchase_unit: u.is_purchase_unit === 1, is_inventory_unit: u.is_inventory_unit === 1, is_selling_unit: u.is_selling_unit === 1 })));
      setConversionRows(p.conversions || []);
      setRelationshipRows(p.relationships || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    activeIngredientsApi.list().then((res) => setIngredients(res.data.items)).catch(() => setIngredients([]));
    unitsApi.list().then((res) => setUnitOptions(res.data.items)).catch(() => setUnitOptions([]));
    productsApi.list({ limit: 100 }).then((res) => setAllProducts(res.data.items)).catch(() => setAllProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveIngredients() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = ingredientRows
        .filter((r) => r.active_ingredient_id || r.activeIngredientId)
        .map((r) => ({
          activeIngredientId: Number(r.active_ingredient_id ?? r.activeIngredientId),
          strength: r.strength || null,
        }));
      await productsApi.setIngredients(id, payload);
      setNotice('Active ingredients updated.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveUnits() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = unitRows
        .filter((u) => u.unit_id || u.unitId)
        .map((u) => ({
          unitId: Number(u.unit_id ?? u.unitId),
          isBaseUnit: !!u.is_base_unit || !!u.isBaseUnit,
          isPurchaseUnit: !!u.is_purchase_unit || !!u.isPurchaseUnit,
          isInventoryUnit: !!u.is_inventory_unit || !!u.isInventoryUnit,
          isSellingUnit: !!u.is_selling_unit || !!u.isSellingUnit,
        }));
      await productsApi.setUnits(id, payload);
      setNotice('Units updated.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveConversions() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = conversionRows
        .filter((c) => (c.from_unit_id || c.fromUnitId) && (c.to_unit_id || c.toUnitId))
        .map((c) => ({
          fromUnitId: Number(c.from_unit_id ?? c.fromUnitId),
          toUnitId: Number(c.to_unit_id ?? c.toUnitId),
          factor: Number(c.factor),
        }));
      await productsApi.setConversions(id, payload);
      setNotice('Unit conversions updated.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRelationships() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = relationshipRows
        .filter((r) => r.related_product_id || r.relatedProductId)
        .map((r) => ({
          relatedProductId: Number(r.related_product_id ?? r.relatedProductId),
          relationshipType: r.relationship_type ?? r.relationshipType,
        }));
      await productsApi.setRelationships(id, payload);
      setNotice('Product relationships updated.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!product) return <p className="text-red-600">{error || 'Product not found.'}</p>;

  return (
    <div className="max-w-4xl">
      <Link to="/master-data/products" className="text-sky-700 hover:underline">← Back to products</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{product.name}</h1>
      <p className="text-sm text-slate-500">{product.code} · {product.status}</p>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      <Section title="Identity">
        <Info label="Code / SKU" value={product.code} />
        <Info label="Barcode" value={product.barcode || '—'} />
        <Info label="Description" value={product.description || '—'} />
      </Section>

      <Section title="Classification">
        <Info label="Prescription" value={product.prescription_classification} />
        <Info label="Controlled" value={product.controlled_classification} />
        <Info label="Antibiotic" value={product.antibiotic_classification} />
      </Section>

      <Section title="Storage Requirement / Stock Policy">
        <Info label="Storage requirement" value={product.storage_requirement} />
        <Info label="Min stock level" value={product.min_stock_level ?? '—'} />
        <Info label="Max stock level" value={product.max_stock_level ?? '—'} />
        <Info label="Reorder level" value={product.reorder_level ?? '—'} />
      </Section>

      <Section title="Active Ingredients">
        {ingredientRows.map((row, index) => (
          <div key={index} className="grid grid-cols-3 gap-2 mb-2">
            <select
              value={row.active_ingredient_id ?? row.activeIngredientId ?? ''}
              onChange={(e) => setIngredientRows(ingredientRows.map((r, i) => (i === index ? { ...r, active_ingredient_id: e.target.value, activeIngredientId: e.target.value } : r)))}
              className="rounded border border-slate-300 px-2 py-1"
            >
              <option value="">Select ingredient…</option>
              {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
            </select>
            <input
              placeholder="Strength (e.g. 500mg)"
              value={row.strength ?? ''}
              onChange={(e) => setIngredientRows(ingredientRows.map((r, i) => (i === index ? { ...r, strength: e.target.value } : r)))}
              className="rounded border border-slate-300 px-2 py-1"
            />
            <button onClick={() => setIngredientRows(ingredientRows.filter((_, i) => i !== index))} className="text-sm text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <button onClick={() => setIngredientRows([...ingredientRows, { active_ingredient_id: '', strength: '' }])} className="text-sm text-sky-700 hover:underline">+ Add ingredient</button>
          <button onClick={saveIngredients} disabled={saving} className="bg-slate-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50">Save ingredients</button>
        </div>
      </Section>

      <Section title="Units">
        {unitRows.map((row, index) => (
          <div key={index} className="grid grid-cols-6 gap-2 mb-2 items-center">
            <select
              value={row.unit_id ?? row.unitId ?? ''}
              onChange={(e) => setUnitRows(unitRows.map((r, i) => (i === index ? { ...r, unit_id: e.target.value, unitId: e.target.value } : r)))}
              className="rounded border border-slate-300 px-2 py-1 col-span-2"
            >
              <option value="">Select unit…</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!(row.is_base_unit ?? row.isBaseUnit)} onChange={(e) => setUnitRows(unitRows.map((r, i) => (i === index ? { ...r, is_base_unit: e.target.checked, isBaseUnit: e.target.checked } : r)))} />Base</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!(row.is_purchase_unit ?? row.isPurchaseUnit)} onChange={(e) => setUnitRows(unitRows.map((r, i) => (i === index ? { ...r, is_purchase_unit: e.target.checked, isPurchaseUnit: e.target.checked } : r)))} />Purchase</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!(row.is_inventory_unit ?? row.isInventoryUnit)} onChange={(e) => setUnitRows(unitRows.map((r, i) => (i === index ? { ...r, is_inventory_unit: e.target.checked, isInventoryUnit: e.target.checked } : r)))} />Inventory</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!(row.is_selling_unit ?? row.isSellingUnit)} onChange={(e) => setUnitRows(unitRows.map((r, i) => (i === index ? { ...r, is_selling_unit: e.target.checked, isSellingUnit: e.target.checked } : r)))} />Selling</label>
            <button onClick={() => setUnitRows(unitRows.filter((_, i) => i !== index))} className="text-sm text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <button onClick={() => setUnitRows([...unitRows, { unit_id: '', is_base_unit: false, is_purchase_unit: false, is_inventory_unit: false, is_selling_unit: false }])} className="text-sm text-sky-700 hover:underline">+ Add unit</button>
          <button onClick={saveUnits} disabled={saving} className="bg-slate-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50">Save units</button>
        </div>
      </Section>

      <Section title="Unit Conversions">
        {conversionRows.map((row, index) => (
          <div key={index} className="grid grid-cols-4 gap-2 mb-2 items-center">
            <select value={row.from_unit_id ?? row.fromUnitId ?? ''} onChange={(e) => setConversionRows(conversionRows.map((r, i) => (i === index ? { ...r, from_unit_id: e.target.value, fromUnitId: e.target.value } : r)))} className="rounded border border-slate-300 px-2 py-1">
              <option value="">From…</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={row.to_unit_id ?? row.toUnitId ?? ''} onChange={(e) => setConversionRows(conversionRows.map((r, i) => (i === index ? { ...r, to_unit_id: e.target.value, toUnitId: e.target.value } : r)))} className="rounded border border-slate-300 px-2 py-1">
              <option value="">To…</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="number" placeholder="Factor (e.g. 10)" value={row.factor ?? ''} onChange={(e) => setConversionRows(conversionRows.map((r, i) => (i === index ? { ...r, factor: e.target.value } : r)))} className="rounded border border-slate-300 px-2 py-1" />
            <button onClick={() => setConversionRows(conversionRows.filter((_, i) => i !== index))} className="text-sm text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <button onClick={() => setConversionRows([...conversionRows, { from_unit_id: '', to_unit_id: '', factor: '' }])} className="text-sm text-sky-700 hover:underline">+ Add conversion</button>
          <button onClick={saveConversions} disabled={saving} className="bg-slate-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50">Save conversions</button>
        </div>
      </Section>

      <Section title="Product Relationships">
        {relationshipRows.map((row, index) => (
          <div key={index} className="grid grid-cols-4 gap-2 mb-2 items-center">
            <select value={row.related_product_id ?? row.relatedProductId ?? ''} onChange={(e) => setRelationshipRows(relationshipRows.map((r, i) => (i === index ? { ...r, related_product_id: e.target.value, relatedProductId: e.target.value } : r)))} className="rounded border border-slate-300 px-2 py-1 col-span-2">
              <option value="">Select related product…</option>
              {allProducts.filter((p) => p.id !== Number(id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={row.relationship_type ?? row.relationshipType ?? ''} onChange={(e) => setRelationshipRows(relationshipRows.map((r, i) => (i === index ? { ...r, relationship_type: e.target.value, relationshipType: e.target.value } : r)))} className="rounded border border-slate-300 px-2 py-1">
              <option value="">Type…</option>
              {RELATIONSHIP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={() => setRelationshipRows(relationshipRows.filter((_, i) => i !== index))} className="text-sm text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <button onClick={() => setRelationshipRows([...relationshipRows, { related_product_id: '', relationship_type: '' }])} className="text-sm text-sky-700 hover:underline">+ Add relationship</button>
          <button onClick={saveRelationships} disabled={saving} className="bg-slate-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50">Save relationships</button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-6 bg-white rounded-lg shadow p-5">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <div className="mt-3 space-y-1 text-sm text-slate-700">{children}</div>
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

export default ProductDetailPage;
