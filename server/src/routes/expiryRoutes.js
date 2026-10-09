import { Router } from 'express';
import expiryController from '../controllers/expiryController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/expiry/summary', requirePermission('expiry.view'), (req, res, next) => expiryController.getSummary(req, res, next));
router.get('/expiry/batches', requirePermission('expiry.view'), (req, res, next) => expiryController.listBatches(req, res, next));
router.post('/expiry/segregate-expired', requirePermission('quarantine.create'), (req, res, next) => expiryController.segregateExpired(req, res, next));

export default router;
