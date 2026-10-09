/**
 * Task 18 — Centralized Approvals and Authorized Overrides Repository
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import { getPool } from '../database/pool.js';

class ApprovalRepository {
  async getPool() {
    return getPool();
  }

  /**
   * Insert a new approval request
   */
  async createRequest(data, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      INSERT INTO approval_requests (
        request_number, organization_id, branch_id, category, policy_id,
        requester_id, target_entity_type, target_entity_id, target_reference,
        requested_value, original_value, reason, notes, status,
        snapshot_data, stale_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `;
    const [res] = await db.query(query, [
      data.requestNumber,
      data.organizationId,
      data.branchId || null,
      data.category,
      data.policyId || null,
      data.requesterId,
      data.targetEntityType,
      data.targetEntityId,
      data.targetReference || null,
      data.requestedValue !== undefined ? data.requestedValue : null,
      data.originalValue !== undefined ? data.originalValue : null,
      data.reason,
      data.notes || null,
      data.snapshotData ? (typeof data.snapshotData === 'string' ? data.snapshotData : JSON.stringify(data.snapshotData)) : null,
      data.staleFingerprint || null,
    ]);
    return res.insertId;
  }

  /**
   * Retrieve request by ID with joined requester, approver, and branch details
   */
  async getRequestById(id, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      SELECT
        ar.*,
        u_req.name AS requester_name,
        u_req.email AS requester_email,
        u_app.name AS approver_name,
        u_app.email AS approver_email,
        b.name AS branch_name,
        b.code AS branch_code,
        o.name AS organization_name,
        ap.name AS policy_name,
        ap.required_permission,
        ap.require_separation_of_duties,
        ap.auto_execute_on_approval
      FROM approval_requests ar
      JOIN users u_req ON u_req.id = ar.requester_id
      LEFT JOIN users u_app ON u_app.id = ar.approver_id
      LEFT JOIN branches b ON b.id = ar.branch_id
      JOIN organizations o ON o.id = ar.organization_id
      LEFT JOIN approval_policies ap ON ap.id = ar.policy_id
      WHERE ar.id = ?
    `;
    const [rows] = await db.query(query, [id]);
    return rows[0] || null;
  }

  /**
   * Retrieve request row locked for update
   */
  async getRequestForUpdate(id, connection) {
    if (!connection) throw new Error('getRequestForUpdate requires a transaction connection');
    const [rows] = await connection.query(
      'SELECT * FROM approval_requests WHERE id = ? FOR UPDATE',
      [id],
    );
    return rows[0] || null;
  }

  /**
   * List approval requests with filtering, scope protection, and pagination
   */
  async listRequests({
    organizationId,
    branchIds = null,
    category,
    status,
    requesterId,
    targetEntityType,
    targetEntityId,
    search,
    page = 1,
    limit = 20,
  } = {}) {
    const db = await this.getPool();
    const conditions = ['ar.organization_id = ?'];
    const params = [organizationId];

    if (Array.isArray(branchIds)) {
      if (branchIds.length === 0) {
        conditions.push('(ar.branch_id IS NULL)');
      } else {
        const placeholders = branchIds.map(() => '?').join(', ');
        conditions.push(`(ar.branch_id IN (${placeholders}) OR ar.branch_id IS NULL)`);
        params.push(...branchIds);
      }
    }

    if (category) {
      conditions.push('ar.category = ?');
      params.push(category);
    }

    if (status) {
      conditions.push('ar.status = ?');
      params.push(status);
    }

    if (requesterId) {
      conditions.push('ar.requester_id = ?');
      params.push(requesterId);
    }

    if (targetEntityType) {
      conditions.push('ar.target_entity_type = ?');
      params.push(targetEntityType);
    }

    if (targetEntityId) {
      conditions.push('ar.target_entity_id = ?');
      params.push(targetEntityId);
    }

    if (search) {
      conditions.push('(ar.request_number LIKE ? OR ar.target_reference LIKE ? OR ar.reason LIKE ? OR u_req.name LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(DISTINCT ar.id) as total
      FROM approval_requests ar
      JOIN users u_req ON u_req.id = ar.requester_id
      ${whereClause}
    `;
    const [countRows] = await db.query(countQuery, params);
    const total = countRows[0]?.total || 0;

    const offset = Math.max(0, (page - 1) * limit);
    const listQuery = `
      SELECT
        ar.*,
        u_req.name AS requester_name,
        u_req.email AS requester_email,
        u_app.name AS approver_name,
        b.name AS branch_name,
        ap.name AS policy_name
      FROM approval_requests ar
      JOIN users u_req ON u_req.id = ar.requester_id
      LEFT JOIN users u_app ON u_app.id = ar.approver_id
      LEFT JOIN branches b ON b.id = ar.branch_id
      LEFT JOIN approval_policies ap ON ap.id = ar.policy_id
      ${whereClause}
      ORDER BY ar.id DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(listQuery, [...params, Number(limit), Number(offset)]);

    return {
      items: rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Update request status and decision metadata
   */
  async updateStatus(id, {
    status,
    approverId = null,
    decisionReason = null,
    decisionAt = null,
    executedAt = null,
    executionError = null,
  }, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      UPDATE approval_requests
      SET
        status = ?,
        approver_id = COALESCE(?, approver_id),
        decision_reason = COALESCE(?, decision_reason),
        decision_at = COALESCE(?, decision_at),
        executed_at = COALESCE(?, executed_at),
        execution_error = ?
      WHERE id = ?
    `;
    await db.query(query, [
      status,
      approverId,
      decisionReason,
      decisionAt,
      executedAt,
      executionError || null,
      id,
    ]);
  }

  /**
   * Record immutable event in approval history log
   */
  async recordHistory({
    approvalRequestId,
    action,
    actorId,
    notes = null,
    payload = null,
  }, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      INSERT INTO approval_history (
        approval_request_id, action, actor_id, notes, payload
      ) VALUES (?, ?, ?, ?, ?)
    `;
    await db.query(query, [
      approvalRequestId,
      action,
      actorId,
      notes,
      payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null,
    ]);
  }

  /**
   * Retrieve immutable event history for a request
   */
  async getHistoryByRequestId(approvalRequestId, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      SELECT
        ah.*,
        u.name AS actor_name,
        u.email AS actor_email
      FROM approval_history ah
      JOIN users u ON u.id = ah.actor_id
      WHERE ah.approval_request_id = ?
      ORDER BY ah.id ASC
    `;
    const [rows] = await db.query(query, [approvalRequestId]);
    return rows;
  }

  /**
   * Find active policy by organization and category
   */
  async findPolicyByCategory(organizationId, category, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      SELECT *
      FROM approval_policies
      WHERE organization_id = ? AND category = ? AND is_active = 1
      LIMIT 1
    `;
    const [rows] = await db.query(query, [organizationId, category]);
    return rows[0] || null;
  }

  /**
   * List all policies for an organization
   */
  async listPolicies(organizationId, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      SELECT *
      FROM approval_policies
      WHERE organization_id = ?
      ORDER BY category ASC
    `;
    const [rows] = await db.query(query, [organizationId]);
    return rows;
  }

  /**
   * Upsert approval policy
   */
  async upsertPolicy({
    organizationId,
    category,
    name,
    description = null,
    thresholdValue = null,
    requiredPermission,
    requireSeparationOfDuties = 1,
    autoExecuteOnApproval = 0,
    isActive = 1,
  }, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      INSERT INTO approval_policies (
        organization_id, category, name, description, threshold_value,
        required_permission, require_separation_of_duties, auto_execute_on_approval, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        threshold_value = VALUES(threshold_value),
        required_permission = VALUES(required_permission),
        require_separation_of_duties = VALUES(require_separation_of_duties),
        auto_execute_on_approval = VALUES(auto_execute_on_approval),
        is_active = VALUES(is_active)
    `;
    const [res] = await db.query(query, [
      organizationId,
      category,
      name,
      description,
      thresholdValue,
      requiredPermission,
      requireSeparationOfDuties ? 1 : 0,
      autoExecuteOnApproval ? 1 : 0,
      isActive ? 1 : 0,
    ]);
    return res.insertId || res.affectedRows;
  }

  /**
   * Find approved, unconsumed/valid request for a target entity
   */
  async findApprovedRequestForTarget(organizationId, category, targetEntityType, targetEntityId, connection = null) {
    const db = connection || await this.getPool();
    const query = `
      SELECT *
      FROM approval_requests
      WHERE organization_id = ?
        AND category = ?
        AND target_entity_type = ?
        AND target_entity_id = ?
        AND status IN ('approved', 'executed')
      ORDER BY id DESC
      LIMIT 1
    `;
    const [rows] = await db.query(query, [organizationId, category, targetEntityType, targetEntityId]);
    return rows[0] || null;
  }
}

export default new ApprovalRepository();
