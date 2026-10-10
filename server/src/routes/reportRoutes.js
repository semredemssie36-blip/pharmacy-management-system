/**
 * Task 21 — Reports and Dashboards Routes
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 *
 * All endpoints are strictly read-only and enforce granular RBAC permissions.
 */
import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import reportController from '../controllers/reportController.js';

const router = Router();

router.use(authenticate);

// 1. Dashboard summary KPIs
router.get(
  '/reports/dashboard',
  requirePermission('report.dashboard.view'),
  reportController.getDashboardSummary,
);

// 2. Sales and revenue performance reports
router.get(
  '/reports/sales',
  requirePermission('report.sales.view'),
  reportController.getSalesReport,
);

// 3. Inventory balance and valuation reports
router.get(
  '/reports/inventory',
  requirePermission('report.inventory.view'),
  reportController.getInventoryReport,
);

// 4. Financial collections and customer receivables reports
router.get(
  '/reports/financial',
  requirePermission('report.financial.view'),
  reportController.getFinancialReport,
);

// 5. Procurement and goods receiving fulfillment reports
router.get(
  '/reports/procurement',
  requirePermission('report.procurement.view'),
  reportController.getProcurementReport,
);

// 6. Clinical and dispensing operational reports
router.get(
  '/reports/dispensing',
  requirePermission('report.dispensing.view'),
  reportController.getDispensingReport,
);

// 7. Expiry, quarantine holds, and recall reports
router.get(
  '/reports/expiry-quarantine',
  requirePermission('report.expiry_quarantine.view'),
  reportController.getExpiryQuarantineReport,
);

export default router;
