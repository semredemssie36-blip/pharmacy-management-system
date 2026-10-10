import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { quarantineApi, batchesApi } from '../features/inventory/api.js';
import { branchesApi, warehousesApi } from '../features/organizations/api.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function QuarantineCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form State
  const [branchId, setBranchId] = useState(searchParams.get('branchId') || '');
  const [warehouseId, setWarehouseId] = useState(searchParams.get('warehouseId') || '');
  const [batchId, setBatchId] = useState(searchParams.get('batchId') || '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('suspected_quality_defect');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const [bRes, wRes, batRes] = await Promise.all([
          branchesApi.list(),
          warehousesApi.list(),
          batchesApi.list({ limit: 100 }),
        ]);
        setBranches(bRes.data?.branches || bRes.data?.items || (Array.isArray(bRes.data) ? bRes.data : []));
        setWarehouses(wRes.data?.warehouses || wRes.data?.items || (Array.isArray(wRes.data) ? wRes.data : []));
        setBatches(batRes.data?.batches || batRes.data?.items || (Array.isArray(batRes.data) ? batRes.data : []));
      } catch (err) {
        // Non-blocking
      }
    }
    init();
  }, []);

  const selectedBatch = batches.find((b) => String(b.id) === String(batchId));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError('Please provide a valid quantity greater than 0.');
      return;
    }
    if (!branchId && !warehouseId) {
      setError('Please select either a Branch or a Warehouse for stock custody.');
      return;
    }
    if (!batchId) {
      setError('Please select a batch.');
      return;
    }

    setLoading(true);
    try {
      const res = await quarantineApi.create({
        branchId: branchId ? parseInt(branchId, 10) : null,
        warehouseId: warehouseId ? parseInt(warehouseId, 10) : null,
        batchId: parseInt(batchId, 10),
        quantity: qty,
        reason,
        notes: notes.trim() || undefined,
      });
      navigate(`/inventory/quarantines/${res.data.id}`);
    } catch (err) {
      setError(err?.message || 'Failed to place stock on quarantine hold.');
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Place Stock on Quarantine Hold"
          subtitle="Isolate compromised or suspect inventory from available sales stock under strict custody."
        />
        <Link
          to="/inventory/quarantines"
          className="text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          &larr; Back to Quarantine Holds
        </Link>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Branch <span className="text-slate-400 font-normal">(Optional if Warehouse selected)</span>
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select Branch</option>
              {(Array.isArray(branches) ? branches : []).map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Warehouse <span className="text-slate-400 font-normal">(Optional if Branch selected)</span>
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select Warehouse</option>
              {(Array.isArray(warehouses) ? warehouses : []).map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Pharmaceutical Batch <span className="text-rose-500">*</span>
          </label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
            required
          >
            <option value="">Select Batch...</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_number} — {b.product_name || `Product #${b.product_id}`} (Exp: {b.expiry_date ? String(b.expiry_date).substring(0, 10) : 'N/A'})
              </option>
            ))}
          </select>
          {selectedBatch && (
            <p className="mt-1 text-xs text-slate-500">
              Selected: Batch #{selectedBatch.batch_number} (Expiry: {selectedBatch.expiry_date ? String(selectedBatch.expiry_date).substring(0, 10) : 'N/A'})
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity to Quarantine <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 25"
              required
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="mt-1 text-xs text-slate-400">
              This quantity will be transferred from available stock to quarantined hold status.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quarantine Reason <span className="text-rose-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
              required
            >
              <option value="suspected_quality_defect">Suspected Quality Defect</option>
              <option value="contamination_or_damage">Contamination or Damage</option>
              <option value="temperature_excursion">Temperature Excursion</option>
              <option value="suspected_counterfeit">Suspected Counterfeit</option>
              <option value="customer_complaint">Customer Complaint</option>
              <option value="expiry_investigation">Expiry Investigation</option>
              <option value="supplier_notification">Supplier Notification</option>
              <option value="recall_investigation">Recall Investigation</option>
              <option value="other">Other Reason</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Justification & Technical Notes
          </label>
          <textarea
            rows="3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document observed defect, packaging damage, temperature log, customer report, or instructions..."
            className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Link
            to="/inventory/quarantines"
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition shadow-xs"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs disabled:opacity-50 transition"
          >
            {loading ? 'Processing Hold...' : 'Confirm Quarantine Hold'}
          </button>
        </div>
      </form>
    </div>
  );
}
