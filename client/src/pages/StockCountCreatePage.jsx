import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { stockCountsApi } from '../features/inventory/api.js';
import { branchesApi, warehousesApi, storageLocationsApi } from '../features/organizations/api.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function StockCountCreatePage() {
  const navigate = useNavigate();

  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [storageLocations, setStorageLocations] = useState([]);

  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [countType, setCountType] = useState('full');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initBranches() {
      setLoading(true);
      try {
        const res = await branchesApi.list();
        const items = res.data?.items || res.data || [];
        setBranches(items);
        if (items.length === 1) {
          setBranchId(String(items[0].id));
        }
      } catch (err) {
        setError(err?.message || 'Failed to load branches.');
      } finally {
        setLoading(false);
      }
    }
    initBranches();
  }, []);

  useEffect(() => {
    if (!branchId) {
      setWarehouses([]);
      setWarehouseId('');
      return;
    }

    async function loadBranchWarehouses() {
      try {
        const res = await warehousesApi.list({ branchId });
        const items = res.data?.items || res.data || [];
        setWarehouses(items);
        if (items.length === 1) {
          setWarehouseId(String(items[0].id));
        } else {
          setWarehouseId('');
        }
      } catch {
        setWarehouses([]);
      }
    }
    loadBranchWarehouses();
  }, [branchId]);

  useEffect(() => {
    if (!warehouseId || countType !== 'location') {
      setStorageLocations([]);
      setStorageLocationId('');
      return;
    }

    async function loadWarehouseLocations() {
      try {
        const res = await storageLocationsApi.list({ warehouseId });
        const items = res.data?.items || res.data || [];
        setStorageLocations(items);
        if (items.length === 1) {
          setStorageLocationId(String(items[0].id));
        }
      } catch {
        setStorageLocations([]);
      }
    }
    loadWarehouseLocations();
  }, [warehouseId, countType]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!branchId) {
      setError('Please select a branch.');
      return;
    }
    if (!warehouseId) {
      setError('Please select a warehouse.');
      return;
    }
    if (countType === 'location' && !storageLocationId) {
      setError('Please select a storage location for a Location count.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        branchId: Number(branchId),
        warehouseId: Number(warehouseId),
        countType,
        storageLocationId: storageLocationId ? Number(storageLocationId) : undefined,
        notes: notes.trim() || undefined,
      };

      const res = await stockCountsApi.create(payload);
      const newId = res.data?.id;
      navigate(`/inventory/stock-counts/${newId}`);
    } catch (err) {
      setError(err?.message || 'Failed to create stock count session.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Initialize New Stock Count"
        subtitle="Establish the counting scope, target warehouse, and locations for inventory audit"
        actions={
          <Link
            to="/inventory/stock-counts"
            className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Back to Directory
          </Link>
        }
      />

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm space-y-1">
        <div className="font-semibold flex items-center gap-1.5">
          ℹ Important ERP Integrity Guidelines
        </div>
        <p>
          1. <strong>Physical Count ≠ Stock Adjustment:</strong> Entering counts does not mutate inventory balances.
        </p>
        <p>
          2. <strong>Inventory Snapshot:</strong> When started, the system captures an immutable snapshot of eligible active batches.
        </p>
        <p>
          3. <strong>Approval Required:</strong> Any variances must be investigated, justified, and supervisor-approved before applying adjustments.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg border border-slate-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Branch */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Branch <span className="text-red-500">*</span>
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={loading || submitting}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select Branch...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Warehouse <span className="text-red-500">*</span>
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={!branchId || submitting}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select Warehouse...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Count Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Count Scope Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label
              className={`border rounded-lg p-3 cursor-pointer flex flex-col ${
                countType === 'full'
                  ? 'border-indigo-600 bg-indigo-50/50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="countType"
                  value="full"
                  checked={countType === 'full'}
                  onChange={(e) => setCountType(e.target.value)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-900 text-sm">Full Warehouse</span>
              </div>
              <span className="text-xs text-slate-500 mt-1 pl-6">
                Audit all stocked products and batches across the warehouse.
              </span>
            </label>

            <label
              className={`border rounded-lg p-3 cursor-pointer flex flex-col ${
                countType === 'location'
                  ? 'border-indigo-600 bg-indigo-50/50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="countType"
                  value="location"
                  checked={countType === 'location'}
                  onChange={(e) => setCountType(e.target.value)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-900 text-sm">Storage Location</span>
              </div>
              <span className="text-xs text-slate-500 mt-1 pl-6">
                Target a specific shelf, rack, bin, or cold-chain zone.
              </span>
            </label>

            <label
              className={`border rounded-lg p-3 cursor-pointer flex flex-col ${
                countType === 'product'
                  ? 'border-indigo-600 bg-indigo-50/50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="countType"
                  value="product"
                  checked={countType === 'product'}
                  onChange={(e) => setCountType(e.target.value)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-slate-900 text-sm">Product Scope</span>
              </div>
              <span className="text-xs text-slate-500 mt-1 pl-6">
                Perform targeted cycle count for specific product lines.
              </span>
            </label>
          </div>
        </div>

        {/* Location selector if countType === 'location' */}
        {countType === 'location' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Storage Location <span className="text-red-500">*</span>
            </label>
            <select
              value={storageLocationId}
              onChange={(e) => setStorageLocationId(e.target.value)}
              disabled={!warehouseId || submitting}
              className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select Storage Location...</option>
              {storageLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Audit Notes / Instructions
          </label>
          <textarea
            rows={3}
            placeholder="Add counting directives, reason for audit (e.g. End of Month cycle count, narcotic verification)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            className="w-full text-sm border-slate-300 rounded-md shadow-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            to="/inventory/stock-counts"
            className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Initializing...' : 'Create Draft Count Session'}
          </button>
        </div>
      </form>
    </div>
  );
}
