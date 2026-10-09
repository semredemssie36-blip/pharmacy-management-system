import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import stockCountController from '../controllers/stockCountController.js';

const router = Router();

router.use(authenticate);

router.get('/stock-counts', requirePermission('stock_count.view'), stockCountController.listStockCounts);
router.get('/stock-counts/:id', requirePermission('stock_count.view'), stockCountController.getStockCount);

router.post('/stock-counts', requirePermission('stock_count.create'), stockCountController.createStockCount);
router.post('/stock-counts/:id/start', requirePermission('stock_count.record'), stockCountController.startStockCount);
router.post('/stock-counts/:id/record-count', requirePermission('stock_count.record'), stockCountController.recordCountLines);
router.post('/stock-counts/:id/submit', requirePermission('stock_count.submit'), stockCountController.submitStockCount);
router.post('/stock-counts/:id/recount', requirePermission('stock_count.record'), stockCountController.requestRecount);
router.post('/stock-counts/:id/approve', requirePermission('stock_count.approve'), stockCountController.approveStockCount);
router.post('/stock-counts/:id/reject', requirePermission('stock_count.reject'), stockCountController.rejectStockCount);
router.post('/stock-counts/:id/apply', requirePermission('stock_count.apply_adjustment'), stockCountController.applyAdjustments);
router.post('/stock-counts/:id/cancel', requirePermission('stock_count.cancel'), stockCountController.cancelStockCount);

export default router;
