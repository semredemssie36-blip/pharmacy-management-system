import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import stockTransferController from '../controllers/stockTransferController.js';

const router = Router();

router.use(authenticate);

router.get('/stock-transfers', requirePermission('stock_transfer.view'), stockTransferController.listTransfers);
router.get('/stock-transfers/eligible-stock', requirePermission('stock_transfer.create'), stockTransferController.getEligibleStock);
router.get('/stock-transfers/:id', requirePermission('stock_transfer.view'), stockTransferController.getTransfer);

router.post('/stock-transfers', requirePermission('stock_transfer.create'), stockTransferController.createTransfer);
router.put('/stock-transfers/:id', requirePermission('stock_transfer.create'), stockTransferController.updateTransfer);
router.post('/stock-transfers/:id/submit', requirePermission('stock_transfer.submit'), stockTransferController.submitTransfer);
router.post('/stock-transfers/:id/approve', requirePermission('stock_transfer.approve'), stockTransferController.approveTransfer);
router.post('/stock-transfers/:id/reject', requirePermission('stock_transfer.reject'), stockTransferController.rejectTransfer);
router.post('/stock-transfers/:id/dispatch', requirePermission('stock_transfer.dispatch'), stockTransferController.dispatchTransfer);
router.post('/stock-transfers/:id/receive', requirePermission('stock_transfer.receive'), stockTransferController.receiveTransfer);
router.post('/stock-transfers/:id/resolve-discrepancy', requirePermission('stock_transfer.resolve_discrepancy'), stockTransferController.resolveDiscrepancy);
router.post('/stock-transfers/:id/cancel', requirePermission('stock_transfer.cancel'), stockTransferController.cancelTransfer);

export default router;
