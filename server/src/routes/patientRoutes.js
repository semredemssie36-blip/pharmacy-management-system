import { Router } from 'express';
import patientController from '../controllers/patientController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use('/patients', authenticate);

router.get('/patients', requirePermission('patient.view'), patientController.list);
router.get('/patients/duplicates', requirePermission(['patient.view', 'patient.create']), patientController.checkDuplicates);
router.get('/patients/:id', requirePermission('patient.view'), patientController.getById);
router.get('/patients/:id/history', requirePermission('patient.view'), patientController.getHistory);
router.post('/patients', requirePermission('patient.create'), patientController.create);
router.put('/patients/:id', requirePermission('patient.update'), patientController.update);
router.patch('/patients/:id/status', requirePermission('patient.deactivate'), patientController.updateStatus);

export default router;
