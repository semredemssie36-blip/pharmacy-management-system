import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { recallsApi, batchesApi } from '../features/inventory/api.js';
import PageHeader from '../components/common/PageHeader.jsx';

export default function RecallCreatePage() {
  const navigate = useNavigate();

  const [availableBatches, setAvailableBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('critical');
  const [reason, setReason] = useState('quality_defect');
  const [initiatingParty, setInitiatingParty] = useState('');
  const [scope, setScope] = useState('batch_specific');
  const [description, setDescription] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);

  // Batch search / selection
  const [batchSearch, setBatchSearch] = useState('');

  useEffect(() => {
    async function init() {
      try {
        const res = await batchesApi.list({ limit: 100 });
        setAvailableBatches(res.data?.items || res.data || []);
      } catch (err) {
        // Non-blocking
      }
    }
    init();
  }, []);

  function toggleBatch(id) {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  const filteredBatches = availableBatches.filter((b) => {
    const q = batchSearch.toLowerCase();
    return (
      (b.batch_number && b.batch_number.toLowerCase().includes(q)) ||
      (b.product_name && b.product_name.toLowerCase().includes(q)) ||
      (b.product_code && b.product_code.toLowerCase().includes(q))
    );
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Recall title is required.');
      return;
    }
    if (selectedBatchIds.length === 0) {
      setError('Please select at least one affected batch.');
      return;
    }

    setLoading(true);
    try {
      const res = await recallsApi.create({
        title: title.trim(),
        severity,
        reason,
        initiatingParty: initiatingParty.trim() || undefined,
        scope,
        description: description.trim() || undefined,
        batchIds: selectedBatchIds,
      });
      navigate(`/inventory/recalls/${res.data.id}`);
    } catch (err) {
      setError(err?.message || 'Failed to create recall case.');
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Initiate Product Recall"
          subtitle="Open a regulated recall case, designate affected batches, and prepare containment hold."
        />
        <Link
          to="/inventory/recalls"
          className="text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          &larr; Back to Recalls
        </Link>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Recall Title / Incident Subject <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. EFDA Safety Alert: Paracetamol 500mg Batch B2026-09 Containment"
            className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-rose-500 font-medium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recall Severity / Class <span className="text-rose-500">*</span>
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-rose-500"
            >
              <option value="critical">Critical (Class I: Severe / Life Risk)</option>
              <option value="high">High (Class II: Serious Health Threat)</option>
              <option value="medium">Medium (Class III: Minor Defect / Labeling)</option>
              <option value="low">Low (Precautionary / Advisory)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recall Reason <span className="text-rose-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-rose-500"
            >
              <option value="quality_defect">Quality Defect</option>
              <option value="contamination">Chemical / Biological Contamination</option>
              <option value="labeling_error">Packaging / Labeling Error</option>
              <option value="regulatory_mandate">National Regulatory Mandate (EFDA)</option>
              <option value="manufacturer_notice">Manufacturer Recall Notice</option>
              <option value="counterfeit_alert">Counterfeit / Spurious Stock Alert</option>
              <option value="adverse_reaction">Severe Adverse Reaction Report</option>
              <option value="other">Other Regulatory Reason</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initiating Party / Authority
            </label>
            <input
              type="text"
              value={initiatingParty}
              onChange={(e) => setInitiatingParty(e.target.value)}
              placeholder="e.g. EFDA, Pharmacovigilance, Manufacturer"
              className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Clinical / Incident Details & Containment Instructions
          </label>
          <textarea
            rows="3"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Document regulatory directive reference, specific defect description, handling precautions, and patient safety instructions..."
            className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Affected Batches Selector */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Designate Affected Batches <span className="text-rose-500">*</span>
              </h3>
              <p className="text-xs text-slate-500">
                Selected batches will be deactivated and quarantined upon recall activation.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-1 bg-slate-100 rounded text-slate-700">
              {selectedBatchIds.length} Batches Selected
            </span>
          </div>

          <input
            type="text"
            placeholder="Search batches by batch #, product code or drug name..."
            value={batchSearch}
            onChange={(e) => setBatchSearch(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
          />

          <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filteredBatches.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No batches matching search.</div>
            ) : (
              filteredBatches.map((b) => {
                const isChecked = selectedBatchIds.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className={`flex items-center gap-3 p-3 text-xs cursor-pointer hover:bg-slate-50 transition ${
                      isChecked ? 'bg-rose-50/50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleBatch(b.id)}
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <span className="font-mono font-bold text-slate-800">{b.batch_number}</span>
                        <span className="text-slate-400 ml-2">ID #{b.id}</span>
                      </div>
                      <div className="text-slate-700 truncate">
                        {b.product_name || `Product #${b.product_id}`}
                      </div>
                      <div className="text-slate-500 text-right font-mono">
                        Exp: {b.expiry_date ? String(b.expiry_date).substring(0, 10) : 'N/A'}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Link
            to="/inventory/recalls"
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded shadow-sm disabled:opacity-50 transition"
          >
            {loading ? 'Creating Recall Case...' : 'Create Recall Case'}
          </button>
        </div>
      </form>
    </div>
  );
}
