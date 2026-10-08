import { Router } from 'express';

import productController from '../controllers/productController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/products', requirePermission('product.view'), productController.list);
router.get('/products/:id', requirePermission('product.view'), productController.getById);
router.post('/products', requirePermission('product.create'), productController.create);
router.patch('/products/:id', requirePermission('product.update'), productController.update);
router.post('/products/:id/deactivate', requirePermission('product.deactivate'), productController.deactivate);
router.post('/products/:id/activate', requirePermission('product.update'), productController.activate);
router.put('/products/:id/active-ingredients', requirePermission('product.update'), productController.setActiveIngredients);
router.put('/products/:id/units', requirePermission('product.update'), productController.setUnits);
router.put('/products/:id/unit-conversions', requirePermission('product.update'), productController.setConversions);
router.put('/products/:id/relationships', requirePermission('product.update'), productController.setRelationships);

export default router;
