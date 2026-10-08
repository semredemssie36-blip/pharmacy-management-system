import { useEffect, useState } from 'react';

import { stockMovementsApi } from '../features/inventory/api.js';

/** Read-only ledger of stock movements (authoritative history). */
function StockMovementsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [movementType, setMovementType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (movementType) params.movementType = movementType;
      const res = await stockMovementsApi.list(params);
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
    <div className="max-w-6xl">
      <h1 className="text-xl font-bold text-slate-900">Stock Movements</h1>
      <p className="mt-1 text-sm text-slate-500">Least-affected historical record of every physical stock change.</p>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-4 flex gap-2 items-end">
        <select value={movementType} onChange={(e) => setMovementType(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All types</option>
          <option value="opening_balance">Opening Balance</option>
          <option value="purchase_receipt">Purchase Receipt</option>
          <option value="sale">Sale</option>
          <option value="dispensing">Dispensing</option>
          <option value="transfer_in">Transfer In</option>
          <option value="transfer_out">Transfer Out</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <button onClick={() => { setPage(1); load(); }} className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      <div className="mt-4 bg-white rounded-lg shadow overflow-x-auto">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && <p className="p-5 text-slate-500">No movement records found.</p>}
        {!loading && items.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Batch</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium text-right">Delta</th>
                  <th className="p-3 font-medium">Reason</th>
                  <th className="p-3 font-medium">User</th>
                  <th className="p-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="p-3">{m.product_name}</td>
                    <td className="p-3 font-mono text-xs">{m.batch_number} · {m.expiry_date}</td>
                    <td className="p-3">{m.movement_type}</td>
                    <td className="p-3 text-right font-mono">{Number(m.quantity_delta)}</td>
                    <td className="p-3 text-xs">{m.reason || '—'}</td>
                    <td className="p-3 text-xs">{m.created_by_name}</td>
                    <td className="p-3 text-xs">{m.branch_name} / {m.warehouse_name} / {m.storage_location_name}</td>
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

export default StockMovementsPage;
