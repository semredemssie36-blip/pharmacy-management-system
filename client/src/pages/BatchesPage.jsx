import { useEffect, useState } from 'react';

import { batchesApi } from '../features/inventory/api.js';

/** Batch list — shows product/batch/expiry/visibility-fed quantity. */
function BatchesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      const res = await batchesApi.list(params);
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

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-bold text-slate-900">Batches</h1>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-4 flex gap-2 items-end">
        <input placeholder="Search product or batch number" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
        <button onClick={() => { setPage(1); load(); }} className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      <div className="mt-4 bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && <p className="p-5 text-slate-500">No batches found.</p>}
        {!loading && items.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Batch #</th>
                  <th className="p-3 font-medium">Expiry</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3">{b.product_name} <span className="text-xs text-slate-500">({b.product_code})</span></td>
                    <td className="p-3 font-mono text-xs">{b.batch_number}</td>
                    <td className="p-3">{b.expiry_date}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between p-3 text-sm text-slate-600">
              <span>Total: {total}</span>
              <div className="space-x-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Prev</button>
                <button disabled={page >= Math.max(1, Math.ceil(total / limit))} onClick={() => setPage(page + 1)} className="border border-slate-300 rounded px-3 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default BatchesPage;
