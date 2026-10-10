/**
 * Task 19 — Centralized Audit Trail and Activity History Routes
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 * Append-only by design. No create, edit, or delete endpoints are exposed.
 */
import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import auditController from '../controllers/auditController.js';

const router = Router();

router.use(authenticate);

// Aggregate metrics for audit dashboard
router.get(
  '/audit-logs/stats',
  requirePermission('audit.view'),
  auditController.getSummaryStats,
);

// Bounded export
router.get(
  '/audit-logs/export',
  requirePermission('audit.export'),
  auditController.exportLogs,
);

// Paginated listing with filtering and search
router.get(
  '/audit-logs',
  requirePermission('audit.view'),
  auditController.listLogs,
);

// Single audit log event details
router.get(
  '/audit-logs/:id',
  requirePermission('audit.view'),
  auditController.getLogById,
);

export default router;
