import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import dispensingController from '../controllers/dispensingController.js';

const router = Router();

router.use('/dispensings', authenticate);
router.use('/dispensing', authenticate);

router.get(
  ['/dispensings', '/dispensing'],
  requirePermission('dispensing.view'),
  dispensingController.listDispensings,
);

router.get(
  ['/dispensings/:id', '/dispensing/:id'],
  requirePermission('dispensing.view'),
  dispensingController.getDispensingById,
);

router.post(
  ['/dispensings', '/dispensing'],
  requirePermission('dispensing.create'),
  dispensingController.createDispensing,
);

router.post(
  ['/dispensings/:id/allocate', '/dispensing/:id/allocate'],
  requirePermission('dispensing.allocate'),
  dispensingController.allocateStock,
);

router.post(
  ['/dispensings/:id/submit-verification', '/dispensing/:id/submit-verification'],
  requirePermission('dispensing.update'),
  dispensingController.submitForVerification,
);

router.post(
  ['/dispensings/:id/verify', '/dispensing/:id/verify'],
  requirePermission('dispensing.verify'),
  dispensingController.verifyDispensing,
);

router.post(
  ['/dispensings/:id/reject', '/dispensing/:id/reject'],
  requirePermission('dispensing.reject'),
  dispensingController.rejectDispensing,
);

router.post(
  ['/dispensings/:id/cancel', '/dispensing/:id/cancel'],
  requirePermission('dispensing.cancel'),
  dispensingController.cancelDispensing,
);

export default router;
