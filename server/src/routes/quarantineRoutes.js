import { Router } from 'express';
import quarantineController from '../controllers/quarantineController.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

const router = Router();

router.use(authenticate);

router.get('/quarantines', requirePermission('quarantine.view'), (req, res, next) => quarantineController.list(req, res, next));
router.post('/quarantines', requirePermission('quarantine.create'), (req, res, next) => quarantineController.create(req, res, next));
router.get('/quarantines/:id', requirePermission('quarantine.view'), (req, res, next) => quarantineController.getById(req, res, next));
router.post('/quarantines/:id/review', requirePermission('quarantine.review'), (req, res, next) => quarantineController.review(req, res, next));
router.post('/quarantines/:id/release', requirePermission('quarantine.release'), (req, res, next) => quarantineController.release(req, res, next));
router.post('/quarantines/:id/dispose', requirePermission('quarantine.dispose'), (req, res, next) => quarantineController.dispose(req, res, next));
router.post('/quarantines/:id/cancel', requirePermission('quarantine.create'), (req, res, next) => quarantineController.cancel(req, res, next));

export default router;
