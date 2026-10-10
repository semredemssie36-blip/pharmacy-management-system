/**
 * Task 20 — Centralized Notifications and User Alerts Service
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 *
 * Responsibilities:
 * - Permission-aware, organization/branch-aware recipient resolution.
 * - Transactional consistency (writes inside caller's DB transaction connection when provided).
 * - Event deduplication and idempotency.
 * - Sensitive credential & clinical data protection.
 * - Multi-tier data scope enforcement.
 */
import notificationRepository from '../repositories/notificationRepository.js';
import authorizationService from './authorizationService.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import logger from '../utils/logger.js';

// Sensitive patterns to scrub from titles and messages
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*[^\s,]+/gi,
  /bearer\s+[a-zA-Z0-9_\-.]+/gi,
  /token\s*[:=]\s*[^\s,]+/gi,
  /secret\s*[:=]\s*[^\s,]+/gi,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card pattern
  /\bcvv\s*[:=]?\s*\d{3,4}\b/gi,
  /\bpin\s*[:=]?\s*\d{4,6}\b/gi,
];

class NotificationService {
  /**
   * Sanitize text to remove sensitive secrets and strip HTML tags.
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    let clean = text.replace(/<[^>]*>?/gm, ''); // Strip HTML tags
    for (const pattern of SENSITIVE_PATTERNS) {
      clean = clean.replace(pattern, '[REDACTED]');
    }
    return clean.trim();
  }

  /**
   * Internal helper to create a validated and sanitized notification payload.
   */
  prepareNotification({
    organizationId,
    branchId = null,
    warehouseId = null,
    userId,
    type,
    title,
    message,
    severity = 'info',
    resourceType = null,
    resourceId = null,
    resourceReference = null,
    actionUrl = null,
    dedupKey = null,
  }) {
    if (!organizationId) {
      throw new ValidationError('organizationId is required for notification.');
    }
    if (!userId) {
      throw new ValidationError('userId is required for notification recipient.');
    }
    if (!type || !title || !message) {
      throw new ValidationError('type, title, and message are required.');
    }

    const validSeverities = ['info', 'warning', 'danger', 'success'];
    const resolvedSeverity = validSeverities.includes(severity) ? severity : 'info';

    return {
      organizationId: Number(organizationId),
      branchId: branchId ? Number(branchId) : null,
      warehouseId: warehouseId ? Number(warehouseId) : null,
      userId: Number(userId),
      type: String(type).trim().slice(0, 80),
      title: this.sanitizeText(title).slice(0, 200),
      message: this.sanitizeText(message).slice(0, 2000),
      severity: resolvedSeverity,
      resourceType: resourceType ? String(resourceType).trim().slice(0, 80) : null,
      resourceId: resourceId ? Number(resourceId) : null,
      resourceReference: resourceReference ? String(resourceReference).trim().slice(0, 100) : null,
      actionUrl: actionUrl ? String(actionUrl).trim().slice(0, 255) : null,
      dedupKey: dedupKey ? String(dedupKey).trim().slice(0, 191) : null,
    };
  }

