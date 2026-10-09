import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import supplierReturnController from '../controllers/supplierReturnController.js';

const router = Router();

router.use(authenticate);

router.get('/supplier-returns', requirePermission('supplier_return.view'), supplierReturnController.list);
router.get('/supplier-returns/receipt-eligibility/:receiptId', requirePermission('supplier_return.create'), supplierReturnController.getReceiptEligibility);
router.get('/supplier-returns/:id', requirePermission('supplier_return.view'), supplierReturnController.getById);

router.post('/supplier-returns', requirePermission('supplier_return.create'), supplierReturnController.create);
router.post('/supplier-returns/:id/submit', requirePermission('supplier_return.create'), supplierReturnController.submit);
router.post('/supplier-returns/:id/approve', requirePermission('supplier_return.approve'), supplierReturnController.approve);
router.post('/supplier-returns/:id/complete', requirePermission('supplier_return.complete'), supplierReturnController.complete);
router.post('/supplier-returns/:id/cancel', requirePermission('supplier_return.cancel'), supplierReturnController.cancel);

export default router;
