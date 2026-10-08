import { Router } from 'express';

import inventoryController from '../controllers/inventoryController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/inventory', requirePermission('inventory.view'), inventoryController.listInventory);
router.get('/inventory/:id', requirePermission('inventory.view'), inventoryController.getInventory);
router.post('/inventory/opening-balance', requirePermission('inventory.create'), inventoryController.createOpeningBalance);

router.get('/batches', requirePermission('batch.view'), inventoryController.listBatches);
router.get('/batches/:id', requirePermission('batch.view'), inventoryController.getBatch);

router.get('/stock-movements', requirePermission('stock_movement.view'), inventoryController.listStockMovements);
router.get('/stock-movements/:id', requirePermission('stock_movement.view'), inventoryController.getStockMovement);

export default router;
