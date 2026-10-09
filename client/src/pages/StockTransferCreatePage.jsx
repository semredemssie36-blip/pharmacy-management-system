import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { stockTransfersApi } from '../features/inventory/api.js';
import { organizationsApi, branchesApi, warehousesApi } from '../features/organizations/api.js';
import { productsApi } from '../features/products/api.js';
import { unitsApi } from './productMasterApis.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function StockTransferCreatePage() {
  const navigate = useNavigate();

  // Master data state
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sourceWarehouses, setSourceWarehouses] = useState([]);
  const [destWarehouses, setDestWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);

  // Form state
  const [organizationId, setOrganizationId] = useState('');
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [notes, setNotes] = useState('');

  // Line items state
  const [lines, setLines] = useState([
    { productId: '', unitId: '', quantityRequested: 1, notes: '' },
  ]);

  // UI state
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load organizations, products, and units on mount
  useEffect(() => {
    async function loadInitial() {
      setLoadingInitial(true);
      try {
        const [orgRes, prodRes, unitRes] = await Promise.all([
          organizationsApi.list({ status: 'active', limit: 100 }),
          productsApi.list({ status: 'active', limit: 200 }),
          unitsApi.list({ limit: 100 }),
        ]);

        const orgList = orgRes.data?.items || [];
        setOrganizations(orgList);
        setProducts(prodRes.data?.items || []);
        setUnits(unitRes.data?.items || []);

        if (orgList.length > 0) {
          setOrganizationId(String(orgList[0].id));
        }
      } catch (err) {
        setError(err.message || 'Failed to initialize transfer creation form.');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitial();
  }, []);

  // When organization changes, reload branches
  useEffect(() => {
    if (!organizationId) {
      setBranches([]);
      setSourceBranchId('');
      setDestinationBranchId('');
      return;
    }

    async function loadBranches() {
      try {
        const res = await branchesApi.list({ organizationId, status: 'active', limit: 100 });
        const branchList = res.data?.items || [];
        setBranches(branchList);
        if (branchList.length > 0) {
          setSourceBranchId(String(branchList[0].id));
          if (branchList.length > 1) {
            setDestinationBranchId(String(branchList[1].id));
          } else {
            setDestinationBranchId(String(branchList[0].id));
          }
        } else {
          setSourceBranchId('');
          setDestinationBranchId('');
        }
      } catch (err) {
        setError('Failed to load branches for the selected organization.');
      }
    }
    loadBranches();
  }, [organizationId]);

  // When source branch changes, reload source warehouses
  useEffect(() => {
    if (!sourceBranchId) {
      setSourceWarehouses([]);
      setSourceWarehouseId('');
      return;
    }

    async function loadSourceWarehouses() {
      try {
        const res = await warehousesApi.list({ branchId: sourceBranchId, status: 'active', limit: 100 });
        const whList = res.data?.items || [];
        setSourceWarehouses(whList);
        if (whList.length > 0) {
          setSourceWarehouseId(String(whList[0].id));
        } else {
          setSourceWarehouseId('');
        }
      } catch (err) {
        setError('Failed to load warehouses for source branch.');
      }
    }
    loadSourceWarehouses();
  }, [sourceBranchId]);

  // When destination branch changes, reload destination warehouses
  useEffect(() => {
    if (!destinationBranchId) {
      setDestWarehouses([]);
      setDestinationWarehouseId('');
      return;
    }

    async function loadDestWarehouses() {
      try {
        const res = await warehousesApi.list({ branchId: destinationBranchId, status: 'active', limit: 100 });
        const whList = res.data?.items || [];
        setDestWarehouses(whList);
        if (whList.length > 0) {
          // If source and dest are same branch, default to a different warehouse if available
          const diffWh = whList.find((w) => String(w.id) !== sourceWarehouseId);
          setDestinationWarehouseId(String((diffWh || whList[0]).id));
        } else {
          setDestinationWarehouseId('');
        }
      } catch (err) {
        setError('Failed to load warehouses for destination branch.');
      }
    }
    loadDestWarehouses();
  }, [destinationBranchId, sourceWarehouseId]);

  // Validation
  const isSameWarehouse = sourceWarehouseId && destinationWarehouseId && sourceWarehouseId === destinationWarehouseId;

  function handleAddLine() {
    setLines([...lines, { productId: '', unitId: '', quantityRequested: 1, notes: '' }]);
  }

  function handleRemoveLine(index) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  }

  function handleLineChange(index, field, value) {
    const updated = [...lines];
    updated[index][field] = value;

    // Auto-select unit if product changed and has base unit
    if (field === 'productId') {
      const prod = products.find((p) => String(p.id) === String(value));
      if (prod && prod.base_unit_id && !updated[index].unitId) {
        updated[index].unitId = String(prod.base_unit_id);
      } else if (!updated[index].unitId && units.length > 0) {
        updated[index].unitId = String(units[0].id);
      }
    }

    setLines(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isSameWarehouse) {
      setError('Source and destination warehouses cannot be the same warehouse.');
      return;
    }

    if (!organizationId || !sourceBranchId || !sourceWarehouseId || !destinationBranchId || !destinationWarehouseId) {
      setError('Please fill in all organization, branch, and warehouse fields.');
      return;
    }

    if (lines.length === 0) {
      setError('At least one product line is required.');
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.productId) {
        setError(`Line #${i + 1}: Please select a product.`);
        return;
      }
      if (!l.unitId) {
        setError(`Line #${i + 1}: Please select a unit.`);
        return;
      }
      const qty = Number(l.quantityRequested);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`Line #${i + 1}: Requested quantity must be greater than 0.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        organizationId: Number(organizationId),
        sourceBranchId: Number(sourceBranchId),
        sourceWarehouseId: Number(sourceWarehouseId),
        destinationBranchId: Number(destinationBranchId),
        destinationWarehouseId: Number(destinationWarehouseId),
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          productId: Number(l.productId),
          unitId: Number(l.unitId),
          quantityRequested: Number(l.quantityRequested),
          notes: l.notes?.trim() || undefined,
        })),
      };

      const res = await stockTransfersApi.create(payload);
      const createdId = res.data?.id;
      navigate(`/inventory/transfers/${createdId}`);
    } catch (err) {
      setError(err.message || 'Failed to create stock transfer.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingInitial) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-3" />
        <p className="text-sm font-medium">Loading form options...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/inventory/transfers" className="hover:text-emerald-600">
          Stock Transfers
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">New Transfer</span>
      </div>

      <PageHeader
        title="Initiate Stock Transfer"
        subtitle="Create a new stock transfer draft requesting transfer of inventory between branches or warehouses"
      />

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isSameWarehouse && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <strong>Invalid Transfer Route:</strong> Source and destination warehouses cannot be identical. Transfers must move stock to a different warehouse location.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source & Destination Routing */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h2 className="text-base font-semibold text-slate-800 border-b border-slate-100 pb-3">
            Transfer Route & Organization
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Organization <span className="text-rose-500">*</span>
              </label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 md:col-span-1.5 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Source (Origin)</div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source Branch <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sourceBranchId}
                  onChange={(e) => setSourceBranchId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source Warehouse <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sourceWarehouseId}
                  onChange={(e) => setSourceWarehouseId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Warehouse...</option>
                  {sourceWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Destination */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 md:col-span-1.5 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Destination (Target)</div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Destination Branch <span className="text-rose-500">*</span>
                </label>
                <select
                  value={destinationBranchId}
                  onChange={(e) => setDestinationBranchId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Destination Warehouse <span className="text-rose-500">*</span>
                </label>
                <select
                  value={destinationWarehouseId}
                  onChange={(e) => setDestinationWarehouseId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Warehouse...</option>
                  {destWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Transfer Reason & Administrative Notes
            </label>
            <textarea
              rows="2"
              placeholder="Provide reason for transfer (e.g. branch stock replenishment, rebalancing demand)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Product Items Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Transfer Line Items</h2>
              <p className="text-xs text-slate-500">Products and requested quantities to transfer</p>
            </div>
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5 w-44">Unit</th>
                  <th className="px-3 py-2.5 w-32">Quantity</th>
                  <th className="px-3 py-2.5">Line Notes</th>
                  <th className="px-3 py-2.5 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-center text-xs font-medium text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={line.productId}
                        onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                        required
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Select Product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.unitId}
                        onChange={(e) => handleLineChange(idx, 'unitId', e.target.value)}
                        required
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Select Unit...</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={line.quantityRequested}
                        onChange={(e) => handleLineChange(idx, 'quantityRequested', e.target.value)}
                        required
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={line.notes}
                        onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length <= 1}
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:pointer-events-none transition"
                        title="Remove Line"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to="/inventory/transfers"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || isSameWarehouse}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none transition flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating Transfer...
              </>
            ) : (
              'Create Draft Transfer'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
