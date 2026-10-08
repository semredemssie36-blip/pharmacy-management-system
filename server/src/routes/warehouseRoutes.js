import { Router } from 'express';
import warehouseController from '../controllers/warehouseController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/warehouses', requirePermission('warehouse.view'), warehouseController.list);
router.get('/warehouses/:id', requirePermission('warehouse.view'), warehouseController.getById);
router.post('/warehouses', requirePermission('warehouse.create'), warehouseController.create);
router.patch('/warehouses/:id', requirePermission('warehouse.update'), warehouseController.update);
router.post('/warehouses/:id/deactivate', requirePermission('warehouse.deactivate'), warehouseController.deactivate);

export default router;
