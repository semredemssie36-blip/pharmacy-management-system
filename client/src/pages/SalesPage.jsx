import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { salesApi } from '../features/sales/api.js';
import { useCan } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function SalesPage() {
  const can = useCan();

  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Void Dialog
  const [selectedSaleForVoid, setSelectedSaleForVoid] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Receipt Modal
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await salesApi.list({
        page,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit: 15,
      });
      setSales(res.data?.items || res.data?.sales || []);
      setTotal(res.data?.total ?? res.data?.pagination?.total ?? 0);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load sales');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // Handle Void
  async function handleConfirmVoid() {
    if (!selectedSaleForVoid || !voidReason.trim()) {
      setErrorMessage('Please provide a valid void reason.');
      return;
    }

    setIsVoiding(true);
    setErrorMessage('');
    try {
      await salesApi.voidSale(selectedSaleForVoid.id, voidReason.trim());
      setSuccessMessage(`Sale ${selectedSaleForVoid.sale_number} was voided and stock was reversed.`);
      setSelectedSaleForVoid(null);
      setVoidReason('');
      loadSales();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to void sale');
    } finally {
      setIsVoiding(false);
    }
  }

  // Handle View Receipt
  async function handleViewReceipt(saleId) {
    setIsLoading(true);
    try {
      const res = await salesApi.getReceipt(saleId);
      setSelectedReceipt(res.data?.receipt);
      setShowReceiptModal(true);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load receipt');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Directory"
        description="Comprehensive audit of customer sales, status lifecycle, batch consumption, and receipts."
        action={
          can('sale.create') && (
            <Link
              to="/pos"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition inline-flex items-center gap-2"
            >
              <span>Open POS Terminal</span>
            </Link>
          )
        }
      />

      {/* Messages */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="font-bold">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="font-bold">✕</button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
          <input
            type="text"
            placeholder="Search by sale number or customer..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="sales-status-select" className="text-xs font-semibold text-slate-500 uppercase">Status:</label>
          <select
            id="sales-status-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="payment_pending">Payment Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading && sales.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading sales data...</div>
        ) : sales.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No sales found"
              description="No sales match your current search or filter criteria."
            />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Sale #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-medium text-slate-800">
                    {sale.sale_number}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {new Date(sale.sale_date).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {sale.branch_name}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {sale.customer_name || <span className="text-slate-400 italic">Walk-in Customer</span>}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                    ETB {Number(sale.total_amount).toFixed(2)}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={sale.status} />
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleViewReceipt(sale.id)}
                      className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition"
                    >
                      Receipt
                    </button>

                    {sale.status === 'completed' && can('sale.void') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSaleForVoid(sale);
                          setVoidReason('');
                        }}
                        className="px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded transition"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {total > 15 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {sales.length} of {total} records</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * 15 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Void Dialog */}
      {selectedSaleForVoid && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Void Completed Sale</h3>
            <p className="text-sm text-slate-600">
              Voiding sale <strong>{selectedSaleForVoid.sale_number}</strong> will atomically reverse the inventory deductions
              and record a compensating stock movement.
            </p>

            <div>
              <label htmlFor="sales-void-reason-input" className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Void Reason (Required):
              </label>
              <textarea
                id="sales-void-reason-input"
                rows={3}
                placeholder="Enter regulatory or operational reason for voiding..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full p-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedSaleForVoid(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVoiding || !voidReason.trim()}
                onClick={handleConfirmVoid}
                className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg disabled:opacity-50 transition"
              >
                {isVoiding ? 'Voiding...' : 'Confirm Void & Reverse Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col max-h-[90vh]">
            <div className="border-b border-dashed border-slate-300 pb-4 text-center">
              <h3 className="font-black text-xl text-slate-800 tracking-wide">ETHIOCODES PHARMACY</h3>
              <p className="text-xs text-slate-500 mt-1">{selectedReceipt.branch.name} • {selectedReceipt.branch.code}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">Receipt #{selectedReceipt.saleNumber}</p>
              <p className="text-xs text-slate-400">{new Date(selectedReceipt.saleDate).toLocaleString()}</p>
              <div className="mt-2">
                <StatusBadge status={selectedReceipt.status} />
              </div>
            </div>

            <div className="py-3 text-xs text-slate-600 border-b border-dashed border-slate-300 flex justify-between">
              <div><span>Cashier: <strong>{selectedReceipt.cashier.name}</strong></span></div>
              <div><span>Customer: <strong>{selectedReceipt.customer.name}</strong></span></div>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2 text-xs">
              {selectedReceipt.lines.map((line, idx) => (
                <div key={idx} className="border-b border-slate-100 pb-1.5">
                  <div className="flex justify-between font-medium text-slate-800">
                    <span>{line.productName}</span>
                    <span className="font-mono">ETB {line.lineTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>{line.quantity} {line.unitName} @ ETB {line.unitPrice.toFixed(2)}</span>
                    {line.discountAmount > 0 && <span className="text-emerald-600">Disc: -{line.discountAmount.toFixed(2)}</span>}
                  </div>
                  {line.batches?.length > 0 && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Batches: {line.batches.map((b) => `${b.batchNumber} (Exp: ${new Date(b.expiryDate).toLocaleDateString()})`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">ETB {selectedReceipt.subtotal.toFixed(2)}</span>
              </div>
              {selectedReceipt.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount:</span>
                  <span className="font-mono">- ETB {selectedReceipt.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL:</span>
                <span className="font-mono text-emerald-600">ETB {selectedReceipt.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm rounded-xl transition"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
