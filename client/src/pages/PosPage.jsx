import { useState, useEffect, useRef } from 'react';
import { salesApi } from '../features/sales/api.js';
import { paymentsApi, receivablesApi } from '../features/finance/api.js';
import { branchesApi } from '../features/organizations/api.js';
import { customersApi } from '../features/partners/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

export default function PosPage() {
  const { user } = useAuth();

  // Branch & Warehouse selection
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Cart state
  const [cartItems, setCartItems] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [activeSale, setActiveSale] = useState(null); // active sale from backend if saved

  // Product Search & Barcode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Receipt Modal
  const [receiptData, setReceiptData] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Task 13: Payment & Settlement Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState('immediate'); // 'immediate' | 'credit'
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'bank_transfer' | 'mobile_money'
  const [paymentAmountPaid, setPaymentAmountPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [creditOverrideReason, setCreditOverrideReason] = useState('');
  const [customerCreditSummary, setCustomerCreditSummary] = useState(null);
  const [loadingCreditSummary, setLoadingCreditSummary] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Fetch branches and customers on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [bRes, cRes] = await Promise.all([
          branchesApi.list({ status: 'active' }),
          customersApi.list({ status: 'active' }),
        ]);
        const branchList = bRes.data?.branches || bRes.data?.items || bRes.data || [];
        setBranches(branchList);
        if (branchList.length > 0) {
          setSelectedBranchId(String(branchList[0].id));
        }
        const custList = cRes.data?.customers || cRes.data?.items || cRes.data || [];
        setCustomers(custList);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to load POS reference data');
      }
    }
    loadInitialData();
  }, []);

  // Real-time product search
  useEffect(() => {
    if (!searchQuery.trim() || !selectedBranchId) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await salesApi.searchPosProducts({
          q: searchQuery.trim(),
          branchId: selectedBranchId,
        });
        const items = res.data?.products || [];
        setSearchResults(items);

        // If exact barcode match and barcode scanner input
        if (items.length === 1 && items[0].isExactBarcode) {
          addToCart(items[0]);
          setSearchQuery('');
          setSearchResults([]);
        }
      } catch (err) {
        console.error('POS product search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedBranchId]);

  // Add product to cart
  function addToCart(product) {
    if (product.availableQuantity <= 0) {
      setErrorMessage(`Cannot add ${product.name}: product is out of stock.`);
      return;
    }

    setErrorMessage('');
    setCartItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const item = prev[existingIdx];
        const nextQty = item.quantity + 1;
        if (nextQty > product.availableQuantity) {
          setErrorMessage(`Cannot add more: only ${product.availableQuantity} available in stock.`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = {
          ...item,
          quantity: nextQty,
          lineTotal: Math.max(0, nextQty * item.unitPrice - item.discountAmount),
        };
        return updated;
      }

      const defaultUnit = product.units?.find((u) => u.is_selling_unit) || product.units?.[0] || { unit_id: 1, name: 'Unit' };
      const unitPrice = Number(product.selling_price) || 0;

      return [
        ...prev,
        {
          product,
          unitId: defaultUnit.unit_id,
          unitName: defaultUnit.name || 'Unit',
          quantity: 1,
          unitPrice,
          discountAmount: 0,
          lineTotal: unitPrice,
        },
      ];
    });

    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  }

  // Update item quantity
  function updateQuantity(index, newQty) {
    const qty = Number(newQty);
    if (qty <= 0) {
      removeFromCart(index);
      return;
    }

    setCartItems((prev) => {
      const item = prev[index];
      if (qty > item.product.availableQuantity) {
        setErrorMessage(`Quantity exceeds available stock (${item.product.availableQuantity})`);
        return prev;
      }
      setErrorMessage('');
      const updated = [...prev];
      updated[index] = {
        ...item,
        quantity: qty,
        lineTotal: Math.max(0, qty * item.unitPrice - item.discountAmount),
      };
      return updated;
    });
  }

  // Update line discount
  function updateLineDiscount(index, discount) {
    const disc = Math.max(0, Number(discount) || 0);
    setCartItems((prev) => {
      const item = prev[index];
      const subtotal = item.quantity * item.unitPrice;
      const validDisc = Math.min(disc, subtotal);
      const updated = [...prev];
      updated[index] = {
        ...item,
        discountAmount: validDisc,
        lineTotal: subtotal - validDisc,
      };
      return updated;
    });
  }

  // Remove from cart
  function removeFromCart(index) {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Clear cart
  function resetPos() {
    setCartItems([]);
    setDiscountAmount(0);
    setSaleNotes('');
    setActiveSale(null);
    setErrorMessage('');
    setSuccessMessage('');
    searchInputRef.current?.focus();
  }

  // Computed totals
  const subtotal = cartItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const totalLineDiscounts = cartItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const overallDiscount = totalLineDiscounts + Number(discountAmount || 0);
  const finalTotal = Math.max(0, subtotal - overallDiscount);
  const discountPercent = subtotal > 0 ? (overallDiscount / subtotal) * 100 : 0;
  const isHighDiscount = discountPercent > 15;

  // Handle Save / Hold Draft
  async function handleSaveDraft() {
    if (cartItems.length === 0) {
      setErrorMessage('Cart is empty. Add at least one product.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const payload = {
        organizationId: user.organization_id || 1,
        branchId: Number(selectedBranchId),
        customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
        discountAmount: Number(discountAmount || 0),
        notes: saleNotes,
        lines: cartItems.map((item) => ({
          productId: item.product.id,
          unitId: item.unitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
      };

      let res;
      if (activeSale && activeSale.status === 'draft') {
        res = await salesApi.update(activeSale.id, payload);
      } else {
        res = await salesApi.create(payload);
      }

      const savedSale = res.data?.sale;
      setActiveSale(savedSale);
      setSuccessMessage(`Draft sale ${savedSale.sale_number} saved.`);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save draft sale');
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Move to Payment Pending
  async function handlePaymentPending() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      let currentSale = activeSale;
      if (!currentSale || currentSale.status === 'draft') {
        // Create/update first
        const payload = {
          organizationId: user.organization_id || 1,
          branchId: Number(selectedBranchId),
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          discountAmount: Number(discountAmount || 0),
          notes: saleNotes,
          lines: cartItems.map((item) => ({
            productId: item.product.id,
            unitId: item.unitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
          })),
        };
        const res = currentSale ? await salesApi.update(currentSale.id, payload) : await salesApi.create(payload);
        currentSale = res.data?.sale;
        // Confirm first if required by transition
        const confRes = await salesApi.confirm(currentSale.id);
        currentSale = confRes.data?.sale;
      }

      const pendingRes = await salesApi.paymentPending(currentSale.id);
      setActiveSale(pendingRes.data?.sale);
      setSuccessMessage(`Sale ${pendingRes.data?.sale.sale_number} is now Payment Pending.`);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to move sale to payment pending');
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Complete Sale (Instant Direct Checkout)
  async function handleCompleteSale() {
    if (cartItems.length === 0) {
      setErrorMessage('Cart is empty. Add at least one product.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      let currentSale = activeSale;
      if (!currentSale || currentSale.status === 'draft') {
        const payload = {
          organizationId: user.organization_id || 1,
          branchId: Number(selectedBranchId),
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          discountAmount: Number(discountAmount || 0),
          notes: saleNotes,
          lines: cartItems.map((item) => ({
            productId: item.product.id,
            unitId: item.unitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
          })),
        };
        const res = currentSale ? await salesApi.update(currentSale.id, payload) : await salesApi.create(payload);
        currentSale = res.data?.sale;
        const confRes = await salesApi.confirm(currentSale.id);
        currentSale = confRes.data?.sale;
      }

      // Complete sale atomically with inventory deduction
      const compRes = await salesApi.complete(currentSale.id);
      const completedSale = compRes.data?.sale;
      setActiveSale(completedSale);

      // Load receipt data
      const receiptRes = await salesApi.getReceipt(completedSale.id);
      setReceiptData(receiptRes.data?.receipt);
      setShowReceiptModal(true);
      setSuccessMessage(`Sale ${completedSale.sale_number} completed successfully!`);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to complete sale');
    } finally {
      setIsLoading(false);
    }
  }

  // Open Task 13 Checkout / Payment Modal
  async function openCheckoutModal() {
    if (cartItems.length === 0) {
      setErrorMessage('Cart is empty. Add at least one product.');
      return;
    }
    setCheckoutError('');
    setPaymentAmountPaid(finalTotal.toFixed(2));
    setPaymentMode('immediate');
    setPaymentMethod('cash');
    setCreditDueDate('');
    setCreditOverrideReason('');
    setShowCheckoutModal(true);

    if (selectedCustomerId) {
      setLoadingCreditSummary(true);
      try {
        const res = await receivablesApi.getCustomerSummary(selectedCustomerId);
        setCustomerCreditSummary(res.data?.summary);
      } catch (err) {
        console.warn('Could not load credit summary:', err);
        setCustomerCreditSummary(null);
      } finally {
        setLoadingCreditSummary(false);
      }
    } else {
      setCustomerCreditSummary(null);
    }
  }

  // Handle Execute Checkout with Payment or Customer Credit
  async function handleExecuteCheckout(e) {
    if (e) e.preventDefault();
    setIsLoading(true);
    setCheckoutError('');
    try {
      let currentSale = activeSale;
      if (!currentSale || currentSale.status === 'draft') {
        const payload = {
          organizationId: user.organization_id || 1,
          branchId: Number(selectedBranchId),
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          discountAmount: Number(discountAmount || 0),
          notes: saleNotes,
          lines: cartItems.map((item) => ({
            productId: item.product.id,
            unitId: item.unitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
          })),
        };
        const res = currentSale ? await salesApi.update(currentSale.id, payload) : await salesApi.create(payload);
        currentSale = res.data?.sale;
        const confRes = await salesApi.confirm(currentSale.id);
        currentSale = confRes.data?.sale;
      }

      if (paymentMode === 'immediate') {
        const paidAmount = parseFloat(paymentAmountPaid);
        if (isNaN(paidAmount) || paidAmount <= 0) {
          throw new Error('Please enter a valid payment amount greater than 0.');
        }

        const payRes = await paymentsApi.create({
          referenceType: 'sale',
          referenceId: currentSale.id,
          amount: paidAmount,
          paymentMethod: paymentMethod,
          notes: saleNotes || undefined,
        });

        // The sale is now completed atomically by paymentService
        const completedSaleRes = await salesApi.get(currentSale.id);
        setActiveSale(completedSaleRes.data?.sale);

        // Load receipt data
        const receiptRes = await salesApi.getReceipt(currentSale.id);
        setReceiptData(receiptRes.data?.receipt);
        setShowCheckoutModal(false);
        setShowReceiptModal(true);
        setSuccessMessage(`Sale ${currentSale.sale_number} completed and payment recorded!`);
      } else {
        // Customer Credit Sale
        if (!selectedCustomerId) {
          throw new Error('Customer credit sales require a registered customer.');
        }

        await receivablesApi.creditSale({
          saleId: currentSale.id,
          customerId: Number(selectedCustomerId),
          dueDate: creditDueDate || undefined,
          overrideReason: creditOverrideReason.trim() || undefined,
          notes: saleNotes || undefined,
        });

        const completedSaleRes = await salesApi.get(currentSale.id);
        setActiveSale(completedSaleRes.data?.sale);

        const receiptRes = await salesApi.getReceipt(currentSale.id);
        setReceiptData(receiptRes.data?.receipt);
        setShowCheckoutModal(false);
        setShowReceiptModal(true);
        setSuccessMessage(`Credit sale ${currentSale.sale_number} recorded in Accounts Receivable!`);
      }
    } catch (err) {
      setCheckoutError(err?.response?.data?.error?.message || err.message || 'Failed to complete checkout');
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Cancel
  async function handleCancelSale() {
    if (!activeSale) {
      resetPos();
      setShowCancelDialog(false);
      return;
    }

    setIsLoading(true);
    try {
      await salesApi.cancel(activeSale.id, 'Cancelled by cashier');
      setSuccessMessage(`Sale ${activeSale.sale_number} cancelled.`);
      resetPos();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to cancel sale');
    } finally {
      setIsLoading(false);
      setShowCancelDialog(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
      {/* Top Bar: Branch Selector, Status, Reset */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 font-bold text-lg">
            POS
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Pharmacy Point of Sale</h1>
            <p className="text-xs text-slate-500">Fast barcode lookup, FEFO batch allocation & receipt</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="pos-branch-select" className="text-xs font-medium text-slate-600">Branch:</label>
            <select
              id="pos-branch-select"
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                resetPos();
              }}
              className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          {activeSale && (
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 font-mono">{activeSale.sale_number}</span>
              <StatusBadge status={activeSale.status} />
            </div>
          )}

          <button
            onClick={resetPos}
            type="button"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            New Sale (Esc)
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-rose-500 font-bold hover:text-rose-800">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-500 font-bold hover:text-emerald-800">✕</button>
        </div>
      )}

      {/* Main 2-Column POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden">
        {/* Left Column: Product Search & Cart Lines (col-span-8) */}
        <div className="lg:col-span-8 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Barcode & Search Input Area */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 relative">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Scan barcode or type medicine name / SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    addToCart(searchResults[0]);
                  }
                }}
                className="w-full pl-10 pr-4 py-3 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                autoFocus
              />
              <svg className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isSearching && (
                <span className="absolute right-3.5 top-3.5 text-xs text-slate-400 animate-pulse">Searching...</span>
              )}
            </div>

            {/* Instant search results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-4 right-4 top-[4.5rem] bg-white border border-slate-300 rounded-xl shadow-xl z-20 max-h-72 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((item) => {
                  const isOutOfStock = item.availableQuantity <= 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (isOutOfStock) {
                          setErrorMessage(`Cannot add "${item.name}": item is out of stock.`);
                        } else {
                          addToCart(item);
                        }
                      }}
                      className={`p-3 flex items-center justify-between cursor-pointer transition ${
                        isOutOfStock ? 'opacity-50 bg-slate-50 cursor-not-allowed' : 'hover:bg-emerald-50/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-sm">{item.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{item.code}</span>
                          {item.prescription_classification === 'prescription' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">Rx</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.generic_name && <span>{item.generic_name} • </span>}
                          {item.dosage_form_name && <span>{item.dosage_form_name} • </span>}
                          <span>Barcode: {item.barcode || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-emerald-600 text-sm">ETB {Number(item.selling_price).toFixed(2)}</div>
                        <div className="text-xs">
                          {isOutOfStock ? (
                            <span className="text-rose-600 font-semibold">Out of Stock</span>
                          ) : (
                            <span className="text-slate-600">Stock: <strong className="text-emerald-700">{item.availableQuantity}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Table Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <EmptyState
                  title="Cart is empty"
                  description="Scan a medicine barcode with your scanner or search by name above to begin."
                />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2 px-3">Medicine</th>
                    <th className="py-2 px-3 w-36">Quantity</th>
                    <th className="py-2 px-3 w-28 text-right">Unit Price</th>
                    <th className="py-2 px-3 w-28 text-right">Discount</th>
                    <th className="py-2 px-3 w-28 text-right">Total</th>
                    <th className="py-2 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {cartItems.map((item, idx) => (
                    <tr key={item.product.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800">{item.product.name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span>{item.product.code}</span>
                          <span className="text-emerald-600">Avail: {item.product.availableQuantity}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, item.quantity - 1)}
                            className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.product.availableQuantity}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(idx, e.target.value)}
                            className="w-14 text-center py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, item.quantity + 1)}
                            className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        {item.unitPrice.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.discountAmount}
                          onChange={(e) => updateLineDiscount(idx, e.target.value)}
                          className="w-20 text-right py-1 px-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                        {item.lineTotal.toFixed(2)}
                      </td>

                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(idx)}
                          className="text-slate-400 hover:text-rose-600 text-base"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Customer & Checkout Summary (col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Customer Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <label htmlFor="pos-customer-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Customer
            </label>
            <select
              id="pos-customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Walk-in Customer (Anonymous)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.telephone ? `(${c.telephone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sale Notes Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <label htmlFor="pos-notes-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Sale Notes / Dispense Remarks
            </label>
            <input
              id="pos-notes-input"
              type="text"
              placeholder="Optional sale notes..."
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Totals & Payment Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
                Order Summary
              </h2>

              <div className="flex justify-between text-sm text-slate-600">
                <span>Items Count:</span>
                <span className="font-semibold text-slate-800">{cartItems.reduce((acc, i) => acc + i.quantity, 0)} units</span>
              </div>

              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">ETB {subtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span>Order Discount:</span>
                  {isHighDiscount && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold" title=">15% requires manager authorization">
                      Manager Auth
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">ETB</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 text-right py-1 px-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              {overallDiscount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600 font-medium">
                  <span>Total Discount Applied:</span>
                  <span>- ETB {overallDiscount.toFixed(2)} ({discountPercent.toFixed(1)}%)</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="text-base font-bold text-slate-900">Total Payable:</span>
                <span className="text-2xl font-black text-emerald-600 font-mono">
                  ETB {finalTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* POS Primary Action Buttons */}
            <div className="space-y-2 pt-4">
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={isLoading || cartItems.length === 0}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-base"
              >
                <span>Complete Sale & Dispense</span>
              </button>

              <button
                type="button"
                onClick={openCheckoutModal}
                disabled={isLoading || cartItems.length === 0}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow transition flex items-center justify-center gap-2 text-sm"
              >
                <span>Payment & Customer Credit</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isLoading || cartItems.length === 0}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition"
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  onClick={handlePaymentPending}
                  disabled={isLoading || cartItems.length === 0}
                  className="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-medium text-xs rounded-lg transition"
                >
                  Pending Payment
                </button>
              </div>

              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(true)}
                  className="w-full py-1.5 text-xs text-rose-600 hover:text-rose-800 font-medium"
                >
                  Cancel Sale
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Cancel */}
      {showCancelDialog && (
        <ConfirmationDialog
          isOpen={showCancelDialog}
          title="Cancel Sale"
          message="Are you sure you want to cancel the current sale? All cart items will be cleared."
          confirmLabel="Cancel Sale"
          onConfirm={handleCancelSale}
          onCancel={() => setShowCancelDialog(false)}
        />
      )}

      {/* Task 13: Checkout Payment & Settlement Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Payment & Settlement</h3>
                <p className="text-xs text-slate-500">
                  Select payment method or authorized customer credit.
                </p>
              </div>
              <button
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {/* Total Payable Banner */}
            <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Total Payable Amount:</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">
                {finalTotal.toFixed(2)} ETB
              </span>
            </div>

            {checkoutError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs">
                {checkoutError}
              </div>
            )}

            {/* Settlement Type Selector */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPaymentMode('immediate')}
                className={`py-2 text-xs font-bold rounded-md transition ${
                  paymentMode === 'immediate'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Immediate Payment
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('credit')}
                className={`py-2 text-xs font-bold rounded-md transition ${
                  paymentMode === 'credit'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Customer Credit (A/R)
              </button>
            </div>

            {/* Mode 1: Immediate Payment Form */}
            {paymentMode === 'immediate' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Debit / Credit Card</option>
                    <option value="bank_transfer">Bank Transfer (Manual)</option>
                    <option value="mobile_money">Mobile Money (Telebirr / CBEBirr)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Tendered / Paid (ETB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmountPaid}
                    onChange={(e) => setPaymentAmountPaid(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                  {Number(paymentAmountPaid) < finalTotal && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Partial payment: {finalTotal - Number(paymentAmountPaid)} ETB will remain outstanding.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Mode 2: Customer Credit Form */}
            {paymentMode === 'credit' && (
              <div className="space-y-3">
                {!selectedCustomerId ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <strong>Notice:</strong> Customer credit requires selecting a registered customer from
                    the Customer dropdown on the POS sidebar. Walk-in credit is not permitted.
                  </div>
                ) : (
                  <>
                    {/* Customer Credit Profile Status */}
                    {loadingCreditSummary ? (
                      <div className="text-xs text-slate-400">Loading customer credit summary...</div>
                    ) : customerCreditSummary ? (
                      <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-lg text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Credit Limit:</span>
                          <span className="font-semibold text-slate-800">
                            {customerCreditSummary.creditLimit.toFixed(2)} ETB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Current Outstanding:</span>
                          <span className="font-semibold text-rose-600">
                            {customerCreditSummary.currentBalance.toFixed(2)} ETB
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-purple-200">
                          <span className="font-bold text-slate-700">Available Credit:</span>
                          <span
                            className={`font-black ${
                              customerCreditSummary.availableCredit >= finalTotal
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {customerCreditSummary.availableCredit.toFixed(2)} ETB
                          </span>
                        </div>

                        {finalTotal > customerCreditSummary.availableCredit && (
                          <div className="pt-1 text-[11px] text-rose-600 font-medium">
                            Warning: Sale total exceeds customer available credit limit! Manager override
                            authorization is required.
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment Due Date (Optional)
                      </label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    {customerCreditSummary &&
                      finalTotal > customerCreditSummary.availableCredit && (
                        <div>
                          <label className="block text-xs font-semibold text-rose-700 mb-1">
                            Credit Override Reason (Requires credit_sale.authorize permission)
                          </label>
                          <textarea
                            rows="2"
                            value={creditOverrideReason}
                            onChange={(e) => setCreditOverrideReason(e.target.value)}
                            placeholder="Reason for authorizing credit limit excess..."
                            className="w-full border border-rose-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                            required
                          />
                        </div>
                      )}
                  </>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              >
                Back to POS
              </button>
              <button
                type="button"
                onClick={handleExecuteCheckout}
                disabled={isLoading || (paymentMode === 'credit' && !selectedCustomerId)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow transition"
              >
                {isLoading ? 'Processing...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Itemized Receipt Modal */}
      {showReceiptModal && receiptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 flex flex-col max-h-[90vh]">
            <div className="border-b border-dashed border-slate-300 pb-4 text-center">
              <h3 className="font-black text-xl text-slate-800 tracking-wide">ETHIOCODES PHARMACY</h3>
              <p className="text-xs text-slate-500 mt-1">{receiptData.branch.name} • {receiptData.branch.code}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">Receipt #{receiptData.saleNumber}</p>
              <p className="text-xs text-slate-400">{new Date(receiptData.saleDate).toLocaleString()}</p>
            </div>

            <div className="py-3 text-xs text-slate-600 border-b border-dashed border-slate-300 flex justify-between">
              <div>
                <span>Cashier: <strong>{receiptData.cashier.name}</strong></span>
              </div>
              <div>
                <span>Customer: <strong>{receiptData.customer.name}</strong></span>
              </div>
            </div>

            {/* Receipt Line Items */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2 text-xs">
              {receiptData.lines.map((line, idx) => (
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

            {/* Receipt Totals */}
            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">ETB {receiptData.subtotal.toFixed(2)}</span>
              </div>
              {receiptData.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount:</span>
                  <span className="font-mono">- ETB {receiptData.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL PAID:</span>
                <span className="font-mono text-emerald-600">ETB {receiptData.totalAmount.toFixed(2)}</span>
              </div>
              <div className="text-center pt-3 text-[11px] text-slate-400">
                Thank you for your visit. Keep receipt for returns/warranty.
              </div>
            </div>

            {/* Close / Print actions */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReceiptModal(false);
                  resetPos();
                }}
                className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition"
              >
                Done / Next Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
