import { Router } from 'express';
import permissionController from '../controllers/permissionController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/permissions', requirePermission('permission.view'), permissionController.list);

export default router;
