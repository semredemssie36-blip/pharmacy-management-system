import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import organizationRoutes from './organizationRoutes.js';
import branchRoutes from './branchRoutes.js';
import warehouseRoutes from './warehouseRoutes.js';
import storageLocationRoutes from './storageLocationRoutes.js';
import userRoutes from './userRoutes.js';
import roleRoutes from './roleRoutes.js';
import permissionRoutes from './permissionRoutes.js';
import productRoutes from './productRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import purchaseOrderRoutes from './purchaseOrderRoutes.js';
import goodsReceiptRoutes from './goodsReceiptRoutes.js';
import saleRoutes from './saleRoutes.js';
import partnerRoutes from '../partners/partnerRouter.js';
import masterDataRouter from '../masterData/masterDataRouter.js';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(organizationRoutes);
router.use(branchRoutes);
router.use(warehouseRoutes);
router.use(storageLocationRoutes);
router.use(userRoutes);
router.use(roleRoutes);
router.use(permissionRoutes);
router.use(productRoutes);
router.use(inventoryRoutes);
router.use(purchaseOrderRoutes);
router.use(goodsReceiptRoutes);
router.use(saleRoutes);
for (const buildRouter of partnerRoutes) router.use(buildRouter());
router.use(masterDataRouter);

export default router;
