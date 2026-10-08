import { Router } from 'express';

import purchaseOrderController from '../controllers/purchaseOrderController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/purchase-orders', requirePermission('purchase_order.view'), purchaseOrderController.list);
router.get('/purchase-orders/:id', requirePermission('purchase_order.view'), purchaseOrderController.getById);
router.post('/purchase-orders', requirePermission('purchase_order.create'), purchaseOrderController.create);
router.patch('/purchase-orders/:id', requirePermission('purchase_order.update'), purchaseOrderController.updateDraft);
router.post('/purchase-orders/:id/submit', requirePermission('purchase_order.submit'), purchaseOrderController.submit);
router.post('/purchase-orders/:id/approve', requirePermission('purchase_order.approve'), purchaseOrderController.approve);
router.post('/purchase-orders/:id/reject', requirePermission('purchase_order.approve'), purchaseOrderController.reject);
router.post('/purchase-orders/:id/cancel', requirePermission('purchase_order.cancel'), purchaseOrderController.cancel);

export default router;
