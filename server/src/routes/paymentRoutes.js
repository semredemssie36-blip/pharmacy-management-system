import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import paymentController from '../controllers/paymentController.js';

const router = Router();

router.use(authenticate);

router.get('/payments', requirePermission('payment.view'), paymentController.list);
router.get('/payments/:id', requirePermission('payment.view'), paymentController.getById);
router.get('/payments/:id/receipt', requirePermission('payment.view'), paymentController.getReceipt);

router.post('/payments', requirePermission('payment.create'), paymentController.create);
router.post('/payments/:id/verify', requirePermission('payment.verify'), paymentController.verify);
router.post('/payments/:id/cancel', requirePermission('payment.cancel'), paymentController.cancel);
router.post('/payments/:id/refund', requirePermission('payment.refund'), paymentController.refund);

export default router;
