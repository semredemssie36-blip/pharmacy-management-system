import { Router } from 'express';
import storageLocationController from '../controllers/storageLocationController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/storage-locations', requirePermission('storage_location.view'), storageLocationController.list);
router.get('/storage-locations/:id', requirePermission('storage_location.view'), storageLocationController.getById);
router.post('/storage-locations', requirePermission('storage_location.create'), storageLocationController.create);
router.patch('/storage-locations/:id', requirePermission('storage_location.update'), storageLocationController.update);
router.post('/storage-locations/:id/deactivate', requirePermission('storage_location.deactivate'), storageLocationController.deactivate);

export default router;
