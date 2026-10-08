import { Router } from 'express';

import goodsReceiptController from '../controllers/goodsReceiptController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/goods-receipts', requirePermission('goods_receipt.view'), goodsReceiptController.list);
router.get('/goods-receipts/:id', requirePermission('goods_receipt.view'), goodsReceiptController.getById);
router.post('/goods-receipts', requirePermission('goods_receipt.create'), goodsReceiptController.create);
router.patch('/goods-receipts/:id', requirePermission('goods_receipt.update'), goodsReceiptController.update);
router.post('/goods-receipts/:id/start', requirePermission('goods_receipt.update'), goodsReceiptController.start);
router.post('/goods-receipts/:id/complete', requirePermission('goods_receipt.complete'), goodsReceiptController.complete);
router.post('/goods-receipts/:id/cancel', requirePermission('goods_receipt.cancel'), goodsReceiptController.cancel);

export default router;
