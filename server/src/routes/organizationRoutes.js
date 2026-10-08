import { Router } from 'express';
import organizationController from '../controllers/organizationController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/organizations', requirePermission('organization.view'), organizationController.list);
router.get('/organizations/:id', requirePermission('organization.view'), organizationController.getById);
router.post('/organizations', requirePermission('organization.create'), organizationController.create);
router.patch('/organizations/:id', requirePermission('organization.update'), organizationController.update);
router.post('/organizations/:id/deactivate', requirePermission('organization.deactivate'), organizationController.deactivate);

export default router;
