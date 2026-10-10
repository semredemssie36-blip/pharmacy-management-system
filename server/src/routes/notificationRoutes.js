/**
 * Task 20 — Centralized Notifications and User Alerts Routes
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import { Router } from 'express';
import authenticate from '../middleware/authenticate.js';
import notificationController from '../controllers/notificationController.js';

const router = Router();

router.use(authenticate);

// Unread count endpoints (supports both /unread-count and /unread per API spec)
router.get('/notifications/unread-count', notificationController.getUnreadCount);
router.get('/notifications/unread', notificationController.getUnreadCount);

// Bulk read action (supports both PATCH and POST)
router.patch('/notifications/read-all', notificationController.markAllAsRead);
router.post('/notifications/read-all', notificationController.markAllAsRead);

// Single notification read action (supports both PATCH and POST)
router.patch('/notifications/:id/read', notificationController.markAsRead);
router.post('/notifications/:id/read', notificationController.markAsRead);

// List authenticated user's notifications
router.get('/notifications', notificationController.listNotifications);

// Single notification details
router.get('/notifications/:id', notificationController.getNotificationById);

// Scan and trigger inventory and expiry alert warnings
router.post('/notifications/scan-alerts', notificationController.scanAlerts);

export default router;
