import { createBrowserRouter } from 'react-router-dom';

import MainLayout from '../layouts/MainLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';
import OrganizationPage from '../pages/OrganizationPage.jsx';
import BranchesPage from '../pages/BranchesPage.jsx';
import WarehousesPage from '../pages/WarehousesPage.jsx';
import StorageLocationsPage from '../pages/StorageLocationsPage.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import RolesPage from '../pages/RolesPage.jsx';
import PermissionsPage from '../pages/PermissionsPage.jsx';
import ProductsPage from '../pages/ProductsPage.jsx';
import ProductDetailPage from '../pages/ProductDetailPage.jsx';
import { MasterEntityPage, entityConfig } from '../pages/MasterEntityPage.jsx';
import StockOverviewPage from '../pages/StockOverviewPage.jsx';
import BatchesPage from '../pages/BatchesPage.jsx';
import StockMovementsPage from '../pages/StockMovementsPage.jsx';
import OpeningBalancePage from '../pages/OpeningBalancePage.jsx';
import SuppliersPage from '../pages/SuppliersPage.jsx';
import CustomersPage from '../pages/CustomersPage.jsx';
import PurchaseOrdersPage from '../pages/PurchaseOrdersPage.jsx';
import PurchaseOrderDetailPage from '../pages/PurchaseOrderDetailPage.jsx';
import GoodsReceiptsPage from '../pages/GoodsReceiptsPage.jsx';
import GoodsReceiptCreatePage from '../pages/GoodsReceiptCreatePage.jsx';
import GoodsReceiptDetailPage from '../pages/GoodsReceiptDetailPage.jsx';
import PosPage from '../pages/PosPage.jsx';
import SalesPage from '../pages/SalesPage.jsx';
import PatientsPage from '../pages/PatientsPage.jsx';
import PatientDetailPage from '../pages/PatientDetailPage.jsx';
import PrescribersPage from '../pages/PrescribersPage.jsx';
import PrescriptionsPage from '../pages/PrescriptionsPage.jsx';
import DispensingsPage from '../pages/DispensingsPage.jsx';
import DispensingCreatePage from '../pages/DispensingCreatePage.jsx';
import DispensingDetailPage from '../pages/DispensingDetailPage.jsx';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'pos', element: <PosPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'clinical/patients', element: <PatientsPage /> },
      { path: 'clinical/patients/:id', element: <PatientDetailPage /> },
      { path: 'clinical/prescribers', element: <PrescribersPage /> },
      { path: 'clinical/prescriptions', element: <PrescriptionsPage /> },
      { path: 'clinical/dispensings', element: <DispensingsPage /> },
      { path: 'clinical/dispensings/new', element: <DispensingCreatePage /> },
      { path: 'clinical/dispensings/:id', element: <DispensingDetailPage /> },
      { path: 'administration/organizations', element: <OrganizationPage /> },
      { path: 'administration/branches', element: <BranchesPage /> },
      { path: 'administration/warehouses', element: <WarehousesPage /> },
      { path: 'administration/storage-locations', element: <StorageLocationsPage /> },
      { path: 'administration/users', element: <UsersPage /> },
      { path: 'administration/roles', element: <RolesPage /> },
      { path: 'administration/permissions', element: <PermissionsPage /> },
      { path: 'master-data/products', element: <ProductsPage /> },
      { path: 'master-data/products/:id', element: <ProductDetailPage /> },
      { path: 'inventory/stock', element: <StockOverviewPage /> },
      { path: 'inventory/batches', element: <BatchesPage /> },
      { path: 'inventory/stock-movements', element: <StockMovementsPage /> },
      { path: 'inventory/opening-balance', element: <OpeningBalancePage /> },
      { path: 'partners/suppliers', element: <SuppliersPage /> },
      { path: 'partners/customers', element: <CustomersPage /> },
      { path: 'procurement/purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'procurement/purchase-orders/:id', element: <PurchaseOrderDetailPage /> },
      { path: 'procurement/goods-receipts', element: <GoodsReceiptsPage /> },
      { path: 'procurement/goods-receipts/new', element: <GoodsReceiptCreatePage /> },
      { path: 'procurement/goods-receipts/:id', element: <GoodsReceiptDetailPage /> },
      { path: 'master-data/brands', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'brands')} /> },
      { path: 'master-data/generics', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'generics')} /> },
      { path: 'master-data/dosage-forms', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'dosage-forms')} /> },
      { path: 'master-data/routes', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'routes')} /> },
      { path: 'master-data/categories', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'categories')} /> },
      { path: 'master-data/therapeutic-categories', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'therapeutic-categories')} /> },
      { path: 'master-data/manufacturers', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'manufacturers')} /> },
      { path: 'master-data/active-ingredients', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'active-ingredients')} /> },
      { path: 'master-data/units', element: <MasterEntityPage config={entityConfig.find((e) => e.routePath === 'units')} /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default router;
