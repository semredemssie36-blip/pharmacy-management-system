/**
 * Task 19 — Centralized Audit Trail Repository
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 * Append-only repository for audit records. No update or delete operations exist.
 */
import { getPool } from '../database/pool.js';

class AuditRepository {
  getPool() {
    return getPool();
  }

  /**
   * Insert audit log record. Append-only.
   */
  async createLog(data, connection = null) {
    const runner = connection || this.getPool();
    const {
      organizationId,
      branchId = null,
      warehouseId = null,
      actorUserId = null,
      action,
      resourceType,
      resourceId = null,
      resourceReference = null,
      outcome = 'success',
      details = null,
      beforeValues = null,
      afterValues = null,
      reason = null,
      ipAddress = null,
    } = data;

    const [result] = await runner.query(
      `INSERT INTO audit_logs (
        organization_id,
        branch_id,
        warehouse_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        resource_reference,
        outcome,
        details,
        before_values,
        after_values,
        reason,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        branchId,
        warehouseId,
        actorUserId,
        action,
        resourceType,
        resourceId,
        resourceReference,
        outcome,
        details ? JSON.stringify(details) : null,
        beforeValues ? JSON.stringify(beforeValues) : null,
        afterValues ? JSON.stringify(afterValues) : null,
        reason,
        ipAddress,
      ],
    );

    return result.insertId;
  }

  /**
   * List paginated audit logs with filters and joined metadata
   */
  async listLogs(params) {
    const {
      organizationId,
      branchIds = null,
      warehouseId = null,
      actorUserId = null,
      action = null,
      resourceType = null,
      resourceId = null,
      resourceReference = null,
      outcome = null,
      fromDate = null,
      toDate = null,
      search = null,
      page = 1,
      limit = 20,
    } = params;

    const offset = (page - 1) * limit;
    const conditions = ['a.organization_id = ?'];
    const values = [organizationId];

    if (Array.isArray(branchIds) && branchIds.length > 0) {
      conditions.push(`(a.branch_id IN (${branchIds.map(() => '?').join(',')}) OR a.branch_id IS NULL)`);
      values.push(...branchIds);
    } else if (params.branchId) {
      conditions.push('a.branch_id = ?');
      values.push(params.branchId);
    }

    if (warehouseId) {
      conditions.push('a.warehouse_id = ?');
      values.push(warehouseId);
    }

    if (actorUserId) {
      conditions.push('a.actor_user_id = ?');
      values.push(actorUserId);
    }

    if (action) {
      conditions.push('a.action = ?');
      values.push(action);
    }

    if (resourceType) {
      conditions.push('a.resource_type = ?');
      values.push(resourceType);
    }

    if (resourceId) {
      conditions.push('a.resource_id = ?');
      values.push(resourceId);
    }

    if (resourceReference) {
      conditions.push('a.resource_reference = ?');
      values.push(resourceReference);
    }

    if (outcome) {
      conditions.push('a.outcome = ?');
      values.push(outcome);
    }

    if (fromDate) {
      conditions.push('a.created_at >= ?');
      values.push(fromDate);
    }

    if (toDate) {
      conditions.push('a.created_at <= ?');
      values.push(toDate);
    }

    if (search) {
      conditions.push(
        '(a.resource_reference LIKE ? OR a.action LIKE ? OR a.reason LIKE ? OR u.name LIKE ? OR u.email LIKE ?)',
      );
      const term = `%${search}%`;
      values.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const pool = this.getPool();
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereClause}`,
      values,
    );
    const total = Number(countRows[0]?.total || 0);

    // Items
    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.organization_id,
        a.branch_id,
        a.warehouse_id,
        a.actor_user_id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.resource_reference,
        a.outcome,
        a.details,
        a.before_values,
        a.after_values,
        a.reason,
        a.ip_address,
        a.created_at,
        u.name AS actor_name,
        u.email AS actor_email,
        b.name AS branch_name,
        b.code AS branch_code,
        w.name AS warehouse_name,
        o.name AS organization_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN branches b ON b.id = a.branch_id
       LEFT JOIN warehouses w ON w.id = a.warehouse_id
       LEFT JOIN organizations o ON o.id = a.organization_id
       ${whereClause}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    const items = rows.map((r) => this.mapRow(r));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single audit log with actor and location details
   */
  async getLogById(id, connection = null) {
    const runner = connection || this.getPool();
    const [rows] = await runner.query(
      `SELECT
        a.id,
        a.organization_id,
        a.branch_id,
        a.warehouse_id,
        a.actor_user_id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.resource_reference,
        a.outcome,
        a.details,
        a.before_values,
        a.after_values,
        a.reason,
        a.ip_address,
        a.created_at,
        u.name AS actor_name,
        u.email AS actor_email,
        b.name AS branch_name,
        b.code AS branch_code,
        w.name AS warehouse_name,
        o.name AS organization_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN branches b ON b.id = a.branch_id
       LEFT JOIN warehouses w ON w.id = a.warehouse_id
       LEFT JOIN organizations o ON o.id = a.organization_id
       WHERE a.id = ?`,
      [id],
    );

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Aggregated metrics for audit dashboard / KPI cards
   */
  async getSummaryStats(organizationId, branchIds = null) {
    const pool = this.getPool();
    const conditions = ['organization_id = ?'];
    const values = [organizationId];

    if (Array.isArray(branchIds) && branchIds.length > 0) {
      conditions.push(`(branch_id IN (${branchIds.map(() => '?').join(',')}) OR branch_id IS NULL)`);
      values.push(...branchIds);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
        COUNT(*) AS total_events,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) AS failed_events,
        SUM(CASE WHEN action LIKE 'auth.%' OR action LIKE 'user.%' OR action LIKE 'role.%' THEN 1 ELSE 0 END) AS security_events,
        SUM(CASE WHEN action LIKE 'stock_%' OR action LIKE 'quarantine.%' OR action LIKE 'recall.%' THEN 1 ELSE 0 END) AS inventory_events,
        SUM(CASE WHEN action LIKE 'sale.%' OR action LIKE 'payment.%' OR action LIKE 'refund.%' OR action LIKE 'approval.%' THEN 1 ELSE 0 END) AS financial_events
       FROM audit_logs
       ${whereClause}`,
      values,
    );

    const stat = rows[0] || {};
    return {
      totalEvents: Number(stat.total_events || 0),
      failedEvents: Number(stat.failed_events || 0),
      securityEvents: Number(stat.security_events || 0),
      inventoryEvents: Number(stat.inventory_events || 0),
      financialEvents: Number(stat.financial_events || 0),
    };
  }

  /**
   * Export bounded audit logs matching filters
   */
  async exportLogs(params) {
    const { limit = 1000, ...rest } = params;
    const boundedLimit = Math.min(Math.max(1, limit), 2000);
    const result = await this.listLogs({ ...rest, page: 1, limit: boundedLimit });
    return result.items;
  }

  /**
   * Parse JSON fields safely
   */
  mapRow(row) {
    return {
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      before_values: typeof row.before_values === 'string' ? JSON.parse(row.before_values) : row.before_values,
      after_values: typeof row.after_values === 'string' ? JSON.parse(row.after_values) : row.after_values,
    };
  }
}

export default new AuditRepository();
