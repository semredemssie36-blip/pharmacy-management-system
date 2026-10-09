/**
 * Task 18 — Centralized Approvals and Overrides Routes
 */
import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import approvalController from '../controllers/approvalController.js';

const router = Router();

router.use(authenticate);

// Policies routes
router.get(
  '/approvals/policies',
  requirePermission('approval.policy.view'),
  approvalController.listPolicies,
);

router.post(
  '/approvals/policies',
  requirePermission('approval.policy.manage'),
  approvalController.upsertPolicy,
);

// Approval request routes
router.get(
  '/approvals',
  requirePermission('approval.view'),
  approvalController.listRequests,
);

router.get(
  '/approvals/:id',
  requirePermission('approval.view'),
  approvalController.getRequestById,
);

router.post(
  '/approvals',
  requirePermission('approval.create'),
  approvalController.createRequest,
);

router.post(
  '/approvals/:id/approve',
  approvalController.approveRequest,
);

router.post(
  '/approvals/:id/reject',
  approvalController.rejectRequest,
);

router.post(
  '/approvals/:id/cancel',
  approvalController.cancelRequest,
);

export default router;
