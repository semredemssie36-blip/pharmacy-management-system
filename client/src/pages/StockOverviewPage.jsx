import { useEffect, useState } from 'react';

import { inventoryApi } from '../features/inventory/api.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'recalled', label: 'Recalled' },
  { value: 'returned', label: 'Returned' },
  { value: 'awaiting_disposal', label: 'Awaiting Disposal' },
  { value: 'disposed', label: 'Disposed' },
];

/** Inventory stock overview: actual physical stock per position (org/branch/warehouse/location/product/batch/unit/status). */
function StockOverviewPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await inventoryApi.list(params);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    load();
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-bold text-slate-900">Stock Overview</h1>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-4 flex gap-2 items-end">
        <input placeholder="Search product name/code or batch number" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => { setPage(1); load(); }} className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      <div className="mt-4 bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && <p className="p-5 text-slate-500">No stock records found.</p>}
        {!loading && items.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Batch</th>
                  <th className="p-3 font-medium">Expiry</th>
                  <th className="p-3 font-medium">Branch</th>
                  <th className="p-3 font-medium">Warehouse</th>
                  <th className="p-3 font-medium">Location</th>
                  <th className="p-3 font-medium">Unit</th>
                  <th className="p-3 font-medium text-right">Quantity</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3">{row.product_name}<br /><span className="text-xs text-slate-500">{row.product_code}</span></td>
                    <td className="p-3">{row.batch_number}</td>
                    <td className="p-3">{row.expiry_date}</td>
                    <td className="p-3">{row.branch_name}</td>
                    <td className="p-3">{row.warehouse_name}</td>
                    <td className="p-3">{row.storage_location_name}</td>
                    <td className="p-3">{row.unit_name}</td>
                    <td className="p-3 text-right font-mono">{Number(row.quantity)}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between p-3 text-sm text-slate-600">
              <span>Total: {total}</span>
              <div className="space-x-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Prev</button>
                <span>Page {page} / {Math.max(1, Math.ceil(total / limit))}</span>
                <button disabled={page >= Math.max(1, Math.ceil(total / limit))} onClick={() => setPage(page + 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StockOverviewPage;
