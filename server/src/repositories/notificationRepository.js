/**
 * Task 20 — Centralized Notifications and User Alerts Repository
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import { getPool } from '../database/pool.js';

class NotificationRepository {
  getPool() {
    return getPool();
  }

  /**
   * Insert a single notification with deduplication support.
   */
  async createNotification(
    {
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
    },
    connection = null,
  ) {
    const runner = connection || this.getPool();
    const sql = `
      INSERT INTO notifications (
        organization_id, branch_id, warehouse_id, user_id,
        type, title, message, severity,
        resource_type, resource_id, resource_reference, action_url,
        dedup_key, is_read, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())
      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
    `;

    const [result] = await runner.query(sql, [
      organizationId,
      branchId,
      warehouseId,
      userId,
      type,
      title,
      message,
      severity,
      resourceType,
      resourceId,
      resourceReference,
      actionUrl,
      dedupKey,
    ]);

    return result.insertId;
  }

  /**
   * Insert notifications for multiple recipients.
   */
  async createBulkNotifications(notifications, connection = null) {
    if (!notifications || notifications.length === 0) return [];
    const insertedIds = [];
    for (const notif of notifications) {
      // eslint-disable-next-line no-await-in-loop
      const id = await this.createNotification(notif, connection);
      if (id) insertedIds.push(id);
    }
    return insertedIds;
  }

  /**
   * Find notifications for a specific user with filtering and pagination.
   */
  async findByUserId(userId, filters = {}, connection = null) {
    const runner = connection || this.getPool();
    const {
      isRead,
      type,
      severity,
      search,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = filters;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (isRead !== undefined && isRead !== null && isRead !== '') {
      conditions.push('is_read = ?');
      params.push(isRead === true || isRead === 'true' || isRead === 1 || isRead === '1' ? 1 : 0);
    }

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (severity) {
      conditions.push('severity = ?');
      params.push(severity);
    }

    if (startDate) {
      conditions.push('created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('created_at <= ?');
      params.push(endDate);
    }

    if (search && search.trim()) {
      conditions.push('(title LIKE ? OR message LIKE ? OR resource_reference LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    // Count total items
    const [countRows] = await runner.query(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    // Fetch paginated items
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const querySql = `
      SELECT 
        id, organization_id, branch_id, warehouse_id, user_id,
        type, title, message, severity,
        resource_type, resource_id, resource_reference, action_url,
        is_read, read_at, dedup_key, created_at
      FROM notifications
      WHERE ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await runner.query(querySql, [...params, safeLimit, safeOffset]);

    return {
      items: rows.map((r) => ({
        ...r,
        is_read: Boolean(r.is_read),
      })),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  /**
   * Count unread notifications for a user.
   */
  async countUnreadByUserId(userId, connection = null) {
    const runner = connection || this.getPool();
    const [rows] = await runner.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    return Number(rows[0]?.unread_count || 0);
  }

  /**
   * Find single notification strictly verifying recipient user ownership.
   */
  async findById(id, userId, connection = null) {
    const runner = connection || this.getPool();
    const [rows] = await runner.query(
      `SELECT 
        id, organization_id, branch_id, warehouse_id, user_id,
        type, title, message, severity,
        resource_type, resource_id, resource_reference, action_url,
        is_read, read_at, dedup_key, created_at
       FROM notifications
       WHERE id = ? AND user_id = ?`,
      [id, userId],
    );
    if (!rows[0]) return null;
    return {
      ...rows[0],
      is_read: Boolean(rows[0].is_read),
    };
  }

  /**
   * Mark a single notification as read for a user.
   */
  async markAsRead(id, userId, connection = null) {
    const runner = connection || this.getPool();
    const [result] = await runner.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ? AND is_read = 0',
      [id, userId],
    );
    return result.affectedRows > 0;
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  async markAllAsRead(userId, connection = null) {
    const runner = connection || this.getPool();
    const [result] = await runner.query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    return result.affectedRows;
  }

  /**
   * Resolve active users eligible for a notification based on required permission and data scope.
   */
  async findEligibleUserIdsByPermission(
    { organizationId, branchId = null, permission, excludeUserIds = [] },
    connection = null,
  ) {
    const runner = connection || this.getPool();
    let sql = `
      SELECT DISTINCT u.id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id AND r.status = 'active'
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id AND p.code = ?
      JOIN user_scopes us ON us.user_id = u.id
      WHERE u.status = 'active'
        AND (
          (us.scope_type = 'organization' AND us.organization_id = ?)
          OR (? IS NOT NULL AND us.scope_type = 'branch' AND us.branch_id = ?)
        )
    `;

    const params = [permission, organizationId, branchId, branchId];

    if (excludeUserIds && excludeUserIds.length > 0) {
      sql += ` AND u.id NOT IN (${excludeUserIds.map(() => '?').join(',')})`;
      params.push(...excludeUserIds);
    }

    const [rows] = await runner.query(sql, params);
    return rows.map((r) => Number(r.id));
  }
}

export default new NotificationRepository();
