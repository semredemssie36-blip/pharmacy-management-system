import { Router } from 'express';
import userController from '../controllers/userController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/users', requirePermission('user.view'), userController.list);
router.get('/users/:id', requirePermission('user.view'), userController.getById);
router.post('/users', requirePermission('user.create'), userController.create);
router.patch('/users/:id', requirePermission('user.update'), userController.update);
router.post('/users/:id/deactivate', requirePermission('user.deactivate'), userController.deactivate);
router.post('/users/:id/activate', requirePermission('user.update'), userController.activate);
router.put('/users/:id/roles', requirePermission('user.update'), userController.setRoles);
router.put('/users/:id/scopes', requirePermission('user.update'), userController.setScopes);

export default router;
