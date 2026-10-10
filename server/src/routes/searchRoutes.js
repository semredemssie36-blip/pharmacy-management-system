import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import searchController from '../controllers/searchController.js';

const router = Router();

router.use(authenticate);

// GET /api/v1/search?q=...&type=...&limit=...
router.get('/search', requirePermission('search.view'), searchController.search);

export default router;
