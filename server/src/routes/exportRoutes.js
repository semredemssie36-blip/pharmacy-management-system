import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import exportController from '../controllers/exportController.js';

const router = Router();

router.use(authenticate);

// GET /api/v1/export/:type
router.get('/export/:type', requirePermission('data.export.execute'), exportController.exportCsv);

export default router;
