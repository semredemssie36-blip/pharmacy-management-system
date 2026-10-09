import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import receivableController from '../controllers/receivableController.js';

const router = Router();

router.use(authenticate);

router.get('/receivables', requirePermission('receivable.view'), receivableController.list);
router.get('/receivables/:id', requirePermission('receivable.view'), receivableController.getById);

router.get('/customers/:id/financial-summary', requirePermission(['customer.view', 'receivable.view']), receivableController.getCustomerFinancialSummary);
router.get('/customers/:id/receivables', requirePermission('receivable.view'), receivableController.getCustomerFinancialSummary);

router.post('/receivables/credit-sale', requirePermission(['sale.create', 'sale.confirm']), receivableController.createCreditSale);
router.post('/receivables/credit-dispensing', requirePermission('dispensing.create'), receivableController.createCreditDispensing);

export default router;
