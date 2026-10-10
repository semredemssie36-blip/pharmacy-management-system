import { Router } from 'express';

import authController from '../controllers/authController.js';
import authValidator from '../validators/authValidator.js';
import authenticate from '../middleware/authenticate.js';

const router = Router();

router.post('/auth/login', authValidator.validateLogin, authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authenticate, authController.me);
router.put('/auth/profile', authenticate, authController.updateProfile);
router.post('/auth/change-password', authenticate, authController.changePassword);

export default router;
