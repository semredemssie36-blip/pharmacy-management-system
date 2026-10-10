import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthContext.jsx';
import { Can } from '../features/auth/Can.jsx';

/**
 * Application shell: sidebar + top navigation placeholder.
 * Business navigation items will be added in later tasks once
 * permissions and branches exist.
 */
function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-slate-200 p-4">
        <h2 className="text-lg font-bold text-white">Pharmacy ERP</h2>
        <nav className="mt-6 space-y-1">
          <Link to="/" className="block rounded px-3 py-2 hover:bg-slate-800">
            System Status
          </Link>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Sales & POS
          </p>
          <Can permission="sale.create">
            <Link to="/pos" className="block rounded px-3 py-2 hover:bg-slate-800">
              Point of Sale (POS)
            </Link>
          </Can>
          <Can permission="sale.view">
            <Link to="/sales" className="block rounded px-3 py-2 hover:bg-slate-800">
              Sales History
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Returns & Dispositions
          </p>
          <Can permission="customer_return.view">
            <Link to="/returns/customer" className="block rounded px-3 py-2 hover:bg-slate-800">
              Customer Returns
            </Link>
          </Can>
          <Can permission="supplier_return.view">
            <Link to="/returns/supplier" className="block rounded px-3 py-2 hover:bg-slate-800">
              Supplier Returns
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Finance & Payments
          </p>
          <Can permission="payment.view">
            <Link to="/finance/payments" className="block rounded px-3 py-2 hover:bg-slate-800">
              Payments & Settlements
            </Link>
          </Can>
          <Can permission="receivable.view">
            <Link to="/finance/receivables" className="block rounded px-3 py-2 hover:bg-slate-800">
              Accounts Receivable
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Clinical Care
          </p>
          <Can permission="patient.view">
            <Link to="/clinical/patients" className="block rounded px-3 py-2 hover:bg-slate-800">
              Patients
            </Link>
          </Can>
          <Can permission="prescriber.view">
            <Link to="/clinical/prescribers" className="block rounded px-3 py-2 hover:bg-slate-800">
              Prescribers / Doctors
            </Link>
          </Can>
          <Can permission="prescription.view">
            <Link to="/clinical/prescriptions" className="block rounded px-3 py-2 hover:bg-slate-800">
              Prescriptions
            </Link>
          </Can>
          <Can permission="dispensing.view">
            <Link to="/clinical/dispensings" className="block rounded px-3 py-2 hover:bg-slate-800">
              Dispensings
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Organization
          </p>
          <Can permission="organization.view">
            <Link to="/administration/organizations" className="block rounded px-3 py-2 hover:bg-slate-800">
              Organizations
            </Link>
          </Can>
          <Can permission="branch.view">
            <Link to="/administration/branches" className="block rounded px-3 py-2 hover:bg-slate-800">
              Branches
            </Link>
          </Can>
          <Can permission="warehouse.view">
            <Link to="/administration/warehouses" className="block rounded px-3 py-2 hover:bg-slate-800">
              Warehouses
            </Link>
          </Can>
          <Can permission="storage_location.view">
            <Link to="/administration/storage-locations" className="block rounded px-3 py-2 hover:bg-slate-800">
              Storage Locations
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Administration
          </p>
          <Can permission="user.view">
            <Link to="/administration/users" className="block rounded px-3 py-2 hover:bg-slate-800">
              Users
            </Link>
          </Can>
          <Can permission="role.view">
            <Link to="/administration/roles" className="block rounded px-3 py-2 hover:bg-slate-800">
              Roles
            </Link>
          </Can>
          <Can permission="permission.view">
            <Link to="/administration/permissions" className="block rounded px-3 py-2 hover:bg-slate-800">
              Permissions
            </Link>
          </Can>
          <Can permission="audit.view">
            <Link to="/administration/audit-logs" className="block rounded px-3 py-2 hover:bg-slate-800">
              Audit Logs
            </Link>
          </Can>
          <Can permission="approval.view">
            <Link to="/approvals" className="block rounded px-3 py-2 hover:bg-slate-800">
              Approvals & Overrides
            </Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Master Data
          </p>
          <Can permission="product.view">
            <Link to="/master-data/products" className="block rounded px-3 py-2 hover:bg-slate-800">Products</Link>
          </Can>
          <Can permission="brand.view">
            <Link to="/master-data/brands" className="block rounded px-3 py-2 hover:bg-slate-800">Brands</Link>
          </Can>
          <Can permission="generic.view">
            <Link to="/master-data/generics" className="block rounded px-3 py-2 hover:bg-slate-800">Generics</Link>
          </Can>
          <Can permission="dosage_form.view">
            <Link to="/master-data/dosage-forms" className="block rounded px-3 py-2 hover:bg-slate-800">Dosage Forms</Link>
          </Can>
          <Can permission="route.view">
            <Link to="/master-data/routes" className="block rounded px-3 py-2 hover:bg-slate-800">Routes</Link>
          </Can>
          <Can permission="category.view">
            <Link to="/master-data/categories" className="block rounded px-3 py-2 hover:bg-slate-800">Categories</Link>
          </Can>
          <Can permission="therapeutic_category.view">
            <Link to="/master-data/therapeutic-categories" className="block rounded px-3 py-2 hover:bg-slate-800">Therapeutic Categories</Link>
          </Can>
          <Can permission="manufacturer.view">
            <Link to="/master-data/manufacturers" className="block rounded px-3 py-2 hover:bg-slate-800">Manufacturers</Link>
          </Can>
          <Can permission="active_ingredient.view">
            <Link to="/master-data/active-ingredients" className="block rounded px-3 py-2 hover:bg-slate-800">Active Ingredients</Link>
          </Can>
          <Can permission="unit.view">
            <Link to="/master-data/units" className="block rounded px-3 py-2 hover:bg-slate-800">Units</Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Inventory
          </p>
          <Can permission="inventory.view">
            <Link to="/inventory/stock" className="block rounded px-3 py-2 hover:bg-slate-800">Stock Overview</Link>
          </Can>
          <Can permission="stock_transfer.view">
            <Link to="/inventory/transfers" className="block rounded px-3 py-2 hover:bg-slate-800">Stock Transfers</Link>
          </Can>
          <Can permission="stock_count.view">
            <Link to="/inventory/stock-counts" className="block rounded px-3 py-2 hover:bg-slate-800">Stock Counts & Adjustments</Link>
          </Can>
          <Can permission="batch.view">
            <Link to="/inventory/batches" className="block rounded px-3 py-2 hover:bg-slate-800">Batches</Link>
          </Can>
          <Can permission="stock_movement.view">
            <Link to="/inventory/stock-movements" className="block rounded px-3 py-2 hover:bg-slate-800">Stock Movements</Link>
          </Can>
          <Can permission="expiry.view">
            <Link to="/inventory/expiry" className="block rounded px-3 py-2 hover:bg-slate-800">Expiry Management</Link>
          </Can>
          <Can permission="quarantine.view">
            <Link to="/inventory/quarantines" className="block rounded px-3 py-2 hover:bg-slate-800">Quarantine Holds</Link>
          </Can>
          <Can permission="recall.view">
            <Link to="/inventory/recalls" className="block rounded px-3 py-2 hover:bg-slate-800">Product Recalls</Link>
          </Can>
          <Can permission="inventory.create">
            <Link to="/inventory/opening-balance" className="block rounded px-3 py-2 hover:bg-slate-800">Opening Balance</Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Partners
          </p>
          <Can permission="supplier.view">
            <Link to="/partners/suppliers" className="block rounded px-3 py-2 hover:bg-slate-800">Suppliers</Link>
          </Can>
          <Can permission="customer.view">
            <Link to="/partners/customers" className="block rounded px-3 py-2 hover:bg-slate-800">Customers</Link>
          </Can>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500">
            Procurement
          </p>
          <Can permission="purchase_order.view">
            <Link to="/procurement/purchase-orders" className="block rounded px-3 py-2 hover:bg-slate-800">Purchase Orders</Link>
          </Can>
          <Can permission="goods_receipt.view">
            <Link to="/procurement/goods-receipts" className="block rounded px-3 py-2 hover:bg-slate-800">Goods Receiving</Link>
          </Can>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <span className="font-medium text-slate-700">EthioCodes Pharmacy ERP</span>
          <div className="flex items-center gap-4">
            {user && <span className="text-sm text-slate-600">{user.name}</span>}
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-3 py-1"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
