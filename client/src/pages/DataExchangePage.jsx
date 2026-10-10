import React, { useState, useEffect } from 'react';
import {
  downloadImportTemplate,
  previewImport,
  commitImport,
  getImportJobs,
  exportCsv,
} from '../features/dataExchange/api.js';

const IMPORT_ENTITIES = [
  {
    key: 'products',
    name: 'Products Master',
    description: 'Import pharmaceuticals, OTC medications, and inventory items with dosage forms, categories, and stock limits.',
    required: ['code', 'name', 'prescription_classification (prescription|otc)'],
    optional: ['barcode', 'description', 'category_code', 'dosage_form_code', 'min_stock_level', 'max_stock_level', 'reorder_level'],
  },
  {
    key: 'suppliers',
    name: 'Suppliers Directory',
    description: 'Import wholesale pharmaceutical distributors, manufacturers, and trade suppliers with contact details and TIN.',
    required: ['name'],
    optional: ['code', 'contact_person', 'telephone', 'email', 'address', 'country', 'tax_registration_number', 'notes'],
  },
  {
    key: 'customers',
    name: 'Customers & Institutions',
    description: 'Import regular retail patients, clinics, hospitals, and credit clients with credit limits and payment terms.',
    required: ['name'],
    optional: ['code', 'customer_type (individual|business|institution)', 'telephone', 'email', 'credit_limit', 'payment_terms'],
  },
];

const EXPORT_DATASETS = [
  { key: 'products', title: 'Products Catalog', desc: 'Active master product definitions, barcodes, categories, and stock limits.', perm: 'product.view' },
  { key: 'suppliers', title: 'Suppliers Directory', desc: 'Registered pharmaceutical suppliers, contact info, and tax numbers.', perm: 'supplier.view' },
  { key: 'customers', title: 'Customer Accounts', desc: 'Registered retail, business, and institutional customers with credit limits.', perm: 'customer.view' },
  { key: 'inventory', title: 'Inventory Stock Snapshot', desc: 'Current physical, available, and quarantined stock quantities by batch and warehouse.', perm: 'inventory.view' },
  { key: 'sales', title: 'Sales Transactions', desc: 'Completed and confirmed sales orders, invoice numbers, totals, and payment status.', perm: 'sale.view' },
  { key: 'purchase_orders', title: 'Purchase Orders', desc: 'Procurement orders, suppliers, dates, lifecycle status, and PO totals.', perm: 'purchase_order.view' },
  { key: 'goods_receipts', title: 'Goods Receipts', desc: 'Receiving documents, delivery notes, and verified fulfillment status.', perm: 'goods_receipt.view' },
  { key: 'reports_sales', title: 'Sales Performance Report', desc: 'Detailed sales ledger with date breakdowns, discounts, and net realized revenue.', perm: 'report.sales.view' },
  { key: 'reports_inventory', title: 'Inventory Valuation Report', desc: 'Stock positions with latest PO cost basis and valuation estimates.', perm: 'report.inventory.view' },
  { key: 'reports_financial', title: 'Accounts Receivable Ledger', desc: 'Customer receivables ledger with open balances, credit terms, and due dates.', perm: 'report.financial.view' },
];

