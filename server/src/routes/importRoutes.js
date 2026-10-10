import { Router } from 'express';
import express from 'express';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import importController from '../controllers/importController.js';

const router = Router();

router.use(authenticate);

// Middleware to parse text/csv payloads if raw body is sent
router.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }));

// GET /api/v1/import/templates/:type
router.get('/import/templates/:type', requirePermission('data.import.view'), importController.getTemplate);

// POST /api/v1/import/preview/:type
router.post('/import/preview/:type', requirePermission('data.import.view'), importController.preview);

// POST /api/v1/import/commit/:type
router.post('/import/commit/:type', requirePermission('data.import.execute'), importController.commit);

// GET /api/v1/import/jobs
router.get('/import/jobs', requirePermission('data.import.view'), importController.listJobs);

// GET /api/v1/import/jobs/:id
router.get('/import/jobs/:id', requirePermission('data.import.view'), importController.getJob);

export default router;
