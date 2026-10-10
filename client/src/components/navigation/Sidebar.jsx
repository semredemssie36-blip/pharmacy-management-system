import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import {
  DashboardIcon,
  SalesIcon,
  PurchaseIcon,
  InventoryIcon,
  CustomersIcon,
  SuppliersIcon,
  AccountingIcon,
  ReportsIcon,
  MasterDataIcon,
  UserManagementIcon,
  SettingsIcon,
  ChevronDownIcon,
  PillCrossLogo,
  ClinicalIcon,
} from '../common/Icons.jsx';

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();

  // Role detection
  const roles = user?.roles?.map((r) => r.code || r.name) || [];
  const isAdmin = roles.includes('SYSTEM_ADMINISTRATOR') || roles.includes('System Administrator') || user?.permissions?.includes('*');
  const isManager = roles.includes('BRANCH_MANAGER') || roles.includes('Branch Manager');
  const isPharmacist = roles.includes('PHARMACIST') || roles.includes('Pharmacist');
  const isTech = roles.includes('PHARMACY_TECHNICIAN') || roles.includes('Pharmacy Technician');
  const isCashier = roles.includes('CASHIER') || roles.includes('Sales / Cashier');
  const isStorekeeper = roles.includes('STOREKEEPER') || roles.includes('Warehouse / Storekeeper');
  const isProcurement = roles.includes('PROCUREMENT_OFFICER') || roles.includes('Procurement Officer');
  const isFinance = roles.includes('FINANCE_USER') || roles.includes('Finance User');
  const isReporting = roles.includes('MANAGEMENT_REPORTING') || roles.includes('Management / Reporting User');

  const hasPerm = (p) => user?.permissions?.includes('*') || user?.permissions?.includes(p);

  // Accordion state - keep admin default true or if matched
  const [openSections, setOpenSections] = useState({
    sales: location.pathname.startsWith('/pos') || location.pathname.startsWith('/sales') || location.pathname.startsWith('/returns'),
    purchase: location.pathname.startsWith('/procurement'),
    inventory: location.pathname.startsWith('/inventory'),
    clinical: location.pathname.startsWith('/clinical'),
    finance: location.pathname.startsWith('/finance'),
    masterData: location.pathname.startsWith('/master-data'),
    admin: true,
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Check section visibility based on roles or granular permissions
  const canSeeSales = isAdmin || isManager || isCashier || isReporting || hasPerm('sale.view');
  const canSeePurchases = isAdmin || isManager || isProcurement || isStorekeeper || isReporting || hasPerm('purchase.view');
  const canSeeInventory = isAdmin || isManager || isStorekeeper || isPharmacist || isTech || isProcurement || isReporting || hasPerm('inventory.view');
  const canSeeClinical = isAdmin || isManager || isPharmacist || isTech || hasPerm('dispensing.view');
  const canSeeFinance = isAdmin || isManager || isFinance || isReporting || hasPerm('payment.view');
  const canSeeMasterData = isAdmin || isManager || isProcurement || isPharmacist || hasPerm('product.view');
  const canSeeAdmin = isAdmin || isManager || hasPerm('branch.view') || hasPerm('user.view') || hasPerm('role.view') || hasPerm('warehouse.view');
  const canSeeReports = isAdmin || isManager || isFinance || isReporting || hasPerm('report.sales.view');
  const canSeeCustomers = isAdmin || isManager || isCashier || isFinance;
  const canSeeSuppliers = isAdmin || isManager || isProcurement || isFinance;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors duration-150 select-none ${
      isActive
        ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
    }`;

  const subLinkClass = ({ isActive }) =>
    `block px-3 py-2 rounded-lg text-xs transition-colors duration-150 select-none ${
      isActive
        ? 'bg-blue-50 text-blue-600 font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
    }`;

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-40 w-64 h-screen shrink-0 bg-white border-r border-slate-200/90 flex flex-col overflow-hidden transition-transform duration-200 ease-in-out select-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 shrink-0 px-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PillCrossLogo className="w-8 h-8" />
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-900 text-base leading-none tracking-tight">Pharmacy</span>
            <span className="text-[11px] text-slate-500 font-medium tracking-tight mt-0.5">Management System</span>
          </div>
        </div>
        {/* Mobile close */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>

      {/* Navigation Scroll */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-4 space-y-1.5">
        {/* Dashboard (Home) */}
        <NavLink to="/dashboard" end className={linkClass}>
          <DashboardIcon className="w-5 h-5 text-current" />
          <span>Dashboard</span>
        </NavLink>

        {/* Clinical Care (Pharmacist & Tech focused) */}
        {canSeeClinical && (
          <div>
            <button
              onClick={() => toggleSection('clinical')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ClinicalIcon className="w-5 h-5 text-current" />
                <span>Clinical & Rx</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.clinical ? 'rotate-180' : ''}`} />
            </button>
            {openSections.clinical && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/clinical/prescriptions" className={subLinkClass}>Prescriptions</NavLink>
                <NavLink to="/clinical/dispensings" className={subLinkClass}>Dispensing Queue</NavLink>
                <NavLink to="/clinical/patients" className={subLinkClass}>Patients Registry</NavLink>
                <NavLink to="/clinical/prescribers" className={subLinkClass}>Prescribers / Doctors</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Sales & POS */}
        {canSeeSales && (
          <div>
            <button
              onClick={() => toggleSection('sales')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <SalesIcon className="w-5 h-5 text-current" />
                <span>Sales & POS</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.sales ? 'rotate-180' : ''}`} />
            </button>
            {openSections.sales && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/pos" className={subLinkClass}>Point of Sale (POS)</NavLink>
                <NavLink to="/sales" className={subLinkClass}>Sales History</NavLink>
                <NavLink to="/returns/customer" className={subLinkClass}>Customer Returns</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Purchase & Procurement */}
        {canSeePurchases && (
          <div>
            <button
              onClick={() => toggleSection('purchase')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <PurchaseIcon className="w-5 h-5 text-current" />
                <span>Purchases</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.purchase ? 'rotate-180' : ''}`} />
            </button>
            {openSections.purchase && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/procurement/purchase-orders" className={subLinkClass}>Purchase Orders</NavLink>
                <NavLink to="/procurement/goods-receipts" className={subLinkClass}>Goods Receiving</NavLink>
                <NavLink to="/returns/supplier" className={subLinkClass}>Supplier Returns</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Inventory */}
        {canSeeInventory && (
          <div>
            <button
              onClick={() => toggleSection('inventory')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <InventoryIcon className="w-5 h-5 text-current" />
                <span>Inventory</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.inventory ? 'rotate-180' : ''}`} />
            </button>
            {openSections.inventory && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/inventory/stock" className={subLinkClass}>Stock Overview</NavLink>
                <NavLink to="/inventory/batches" className={subLinkClass}>Batch Registry</NavLink>
                <NavLink to="/inventory/stock-counts" className={subLinkClass}>Counts & Audits</NavLink>
                <NavLink to="/inventory/transfers" className={subLinkClass}>Stock Transfers</NavLink>
                <NavLink to="/inventory/expiry" className={subLinkClass}>Expiry Management</NavLink>
                <NavLink to="/inventory/quarantines" className={subLinkClass}>Quarantine Holds</NavLink>
                <NavLink to="/inventory/recalls" className={subLinkClass}>Product Recalls</NavLink>
                <NavLink to="/inventory/stock-movements" className={subLinkClass}>Movement Ledger</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Customers */}
        {canSeeCustomers && (
          <NavLink to="/partners/customers" className={linkClass}>
            <CustomersIcon className="w-5 h-5 text-current" />
            <span>Customers</span>
          </NavLink>
        )}

        {/* Suppliers */}
        {canSeeSuppliers && (
          <NavLink to="/partners/suppliers" className={linkClass}>
            <SuppliersIcon className="w-5 h-5 text-current" />
            <span>Suppliers</span>
          </NavLink>
        )}

        {/* Accounting & Finance */}
        {canSeeFinance && (
          <div>
            <button
              onClick={() => toggleSection('finance')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AccountingIcon className="w-5 h-5 text-current" />
                <span>Accounting</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.finance ? 'rotate-180' : ''}`} />
            </button>
            {openSections.finance && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/finance/payments" className={subLinkClass}>Payments & Receipts</NavLink>
                <NavLink to="/finance/receivables" className={subLinkClass}>Accounts Receivable</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Reports & Analytics */}
        {canSeeReports && (
          <NavLink to="/reports" className={linkClass}>
            <ReportsIcon className="w-5 h-5 text-current" />
            <span>Reports & BI</span>
          </NavLink>
        )}

        {/* Master Data */}
        {canSeeMasterData && (
          <div>
            <button
              onClick={() => toggleSection('masterData')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MasterDataIcon className="w-5 h-5 text-current" />
                <span>Master Data</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.masterData ? 'rotate-180' : ''}`} />
            </button>
            {openSections.masterData && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                <NavLink to="/master-data/products" className={subLinkClass}>Products Catalog</NavLink>
                <NavLink to="/master-data/brands" className={subLinkClass}>Brands</NavLink>
                <NavLink to="/master-data/generics" className={subLinkClass}>Generics</NavLink>
                <NavLink to="/master-data/dosage-forms" className={subLinkClass}>Dosage Forms</NavLink>
                <NavLink to="/master-data/categories" className={subLinkClass}>Categories</NavLink>
                <NavLink to="/master-data/units" className={subLinkClass}>Units & Packaging</NavLink>
              </div>
            )}
          </div>
        )}

        {/* Administration / User Management */}
        {canSeeAdmin && (
          <div>
            <button
              onClick={() => toggleSection('admin')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <UserManagementIcon className="w-5 h-5 text-current" />
                <span>Administration</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 ${openSections.admin ? 'rotate-180' : ''}`} />
            </button>
            {openSections.admin && (
              <div className="ml-7 pl-3 border-l-2 border-slate-100 my-1 space-y-0.5">
                {(isAdmin || isManager || hasPerm('user.view')) && (
                  <NavLink to="/administration/users" className={subLinkClass}>Users</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('role.view')) && (
                  <NavLink to="/administration/roles" className={subLinkClass}>Roles</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('branch.view')) && (
                  <NavLink to="/administration/branches" className={subLinkClass}>Branches</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('warehouse.view')) && (
                  <NavLink to="/administration/warehouses" className={subLinkClass}>Warehouses</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('approval.view')) && (
                  <NavLink to="/approvals" className={subLinkClass}>Approvals</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('audit.view')) && (
                  <NavLink to="/administration/audit-logs" className={subLinkClass}>Audit Trail</NavLink>
                )}
                {(isAdmin || isManager || hasPerm('data.import.view')) && (
                  <NavLink to="/import-export" className={subLinkClass}>Data Import / Export</NavLink>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        <NavLink to="/notifications" className={linkClass}>
          <SettingsIcon className="w-5 h-5 text-current" />
          <span>System Alerts</span>
        </NavLink>
      </div>

      {/* Bottom Promo / Info Banner */}
      <div className="p-3.5 border-t border-slate-100 shrink-0">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 border border-blue-100/80 rounded-2xl p-3.5 text-center">
          <div className="w-8 h-8 mx-auto rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm mb-2 select-none">
            Rx
          </div>
          <h4 className="text-xs font-bold text-slate-900">Pharmacy ERP</h4>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            Smart. Secure. Efficient. All-in-One Solution
          </p>
        </div>
      </div>
    </aside>
  );
}