export default function DataExchangePage() {
  const [activeTab, setActiveTab] = useState('import');

  // Import State
  const [selectedEntity, setSelectedEntity] = useState('products');
  const [csvFile, setCsvFile] = useState(null);
  const [csvContent, setCsvContent] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Export State
  const [exportFilters, setExportFilters] = useState({
    startDate: '',
    endDate: '',
  });
  const [exportingKey, setExportingKey] = useState(null);
  const [exportError, setExportError] = useState(null);

  // Load import job history
  useEffect(() => {
    if (activeTab === 'import') {
      loadJobs();
    }
  }, [activeTab]);

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await getImportJobs(1, 10);
      setJobs(res.items || []);
    } catch {
      // Ignore
    } finally {
      setJobsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setPreviewData(null);
    setPreviewError(null);
    setCommitResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvContent(event.target.result || '');
    };
    reader.readAsText(file);
  };

  const handleValidatePreview = async () => {
    if (!csvContent) {
      setPreviewError('Please choose a CSV file first.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setCommitResult(null);

    try {
      const res = await previewImport(selectedEntity, csvContent, updateExisting);
      setPreviewData(res);
    } catch (err) {
      setPreviewError(err.message || 'Validation failed. Check CSV formatting.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!csvContent || !previewData) return;

    setCommitLoading(true);
    setPreviewError(null);

    try {
      const res = await commitImport(
        selectedEntity,
        csvContent,
        csvFile?.name || `${selectedEntity}_import.csv`,
        updateExisting
      );
      setCommitResult(res);
      setPreviewData(null);
      setCsvFile(null);
      setCsvContent('');
      loadJobs();
    } catch (err) {
      setPreviewError(err.message || 'Import commit failed.');
    } finally {
      setCommitLoading(false);
    }
  };

  const handleExport = async (type) => {
    setExportingKey(type);
    setExportError(null);
    try {
      await exportCsv(type, exportFilters);
    } catch (err) {
      setExportError(`Export failed: ${err.message}`);
    } finally {
      setExportingKey(null);
    }
  };

  const currentEntityConfig = IMPORT_ENTITIES.find((e) => e.key === selectedEntity);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Import & Export Center</h1>
          <p className="text-sm text-slate-500 mt-1">
            Safely import master catalog data with atomic validation or export operational ledgers to sanitized CSV spreadsheets.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'import'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'export'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Export
          </button>
        </div>
      </div>

      {/* ===================== TAB 1: DATA IMPORT ===================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Entity Selector & Template Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">1. Select Target Master Entity</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {IMPORT_ENTITIES.map((ent) => (
                <div
                  key={ent.key}
                  onClick={() => {
                    setSelectedEntity(ent.key);
                    setPreviewData(null);
                    setPreviewError(null);
                    setCommitResult(null);
                  }}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    selectedEntity === ent.key
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-600'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{ent.name}</span>
                    {selectedEntity === ent.key && (
                      <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{ent.description}</p>
                </div>
              ))}
            </div>

            {/* Template Specifications Card */}
            {currentEntityConfig && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Template Specifications: {currentEntityConfig.name}</h3>
                    <p className="text-xs text-slate-500">Columns must match standard header names. Non-compliant headers will be rejected.</p>
                  </div>
                  <button
                    onClick={() => downloadImportTemplate(selectedEntity)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-sm"
                  >
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download CSV Template
                  </button>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div><strong className="text-slate-800">Required Headers:</strong> {currentEntityConfig.required.join(', ')}</div>
                  <div><strong className="text-slate-800">Optional Headers:</strong> {currentEntityConfig.optional.join(', ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Upload & Validation Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">2. Upload & Validate File</h2>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <label className="relative cursor-pointer bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">
                <span>Select CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {csvFile && (
                <div className="text-sm text-slate-700 flex items-center gap-2">
                  <span className="font-medium text-emerald-700">{csvFile.name}</span>
                  <span className="text-slate-400">({(csvFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center gap-3">
              <input
                id="updateExisting"
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="updateExisting" className="text-sm text-slate-700 cursor-pointer">
                <strong>Update existing records</strong> if code already exists in organization (requires update permission).
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleValidatePreview}
                disabled={!csvContent || previewLoading}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
              >
                {previewLoading ? 'Validating...' : 'Validate & Preview'}
              </button>
            </div>

            {/* Error Message */}
            {previewError && (
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-semibold">Import Validation Issue</div>
                  <div className="mt-0.5">{previewError}</div>
                </div>
              </div>
            )}

            {/* Success Commit Banner */}
            {commitResult && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-semibold">Import Completed Successfully!</div>
                  <div className="mt-0.5">
                    Job UUID: <code className="bg-emerald-100 px-1 py-0.5 rounded text-xs">{commitResult.jobUuid}</code> •{' '}
                    Successfully committed <strong>{commitResult.successfulRows}</strong> records into the database.
                  </div>
                </div>
              </div>
            )}

            {/* Validation Preview Table */}
            {previewData && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                    <div className="text-xs text-slate-500 uppercase font-medium">Total Rows</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{previewData.totalRows}</div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                    <div className="text-xs text-emerald-700 uppercase font-medium">Valid Rows</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">{previewData.validRows}</div>
                  </div>
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center">
                    <div className="text-xs text-rose-700 uppercase font-medium">Invalid Rows</div>
                    <div className="text-xl font-bold text-rose-700 mt-1">{previewData.invalidRows}</div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                    <div className="text-xs text-amber-700 uppercase font-medium">Duplicates</div>
                    <div className="text-xl font-bold text-amber-700 mt-1">{previewData.duplicateRows}</div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Validation Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.rows.slice(0, 50).map((r) => (
                        <tr key={r.rowNumber} className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                          <td className="px-3 py-2 font-mono text-slate-500">{r.rowNumber}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{r.data.code || '—'}</td>
                          <td className="px-3 py-2 text-slate-700 truncate max-w-xs">{r.data.name || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              r.action === 'create' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {r.action}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {r.isValid ? (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Valid
                              </span>
                            ) : (
                              <span className="text-rose-700 font-semibold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Error
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-rose-600">
                            {r.errors.length > 0 ? r.errors.join('; ') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previewData.rows.length > 50 && (
                  <p className="text-xs text-slate-500 italic">
                    Showing first 50 rows of {previewData.rows.length} total rows.
                  </p>
                )}

                {/* Commit Action */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleCommit}
                    disabled={previewData.invalidRows > 0 || commitLoading}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
                  >
                    {commitLoading ? 'Committing Import...' : `Commit ${previewData.validRows} Records (Atomic)`}
                  </button>
                  {previewData.invalidRows > 0 && (
                    <span className="text-xs text-rose-600 font-medium">
                      Fix all {previewData.invalidRows} validation errors in your CSV before committing.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Import Job History */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Import Job Audit Log</h2>

            {jobsLoading ? (
              <div className="text-sm text-slate-500 py-4">Loading import jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="text-sm text-slate-500 py-4">No import jobs recorded yet.</div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Job UUID</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">Initiated By</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobs.map((j) => (
                      <tr key={j.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-slate-600">{j.job_uuid}</td>
                        <td className="px-3 py-2 font-medium capitalize text-slate-800">{j.import_type}</td>
                        <td className="px-3 py-2 text-slate-600">{j.original_filename}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            j.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : j.status === 'failed'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-emerald-700">{j.successful_rows}</span> / {j.total_rows}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{j.initiated_by_name || 'System'}</td>
                        <td className="px-3 py-2 text-slate-500">{new Date(j.started_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 2: DATA EXPORT ===================== */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* Export Filter Controls */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Export Scope & Filters</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date Range: Start</label>
                <input
                  type="date"
                  value={exportFilters.startDate}
                  onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date Range: End</label>
                <input
                  type="date"
                  value={exportFilters.endDate}
                  onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {exportError && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{exportError}</span>
            </div>
          )}

          {/* Export Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {EXPORT_DATASETS.map((ds) => (
              <div
                key={ds.key}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{ds.title}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">CSV</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{ds.desc}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">{ds.perm}</span>
                  <button
                    onClick={() => handleExport(ds.key)}
                    disabled={exportingKey === ds.key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 shadow-sm"
                  >
                    {exportingKey === ds.key ? (
                      'Exporting...'
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download CSV
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
