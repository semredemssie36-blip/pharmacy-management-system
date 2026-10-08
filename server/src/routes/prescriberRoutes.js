import { Router } from 'express';
import prescriberController from '../controllers/prescriberController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use('/prescribers', authenticate);

router.get('/prescribers', requirePermission('prescriber.view'), prescriberController.list);
router.get('/prescribers/:id', requirePermission('prescriber.view'), prescriberController.getById);
router.get('/prescribers/:id/prescriptions', requirePermission('prescriber.view'), prescriberController.getPrescriptions);
router.post('/prescribers', requirePermission('prescriber.create'), prescriberController.create);
router.put('/prescribers/:id', requirePermission('prescriber.update'), prescriberController.update);
router.patch('/prescribers/:id/status', requirePermission('prescriber.deactivate'), prescriberController.updateStatus);

export default router;
