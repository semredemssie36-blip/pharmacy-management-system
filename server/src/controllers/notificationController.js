/**
 * Task 20 — Centralized Notifications and User Alerts Controller
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import notificationService from '../services/notificationService.js';
import { parseIdParam } from '../utils/parseId.js';

export async function listNotifications(req, res, next) {
  try {
    const result = await notificationService.listUserNotifications(req.user.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const result = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getNotificationById(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await notificationService.getNotificationById(id, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await notificationService.markAsRead(id, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(req, res, next) {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function scanAlerts(req, res, next) {
  try {
    const orgId = req.body?.organizationId || req.query.organizationId || 1;
    const branchId = req.body?.branchId || req.query.branchId || null;
    const result = await notificationService.scanInventoryAndExpiryAlerts({
      organizationId: Number(orgId),
      branchId: branchId ? Number(branchId) : null,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export default {
  listNotifications,
  getUnreadCount,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  scanAlerts,
};
