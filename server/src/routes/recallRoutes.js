import { Router } from 'express';
import recallController from '../controllers/recallController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/recalls', requirePermission('recall.view'), (req, res, next) => recallController.list(req, res, next));
router.post('/recalls', requirePermission('recall.create'), (req, res, next) => recallController.create(req, res, next));
router.get('/recalls/:id', requirePermission('recall.view'), (req, res, next) => recallController.getById(req, res, next));
router.post('/recalls/:id/approve', requirePermission('recall.approve'), (req, res, next) => recallController.approve(req, res, next));
router.post('/recalls/:id/activate', requirePermission('recall.activate'), (req, res, next) => recallController.activate(req, res, next));
router.post('/recalls/:id/actions', requirePermission('recall.action'), (req, res, next) => recallController.recordAction(req, res, next));
router.post('/recalls/:id/close', requirePermission('recall.close'), (req, res, next) => recallController.close(req, res, next));
router.post('/recalls/:id/cancel', requirePermission('recall.create'), (req, res, next) => recallController.cancel(req, res, next));

export default router;