  /**
   * Send notification to specific user IDs.
   * If `connection` is passed, runs inside that database transaction.
   */
  async notifyUsers({
    userIds,
    organizationId,
    branchId = null,
    warehouseId = null,
    type,
    title,
    message,
    severity = 'info',
    resourceType = null,
    resourceId = null,
    resourceReference = null,
    actionUrl = null,
    dedupKey = null,
    connection = null,
  }) {
    try {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return [];
      }

      const activeConn = connection || null;
      const createdIds = [];

      for (const targetUserId of userIds) {
        // Individual dedup key per recipient to allow idempotency
        const userDedupKey = dedupKey ? `${dedupKey}:user:${targetUserId}` : null;
        const payload = this.prepareNotification({
          organizationId,
          branchId,
          warehouseId,
          userId: targetUserId,
          type,
          title,
          message,
          severity,
          resourceType,
          resourceId,
          resourceReference,
          actionUrl,
          dedupKey: userDedupKey,
        });

        // eslint-disable-next-line no-await-in-loop
        const id = await notificationRepository.createNotification(payload, activeConn);
        if (id) createdIds.push(id);
      }

      return createdIds;
    } catch (err) {
      logger.error('Failed to dispatch notifications to users', {
        error: err.message,
        type,
        userIds,
      });
      if (connection) {
        throw err;
      }
      return [];
    }
  }

  /**
   * Resolve active users by permission within organization/branch scope and notify them.
   */
  async notifyByPermission({
    organizationId,
    branchId = null,
    warehouseId = null,
    permission,
    excludeUserIds = [],
    type,
    title,
    message,
    severity = 'info',
    resourceType = null,
    resourceId = null,
    resourceReference = null,
    actionUrl = null,
    dedupKey = null,
    connection = null,
  }) {
    try {
      const activeConn = connection || null;

      // Find eligible active users in that scope
      const recipientIds = await notificationRepository.findEligibleUserIdsByPermission(
        {
          organizationId,
          branchId,
          permission,
          excludeUserIds,
        },
        activeConn,
      );

      if (recipientIds.length === 0) {
        logger.info('No eligible recipients found for permission notification', {
          organizationId,
          branchId,
          permission,
          type,
        });
        return [];
      }

      return this.notifyUsers({
        userIds: recipientIds,
        organizationId,
        branchId,
        warehouseId,
        type,
        title,
        message,
        severity,
        resourceType,
        resourceId,
        resourceReference,
        actionUrl,
        dedupKey,
        connection: activeConn,
      });
    } catch (err) {
      logger.error('Failed to notify by permission', {
        error: err.message,
        permission,
        type,
      });
      if (connection) {
        throw err;
      }
      return [];
    }
  }

  /**
   * List notifications for the authenticated user.
   */
  async listUserNotifications(userId, query = {}) {
    const filters = {
      isRead: query.isRead,
      type: query.type ? String(query.type).trim() : undefined,
      severity: query.severity ? String(query.severity).trim() : undefined,
      search: query.search ? String(query.search).trim() : undefined,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit,
      offset: query.offset || (query.page ? (Number(query.page) - 1) * (Number(query.limit) || 20) : 0),
    };

    const result = await notificationRepository.findByUserId(userId, filters);
    const unreadCount = await notificationRepository.countUnreadByUserId(userId);

    return {
      items: result.items,
      total: result.total,
      unreadCount,
      limit: result.limit,
      offset: result.offset,
    };
  }

  /**
   * Get unread notification count for authenticated user.
   */
  async getUnreadCount(userId) {
    const unreadCount = await notificationRepository.countUnreadByUserId(userId);
    return { unreadCount };
  }

  /**
   * Get notification by ID strictly checking ownership.
   */
  async getNotificationById(id, userId) {
    const numId = Number(id);
    if (!numId || numId <= 0) {
      throw new ValidationError('Invalid notification ID.');
    }

    const notification = await notificationRepository.findById(numId, userId);
    if (!notification) {
      throw new AppError('Notification not found.', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return notification;
  }

  /**
   * Mark a single notification as read for authenticated user.
   */
  async markAsRead(id, userId) {
    const numId = Number(id);
    if (!numId || numId <= 0) {
      throw new ValidationError('Invalid notification ID.');
    }

    const notification = await notificationRepository.findById(numId, userId);
    if (!notification) {
      throw new AppError('Notification not found.', {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    if (!notification.is_read) {
      await notificationRepository.markAsRead(numId, userId);
    }

    return notificationRepository.findById(numId, userId);
  }

  /**
   * Mark all notifications as read for authenticated user.
   */
  async markAllAsRead(userId) {
    const affectedCount = await notificationRepository.markAllAsRead(userId);
    return {
      success: true,
      markedCount: affectedCount,
      unreadCount: 0,
    };
  }

  /**
   * Scan and trigger low-stock and expiry warnings for an organization/branch.
   * Uses date-based dedup keys to prevent flooding.
   */
  async scanInventoryAndExpiryAlerts({ organizationId, branchId = null, connection = null }) {
    const runner = connection || notificationRepository.getPool();
    const today = new Date().toISOString().slice(0, 10);
    let lowStockCount = 0;
    let expiryCount = 0;

    // 1. Scan low stock products
    const lowStockSql = `
      SELECT p.id, p.name, p.code, p.reorder_level, COALESCE(SUM(inv.quantity), 0) AS total_qty
      FROM products p
      LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.status = 'available'
        ${branchId ? 'AND inv.branch_id = ?' : ''}
      WHERE p.organization_id = ?
        AND p.status = 'active'
        AND p.reorder_level IS NOT NULL
      GROUP BY p.id, p.name, p.code, p.reorder_level
      HAVING total_qty <= p.reorder_level
      LIMIT 50
    `;
    const lowStockParams = branchId ? [branchId, organizationId] : [organizationId];
    const [lowStockRows] = await runner.query(lowStockSql, lowStockParams).catch(() => [[]]);

    for (const prod of lowStockRows) {
      const isOut = Number(prod.total_qty) <= 0;
      // eslint-disable-next-line no-await-in-loop
      const notifs = await this.notifyByPermission({
        organizationId,
        branchId,
        permission: 'inventory.view',
        type: isOut ? 'stock_out' : 'stock_low',
        title: isOut ? `Out of Stock: ${prod.name}` : `Low Stock Warning: ${prod.name}`,
        message: isOut
          ? `Product ${prod.name} (${prod.code}) is out of stock.`
          : `Product ${prod.name} (${prod.code}) has ${prod.total_qty} units remaining (reorder level: ${prod.reorder_level}).`,
        severity: isOut ? 'danger' : 'warning',
        resourceType: 'product',
        resourceId: prod.id,
        resourceReference: prod.code,
        actionUrl: '/inventory/stock',
        dedupKey: `stock:${isOut ? 'out' : 'low'}:${prod.id}:${branchId || 'all'}:${today}`,
        connection: runner,
      });
      if (notifs.length > 0) lowStockCount++;
    }

    // 2. Scan expiring batches (<= 30 days or expired)
    const expirySql = `
      SELECT b.id, b.batch_number, b.expiry_date, p.name AS product_name, p.code AS product_code,
             SUM(inv.quantity) AS batch_qty,
             DATEDIFF(b.expiry_date, CURDATE()) AS days_left
      FROM batches b
      JOIN products p ON p.id = b.product_id
      JOIN inventory inv ON inv.batch_id = b.id AND inv.quantity > 0 AND inv.status = 'available'
      WHERE p.organization_id = ?
        ${branchId ? 'AND inv.branch_id = ?' : ''}
        AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      GROUP BY b.id, b.batch_number, b.expiry_date, p.name, p.code
      LIMIT 50
    `;
    const expiryParams = branchId ? [branchId, organizationId] : [organizationId];
    const [expiryRows] = await runner.query(expirySql, expiryParams).catch(() => [[]]);

    for (const b of expiryRows) {
      const isExpired = Number(b.days_left) <= 0;
      // eslint-disable-next-line no-await-in-loop
      const notifs = await this.notifyByPermission({
        organizationId,
        branchId,
        permission: 'inventory.view',
        type: isExpired ? 'batch_expired' : 'batch_near_expiry',
        title: isExpired ? `Expired Batch: ${b.product_name}` : `Near-Expiry Batch: ${b.product_name}`,
        message: isExpired
          ? `Batch ${b.batch_number} (${b.batch_qty} units) expired on ${new Date(b.expiry_date).toISOString().slice(0, 10)}. Immediate quarantine recommended.`
          : `Batch ${b.batch_number} (${b.batch_qty} units) expires in ${b.days_left} days.`,
        severity: isExpired ? 'danger' : 'warning',
        resourceType: 'batch',
        resourceId: b.id,
        resourceReference: b.batch_number,
        actionUrl: '/inventory/expiry',
        dedupKey: `batch:expiry:${b.id}:${branchId || 'all'}:${today}`,
        connection: runner,
      });
      if (notifs.length > 0) expiryCount++;
    }

    return { lowStockAlerts: lowStockCount, expiryAlerts: expiryCount };
  }
}

export default new NotificationService();
