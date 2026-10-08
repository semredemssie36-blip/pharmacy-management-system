import { Router } from 'express';
import roleController from '../controllers/roleController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/roles', requirePermission('role.view'), roleController.list);
router.get('/roles/:id', requirePermission('role.view'), roleController.getById);
router.post('/roles', requirePermission('role.create'), roleController.create);
router.patch('/roles/:id', requirePermission('role.update'), roleController.update);
router.post('/roles/:id/deactivate', requirePermission('role.deactivate'), roleController.deactivate);
router.put('/roles/:id/permissions', requirePermission('role.update'), roleController.setPermissions);

export default router;
