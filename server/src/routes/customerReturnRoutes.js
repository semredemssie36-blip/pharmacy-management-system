import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import customerReturnController from '../controllers/customerReturnController.js';

const router = Router();

router.use(authenticate);

router.get('/customer-returns', requirePermission('customer_return.view'), customerReturnController.list);
router.get('/customer-returns/sale-eligibility/:saleId', requirePermission('customer_return.create'), customerReturnController.getSaleEligibility);
router.get('/customer-returns/:id', requirePermission('customer_return.view'), customerReturnController.getById);

router.post('/customer-returns', requirePermission('customer_return.create'), customerReturnController.create);
router.post('/customer-returns/:id/submit', requirePermission('customer_return.create'), customerReturnController.submit);
router.post('/customer-returns/:id/inspect', requirePermission('customer_return.inspect'), customerReturnController.inspect);
router.post('/customer-returns/:id/approve', requirePermission('customer_return.approve'), customerReturnController.approve);
router.post('/customer-returns/:id/reject', requirePermission('customer_return.reject'), customerReturnController.reject);
router.post('/customer-returns/:id/complete', requirePermission('customer_return.complete'), customerReturnController.complete);
router.post('/customer-returns/:id/cancel', requirePermission('customer_return.cancel'), customerReturnController.cancel);

export default router;
