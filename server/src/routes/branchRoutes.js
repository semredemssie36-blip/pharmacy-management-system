import { Router } from 'express';
import branchController from '../controllers/branchController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/branches', requirePermission('branch.view'), branchController.list);
router.get('/branches/:id', requirePermission('branch.view'), branchController.getById);
router.post('/branches', requirePermission('branch.create'), branchController.create);
router.patch('/branches/:id', requirePermission('branch.update'), branchController.update);
router.post('/branches/:id/deactivate', requirePermission('branch.deactivate'), branchController.deactivate);

export default router;
