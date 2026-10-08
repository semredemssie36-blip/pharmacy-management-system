import { Router } from 'express';

import saleController from '../controllers/saleController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

// POS fast product / barcode lookup
router.get('/pos/products/search', requirePermission(['sale.create', 'sale.view']), saleController.searchPosProducts);

// Sales endpoints
router.get('/sales', requirePermission('sale.view'), saleController.list);
router.get('/sales/:id', requirePermission('sale.view'), saleController.getById);
router.get('/sales/:id/receipt', requirePermission('sale.view'), saleController.getReceipt);

router.post('/sales', requirePermission('sale.create'), saleController.create);
router.patch('/sales/:id', requirePermission('sale.update'), saleController.update);

router.post('/sales/:id/confirm', requirePermission('sale.confirm'), saleController.confirm);
router.post('/sales/:id/payment-pending', requirePermission('sale.confirm'), saleController.paymentPending);
router.post('/sales/:id/complete', requirePermission('sale.complete'), saleController.complete);
router.post('/sales/:id/cancel', requirePermission('sale.cancel'), saleController.cancel);
router.post('/sales/:id/void', requirePermission('sale.void'), saleController.voidSale);

export default router;
