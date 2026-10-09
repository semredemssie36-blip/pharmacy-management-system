/**
 * StatusBadge component: Unified, accessible, color-coded badges for all ERP entities.
 */
export function StatusBadge({ status }) {
  if (!status) return null;

  const normalized = String(status).toLowerCase().trim();

  const styles = {
    // Goods receipt & PO statuses
    draft: 'bg-slate-100 text-slate-700 border-slate-300',
    receiving: 'bg-sky-50 text-sky-700 border-sky-300 animate-pulse',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    discrepancy: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-300',
    // PO specific
    submitted: 'bg-indigo-50 text-indigo-700 border-indigo-300',
    pending_approval: 'bg-amber-50 text-amber-700 border-amber-300',
    approved: 'bg-teal-50 text-teal-700 border-teal-300',
    rejected: 'bg-red-50 text-red-700 border-red-300',
    partially_received: 'bg-blue-50 text-blue-700 border-blue-300',
    fully_received: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    // Sales & POS statuses
    confirmed: 'bg-sky-50 text-sky-700 border-sky-300',
    payment_pending: 'bg-purple-50 text-purple-700 border-purple-300',
    voided: 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
    // Clinical & Prescription & Dispensing statuses
    pending: 'bg-amber-50 text-amber-700 border-amber-300',
    stock_allocated: 'bg-cyan-50 text-cyan-700 border-cyan-300 font-medium',
    pending_verification: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
    verified: 'bg-teal-50 text-teal-700 border-teal-300 font-semibold',
    validated: 'bg-teal-50 text-teal-700 border-teal-300 font-semibold',
    partially_dispensed: 'bg-blue-50 text-blue-700 border-blue-300',
    fully_dispensed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    refill_available: 'bg-indigo-50 text-indigo-700 border-indigo-300 font-medium',
    expired: 'bg-rose-50 text-rose-700 border-rose-300',
    // General active/inactive
    active: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    inactive: 'bg-slate-100 text-slate-500 border-slate-200',
    // Financial & Payment statuses
    paid: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
    partially_paid: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
    unpaid: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold',
    credit: 'bg-purple-50 text-purple-800 border-purple-300 font-semibold',
    failed: 'bg-red-50 text-red-800 border-red-300 font-semibold',
    refunded: 'bg-slate-100 text-slate-700 border-slate-300 font-semibold',
    partially_refunded: 'bg-orange-50 text-orange-700 border-orange-300 font-semibold',
    // Return & Disposition statuses
    pending_inspection: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
    quarantined: 'bg-yellow-50 text-yellow-800 border-yellow-300 font-semibold',
    damaged: 'bg-red-50 text-red-800 border-red-300 font-semibold',
    awaiting_disposal: 'bg-orange-50 text-orange-800 border-orange-300 font-semibold',
    disposed: 'bg-slate-200 text-slate-800 border-slate-400 font-semibold',
    return_to_stock: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
    // Stock Transfer statuses
    in_transit: 'bg-indigo-50 text-indigo-700 border-indigo-300 font-semibold',
    allocated: 'bg-teal-50 text-teal-700 border-teal-300',
    received: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
    // Stock count statuses
    in_progress: 'bg-sky-50 text-sky-700 border-sky-300 font-medium',
    partially_applied: 'bg-amber-50 text-amber-700 border-amber-300 font-medium',
  };

  const labels = {
    draft: 'Draft',
    in_progress: 'In Progress',
    partially_applied: 'Partially Applied',
    receiving: 'Receiving In-Progress',
    completed: 'Completed',
    discrepancy: 'Discrepancy Flagged',
    cancelled: 'Cancelled',
    confirmed: 'Confirmed',
    payment_pending: 'Payment Pending',
    voided: 'Voided',
    submitted: 'Submitted',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    partially_received: 'Partially Received',
    fully_received: 'Fully Received',
    pending: 'Pending',
    stock_allocated: 'Stock Allocated',
    pending_verification: 'Pending Pharmacist Verification',
    verified: 'Verified',
    validated: 'Validated',
    partially_dispensed: 'Partially Dispensed',
    fully_dispensed: 'Fully Dispensed',
    refill_available: 'Refill Available',
    expired: 'Expired',
    active: 'Active',
    inactive: 'Inactive',
    paid: 'Paid',
    partially_paid: 'Partially Paid',
    unpaid: 'Unpaid',
    credit: 'Credit',
    failed: 'Failed',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
    pending_inspection: 'Pending Inspection',
    quarantined: 'Quarantined',
    damaged: 'Damaged',
    awaiting_disposal: 'Awaiting Disposal',
    disposed: 'Disposed',
    return_to_stock: 'Return To Stock',
    in_transit: 'In Transit',
    allocated: 'Allocated',
    received: 'Received',
  };

  const styleClass = styles[normalized] || 'bg-slate-100 text-slate-700 border-slate-300';
  const labelText = labels[normalized] || status.replace(/_/g, ' ');

  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wider ${styleClass}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {labelText}
    </span>
  );
}

export default StatusBadge;
