import { Router } from 'express';
import prescriptionController from '../controllers/prescriptionController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use('/prescriptions', authenticate);

router.get('/prescriptions', requirePermission('prescription.view'), prescriptionController.list);
router.get('/prescriptions/:id', requirePermission('prescription.view'), prescriptionController.getById);
router.post('/prescriptions', requirePermission('prescription.create'), prescriptionController.create);
router.put('/prescriptions/:id', requirePermission('prescription.update'), prescriptionController.update);
router.post('/prescriptions/:id/submit', requirePermission(['prescription.update', 'prescription.create']), prescriptionController.submit);
router.post('/prescriptions/:id/validate', requirePermission('prescription.validate'), prescriptionController.validate);
router.post('/prescriptions/:id/cancel', requirePermission('prescription.cancel'), prescriptionController.cancel);

export default router;
